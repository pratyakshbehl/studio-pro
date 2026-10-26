import { describe, expect, it } from "vitest";
import { newBlock, newProject, newSection, planPublish, sitePath, type Project } from "../../src/model/index.ts";

function project(slug: string, status: Project["status"], extra: Partial<Project> = {}): Project {
  const p = newProject({ slug, title: slug.toUpperCase(), status, categories: ["CGI"], ...extra });
  p.page.sections = [newSection("flow", { blocks: [newBlock("image", { media: { src: `/media/uploads/2026-10/${slug}.webp`, type: "image", alt: "A render", variants: [{ w: 480, src: `/media/uploads/2026-10/.thumbs/${slug}-480.webp` }] } })] })];
  return p;
}

const siteRecord = (slug: string, title = slug) => ({ slug, title, category: "Old", year: 2024, role: [], tools: [], cover: { src: `/images/projects/${slug}.jpg`, type: "image", alt: "x" }, gallery: [], summary: "", description: "", featured: false });

describe("site paths", () => {
  it.each([
    ["/media/uploads/2026-10/hero.webp", undefined, "/images/projects/studio/2026-10/hero.webp"],
    ["/media/uploads/2026-10/.thumbs/hero-480.webp", undefined, "/images/projects/studio/2026-10/thumbs/hero-480.webp"],
    ["/media/uploads/2026-10/reel.mp4", undefined, "/videos/projects/studio/2026-10/reel.mp4"],
    ["/media/uploads/2026-10/theme.mp3", undefined, "/audio/projects/studio/2026-10/theme.mp3"],
    ["/media/uploads/2026-10/can.glb", undefined, "/models/projects/studio/2026-10/can.glb"],
    ["/media/imported/studio/joi-1.webp", undefined, "/images/projects/studio/imported/studio/joi-1.webp"],
    ["/images/projects/joi-farm-01.jpg", undefined, null],
  ])("%s → %s", (src, type, want) => {
    expect(sitePath(src, type)).toBe(want);
  });
});

describe("publish plan", () => {
  const live = project("alpha", "live");
  const unlisted = project("beta", "unlisted");
  const draft = project("gamma", "draft");
  const studio = [live, unlisted, draft];
  const order = [unlisted.id, live.id, draft.id];
  const site = [siteRecord("gamma", "Gamma on site"), siteRecord("site-only", "Kept")];

  it("writes Live and Unlisted in Studio's order, drops Drafts, keeps site-only projects", () => {
    const plan = planPublish(studio, order, site);
    expect(plan.projects.map((p) => p.slug)).toEqual(["beta", "alpha", "site-only"]);
    const kinds = Object.fromEntries(plan.changes.map((c) => [c.slug, c.kind]));
    expect(kinds).toEqual({ beta: "added", alpha: "added", gamma: "removed", "site-only": "kept" });
    expect(plan.pending).toBe(3);
    expect(plan.projects[2]).toEqual(site[1]);
  });

  it("moves Studio media into the site's public folders and lists every copy", () => {
    const plan = planPublish(studio, order, site);
    const text = JSON.stringify(plan.projects);
    expect(text).not.toContain("/media/");
    expect(text).toContain("/images/projects/studio/2026-10/alpha.webp");
    expect(text).toContain("/images/projects/studio/2026-10/thumbs/alpha-480.webp");
    expect(plan.media.map((m) => m.from)).toContain("/media/uploads/2026-10/.thumbs/beta-480.webp");
    expect(plan.media).toHaveLength(4);
  });

  it("is idempotent: once written, nothing is pending", () => {
    const first = planPublish(studio, order, site);
    const again = planPublish(studio, order, JSON.parse(first.json));
    expect(again.pending).toBe(0);
    expect(again.json).toBe(first.json);
    expect(again.changes.filter((c) => c.kind === "unchanged").map((c) => c.slug)).toEqual(["beta", "alpha"]);
  });

  it("names exactly which fields changed", () => {
    const first = planPublish(studio, order, site);
    const edited = { ...live, summary: "Now with a summary" };
    const plan = planPublish([edited, unlisted, draft], order, JSON.parse(first.json));
    expect(plan.changes.find((c) => c.slug === "alpha")).toMatchObject({ kind: "changed", fields: ["summary"] });
  });

  it("keeps the site's indentation and ends with a newline", () => {
    const plan = planPublish(studio, order, site, "\t");
    expect(plan.json.startsWith("[\n\t{")).toBe(true);
    expect(plan.json.endsWith("}\n]\n")).toBe(true);
  });

  it("leaves empty blocks out and warns about what to fix", () => {
    const p = project("delta", "live", { cover: null });
    p.page.sections[0].blocks.push(newBlock("text"), newBlock("image", { media: { src: "/media/uploads/2026-10/x.webp", type: "image", alt: "" } }));
    const plan = planPublish([p], [p.id], []);
    const blocks = (plan.projects[0].page as Project["page"]).sections[0].blocks;
    expect(blocks.map((b) => b.type)).toEqual(["image", "image"]);
    const texts = plan.warnings.map((w) => w.text).join(" | ");
    expect(texts).toContain("no cover");
    expect(plan.warnings.find((w) => /no cover/.test(w.text))?.level).toBe("error");
    expect(texts).toContain("1 image has no alt text");
    expect(texts).toContain("1 empty block is left out");
  });

  it("refuses two projects at one address", () => {
    const a = project("same", "live");
    const clash = planPublish([a, { ...project("same", "unlisted"), id: "other-id" }], [a.id, "other-id"], []);
    expect(clash.warnings.some((w) => w.level === "error" && /share this address/.test(w.text))).toBe(true);
  });
});

describe("publishing just some projects", () => {
  const live = project("alpha", "live");
  const fresh = project("beta", "live");
  const draft = project("gamma", "draft");
  const studio = [live, fresh, draft];
  const order = [live.id, fresh.id, draft.id];
  const site = [siteRecord("gamma"), siteRecord("alpha", "Old alpha"), siteRecord("site-only")];

  it("swaps in only the chosen project and keeps everything else, in the site's order", () => {
    const plan = planPublish(studio, order, site, 2, new Set(["alpha"]));
    expect(plan.projects.map((p) => p.slug)).toEqual(["gamma", "alpha", "site-only"]);
    expect(plan.projects[0]).toEqual(site[0]);
    expect(plan.projects[1].title).toBe("ALPHA");
    expect(plan.pending).toBe(1);
    const held = plan.changes.filter((c) => c.held).map((c) => `${c.kind}:${c.slug}`);
    expect(held).toEqual(["added:beta", "removed:gamma"]);
    expect(plan.media.map((m) => m.from).every((f) => f.includes("alpha"))).toBe(true);
    expect(plan.warnings.every((w) => w.slug === "alpha")).toBe(true);
  });

  it("adds a chosen new project at the end and takes off a chosen draft", () => {
    const plan = planPublish(studio, order, site, 2, new Set(["beta", "gamma"]));
    expect(plan.projects.map((p) => p.slug)).toEqual(["alpha", "site-only", "beta"]);
    expect(plan.projects[0]).toEqual(site[1]);
    expect(plan.pending).toBe(2);
  });

  it("choosing every pending project gives the same changes as a full publish", () => {
    const full = planPublish(studio, order, site);
    const chosen = planPublish(studio, order, site, 2, new Set(["alpha", "beta", "gamma"]));
    expect(chosen.pending).toBe(full.pending);
    expect(chosen.media).toEqual(full.media);
    expect(new Set(chosen.projects.map((p) => p.slug))).toEqual(new Set(full.projects.map((p) => p.slug)));
  });
});
