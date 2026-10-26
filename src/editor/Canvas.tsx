import { capture } from "./pointer.ts";
import { Component, lazy, Suspense, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { batch, blocksMove, blockUpdate, BREAKPOINTS, findBlock, findSection, newSection, sectionInsert, sectionMove, step, type Block, type Project, type Step } from "../model/index.ts";
import { RenderProvider, type RenderHost } from "../render/context.tsx";
import { PageView } from "../render/Page.tsx";
import { mediaUrl } from "../lib/media.ts";
import { run, select, setCamera, setFocalEdit, setHover, setMeasuring, setPendingLayout, setTextEdit, setViewport, toast, useEditor } from "./store.ts";
// The text editor (TipTap) loads on first use, and is fetched quietly once the canvas is up.
const loadInlineText = () => import("./InlineText.tsx");
const InlineText = lazy(() => loadInlineText().then((m) => ({ default: m.InlineText })));

/** If the text editor fails (or can't load), editing ends and the page carries on rather than going blank. */
class TextBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(error);
    setTextEdit(null);
    toast("Couldn't open the text for editing. Use the inspector on the right instead.", "error");
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
import { TEXTUAL } from "./actions.ts";
import { openMenuFor } from "./ContextMenu.tsx";
import { registerFrame, zoomAt, zoomToFit } from "./camera.ts";
import { addFiles, placeMedia, type DropTarget } from "./actions.ts";
import { MEDIA_MIME } from "./MediaPanel.tsx";
import { nodeLabel, Overlay, type DropHint, type ItemDrag, type MoveGhost } from "./Overlay.tsx";
import { freeGroup, startFrameMove, withFrames } from "./canvasOps.ts";
import { LayoutPopover } from "./LayoutPicker.tsx";
import { insertGallery, itemSel, splitSel, swapItems } from "./gallery.ts";

export interface PointerRef {
  x: number;
  y: number;
  inside: boolean;
}

/**
 * The node a pointer event lands on. Locked blocks hand the click to their
 * section. Inside a gallery that's already selected (or when drilling in with
 * a double-click), the image under the pointer is the target.
 */
function nodeAt(target: EventTarget | null, d: Project, selection: string[] = [], drill = false): string | null {
  const itemEl = (target as Element | null)?.closest?.("[data-item-index]") ?? null;
  if (itemEl) {
    const blockEl = itemEl.closest("[data-node-id]");
    const blockId = blockEl?.getAttribute("data-node-id");
    const hit = blockId ? findBlock(d, blockId) : null;
    if (hit && !hit.block.locked && (drill || selection.some((s) => s.split("#")[0] === blockId)))
      return itemSel(blockId!, Number(itemEl.getAttribute("data-item-index")));
  }
  let el = (target as Element | null)?.closest?.("[data-node-id]") ?? null;
  while (el) {
    const id = el.getAttribute("data-node-id")!;
    const kind = el.getAttribute("data-node-kind");
    if (kind === "story") return null;
    if (kind === "chrome") return id;
    const b = kind === "block" ? findBlock(d, id) : null;
    const s = kind === "section" ? findSection(d, id) : null;
    if ((b && !b.block.locked) || (s && !s.section.locked)) return id;
    el = el.parentElement?.closest("[data-node-id]") ?? null;
  }
  return null;
}

/** Blocks that take a dropped file themselves (a drop on anything else inserts next to it). */
const MEDIA_TYPES = new Set(["image", "video", "gallery", "compare", "audio", "layers", "turntable", "model", "lottie", "prompt", "tracklist"]);

/** Where dropped files would go, and the line or box that previews it (viewport coordinates). */
function dropAt(clientX: number, clientY: number, frame: HTMLElement, viewport: DOMRect, d: Project, moving = false): { target: DropTarget; hint: DropHint } {
  const local = (r: DOMRect) => ({ x: r.left - viewport.left, y: r.top - viewport.top, w: r.width, h: r.height });
  const el = document.elementFromPoint(clientX, clientY);
  const cellEl = moving ? null : (el?.closest?.("[data-item-index]") as HTMLElement | null);
  if (cellEl && frame.contains(cellEl)) {
    const gid = (cellEl.closest("[data-node-id]") as HTMLElement | null)?.dataset.nodeId;
    const hit = gid ? findBlock(d, gid) : null;
    if (hit && hit.block.type === "gallery" && !hit.block.locked) {
      const index = Number(cellEl.dataset.itemIndex);
      const r = cellEl.getBoundingClientRect();
      const empty = cellEl.hasAttribute("data-empty");
      return { target: { blockId: gid, itemIndex: index }, hint: { kind: "box", ...local(r), label: empty ? "Fill this cell" : "Replace" } };
    }
  }
  const blockEl = moving ? null : (el?.closest?.('[data-node-kind="block"]') as HTMLElement | null);
  if (blockEl && frame.contains(blockEl)) {
    const id = blockEl.dataset.nodeId!;
    const hit = findBlock(d, id);
    if (hit && MEDIA_TYPES.has(hit.block.type) && !hit.block.locked) {
      const r = blockEl.getBoundingClientRect();
      const side = hit.block.type === "compare" ? (clientX < r.left + r.width / 2 ? "before" : "after") : undefined;
      return { target: { blockId: id, side }, hint: { kind: "box", ...local(r), label: side ? `Set ${side}` : "Add here" } };
    }
  }

  const sections = [...frame.querySelectorAll<HTMLElement>('[data-node-kind="section"]')];
  if (!sections.length) {
    const story = frame.querySelector<HTMLElement>('[data-node-kind="story"]');
    const r = (story ?? frame).getBoundingClientRect();
    return { target: { insert: { newSectionAt: 0 } }, hint: { kind: "box", ...local(r), label: "Start the story" } };
  }

  const sectionEl = el?.closest?.('[data-node-kind="section"]') as HTMLElement | null;
  if (sectionEl && frame.contains(sectionEl)) {
    const s = findSection(d, sectionEl.dataset.nodeId!);
    if (s && !s.section.locked) {
      const kids = [...sectionEl.querySelectorAll<HTMLElement>(':scope > div > [data-node-kind="block"]')];
      const rects = kids.map((k) => k.getBoundingClientRect());
      const flow = s.section.layout.type === "flow";
      // Reading order: in a flow compare y; in rows/grids, the first block whose centre is past the pointer.
      let index = rects.findIndex((r) =>
        flow ? clientY < r.top + r.height / 2 : clientY < r.top || (clientY < r.bottom && clientX < r.left + r.width / 2),
      );
      if (index < 0) index = rects.length;
      const inner = (sectionEl.firstElementChild as HTMLElement).getBoundingClientRect();
      const y = index < rects.length ? rects[index].top - 6 : rects.length ? rects[rects.length - 1].bottom + 6 : inner.top + inner.height / 2;
      const line = flow || !rects.length
        ? { x: inner.left - viewport.left, y: y - viewport.top, w: inner.width, h: 0 }
        : (() => {
            const r = rects[Math.min(index, rects.length - 1)];
            const x = index < rects.length ? r.left - 6 : r.right + 6;
            return { x: x - viewport.left, y: r.top - viewport.top, w: 0, h: r.height };
          })();
      return { target: { insert: { sectionId: s.section.id, index } }, hint: { kind: "line", ...line } };
    }
  }

  // Between or around sections: a new section.
  const rects = sections.map((s) => s.getBoundingClientRect());
  let at = rects.findIndex((r) => clientY < r.top + r.height / 2);
  if (at < 0) at = rects.length;
  const y = at < rects.length ? rects[at].top : rects[rects.length - 1].bottom;
  const fr = frame.getBoundingClientRect();
  return {
    target: { insert: { newSectionAt: at } },
    hint: { kind: "line", x: fr.left - viewport.left, y: y - viewport.top, w: fr.width, h: 0, label: "New section" },
  };
}

/** Where a dragged section would land: the gap between sections nearest the pointer. */
function sectionGapAt(clientY: number, frame: HTMLElement, viewport: DOMRect): { at: number; hint: DropHint } {
  const rects = [...frame.querySelectorAll<HTMLElement>('[data-node-kind="section"]')].map((s) => s.getBoundingClientRect());
  let at = rects.findIndex((r) => clientY < r.top + r.height / 2);
  if (at < 0) at = rects.length;
  const y = at < rects.length ? rects[at].top : rects[rects.length - 1].bottom;
  const fr = frame.getBoundingClientRect();
  return { at, hint: { kind: "line", x: fr.left - viewport.left, y: y - viewport.top, w: fr.width, h: 0 } };
}

/**
 * Drop dragged blocks at a target: before the first block at that index that
 * isn't moving, or into a new section. One undo step.
 */
function moveBlocksTo(d: Project, ids: string[], target: DropTarget) {
  const insert = target.insert;
  if (!insert) return;
  if ("newSectionAt" in insert) {
    const section = newSection("flow", { name: `Section ${d.page.sections.length + 1}` });
    run(batch, {
      label: "Move to a new section",
      steps: [step(sectionInsert, { section, index: insert.newSectionAt }), step(blocksMove, { ids, sectionId: section.id, before: null })],
    });
    select(ids);
    return;
  }
  const hit = findSection(d, insert.sectionId);
  if (!hit) return;
  const list = hit.section.blocks;
  // Dropping a block back onto its own spot does nothing.
  const first = list.findIndex((b) => ids.includes(b.id));
  if (ids.length === 1 && first >= 0 && (insert.index === first || insert.index === first + 1)) return;
  const before = list.slice(insert.index).find((b) => !ids.includes(b.id))?.id ?? null;
  const steps: Step[] = [step(blocksMove, { ids, sectionId: hit.section.id, before })];
  // Arriving on a free canvas: give blocks without a frame a place to stand.
  if (hit.section.layout.type === "canvas") {
    const arriving = ids.map((id) => findBlock(d, id)?.block).filter((b): b is Block => !!b && !b.frame && !list.includes(b));
    for (const b of withFrames(hit.section, arriving)) steps.push(step(blockUpdate, { id: b.id, patch: { frame: b.frame } }));
  }
  run(batch, { label: ids.length > 1 ? `Move ${ids.length} blocks` : "Move block", steps });
}

export function Canvas() {
  const history = useEditor((s) => s.history);
  const bp = useEditor((s) => s.bp);
  const camera = useEditor((s) => s.camera);
  const tool = useEditor((s) => s.tool);
  const nextTitle = useEditor((s) => s.nextTitle);
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<PointerRef>({ x: 0, y: 0, inside: false });
  const [spaceDown, setSpaceDown] = useState(false);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [drop, setDrop] = useState<DropHint | null>(null);
  const [itemDrag, setItemDrag] = useState<ItemDrag | null>(null);
  const [ghost, setGhost] = useState<MoveGhost | null>(null);
  const pendingLayout = useEditor((s) => s.pendingLayout);
  const dropTarget = useRef<DropTarget | null>(null);
  const width = BREAKPOINTS[bp].preview;
  const project = history?.doc;

  const textEdit = useEditor((s) => s.textEdit);
  // Only an image inside a gallery matters to the page (a slideshow shows it); a string, so other clicks don't re-render.
  const activeItem = useEditor((s) => s.selection.find((x) => x.includes("#")) ?? null);
  const host = useMemo<RenderHost | null>(
    () =>
      project
        ? {
            mediaUrl,
            editing: true,
            project,
            nextTitle,
            activeItem,
            editText: textEdit ? { id: textEdit.id, part: textEdit.part, render: (block) => (
                    <TextBoundary>
                      <Suspense fallback={null}>
                        <InlineText block={block} edit={textEdit} />
                      </Suspense>
                    </TextBoundary>
                  ),
                } : undefined,
          }
        : null,
    [project, nextTitle, textEdit, activeItem],
  );

  useLayoutEffect(() => {
    registerFrame(frameRef.current);
    return () => registerFrame(null);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadInlineText(), 1500);
    return () => clearTimeout(t);
  }, []);

  // Viewport size for fit/zoom maths.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setViewport(e.contentRect.width, e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit when the project opens and whenever the breakpoint changes, measuring the viewport first.
  const opened = !!project;
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!opened || !el) return;
    setViewport(el.clientWidth, el.clientHeight);
    zoomToFit();
  }, [opened, bp]);

  // Wheel: scroll pans, Ctrl/⌘+wheel (and trackpad pinch) zooms at the pointer.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const { camera: c } = useEditor.getState();
      const strip = (e.target as Element).closest?.("[data-hscroll]") as HTMLElement | null;
      const sideways = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (strip && sideways && !(e.ctrlKey || e.metaKey) && strip.scrollWidth > strip.clientWidth) {
        strip.scrollLeft += (e.shiftKey ? e.deltaY : e.deltaX) / c.zoom;
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        zoomAt(c.zoom * Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        setCamera({ x: c.x - dx, y: c.y - dy });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Space held = temporary hand tool, like every design app.
  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e.target)) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
      if (e.key === "Alt") {
        // Stops Windows browsers focusing their menu bar on a lone Alt.
        e.preventDefault();
        setMeasuring(false);
      }
    };
    // Alt held: distances from the selection to whatever is under the pointer.
    const alt = (e: KeyboardEvent) => e.key === "Alt" && !typing(e.target) && (e.preventDefault(), setMeasuring(true));
    const blur = () => (setMeasuring(false), setSpaceDown(false));
    window.addEventListener("keydown", down);
    window.addEventListener("keydown", alt);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keydown", alt);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const panning = tool === "hand" || spaceDown;

  /** Drag blocks (or one section) to a new place in the story; a click without moving just selects. */
  const startReorder = useCallback((ids: string[], e: React.PointerEvent) => {
    const vp = viewportRef.current!;
    const frame = frameRef.current!;
    const d = useEditor.getState().history?.doc;
    if (!d) return;
    const isSection = ids.length === 1 && !!findSection(d, ids[0]);
    const blockIds = isSection ? [] : ids.filter((x) => findBlock(d, x) && !findBlock(d, x)!.block.locked);
    if (!isSection && !blockIds.length) return;
    // Story order, so a group lands in the order it reads.
    const order = d.page.sections.flatMap((s) => [s.id, ...s.blocks.map((b) => b.id)]);
    blockIds.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const start = { x: e.clientX, y: e.clientY };
    const label = isSection ? nodeLabel(d, ids[0]).split(" · ")[0] : blockIds.length > 1 ? `${blockIds.length} blocks` : nodeLabel(d, blockIds[0]);
    const els = (isSection ? ids : blockIds).map((x) => frame.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(x)}"]`)).filter((x): x is HTMLElement => !!x);
    let dragging = false;
    let target: DropTarget | null = null;
    let sectionAt: number | null = null;
    capture(vp, e.pointerId);
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
      if (!dragging) for (const el of els) el.setAttribute("data-dragging", "");
      dragging = true;
      const r = vp.getBoundingClientRect();
      setGhost({ label, x: ev.clientX - r.left, y: ev.clientY - r.top });
      if (isSection) {
        const g = sectionGapAt(ev.clientY, frame, r);
        sectionAt = g.at;
        setDrop(g.hint);
      } else {
        const hit = dropAt(ev.clientX, ev.clientY, frame, r, d, true);
        target = hit.target;
        setDrop({ ...hit.hint, label: undefined });
      }
    };
    const end = () => {
      vp.removeEventListener("pointermove", move);
      vp.removeEventListener("pointerup", end);
      vp.removeEventListener("pointercancel", end);
      for (const el of els) el.removeAttribute("data-dragging");
      setGhost(null);
      setDrop(null);
      if (!dragging) return;
      const now = useEditor.getState().history?.doc;
      if (!now) return;
      if (isSection && sectionAt !== null) {
        const from = now.page.sections.findIndex((s) => s.id === ids[0]);
        if (from >= 0 && sectionAt !== from && sectionAt !== from + 1) run(sectionMove, { id: ids[0], index: sectionAt > from ? sectionAt - 1 : sectionAt });
      } else if (target) moveBlocksTo(now, blockIds, target);
    };
    vp.addEventListener("pointermove", move);
    vp.addEventListener("pointerup", end);
    vp.addEventListener("pointercancel", end);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const vp = viewportRef.current!;
      const frame = frameRef.current!;
      if ((e.target as Element).closest("[data-overlay-ui]")) return;
      // Inside the words being edited, the browser places the caret; anywhere else finishes editing.
      if ((e.target as Element).closest("[data-text-editing]")) return;
      if (useEditor.getState().textEdit) setTextEdit(null);
      const r = vp.getBoundingClientRect();
      const start = { x: e.clientX, y: e.clientY };

      // Pan: hand tool, space, or the middle button.
      if (panning || e.button === 1) {
        e.preventDefault();
        const c0 = useEditor.getState().camera;
        capture(vp, e.pointerId);
        const move = (ev: PointerEvent) => setCamera({ x: c0.x + ev.clientX - start.x, y: c0.y + ev.clientY - start.y });
        const end = () => {
          vp.removeEventListener("pointermove", move);
          vp.removeEventListener("pointerup", end);
        };
        vp.addEventListener("pointermove", move);
        vp.addEventListener("pointerup", end);
        return;
      }
      if (e.button !== 0) return;

      const st = useEditor.getState();
      const d = st.history?.doc;
      if (!d) return;
      if (st.focalEdit) setFocalEdit(null);
      const onFrame = frame.contains(e.target as Node);
      const id = onFrame ? nodeAt(e.target, d, st.selection) : null;
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;

      if (id) {
        // Pressing on something already selected keeps the group, so it can be dragged together.
        const keepGroup = !additive && st.selection.length > 1 && st.selection.includes(id);
        if (!keepGroup) select([id], additive ? "toggle" : "replace");
        // An image inside a gallery can be dragged onto another slot.
        const { id: gid, item } = splitSel(id);
        if (item === null && !additive && !id.startsWith("chrome:")) {
          const ids = keepGroup ? st.selection.filter((x) => !x.includes("#") && !x.startsWith("chrome:")) : [id];
          if (freeGroup(d, ids, st.bp)) {
            startFrameMove(ids, e, vp);
            if (keepGroup) vp.addEventListener("pointerup", (ev) => Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4 && select([id]), { once: true });
            return;
          }
          startReorder(ids, e);
          return;
        }
        if (item !== null && !additive) {
          capture(vp, e.pointerId);
          let dragging = false;
          let over: number | null = null;
          const move = (ev: PointerEvent) => {
            if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
            dragging = true;
            const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-item-index]");
            const sameGallery = under?.closest("[data-node-id]")?.getAttribute("data-node-id") === gid;
            over = under && sameGallery ? Number(under.getAttribute("data-item-index")) : null;
            setItemDrag({ blockId: gid, from: item, over: over === item ? null : over, x: ev.clientX - r.left, y: ev.clientY - r.top });
          };
          const end = () => {
            vp.removeEventListener("pointermove", move);
            vp.removeEventListener("pointerup", end);
            if (dragging && over !== null && over !== item) swapItems(gid, item, over);
            setItemDrag(null);
          };
          vp.addEventListener("pointermove", move);
          vp.addEventListener("pointerup", end);
        }
        return;
      }

      // Empty canvas or story gap: marquee; a plain click clears.
      capture(vp, e.pointerId);
      const base = additive ? useEditor.getState().selection : [];
      let moved = false;
      const move = (ev: PointerEvent) => {
        const x = Math.min(start.x, ev.clientX) - r.left;
        const y = Math.min(start.y, ev.clientY) - r.top;
        const w = Math.abs(ev.clientX - start.x);
        const h = Math.abs(ev.clientY - start.y);
        if (!moved && w < 4 && h < 4) return;
        moved = true;
        setMarquee({ x, y, w, h });
        const hits: string[] = [];
        for (const el of frame.querySelectorAll<HTMLElement>('[data-node-kind="block"]')) {
          const b = el.getBoundingClientRect();
          const bx = b.left - r.left;
          const by = b.top - r.top;
          if (bx < x + w && bx + b.width > x && by < y + h && by + b.height > y) {
            const hit = findBlock(d, el.dataset.nodeId!);
            if (hit && !hit.block.locked) hits.push(hit.block.id);
          }
        }
        select([...new Set([...base, ...hits])]);
      };
      const end = () => {
        vp.removeEventListener("pointermove", move);
        vp.removeEventListener("pointerup", end);
        setMarquee(null);
        if (!moved && !additive) select([]);
      };
      vp.addEventListener("pointermove", move);
      vp.addEventListener("pointerup", end);
    },
    [panning, startReorder],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const vp = viewportRef.current!;
    const r = vp.getBoundingClientRect();
    pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top, inside: true };
    const d = useEditor.getState().history?.doc;
    if (!d || e.buttons) return;
    if ((e.target as Element).closest("[data-overlay-ui]")) return;
    setHover(frameRef.current?.contains(e.target as Node) ? nodeAt(e.target, d, useEditor.getState().selection) : null);
  }, []);

  /* ── File drops ───────────────────────────────────────────────────── */

  const onDragOver = useCallback((e: React.DragEvent) => {
    const types = [...e.dataTransfer.types];
    if (!types.includes("Files") && !types.includes(MEDIA_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const d = useEditor.getState().history?.doc;
    if (!d || !frameRef.current || !viewportRef.current) return;
    const { target, hint } = dropAt(e.clientX, e.clientY, frameRef.current, viewportRef.current.getBoundingClientRect(), d);
    dropTarget.current = target;
    setDrop(hint);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    const fromPanel = e.dataTransfer.getData(MEDIA_MIME);
    if (fromPanel) {
      e.preventDefault();
      const target = { ...(dropTarget.current ?? {}), point: { x: e.clientX, y: e.clientY } };
      setDrop(null);
      dropTarget.current = null;
      try {
        placeMedia(JSON.parse(fromPanel), target);
      } catch {
        /* not ours */
      }
      return;
    }
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    const target = { ...(dropTarget.current ?? {}), point: { x: e.clientX, y: e.clientY } };
    setDrop(null);
    dropTarget.current = null;
    void addFiles(files, target);
  }, []);

  // Links inside the page must not navigate away from the editor.
  const swallowClicks = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest("a")) e.preventDefault();
  }, []);

  if (!host) return <div className="cv-viewport" ref={viewportRef} />;

  return (
    <div
      className="cv-viewport"
      ref={viewportRef}
      data-panning={panning || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        pointer.current.inside = false;
        setHover(null);
      }}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!viewportRef.current?.contains(e.relatedTarget as Node)) setDrop(null);
      }}
      onDrop={onDrop}
      onClickCapture={swallowClicks}
      onContextMenu={(e) => {
        const under = document.elementFromPoint(e.clientX, e.clientY);
        // Words being edited keep the browser's own menu (spelling suggestions).
        if (under?.closest("[data-text-editing]")) return;
        if (under?.closest("[data-overlay-ui]")) return e.preventDefault();
        const d = useEditor.getState().history?.doc;
        const id = d && under && frameRef.current?.contains(under) ? nodeAt(under, d, useEditor.getState().selection) : null;
        openMenuFor(id, e, "canvas");
      }}
      onDoubleClick={(e) => {
        const d = useEditor.getState().history?.doc;
        // Pointer capture (for dragging) retargets the event to the viewport; ask what's really under the pointer.
        const under = document.elementFromPoint(e.clientX, e.clientY);
        if (!under || under.closest("[data-text-editing]")) return;
        const id = d && frameRef.current?.contains(under) ? nodeAt(under, d, [], true) : null;
        if (id?.includes("#")) {
          e.stopPropagation();
          select([id]);
          return;
        }
        // Double-click words to edit them right there.
        const hit = id && d ? findBlock(d, id) : null;
        if (hit && TEXTUAL.has(hit.block.type)) {
          const cite = !!under.closest("figcaption");
          setTextEdit({ id: hit.block.id, part: cite ? "cite" : "text", at: { x: e.clientX, y: e.clientY } });
        }
      }}
      role="application"
      aria-label="Page canvas"
    >
      <div
        className="cv-world"
        style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
      >
        <div className="cv-frame-label" style={{ fontSize: `${12 / camera.zoom}px`, top: `${-24 / camera.zoom}px` }}>
          {BREAKPOINTS[bp].label} <span>{width}</span>
        </div>
        <div className="cv-frame" ref={frameRef} style={{ width }}>
          <RenderProvider value={host}>
            <PageView />
          </RenderProvider>
        </div>
      </div>
      <Overlay viewportRef={viewportRef} frameRef={frameRef} pointer={pointer} drop={drop} itemDrag={itemDrag} ghost={ghost} />
      {marquee && <div className="cv-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
      {pendingLayout && (
        <LayoutPopover
          key={pendingLayout.media.map((m) => m.src).join()}
          x={pendingLayout.x}
          y={pendingLayout.y}
          count={pendingLayout.media.length}
          title={`Lay out ${pendingLayout.media.length} images`}
          onPick={(p) => {
            setPendingLayout(null);
            insertGallery(p, pendingLayout.target, pendingLayout.media);
          }}
          onCancel={() => {
            setPendingLayout(null);
            insertGallery({ mode: "justified" }, pendingLayout.target, pendingLayout.media);
          }}
          onClose={() => {
            setPendingLayout(null);
            insertGallery({ mode: "justified" }, pendingLayout.target, pendingLayout.media);
          }}
        />
      )}
    </div>
  );
}
