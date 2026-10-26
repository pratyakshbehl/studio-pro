/**
 * What publishing would do, worked out without touching anything: the site's
 * new projects.json, the media files to copy into the site, what changes per
 * project, and what to fix first. The server runs exactly this plan, so the
 * sheet you confirm is the write that happens.
 */
import type { Media, Project } from "./schema.ts";
import { PUBLISHED_STATUSES, toSite } from "./serialize-site.ts";
import { blockHasContent } from "./import-map.ts";

type SiteRecord = Record<string, unknown> & { slug: string; title?: string };

export interface MediaCopy {
  /** As stored in Studio, e.g. /media/uploads/2026-10/hero.webp */
  from: string;
  /** Where it lands in the site, e.g. /images/projects/studio/2026-10/hero.webp */
  to: string;
}

export type ChangeKind = "added" | "changed" | "unchanged" | "removed" | "kept";

export interface ProjectChange {
  slug: string;
  title: string;
  kind: ChangeKind;
  /** Top-level fields that differ, for "changed". */
  fields: string[];
  why?: string;
  /** Not chosen for this publish: the site keeps its current version. */
  held?: boolean;
}

export interface Warning {
  slug: string;
  title: string;
  level: "error" | "warn";
  text: string;
}

export interface PublishPlan {
  projects: SiteRecord[];
  changes: ProjectChange[];
  media: MediaCopy[];
  warnings: Warning[];
  /** The exact text that would be written to data/projects.json. */
  json: string;
  /** Number of added, changed and removed projects in this publish (held ones don't count). */
  pending: number;
}

/** Studio media paths → site public paths. Folders keep their months; hidden folders lose the dot. */
export function sitePath(src: string, type?: Media["type"] | string): string | null {
  const m = /^\/media\/(uploads|imported)\/(.+)$/.exec(src);
  if (!m) return null;
  const rest = m[2].replace(/(^|\/)\.thumbs\//, "$1thumbs/");
  const sub = m[1] === "imported" ? `imported/${rest}` : rest;
  const ext = (src.split(".").pop() ?? "").toLowerCase();
  const kind = type ?? (["mp4", "webm", "mov", "m4v"].includes(ext) ? "video" : ["mp3", "wav", "m4a", "ogg", "flac", "aac"].includes(ext) ? "audio" : ["glb", "gltf"].includes(ext) ? "model" : "image");
  const dir = kind === "video" ? "videos/projects/studio" : kind === "audio" ? "audio/projects/studio" : kind === "model" ? "models/projects/studio" : "images/projects/studio";
  return `/${dir}/${sub}`;
}

/** Rewrites every Studio media path inside a record and collects the copies it needs. */
function rewriteMedia(node: unknown, copies: Map<string, string>, hintType?: string): unknown {
  if (Array.isArray(node)) return node.map((n) => rewriteMedia(n, copies, hintType));
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    const type = typeof o.type === "string" ? o.type : hintType;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      // A poster is always an image, whatever the media it belongs to.
      out[k] = k === "poster" || k === "spiral" || k === "image" ? rewriteMedia(v, copies, "image") : rewriteMedia(v, copies, k === "src" ? type : undefined);
    }
    return out;
  }
  if (typeof node === "string" && node.startsWith("/media/")) {
    const to = sitePath(node, hintType);
    if (to) {
      copies.set(node, to);
      return to;
    }
  }
  return node;
}

const stable = (v: unknown) => JSON.stringify(v);

function warningsFor(p: Project): Omit<Warning, "slug" | "title">[] {
  const out: Omit<Warning, "slug" | "title">[] = [];
  if (!p.slug) out.push({ level: "error", text: "It has no web address (slug)." });
  if (!p.title.trim()) out.push({ level: "error", text: "It has no title." });
  // The site's homepage spiral and work index read every published project's cover.
  if (!p.cover?.src) out.push({ level: "error", text: "It has no cover. The site's homepage and work index need one: add it in Settings." });
  else if (!p.cover.alt.trim()) out.push({ level: "warn", text: "The cover has no alt text." });
  let noAlt = 0;
  let empty = 0;
  for (const s of p.page.sections)
    for (const b of s.blocks) {
      if (b.hidden) continue;
      if (!blockHasContent(b) && b.type !== "spacer" && b.type !== "divider") empty++;
      const media: (Media | null | undefined)[] = [];
      if ("media" in b) media.push(b.media as Media | null);
      if (b.type === "gallery") media.push(...b.items);
      if (b.type === "compare") media.push(b.before, b.after);
      if (b.type === "layers") media.push(...b.steps.map((x) => x.media));
      noAlt += media.filter((m) => m && m.type === "image" && !m.alt.trim()).length;
    }
  if (noAlt) out.push({ level: "warn", text: `${noAlt} image${noAlt === 1 ? " has" : "s have"} no alt text.` });
  if (empty) out.push({ level: "warn", text: `${empty} empty block${empty === 1 ? " is" : "s are"} left out of the page.` });
  if (p.status === "unlisted") out.push({ level: "warn", text: "Unlisted: published at its address, but the site's work index doesn't hide unlisted projects yet." });
  return out;
}

/**
 * @param studio every Studio project
 * @param order Studio's project order (ids)
 * @param site the site's current projects.json, parsed
 * @param indent how the site's file is indented (kept as it is)
 * @param only publish just these slugs: every other project stays exactly as the site has it, in the site's order
 */
export function planPublish(studio: Project[], order: string[], site: SiteRecord[], indent: string | number = 2, only?: ReadonlySet<string>): PublishPlan {
  const rank = new Map(order.map((id, i) => [id, i]));
  const live = studio
    .filter((p) => PUBLISHED_STATUSES.has(p.status))
    .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  const copies = new Map<string, string>();
  const chosen = (slug: string) => !only || only.has(slug);
  const bySlug = new Map(site.map((s) => [s.slug, s]));
  const studioSlugs = new Set(studio.map((p) => p.slug));
  const liveSlugs = new Set(live.map((p) => p.slug));

  const changes: ProjectChange[] = [];
  const warnings: Warning[] = [];
  // Kept as a list, not keyed by slug, so two projects at one address still get caught below.
  const fresh: SiteRecord[] = [];
  for (const p of live) {
    const own = new Map<string, string>();
    const rec = rewriteMedia(toSite(p), own) as SiteRecord;
    // Empty blocks never reach the site.
    const page = rec.page as Project["page"];
    page.sections = page.sections.map((s) => ({ ...s, blocks: s.blocks.filter((b) => blockHasContent(b) || b.type === "spacer" || b.type === "divider") }));
    const before = bySlug.get(p.slug);
    const fields = before ? [...new Set([...Object.keys(before), ...Object.keys(rec)])].filter((k) => stable(before[k]) !== stable(rec[k])) : [];
    const kind: ChangeKind = !before ? "added" : fields.length ? "changed" : "unchanged";
    const held = kind !== "unchanged" && !chosen(p.slug);
    changes.push({ slug: p.slug, title: p.title || p.slug, kind, fields, ...(held && { held }) });
    if (held) continue;
    fresh.push(rec);
    for (const [from, to] of own) copies.set(from, to);
    for (const w of warningsFor(p)) warnings.push({ slug: p.slug, title: p.title || p.slug, ...w });
  }
  // On the site but not live in Studio: drafts and archived come off; the rest stay as they are.
  const removed = new Set<string>();
  for (const s of site) {
    if (liveSlugs.has(s.slug)) continue;
    if (studioSlugs.has(s.slug)) {
      const p = studio.find((x) => x.slug === s.slug)!;
      const held = !chosen(s.slug);
      if (!held) removed.add(s.slug);
      changes.push({ slug: s.slug, title: s.title ?? s.slug, kind: "removed", fields: [], why: `It's ${p.status === "archived" ? "archived" : "a draft"} in Studio.`, ...(held && { held }) });
    } else {
      changes.push({ slug: s.slug, title: s.title ?? s.slug, kind: "kept", fields: [], why: "Only on the site; Studio leaves it alone." });
    }
  }
  const records: SiteRecord[] = only
    ? // A partial publish keeps the site's order and swaps in just the chosen projects; new ones go last.
      [...site.filter((s) => !removed.has(s.slug)).map((s) => fresh.find((r) => r.slug === s.slug) ?? s), ...fresh.filter((r) => !bySlug.has(r.slug))]
    : [...fresh, ...site.filter((s) => !studioSlugs.has(s.slug))];
  const dup = records.map((r) => r.slug).filter((s, i, a) => a.indexOf(s) !== i);
  for (const slug of new Set(dup)) warnings.push({ slug, title: slug, level: "error", text: "Two projects would share this address." });

  const json = `${JSON.stringify(records, null, indent)}\n`;
  return {
    projects: records,
    changes,
    media: [...copies].map(([from, to]) => ({ from, to })),
    warnings,
    json,
    pending: changes.filter((c) => !c.held && (c.kind === "added" || c.kind === "changed" || c.kind === "removed")).length,
  };
}
