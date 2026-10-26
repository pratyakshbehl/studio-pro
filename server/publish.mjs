import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { BACKUPS, DATA, HttpError, MEDIA, exists, keyedQueue, readJson, safeJoin, stamp, writeJsonAtomic } from "./lib.mjs";
import { loadSettings, siteInfo } from "./settings.mjs";
import { readAll } from "./projects.mjs";
import { planPublish } from "../src/model/index.ts";

/**
 * Publishing to the website: the plan you see in the sheet, then exactly that
 * write, always after a backup. Restoring a backup puts the old file back byte
 * for byte (after backing up the current one). Media is only ever added to the
 * site, never removed.
 */
const queue = keyedQueue();
const LOG = join(DATA, "publish-log.json");

async function readSite() {
  const site = await siteInfo();
  if (!site.ok) throw new HttpError(409, `Studio can't find the site's projects file at ${site.projectsFile}.`);
  const text = await readFile(site.projectsFile, "utf8");
  let list;
  try {
    list = JSON.parse(text);
  } catch {
    throw new HttpError(409, "The site's projects.json isn't valid JSON, so Studio won't overwrite it. Fix or restore it first.");
  }
  // Keep the site's own indentation.
  const indent = /^\[\r?\n([ \t]+)\{/.exec(text)?.[1] ?? 2;
  return { site, text, list, indent };
}

const hashOf = (plan) => createHash("sha256").update(plan.json).update(JSON.stringify(plan.media)).digest("hex").slice(0, 16);

/** Where a Studio media path lives on disk. */
const mediaFile = (src) => safeJoin(MEDIA, src.slice("/media/".length));

/** "a,b" or ["a","b"] → a set of slugs; nothing means publish everything. */
function onlySet(only) {
  if (only == null) return undefined;
  const list = Array.isArray(only) ? only : String(only).split(",");
  return new Set(list.map((s) => String(s).trim()).filter(Boolean));
}

/** What publishing would do now (all projects, or just the `only` slugs). Nothing is written. */
export async function getPlan({ only } = {}) {
  const [{ site, list, indent }, studio, settings] = await Promise.all([readSite(), readAll(), loadSettings()]);
  const plan = planPublish(studio, settings.order, list, indent, onlySet(only));
  // Media: what's missing from Studio, and what the site already has.
  const media = [];
  for (const m of plan.media) {
    const from = mediaFile(m.from);
    const to = join(site.public, ...m.to.split("/").filter(Boolean));
    const [a, b] = await Promise.all([stat(from).catch(() => null), stat(to).catch(() => null)]);
    media.push({ ...m, size: a?.size ?? 0, missing: !a, present: !!(a && b && a.size === b.size) });
  }
  const missing = media.filter((m) => m.missing);
  const warnings = [...plan.warnings];
  // Big files make the site slow for every visitor: worth fixing, not blocking.
  const MB = 1024 * 1024;
  for (const m of media) {
    const video = m.to.startsWith("/videos/");
    if (!m.missing && m.size > (video ? 40 : 8) * MB)
      warnings.push({ slug: "", title: m.from.split("/").pop(), level: "warn", text: `is ${(m.size / MB).toFixed(0)} MB, heavy for the web. ${video ? "Export it under 40 MB." : "Upload it again (Studio resizes big images to 2880px WebP) or export it under 8 MB."}` });
  }
  for (const m of missing) warnings.push({ slug: "", title: "Media", level: "error", text: `${m.from} is used but missing from Studio's media folder.` });
  return {
    hash: hashOf(plan),
    site: { dir: site.dir, file: site.projectsFile },
    changes: plan.changes,
    warnings,
    media,
    pending: plan.pending,
    blocked: warnings.some((w) => w.level === "error"),
    bytes: Buffer.byteLength(plan.json),
    json: plan.json,
  };
}

/** Copies the site's current projects.json into backups/<time>/ with a note of why. */
async function backup(siteFile, reason, extra = {}) {
  const id = stamp();
  const dir = join(BACKUPS, id);
  await mkdir(dir, { recursive: true });
  await copyFile(siteFile, join(dir, "projects.json"));
  await writeJsonAtomic(join(dir, "manifest.json"), { id, at: new Date().toISOString(), reason, siteFile, ...extra });
  return id;
}

async function writeExact(path, text) {
  const tmp = join(dirname(path), `.projects.json.${process.pid}.tmp`);
  await writeFile(tmp, text);
  await rename(tmp, path);
}

async function log(entry) {
  const prev = await readJson(LOG, { runs: [] });
  await writeJsonAtomic(LOG, { runs: [entry, ...(prev.runs ?? [])].slice(0, 200) });
}

/**
 * Publish exactly the plan the sheet showed (`hash`, for the same `only`). If
 * anything changed since, it refuses and the sheet reloads. Order: backup,
 * media, then projects.json.
 */
export function publish({ hash, only }) {
  return queue("publish", async () => {
    const plan = await getPlan({ only });
    if (plan.hash !== hash) throw new HttpError(409, "Something changed since you opened the publish sheet. Check the new list and publish again.", { plan });
    if (plan.blocked) throw new HttpError(422, "Fix the problems marked in red first.", { plan });
    const backupId = await backup(plan.site.file, "Before publishing", { changes: plan.changes.filter((c) => !c.held && c.kind !== "unchanged" && c.kind !== "kept") });
    const site = await siteInfo();
    let copied = 0;
    for (const m of plan.media) {
      if (m.present) continue;
      const to = join(site.public, ...m.to.split("/").filter(Boolean));
      await mkdir(dirname(to), { recursive: true });
      await copyFile(mediaFile(m.from), to);
      copied++;
    }
    await writeExact(plan.site.file, plan.json);
    const entry = {
      at: new Date().toISOString(),
      kind: "publish",
      backup: backupId,
      added: plan.changes.filter((c) => !c.held && c.kind === "added").map((c) => c.slug),
      changed: plan.changes.filter((c) => !c.held && c.kind === "changed").map((c) => c.slug),
      removed: plan.changes.filter((c) => !c.held && c.kind === "removed").map((c) => c.slug),
      ...(plan.changes.some((c) => c.held) && { held: plan.changes.filter((c) => c.held).map((c) => c.slug) }),
      media: copied,
    };
    await log(entry);
    return entry;
  });
}

/** One spelling per file (Windows short names, letter case), so a backup can be matched to the site it came from. */
const canonical = async (p) => {
  try {
    return realpathSync.native(p).toLowerCase();
  } catch {
    return resolve(p).toLowerCase();
  }
};

/** Backups of the site Studio publishes to now, newest first. Backups of any other site are never offered. */
export async function listBackups() {
  if (!(await exists(BACKUPS))) return [];
  const here = await canonical((await siteInfo()).projectsFile);
  const dirs = (await readdir(BACKUPS, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith("sync-"));
  const out = [];
  for (const d of dirs) {
    const manifest = await readJson(join(BACKUPS, d.name, "manifest.json"), null);
    const info = await stat(join(BACKUPS, d.name, "projects.json")).catch(() => null);
    if (manifest && info && (await canonical(manifest.siteFile ?? "")) === here) out.push({ id: d.name, at: manifest.at, reason: manifest.reason, size: info.size, changes: manifest.changes ?? [] });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** Puts a backup's projects.json back exactly, after backing up what's there now. */
export function restore(id) {
  if (!/^[\w.-]+$/.test(id)) throw new HttpError(400, "Bad backup name");
  return queue("publish", async () => {
    const src = join(BACKUPS, id, "projects.json");
    if (!(await exists(src))) throw new HttpError(404, "That backup isn't there.");
    const site = await siteInfo();
    const manifest = await readJson(join(BACKUPS, id, "manifest.json"), {});
    if ((await canonical(manifest.siteFile ?? "")) !== (await canonical(site.projectsFile)))
      throw new HttpError(409, "That backup was taken from a different site folder, so Studio won't put it on this one.");
    const before = await backup(site.projectsFile, `Before restoring ${id}`);
    await copyFile(src, site.projectsFile);
    const entry = { at: new Date().toISOString(), kind: "restore", restored: id, backup: before };
    await log(entry);
    return entry;
  });
}

export async function publishLog() {
  return (await readJson(LOG, { runs: [] })).runs ?? [];
}
