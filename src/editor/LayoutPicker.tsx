import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BENTO_PRESETS, FREE_LAYOUTS, presetsFor, suggestLayout, type BentoPreset } from "../model/index.ts";
import type { LayoutPick } from "./gallery.ts";

const W = 76;
const H = 48;

/** A layout drawn small: bento cells as tiles, photo grid as ragged rows, and so on. */
export function LayoutThumb({ pick }: { pick: LayoutPick }) {
  const g = 2.5;
  let rects: { x: number; y: number; w: number; h: number }[] = [];
  if (pick.mode === "bento") {
    const p = BENTO_PRESETS.find((x) => x.id === pick.preset) ?? BENTO_PRESETS[0];
    const { cols, rows, cells } = p.layout;
    const sc = cols.reduce((a, b) => a + b, 0);
    const sr = rows.reduce((a, b) => a + b, 0);
    const cw = (W - g * (cols.length - 1)) / sc;
    const rh = (H - g * (rows.length - 1)) / sr;
    const x0 = (i: number) => cols.slice(0, i).reduce((a, b) => a + b, 0) * cw + g * i;
    const y0 = (i: number) => rows.slice(0, i).reduce((a, b) => a + b, 0) * rh + g * i;
    rects = cells.map((c) => ({
      x: x0(c.c),
      y: y0(c.r),
      w: x0(c.c + c.cs) - x0(c.c) - g,
      h: y0(c.r + c.rs) - y0(c.r) - g,
    }));
  } else if (pick.mode === "justified") {
    const rowsDef = [[1.5, 0.8, 1.2], [0.7, 1.6, 1]];
    const rh = (H - g) / 2;
    rowsDef.forEach((row, r) => {
      const sum = row.reduce((a, b) => a + b, 0);
      let x = 0;
      row.forEach((w) => {
        const ww = ((W - g * (row.length - 1)) * w) / sum;
        rects.push({ x, y: r * (rh + g), w: ww, h: rh });
        x += ww + g;
      });
    });
  } else if (pick.mode === "carousel") {
    // A row running off the right edge.
    [[0, 26], [28, 18], [48, 30], [80, 20]].forEach(([x, w]) => rects.push({ x, y: 6, w, h: 36 }));
  } else if (pick.mode === "slideshow") {
    rects.push({ x: 0, y: 0, w: W, h: H - 9 });
    [0, 1, 2].forEach((i) => rects.push({ x: W / 2 - 8 + i * 6, y: H - 4, w: 3, h: 3 }));
  } else if (pick.mode === "ticker") {
    [[-8, 16], [10, 22], [34, 14], [50, 20], [72, 14]].forEach(([x, w]) => rects.push({ x, y: 15, w, h: 18 }));
  } else if (pick.mode === "moodboard") {
    rects = [
      { x: 2, y: 3, w: 26, h: 22 },
      { x: 22, y: 12, w: 22, h: 30 },
      { x: 46, y: 2, w: 28, h: 20 },
      { x: 40, y: 24, w: 30, h: 22 },
    ];
  } else if (pick.mode === "masonry") {
    const colW = (W - g * 2) / 3;
    const heights = [[20, 25.5], [28, 17.5], [14, 31.5]];
    heights.forEach((col, c) => {
      let y = 0;
      col.forEach((h) => {
        rects.push({ x: c * (colW + g), y, w: colW, h });
        y += h + g;
      });
    });
  } else {
    const colW = (W - g * 2) / 3;
    const rh = (H - g) / 2;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) rects.push({ x: c * (colW + g), y: r * (rh + g), w: colW, h: rh });
  }
  return (
    <svg className="layout-thumb" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={Math.max(1, r.w)}
          height={Math.max(1, r.h)}
          rx={1.5}
          transform={pick.mode === "moodboard" ? `rotate(${[-4, 3, -2, 4][i % 4]} ${r.x + r.w / 2} ${r.y + r.h / 2})` : undefined}
        />
      ))}
    </svg>
  );
}

interface Option {
  pick: LayoutPick;
  label: string;
  hint?: string;
  count?: number;
}

/**
 * Grid of layouts to choose from. With a known number of images it shows the
 * shape-keeping layouts plus the bento layouts made for that many; without one
 * it shows every bento layout, grouped by size.
 */
export function LayoutPicker({
  count,
  current,
  onPick,
  onCancel,
  title,
}: {
  count?: number;
  current?: LayoutPick;
  onPick: (p: LayoutPick) => void;
  onCancel?: () => void;
  title?: string;
}) {
  const options = useMemo(() => {
    const free: Option[] = FREE_LAYOUTS.map((l) => ({ pick: { mode: l.mode }, label: l.label, hint: l.hint }));
    const bento = (list: BentoPreset[]): Option[] => list.map((p) => ({ pick: { mode: "bento", preset: p.id }, label: p.label, count: p.count }));
    const fitting = count ? presetsFor(count) : BENTO_PRESETS;
    return { free, bento: bento(fitting), other: count ? bento(BENTO_PRESETS.filter((p) => p.count !== count)) : [] };
  }, [count]);
  const flat = [...options.free, ...options.bento, ...options.other];
  const suggested = count ? flat.findIndex((o) => o.pick.mode === suggestLayout(count).mode && !o.pick.preset) : -1;
  const isCurrent = (o: Option) => !!current && o.pick.mode === current.mode && (o.pick.preset ?? "") === (current.preset ?? "");
  const [active, setActive] = useState(() => Math.max(0, current ? flat.findIndex(isCurrent) : suggested));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => ref.current?.focus(), []);

  const onKey = (e: React.KeyboardEvent) => {
    const cols = 3;
    if (e.key === "ArrowRight") setActive((a) => Math.min(flat.length - 1, a + 1));
    else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, a - 1));
    else if (e.key === "ArrowDown") setActive((a) => Math.min(flat.length - 1, a + cols));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - cols));
    else if (e.key === "Enter") onPick(flat[active].pick);
    else if (e.key === "Escape") onCancel?.();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  let n = -1;
  const tile = (o: Option) => {
    n++;
    const i = n;
    return (
      <button
        key={`${o.pick.mode}-${o.pick.preset ?? ""}`}
        type="button"
        role="option"
        aria-selected={i === active}
        data-current={isCurrent(o) || undefined}
        className="layout-tile"
        title={o.hint ?? `${o.label}, ${o.count} images`}
        onMouseEnter={() => setActive(i)}
        onClick={() => onPick(o.pick)}
      >
        <LayoutThumb pick={o.pick} />
        <span>{o.label}</span>
        {i === suggested && <em className="layout-badge">Suggested</em>}
      </button>
    );
  };

  return (
    <div className="layout-picker" ref={ref} tabIndex={-1} onKeyDown={onKey} role="listbox" aria-label="Layouts">
      {title && <h3 className="layout-title">{title}</h3>}
      <h4>Keep image shapes</h4>
      <div className="layout-grid">{options.free.map(tile)}</div>
      <h4>{count ? `Bento for ${count} image${count === 1 ? "" : "s"}` : "Bento layouts"}</h4>
      {options.bento.length ? (
        <div className="layout-grid">{options.bento.map(tile)}</div>
      ) : (
        <p className="layout-none">No bento layout holds exactly {count}. Pick one below and the extras stay hidden, or use a photo grid.</p>
      )}
      {options.other.length > 0 && (
        <details className="layout-more">
          <summary>Other sizes</summary>
          <div className="layout-grid">{options.other.map(tile)}</div>
        </details>
      )}
      <p className="layout-keys">
        <kbd>←</kbd>
        <kbd>→</kbd> choose · <kbd>Enter</kbd> use{onCancel ? <> · <kbd>Esc</kbd> {count ? "photo grid" : "cancel"}</> : null}
      </p>
    </div>
  );
}

/** The picker as a floating popover at a screen point. */
export function LayoutPopover({
  x,
  y,
  onClose,
  ...props
}: { x: number; y: number; onClose: () => void } & React.ComponentProps<typeof LayoutPicker>) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8),
      top: y + r.height > window.innerHeight - 8 ? Math.max(8, y - r.height - 16) : y,
    });
  }, [x, y]);
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [onClose]);
  return (
    <div ref={ref} className="popover layout-popover" data-overlay-ui style={pos}>
      <LayoutPicker {...props} />
    </div>
  );
}
