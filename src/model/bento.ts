import type { BentoCell, BentoLayout, GalleryMode } from "./schema.ts";

/**
 * Bento presets, modelled on the layouts portfolio grids use most (including
 * the Behance photo-grid modules this tool is modelled on). `aspect` is the
 * whole grid's width ÷ height, tuned so cells land on familiar shapes.
 */
export interface BentoPreset {
  id: string;
  label: string;
  count: number;
  layout: Omit<BentoLayout, "preset" | "stackOnPhone">;
}

const cell = (c: number, r: number, cs = 1, rs = 1): BentoCell => ({ c, r, cs, rs });

export const BENTO_PRESETS: BentoPreset[] = [
  { id: "split", label: "Two up", count: 2, layout: { cols: [1, 1], rows: [1], aspect: 1.6, cells: [cell(0, 0), cell(1, 0)] } },
  { id: "split-2-1", label: "Wide + one", count: 2, layout: { cols: [2, 1], rows: [1], aspect: 2.1, cells: [cell(0, 0), cell(1, 0)] } },
  { id: "split-1-2", label: "One + wide", count: 2, layout: { cols: [1, 2], rows: [1], aspect: 2.1, cells: [cell(0, 0), cell(1, 0)] } },
  { id: "stack-2", label: "Two stacked", count: 2, layout: { cols: [1], rows: [1, 1], aspect: 0.9, cells: [cell(0, 0), cell(0, 1)] } },

  { id: "three", label: "Three tall", count: 3, layout: { cols: [1, 1, 1], rows: [1], aspect: 2.35, cells: [cell(0, 0), cell(1, 0), cell(2, 0)] } },
  {
    id: "big-left",
    label: "Big + two stacked",
    count: 3,
    layout: { cols: [1, 1], rows: [1, 1], aspect: 1.56, cells: [cell(0, 0, 1, 2), cell(1, 0), cell(1, 1)] },
  },
  {
    id: "big-right",
    label: "Two stacked + big",
    count: 3,
    layout: { cols: [1, 1], rows: [1, 1], aspect: 1.56, cells: [cell(0, 0), cell(0, 1), cell(1, 0, 1, 2)] },
  },
  { id: "row-2-1-1", label: "Wide row", count: 3, layout: { cols: [2, 1, 1], rows: [1], aspect: 3.1, cells: [cell(0, 0), cell(1, 0), cell(2, 0)] } },
  {
    id: "wide-top",
    label: "Wide + two below",
    count: 3,
    layout: { cols: [1, 1], rows: [1.15, 1], aspect: 1.15, cells: [cell(0, 0, 2, 1), cell(0, 1), cell(1, 1)] },
  },

  { id: "grid-2x2", label: "Two by two", count: 4, layout: { cols: [1, 1], rows: [1, 1], aspect: 1.5, cells: [cell(0, 0), cell(1, 0), cell(0, 1), cell(1, 1)] } },
  {
    id: "big-3",
    label: "Big + three",
    count: 4,
    layout: { cols: [2, 1], rows: [1, 1, 1], aspect: 1.5, cells: [cell(0, 0, 1, 3), cell(1, 0), cell(1, 1), cell(1, 2)] },
  },
  {
    id: "top-3",
    label: "Wide + three below",
    count: 4,
    layout: { cols: [1, 1, 1], rows: [1.5, 1], aspect: 1.25, cells: [cell(0, 0, 3, 1), cell(0, 1), cell(1, 1), cell(2, 1)] },
  },

  {
    id: "quad-tall-right",
    label: "Four + tall",
    count: 5,
    layout: { cols: [1, 1, 1.27], rows: [1, 1], aspect: 1.58, cells: [cell(0, 0), cell(1, 0), cell(0, 1), cell(1, 1), cell(2, 0, 1, 2)] },
  },
  {
    id: "tall-left-quad",
    label: "Tall + four",
    count: 5,
    layout: { cols: [1.27, 1, 1], rows: [1, 1], aspect: 1.58, cells: [cell(0, 0, 1, 2), cell(1, 0), cell(2, 0), cell(1, 1), cell(2, 1)] },
  },
  {
    id: "hero-4",
    label: "Hero + four",
    count: 5,
    layout: { cols: [1, 1, 1, 1], rows: [2, 1], aspect: 1.35, cells: [cell(0, 0, 4, 1), cell(0, 1), cell(1, 1), cell(2, 1), cell(3, 1)] },
  },

  {
    id: "grid-3x2",
    label: "Three by two",
    count: 6,
    layout: { cols: [1, 1, 1], rows: [1, 1], aspect: 1.5, cells: [cell(0, 0), cell(1, 0), cell(2, 0), cell(0, 1), cell(1, 1), cell(2, 1)] },
  },
  {
    id: "mosaic-6",
    label: "Mosaic",
    count: 6,
    layout: {
      cols: [1, 1, 1],
      rows: [1, 1, 1],
      aspect: 1.2,
      cells: [cell(0, 0, 2, 2), cell(2, 0), cell(2, 1), cell(0, 2), cell(1, 2), cell(2, 2)],
    },
  },
];

export function bentoFromPreset(id: string, stackOnPhone = false): BentoLayout {
  const p = BENTO_PRESETS.find((x) => x.id === id) ?? BENTO_PRESETS[0];
  return { preset: p.id, ...structuredClone(p.layout), stackOnPhone };
}

/** Width ÷ height of one cell, ignoring gaps. */
export function cellAspect(b: BentoLayout, cellIndex: number): number {
  const c = b.cells[cellIndex];
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const w = sum(b.cols.slice(c.c, c.c + c.cs)) / sum(b.cols);
  const h = sum(b.rows.slice(c.r, c.r + c.rs)) / sum(b.rows);
  return (w / h) * b.aspect;
}

/** Problems with a layout: cells off the grid, overlapping, or zero-sized tracks. */
export function bentoProblems(b: BentoLayout): string[] {
  const out: string[] = [];
  if (!b.cols.length || !b.rows.length) out.push("Grid needs at least one row and column");
  if (b.cols.some((w) => !(w > 0)) || b.rows.some((w) => !(w > 0))) out.push("Track sizes must be positive");
  if (!(b.aspect > 0)) out.push("Aspect must be positive");
  const taken = new Set<string>();
  b.cells.forEach((c, i) => {
    if (c.c < 0 || c.r < 0 || c.cs < 1 || c.rs < 1 || c.c + c.cs > b.cols.length || c.r + c.rs > b.rows.length)
      out.push(`Cell ${i + 1} is outside the grid`);
    for (let x = c.c; x < c.c + c.cs; x++)
      for (let y = c.r; y < c.r + c.rs; y++) {
        const key = `${x},${y}`;
        if (taken.has(key)) out.push(`Cell ${i + 1} overlaps another`);
        taken.add(key);
      }
  });
  return out;
}

export interface LayoutChoice {
  mode: GalleryMode;
  preset?: string;
  label: string;
  hint: string;
}

/** Shape-keeping layouts, offered for any number of images. */
export const FREE_LAYOUTS: LayoutChoice[] = [
  { mode: "justified", label: "Photo grid", hint: "Keeps every image's shape; rows line up edge to edge" },
  { mode: "masonry", label: "Masonry", hint: "Columns of images at their natural height" },
  { mode: "grid", label: "Uniform grid", hint: "Equal columns, one shape for all" },
  { mode: "carousel", label: "Carousel", hint: "One row you scroll sideways; shapes kept" },
  { mode: "slideshow", label: "Slideshow", hint: "One image at a time, crossfading" },
  { mode: "ticker", label: "Ticker", hint: "An endless moving strip" },
  { mode: "moodboard", label: "Moodboard", hint: "An overlapping, tilted collage" },
];

/** The layout to suggest for n images: the photo grid keeps any mix of shapes intact. */
export function suggestLayout(_count: number): LayoutChoice {
  return FREE_LAYOUTS[0];
}

export const presetsFor = (count: number) => BENTO_PRESETS.filter((p) => p.count === count);
