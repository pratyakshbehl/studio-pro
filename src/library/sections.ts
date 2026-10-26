/**
 * Section presets: ready-made parts of a case study. Words are prompts that
 * say what to write there (never lorem ipsum), images are empty slots to drop
 * into. Every call to `make` returns fresh ids.
 */
import { bentoFromPreset, newBlock, newLayout, newSection, type Block, type GalleryMode, type Section, type SectionLayoutType } from "../model/index.ts";

export type PresetGroup = "Heroes" | "Text" | "Media" | "Case study" | "Music" | "Closing";
export const PRESET_GROUPS: PresetGroup[] = ["Heroes", "Text", "Media", "Case study", "Music", "Closing"];

export interface SectionPreset {
  id: string;
  label: string;
  hint: string;
  group: PresetGroup;
  make: () => Section;
}

const p = (html: string) => `<p>${html}</p>`;
const heading = (text: string, level: 1 | 2 | 3 = 2) => newBlock("heading", { text, level });
const text = (html: string, preset: "lede" | "body" | "caption" = "body") => newBlock("text", { html, preset });
const bento = (preset: string) => {
  const g = newBlock("gallery", { mode: "bento" });
  g.bento = bentoFromPreset(preset);
  g.items = g.bento.cells.map(() => null);
  return g;
};
const gallery = (mode: GalleryMode, extra: Record<string, unknown> = {}) => newBlock("gallery", { mode, ...extra });

function section(name: string, blocks: Block[], type: SectionLayoutType = "flow", layout: Record<string, unknown> = {}): Section {
  return newSection(type, { name, blocks, layout: { ...newLayout(type), ...layout } as Section["layout"] });
}

export const SECTION_PRESETS: SectionPreset[] = [
  /* Heroes */
  {
    id: "hero-media",
    label: "Full-bleed image",
    hint: "One image edge to edge, letterbox shape",
    group: "Heroes",
    make: () => section("Hero", [newBlock("image", { width: "full", aspect: 21 / 9 })], "flow", { width: "full" }),
  },
  {
    id: "hero-title-over",
    label: "Title over image",
    hint: "A big line set on top of the hero",
    group: "Heroes",
    make: () =>
      section(
        "Hero",
        [
          newBlock("image", { frame: { x: 0, y: 0, w: 100, h: 100, rotation: 0, z: 0 } }),
          newBlock("heading", {
            text: "Say what it achieved, in six words or fewer",
            level: 1,
            frame: { x: 5, y: 62, w: 58, h: 28, rotation: 0, z: 1 },
            font: { color: "#f2ede4" },
          }),
        ],
        "canvas",
        { width: "full", aspect: 16 / 9 },
      ),
  },
  {
    id: "hero-split",
    label: "Words and image",
    hint: "The pitch on the left, the picture on the right",
    group: "Heroes",
    make: () =>
      section(
        "Hero",
        [
          text(p("One or two sentences a stranger would understand: what this is, who it was for, and the result."), "lede"),
          newBlock("image", { aspect: 4 / 5 }),
        ],
        "grid",
        { columns: 2, gap: 40 },
      ),
  },
  {
    id: "hero-video",
    label: "Video hero",
    hint: "A silent loop, edge to edge",
    group: "Heroes",
    make: () => section("Hero", [newBlock("video", { width: "full", aspect: 16 / 9 })], "flow", { width: "full" }),
  },
  {
    id: "hero-type",
    label: "Type only",
    hint: "A statement, no picture",
    group: "Heroes",
    make: () =>
      section("Statement", [
        heading("The one sentence you want people to remember", 1),
        text(p("Follow it with the context: the client, the year, your role."), "lede"),
      ]),
  },

  /* Text */
  {
    id: "text-lede",
    label: "Opening paragraph",
    hint: "A larger first paragraph",
    group: "Text",
    make: () => section("Intro", [text(p("Start with the problem, not the process: what did the client need, and what made it hard?"), "lede")]),
  },
  {
    id: "text-two-col",
    label: "Brief and approach",
    hint: "Two columns side by side",
    group: "Text",
    make: () =>
      section(
        "Brief",
        [
          text(`<h3>The brief</h3>${p("What was asked for, by whom, and by when. Mention the constraint that shaped everything.")}`),
          text(`<h3>The approach</h3>${p("The decision that made the difference, and why you made it.")}`),
        ],
        "grid",
        { columns: 2, gap: 48 },
      ),
  },
  {
    id: "text-quote",
    label: "Pull quote",
    hint: "The client in their own words",
    group: "Text",
    make: () => section("Quote", [newBlock("quote", { text: "Paste the line from the client or a collaborator that sums the project up.", cite: "Name, role, company" })]),
  },
  {
    id: "text-steps",
    label: "Numbered steps",
    hint: "How it came together, step by step",
    group: "Text",
    make: () =>
      section("Process", [
        heading("How it came together"),
        newBlock("timeline", {
          steps: [
            { label: "01", title: "Reference and blockout", text: "What you gathered, and the first rough version you tested." },
            { label: "02", title: "Look development", text: "Materials, light and the choices you threw away." },
            { label: "03", title: "Final and delivery", text: "Formats, sizes and where it ran." },
          ],
        }),
      ]),
  },

  /* Media */
  { id: "media-wide", label: "Wide image", hint: "One image, wider than the text", group: "Media", make: () => section("Image", [newBlock("image", { width: "wide", aspect: 16 / 9 })]) },
  { id: "media-pair", label: "Pair", hint: "Two images, equal", group: "Media", make: () => section("Pair", [bento("split")]) },
  { id: "media-pair-big", label: "Pair, one larger", hint: "Two images, 2 : 1", group: "Media", make: () => section("Pair", [bento("split-2-1")]) },
  { id: "media-three", label: "Triptych", hint: "Three equal images", group: "Media", make: () => section("Triptych", [bento("three")]) },
  { id: "media-big-two", label: "Big and two", hint: "A hero image and two details", group: "Media", make: () => section("Details", [bento("big-left")]) },
  { id: "media-grid4", label: "2 × 2", hint: "Four equal images", group: "Media", make: () => section("Grid", [bento("grid-2x2")]) },
  { id: "media-photo-grid", label: "Photo grid", hint: "Any number; every image keeps its shape", group: "Media", make: () => section("Gallery", [gallery("justified")]) },
  { id: "media-carousel", label: "Carousel", hint: "A row to scroll sideways", group: "Media", make: () => section("Carousel", [gallery("carousel", { rowHeight: 480, width: "wide" })]) },
  { id: "media-slideshow", label: "Slideshow", hint: "One at a time, crossfading", group: "Media", make: () => section("Slideshow", [gallery("slideshow", { aspect: 16 / 9, interval: 4, width: "wide" })]) },
  { id: "media-ticker", label: "Ticker strip", hint: "Logos or frames, moving endlessly", group: "Media", make: () => section("Strip", [gallery("ticker", { rowHeight: 180, speed: 40, width: "full" })], "flow", { width: "full" }) },
  { id: "media-moodboard", label: "Moodboard", hint: "References, collaged", group: "Media", make: () => section("References", [heading("References"), gallery("moodboard")]) },

  /* Case study */
  {
    id: "cs-before-after",
    label: "Before / after",
    hint: "A slider between two states",
    group: "Case study",
    make: () => section("Before and after", [heading("Before and after"), newBlock("compare", { beforeLabel: "Before", afterLabel: "After" })]),
  },
  {
    id: "cs-breakdown",
    label: "Shot breakdown",
    hint: "Plate, CG and comp of one frame",
    group: "Case study",
    make: () =>
      section("Breakdown", [
        heading("Shot breakdown"),
        text(p("Name the shot and the one problem it had to solve."), "caption"),
        newBlock("layers"),
      ]),
  },
  {
    id: "cs-results",
    label: "Results",
    hint: "Three numbers that prove it worked",
    group: "Case study",
    make: () =>
      section("Results", [
        heading("Results"),
        newBlock("stats", {
          items: [
            { value: "00", label: "what you made" },
            { value: "00", label: "how fast" },
            { value: "00", label: "what it changed" },
          ],
        }),
      ]),
  },
  {
    id: "cs-identity",
    label: "Colour and type",
    hint: "Palette and typeface",
    group: "Case study",
    make: () =>
      section("Identity", [
        heading("Colour and type"),
        newBlock("palette", { colors: [{ hex: "#0a0a0a", name: "Primary" }, { hex: "#f2ede4", name: "Ground" }, { hex: "#f0552a", name: "Accent" }] }),
        newBlock("specimen", { family: "Jost", sample: "Write a line in the brand's own voice." }),
      ]),
  },
  {
    id: "cs-turntable",
    label: "Turntable",
    hint: "Drag to turn the product",
    group: "Case study",
    make: () => section("Turntable", [heading("All the way round"), newBlock("turntable")]),
  },
  {
    id: "cs-prompt",
    label: "How it was made (AI)",
    hint: "Prompt, model and settings next to the result",
    group: "Case study",
    make: () => section("Method", [heading("How it was made"), newBlock("prompt")]),
  },
  {
    id: "cs-facts-credits",
    label: "Facts and credits",
    hint: "Role, tools, year and who else was on it",
    group: "Case study",
    make: () => section("Credits", [newBlock("facts"), newBlock("credits", { title: "Credits" })], "grid", { columns: 2, gap: 48 }),
  },

  /* Music */
  {
    id: "music-player",
    label: "Track with waveform",
    hint: "One track, cover, chapters",
    group: "Music",
    make: () => section("Listen", [newBlock("audio", { title: "Track title", artist: "Artist" })]),
  },
  {
    id: "music-release",
    label: "Release",
    hint: "Cover, tracklist, streaming link",
    group: "Music",
    make: () => section("Release", [newBlock("tracklist", { title: "Release title", artist: "Artist" }), newBlock("embed", { url: "" })]),
  },
  {
    id: "music-listen",
    label: "Listen on",
    hint: "Spotify and Apple Music players",
    group: "Music",
    make: () => section("Listen on", [heading("Listen"), newBlock("embed", { url: "" }), newBlock("embed", { url: "" })], "grid", { columns: 2, gap: 24 }),
  },

  /* Closing */
  {
    id: "close-cta",
    label: "Get in touch",
    hint: "An invitation and a button",
    group: "Closing",
    make: () =>
      section("Contact", [
        heading("Got something like this in mind?"),
        text(p("Say who you'd like to hear from and what you can take on next."), "lede"),
        newBlock("button", { label: "Get in touch", href: "mailto:", variant: "solid" }),
      ]),
  },
  {
    id: "close-reflection",
    label: "What I learned",
    hint: "A closing reflection",
    group: "Closing",
    make: () => section("Reflection", [heading("What I'd keep"), text(p("One thing that worked and you'll reuse, and one thing you'd do differently next time."), "lede")]),
  },
];

export const presetById = (id: string) => SECTION_PRESETS.find((x) => x.id === id);
