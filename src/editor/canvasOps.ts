/**
 * Free-canvas editing: moving, nudging, stacking order, and turning a section
 * into a free canvas without anything jumping. Geometry lives in frames.ts;
 * this file reads the page and turns intents into commands.
 */
import {
  batch,
  blockOverride,
  blockUpdate,
  findBlock,
  findSection,
  resolveNode,
  sectionUpdate,
  step,
  type Block,
  type Breakpoint,
  type Frame,
  type History,
  type Project,
  type Section,
  type Step,
} from "../model/index.ts";
import { doc, endPreview, preview, run, setSnapLines, useEditor, type ScreenLine } from "./store.ts";
import { frameElement } from "./camera.ts";
import { cascadeFrame, layoutColumns, snapMove, snapTargets, toFrame, toPx, type PxBox, type SnapLine, type SnapTargets } from "./frames.ts";
import { capture } from "./pointer.ts";

const state = () => useEditor.getState();

/** True when blocks in this section are placed by frame at this screen size (phones stack unless laid out for phones). */
export function isFree(section: Section, bp: Breakpoint): boolean {
  if (resolveNode(section, bp).layout.type !== "canvas") return false;
  if (bp !== "phone") return true;
  return section.blocks.some((b) => b.overrides?.phone && "frame" in b.overrides.phone);
}

export function frameOf(block: Block, bp: Breakpoint, index = 0): Frame {
  return resolveNode(block, bp).frame ?? cascadeFrame(index, index);
}

/** A frame change as a command step, written for the current screen size. */
export function frameStep(id: string, frame: Frame, bp = state().bp): Step {
  return bp === "desktop" ? step(blockUpdate, { id, patch: { frame } }) : step(blockOverride, { id, bp, patch: { frame } });
}

export interface CanvasGeo {
  el: HTMLElement;
  /** The canvas box in page px. */
  W: number;
  H: number;
  /** Its top-left, in page px from the frame's top-left. */
  ox: number;
  oy: number;
  /** Its top-left in viewport px (for drawing). */
  sx: number;
  sy: number;
  zoom: number;
}

/** Where a canvas section sits on the page right now. */
export function canvasGeo(sectionId: string, viewport?: DOMRect): CanvasGeo | null {
  const frame = frameElement();
  const el = frame?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(sectionId)}"] > .sp-canvas`);
  if (!frame || !el) return null;
  const zoom = state().camera.zoom;
  const r = el.getBoundingClientRect();
  const f = frame.getBoundingClientRect();
  const vp = viewport ?? frame.closest(".cv-viewport")?.getBoundingClientRect() ?? new DOMRect();
  return { el, W: r.width / zoom, H: r.height / zoom, ox: (r.left - f.left) / zoom, oy: (r.top - f.top) / zoom, sx: r.left - vp.left, sy: r.top - vp.top, zoom };
}

/** Everything a moving box can snap to inside one canvas section. */
export function canvasSnapTargets(section: Section, geo: CanvasGeo, exclude: string[]): SnapTargets {
  const { bp, guides, columns } = state();
  const others = section.blocks.filter((b) => !exclude.includes(b.id) && !resolveNode(b, bp).hidden).map((b, i) => toPx(frameOf(b, bp, i), geo.W, geo.H));
  const extra: SnapTargets = { x: guides[bp].x.map((x) => x - geo.ox), y: guides[bp].y.map((y) => y - geo.oy) };
  if (columns) {
    const frame = frameElement();
    const fw = frame ? frame.offsetWidth : 1440;
    for (const c of layoutColumns(fw)) extra.x.push(c.x - geo.ox, c.x + c.w - geo.ox);
  }
  return snapTargets(geo.W, geo.H, others, extra);
}

/** Smart-guide lines from page px (relative to the canvas) to viewport px. */
export function toScreenLines(lines: SnapLine[], geo: CanvasGeo): ScreenLine[] {
  return lines.map((l) =>
    l.axis === "x"
      ? { axis: "x", at: geo.sx + l.at * geo.zoom, from: geo.sy, to: geo.sy + geo.H * geo.zoom }
      : { axis: "y", at: geo.sy + l.at * geo.zoom, from: geo.sx, to: geo.sx + geo.W * geo.zoom },
  );
}

/** Blocks among `ids` that sit on the same free canvas, with that section; null if they don't. */
export function freeGroup(d: Project, ids: string[], bp: Breakpoint): { section: Section; blocks: Block[] } | null {
  const hits = ids.map((id) => findBlock(d, id));
  if (!hits.length || hits.some((h) => !h || h.block.locked)) return null;
  const section = hits[0]!.section;
  if (hits.some((h) => h!.section.id !== section.id) || !isFree(section, bp)) return null;
  return { section, blocks: hits.map((h) => h!.block) };
}

/**
 * Drag blocks around their free canvas. One undo step per drag; edges and
 * centres snap to the section, the other blocks, guides and columns (hold
 * Ctrl to place freely). Shift locks to the axis you moved most.
 */
export function startFrameMove(ids: string[], e: { clientX: number; clientY: number; pointerId: number }, surface: HTMLElement) {
  const d = doc();
  const bp = state().bp;
  const group = freeGroup(d, ids, bp);
  if (!group) return;
  const geo = canvasGeo(group.section.id);
  if (!geo) return;
  const base = state().history as History;
  const start = { x: e.clientX, y: e.clientY };
  const boxes = group.blocks.map((b) => ({ id: b.id, z: frameOf(b, bp).z ?? 0, box: toPx(frameOf(b, bp, group.section.blocks.indexOf(b)), geo.W, geo.H) }));
  // Snap the group as one box.
  const union = boxes.reduce(
    (u, { box }) => ({ x: Math.min(u.x, box.x), y: Math.min(u.y, box.y), r: Math.max(u.r, box.x + box.w), b: Math.max(u.b, box.y + box.h) }),
    { x: Infinity, y: Infinity, r: -Infinity, b: -Infinity },
  );
  const unionBox: PxBox = { x: union.x, y: union.y, w: union.r - union.x, h: union.b - union.y, r: boxes.length === 1 ? boxes[0].box.r : 0 };
  if (boxes.length === 1) Object.assign(unionBox, boxes[0].box);
  const targets = canvasSnapTargets(group.section, geo, ids);
  let moved = false;
  capture(surface, e.pointerId);

  const move = (ev: PointerEvent) => {
    let dx = (ev.clientX - start.x) / geo.zoom;
    let dy = (ev.clientY - start.y) / geo.zoom;
    if (!moved && Math.hypot(dx * geo.zoom, dy * geo.zoom) < 4) return;
    moved = true;
    if (ev.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
    let lines: SnapLine[] = [];
    if (!(ev.ctrlKey || ev.metaKey)) {
      const snapped = snapMove({ ...unionBox, x: unionBox.x + dx, y: unionBox.y + dy }, targets, 6 / geo.zoom, geo.H, geo.W);
      dx = snapped.box.x - unionBox.x;
      dy = snapped.box.y - unionBox.y;
      lines = snapped.lines;
    }
    setSnapLines(lines.length ? toScreenLines(lines, geo) : null);
    const steps = boxes.map(({ id, z, box }) => frameStep(id, toFrame({ ...box, x: box.x + dx, y: box.y + dy }, geo.W, geo.H, z), bp));
    preview(base, batch, { label: ids.length > 1 ? `Move ${ids.length} blocks` : "Move", steps });
  };
  const end = () => {
    surface.removeEventListener("pointermove", move);
    surface.removeEventListener("pointerup", end);
    surface.removeEventListener("pointercancel", end);
    setSnapLines(null);
    if (moved) endPreview();
  };
  surface.addEventListener("pointermove", move);
  surface.addEventListener("pointerup", end);
  surface.addEventListener("pointercancel", end);
}

/** Arrow keys on free-canvas blocks: 1px, or 10px with Shift. Returns false if the selection isn't on a free canvas. */
export function nudge(dx: number, dy: number): boolean {
  const d = doc();
  const { bp, selection } = state();
  const group = freeGroup(d, selection, bp);
  if (!group) return false;
  const geo = canvasGeo(group.section.id);
  if (!geo) return false;
  const steps = group.blocks.map((b) => {
    const f = frameOf(b, bp, group.section.blocks.indexOf(b));
    const box = toPx(f, geo.W, geo.H);
    return frameStep(b.id, toFrame({ ...box, x: box.x + dx, y: box.y + dy }, geo.W, geo.H, f.z), bp);
  });
  if (steps.length === 1) {
    // A single block's nudges merge into one undo step while you keep tapping.
    const only = group.blocks[0];
    const f = frameOf(only, bp);
    const box = toPx(f, geo.W, geo.H);
    const frame = toFrame({ ...box, x: box.x + dx, y: box.y + dy }, geo.W, geo.H, f.z);
    if (bp === "desktop") run(blockUpdate, { id: only.id, patch: { frame } });
    else run(blockOverride, { id: only.id, bp, patch: { frame } });
  } else run(batch, { label: "Nudge", steps });
  return true;
}

export type ZMove = "forward" | "backward" | "front" | "back";

/** Stacking order on a free canvas: ] and [ step, Shift+] and Shift+[ go all the way. */
export function zOrder(dir: ZMove): boolean {
  const d = doc();
  const { bp, selection } = state();
  const group = freeGroup(d, selection, bp);
  if (!group) return false;
  const all = group.section.blocks.map((b, i) => ({ b, z: frameOf(b, bp, i).z ?? 0, i }));
  all.sort((a, b) => a.z - b.z || a.i - b.i);
  const order = all.map((x) => x.b.id);
  const sel = new Set(selection);
  if (dir === "front") order.sort((a, b) => Number(sel.has(a)) - Number(sel.has(b)));
  else if (dir === "back") order.sort((a, b) => Number(sel.has(b)) - Number(sel.has(a)));
  else if (dir === "forward") {
    for (let i = order.length - 2; i >= 0; i--) if (sel.has(order[i]) && !sel.has(order[i + 1])) [order[i], order[i + 1]] = [order[i + 1], order[i]];
  } else {
    for (let i = 1; i < order.length; i++) if (sel.has(order[i]) && !sel.has(order[i - 1])) [order[i], order[i - 1]] = [order[i - 1], order[i]];
  }
  const steps: Step[] = [];
  order.forEach((id, z) => {
    const entry = all.find((x) => x.b.id === id)!;
    if (entry.z !== z) steps.push(frameStep(id, { ...frameOf(entry.b, bp, entry.i), z }, bp));
  });
  if (steps.length) run(batch, { label: dir === "front" ? "Bring to front" : dir === "back" ? "Send to back" : dir === "forward" ? "Bring forward" : "Send backward", steps });
  return true;
}

/**
 * Switch a section to a free canvas keeping every block exactly where it is
 * now: the canvas takes the section's current shape, each block a frame
 * measured from the page.
 */
export function convertToCanvas(sectionId: string) {
  const d = doc();
  const hit = findSection(d, sectionId);
  const frame = frameElement();
  if (!hit || !frame) return;
  const inner = frame.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(sectionId)}"] > div`);
  const zoom = state().camera.zoom;
  const steps: Step[] = [];
  let aspect = 16 / 9;
  if (inner) {
    const r = inner.getBoundingClientRect();
    const W = r.width / zoom;
    const H = Math.max(r.height / zoom, 80);
    aspect = Math.round((W / H) * 1000) / 1000;
    hit.section.blocks.forEach((b, i) => {
      const el = inner.querySelector<HTMLElement>(`:scope > [data-node-id="${CSS.escape(b.id)}"]`);
      const br = el?.getBoundingClientRect();
      const f: Frame = br && br.width
        ? toFrame({ x: (br.left - r.left) / zoom, y: (br.top - r.top) / zoom, w: br.width / zoom, h: br.height / zoom, r: 0 }, W, H, i)
        : cascadeFrame(i, i);
      steps.push(step(blockUpdate, { id: b.id, patch: { frame: f } }));
    });
  }
  const width = hit.section.layout.width;
  steps.unshift(step(sectionUpdate, { id: sectionId, patch: { layout: null } }));
  steps.splice(1, 0, step(sectionUpdate, { id: sectionId, patch: { layout: { type: "canvas", width, aspect } } }));
  run(batch, { label: "Make free canvas", steps });
}

/** New blocks dropped into a free canvas get frames so they don't all land in one corner. */
export function withFrames(section: Section, blocks: Block[]): Block[] {
  if (section.layout.type !== "canvas") return blocks;
  const top = section.blocks.reduce((z, b) => Math.max(z, b.frame?.z ?? 0), 0);
  return blocks.map((b, i) => (b.frame ? b : { ...b, frame: cascadeFrame(section.blocks.length + i, top + 1 + i) }));
}
