import type { Project } from "./schema.ts";

/**
 * Studio project → the site's `Project` record (types/project.ts, 48 copy).
 * Site keys come back exactly as imported, in the site's key order, plus any
 * keys Studio doesn't model (`extra`). `page` is the Studio Pro story and
 * `studio` the few extra fields its renderer reads (client, credits,
 * soundtrack, end-of-page button).
 */
export function toSite(p: Project): Record<string, unknown> {
  const out: Record<string, unknown> = {
    slug: p.slug,
    title: p.title,
    category: p.categories[0] ?? "",
    year: p.year,
    role: [...p.role],
    tools: [...p.tools],
    // The site's type has a cover on every project; an empty one is safer than null.
    cover: p.cover ? structuredClone(p.cover) : { src: "", type: "image", alt: "" },
    gallery: structuredClone(p.gallery),
    summary: p.summary,
    description: p.description,
    featured: p.featured,
  };
  if (p.accent !== undefined) out.accent = p.accent;
  for (const [k, v] of Object.entries(p.extra)) if (!(k in out)) out[k] = structuredClone(v);
  out.page = structuredClone(p.page);
  // What the site's story renderer reads beyond the site's own fields.
  const studio: Record<string, unknown> = {};
  if (p.client) studio.client = p.client;
  if (p.credits.length) studio.credits = structuredClone(p.credits);
  if (p.soundtrack?.src) studio.soundtrack = structuredClone(p.soundtrack);
  if (p.cta.kind !== "next") studio.cta = structuredClone(p.cta);
  if (Object.keys(studio).length) out.studio = studio;
  return out;
}

/** Only these statuses reach the site; drafts and archived stay in Studio. */
export const PUBLISHED_STATUSES = new Set(["live", "unlisted"]);
