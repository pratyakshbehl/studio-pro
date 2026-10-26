import { capture } from "./pointer.ts";
import { useEffect, useRef, useState, type RefObject } from "react";
import { BLOCK_LABELS, findBlock, findSection, type GalleryBlock, type Project } from "../model/index.ts";
import { useEditor } from "./store.ts";
import type { InsertTarget } from "./actions.ts";
import type { PointerRef } from "./Canvas.tsx";
import { InsertBar } from "./InsertBar.tsx";
import { FloatingToolbar } from "./FloatingToolbar.tsx";
import { BentoHandles } from "./BentoHandles.tsx";
import { setFocal, splitSel } from "./gallery.ts";
import { Rulers } from "./Rulers.tsx";
import { distances, MeasureLines } from "./Measure.tsx";
import { Transform } from "./Transform.tsx";
import { canvasGeo, frameOf, isFree } from "./canvasOps.ts";

export interface DropHint {
  kind: "line" | "box";
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

/** A block or section being dragged to a new place in the story. */
export interface MoveGhost {
  label: string;
  x: number;
  y: number;
}

/** An image being dragged to another slot in its gallery. */
export interface ItemDrag {
  blockId: string;
  from: number;
  over: number | null;
  x: number;
  y: number;
}

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Gap {
  x: number;
  y: number;
  w: number;
  target: InsertTarget;
}

const CHROME_LABEL: Record<string, string> = {
  "chrome:header": "Title",
  "chrome:cover": "Cover",
  "chrome:intro": "Intro",
  "chrome:next": "Next project",
};
const LAYOUT_LABEL = { flow: "Flow", stack: "Stack", grid: "Grid", canvas: "Free canvas" } as const;

export function nodeLabel(d: Project, id: string): string {
  if (CHROME_LABEL[id]) return CHROME_LABEL[id];
  const { id: base, item } = splitSel(id);
  if (item !== null) {
    const g = findBlock(d, base)?.block as GalleryBlock | undefined;
    return `Image ${item + 1}${g ? ` of ${g.mode === "bento" && g.bento ? g.bento.cells.length : g.items.filter(Boolean).length}` : ""}`;
  }
  const s = findSection(d, id);
  if (s) return `${s.section.name} · ${LAYOUT_LABEL[s.section.layout.type]}`;
  const b = findBlock(d, id);
  return b ? (b.block.name ?? BLOCK_LABELS[b.block.type]) : "";
}

/** The element on the canvas for a selection id, including an image inside a gallery. */
export function nodeElement(frame: HTMLElement, id: string): Element | null {
  const { id: base, item } = splitSel(id);
  const el = frame.querySelector(`[data-node-id="${CSS.escape(base)}"]`);
  return item === null ? el : (el?.querySelector(`[data-item-index="${item}"]`) ?? null);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Draws on top of the zoomed page in screen pixels, so outlines stay 1px and
 * controls stay full size at any zoom. Positions are re-measured from the real
 * DOM every frame, so loading images, reflowing text and breakpoint switches
 * never leave anything stale.
 */
export function Overlay({
  viewportRef,
  frameRef,
  pointer,
  drop,
  itemDrag,
  ghost,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  pointer: RefObject<PointerRef>;
  drop: DropHint | null;
  itemDrag: ItemDrag | null;
  ghost: MoveGhost | null;
}) {
  const [state, setState] = useState<{ hover: Box | null; sel: Box[]; gap: Gap | null; bento: Box | null; dragOver: Box | null; parent: Box | null; frameH: number }>({
    hover: null,
    sel: [],
    gap: null,
    bento: null,
    dragOver: null,
    parent: null,
    frameH: 0,
  });
  const doc = useEditor((s) => s.history?.doc);
  const selection = useEditor((s) => s.selection);
  const zoom = useEditor((s) => s.camera.zoom);
  const tool = useEditor((s) => s.tool);
  const barPin = useEditor((s) => s.barPin);
  const focalEdit = useEditor((s) => s.focalEdit);
  const viewport = useEditor((s) => s.viewport);
  const bp = useEditor((s) => s.bp);
  const measuring = useEditor((s) => s.measuring);
  const snapLines = useEditor((s) => s.snapLines);
  const textEdit = useEditor((s) => s.textEdit);
  const last = useRef(state);
  const itemDragRef = useRef(itemDrag);
  itemDragRef.current = itemDrag;
  const barRef = useRef<Gap | null>(null);

  useEffect(() => {
    let stop = false;
    const measureAll = () => {
      const vp = viewportRef.current;
      const frame = frameRef.current;
      const st = useEditor.getState();
      const d = st.history?.doc;
      if (!vp || !frame || !d) return;
      const o = vp.getBoundingClientRect();
      const box = (id: string, el: Element | null): Box | null => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return null;
        return { id, x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
      };
      const measure = (id: string) => box(id, nodeElement(frame, id));

      const sel = st.selection.map(measure).filter((b): b is Box => !!b);
      const hover = st.hover && !st.selection.includes(st.hover) ? measure(st.hover) : null;

      // A selected bento (or an image in one) gets resize handles over its grid.
      let bento: Box | null = null;
      const primary = st.selection.length === 1 ? splitSel(st.selection[0]).id : null;
      const pb = primary ? findBlock(d, primary)?.block : null;
      if (pb?.type === "gallery" && pb.mode === "bento") {
        bento = box(pb.id, frame.querySelector(`[data-node-id="${CSS.escape(pb.id)}"] .sp-bento`));
      }

      const drag = itemDragRef.current;
      const dragOver = drag && drag.over !== null ? measure(`${drag.blockId}#${drag.over}`) : null;

      // Insert bar: at the gap nearest the pointer.
      let gap: Gap | null = null;
      const p = pointer.current;
      const barEl = vp.querySelector(".insert-bar");
      const overBar = !!barEl && p?.inside && (() => {
        const r = barEl.getBoundingClientRect();
        return p.x >= r.left - o.left - 8 && p.x <= r.right - o.left + 8 && p.y >= r.top - o.top - 10 && p.y <= r.bottom - o.top + 10;
      })();
      if (st.barPin) gap = { ...st.barPin, w: 0 };
      else if (overBar && barRef.current) gap = barRef.current;
      else if (p?.inside && st.tool === "select" && !drag) {
        const sections = [...frame.querySelectorAll<HTMLElement>('[data-node-kind="section"]')];
        const rects = sections.map((el) => {
          const r = el.getBoundingClientRect();
          return { el, top: r.top - o.top, bottom: r.bottom - o.top, left: r.left - o.left, right: r.right - o.left };
        });
        const inside = rects.find((r) => p.y >= r.top && p.y <= r.bottom && p.x >= r.left && p.x <= r.right);
        if (inside) {
          const s = findSection(d, inside.el.dataset.nodeId!);
          const innerEl = inside.el.firstElementChild as HTMLElement;
          const inner = innerEl.getBoundingClientRect();
          const cx = inner.left - o.left + inner.width / 2;
          const iw = inner.width;
          if (s && !s.section.locked) {
            const kids = [...innerEl.querySelectorAll<HTMLElement>(':scope > [data-node-kind="block"]')].map((k) => k.getBoundingClientRect());
            if (s.section.layout.type === "flow" && kids.length) {
              const gaps = kids.map((r, i) => ({ y: i === 0 ? r.top - o.top - 10 : (kids[i - 1].bottom + r.top) / 2 - o.top, index: i }));
              gaps.push({ y: kids[kids.length - 1].bottom - o.top + 10, index: kids.length });
              const near = gaps.reduce((a, b) => (Math.abs(b.y - p.y) < Math.abs(a.y - p.y) ? b : a));
              if (Math.abs(near.y - p.y) < 22) gap = { x: cx, y: near.y, w: iw, target: { sectionId: s.section.id, index: near.index } };
            } else if (!kids.length) {
              gap = { x: cx, y: inside.top + (inside.bottom - inside.top) / 2, w: iw, target: { sectionId: s.section.id, index: 0 } };
            } else if (p.y > inside.bottom - 30) {
              gap = { x: cx, y: inside.bottom - 4, w: iw, target: { sectionId: s.section.id, index: s.section.blocks.length } };
            }
          }
        } else if (rects.length) {
          const fr = frame.getBoundingClientRect();
          const cx = fr.left - o.left + fr.width / 2;
          const edges = [{ y: rects[0].top - 18, at: 0 }];
          for (let i = 1; i < rects.length; i++) edges.push({ y: (rects[i - 1].bottom + rects[i].top) / 2, at: i });
          edges.push({ y: rects[rects.length - 1].bottom + 18, at: rects.length });
          const near = edges.reduce((a, b) => (Math.abs(b.y - p.y) < Math.abs(a.y - p.y) ? b : a));
          if (Math.abs(near.y - p.y) < 28 && p.x > fr.left - o.left && p.x < fr.right - o.left)
            gap = { x: cx, y: near.y, w: fr.width * 0.9, target: { newSectionAt: near.at } };
        } else {
          const story = frame.querySelector<HTMLElement>('[data-node-kind="story"]');
          if (story) {
            const r = story.getBoundingClientRect();
            if (p.y > r.top - o.top && p.y < r.bottom - o.top)
              gap = { x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2 + 48, w: 0, target: { newSectionAt: 0 } };
          }
        }
      }
      barRef.current = gap;

      // Alt: what the selection measures against when the pointer isn't over anything else.
      let parent: Box | null = null;
      if (st.measuring && st.selection.length === 1) {
        const base = splitSel(st.selection[0]);
        if (base.item !== null) parent = measure(base.id);
        else if (findBlock(d, base.id)) parent = measure(findBlock(d, base.id)!.section.id);
        else parent = box("frame", frame);
      }

      const next = { hover, sel, gap, bento, dragOver, parent, frameH: frame.offsetHeight };
      if (!same(next, last.current)) {
        last.current = next;
        setState(next);
      }
    };
    const loop = () => {
      if (stop) return;
      measureAll();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    // rAF pauses in background tabs; keep measuring slowly there.
    const fallback = setInterval(() => document.hidden && measureAll(), 250);
    return () => {
      stop = true;
      clearInterval(fallback);
    };
  }, [viewportRef, frameRef, pointer]);

  const primary = state.sel[state.sel.length - 1];
  const primaryBlock = doc && selection.length === 1 ? findBlock(doc, splitSel(selection[0]).id)?.block : null;
  // A lone block on a free canvas gets the transform box instead of a plain outline.
  const freeHit = doc && selection.length === 1 && !selection[0].includes("#") ? findBlock(doc, selection[0]) : null;
  const free = freeHit && !freeHit.block.locked && isFree(freeHit.section, bp) ? freeHit : null;
  const span = state.sel.length
    ? state.sel.reduce((u, b) => {
        const x = Math.min(u.x, b.x);
        const y = Math.min(u.y, b.y);
        return { id: u.id, x, y, w: Math.max(u.x + u.w, b.x + b.w) - x, h: Math.max(u.y + u.h, b.y + b.h) - y };
      })
    : null;
  // A rotated block reports its own size, not the box around it.
  const sizeLabel = (() => {
    const geo = free ? canvasGeo(free.section.id) : null;
    if (free && geo) {
      const f = frameOf(free.block, bp, free.index);
      return `${Math.round((f.w / 100) * geo.W)} × ${Math.round((f.h / 100) * geo.H)}`;
    }
    return primary ? `${Math.round(primary.w / zoom)} × ${Math.round(primary.h / zoom)}` : "";
  })();
  const measureTo = measuring && primary && selection.length === 1 ? (state.hover ?? state.parent) : null;
  const focalBox = focalEdit ? state.sel.find((b) => b.id === focalEdit) : null;
  const focalMedia = (() => {
    if (!focalEdit || !doc) return null;
    const { id, item } = splitSel(focalEdit);
    const g = findBlock(doc, id)?.block;
    return g?.type === "gallery" && item !== null ? g.items[item] : null;
  })();

  return (
    <div className="ov" aria-hidden={false}>
      <Rulers selection={span} frameHeight={state.frameH} />
      {state.hover && tool === "select" && (
        <div className="ov-hover" style={{ left: state.hover.x, top: state.hover.y, width: state.hover.w, height: state.hover.h }} />
      )}
      {state.sel.map((b) => (free && b.id === free.block.id ? null : (
        <div
          key={b.id}
          className="ov-sel"
          data-section={doc && findSection(doc, b.id) ? "" : undefined}
          data-item={b.id.includes("#") || undefined}
          style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
        />
      )))}
      {free && !itemDrag && !drop && <Transform block={free.block} section={free.section} />}
      {snapLines?.map((l, i) => (
        <div
          key={i}
          className="snap-line"
          style={l.axis === "x" ? { left: l.at, top: l.from, height: l.to - l.from } : { top: l.at, left: l.from, width: l.to - l.from }}
          data-axis={l.axis}
        />
      ))}
      {measureTo && primary && <MeasureLines items={distances(primary, measureTo, zoom)} target={measureTo} />}
      {primary && doc && selection.length > 0 && (
        <div className="ov-label" style={{ left: primary.x, top: Math.max(4, primary.y - 22) }}>
          {selection.length > 1 ? `${selection.length} selected` : nodeLabel(doc, primary.id)}
          <span className="ov-size">{sizeLabel}</span>
        </div>
      )}

      {state.bento && primaryBlock?.type === "gallery" && !itemDrag && !focalEdit && <BentoHandles block={primaryBlock} rect={state.bento} />}

      {itemDrag && (
        <>
          {state.dragOver && (
            <div className="ov-drop-box" style={{ left: state.dragOver.x, top: state.dragOver.y, width: state.dragOver.w, height: state.dragOver.h }}>
              <span>{primaryBlock?.type === "gallery" && primaryBlock.mode === "bento" ? "Swap" : "Move here"}</span>
            </div>
          )}
          <div className="ov-ghost" style={{ left: itemDrag.x, top: itemDrag.y }}>
            Image {itemDrag.from + 1}
          </div>
        </>
      )}

      {focalBox && focalEdit && (
        <div
          className="ov-focal"
          data-overlay-ui
          style={{ left: focalBox.x, top: focalBox.y, width: focalBox.w, height: focalBox.h }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const el = e.currentTarget;
            capture(el, e.pointerId);
            const { id, item } = splitSel(focalEdit);
            const set = (ev: { clientX: number; clientY: number }) => {
              const r = el.getBoundingClientRect();
              setFocal(id, item!, {
                x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
                y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)),
              });
            };
            set(e);
            const move = (ev: PointerEvent) => set(ev);
            const up = () => {
              el.removeEventListener("pointermove", move);
              el.removeEventListener("pointerup", up);
            };
            el.addEventListener("pointermove", move);
            el.addEventListener("pointerup", up);
          }}
        >
          <span
            className="ov-focal-dot"
            style={{ left: `${(focalMedia?.focal?.x ?? 0.5) * 100}%`, top: `${(focalMedia?.focal?.y ?? 0.5) * 100}%` }}
          />
          <span className="ov-focal-hint">Drag to set what stays in frame · Esc to finish</span>
        </div>
      )}

      {state.gap && !drop && !itemDrag && !textEdit && tool === "select" && (
        <>
          {state.gap.w > 0 && !barPin && <div className="ov-gap-line" style={{ left: state.gap.x - state.gap.w / 2, top: state.gap.y, width: state.gap.w }} />}
          <InsertBar
            key={JSON.stringify(state.gap.target)}
            x={state.gap.x}
            // Step aside from a selected bento's bottom resize handle.
            y={state.bento && Math.abs(state.gap.y - (state.bento.y + state.bento.h)) < 30 ? state.bento.y + state.bento.h + 34 : state.gap.y}
            target={state.gap.target}
          />
        </>
      )}

      {primary && selection.length > 0 && !itemDrag && !drop && !ghost && !snapLines && !measuring && !textEdit && (
        <FloatingToolbar box={primary} viewport={viewport} />
      )}
      {ghost && (
        <div className="ov-ghost" style={{ left: ghost.x, top: ghost.y }}>
          {ghost.label}
        </div>
      )}

      {drop &&
        (drop.kind === "box" ? (
          <div className="ov-drop-box" style={{ left: drop.x, top: drop.y, width: drop.w, height: drop.h }}>
            {drop.label && <span>{drop.label}</span>}
          </div>
        ) : (
          <div className="ov-drop-line" data-vertical={drop.h > 0 || undefined} style={{ left: drop.x, top: drop.y, width: drop.w || 3, height: drop.h || 3 }}>
            {drop.label && <span>{drop.label}</span>}
          </div>
        ))}
    </div>
  );
}
