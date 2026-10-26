import { useEffect, useState } from "react";
import { batch, type Block, type History, type Section } from "../model/index.ts";
import { endPreview, preview, setSnapLines, useEditor } from "./store.ts";
import { canvasGeo, canvasSnapTargets, frameOf, frameStep, toScreenLines, type CanvasGeo } from "./canvasOps.ts";
import { HANDLES, resizeBox, rotateBox, snapResize, toFrame, toPx, type Handle } from "./frames.ts";
import { capture } from "./pointer.ts";

const ANGLE: Record<Handle, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };

/** The resize cursor for a handle once the box is rotated, snapped to the nearest of the four. */
function cursorFor(h: Handle, rotation: number) {
  const a = (((ANGLE[h] + rotation) % 180) + 180) % 180;
  return `${["ew", "nwse", "ns", "nesw"][Math.round(a / 45) % 4]}-resize`;
}

/**
 * Eight handles on a block in a free canvas, with rotate zones just outside the corners. Shift keeps the
 * shape (or snaps rotation to 15°), Alt resizes from the centre, Ctrl turns
 * snapping off. Every drag is one undo step.
 */
export function Transform({ block, section }: { block: Block; section: Section }) {
  const bp = useEditor((s) => s.bp);
  const camera = useEditor((s) => s.camera);
  const [geo, setGeo] = useState<CanvasGeo | null>(null);
  const [readout, setReadout] = useState<string | null>(null);

  // Re-measure the canvas whenever the view or the document changes.
  const docVersion = useEditor((s) => s.version);
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      const g = canvasGeo(section.id);
      setGeo((old) => (old && g && old.sx === g.sx && old.sy === g.sy && old.W === g.W && old.H === g.H && old.zoom === g.zoom ? old : g));
    };
    measure();
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [section.id, camera, bp, docVersion]);

  if (!geo) return null;
  const index = section.blocks.findIndex((b) => b.id === block.id);
  const f = frameOf(block, bp, index);
  const box = toPx(f, geo.W, geo.H);
  const z = geo.zoom;
  const style = {
    left: geo.sx + box.x * z,
    top: geo.sy + box.y * z,
    width: box.w * z,
    height: box.h * z,
    rotate: `${box.r}deg`,
  };

  const drag = (e: React.PointerEvent, kind: Handle | "rotate") => {
    e.preventDefault();
    e.stopPropagation();
    const surface = e.currentTarget as HTMLElement;
    capture(surface, e.pointerId);
    const base = useEditor.getState().history as History;
    const start = { x: e.clientX, y: e.clientY };
    const targets = canvasSnapTargets(section, geo, [block.id]);
    // Pointer positions in canvas page px, for the rotate maths.
    const local = (p: { x: number; y: number }) => {
      const r = geo.el.getBoundingClientRect();
      return { x: (p.x - r.left) / z, y: (p.y - r.top) / z };
    };
    const move = (ev: PointerEvent) => {
      let next = box;
      let lines: ReturnType<typeof snapResize>["lines"] = [];
      if (kind === "rotate") {
        next = rotateBox(box, local(start), local({ x: ev.clientX, y: ev.clientY }), ev.shiftKey);
        setReadout(`${Math.round(next.r)}°`);
      } else {
        next = resizeBox(box, kind, (ev.clientX - start.x) / z, (ev.clientY - start.y) / z, { ratio: ev.shiftKey, centre: ev.altKey });
        if (!(ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey) {
          const s = snapResize(next, kind, targets, 6 / z, geo.H, geo.W);
          next = s.box;
          lines = s.lines;
        }
        setReadout(`${Math.round(next.w)} × ${Math.round(next.h)}`);
      }
      setSnapLines(lines.length ? toScreenLines(lines, geo) : null);
      preview(base, batch, { label: kind === "rotate" ? "Rotate" : "Resize", steps: [frameStep(block.id, toFrame(next, geo.W, geo.H, f.z ?? 0), bp)] });
    };
    const end = () => {
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", end);
      surface.removeEventListener("pointercancel", end);
      setSnapLines(null);
      setReadout(null);
      endPreview();
    };
    surface.addEventListener("pointermove", move);
    surface.addEventListener("pointerup", end);
    surface.addEventListener("pointercancel", end);
  };

  return (
    <div className="tf" style={style} data-overlay-ui>
      {/* Just outside each corner: drag to rotate, like Figma. */}
      {(["nw", "ne", "se", "sw"] as const).map((c) => (
        <span key={c} className="tf-rot" data-c={c} title="Drag to rotate · Shift snaps to 15°" onPointerDown={(e) => drag(e, "rotate")} />
      ))}
      {HANDLES.map((h) => (
        <span key={h} className="tf-handle" data-h={h} style={{ cursor: cursorFor(h, box.r) }} onPointerDown={(e) => drag(e, h)} />
      ))}
      {readout && <span className="tf-readout" style={{ rotate: `${-box.r}deg` }}>{readout}</span>}
    </div>
  );
}
