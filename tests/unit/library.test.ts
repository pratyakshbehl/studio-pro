import { describe, expect, it } from "vitest";
import { newProject, validateProject, type Project, type Section } from "../../src/model/index.ts";
import { PRESET_GROUPS, SECTION_PRESETS } from "../../src/library/sections.ts";
import { TEMPLATES, fromTemplate } from "../../src/library/templates.ts";

const ids = (sections: Section[]) => sections.flatMap((s) => [s.id, ...s.blocks.map((b) => b.id)]);
const withSections = (sections: Section[]): Project => {
  const p = newProject({ title: "Library test" });
  p.page.sections = sections;
  return p;
};

describe("section presets", () => {
  it("has about thirty, in every group", () => {
    expect(SECTION_PRESETS.length).toBeGreaterThanOrEqual(28);
    for (const g of PRESET_GROUPS) expect(SECTION_PRESETS.some((p) => p.group === g)).toBe(true);
    expect(new Set(SECTION_PRESETS.map((p) => p.id)).size).toBe(SECTION_PRESETS.length);
  });

  it.each(SECTION_PRESETS.map((p) => [p.id, p] as const))("%s makes a valid section with fresh ids", (_, preset) => {
    const a = preset.make();
    const b = preset.make();
    expect(validateProject(withSections([a]))).toEqual([]);
    expect(a.blocks.length).toBeGreaterThan(0);
    // Two inserts of the same preset never share an id.
    expect(ids([a]).filter((id) => ids([b]).includes(id))).toEqual([]);
    expect(JSON.stringify(a).toLowerCase()).not.toContain("lorem");
  });

  it("places every block of a free-canvas preset", () => {
    for (const p of SECTION_PRESETS) {
      const s = p.make();
      if (s.layout.type === "canvas") expect(s.blocks.every((b) => b.frame)).toBe(true);
    }
  });
});

describe("templates", () => {
  it("are the twelve from the spec", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([
      "classic",
      "product-viz",
      "vfx",
      "motion",
      "brand",
      "packaging",
      "event",
      "ai-series",
      "music-release",
      "long-read",
      "quick-shot",
      "blank",
    ]);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s starts a valid project", (_, t) => {
    const p = newProject(fromTemplate(t, "Test"));
    expect(validateProject(p)).toEqual([]);
    const all = ids(p.page.sections);
    expect(new Set(all).size).toBe(all.length);
    if (t.id !== "blank") expect(p.page.sections.flatMap((s) => s.blocks).length).toBeGreaterThan(2);
    expect(JSON.stringify(p).toLowerCase()).not.toContain("lorem");
  });

  it("gives the music release its own cover, and VFX a breakdown", () => {
    const music = newProject(fromTemplate(TEMPLATES.find((t) => t.id === "music-release")!, "EP"));
    expect(music.page.chrome.cover).toBe(false);
    expect(music.page.sections.flatMap((s) => s.blocks).some((b) => b.type === "tracklist")).toBe(true);
    const vfx = newProject(fromTemplate(TEMPLATES.find((t) => t.id === "vfx")!, "Shot"));
    expect(vfx.page.sections.flatMap((s) => s.blocks).some((b) => b.type === "layers")).toBe(true);
    expect(vfx.categories).toEqual(["VFX"]);
  });
});
