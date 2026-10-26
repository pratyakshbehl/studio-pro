import { BLOCK_TYPES, LIMITS, SCHEMA_VERSION, type Project } from "./schema.ts";

const LAYOUTS = new Set(["flow", "stack", "grid", "canvas"]);
const STATUSES = new Set(["draft", "live", "unlisted", "archived"]);
const TYPES = new Set<string>(BLOCK_TYPES);

/**
 * Structural problems that would break the editor or the site. The server
 * refuses to save a project that has any. Content gaps (no cover, missing alt)
 * are publish warnings, not errors.
 */
export function validateProject(input: unknown): string[] {
  const errors: string[] = [];
  const p = input as Project;
  if (!p || typeof p !== "object") return ["Project is not an object"];
  if (typeof p.id !== "string" || !p.id) errors.push("Missing id");
  if (p.schemaVersion !== SCHEMA_VERSION) errors.push(`Unsupported schemaVersion ${p.schemaVersion}`);
  if (!STATUSES.has(p.status)) errors.push(`Unknown status "${p.status}"`);
  if (typeof p.slug !== "string") errors.push("Slug must be text");
  if (typeof p.title !== "string") errors.push("Title must be text");
  if (!Array.isArray(p.categories) || p.categories.length > LIMITS.categories)
    errors.push(`Up to ${LIMITS.categories} categories`);
  if (!Array.isArray(p.tags) || p.tags.length > LIMITS.tags) errors.push(`Up to ${LIMITS.tags} tags`);
  if (!p.page || !Array.isArray(p.page.sections)) {
    errors.push("Missing page sections");
    return errors;
  }
  if (!p.page.chrome || !["before", "after", "hidden"].includes(p.page.chrome.intro)) errors.push("Missing page chrome");

  const ids = new Set<string>();
  const seen = (id: string, what: string) => {
    if (!id) errors.push(`${what} without an id`);
    else if (ids.has(id)) errors.push(`Duplicate id ${id}`);
    ids.add(id);
  };
  for (const section of p.page.sections) {
    seen(section.id, "Section");
    if (!LAYOUTS.has(section.layout?.type)) errors.push(`Section ${section.id}: unknown layout`);
    if (!Array.isArray(section.blocks)) {
      errors.push(`Section ${section.id}: blocks missing`);
      continue;
    }
    for (const block of section.blocks) {
      seen(block.id, "Block");
      if (!TYPES.has(block.type)) errors.push(`Block ${block.id}: unknown type "${block.type}"`);
    }
  }
  return errors;
}

export interface PublishWarning {
  level: "warn" | "info";
  message: string;
}

/** Things worth fixing before publishing; never blocks a save. */
export function publishWarnings(p: Project): PublishWarning[] {
  const out: PublishWarning[] = [];
  if (!p.cover?.src) out.push({ level: "warn", message: "No cover image" });
  else if (!p.cover.alt?.trim()) out.push({ level: "warn", message: "Cover has no alt text" });
  if (!p.slug) out.push({ level: "warn", message: "No page address (slug)" });
  if (!p.summary.trim()) out.push({ level: "info", message: "No summary" });
  let missingAlt = 0;
  for (const s of p.page.sections)
    for (const b of s.blocks) {
      if (b.type === "image" && b.media && !b.media.alt.trim()) missingAlt++;
      if (b.type === "gallery") missingAlt += b.items.filter((m) => m && !m.alt.trim()).length;
    }
  if (missingAlt) out.push({ level: "warn", message: `${missingAlt} image${missingAlt > 1 ? "s" : ""} without alt text` });
  return out;
}
