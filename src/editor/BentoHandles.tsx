import { capture } from "./pointer.ts";
import { useState } from "react";
import { resolveNode, type GalleryBlock } from "../model/index.ts";
import { useEditor } from "./store.ts";
import { setBento, setTracks } from "./gallery.ts";

/** Ratios a divider snaps to (as the left/top track's share of the pair), unless Alt is held. */
const SNAPS = [1 / 4, 1 / 3, 2 / 5, 1 / 2, 3 / 5, 2 / 3, 3 / 4];
const SNAP_RANGE = 0.015;
const ASPECTS: [string, number][] = [
  ["21:9", 21 / 9],
  ["2:1", 2],
  ["16:9", 16 / 9],
  ["3:2", 1.5],
  ["4:3", 4 / 3],
  ["1:1", 1],
  ["4:5", 0.8],
];

/** "2 : 1", "1 : 1", or percentages when the ratio isn't a simple one. */
function ratioLabel(a: number, b: number) {
  const r = a / b;
  for (let q = 1; q <= 4; q++)
    for (let p = 1; p <= 4; p++) if (Math.abs(r - p / q) < 0.02) return `${p} : ${q}`;
  const pa = Math.round((a / (a + b)) * 100);
  return `${pa}% · ${100 - pa}%`;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Resize handles for a selected bento grid, drawn in screen space over the
 * grid. Dragging a divider trades size between the two tracks beside it.
 * On tablet or phone the change is recorded for that size only.
 */
export function BentoHandles({ block, rect }: { block: GalleryBlock; rect: Rect }) {
  const bp = useEditor((s) => s.bp);
  const zoom = useEditor((s) => s.camera.zoom);
  const [drag, setDrag] = useState<{ label: string; x: number; y: number } | null>(null);
  const r = resolveNode(block, bp);
  const bento = r.bento;
  if (!bento) return null;
  const gap = r.gap * zoom;

  const tracks = (weights: number[], size: number) => {
    const total = weights.reduce((a, b) => a + b, 0);
    const unit = (size - gap * (weights.length - 1)) / total;
    const starts: number[] = [];
    let at = 0;
    weights.forEach((w) => {
      starts.push(at);
      at += w * unit + gap;
    });
    return { unit, starts };
  };
  const cols = tracks(bento.cols, rect.w);
  const rows = tracks(bento.rows, rect.h);

  const startTrackDrag = (axis: "cols" | "rows", k: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    capture(el, e.pointerId);
    const weights = [...bento[axis]];
    const unit = axis === "cols" ? cols.unit : rows.unit;
    const pair = weights[k] + weights[k + 1];
    const min = pair * 0.12;
    const start = axis === "cols" ? e.clientX : e.clientY;
    const move = (ev: PointerEvent) => {
      const delta = ((axis === "cols" ? ev.clientX : ev.clientY) - start) / unit;
      let a = Math.min(pair - min, Math.max(min, weights[k] + delta));
      if (!ev.altKey) {
        const share = a / pair;
        const snap = SNAPS.find((s) => Math.abs(s - share) < SNAP_RANGE);
        if (snap) a = snap * pair;
      }
      const next = [...weights];
      next[k] = a;
      next[k + 1] = pair - a;
      setTracks(block.id, axis, next);
      setDrag({ label: ratioLabel(a, pair - a), x: ev.clientX, y: ev.clientY });
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      setDrag(null);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const startAspectDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    capture(el, e.pointerId);
    const h0 = rect.h;
    const startY = e.clientY;
    const move = (ev: PointerEvent) => {
      let aspect = Math.min(6, Math.max(0.4, rect.w / Math.max(40, h0 + ev.clientY - startY)));
      let label = aspect.toFixed(2);
      if (!ev.altKey) {
        const near = ASPECTS.find(([, v]) => Math.abs(v - aspect) / v < 0.02);
        if (near) [label, aspect] = near;
      }
      setBento(block.id, { aspect });
      setDrag({ label: `Shape ${label}`, x: ev.clientX, y: ev.clientY });
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      setDrag(null);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  return (
    <>
      {bento.cols.slice(0, -1).map((_, k) => {
        const x = rect.x + cols.starts[k + 1] - gap / 2;
        return (
          <div
            key={`c${k}`}
            className="bh bh-col"
            data-overlay-ui
            style={{ left: x, top: rect.y, height: rect.h }}
            onPointerDown={startTrackDrag("cols", k)}
            title="Drag to resize columns. Hold Alt to turn off snapping."
          >
            <span />
          </div>
        );
      })}
      {bento.rows.slice(0, -1).map((_, k) => {
        const y = rect.y + rows.starts[k + 1] - gap / 2;
        return (
          <div
            key={`r${k}`}
            className="bh bh-row"
            data-overlay-ui
            style={{ top: y, left: rect.x, width: rect.w }}
            onPointerDown={startTrackDrag("rows", k)}
            title="Drag to resize rows. Hold Alt to turn off snapping."
          >
            <span />
          </div>
        );
      })}
      <div
        className="bh bh-aspect"
        data-overlay-ui
        style={{ left: rect.x + rect.w / 2, top: rect.y + rect.h }}
        onPointerDown={startAspectDrag}
        title="Drag to change the grid's height"
      >
        <span />
      </div>
      {drag && (
        <div className="bh-readout" style={{ left: drag.x, top: drag.y }}>
          {drag.label}
        </div>
      )}
    </>
  );
}
