import { join, resolve } from "node:path";
import { DATA, ROOT, exists, readJson, writeJsonAtomic } from "./lib.mjs";

const FILE = join(DATA, "settings.json");

/** Paths are relative to the studio-pro folder. */
export const DEFAULTS = {
  siteDir: "../PROGRESS UPDATED/pratyakshbehl - Copy - Copy - Copy 48",
  siteUrl: "http://localhost:3000",
  port: 4800,
  sources: { studio: "../studio", framer: "../studio-framer" },
  order: [],
  importedAt: null,
};

let cache = null;

export async function loadSettings() {
  if (cache) return cache;
  const saved = await readJson(FILE, null);
  cache = { ...DEFAULTS, ...(saved ?? {}), sources: { ...DEFAULTS.sources, ...(saved?.sources ?? {}) } };
  if (!saved) await writeJsonAtomic(FILE, cache);
  return cache;
}

export async function saveSettings(patch) {
  const current = await loadSettings();
  cache = { ...current, ...patch };
  await writeJsonAtomic(FILE, cache);
  return cache;
}

export const abs = (rel) => resolve(ROOT, rel);

export async function siteInfo() {
  const s = await loadSettings();
  const dir = abs(s.siteDir);
  const projectsFile = join(dir, "data", "projects.json");
  return { dir, projectsFile, public: join(dir, "public"), ok: await exists(projectsFile), url: s.siteUrl };
}
