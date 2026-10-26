import { mkdir, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { HttpError, MEDIA, PROJECTS, SNAPSHOTS, TRASH, keyedQueue, readJson, safeJoin, stamp, writeJsonAtomic } from "./lib.mjs";
import { imageSize } from "./probe.mjs";
import { loadSettings, saveSettings, siteInfo } from "./settings.mjs";
import { cloneSection, LIMITS, migrateProject, newProject, slugify, uid, uniqueSlug, validateProject } from "../src/model/index.ts";

const queue = keyedQueue();
const fileOf = (id) => {
  if (!/^[\w-]{1,64}$/.test(id)) throw new HttpError(400, "Bad project id");
  return join(PROJECTS, `${id}.json`);
};

export async function readAll() {
  await mkdir(PROJECTS, { recursive: true });
  const files = (await readdir(PROJECTS)).filter((f) => f.endsWith(".json"));
  const out = [];
  for (const f of files) {
    try {
      out.push(migrateProject(await readJson(join(PROJECTS, f))));
    } catch (err) {
      console.warn(`Skipping ${f}: ${err.message}`);
    }
  }
  return out;
}

/** What the home screen needs; full documents stay on disk until opened. */
export function summarize(p) {
  const blocks = p.page.sections.reduce((n, s) => n + s.blocks.length, 0);
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    status: p.status,
    categories: p.categories,
    year: p.year,
    featured: p.featured,
    cover: p.cover,
    accent: p.accent,
    tags: p.tags,
    tools: p.tools,
    summary: p.summary,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    origin: p.origin.source,
    sections: p.page.sections.length,
    blocks,
  };
}

/** Saved site order first, then everything else newest first. */
export async function listSummaries() {
  const [all, settings] = await Promise.all([readAll(), loadSettings()]);
  const rank = new Map(settings.order.map((id, i) => [id, i]));
  all.sort((a, b) => {
    const ra = rank.get(a.id) ?? Infinity;
    const rb = rank.get(b.id) ?? Infinity;
    if (ra !== rb) return ra - rb;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  return all.map(summarize);
}

export async function getProject(id) {
  const doc = await readJson(fileOf(id), null);
  if (!doc) throw new HttpError(404, "Project not found");
  return migrateProject(doc);
}

/**
 * Fills in width/height on any image that lacks them (the site's own images
 * were stored without sizes; photo grids need them). The editor saves them
 * back with its next change.
 */
export async function withImageSizes(doc) {
  const site = await siteInfo();
  const fix = async (node) => {
    if (Array.isArray(node)) return Promise.all(node.map(fix));
    if (!node || typeof node !== "object") return;
    if (typeof node.src === "string" && node.type === "image" && !(node.width > 0 && node.height > 0)) {
      try {
        const path = node.src.startsWith("/media/") ? safeJoin(MEDIA, node.src.slice(7)) : safeJoin(site.public, node.src);
        const size = await imageSize(path);
        if (size) Object.assign(node, size);
      } catch {
        /* missing or unreadable file: leave the size unknown */
      }
    }
    await Promise.all(Object.values(node).map(fix));
  };
  await fix(doc.page);
  await fix(doc.gallery);
  return doc;
}

function assertValid(doc) {
  const errors = validateProject(doc);
  if (errors.length) throw new HttpError(422, `Project can't be saved: ${errors.join("; ")}`, { errors });
}

/** Writes a brand-new project (also used by the importer). */
export async function writeNew(doc) {
  assertValid(doc);
  return queue(doc.id, async () => {
    await writeJsonAtomic(fileOf(doc.id), doc);
    return doc;
  });
}

export async function createProject(partial = {}) {
  const all = await readAll();
  const now = new Date().toISOString();
  const title = typeof partial.title === "string" ? partial.title : "";
  const doc = newProject({ ...partial, rev: 1, createdAt: now, updatedAt: now, origin: { source: "new", at: now } }, now);
  doc.slug = uniqueSlug(slugify(partial.slug || title) || "untitled", all.map((p) => p.slug));
  await writeNew(doc);
  const settings = await loadSettings();
  await saveSettings({ order: [doc.id, ...settings.order.filter((id) => id !== doc.id)] });
  return doc;
}

/**
 * Save with optimistic locking: the client sends the rev it edited. If the file
 * moved on (another tab, a restore), the save is refused with the current copy
 * so nothing is silently overwritten.
 */
export async function saveProject(id, incoming) {
  if (incoming?.id !== id) throw new HttpError(400, "Id in body doesn't match the URL");
  return queue(id, async () => {
    const current = await getProject(id);
    if (incoming.rev !== current.rev) {
      throw new HttpError(409, "This project changed somewhere else", { current });
    }
    const doc = { ...incoming, rev: current.rev + 1, updatedAt: new Date().toISOString() };
    assertValid(doc);
    await writeJsonAtomic(fileOf(id), doc);
    return doc;
  });
}

/** "Delete" moves the file to data/.trash; nothing is ever unlinked. */
export async function trashProject(id) {
  return queue(id, async () => {
    const doc = await getProject(id);
    await mkdir(TRASH, { recursive: true });
    await rename(fileOf(id), join(TRASH, `${id}-${stamp()}.json`));
    const settings = await loadSettings();
    await saveSettings({ order: settings.order.filter((x) => x !== id) });
    return { id, title: doc.title };
  });
}

const STATUSES = new Set(["draft", "live", "unlisted", "archived"]);

/**
 * The same change to many projects at once (status, featured, tags). Each is
 * saved on its own with a new rev, so open editors notice and reload.
 */
export async function bulkUpdate({ ids, patch }) {
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, "Pick some projects first");
  const p = patch ?? {};
  if (p.status !== undefined && !STATUSES.has(p.status)) throw new HttpError(400, "Unknown status");
  const done = [];
  for (const id of ids) {
    done.push(
      await queue(id, async () => {
        const doc = await getProject(id);
        if (p.status !== undefined) doc.status = p.status;
        if (p.featured !== undefined) doc.featured = !!p.featured;
        if (Array.isArray(p.addTags)) doc.tags = [...new Set([...doc.tags, ...p.addTags.map(String).filter(Boolean)])].slice(0, LIMITS.tags);
        if (Array.isArray(p.removeTags)) doc.tags = doc.tags.filter((t) => !p.removeTags.includes(t));
        doc.rev += 1;
        doc.updatedAt = new Date().toISOString();
        assertValid(doc);
        await writeJsonAtomic(fileOf(id), doc);
        return summarize(doc);
      }),
    );
  }
  return done;
}

/** A copy to work from: new id and slug, back to Draft, placed right after the original. */
export async function duplicateProject(id) {
  const src = await getProject(id);
  const all = await readAll();
  const now = new Date().toISOString();
  const title = src.title ? `${src.title} (copy)` : "";
  const doc = {
    ...structuredClone(src),
    id: uid(),
    rev: 1,
    createdAt: now,
    updatedAt: now,
    publishedAt: undefined,
    status: "draft",
    featured: false,
    title,
    slug: uniqueSlug(slugify(title) || "untitled", all.map((p) => p.slug)),
    origin: { source: "new", ref: id, at: now },
  };
  doc.page.sections = doc.page.sections.map(cloneSection);
  await writeNew(doc);
  const settings = await loadSettings();
  const order = settings.order.filter((x) => x !== doc.id);
  const at = order.indexOf(id);
  order.splice(at < 0 ? 0 : at + 1, 0, doc.id);
  await saveSettings({ order });
  return summarize(doc);
}

/** Projects in data/.trash, newest first (saved sections live there too and are left out). */
export async function listTrash() {
  await mkdir(TRASH, { recursive: true });
  const files = (await readdir(TRASH)).filter((f) => f.endsWith(".json") && !f.startsWith("section-") && !f.startsWith("restored-"))
    .sort((a, b) => (trashedAt(b) ?? "").localeCompare(trashedAt(a) ?? ""));
  const out = [];
  for (const file of files) {
    try {
      const doc = migrateProject(await readJson(join(TRASH, file)));
      out.push({ file, deletedAt: trashedAt(file), ...summarize(doc) });
    } catch {
      /* not a project file */
    }
  }
  return out;
}

/** "abc-2026-10-22T05-08-49-055Z.json" → when it was trashed. */
const trashedAt = (file) => {
  const m = /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/.exec(file);
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : null;
};

/** Brings a project back from the trash. If its id or slug was reused meanwhile, it gets new ones. */
export async function restoreFromTrash(file) {
  if (!/^[\w.-]+\.json$/.test(file) || file.startsWith("section-") || file.startsWith("restored-")) throw new HttpError(400, "Bad trash item");
  const raw = await readJson(join(TRASH, file), null);
  if (!raw) throw new HttpError(404, "That item isn't in the trash");
  const doc = migrateProject(raw);
  const all = await readAll();
  if (all.some((p) => p.id === doc.id)) doc.id = uid();
  if (all.some((p) => p.slug === doc.slug)) doc.slug = uniqueSlug(doc.slug, all.map((p) => p.slug));
  doc.rev = (doc.rev ?? 0) + 1;
  doc.updatedAt = new Date().toISOString();
  await writeNew(doc);
  await rename(join(TRASH, file), join(TRASH, `restored-${file}`));
  const settings = await loadSettings();
  await saveSettings({ order: [doc.id, ...settings.order.filter((x) => x !== doc.id)] });
  return summarize(doc);
}

export async function saveOrder(ids) {
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) throw new HttpError(400, "order must be a list of ids");
  const settings = await saveSettings({ order: [...new Set(ids)] });
  return settings.order;
}

export async function writeSnapshot(snapshot) {
  const dir = join(SNAPSHOTS, snapshot.projectId);
  const name = `${stamp(new Date(snapshot.at))}-${slugify(snapshot.label).slice(0, 40)}.json`;
  await writeJsonAtomic(join(dir, name), snapshot);
  return name;
}

export async function listSnapshots(projectId) {
  fileOf(projectId); // validates the id before it becomes a path
  const dir = join(SNAPSHOTS, projectId);
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort().reverse();
  } catch {
    return [];
  }
  const out = [];
  for (const file of files) {
    const s = await readJson(join(dir, file));
    out.push({ file, label: s.label, at: s.at });
  }
  return out;
}

/** Saves the project as it is on disk now under a name you choose. */
export async function saveVersion(projectId, label) {
  const doc = await getProject(projectId);
  const clean = String(label ?? "").trim().slice(0, 80) || `Version ${new Date().toLocaleString("en-GB")}`;
  const at = new Date().toISOString();
  const file = await writeSnapshot({ projectId, label: clean, at, doc });
  return { file, label: clean, at };
}

export async function readSnapshot(projectId, file) {
  fileOf(projectId);
  if (!/^[\w.-]+\.json$/.test(file)) throw new HttpError(400, "Bad version name");
  const snap = await readJson(join(SNAPSHOTS, projectId, file), null);
  if (!snap) throw new HttpError(404, "That version isn't there any more");
  return { ...snap, doc: migrateProject(snap.doc) };
}
