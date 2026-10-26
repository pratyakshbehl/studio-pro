/**
 * Galleries: switching layouts, resizing bento tracks, and working with the
 * images inside (swap, fill, focal point, remove). An image inside a gallery
 * is selected as "<blockId>#<index>".
 */
import {
  bentoFromPreset,
  blockUpdate,
  findBlock,
  newBlock,
  type BentoLayout,
  type GalleryBlock,
  type GalleryMode,
  type Media,
} from "../model/index.ts";
import { doc, run, select, toast } from "./store.ts";
import { insertBlocks, setProps, type InsertTarget } from "./actions.ts";
import { plural } from "../lib/format.ts";

export interface LayoutPick {
  mode: GalleryMode;
  preset?: string;
}

/* ── Item selections ──────────────────────────────────────────────────── */

export function splitSel(id: string): { id: string; item: number | null } {
  const i = id.indexOf("#");
  return i < 0 ? { id, item: null } : { id: id.slice(0, i), item: Number(id.slice(i + 1)) };
}
export const itemSel = (blockId: string, index: number) => `${blockId}#${index}`;

export function galleryOf(id: string): GalleryBlock | null {
  const hit = findBlock(doc(), splitSel(id).id);
  return hit?.block.type === "gallery" ? hit.block : null;
}

/* ── Layouts ──────────────────────────────────────────────────────────── */

export const MODE_LABEL: Record<GalleryMode, string> = {
  justified: "Photo grid",
  masonry: "Masonry",
  grid: "Uniform grid",
  bento: "Bento",
  carousel: "Carousel",
  slideshow: "Slideshow",
  ticker: "Ticker",
  moodboard: "Moodboard",
};

export function layoutLabel(g: Pick<GalleryBlock, "mode" | "bento">): string {
  if (g.mode === "bento") return "Bento";
  return MODE_LABEL[g.mode];
}

/** Switch a gallery's layout, keeping its images in order. */
export function applyLayout(blockId: string, pick: LayoutPick) {
  const g = galleryOf(blockId);
  if (!g) return;
  const images = g.items.filter((m): m is Media => !!m);
  if (pick.mode === "bento") {
    const bento = bentoFromPreset(pick.preset ?? "split", g.bento?.stackOnPhone ?? false);
    const items: (Media | null)[] = bento.cells.map((_, i) => images[i] ?? null);
    const extra = images.slice(bento.cells.length);
    run(blockUpdate, { id: blockId, patch: { mode: "bento", bento, items: [...items, ...extra] } });
    if (extra.length) toast(`${plural(extra.length, "image")} don't fit this layout and are hidden. Pick a layout with more cells to show them.`);
  } else {
    run(blockUpdate, { id: blockId, patch: { mode: pick.mode, items: images, ...modeDefaults(pick.mode, g) } });
  }
}

/** Sensible starting values when a gallery takes on a layout (only for settings it hasn't got yet). */
function modeDefaults(mode: GalleryMode, g?: Partial<GalleryBlock>): Partial<GalleryBlock> {
  switch (mode) {
    case "grid":
      return g?.aspect ? {} : { aspect: 4 / 3 };
    case "slideshow":
      return { ...(g?.aspect ? {} : { aspect: 16 / 9 }), ...(g?.interval ? {} : { interval: 4 }) };
    case "ticker":
      return { rowHeight: 220, ...(g?.speed ? {} : { speed: 40 }) };
    case "carousel":
      return { rowHeight: 480 };
    default:
      return {};
  }
}

/** A new gallery with the chosen layout, empty or filled. */
export function insertGallery(pick: LayoutPick, target?: InsertTarget, media: Media[] = []) {
  const block = newBlock("gallery", { mode: pick.mode, items: media });
  if (pick.mode === "bento") {
    block.bento = bentoFromPreset(pick.preset ?? "split");
    block.items = block.bento.cells.map((_, i) => media[i] ?? null);
    if (media.length > block.bento.cells.length) block.items.push(...media.slice(block.bento.cells.length));
  }
  Object.assign(block, modeDefaults(pick.mode, block));
  insertBlocks([block], target, media.length ? `Add ${plural(media.length, "image")}` : "Add gallery");
}

/** Column or row weights, from dragging a divider (records an override on tablet/phone). */
export function setTracks(blockId: string, axis: "cols" | "rows", weights: number[]) {
  setProps(blockId, { bento: { [axis]: weights.map((w) => +w.toFixed(4)) } });
}

export function setBento(blockId: string, patch: Partial<BentoLayout>) {
  setProps(blockId, { bento: patch });
}

/* ── Items ────────────────────────────────────────────────────────────── */

function writeItems(g: GalleryBlock, items: (Media | null)[]) {
  run(blockUpdate, { id: g.id, patch: { items } });
}

export function swapItems(blockId: string, a: number, b: number) {
  const g = galleryOf(blockId);
  if (!g || a === b) return;
  const items = [...g.items];
  if (g.mode === "bento") {
    [items[a], items[b]] = [items[b] ?? null, items[a] ?? null];
  } else {
    const [moved] = items.splice(a, 1);
    items.splice(b, 0, moved);
  }
  writeItems(g, items);
  select([itemSel(blockId, b)]);
}

/** Put images into a gallery starting at a slot; in a bento, later images fill the next empty cells. */
export function placeImages(blockId: string, media: Media[], at?: number): Media[] {
  const g = galleryOf(blockId);
  if (!g) return media;
  const items = [...g.items];
  const rest = [...media];
  if (at !== undefined && rest.length) items[at] = rest.shift()!;
  if (g.mode === "bento" && g.bento) {
    for (let i = 0; i < g.bento.cells.length && rest.length; i++) if (!items[i]) items[i] = rest.shift()!;
  }
  items.push(...rest);
  for (let i = 0; i < items.length; i++) items[i] ??= null;
  writeItems(g, items);
  return [];
}

export function setItem(blockId: string, index: number, media: Media | null) {
  const g = galleryOf(blockId);
  if (!g) return;
  const items = [...g.items];
  items[index] = media;
  writeItems(g, items);
}

export function removeItem(blockId: string, index: number) {
  const g = galleryOf(blockId);
  if (!g) return;
  const items = [...g.items];
  if (g.mode === "bento") items[index] = null;
  else items.splice(index, 1);
  writeItems(g, items);
  select([blockId]);
}

export function setFocal(blockId: string, index: number, focal: { x: number; y: number }) {
  const g = galleryOf(blockId);
  const m = g?.items[index];
  if (!g || !m) return;
  const items = [...g.items];
  items[index] = { ...m, focal: { x: +focal.x.toFixed(3), y: +focal.y.toFixed(3) } };
  // Same merge key as other item edits, so one drag is one undo step.
  run(blockUpdate, { id: blockId, patch: { items } });
}
