import { readdir, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { MEDIA, exists } from "./lib.mjs";
import { siteInfo } from "./settings.mjs";
import { imageSize } from "./probe.mjs";

const KIND = {
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".webp": "image",
  ".avif": "image",
  ".gif": "image",
  ".svg": "image",
  ".mp4": "video",
  ".webm": "video",
  ".mov": "video",
  ".m4v": "video",
  ".mp3": "audio",
  ".glb": "model",
  ".gltf": "model",
  ".wav": "audio",
  ".m4a": "audio",
  ".ogg": "audio",
  ".flac": "audio",
  ".aac": "audio",
};
const LIMIT = 3000;

/** Folders the library never shows: full-size originals live beside the files people use. */
const SKIP = new Set(["originals"]);

async function walk(dir, out, depth = 0) {
  if (depth > 6 || out.length >= LIMIT) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || (depth === 0 && SKIP.has(e.name))) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, out, depth + 1);
    else if (KIND[extname(e.name).toLowerCase()]) out.push(full);
    if (out.length >= LIMIT) return;
  }
}

const toUrl = (base, full) => "/" + relative(base, full).split(sep).join("/");

/**
 * Everything that can go on a page: Studio's uploads (/media/…) and the site's
 * own project images and videos (/images/…, /videos/…). Newest first.
 */
export async function listLibrary() {
  const site = await siteInfo();
  const sources = [
    { base: MEDIA, dirs: [MEDIA], origin: "studio", prefix: "/media" },
    {
      base: site.public,
      dirs: [join(site.public, "images", "projects"), join(site.public, "videos")],
      origin: "site",
      prefix: "",
    },
  ];
  const items = [];
  for (const src of sources) {
    for (const dir of src.dirs) {
      if (!(await exists(dir))) continue;
      const files = [];
      await walk(dir, files);
      for (const full of files) {
        const info = await stat(full);
        const type = KIND[extname(full).toLowerCase()];
        const item = {
          src: src.prefix + toUrl(src.base, full),
          type,
          name: full.split(sep).pop(),
          size: info.size,
          modified: info.mtime.toISOString(),
          origin: src.origin,
        };
        if (type === "image") Object.assign(item, (await imageSize(full)) ?? {});
        items.push(item);
      }
    }
  }
  // A video's generated poster ("clip-poster.jpg" beside "clip.mp4") belongs to the video, not the list.
  const videos = new Set(items.filter((i) => i.type === "video").map((i) => i.src.replace(/\.[^.]+$/, "")));
  const shown = items.filter((i) => !(i.type === "image" && /-poster\.[a-z]+$/i.test(i.src) && videos.has(i.src.replace(/-poster\.[a-z]+$/i, ""))));
  shown.sort((a, b) => b.modified.localeCompare(a.modified));
  return shown;
}
