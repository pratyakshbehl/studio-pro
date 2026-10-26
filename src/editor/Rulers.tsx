import { useEffect, useRef, useState, type RefObject } from "react";
import { BREAKPOINTS } from "../model/index.ts";
import { setGuides, useEditor } from "./store.ts";
import { layoutColumns } from "./frames.ts";
import { capture } from "./pointer.ts";

export const RULER = 20;
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

interface Span {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tick spacing in page px: the smallest step that leaves room for a label. */
function stepFor(zoom: number) {
  return STEPS.find((s) => s * zoom >= 56) ?? 5000;
}

function css(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** One ruler drawn on a canvas: ticks every step/5, labels every step, the selection's extent shaded. */
function useRulerCanvas(ref: RefObject<HTMLCanvasElement | null>, axis: "x" | "y", length: number, origin: number, zoom: number, span: Span | null) {
  useEffect(() => {
    const c = ref.current;
    if (!c || length <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = axis === "x" ? length : RULER;
    const h = axis === "x" ? RULER : length;
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = css("--panel", "#161616");
    g.fillRect(0, 0, w, h);
    if (span) {
      g.fillStyle = "rgba(240, 85, 42, 0.18)";
      if (axis === "x") g.fillRect(span.x, 0, span.w, RULER);
      else g.fillRect(0, span.y, RULER, span.h);
    }
    const step = stepFor(zoom);
    const minor = step / 5;
    const first = Math.floor(-origin / zoom / minor) * minor;
    const last = (length - origin) / zoom;
    g.strokeStyle = css("--line-strong", "#3a3a3a");
    g.fillStyle = css("--text-3", "#7a7a7a");
    g.font = "10px ui-sans-serif, system-ui, sans-serif";
    g.lineWidth = 1;
    g.beginPath();
    for (let v = first; v <= last; v += minor) {
      const p = Math.round(origin + v * zoom) + 0.5;
      const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
      const len = major ? RULER : 5;
      if (axis === "x") {
        g.moveTo(p, RULER - len);
        g.lineTo(p, RULER);
      } else {
        g.moveTo(RULER - len, p);
        g.lineTo(RULER, p);
      }
      if (major) {
        const label = String(Math.round(v));
        if (axis === "x") g.fillText(label, p + 3, 10);
        else {
          g.save();
          g.translate(10, p + 3);
          g.rotate(-Math.PI / 2);
          g.textAlign = "right";
          g.fillText(label, 0, 0);
          g.restore();
        }
      }
    }
    g.stroke();
    g.fillRect(axis === "x" ? 0 : RULER - 1, axis === "x" ? RULER - 1 : 0, axis === "x" ? w : 1, axis === "x" ? 1 : h);
  }, [ref, axis, length, origin, zoom, span?.x, span?.y, span?.w, span?.h]);
}

/**
 * Rulers (Ctrl+Shift+R), guides dragged out of them, and the layout columns
 * (Shift+G). Numbers are page pixels from the frame's top-left, so they match
 * the sizes in the inspector at any zoom. Drag a guide back onto its ruler to
 * remove it.
 */
export function Rulers({ selection, frameHeight }: { selection: Span | null; frameHeight: number }) {
  const rulers = useEditor((s) => s.rulers);
  const columns = useEditor((s) => s.columns);
  const camera = useEditor((s) => s.camera);
  const viewport = useEditor((s) => s.viewport);
  const bp = useEditor((s) => s.bp);
  const guides = useEditor((s) => s.guides[s.bp]);
  const frameWidth = BREAKPOINTS[bp].preview;
  const top = useRef<HTMLCanvasElement>(null);
  const left = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState<{ axis: "x" | "y"; at: number; index: number | null; screen: number } | null>(null);

  useRulerCanvas(top, "x", rulers ? viewport.w : 0, camera.x, camera.zoom, selection);
  useRulerCanvas(left, "y", rulers ? viewport.h : 0, camera.y, camera.zoom, selection);

  const z = camera.zoom;
  const toScreen = (axis: "x" | "y", v: number) => (axis === "x" ? camera.x : camera.y) + v * z;

  /** Drag a new guide out of a ruler, or an existing one around; dropping it on a ruler removes it. */
  const dragGuide = (e: React.PointerEvent, axis: "x" | "y", index: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    capture(el, e.pointerId);
    const vp = el.closest(".cv-viewport")!.getBoundingClientRect();
    const at = (ev: { clientX: number; clientY: number }) => {
      const screen = axis === "x" ? ev.clientX - vp.left : ev.clientY - vp.top;
      const page = Math.round((screen - (axis === "x" ? camera.x : camera.y)) / z);
      return { screen, page };
    };
    const move = (ev: PointerEvent) => {
      const p = at(ev);
      setLive({ axis, at: p.page, index, screen: p.screen });
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      const p = at(ev);
      const list = [...guides[axis]];
      if (index !== null) list.splice(index, 1);
      if (p.screen > RULER) list.push(p.page);
      setGuides({ ...guides, [axis]: list });
      setLive(null);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const cols = columns ? layoutColumns(frameWidth) : [];
  const shown = (axis: "x" | "y") => guides[axis].map((v, i) => ({ v, i })).filter(({ i }) => !(live && live.axis === axis && live.index === i));

  return (
    <>
      {columns && (
        <div className="cols" aria-hidden>
          {cols.map((c, i) => (
            <span key={`${bp}${i}`} style={{ left: toScreen("x", c.x), top: camera.y, width: c.w * z, height: frameHeight * z }} />
          ))}
        </div>
      )}

      {rulers &&
        (["x", "y"] as const).map((axis) =>
          shown(axis).map(({ v, i }) => (
            <div
              key={`${axis}${i}`}
              className="guide"
              data-axis={axis}
              data-overlay-ui
              style={axis === "x" ? { left: toScreen("x", v) } : { top: toScreen("y", v) }}
              title={`${v} px · drag onto the ruler to remove`}
              onPointerDown={(e) => dragGuide(e, axis, i)}
            />
          )),
        )}
      {live && (
        <div className="guide" data-axis={live.axis} data-live style={live.axis === "x" ? { left: live.screen } : { top: live.screen }}>
          <span>{live.screen <= RULER ? "Remove" : live.at}</span>
        </div>
      )}

      {rulers && (
        <>
          <canvas ref={top} className="ruler" data-axis="x" data-overlay-ui title="Drag down for a guide" onPointerDown={(e) => dragGuide(e, "y", null)} />
          <canvas ref={left} className="ruler" data-axis="y" data-overlay-ui title="Drag right for a guide" onPointerDown={(e) => dragGuide(e, "x", null)} />
          <span className="ruler-corner" />
        </>
      )}
    </>
  );
}
