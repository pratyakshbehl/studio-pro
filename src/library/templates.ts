/**
 * Whole-project templates (SPEC §3.4): a realistic case-study skeleton with
 * prompts where the words go and empty slots where the images go. Built from
 * the section presets so a template and the Sections library always agree.
 */
import { DEFAULT_CHROME, DEFAULT_PAGE_STYLE, newBlock, newSection, type Page, type PageChrome, type Project, type Section } from "../model/index.ts";
import { presetById } from "./sections.ts";

export interface Template {
  id: string;
  label: string;
  hint: string;
  /** Suggested first category on the site. */
  category?: string;
  chrome?: Partial<PageChrome>;
  sections: () => Section[];
}

const p = (html: string) => `<p>${html}</p>`;

/** A preset, optionally renamed for this template. */
function use(id: string, name?: string): Section {
  const s = presetById(id)!.make();
  return name ? { ...s, name } : s;
}

/** Just the image layout from a media preset, to put under a heading. */
const layoutOf = (id: string) => use(id).blocks[0];

/** A flow section with a heading and whatever follows. */
function titled(name: string, title: string, ...blocks: Section["blocks"]): Section {
  return newSection("flow", { name, blocks: [newBlock("heading", { text: title }), ...blocks] });
}

const factsRows = (rows: [string, string][]) => newBlock("facts", { rows: rows.map(([label, value]) => ({ label, value })), auto: true });

export const TEMPLATES: Template[] = [
  {
    id: "classic",
    label: "Classic case study",
    hint: "Hero, brief, role and tools, process, outcome, credits",
    sections: () => [use("hero-media"), use("text-two-col", "Brief"), use("text-steps"), use("media-big-two", "Work"), use("cs-results", "Outcome"), use("cs-facts-credits")],
  },
  {
    id: "product-viz",
    label: "Product viz / CGI",
    hint: "Hero render, range lineup, materials, details, turntable, specs",
    category: "Product Viz",
    sections: () => [
      use("hero-media"),
      use("text-lede"),
      titled("Range", "The range", newBlock("gallery", { mode: "justified" })),
      titled("Materials", "Materials", newBlock("compare", { beforeLabel: "Clay", afterLabel: "Final" })),
      use("media-grid4", "Details"),
      use("cs-turntable"),
      titled("Specs", "Specs", factsRows([["SKUs", "How many products"], ["Renderer", "Cycles, Redshift, Octane…"], ["Delivery", "Sizes and formats"]])),
    ],
  },
  {
    id: "vfx",
    label: "VFX breakdown",
    hint: "Final shot, layer breakdown, before and after, shot list, tools",
    category: "VFX",
    sections: () => [
      use("hero-video", "Final shot"),
      use("text-lede"),
      use("cs-breakdown"),
      titled("Before and after", "Before and after", newBlock("compare", { beforeLabel: "Plate", afterLabel: "Final" }), newBlock("gallery", { mode: "slideshow", aspect: 16 / 9, interval: 4 })),
      titled("Shot list", "Shot list", factsRows([["Shots", "How many, and how long"], ["Plates", "Camera and format"], ["Pipeline", "Houdini, Nuke, Unreal…"]])),
      use("cs-facts-credits"),
    ],
  },
  {
    id: "motion",
    label: "Motion / animation",
    hint: "Hero video, styleframes, storyboard strip, process, soundtrack",
    category: "Motion",
    sections: () => [
      use("hero-video"),
      use("text-lede"),
      titled("Styleframes", "Styleframes", newBlock("gallery", { mode: "grid", columns: 3, aspect: 16 / 9 })),
      titled("Storyboard", "Storyboard", newBlock("gallery", { mode: "carousel", rowHeight: 320 })),
      use("text-steps"),
      use("music-player", "Soundtrack"),
    ],
  },
  {
    id: "brand",
    label: "Brand identity",
    hint: "Logo hero, concept, palette, type, applications, mockups",
    category: "Branding",
    sections: () => [
      use("hero-type", "Logo"),
      newSection("flow", { name: "Mark", blocks: [newBlock("image", { aspect: 16 / 9, fit: "contain" })] }),
      use("text-two-col", "Concept"),
      use("cs-identity"),
      titled("Applications", "In use", layoutOf("media-big-two")),
      use("media-carousel", "Mockups"),
    ],
  },
  {
    id: "packaging",
    label: "Packaging",
    hint: "Hero pack, range, dieline and materials, shelf lineup, credits",
    category: "Packaging",
    sections: () => [
      use("hero-media"),
      use("text-lede"),
      titled("Range", "The range", newBlock("gallery", { mode: "justified" })),
      titled("Dieline", "Dieline and materials", layoutOf("media-pair")),
      newSection("flow", { name: "Shelf", blocks: [newBlock("image", { width: "full", aspect: 21 / 9, caption: "Where it lives: the shelf, the store, the hand." })] }),
      use("cs-facts-credits"),
    ],
  },
  {
    id: "event",
    label: "Event / spatial viz",
    hint: "Wide hero, walkthrough, plan vs render, moments",
    category: "Spatial",
    sections: () => [
      use("hero-media"),
      use("text-lede"),
      titled("Walkthrough", "Walk through it", newBlock("video", { width: "wide", aspect: 16 / 9, autoplay: false, controls: true, muted: false })),
      titled("Plan and render", "From plan to render", newBlock("compare", { beforeLabel: "Plan", afterLabel: "Render" })),
      titled("Moments", "Moments", newBlock("gallery", { mode: "justified" })),
      use("cs-facts-credits"),
    ],
  },
  {
    id: "ai-series",
    label: "AI exploration series",
    hint: "Statement, prompt cards, the series, process notes, models used",
    category: "AI",
    sections: () => [
      use("hero-type", "Statement"),
      use("cs-prompt", "Prompts"),
      titled("Series", "The series", newBlock("gallery", { mode: "masonry", columns: 3 })),
      newSection("flow", { name: "Process notes", blocks: [newBlock("text", { html: `<h3>Process notes</h3>${p("What you were exploring, what surprised you, and what you threw away.")}` })] }),
      titled("Models", "Models used", factsRows([["Models", "Flux, Midjourney, SDXL…"], ["Tools", "ComfyUI, upscalers, retouch"], ["Time", "How long the series took"]])),
    ],
  },
  {
    id: "music-release",
    label: "Music release",
    hint: "Cover art, player with waveform, tracklist, streaming, credits",
    category: "Music",
    chrome: { cover: false },
    sections: () => [
      newSection("grid", {
        name: "Release",
        layout: { type: "grid", width: "wide", columns: 2, gap: 40, rowGap: 24 },
        blocks: [newBlock("image", { aspect: 1 }), newBlock("text", { html: p("Release date, label, and the story behind the record in two or three sentences."), preset: "lede" })],
      }),
      use("music-player"),
      newSection("flow", { name: "Tracklist", blocks: [newBlock("tracklist", { title: "Tracklist" })] }),
      use("music-listen", "Streaming"),
      newSection("flow", { name: "Credits", blocks: [newBlock("credits", { title: "Credits", rows: [{ role: "Written by", name: "" }, { role: "Produced by", name: "" }, { role: "Artwork", name: "" }] })] }),
    ],
  },
  {
    id: "long-read",
    label: "Long read",
    hint: "Text first, with pull quotes and figures",
    sections: () => [
      newSection("flow", {
        name: "Essay",
        layout: { type: "flow", width: "text", gap: 32, align: "start" },
        blocks: [
          newBlock("text", { html: p("Open with the moment that started it: a question, a problem, a scene."), preset: "lede" }),
          newBlock("text", { html: p("Set up the stakes. Who was it for, what was at risk, what did you know going in?") + p("Keep paragraphs short; one idea each.") }),
          newBlock("quote", { text: "Pull out the sentence a skimmer should not miss.", cite: "" }),
          newBlock("image", { width: "wide", aspect: 3 / 2, caption: "Figure 1. Say what to look at in the picture." }),
          newBlock("text", { html: p("The turn: what changed your mind, and what you did about it.") }),
          newBlock("text", { html: `<h3>What it led to</h3>${p("Results, and what you'd tell someone starting the same thing.")}` }),
        ],
      }),
    ],
  },
  {
    id: "quick-shot",
    label: "Quick shot",
    hint: "One hero and three images, for small pieces",
    chrome: { intro: "hidden" },
    sections: () => [use("hero-media"), use("media-three", "Images"), newSection("flow", { name: "Note", blocks: [newBlock("text", { html: p("One line: what it is and who it was for."), preset: "caption" })] })],
  },
  {
    id: "blank",
    label: "Blank",
    hint: "Just the title, cover and intro",
    sections: () => [],
  },
];

/** The starting fields for a new project made from a template. */
export function fromTemplate(t: Template, title: string): Partial<Project> {
  const page: Page = {
    style: { ...DEFAULT_PAGE_STYLE },
    chrome: { ...DEFAULT_CHROME, ...t.chrome },
    sections: t.sections(),
  };
  return { title, page, ...(t.category ? { categories: [t.category] } : null) };
}
