import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { MEDIA, exists, readJson } from "./lib.mjs";
import { abs, loadSettings, saveSettings, siteInfo } from "./settings.mjs";
import { readAll, writeNew, writeSnapshot } from "./projects.mjs";
import { mergeSources } from "../src/model/index.ts";

/** Reads the site and both old studios. Read-only: nothing in those folders is touched. */
async function readSources() {
  const settings = await loadSettings();
  const site = await siteInfo();
  const studioDir = abs(settings.sources.studio);
  const framerDir = abs(settings.sources.framer);

  const siteProjects = site.ok ? await readJson(site.projectsFile) : [];

  const behance = [];
  const behanceProjects = join(studioDir, "data", "projects");
  if (await exists(behanceProjects)) {
    for (const f of (await readdir(behanceProjects)).filter((x) => x.endsWith(".json")).sort()) {
      behance.push(await readJson(join(behanceProjects, f)));
    }
  }

  const framerFile = join(framerDir, "data", "workspace.json");
  const framer = (await exists(framerFile)) ? ((await readJson(framerFile)).projects ?? []) : [];

  return {
    sources: { site: siteProjects, behance, framer },
    found: {
      site: { path: site.projectsFile, ok: site.ok, count: siteProjects.length },
      studio: { path: studioDir, ok: behance.length > 0, count: behance.length },
      framer: { path: framerFile, ok: framer.length > 0, count: framer.length },
    },
    studioMediaDir: join(studioDir, "media"),
  };
}

/**
 * Plans the import. Projects whose slug is already in Studio Pro are left
 * alone, so running it again only brings in what's new.
 */
async function plan() {
  const { sources, found, studioMediaDir } = await readSources();
  const result = mergeSources(sources, new Date().toISOString());
  const existing = new Set((await readAll()).map((p) => p.slug));
  const fresh = result.projects.filter((p) => !existing.has(p.slug));
  const freshIds = new Set(fresh.map((p) => p.id));
  return {
    found,
    studioMediaDir,
    projects: fresh,
    snapshots: result.snapshots.filter((s) => freshIds.has(s.projectId)),
    behanceMedia: result.behanceMedia,
    report: result.report.map((line) => ({ ...line, alreadyInStudio: existing.has(line.slug) })),
    skipped: result.skipped,
  };
}

export async function previewImport() {
  const p = await plan();
  return { found: p.found, report: p.report, skipped: p.skipped, newProjects: p.projects.length, snapshots: p.snapshots.length, media: p.behanceMedia.length };
}

export async function runImport() {
  const p = await plan();
  const copied = [];
  const missing = [];
  const target = join(MEDIA, "imported", "studio");
  await mkdir(target, { recursive: true });
  for (const file of p.behanceMedia) {
    const from = join(p.studioMediaDir, file);
    const to = join(target, file);
    if (await exists(to)) continue;
    if (!(await exists(from))) {
      missing.push(file);
      continue;
    }
    await copyFile(from, to);
    copied.push(file);
  }

  for (const doc of p.projects) await writeNew({ ...doc, rev: 1 });
  for (const snap of p.snapshots) await writeSnapshot(snap);

  const settings = await loadSettings();
  const order = [...settings.order, ...p.projects.map((d) => d.id).filter((id) => !settings.order.includes(id))];
  await saveSettings({ order, importedAt: new Date().toISOString() });

  return {
    found: p.found,
    report: p.report,
    skipped: p.skipped,
    imported: p.projects.length,
    snapshots: p.snapshots.length,
    media: { copied: copied.length, missing },
  };
}
