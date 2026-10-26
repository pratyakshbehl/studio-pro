import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { HttpError, MEDIA } from "./lib.mjs";

const MAX_BYTES = 2 * 1024 ** 3;

const KINDS = {
  image: [".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg"],
  video: [".mp4", ".webm", ".mov", ".m4v"],
  audio: [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"],
  model: [".glb", ".gltf"],
  lottie: [".json"],
};

function kindOf(ext) {
  for (const [kind, exts] of Object.entries(KINDS)) if (exts.includes(ext)) return kind;
  return null;
}

function safeBase(name) {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "file"
  );
}

/** name.ext, or name-2.ext, name-3.ext… An upload never replaces an existing file. */
async function freePath(dir, base, ext) {
  for (let n = 1; ; n++) {
    const file = n === 1 ? `${base}${ext}` : `${base}-${n}${ext}`;
    try {
      await stat(join(dir, file));
    } catch {
      return file;
    }
  }
}

/**
 * POST /api/media?name=<original file name>, raw file as the body.
 * Streams to a temp file, then moves it into media/uploads/<yyyy-mm>/.
 */
const ROLES = /^(original|poster|w(480|960|1600))$/;

/**
 * Where a companion file goes, next to the upload it belongs to:
 * - original: media/originals/<month>/<name><ext> (the full-size file, untouched)
 * - poster:   media/uploads/<month>/<name>-poster.jpg
 * - wNNN:     media/uploads/<month>/.thumbs/<name>-NNN.webp (derived, so it may be replaced)
 */
async function attach(req, forSrc, role, ext, kind) {
  const m = /^\/media\/uploads\/(\d{4}-\d{2})\/([^/\\]+)$/.exec(forSrc ?? "");
  if (!m || !ROLES.test(role ?? "")) throw new HttpError(400, "Bad companion upload");
  const [, month, file] = m;
  if (!(await stat(join(MEDIA, "uploads", month, file)).catch(() => null))) throw new HttpError(404, "The main file isn't there");
  const base = file.replace(/\.[^.]+$/, "");
  let dir, name, replace = false;
  if (role === "original") {
    dir = join(MEDIA, "originals", month);
    name = `${base}${ext === ".jpeg" ? ".jpg" : ext}`;
  } else if (role === "poster") {
    if (kind !== "image") throw new HttpError(415, "A poster is an image");
    dir = join(MEDIA, "uploads", month);
    name = `${base}-poster${ext === ".jpeg" ? ".jpg" : ext}`;
  } else {
    if (kind !== "image") throw new HttpError(415, "A thumbnail is an image");
    dir = join(MEDIA, "uploads", month, ".thumbs");
    name = `${base}-${role.slice(1)}${ext}`;
    replace = true;
  }
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.upload-${process.pid}-${Date.now()}.tmp`);
  try {
    await pipeline(req, createWriteStream(tmp));
  } catch {
    await rm(tmp, { force: true });
    throw new HttpError(400, "The upload was interrupted.");
  }
  if (!replace) name = await freePath(dir, name.replace(/\.[^.]+$/, ""), extname(name));
  await rename(tmp, join(dir, name));
  const rel = role === "original" ? `/media/originals/${month}/${name}` : role === "poster" ? `/media/uploads/${month}/${name}` : `/media/uploads/${month}/.thumbs/${name}`;
  return { src: rel, type: kind, role };
}

export async function uploadMedia(req, url) {
  const original = url.searchParams.get("name") ?? "";
  const ext = extname(original).toLowerCase();
  const kind = kindOf(ext);
  if (!kind) throw new HttpError(415, `Studio Pro can't use ${ext || "this kind of"} files yet. Try JPG, PNG, WebP, MP4, MP3, GLB or a Lottie JSON.`);
  const length = Number(req.headers["content-length"] ?? 0);
  if (length > MAX_BYTES) throw new HttpError(413, "That file is over 2 GB.");

  // A file that belongs to another upload: its original, its poster or a thumbnail.
  const forSrc = url.searchParams.get("for");
  const role = url.searchParams.get("role");
  if (forSrc || role) return attach(req, forSrc, role, ext, kind);

  const month = new Date().toISOString().slice(0, 7);
  const dir = join(MEDIA, "uploads", month);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.upload-${process.pid}-${Date.now()}.tmp`);

  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BYTES) req.destroy(new HttpError(413, "That file is over 2 GB."));
  });
  try {
    await pipeline(req, createWriteStream(tmp));
  } catch (err) {
    await rm(tmp, { force: true });
    throw err instanceof HttpError ? err : new HttpError(400, "The upload was interrupted.");
  }
  if (size === 0) {
    await rm(tmp, { force: true });
    throw new HttpError(400, "That file is empty.");
  }

  const base = safeBase(original.slice(0, original.length - ext.length));
  const file = await freePath(dir, base, ext === ".jpeg" ? ".jpg" : ext);
  await rename(tmp, join(dir, file));
  return { src: `/media/uploads/${month}/${file}`, type: kind, size, name: original };
}
