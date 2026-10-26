/**
 * Studio Pro data model, v1.
 *
 * A project is the site's `Project` (types/project.ts in the 48 copy) plus a
 * `page`: a vertical stack of sections, each holding blocks. Everything is plain
 * JSON so it can be saved to disk, diffed, and replayed through undo patches.
 *
 * Responsive rule: values are authored for desktop. Tablet and phone keep only
 * what differs, in `overrides`, and resolve() cascades desktop → tablet → phone.
 */

export const SCHEMA_VERSION = 3;

export type Breakpoint = "desktop" | "tablet" | "phone";
export type SmallBreakpoint = Exclude<Breakpoint, "desktop">;

/** Matches the site: Tailwind `md` is 768px; desktop starts at 1280. */
export const BREAKPOINTS: Record<Breakpoint, { label: string; min: number; preview: number }> = {
  desktop: { label: "Desktop", min: 1280, preview: 1440 },
  tablet: { label: "Tablet", min: 768, preview: 834 },
  phone: { label: "Phone", min: 0, preview: 390 },
};

/** A sparse patch, deep-merged over the desktop value (see merge.ts). */
export type Patch = Record<string, unknown>;
export type Overrides = Partial<Record<SmallBreakpoint, Patch>>;

export type Status = "draft" | "live" | "unlisted" | "archived";

export interface Media {
  src: string;
  /** "model" is a GLB/glTF file, "lottie" a Lottie animation (JSON or .lottie). */
  type: "image" | "video" | "audio" | "model" | "lottie";
  alt: string;
  poster?: string;
  width?: number;
  height?: number;
  /** 0–1 from the top-left; where cropping keeps the subject. */
  focal?: { x: number; y: number };
  /** Smaller copies (480/960/1600 px wide WebP) for srcset. */
  variants?: { w: number; src: string }[];
}

/** The site's cover shape, kept verbatim so publishing never rewrites it. */
export interface SiteCover {
  src: string;
  type: "image" | "video";
  alt: string;
  poster?: string;
  /** A separate image for the 4:3 spiral showcase; the cover itself when unset. */
  spiral?: string;
  /** Where the 16:9 crop keeps the subject (0–1 from the top-left). */
  focal?: { x: number; y: number };
  /** Same, for the 4:3 crop. */
  spiralFocal?: { x: number; y: number };
  width?: number;
  height?: number;
}

/* ── Page ─────────────────────────────────────────────────────────────── */

/** Content widths for flow sections: Narrow 800 · Text 1040 · Wide 1360 · Full bleed. */
export type ContentWidth = "narrow" | "text" | "wide" | "full";
export const CONTENT_WIDTH_PX: Record<ContentWidth, number | null> = {
  narrow: 800,
  text: 1040,
  wide: 1360,
  full: null,
};

/** How wide a block sits inside a flow section (Behance's "padding to sides" toggle). */
export type BlockWidth = "content" | "wide" | "full";

export interface PageStyle {
  bg: string;
  text?: string;
  /** Space between sections in px. Behance's range: 0–150, default 60. */
  spacing: number;
  width: ContentWidth;
  /** Media corner radius in px. The site uses 16 (rounded-2xl). */
  radius: number;
}

/**
 * The parts of the site's case-study page that come from project details, not
 * from blocks: title header, cover, the intro (description + role/tools) and
 * the next-project footer. `intro` sets where the intro sits relative to the
 * story; stories that already tell the brief themselves hide it.
 */
export interface PageChrome {
  header: boolean;
  cover: boolean;
  intro: "before" | "after" | "hidden";
  next: boolean;
}

export interface Page {
  style: PageStyle;
  chrome: PageChrome;
  sections: Section[];
}

/* ── Sections ─────────────────────────────────────────────────────────── */

export type Align = "start" | "center" | "end";

export type SectionLayout =
  | { type: "flow"; width: ContentWidth; gap: number; align: Align }
  | {
      type: "stack";
      width: ContentWidth;
      direction: "row" | "column";
      gap: number;
      distribute: "start" | "center" | "end" | "space-between";
      align: Align | "stretch";
      wrap: boolean;
    }
  | { type: "grid"; width: ContentWidth; columns: number; gap: number; rowGap: number }
  | {
      type: "canvas";
      width: ContentWidth;
      /** Section width ÷ height. Block frames are percentages of this box. */
      aspect: number;
    };

export type SectionLayoutType = SectionLayout["type"];

export interface SectionStyle {
  paddingTop: number;
  paddingBottom: number;
  bg?: string;
}

export interface Section {
  id: string;
  name: string;
  layout: SectionLayout;
  style: SectionStyle;
  blocks: Block[];
  hidden?: boolean;
  locked?: boolean;
  overrides?: Overrides;
}

/* ── Blocks ───────────────────────────────────────────────────────────── */

/** Free placement inside a canvas section, in % of the section box. */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  z: number;
}

/** Cell span inside a grid section. */
export interface Span {
  col: number;
  row: number;
}

export interface Shadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

export interface Border {
  width: number;
  color: string;
  style: "solid" | "dashed";
}

export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "difference" | "luminosity";

/**
 * Design properties any block can carry (the inspector's Design tab). Every
 * field is optional and can differ per breakpoint through `overrides`.
 */
export interface BlockStyle {
  opacity?: number;
  /** Corner radius for this block's media, overriding the page's. */
  radius?: number;
  bg?: string;
  padding?: number;
  border?: Border;
  shadow?: Shadow;
  blend?: BlendMode;
  /** Caps the block's width inside its column, in px. */
  maxWidth?: number;
  /** Extra space above/below, added to the section's own gap. */
  marginTop?: number;
  marginBottom?: number;
  rotate?: number;
  scale?: number;
}

/** Type overrides for text, heading and quote blocks; unset keeps the preset. */
export interface FontStyle {
  size?: number;
  weight?: number;
  lineHeight?: number;
  /** Letter spacing in em. */
  tracking?: number;
  color?: string;
  transform?: "none" | "uppercase" | "lowercase" | "capitalize";
  italic?: boolean;
}

export type AppearEffect = "fade" | "slide-up" | "slide-left" | "scale" | "blur" | "mask";

/**
 * Motion on the site. Appear and parallax are tied to scroll (CSS
 * scroll-driven animations, no script), hover reacts to the pointer. All of
 * them switch off for visitors who prefer reduced motion.
 */
export interface Effects {
  appear?: AppearEffect;
  /** How much scrolling the appear takes: 0.3 (snappy) to 1 (slow). */
  appearLength?: number;
  hover?: "lift" | "zoom";
  /** −1 to 1: negative moves against the scroll, positive with it. */
  parallax?: number;
}

export type TextPreset = "h1" | "h2" | "h3" | "lede" | "body" | "caption" | "label";
export type TextAlign = "left" | "center" | "right";

interface BlockBase {
  id: string;
  /** Layer name; falls back to the block type's label. */
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  frame?: Frame;
  span?: Span;
  style?: BlockStyle;
  font?: FontStyle;
  effects?: Effects;
  overrides?: Overrides;
}

export interface HeadingBlock extends BlockBase {
  type: "heading";
  text: string;
  level: 1 | 2 | 3;
  align?: TextAlign;
}

export interface TextBlock extends BlockBase {
  type: "text";
  html: string;
  preset: TextPreset;
  align?: TextAlign;
}

export interface ImageBlock extends BlockBase {
  type: "image";
  media: Media | null;
  width: BlockWidth;
  fit: "cover" | "contain";
  /** width ÷ height; null keeps the image's own shape. */
  aspect: number | null;
  caption?: string;
}

export interface VideoBlock extends BlockBase {
  type: "video";
  source: "file" | "embed";
  media: Media | null;
  url?: string;
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  controls: boolean;
  width: BlockWidth;
  aspect: number | null;
  caption?: string;
}

/**
 * Bento: an explicit grid. `cols`/`rows` are relative weights (fr), `aspect`
 * the whole grid's width ÷ height, and `cells[i]` places `items[i]`
 * (0-based start, span). Cells without an item show a drop target.
 */
export interface BentoCell {
  c: number;
  r: number;
  cs: number;
  rs: number;
}

export interface BentoLayout {
  preset?: string;
  cols: number[];
  rows: number[];
  aspect: number;
  cells: BentoCell[];
  /** On phones, show the cells one under another instead of shrinking the grid. */
  stackOnPhone: boolean;
}

/**
 * Multi-image layouts:
 * - justified: Behance's photo grid; shapes kept, every row's edges aligned
 * - bento: explicit cells (see BentoLayout); images crop to fill, with a focal point
 * - grid: equal columns, one shape for all
 * - masonry: columns of natural-height images
 * - carousel: one row at row height, scrolled sideways (shapes kept)
 * - slideshow: one image at a time, crossfading every `interval` seconds
 * - ticker: an endless strip moving at `speed` (logos, stills, frames)
 * - moodboard: an overlapping, slightly tilted collage
 */
export type GalleryMode = "justified" | "bento" | "grid" | "masonry" | "carousel" | "slideshow" | "ticker" | "moodboard";

export interface GalleryBlock extends BlockBase {
  type: "gallery";
  /** In a bento, items[i] fills cells[i]; null keeps a cell empty until you drop an image in. */
  items: (Media | null)[];
  mode: GalleryMode;
  columns: number;
  gap: number;
  aspect: number | null;
  /** Justified target row height in px at a 1440px-wide page; scales with the page. */
  rowHeight: number;
  bento?: BentoLayout;
  /** Slideshow: seconds per image. */
  interval?: number;
  /** Ticker: page px per second at 1440 wide; negative runs right. */
  speed?: number;
  width: BlockWidth;
  caption?: string;
}

export interface CompareBlock extends BlockBase {
  type: "compare";
  before: Media | null;
  after: Media | null;
  beforeLabel: string;
  afterLabel: string;
  /** Starting slider position, 0–100. */
  start: number;
  aspect: number | null;
  width: BlockWidth;
  caption?: string;
}

export interface EmbedBlock extends BlockBase {
  type: "embed";
  /** What the person pasted: a page link or an <iframe> snippet. */
  url: string;
  width: BlockWidth;
  caption?: string;
}

export interface Chapter {
  /** Seconds from the start. */
  time: number;
  label: string;
}

export interface AudioBlock extends BlockBase {
  type: "audio";
  media: Media | null;
  title?: string;
  artist?: string;
  caption?: string;
  cover?: Media | null;
  /** Loudness per slice, 0–1, measured once in the editor so the site never decodes audio. */
  peaks?: number[];
  /** Length in seconds, measured with the peaks. */
  duration?: number;
  chapters?: Chapter[];
}

/* ── Case-study blocks ─────────────────────────────────────────────────── */

/** Plate → CG → comp: the same frame at each stage, scrubbed or tabbed between. */
export interface LayersBlock extends BlockBase {
  type: "layers";
  steps: { media: Media | null; label: string }[];
  mode: "scrub" | "tabs";
  /** The step shown first (and in the editor). */
  start: number;
  aspect: number | null;
  width: BlockWidth;
  caption?: string;
}

/** Drag sideways to turn an object: an image sequence or a video scrubbed by the pointer. */
export interface TurntableBlock extends BlockBase {
  type: "turntable";
  source: "frames" | "video";
  frames: Media[];
  video: Media | null;
  /** Turns by itself until someone drags it. */
  spin: boolean;
  /** Seconds per full turn when spinning. */
  seconds: number;
  aspect: number | null;
  width: BlockWidth;
  caption?: string;
}

export interface StatsBlock extends BlockBase {
  type: "stats";
  items: { value: string; label: string }[];
}

export interface PaletteBlock extends BlockBase {
  type: "palette";
  colors: { hex: string; name: string }[];
  layout: "chips" | "bars";
}

export interface SpecimenBlock extends BlockBase {
  type: "specimen";
  /** Font family name. With `google`, it is loaded from Google Fonts. */
  family: string;
  google: boolean;
  sample: string;
  weights: number[];
  note?: string;
}

/** For AI work: what was asked, of which model, with which settings. */
export interface PromptBlock extends BlockBase {
  type: "prompt";
  prompt: string;
  negative?: string;
  model: string;
  settings: { label: string; value: string }[];
  media: Media | null;
}

export interface TimelineBlock extends BlockBase {
  type: "timeline";
  steps: { label: string; title: string; text: string }[];
  direction: "vertical" | "horizontal";
}

export interface ButtonBlock extends BlockBase {
  type: "button";
  label: string;
  href: string;
  variant: "solid" | "outline" | "link";
  align?: TextAlign;
  newTab: boolean;
}

export interface CreditsBlock extends BlockBase {
  type: "credits";
  title?: string;
  rows: Credit[];
  /** Also list the project's own credits. */
  auto: boolean;
}

export interface Track {
  title: string;
  media: Media | null;
  duration?: number;
  peaks?: number[];
}

export interface TracklistBlock extends BlockBase {
  type: "tracklist";
  title?: string;
  artist?: string;
  cover: Media | null;
  tracks: Track[];
}

/** A GLB/glTF model people can turn and zoom (model-viewer). */
export interface ModelBlock extends BlockBase {
  type: "model";
  media: Media | null;
  poster: Media | null;
  autoRotate: boolean;
  bg?: string;
  aspect: number | null;
  width: BlockWidth;
  caption?: string;
}

export interface LottieBlock extends BlockBase {
  type: "lottie";
  /** An uploaded .json/.lottie, or a link to one. */
  src: string;
  loop: boolean;
  autoplay: boolean;
  aspect: number | null;
  width: BlockWidth;
  caption?: string;
}

export interface QuoteBlock extends BlockBase {
  type: "quote";
  text: string;
  cite?: string;
}

export interface FactsBlock extends BlockBase {
  type: "facts";
  rows: { label: string; value: string }[];
  /** Also list the project's role, tools, client and year. */
  auto: boolean;
}

export interface SpacerBlock extends BlockBase {
  type: "spacer";
  size: number;
}

export interface DividerBlock extends BlockBase {
  type: "divider";
}

export type Block =
  | HeadingBlock
  | TextBlock
  | ImageBlock
  | VideoBlock
  | GalleryBlock
  | CompareBlock
  | EmbedBlock
  | AudioBlock
  | QuoteBlock
  | FactsBlock
  | SpacerBlock
  | DividerBlock
  | LayersBlock
  | TurntableBlock
  | StatsBlock
  | PaletteBlock
  | SpecimenBlock
  | PromptBlock
  | TimelineBlock
  | ButtonBlock
  | CreditsBlock
  | TracklistBlock
  | ModelBlock
  | LottieBlock;

export type BlockType = Block["type"];
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

export const BLOCK_TYPES: BlockType[] = [
  "heading",
  "text",
  "image",
  "video",
  "gallery",
  "compare",
  "embed",
  "audio",
  "quote",
  "facts",
  "spacer",
  "divider",
  "layers",
  "turntable",
  "stats",
  "palette",
  "specimen",
  "prompt",
  "timeline",
  "button",
  "credits",
  "tracklist",
  "model",
  "lottie",
];

/* ── Project ──────────────────────────────────────────────────────────── */

export interface Credit {
  name: string;
  role: string;
}

export interface Cta {
  kind: "contact" | "hire" | "link" | "next" | "none";
  label?: string;
  href?: string;
}

export interface Soundtrack {
  src: string;
  title?: string;
  volume: number;
}

export interface ImportOrigin {
  source: "site" | "studio" | "studio-framer" | "new";
  ref?: string;
  at: string;
}

export interface Project {
  schemaVersion: number;
  id: string;
  /** Bumped by the server on every save; a stale rev is rejected (409). */
  rev: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  status: Status;

  /* Site fields (types/project.ts), round-tripped verbatim. */
  slug: string;
  title: string;
  /** First entry is the site's `category`. Up to 3. */
  categories: string[];
  year: number;
  role: string[];
  tools: string[];
  cover: SiteCover | null;
  gallery: Media[];
  summary: string;
  description: string;
  featured: boolean;
  /** Kept in the site's own format (`"230 75% 55%"` or a hex). */
  accent?: string;

  /* Studio fields. */
  client: string;
  tags: string[];
  credits: Credit[];
  facts: { label: string; value: string }[];
  license: string;
  cta: Cta;
  seo: { title?: string; description?: string; image?: string };
  soundtrack?: Soundtrack;
  page: Page;
  origin: ImportOrigin;
  /** Site keys Studio doesn't model, preserved so publishing never drops them. */
  extra: Record<string, unknown>;
}

export const LIMITS = { tags: 10, categories: 3, summary: 160, spacingMax: 150 } as const;
