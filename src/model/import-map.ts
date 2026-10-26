/**
 * Turns the three existing sources into Studio Pro projects:
 *   - the site's data/projects.json (48 copy): the published truth
 *   - PORTFOLIO/studio (Behance-style): stories built from blocks, drafts
 *   - PORTFOLIO/studio-framer: CMS copies, drafts
 *
 * Pure: the server reads the files and copies media; this decides what goes where.
 * Rules: site details win; a studio's story fills the page; any studio version
 * that differs from what was kept is saved as a snapshot, so nothing is lost.
 */
import type {
  Block,
  BlockWidth,
  ContentWidth,
  Media,
  Page,
  PageStyle,
  Project,
  Section,
  SiteCover,
  Status,
  TextAlign,
} from "./schema.ts";
import { DEFAULT_CHROME, DEFAULT_PAGE_STYLE, guessIntro, newBlock, newProject, newSection } from "./factories.ts";
import { isPlainObject, deepEqual } from "./merge.ts";
import { slugify, uid, uniqueSlug } from "./ids.ts";

type Loose = Record<string, unknown>;

const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Loose => (isPlainObject(v) ? v : {});
const strings = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === "string");

/** Keys of the site's Project type that Studio models directly. */
export const SITE_KEYS = [
  "slug",
  "title",
  "category",
  "year",
  "role",
  "tools",
  "cover",
  "gallery",
  "summary",
  "description",
  "featured",
  "accent",
] as const;

/* ── Media paths ──────────────────────────────────────────────────────── */

/** Old Behance studio: "/site/x" is the site's public folder, "/media/x" its own uploads. */
export const BEHANCE_MEDIA_PREFIX = "/media/imported/studio/";

export function mapBehanceSrc(src: string, used?: Set<string>): string {
  if (!src) return "";
  if (src.startsWith("/site/")) return src.slice("/site".length);
  if (src.startsWith("/media/")) {
    const file = src.slice("/media/".length);
    used?.add(file);
    return BEHANCE_MEDIA_PREFIX + file;
  }
  return src;
}

function media(src: string, type: Media["type"], extra: Partial<Media> = {}): Media | null {
  if (!src) return null;
  const m: Media = { src, type, alt: str(extra.alt) };
  if (extra.poster) m.poster = extra.poster;
  if (extra.width) m.width = extra.width;
  if (extra.height) m.height = extra.height;
  return m;
}

function siteMedia(v: unknown): Media | null {
  const m = obj(v);
  const src = str(m.src);
  if (!src) return null;
  const type = m.type === "video" ? "video" : "image";
  return media(src, type, {
    alt: str(m.alt),
    poster: str(m.poster) || undefined,
    width: num(m.width, 0) || undefined,
    height: num(m.height, 0) || undefined,
  });
}

/* ── Widths & shapes ──────────────────────────────────────────────────── */

const BLOCK_WIDTH: Record<string, BlockWidth> = {
  contained: "content",
  inset: "content",
  content: "content",
  wide: "wide",
  full: "full",
};
const blockWidth = (v: unknown): BlockWidth => BLOCK_WIDTH[str(v)] ?? "content";

const PAGE_WIDTH: Record<string, ContentWidth> = { contained: "text", narrow: "narrow", wide: "wide", full: "full" };

const GAP: Record<string, number> = { none: 0, tight: 8, normal: 24, loose: 48 };
const SPACER: Record<string, number> = { s: 24, m: 48, l: 96, xl: 144 };

function aspectOf(w: unknown, h: unknown): number | null {
  const W = num(w, 0);
  const H = num(h, 0);
  return W > 0 && H > 0 ? W / H : null;
}

function aspectName(v: unknown): number | null {
  const s = str(v);
  if (!s || s === "natural") return null;
  if (s === "square") return 1;
  const m = /^(\d+(?:\.\d+)?)[:/x](\d+(?:\.\d+)?)$/.exec(s);
  return m ? Number(m[1]) / Number(m[2]) : null;
}

const align = (v: unknown): TextAlign | undefined =>
  v === "center" || v === "right" ? v : v === "left" ? "left" : undefined;

/* ── Story builder ────────────────────────────────────────────────────── */

/** Collects blocks into sections; a titled break starts a new section. */
class StoryBuilder {
  sections: Section[] = [];
  private current: Section | null = null;
  private width: ContentWidth;
  constructor(width: ContentWidth) {
    this.width = width;
  }

  open(name: string): Section {
    this.current = newSection("flow", { name });
    this.current.layout = { type: "flow", width: this.width, gap: 32, align: "start" };
    this.sections.push(this.current);
    return this.current;
  }

  add(block: Block | null): void {
    if (!block) return;
    (this.current ?? this.open("Story")).blocks.push(block);
  }
}

/** Mirrors the old renderers: a block with nothing in it never showed on the page. */
export function blockHasContent(b: Block): boolean {
  switch (b.type) {
    case "heading":
    case "quote":
      return !!b.text.trim();
    case "text":
      return !!b.html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    case "image":
      return !!b.media?.src;
    case "video":
      return b.source === "embed" ? !!b.url?.trim() : !!b.media?.src;
    case "gallery":
      return b.items.length > 0;
    case "compare":
      return !!(b.before?.src && b.after?.src);
    case "embed":
      return !!b.url.trim();
    case "audio":
      return !!b.media?.src;
    case "facts":
    case "spacer":
    case "divider":
    case "credits":
      return true;
    case "layers":
      return b.steps.some((s) => s.media?.src);
    case "turntable":
      return b.source === "video" ? !!b.video?.src : b.frames.length > 0;
    case "stats":
      return b.items.some((i) => i.value.trim());
    case "palette":
      return b.colors.length > 0;
    case "specimen":
      return !!b.family.trim();
    case "prompt":
      return !!b.prompt.trim();
    case "timeline":
      return b.steps.length > 0;
    case "button":
      return !!(b.label.trim() && b.href.trim());
    case "tracklist":
      return b.tracks.some((t) => t.media?.src);
    case "model":
      return !!b.media?.src;
    case "lottie":
      return !!b.src.trim();
  }
}

export interface StoryResult {
  sections: Section[];
  dropped: number;
  duplicateFacts: number;
}

/** Drop empty placeholders and repeated auto-facts; drop sections left empty. */
function tidy(sections: Section[]): StoryResult {
  let dropped = 0;
  let duplicateFacts = 0;
  let sawAutoFacts = false;
  for (const s of sections) {
    s.blocks = s.blocks.filter((b) => {
      if (!blockHasContent(b)) {
        dropped++;
        return false;
      }
      if (b.type === "facts" && b.auto && b.rows.length === 0) {
        if (sawAutoFacts) {
          duplicateFacts++;
          return false;
        }
        sawAutoFacts = true;
      }
      return true;
    });
  }
  // Sections left with nothing but spacing go too.
  const kept = sections.filter((s) => s.blocks.some((b) => b.type !== "spacer" && b.type !== "divider"));
  return { sections: kept, dropped, duplicateFacts };
}

/** PORTFOLIO/studio block list → sections. */
export function behanceStory(blocks: unknown[], width: ContentWidth, used?: Set<string>): StoryResult {
  const story = new StoryBuilder(width);
  const src = (v: unknown) => mapBehanceSrc(str(v), used);
  for (const raw of blocks) {
    const b = obj(raw);
    switch (b.type) {
      case "section": {
        const title = str(b.title);
        story.open(title || "Section");
        story.add(newBlock("heading", { text: title, level: 2 }));
        if (str(b.intro).trim()) story.add(newBlock("text", { html: `<p>${str(b.intro)}</p>`, preset: "lede" }));
        break;
      }
      case "text":
        story.add(
          newBlock("text", { html: str(b.html), preset: b.size === "lead" ? "lede" : "body", align: align(b.align) }),
        );
        break;
      case "image":
        story.add(
          newBlock("image", {
            media: media(src(b.src), "image", { alt: str(b.alt) }),
            width: blockWidth(b.width),
            caption: str(b.caption) || undefined,
          }),
        );
        break;
      case "video": {
        const file = src(b.src);
        const url = str(b.url);
        story.add(
          newBlock("video", {
            source: !file && url ? "embed" : "file",
            media: media(file, "video", { poster: src(b.poster) || undefined, width: num(b.w, 0), height: num(b.h, 0) }),
            url: url || undefined,
            loop: bool(b.loop, true),
            autoplay: bool(b.autoplay, true),
            width: blockWidth(b.width),
            aspect: aspectOf(b.w, b.h) ?? 16 / 9,
          }),
        );
        break;
      }
      case "grid":
        story.add(
          newBlock("gallery", {
            mode: "grid",
            items: list(b.items)
              .map((it) => {
                const i = obj(it);
                return media(src(i.src), "image", { alt: str(i.alt), width: num(i.w, 0), height: num(i.h, 0) });
              })
              .filter((m): m is Media => !!m),
            columns: num(b.cols, 2),
            gap: GAP[str(b.gap)] ?? 24,
            aspect: aspectName(b.aspect),
          }),
        );
        break;
      case "compare":
        story.add(
          newBlock("compare", {
            before: media(src(b.before), "image"),
            after: media(src(b.after), "image"),
            beforeLabel: str(b.beforeLabel, "Before"),
            afterLabel: str(b.afterLabel, "After"),
            start: num(b.start, 50),
            aspect: aspectOf(b.w, b.h) ?? 16 / 9,
          }),
        );
        break;
      case "facts":
        story.add(
          newBlock("facts", {
            rows: list(b.rows).map((r) => ({ label: str(obj(r).label), value: str(obj(r).value) })),
            auto: true,
          }),
        );
        break;
      case "spacer":
        story.add(b.line ? newBlock("divider") : newBlock("spacer", { size: SPACER[str(b.size)] ?? 48 }));
        break;
      case "quote":
        story.add(newBlock("quote", { text: str(b.text), cite: str(b.cite) || undefined }));
        break;
    }
  }
  return tidy(story.sections);
}

/** Site / studio-framer block list (types/project.ts `Block`) → sections. */
export function siteStory(blocks: unknown[], width: ContentWidth): StoryResult {
  const story = new StoryBuilder(width);
  for (const raw of blocks) {
    const b = obj(raw);
    switch (b.type) {
      case "heading":
        story.open(str(b.text) || "Section");
        story.add(newBlock("heading", { text: str(b.text), level: 2 }));
        break;
      case "text":
        story.add(newBlock("text", { html: str(b.html), preset: "body" }));
        break;
      case "image":
        story.add(
          newBlock("image", { media: siteMedia(b.media), width: blockWidth(b.layout), caption: str(b.caption) || undefined }),
        );
        break;
      case "pair":
      case "gallery": {
        const items = list(b.items)
          .map(siteMedia)
          .filter((m): m is Media => !!m);
        story.add(
          newBlock("gallery", {
            mode: "grid",
            items,
            columns: b.type === "pair" ? 2 : num(b.columns, 2),
            caption: str(b.caption) || undefined,
          }),
        );
        break;
      }
      case "video":
        story.add(
          newBlock("video", {
            source: b.source === "embed" ? "embed" : "file",
            media: siteMedia(b.media),
            url: str(b.url) || undefined,
            autoplay: bool(b.autoplay, true),
            width: blockWidth(b.layout),
            caption: str(b.caption) || undefined,
          }),
        );
        break;
      case "compare":
        story.add(
          newBlock("compare", {
            before: siteMedia(b.before),
            after: siteMedia(b.after),
            beforeLabel: str(b.beforeLabel, "Before"),
            afterLabel: str(b.afterLabel, "After"),
            caption: str(b.caption) || undefined,
          }),
        );
        break;
      case "quote":
        story.add(newBlock("quote", { text: str(b.text), cite: str(b.cite) || undefined }));
        break;
      case "facts":
        story.add(
          newBlock("facts", {
            rows: list(b.rows).map((r) => ({ label: str(obj(r).label), value: str(obj(r).value) })),
            auto: false,
          }),
        );
        break;
      case "divider":
        story.add(b.line === false ? newBlock("spacer") : newBlock("divider"));
        break;
    }
  }
  return tidy(story.sections);
}

/**
 * The site's legacy layout (no blocks): the gallery minus its first image
 * (that one is the cover), two-up at 4:3, full width inside the gutters, one
 * column on phones, 40px above and below. Same as app/work/[slug]/page.tsx.
 */
export function legacyGalleryStory(gallery: Media[]): Section[] {
  if (gallery.length < 2) return [];
  const block = newBlock("gallery", { items: structuredClone(gallery.slice(1)), mode: "grid", columns: 2, gap: 24, aspect: 4 / 3 });
  block.overrides = { phone: { columns: 1 } };
  const section = newSection("flow", { name: "Gallery" });
  section.layout = { type: "flow", width: "full", gap: 32, align: "start" };
  section.blocks.push(block);
  return [section];
}

const LEGACY_STYLE: PageStyle = { ...DEFAULT_PAGE_STYLE, spacing: 40, width: "full" };

/* ── Projects ─────────────────────────────────────────────────────────── */

function siteCover(v: unknown): SiteCover | null {
  const c = obj(v);
  if (!str(c.src)) return null;
  const out: SiteCover = { src: str(c.src), type: c.type === "video" ? "video" : "image", alt: str(c.alt) };
  if (str(c.poster)) out.poster = str(c.poster);
  if (str(c.spiral)) out.spiral = str(c.spiral);
  return out;
}

function siteGallery(v: unknown): Media[] {
  return list(v)
    .map(siteMedia)
    .filter((m): m is Media => !!m);
}

/** One site project → Studio project. Every site key survives toSite(). */
export function fromSite(site: Loose, now: string): Project {
  const extra: Loose = {};
  for (const [k, v] of Object.entries(site)) if (!(SITE_KEYS as readonly string[]).includes(k)) extra[k] = structuredClone(v);

  const gallery = list(site.gallery).map((m) => structuredClone(m) as Media);
  const hasBlocks = Array.isArray(site.blocks) && site.blocks.length > 0;
  const story = hasBlocks ? siteStory(site.blocks as unknown[], "wide").sections : legacyGalleryStory(gallery);
  const p = newProject(
    {
      status: "live",
      slug: str(site.slug),
      title: str(site.title),
      categories: str(site.category) ? [str(site.category)] : [],
      year: num(site.year, new Date(now).getFullYear()),
      role: strings(site.role),
      tools: strings(site.tools),
      cover: isPlainObject(site.cover) ? (structuredClone(site.cover) as unknown as SiteCover) : null,
      gallery,
      summary: str(site.summary),
      description: str(site.description),
      featured: bool(site.featured, false),
      page: {
        style: hasBlocks ? { ...DEFAULT_PAGE_STYLE } : { ...LEGACY_STYLE },
        // The site renders the intro after the legacy gallery but before Studio blocks.
        chrome: { ...DEFAULT_CHROME, intro: hasBlocks ? "before" : "after" },
        sections: story,
      },
      origin: { source: "site", ref: str(site.slug), at: now },
      extra,
    },
    now,
  );
  if (typeof site.accent === "string") p.accent = site.accent;
  return p;
}

function behanceStatus(v: unknown): Status {
  return v === "published" || v === "live" ? "live" : v === "archived" ? "archived" : "draft";
}

function isoFrom(v: unknown, fallback: string): string {
  if (typeof v === "number") return new Date(v).toISOString();
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return fallback;
}

export interface Mapped {
  project: Project;
  story: StoryResult;
}

/** PORTFOLIO/studio project → Studio project. */
export function fromBehance(b: Loose, now: string, used?: Set<string>): Mapped {
  const style = obj(b.style);
  const width = PAGE_WIDTH[str(style.width)] ?? "wide";
  const story = behanceStory(list(b.blocks), width, used);
  const cover = obj(b.cover);
  const coverSrc = mapBehanceSrc(str(cover.cropSrc) || str(cover.src), used);
  const accentSource = obj(b.accentSource);
  const pageStyle: PageStyle = {
    bg: str(style.bg, DEFAULT_PAGE_STYLE.bg),
    spacing: num(style.spacing, DEFAULT_PAGE_STYLE.spacing),
    width,
    radius: num(style.radius, DEFAULT_PAGE_STYLE.radius),
  };
  const project = newProject(
    {
      id: str(b.id) || uid(),
      createdAt: isoFrom(b.createdAt, now),
      updatedAt: isoFrom(b.updatedAt, now),
      status: behanceStatus(b.status),
      slug: str(b.slug),
      title: str(b.title),
      categories: str(b.category) ? [str(b.category)] : [],
      year: num(b.year, new Date(now).getFullYear()),
      role: strings(b.role),
      tools: strings(b.tools),
      cover: coverSrc ? { src: coverSrc, type: cover.type === "video" ? "video" : "image", alt: str(cover.alt) } : null,
      summary: str(b.summary),
      description: str(b.description),
      featured: bool(b.featured, false),
      client: str(b.client),
      tags: strings(b.tags),
      credits: list(b.credits).map((c) => ({ name: str(obj(c).name), role: str(obj(c).role) })),
      page: { style: pageStyle, chrome: { ...DEFAULT_CHROME, intro: guessIntro(story.sections) }, sections: story.sections },
      origin: { source: "studio", ref: str(b.id), at: now },
    },
    now,
  );
  const accent = str(accentSource.hsl) || str(b.accent);
  if (accent) project.accent = accent;
  return { project, story };
}

/** PORTFOLIO/studio-framer project → Studio project. */
export function fromFramer(f: Loose, now: string): Mapped {
  const story = siteStory(list(f.blocks), "wide");
  const project = newProject(
    {
      id: str(f.id) || uid(),
      createdAt: isoFrom(f.createdAt, now),
      updatedAt: isoFrom(f.updatedAt, now),
      status: f.status === "live" ? "live" : "draft",
      slug: str(f.slug),
      title: str(f.title),
      categories: str(f.category) ? [str(f.category)] : [],
      year: num(f.year, new Date(now).getFullYear()),
      role: strings(f.role),
      tools: strings(f.tools),
      cover: siteCover(f.cover),
      gallery: siteGallery(f.gallery),
      summary: str(f.summary),
      description: str(f.description),
      featured: bool(f.featured, false),
      page: {
        style: { ...DEFAULT_PAGE_STYLE },
        chrome: { ...DEFAULT_CHROME, intro: guessIntro(story.sections) },
        sections: story.sections,
      },
      origin: { source: "studio-framer", ref: str(f.id), at: now },
    },
    now,
  );
  if (typeof f.accent === "string" && f.accent) project.accent = f.accent;
  return { project, story };
}

/* ── Merge ────────────────────────────────────────────────────────────── */

export interface ImportSources {
  site: Loose[];
  behance: Loose[];
  framer: Loose[];
}

export interface Snapshot {
  projectId: string;
  label: string;
  at: string;
  doc: Project;
}

export interface ReportLine {
  title: string;
  slug: string;
  status: Status;
  from: string[];
  notes: string[];
}

export interface ImportResult {
  projects: Project[];
  snapshots: Snapshot[];
  /** Files from PORTFOLIO/studio/media to copy into media/imported/studio/. */
  behanceMedia: string[];
  report: ReportLine[];
  skipped: { source: string; ref: string; reason: string }[];
}

const COMPARED: (keyof Project)[] = [
  "title",
  "summary",
  "description",
  "categories",
  "year",
  "role",
  "tools",
  "featured",
  "cover",
  "gallery",
];

const FIELD_LABEL: Partial<Record<keyof Project, string>> = { categories: "category", role: "roles" };

function differences(kept: Project, other: Project): string[] {
  return COMPARED.filter((k) => {
    if (k === "gallery" && other.gallery.length === 0) return false;
    if (k === "cover" && !other.cover) return false;
    return !deepEqual(kept[k], other[k]);
  }).map((k) => FIELD_LABEL[k] ?? k);
}

function storyIsEmpty(p: Project): boolean {
  return p.page.sections.every((s) => s.blocks.length === 0);
}

function isBlank(p: Project): boolean {
  return !p.title.trim() && !p.cover && storyIsEmpty(p);
}

function storyNote(name: string, s: StoryResult): string {
  const blocks = s.sections.reduce((n, x) => n + x.blocks.length, 0);
  const parts = [`Story from the ${name}: ${s.sections.length} section${s.sections.length === 1 ? "" : "s"}, ${blocks} block${blocks === 1 ? "" : "s"}`];
  if (s.dropped) parts.push(`${s.dropped} empty placeholder${s.dropped === 1 ? "" : "s"} left out`);
  if (s.duplicateFacts) parts.push(`${s.duplicateFacts} repeated Facts block${s.duplicateFacts === 1 ? "" : "s"} left out`);
  return parts.join(" · ");
}

export function mergeSources(src: ImportSources, now: string): ImportResult {
  const used = new Set<string>();
  const projects: Project[] = [];
  const snapshots: Snapshot[] = [];
  const report = new Map<string, ReportLine>();
  const skipped: ImportResult["skipped"] = [];
  const bySlug = new Map<string, Project>();
  /** Projects whose story already came from a studio; a second studio's story becomes a snapshot. */
  const storyFromStudio = new Set<string>();

  const line = (p: Project, from: string) => {
    let l = report.get(p.id);
    if (!l) {
      l = { title: p.title || "Untitled", slug: p.slug, status: p.status, from: [], notes: [] };
      report.set(p.id, l);
    }
    if (!l.from.includes(from)) l.from.push(from);
    return l;
  };

  for (const s of src.site) {
    const p = fromSite(s, now);
    projects.push(p);
    bySlug.set(p.slug, p);
    line(p, "site");
  }

  const absorb = (mapped: Mapped, name: string, sourceKey: string) => {
    const other = mapped.project;
    const base = other.slug ? bySlug.get(other.slug) : undefined;

    if (!base) {
      if (isBlank(other)) {
        skipped.push({ source: sourceKey, ref: other.origin.ref ?? other.id, reason: "Empty draft (no title, cover or content)" });
        return;
      }
      other.slug = uniqueSlug(other.slug || slugify(other.title) || "untitled", bySlug.keys());
      if (other.status === "live") other.status = "draft";
      projects.push(other);
      bySlug.set(other.slug, other);
      const l = line(other, name);
      l.notes.push(`Imported as a draft from the ${name}; it isn't on the site`);
      if (!storyIsEmpty(other)) l.notes.push(storyNote(name, mapped.story));
      return;
    }

    const l = line(base, name);
    let tookSomething = false;
    let storyLeftOver = false;
    if (!storyIsEmpty(other)) {
      if (!storyFromStudio.has(base.id)) {
        base.page = structuredClone(other.page) as Page;
        storyFromStudio.add(base.id);
        l.notes.push(storyNote(name, mapped.story));
        tookSomething = true;
      } else {
        storyLeftOver = true;
      }
    }
    for (const key of ["client", "tags", "credits"] as const) {
      const value = other[key];
      if ((Array.isArray(value) ? value.length : value) && !(Array.isArray(base[key]) ? (base[key] as unknown[]).length : base[key])) {
        (base as unknown as Loose)[key] = structuredClone(value);
        tookSomething = true;
      }
    }
    const diff = differences(base, other);
    if (storyLeftOver) diff.push("story");
    if (diff.length) {
      snapshots.push({
        projectId: base.id,
        label: `${name[0].toUpperCase()}${name.slice(1)} version (before import)`,
        at: now,
        doc: { ...structuredClone(other), id: base.id },
      });
      l.notes.push(`The ${name} had a different ${diff.join(", ")}. Kept the site's; the ${name} version is saved as a snapshot`);
    } else if (!tookSomething) {
      l.notes.push(`Same as the site in the ${name}`);
    }
  };

  for (const b of src.behance) absorb(fromBehance(b, now, used), "Behance studio", "studio");
  for (const f of src.framer) absorb(fromFramer(f, now), "Framer studio", "studio-framer");

  for (const p of projects) {
    const l = report.get(p.id);
    if (!l) continue;
    l.title = p.title || "Untitled";
    l.slug = p.slug;
    l.status = p.status;
    if (p.origin.source === "site" && !storyFromStudio.has(p.id) && !p.extra.blocks)
      l.notes.unshift("Story starts as the site's gallery grid");
  }

  // Media used only by snapshots still gets copied, so restoring one works.
  return { projects, snapshots, behanceMedia: [...used].sort(), report: [...report.values()], skipped };
}
