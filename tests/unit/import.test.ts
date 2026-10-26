import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fromSite, mergeSources, toSite, validateProject, migrateProject } from "../../src/model/index.ts";

const FIX = join(import.meta.dirname, "..", "fixtures");
const read = (f: string) => JSON.parse(readFileSync(join(FIX, f), "utf8"));
const NOW = "2026-10-22T12:00:00.000Z";

const site: Record<string, unknown>[] = read("site-projects.json");
const behance = readdirSync(join(FIX, "studio")).map((f) => read(join("studio", f)));
const framer = read("framer-workspace.json").projects;

describe("fromSite → toSite", () => {
  it("round-trips every site project with no field lost or changed", () => {
    for (const s of site) {
      const out = toSite(fromSite(s, NOW));
      const { page, ...rest } = out;
      expect(rest).toEqual(s);
      expect(page).toBeTruthy();
      expect(Object.keys(rest)).toEqual(Object.keys(s));
    }
  });

  it("turns the legacy gallery (minus the cover image) into the site's 2-up 4:3 grid", () => {
    const joi = site.find((s) => s.slug === "joi-farm")!;
    const p = fromSite(joi, NOW);
    const gallery = p.page.sections[0].blocks[0];
    expect(gallery).toMatchObject({ type: "gallery", columns: 2, gap: 24 });
    expect(gallery.type === "gallery" && gallery.items.map((m) => m?.src)).toEqual(["/images/projects/joi-farm-02.jpg"]);
    expect(gallery.type === "gallery" && gallery.aspect).toBeCloseTo(4 / 3);
    expect(gallery.overrides).toEqual({ phone: { columns: 1 } });
    expect(p.page.chrome.intro).toBe("after");
    expect(p.page.style).toMatchObject({ spacing: 40, width: "full" });
  });

  it("gives a one-image gallery no story, like the site", () => {
    const one = site.find((s) => Array.isArray(s.gallery) && s.gallery.length === 1)!;
    expect(fromSite(one, NOW).page.sections).toEqual([]);
  });
});

describe("mergeSources (real data from both old studios + the 48 site)", () => {
  const result = mergeSources({ site, behance, framer }, NOW);

  it("keeps all 7 site projects, live, in site order", () => {
    const live = result.projects.filter((p) => p.origin.source === "site");
    expect(live.map((p) => p.slug)).toEqual(site.map((s) => s.slug));
    expect(live.every((p) => p.status === "live")).toBe(true);
  });

  it("keeps site details over studio edits and snapshots the differing versions", () => {
    const joi = result.projects.find((p) => p.slug === "joi-farm")!;
    const siteJoi = site.find((s) => s.slug === "joi-farm")!;
    expect(joi.cover).toEqual(siteJoi.cover);
    expect(joi.gallery).toEqual(siteJoi.gallery);
    const labels = result.snapshots.filter((s) => s.projectId === joi.id).map((s) => s.label);
    expect(labels).toEqual(["Behance studio version (before import)", "Framer studio version (before import)"]);
  });

  it("takes the Behance studio's stories, without empty placeholders", () => {
    const district = result.projects.find((p) => p.slug === "district-by-zomato")!;
    const types = district.page.sections.flatMap((s) => s.blocks.map((b) => b.type));
    expect(types).toContain("text");
    expect(types).toContain("image");
    const joi = result.projects.find((p) => p.slug === "joi-farm")!;
    const autoFacts = joi.page.sections.flatMap((s) => s.blocks).filter((b) => b.type === "facts");
    expect(autoFacts).toHaveLength(1);
  });

  it("rewrites media paths: /site/… to the site's path, /media/… to the import folder", () => {
    const srcs = JSON.stringify(result.projects);
    expect(srcs).not.toContain('"/site/');
    expect(srcs).not.toMatch(/"\/media\/(?!imported\/studio\/)/);
    expect(result.behanceMedia.length).toBeGreaterThan(0);
  });

  it("imports studio-only drafts that have content and skips blank ones", () => {
    const drafts = result.projects.filter((p) => p.origin.source !== "site");
    expect(drafts.every((p) => p.status === "draft" && p.slug)).toBe(true);
    expect(result.skipped.length).toBeGreaterThan(0);
    const slugs = result.projects.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("produces only valid projects and a report line for each", () => {
    for (const p of result.projects) expect(validateProject(p)).toEqual([]);
    expect(result.report).toHaveLength(result.projects.length);
  });

  it("leaves current documents unchanged and refuses newer ones", () => {
    const p = result.projects[0];
    expect(migrateProject(structuredClone(p))).toEqual(p);
    expect(() => migrateProject({ ...p, schemaVersion: 99 })).toThrow(/newer Studio Pro/);
  });

  it("upgrades a v1 document: imported studio stories hide the intro, new pages show it", () => {
    const joi = result.projects.find((p) => p.slug === "joi-farm")!;
    const { chrome: _drop, ...pageV1 } = joi.page;
    const upgraded = migrateProject({ ...structuredClone(joi), schemaVersion: 1, page: pageV1 });
    expect(upgraded.schemaVersion).toBe(3);
    expect(upgraded.page.chrome).toEqual({ header: true, cover: true, intro: "hidden", next: true });
    const empty = migrateProject({ ...structuredClone(joi), schemaVersion: 1, page: { style: joi.page.style, sections: [] } });
    expect(empty.page.chrome.intro).toBe("before");
  });
});
