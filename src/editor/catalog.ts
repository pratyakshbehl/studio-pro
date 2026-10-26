import { bentoFromPreset, newBlock, newSection, type Block, type BlockType, type GalleryMode, type Section, type SectionLayoutType } from "../model/index.ts";
import type { IconName } from "../ui/icons.tsx";

export interface BlockEntry {
  kind: "block";
  type: BlockType;
  label: string;
  hint: string;
  icon: IconName;
  group: "Text" | "Media" | "Case study" | "Music" | "Details";
  keywords: string;
  make: () => Block;
}

export interface SectionEntry {
  kind: "section";
  type: SectionLayoutType;
  label: string;
  hint: string;
  icon: IconName;
  group: "Sections";
  keywords: string;
  make: () => Section;
}

export type CatalogEntry = BlockEntry | SectionEntry;

const block = (
  type: BlockType,
  label: string,
  hint: string,
  icon: IconName,
  group: BlockEntry["group"],
  keywords = "",
  make: () => Block = () => newBlock(type),
): BlockEntry => ({ kind: "block", type, label, hint, icon, group, keywords, make });

/** A gallery block that starts in a given layout. */
const gallery = (mode: GalleryMode, label: string, hint: string, icon: IconName, keywords: string): BlockEntry =>
  block("gallery", label, hint, icon, "Media", keywords, () => {
    const g = newBlock("gallery", { mode });
    if (mode === "slideshow") Object.assign(g, { aspect: 16 / 9, interval: 4 });
    if (mode === "ticker") Object.assign(g, { rowHeight: 220, speed: 40 });
    if (mode === "carousel") g.rowHeight = 480;
    return g;
  });

const section = (type: SectionLayoutType, label: string, hint: string, icon: IconName, keywords = ""): SectionEntry => ({
  kind: "section",
  type,
  label,
  hint,
  icon,
  group: "Sections",
  keywords,
  make: () => newSection(type, { name: label }),
});

/** What the Insert panel and the + menus offer. Order is the order shown. */
export const CATALOG: CatalogEntry[] = [
  block("heading", "Heading", "A section title", "heading", "Text", "title h1 h2 h3"),
  block("text", "Text", "Paragraphs: the brief, the process, the result", "text", "Text", "paragraph body copy"),
  block("text", "Lede", "A larger opening paragraph", "text", "Text", "intro lead standfirst", () =>
    newBlock("text", { preset: "lede" }),
  ),
  block("quote", "Quote", "A client or collaborator in their words", "quote", "Text", "testimonial"),
  block("image", "Image", "One image, any width up to edge to edge", "image", "Media", "photo render still picture"),
  block("gallery", "Photo grid", "Images keep their shape; rows line up edge to edge", "gallery", "Media", "gallery justified grid photos"),
  block("gallery", "Bento", "Big + small cells you fill with images", "layouts", "Media", "bento mosaic grid layout collage", () => {
    const g = newBlock("gallery", { mode: "bento" });
    g.bento = bentoFromPreset("quad-tall-right");
    g.items = g.bento.cells.map(() => null);
    return g;
  }),
  gallery("carousel", "Carousel", "A row you scroll sideways; every image keeps its shape", "carousel", "slider scroll strip horizontal"),
  gallery("slideshow", "Slideshow", "One image at a time, crossfading", "play", "slides fade autoplay"),
  gallery("ticker", "Ticker", "An endless moving strip of images or logos", "rows", "marquee logos strip loop scrolling"),
  gallery("moodboard", "Moodboard", "An overlapping, tilted collage", "layouts", "collage references inspiration board"),
  block("video", "Video", "A file, or a YouTube or Vimeo link", "video", "Media", "film reel youtube vimeo mp4"),
  block("compare", "Before / after", "A slider between two images", "compare", "Media", "compare breakdown clay render"),
  block("model", "3D model", "A GLB or glTF people can turn and zoom", "model", "Media", "3d glb gltf model viewer object"),
  block("lottie", "Lottie animation", "A Lottie JSON animation", "lottie", "Media", "lottie animation json motion after effects bodymovin"),
  block("embed", "Embed", "Spotify, SoundCloud, Sketchfab, Figma, CodePen…", "embed", "Media", "spotify soundcloud apple music sketchfab 3d figma codepen iframe link podcast"),
  block("layers", "Layer breakdown", "Plate, CG and comp of one frame, scrubbed", "layers", "Case study", "vfx breakdown plate cg comp passes layers wipe"),
  block("turntable", "Turntable", "Drag to turn an object: frames or a video", "turntable", "Case study", "360 spin rotate product orbit"),
  block("stats", "Stat row", "Big numbers: “40 SKUs”, “3 weeks”", "stats", "Case study", "numbers metrics results kpi"),
  block("timeline", "Process timeline", "The steps, in order", "timeline", "Case study", "process steps phases milestones"),
  block("palette", "Colour palette", "Swatches with names and values", "palette", "Case study", "colors colours swatches brand"),
  block("specimen", "Type specimen", "A typeface shown properly", "specimen", "Case study", "font typography typeface"),
  block("prompt", "Prompt card", "For AI work: prompt, model and settings", "prompt", "Case study", "ai midjourney stable diffusion flux prompt seed model"),
  block("credits", "Credits", "Who did what", "credits", "Case study", "team people roles thanks"),
  block("audio", "Audio", "A track with a waveform player and chapters", "audio", "Music", "music mp3 sound song waveform"),
  block("tracklist", "Tracklist", "An EP or album, one track at a time", "tracklist", "Music", "album ep songs playlist"),
  block("embed", "Music embed", "Spotify, Apple Music, SoundCloud, YouTube Music, podcasts", "embed", "Music", "spotify apple music soundcloud podcast bandcamp", () =>
    newBlock("embed", { url: "" }),
  ),
  block("facts", "Facts", "Role, tools, client and year, plus your own rows", "facts", "Details", "credits info meta"),
  block("button", "Button", "A link out: the live site, the film, the store", "button", "Details", "cta link call to action"),
  block("spacer", "Spacer", "Extra room between blocks", "spacer", "Details", "gap space"),
  block("divider", "Divider", "A hairline across the column", "divider", "Details", "line rule hr"),
  section("flow", "Flow section", "Blocks stack in a column", "flow", "column"),
  section("stack", "Stack section", "Blocks side by side, wrapping on small screens", "stack", "row columns side"),
  section("grid", "Grid section", "Blocks in columns you set", "grid", "columns"),
  section("canvas", "Free canvas", "Place, size and layer blocks freely", "canvas", "freeform absolute collage"),
];

export function searchCatalog(query: string, entries = CATALOG): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => `${e.label} ${e.hint} ${e.keywords} ${e.group}`.toLowerCase().includes(q));
}
