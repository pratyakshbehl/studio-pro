import { BREAKPOINTS } from "../model/index.ts";
import { setCamera, useEditor } from "./store.ts";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
const PAD = 56;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const frameWidth = () => BREAKPOINTS[useEditor.getState().bp].preview;

/** The frame element, measured where the canvas mounted it. */
let frameEl: HTMLElement | null = null;
export const registerFrame = (el: HTMLElement | null) => {
  frameEl = el;
};
export const frameElement = () => frameEl;

/** Zoom keeping the viewport point (px, py) fixed on screen. */
export function zoomAt(next: number, px: number, py: number) {
  const { camera } = useEditor.getState();
  const zoom = clampZoom(next);
  const k = zoom / camera.zoom;
  setCamera({ zoom, x: px - (px - camera.x) * k, y: py - (py - camera.y) * k });
}

export function zoomBy(factor: number) {
  const { viewport, camera } = useEditor.getState();
  zoomAt(camera.zoom * factor, viewport.w / 2, viewport.h / 2);
}

/** Shift+1: the frame's width fills the viewport (never above 100%). */
export function zoomToFit() {
  const { viewport } = useEditor.getState();
  const w = frameWidth();
  const zoom = clampZoom(Math.min(1, (viewport.w - PAD * 2) / w));
  setCamera({ zoom, x: (viewport.w - w * zoom) / 2, y: PAD });
}

/** Shift+0: actual size, keeping the frame's top-centre in view. */
export function zoomTo100() {
  const { viewport, camera } = useEditor.getState();
  const w = frameWidth();
  const topInFrame = Math.max(0, (PAD - camera.y) / camera.zoom);
  setCamera({ zoom: 1, x: (viewport.w - w) / 2, y: PAD - topInFrame });
}

/** Shift+2: frame the selection. Works from frame coordinates, so zoom level doesn't matter. */
export function zoomToSelection() {
  const { selection, viewport } = useEditor.getState();
  const box = selectionBox(selection);
  if (!box) return zoomToFit();
  const zoom = clampZoom(Math.min((viewport.w - PAD * 2) / box.w, (viewport.h - PAD * 2) / box.h, 2));
  setCamera({
    zoom,
    x: viewport.w / 2 - (box.x + box.w / 2) * zoom,
    y: viewport.h / 2 - (box.y + box.h / 2) * zoom,
  });
}

/** Scroll the canvas just enough to bring a node into view (used when picking it in Layers). */
export function reveal(id: string) {
  const { viewport, camera } = useEditor.getState();
  const box = selectionBox([id]);
  if (!box) return;
  const top = camera.y + box.y * camera.zoom;
  const bottom = top + box.h * camera.zoom;
  if (top >= 40 && bottom <= viewport.h - 40) return;
  setCamera({ y: Math.min(PAD, viewport.h / 3 - box.y * camera.zoom) });
}

/** Union of nodes' boxes in frame (unzoomed) pixels. */
function selectionBox(ids: string[]) {
  if (!frameEl || !ids.length) return null;
  const { camera } = useEditor.getState();
  const origin = frameEl.getBoundingClientRect();
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const id of ids) {
    const el = frameEl.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    x1 = Math.min(x1, (r.left - origin.left) / camera.zoom);
    y1 = Math.min(y1, (r.top - origin.top) / camera.zoom);
    x2 = Math.max(x2, (r.right - origin.left) / camera.zoom);
    y2 = Math.max(y2, (r.bottom - origin.top) / camera.zoom);
  }
  if (!Number.isFinite(x1)) return null;
  return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
}
