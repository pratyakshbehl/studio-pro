import {
  SCHEMA_VERSION,
  type Block,
  type BlockOf,
  type BlockType,
  type ContentWidth,
  type PageChrome,
  type PageStyle,
  type Project,
  type Section,
  type SectionLayout,
  type SectionLayoutType,
} from "./schema.ts";
import { uid } from "./ids.ts";

/** Site defaults: page background #0a0a0a, 16px media radius. */
export const DEFAULT_PAGE_STYLE: PageStyle = {
  bg: "#0a0a0a",
  spacing: 60,
  width: "wide",
  radius: 16,
};

export const DEFAULT_CHROME: PageChrome = { header: true, cover: true, intro: "before", next: true };

/**
 * Where the intro goes for a story that came from elsewhere: after the legacy
 * gallery (the site's own order), hidden when the story already carries its
 * own brief and project facts, otherwise straight after the cover.
 */
export function guessIntro(sections: Section[]): PageChrome["intro"] {
  if (sections.length === 1 && sections[0].name === "Gallery" && sections[0].blocks.every((b) => b.type === "gallery"))
    return "after";
  if (sections.some((s) => s.blocks.some((b) => b.type === "facts" && b.auto))) return "hidden";
  return "before";
}

export function newProject(partial: Partial<Project> = {}, now = new Date().toISOString()): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid(),
    rev: 0,
    createdAt: now,
    updatedAt: now,
    status: "draft",
    slug: "",
    title: "",
    categories: [],
    year: new Date(now).getFullYear(),
    role: [],
    tools: [],
    cover: null,
    gallery: [],
    summary: "",
    description: "",
    featured: false,
    client: "",
    tags: [],
    credits: [],
    facts: [],
    license: "All Rights Reserved",
    cta: { kind: "next" },
    seo: {},
    page: { style: { ...DEFAULT_PAGE_STYLE }, chrome: { ...DEFAULT_CHROME }, sections: [] },
    origin: { source: "new", at: now },
    extra: {},
    ...partial,
  };
}

export function newLayout(type: SectionLayoutType, width: ContentWidth = "wide"): SectionLayout {
  switch (type) {
    case "flow":
      return { type, width, gap: 32, align: "start" };
    case "stack":
      return { type, width, direction: "row", gap: 24, distribute: "start", align: "start", wrap: true };
    case "grid":
      return { type, width, columns: 2, gap: 24, rowGap: 24 };
    case "canvas":
      return { type, width, aspect: 16 / 9 };
  }
}

export function newSection(type: SectionLayoutType = "flow", partial: Partial<Section> = {}): Section {
  return {
    id: uid(),
    name: "Section",
    layout: newLayout(type),
    style: { paddingTop: 0, paddingBottom: 0 },
    blocks: [],
    ...partial,
  };
}

const BLOCK_DEFAULTS: { [T in BlockType]: Omit<BlockOf<T>, "id"> } = {
  heading: { type: "heading", text: "", level: 2 },
  text: { type: "text", html: "", preset: "body" },
  image: { type: "image", media: null, width: "content", fit: "cover", aspect: null },
  video: {
    type: "video",
    source: "file",
    media: null,
    autoplay: true,
    loop: true,
    muted: true,
    controls: false,
    width: "content",
    aspect: 16 / 9,
  },
  gallery: {
    type: "gallery",
    items: [],
    mode: "justified",
    columns: 3,
    gap: 16,
    aspect: null,
    rowHeight: 300,
    width: "content",
  },
  compare: {
    type: "compare",
    before: null,
    after: null,
    beforeLabel: "Before",
    afterLabel: "After",
    start: 50,
    aspect: 16 / 9,
    width: "content",
  },
  embed: { type: "embed", url: "", width: "content" },
  audio: { type: "audio", media: null },
  quote: { type: "quote", text: "" },
  facts: { type: "facts", rows: [], auto: true },
  spacer: { type: "spacer", size: 48 },
  divider: { type: "divider" },
  layers: {
    type: "layers",
    steps: [
      { media: null, label: "Plate" },
      { media: null, label: "CG" },
      { media: null, label: "Comp" },
    ],
    mode: "scrub",
    start: 0,
    aspect: 16 / 9,
    width: "content",
  },
  turntable: { type: "turntable", source: "frames", frames: [], video: null, spin: true, seconds: 8, aspect: 1, width: "content" },
  stats: {
    type: "stats",
    items: [
      { value: "", label: "" },
      { value: "", label: "" },
      { value: "", label: "" },
    ],
  },
  palette: { type: "palette", colors: [], layout: "chips" },
  specimen: { type: "specimen", family: "Jost", google: false, sample: "", weights: [300, 400, 500, 700] },
  prompt: { type: "prompt", prompt: "", model: "", settings: [], media: null },
  timeline: { type: "timeline", steps: [], direction: "vertical" },
  button: { type: "button", label: "", href: "", variant: "solid", newTab: false },
  credits: { type: "credits", rows: [], auto: true },
  tracklist: { type: "tracklist", cover: null, tracks: [] },
  model: { type: "model", media: null, poster: null, autoRotate: true, aspect: 1, width: "content" },
  lottie: { type: "lottie", src: "", loop: true, autoplay: true, aspect: 1, width: "content" },
};

export function newBlock<T extends BlockType>(type: T, partial: Partial<BlockOf<T>> = {}): BlockOf<T> {
  return { ...structuredClone(BLOCK_DEFAULTS[type]), id: uid(), ...partial } as unknown as BlockOf<T>;
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Heading",
  text: "Text",
  image: "Image",
  video: "Video",
  gallery: "Gallery",
  compare: "Before / after",
  embed: "Embed",
  audio: "Audio",
  quote: "Quote",
  facts: "Facts",
  spacer: "Spacer",
  divider: "Divider",
  layers: "Layer breakdown",
  turntable: "Turntable",
  stats: "Stat row",
  palette: "Colour palette",
  specimen: "Type specimen",
  prompt: "Prompt card",
  timeline: "Process timeline",
  button: "Button",
  credits: "Credits",
  tracklist: "Tracklist",
  model: "3D model",
  lottie: "Lottie animation",
};

/** Deep copy with fresh ids, for duplicate and paste. */
export function cloneBlock(block: Block): Block {
  return { ...structuredClone(block), id: uid() };
}

export function cloneSection(section: Section): Section {
  const copy = structuredClone(section);
  return { ...copy, id: uid(), blocks: copy.blocks.map(cloneBlock) };
}
