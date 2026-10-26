/**
 * Studio Pro local server. Serves the app, the projects API, Studio's own
 * media (/media) and the site's public folder (/site, read-only).
 * Listens on 127.0.0.1 only: nothing here is reachable from other machines.
 *
 *   node server.mjs            → http://localhost:4800
 */
import "./server/args.mjs";
import http from "node:http";
import { HttpError, MEDIA, readJsonBody, safeJoin, sendJson } from "./server/lib.mjs";
import { loadSettings, siteInfo } from "./server/settings.mjs";
import { serveApp, serveFile } from "./server/static.mjs";
import {
  createProject,
  getProject,
  withImageSizes,
  listSnapshots,
  readSnapshot,
  saveVersion,
  listSummaries,
  saveOrder,
  saveProject,
  trashProject,
  bulkUpdate,
  duplicateProject,
  listTrash,
  restoreFromTrash,
} from "./server/projects.mjs";
import { previewImport, runImport } from "./server/import.mjs";
import { uploadMedia } from "./server/media.mjs";
import { libraryWithMeta, setMeta } from "./server/media-meta.mjs";
import { getPlan, listBackups, publish, publishLog, restore } from "./server/publish.mjs";
import { addSection, listSections, removeSection, renameSection } from "./server/sections.mjs";

const settings = await loadSettings();
const PORT = Number(process.env.PORT) || settings.port;

/** [method, pattern, handler(params, req, url) → JSON body] */
const routes = [
  ["GET", /^\/api\/health$/, async () => {
    const site = await siteInfo();
    return { ok: true, app: "studio-pro", site: { dir: site.dir, ok: site.ok, url: site.url } };
  }],
  ["GET", /^\/api\/projects$/, () => listSummaries()],
  ["POST", /^\/api\/projects$/, async (_, req) => createProject(await readJsonBody(req))],
  ["GET", /^\/api\/projects\/([\w-]+)$/, async ([id]) => withImageSizes(await getProject(id))],
  ["PUT", /^\/api\/projects\/([\w-]+)$/, async ([id], req) => saveProject(id, await readJsonBody(req))],
  ["DELETE", /^\/api\/projects\/([\w-]+)$/, ([id]) => trashProject(id)],
  ["POST", /^\/api\/projects\/bulk$/, async (_, req) => bulkUpdate(await readJsonBody(req))],
  ["POST", /^\/api\/projects\/([\w-]+)\/duplicate$/, ([id]) => duplicateProject(id)],
  ["GET", /^\/api\/trash$/, () => listTrash()],
  ["POST", /^\/api\/trash\/([\w.-]+)\/restore$/, ([file]) => restoreFromTrash(file)],
  ["GET", /^\/api\/projects\/([\w-]+)\/snapshots$/, ([id]) => listSnapshots(id)],
  ["POST", /^\/api\/projects\/([\w-]+)\/snapshots$/, async ([id], req) => saveVersion(id, (await readJsonBody(req)).label)],
  ["GET", /^\/api\/projects\/([\w-]+)\/snapshots\/([\w.-]+)$/, ([id, file]) => readSnapshot(id, file)],
  ["GET", /^\/api\/media$/, () => libraryWithMeta()],
  ["PUT", /^\/api\/media\/meta$/, async (_, req) => setMeta(await readJsonBody(req))],
  ["PUT", /^\/api\/order$/, async (_, req) => ({ order: await saveOrder((await readJsonBody(req)).ids) })],
  ["GET", /^\/api\/import$/, () => previewImport()],
  ["POST", /^\/api\/import$/, () => runImport()],
  ["POST", /^\/api\/media$/, (_, req, url) => uploadMedia(req, url)],
  ["GET", /^\/api\/publish\/plan$/, (_, __, url) => getPlan({ only: url.searchParams.get("only") })],
  ["POST", /^\/api\/publish$/, async (_, req) => publish(await readJsonBody(req))],
  ["GET", /^\/api\/publish\/backups$/, () => listBackups()],
  ["POST", /^\/api\/publish\/restore\/([\w.-]+)$/, ([id]) => restore(id)],
  ["GET", /^\/api\/publish\/log$/, () => publishLog()],
  ["GET", /^\/api\/library\/sections$/, () => listSections()],
  ["POST", /^\/api\/library\/sections$/, async (_, req) => addSection(await readJsonBody(req))],
  ["PUT", /^\/api\/library\/sections\/([\w-]+)$/, async ([id], req) => renameSection(id, await readJsonBody(req))],
  ["DELETE", /^\/api\/library\/sections\/([\w-]+)$/, ([id]) => removeSection(id)],
];

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  if (path.startsWith("/api/")) {
    for (const [method, pattern, fn] of routes) {
      const m = pattern.exec(path);
      if (!m) continue;
      if (req.method !== method) continue;
      return sendJson(res, 200, await fn(m.slice(1), req, url));
    }
    throw new HttpError(404, `No API route for ${req.method} ${path}`);
  }

  if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Method not allowed");

  if (path.startsWith("/media/")) {
    if (await serveFile(req, res, safeJoin(MEDIA, path.slice("/media/".length)), { cache: "public, max-age=86400" })) return;
    throw new HttpError(404, "Media file not found");
  }

  if (path.startsWith("/site/")) {
    const site = await siteInfo();
    if (await serveFile(req, res, safeJoin(site.public, path.slice("/site/".length)), { cache: "public, max-age=3600" })) return;
    throw new HttpError(404, "Not in the site's public folder");
  }

  return serveApp(req, res, path);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (res.headersSent) return res.destroy();
    sendJson(res, status, { error: err.message, ...(err.body ?? {}) });
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`Studio Pro is already running. Open http://localhost:${PORT}`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Studio Pro is running at http://localhost:${PORT}`);
  console.log("Keep this window open while you work. Close it to stop Studio Pro.");
});
