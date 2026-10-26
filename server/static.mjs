import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { DIST, exists } from "./lib.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".lottie": "application/zip",
};

export const contentType = (path) => TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";

/** Streams a file, honouring Range requests so videos can seek. */
export async function serveFile(req, res, path, { cache = "no-cache" } = {}) {
  let info;
  try {
    info = await stat(path);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;

  const headers = {
    "content-type": contentType(path),
    "accept-ranges": "bytes",
    "cache-control": cache,
    "last-modified": info.mtime.toUTCString(),
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range) {
    let start = range[1] ? Number(range[1]) : info.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : info.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, info.size - 1);
    if (start > end) {
      res.writeHead(416, { "content-range": `bytes */${info.size}` });
      res.end();
      return true;
    }
    res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${info.size}`, "content-length": end - start + 1 });
    if (req.method === "HEAD") return res.end(), true;
    createReadStream(path, { start, end }).pipe(res);
    return true;
  }
  res.writeHead(200, { ...headers, "content-length": info.size });
  if (req.method === "HEAD") return res.end(), true;
  createReadStream(path).pipe(res);
  return true;
}

const NOT_BUILT = `<!doctype html><meta charset="utf-8"><title>Studio Pro</title>
<body style="font:15px system-ui;background:#111;color:#ddd;display:grid;place-items:center;height:100vh;margin:0">
<p>Studio Pro hasn't been built yet. In this folder run <code>npm run build</code>, then reload.</p>`;

/** The built app; unknown paths fall back to index.html so routes like /p/abc work on reload. */
export async function serveApp(req, res, pathname) {
  if (pathname !== "/" && (await serveFile(req, res, join(DIST, pathname), { cache: pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache" })))
    return;
  const index = join(DIST, "index.html");
  if (await exists(index)) {
    await serveFile(req, res, index);
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(NOT_BUILT);
}
