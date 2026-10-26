import { mkdir, readFile, rename, stat, writeFile, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** Tests point these at a scratch folder so they never touch real data. */
export const DATA = process.env.STUDIO_PRO_DATA ? resolve(process.env.STUDIO_PRO_DATA) : join(ROOT, "data");
export const PROJECTS = join(DATA, "projects");
export const SNAPSHOTS = join(DATA, "snapshots");
export const TRASH = join(DATA, ".trash");
export const MEDIA = process.env.STUDIO_PRO_MEDIA ? resolve(process.env.STUDIO_PRO_MEDIA) : join(ROOT, "media");
export const DIST = join(ROOT, "dist");
/** Copies of the site's projects.json taken before every publish and restore. */
export const BACKUPS = process.env.STUDIO_PRO_BACKUPS ? resolve(process.env.STUDIO_PRO_BACKUPS) : join(ROOT, "backups");

export class HttpError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

const MAX_JSON = 20 * 1024 * 1024;

export async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON) throw new HttpError(413, "Request is too large");
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Body is not valid JSON");
  }
}

/** Join under `base`, refusing anything that escapes it (../, absolute paths). */
export function safeJoin(base, rel) {
  const root = resolve(base);
  const full = resolve(root, "." + sep + decodeURIComponent(rel).replace(/^[/\\]+/, ""));
  if (full !== root && !full.startsWith(root + sep)) throw new HttpError(403, "Path outside allowed folder");
  return full;
}

export async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (fallback !== undefined && err.code === "ENOENT") return fallback;
    throw err;
  }
}

/**
 * Write to a temp file, then rename over the target, so a crash mid-write
 * never leaves half a project. Windows can briefly lock a file that antivirus
 * or the indexer is reading, so the rename retries.
 */
export async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, path);
      return;
    } catch (err) {
      if (attempt >= 5 || !["EPERM", "EBUSY", "EACCES"].includes(err.code)) {
        await rm(tmp, { force: true });
        throw err;
      }
      await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
    }
  }
}

/** Serialises async work per key, e.g. writes to one project file. */
export function keyedQueue() {
  const tails = new Map();
  return (key, task) => {
    const prev = tails.get(key) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(task);
    tails.set(key, next);
    // Cleanup must not rethrow: a refused save is the caller's error to handle,
    // and an unhandled rejection here would take the whole server down.
    const cleanup = () => {
      if (tails.get(key) === next) tails.delete(key);
    };
    next.then(cleanup, cleanup);
    return next;
  };
}

export function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}
