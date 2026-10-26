import { join } from "node:path";
import { DATA, HttpError, keyedQueue, readJson, writeJsonAtomic } from "./lib.mjs";
import { listLibrary } from "./library.mjs";
import { readAll } from "./projects.mjs";

/**
 * What Studio knows about each file beyond the file itself: default alt text,
 * tags, a focal point, and for audio its waveform, BPM, key, mood and loop.
 * Kept in data/media-meta.json, keyed by the file's src.
 */
const FILE = join(DATA, "media-meta.json");
const queue = keyedQueue();
const FIELDS = new Set(["alt", "tags", "focal", "peaks", "duration", "bpm", "key", "mood", "loop", "variants", "poster"]);

const load = async () => (await readJson(FILE, { files: {} })).files ?? {};

/** The library, each file with its notes and the projects that use it. */
export async function libraryWithMeta() {
  const [items, meta, projects] = await Promise.all([listLibrary(), load(), readAll()]);
  const docs = projects.map((p) => ({ id: p.id, title: p.title || "Untitled project", text: JSON.stringify(p) }));
  return items.map((it) => ({
    ...it,
    ...(meta[it.src] ?? {}),
    usedIn: docs.filter((d) => d.text.includes(`"${it.src}"`)).map(({ id, title }) => ({ id, title })),
  }));
}

/** Merge notes into one file's record; a null or undefined value removes that note. */
export function setMeta({ src, patch }) {
  if (typeof src !== "string" || !src.startsWith("/")) throw new HttpError(400, "Which file?");
  if (!patch || typeof patch !== "object") throw new HttpError(400, "Nothing to change");
  return queue("meta", async () => {
    const files = await load();
    const cur = { ...(files[src] ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (!FIELDS.has(k)) continue;
      if (v === null || v === undefined || (Array.isArray(v) && !v.length) || v === "") delete cur[k];
      else cur[k] = v;
    }
    if (Object.keys(cur).length) files[src] = cur;
    else delete files[src];
    await writeJsonAtomic(FILE, { files });
    return { src, ...cur };
  });
}
