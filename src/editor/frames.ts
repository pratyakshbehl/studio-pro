import type { Frame } from "../model/index.ts";

/**
 * Free-canvas geometry. A frame is stored in % of its section's box (so it
 * scales with the page); every calculation here works in page pixels and
 * converts at the edges. Rotation is about the box centre, like CSS `rotate`.
 */

export interface PxBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, clockwise. */
  r: number;
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** A smart-guide line to draw, in page px: vertical when axis is "x". */
export interface SnapLine {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

export const DEFAULT_FRAME: Frame = { x: 10, y: 10, w: 40, h: 40, rotation: 0, z: 0 };
const MIN = 8;
const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;
const rad = (deg: number) => (deg * Math.PI) / 180;

export const toPx = (f: Frame, W: number, H: number): PxBox => ({
  x: (f.x / 100) * W,
  y: (f.y / 100) * H,
  w: (f.w / 100) * W,
  h: (f.h / 100) * H,
  r: f.rotation,
});

export const toFrame = (b: PxBox, W: number, H: number, z: number): Frame => ({
  x: round((b.x / W) * 100),
  y: round((b.y / H) * 100),
  w: round((b.w / W) * 100),
  h: round((b.h / H) * 100),
  rotation: round(b.r, 1),
  z,
});

/**
 * Drag a handle by (dx, dy) page px. Works in the box's own rotated axes so a
 * tilted image resizes along its edges. `ratio` keeps the shape (Shift),
 * `centre` grows from the middle (Alt).
 */
export function resizeBox(b: PxBox, handle: Handle, dx: number, dy: number, opts: { ratio?: boolean; centre?: boolean } = {}): PxBox {
  const t = rad(b.r);
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const sx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const sy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  const k = opts.centre ? 2 : 1;
  let w = Math.max(MIN, b.w + sx * lx * k);
  let h = Math.max(MIN, b.h + sy * ly * k);
  if (opts.ratio) {
    const a = b.w / b.h;
    if (sx && sy) {
      // Corner: the axis moved further (relative to size) leads.
      if (w / b.w > h / b.h) h = w / a;
      else w = h * a;
    } else if (sx) h = w / a;
    else w = h * a;
  }
  // How far the centre travels in the box's axes, then back to page axes.
  const cxl = opts.centre ? 0 : sx ? (sx * (w - b.w)) / 2 : 0;
  const cyl = opts.centre ? 0 : sy ? (sy * (h - b.h)) / 2 : 0;
  const cx = b.x + b.w / 2 + cxl * cos - cyl * sin;
  const cy = b.y + b.h / 2 + cxl * sin + cyl * cos;
  return { x: cx - w / 2, y: cy - h / 2, w, h, r: b.r };
}

/** Angle for a rotate drag: the start angle plus how far the pointer swung round the centre. */
export function rotateBox(b: PxBox, start: { x: number; y: number }, now: { x: number; y: number }, snap = false): PxBox {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const a0 = Math.atan2(start.y - cy, start.x - cx);
  const a1 = Math.atan2(now.y - cy, now.x - cx);
  let r = b.r + ((a1 - a0) * 180) / Math.PI;
  if (snap) r = Math.round(r / 15) * 15;
  r = ((((r + 180) % 360) + 360) % 360) - 180;
  return { ...b, r: Math.abs(r) < 0.05 ? 0 : r };
}

/** The axis-aligned bounds of a (possibly rotated) box. */
export function bounds(b: PxBox): { x: number; y: number; w: number; h: number } {
  if (!b.r) return { x: b.x, y: b.y, w: b.w, h: b.h };
  const t = rad(b.r);
  const w = Math.abs(b.w * Math.cos(t)) + Math.abs(b.h * Math.sin(t));
  const h = Math.abs(b.w * Math.sin(t)) + Math.abs(b.h * Math.cos(t));
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}

export interface SnapTargets {
  x: number[];
  y: number[];
}

/** Lines worth snapping to: the section's edges and middle, the other blocks, and any extra (guides, columns). */
export function snapTargets(W: number, H: number, others: PxBox[], extra: SnapTargets = { x: [], y: [] }): SnapTargets {
  const x = [0, W / 2, W, ...extra.x];
  const y = [0, H / 2, H, ...extra.y];
  for (const o of others) {
    const b = bounds(o);
    x.push(b.x, b.x + b.w / 2, b.x + b.w);
    y.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { x, y };
}

function nearest(values: number[], targets: number[], threshold: number): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const v of values)
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: t };
    }
  return best;
}

/**
 * Snap a moving box: its edges and centre pull onto the nearest target within
 * `threshold` page px, per axis. Returns the snapped box and the lines to draw.
 */
export function snapMove(b: PxBox, targets: SnapTargets, threshold: number, H: number, W: number): { box: PxBox; lines: SnapLine[] } {
  const bb = bounds(b);
  const sx = nearest([bb.x, bb.x + bb.w / 2, bb.x + bb.w], targets.x, threshold);
  const sy = nearest([bb.y, bb.y + bb.h / 2, bb.y + bb.h], targets.y, threshold);
  const box = { ...b, x: b.x + (sx?.delta ?? 0), y: b.y + (sy?.delta ?? 0) };
  const lines: SnapLine[] = [];
  if (sx) lines.push({ axis: "x", at: sx.at, from: 0, to: H });
  if (sy) lines.push({ axis: "y", at: sy.at, from: 0, to: W });
  return { box, lines };
}

/** Snap only the edges a handle moves, for an unrotated box. */
export function snapResize(b: PxBox, handle: Handle, targets: SnapTargets, threshold: number, H: number, W: number): { box: PxBox; lines: SnapLine[] } {
  if (b.r) return { box: b, lines: [] };
  let { x, y, w, h } = b;
  const lines: SnapLine[] = [];
  if (handle.includes("e")) {
    const s = nearest([x + w], targets.x, threshold);
    if (s) (w += s.delta), lines.push({ axis: "x", at: s.at, from: 0, to: H });
  } else if (handle.includes("w")) {
    const s = nearest([x], targets.x, threshold);
    if (s) (x += s.delta), (w -= s.delta), lines.push({ axis: "x", at: s.at, from: 0, to: H });
  }
  if (handle.includes("s")) {
    const s = nearest([y + h], targets.y, threshold);
    if (s) (h += s.delta), lines.push({ axis: "y", at: s.at, from: 0, to: W });
  } else if (handle.includes("n")) {
    const s = nearest([y], targets.y, threshold);
    if (s) (y += s.delta), (h -= s.delta), lines.push({ axis: "y", at: s.at, from: 0, to: W });
  }
  return { box: { x, y, w: Math.max(MIN, w), h: Math.max(MIN, h), r: 0 }, lines };
}

/** Frames for blocks that don't have one yet: a gentle cascade so nothing lands on top of anything else. */
export function cascadeFrame(i: number, z: number): Frame {
  const step = (i % 6) * 4;
  return { ...DEFAULT_FRAME, x: DEFAULT_FRAME.x + step, y: DEFAULT_FRAME.y + step, z };
}

/** 12/8/4 layout columns over the site's content area, in page px from the frame's left. */
export function layoutColumns(frameWidth: number): { x: number; w: number }[] {
  const phone = frameWidth < 768;
  const margin = phone ? 24 : 40;
  const count = phone ? 4 : frameWidth < 1280 ? 8 : 12;
  const gap = phone ? 16 : 24;
  const inner = Math.min(frameWidth - margin * 2, 1360);
  const left = (frameWidth - inner) / 2;
  const w = (inner - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({ x: left + i * (w + gap), w }));
}
