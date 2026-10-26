import type { ReactNode } from "react";
import type { Block, Section } from "../model/index.ts";

/**
 * A section drawn as a wireframe from its real blocks: text as lines, media as
 * boxes in their real shape, grids as their cells. Works for presets and for
 * sections people save themselves, so every thumbnail is honest.
 */
const W = 160;
const PAD = 10;
const GAP = 6;

interface Drawn {
  h: number;
  draw: (x: number, y: number, w: number) => ReactNode;
}

const box = (x: number, y: number, w: number, h: number, kind: "m" | "t" | "a" = "m", key?: string | number) => (
  <rect key={key} x={x} y={y} width={Math.max(1, w)} height={Math.max(1, h)} rx={kind === "t" ? 1 : 2} className={`st-${kind}`} />
);

function lines(n: number, widths: number[], gap = 3.5, h = 2.2): Drawn {
  return {
    h: n * h + (n - 1) * gap,
    draw: (x, y, w) => <g>{Array.from({ length: n }, (_, i) => box(x, y + i * (h + gap), w * widths[i % widths.length], h, "t", i))}</g>,
  };
}

/** How tall a block is at width w, and how to draw it there. */
function drawBlock(b: Block, w: number): Drawn {
  const shaped = (aspect: number, extra?: (x: number, y: number, ww: number, hh: number) => ReactNode): Drawn => {
    const h = w / aspect;
    return { h, draw: (x, y, ww) => <g>{box(x, y, ww, h)}{extra?.(x, y, ww, h)}</g> };
  };
  switch (b.type) {
    case "heading":
      return { h: b.level === 1 ? 11 : 7, draw: (x, y, ww) => box(x, y, ww * (b.level === 1 ? 0.8 : 0.55), b.level === 1 ? 11 : 7, "a") };
    case "text":
      return b.preset === "lede" ? lines(3, [0.95, 0.9, 0.6], 4, 3.2) : lines(3, [1, 0.94, 0.66]);
    case "quote":
      return lines(2, [0.9, 0.55], 4, 4);
    case "image":
    case "model":
    case "lottie":
    case "turntable":
      return shaped(("aspect" in b && b.aspect) || 16 / 9);
    case "video":
      return shaped(b.aspect ?? 16 / 9, (x, y, ww, hh) => <path className="st-a" d={`M${x + ww / 2 - 4} ${y + hh / 2 - 5}l9 5-9 5z`} />);
    case "compare":
      return shaped(b.aspect ?? 16 / 9, (x, y, ww, hh) => box(x + ww / 2 - 0.6, y, 1.2, hh, "a"));
    case "layers":
      return shaped(b.aspect ?? 16 / 9, (x, y, ww, hh) => <g>{box(x, y + hh + 3, ww, 1.6, "a")}</g>);
    case "embed":
      return shaped(16 / 9, (x, y, ww, hh) => <path className="st-line" d={`M${x + ww / 2 - 8} ${y + hh / 2}l-4 0M${x + ww / 2 + 8} ${y + hh / 2}l4 0`} />);
    case "gallery":
      return gallery(b, w);
    case "stats":
      return { h: 16, draw: (x, y, ww) => <g>{[0, 1, 2].map((i) => box(x + i * (ww / 3), y, ww / 3 - 6, 12, "a", i))}</g> };
    case "palette":
      return { h: 18, draw: (x, y, ww) => <g>{[0, 1, 2, 3].map((i) => box(x + i * 21, y, 17, 17, "m", i))}</g> };
    case "specimen":
      return { h: 22, draw: (x, y, ww) => <g>{box(x, y, 22, 20, "a")}{box(x + 28, y + 4, ww * 0.5, 3, "t")}{box(x + 28, y + 11, ww * 0.4, 3, "t")}</g> };
    case "prompt":
      return { h: 26, draw: (x, y, ww) => <g>{box(x, y, ww, 26, "m")}{box(x + 5, y + 6, ww * 0.6, 2.4, "t")}{box(x + 5, y + 12, ww * 0.7, 2.4, "t")}{box(x + 5, y + 18, ww * 0.3, 2.4, "t")}</g> };
    case "timeline":
      return { h: 30, draw: (x, y, ww) => <g>{box(x + 1, y, 1.2, 30, "a")}{[0, 1, 2].map((i) => box(x + 7, y + i * 11, ww * 0.6, 3, "t", i))}</g> };
    case "facts":
    case "credits":
      return { h: 14, draw: (x, y, ww) => <g>{[0, 1].map((r) => [0, 1].map((c) => box(x + c * (ww / 2), y + r * 8, ww * 0.35, 2.4, "t", `${r}${c}`)))}</g> };
    case "button":
      return { h: 8, draw: (x, y) => <rect x={x} y={y} width={34} height={8} rx={4} className="st-a" /> };
    case "audio":
      return {
        h: 12,
        draw: (x, y, ww) => (
          <g>
            <circle cx={x + 6} cy={y + 6} r={5} className="st-a" />
            {Array.from({ length: 22 }, (_, i) => box(x + 15 + i * ((ww - 18) / 22), y + 6 - (2 + (i * 7) % 5), 1.6, 4 + ((i * 7) % 5) * 2, "t", i))}
          </g>
        ),
      };
    case "tracklist":
      return { h: 22, draw: (x, y, ww) => <g>{box(x, y, 20, 20)}{[0, 1, 2].map((i) => box(x + 26, y + 2 + i * 7, ww - 30, 2.2, "t", i))}</g> };
    case "spacer":
      return { h: 6, draw: () => null };
    case "divider":
      return { h: 2, draw: (x, y, ww) => box(x, y, ww, 0.8, "t") };
  }
}

function gallery(b: Extract<Block, { type: "gallery" }>, w: number): Drawn {
  const g = 3;
  if (b.mode === "bento" && b.bento) {
    const { cols, rows, cells, aspect } = b.bento;
    const h = w / aspect;
    const sc = cols.reduce((a, c) => a + c, 0);
    const sr = rows.reduce((a, c) => a + c, 0);
    return {
      h,
      draw: (x, y, ww) => {
        const cw = (ww - g * (cols.length - 1)) / sc;
        const rh = (h - g * (rows.length - 1)) / sr;
        const x0 = (i: number) => cols.slice(0, i).reduce((a, c) => a + c, 0) * cw + g * i;
        const y0 = (i: number) => rows.slice(0, i).reduce((a, c) => a + c, 0) * rh + g * i;
        return <g>{cells.map((c, i) => box(x + x0(c.c), y + y0(c.r), x0(c.c + c.cs) - x0(c.c) - g, y0(c.r + c.rs) - y0(c.r) - g, "m", i))}</g>;
      },
    };
  }
  if (b.mode === "carousel" || b.mode === "ticker") {
    const h = b.mode === "ticker" ? 14 : 26;
    return { h, draw: (x, y, ww) => <g>{[0.42, 0.3, 0.4].map((f, i, a) => box(x + a.slice(0, i).reduce((s, v) => s + v * ww + g, 0), y, f * ww, h, "m", i))}</g> };
  }
  if (b.mode === "slideshow") {
    const h = w / (b.aspect ?? 16 / 9);
    return { h: h + 5, draw: (x, y, ww) => <g>{box(x, y, ww, h)}{[0, 1, 2].map((i) => <circle key={i} cx={x + ww / 2 - 4 + i * 4} cy={y + h + 3} r={1} className="st-a" />)}</g> };
  }
  if (b.mode === "moodboard") {
    return {
      h: 34,
      draw: (x, y, ww) => (
        <g>
          {[[0, 2, 0.4, 20, -4], [0.32, 8, 0.36, 24, 3], [0.62, 0, 0.36, 18, -2]].map(([fx, dy, fw, hh, r], i) => (
            <rect key={i} x={x + fx * ww} y={y + dy} width={fw * ww} height={hh} rx={2} className="st-m" transform={`rotate(${r} ${x + fx * ww + (fw * ww) / 2} ${y + dy + hh / 2})`} />
          ))}
        </g>
      ),
    };
  }
  // Photo grid, uniform grid, masonry: two rows of three.
  const rh = 14;
  return {
    h: rh * 2 + g,
    draw: (x, y, ww) => (
      <g>
        {[[0.42, 0.25, 0.33], [0.3, 0.38, 0.32]].map((row, r) =>
          row.map((f, i) => box(x + row.slice(0, i).reduce((s, v) => s + v * (ww - 2 * g) + g, 0), y + r * (rh + g), f * (ww - 2 * g), rh, "m", `${r}${i}`)),
        )}
      </g>
    ),
  };
}

/** Lays a section's blocks out the way its layout would, scaled down. */
function layoutSection(s: Section): { h: number; nodes: ReactNode[] } {
  const inner = W - PAD * 2;
  const l = s.layout;
  const nodes: ReactNode[] = [];
  if (l.type === "canvas") {
    const h = inner / l.aspect;
    s.blocks.forEach((b, i) => {
      const f = b.frame ?? { x: 10, y: 10, w: 40, h: 40, rotation: 0, z: i };
      const d = drawBlock(b, (f.w / 100) * inner);
      nodes.push(<g key={b.id}>{d.draw(PAD + (f.x / 100) * inner, PAD + (f.y / 100) * h, (f.w / 100) * inner)}</g>);
    });
    return { h, nodes };
  }
  const cols = l.type === "grid" ? Math.max(1, l.columns) : l.type === "stack" && l.direction === "row" ? Math.max(1, s.blocks.length) : 1;
  const cw = (inner - GAP * (cols - 1)) / cols;
  let y = PAD;
  for (let i = 0; i < s.blocks.length; i += cols) {
    const row = s.blocks.slice(i, i + cols).map((b) => drawBlock(b, cw));
    const rowH = Math.max(...row.map((d) => d.h));
    row.forEach((d, c) => nodes.push(<g key={`${i}-${c}`}>{d.draw(PAD + c * (cw + GAP), y, cw)}</g>));
    y += rowH + GAP;
  }
  return { h: Math.max(20, y - GAP - PAD), nodes };
}

export function SectionThumb({ sections }: { sections: Section[] }) {
  let y = 0;
  const parts: ReactNode[] = [];
  for (const s of sections) {
    const { h, nodes } = layoutSection(s);
    parts.push(
      <g key={s.id} transform={`translate(0 ${y})`}>
        {nodes}
      </g>,
    );
    y += h + PAD;
  }
  const total = y + PAD;
  return (
    <svg className="section-thumb" viewBox={`0 0 ${W} ${total}`} aria-hidden="true">
      {parts}
    </svg>
  );
}
