import { describe, expect, it } from "vitest";
import {
  MERGE_WINDOW_MS,
  blockClearOverride,
  blockInsert,
  blockMove,
  blockOverride,
  blockRemove,
  blockUpdate,
  createHistory,
  deepEqual,
  deepMerge,
  exec,
  newBlock,
  newProject,
  newSection,
  pageStyle,
  projectUpdate,
  redo,
  resolveNode,
  sectionInsert,
  sectionMove,
  sectionOverride,
  sectionRemove,
  sectionUpdate,
  undo,
  validateProject,
  type BlockType,
  type History,
  type Project,
} from "../../src/model/index.ts";

function fixture(): Project {
  const p = newProject({ title: "Fixture", slug: "fixture" }, "2026-10-22T00:00:00.000Z");
  const a = newSection("flow", { name: "Intro" });
  a.blocks.push(newBlock("heading", { text: "Hello" }), newBlock("text", { html: "<p>Body</p>" }));
  const b = newSection("grid", { name: "Grid" });
  b.blocks.push(newBlock("image"), newBlock("image"));
  p.page.sections.push(a, b);
  return p;
}

describe("deepMerge", () => {
  it("merges objects, replaces arrays and removes undefined keys", () => {
    const base = { a: 1, nested: { x: 1, y: 2 }, list: [1, 2], gone: true };
    const out = deepMerge(base, { nested: { y: 3 }, list: [9], gone: undefined });
    expect(out).toEqual({ a: 1, nested: { x: 1, y: 3 }, list: [9] });
    expect(base.nested.y).toBe(2);
  });
});

describe("resolveNode", () => {
  const block = {
    ...newBlock("gallery", { columns: 4 }),
    overrides: { tablet: { columns: 3, gap: 12 }, phone: { columns: 1 } },
  };

  it("cascades desktop → tablet → phone", () => {
    expect(resolveNode(block, "desktop").columns).toBe(4);
    expect(resolveNode(block, "tablet").columns).toBe(3);
    expect(resolveNode(block, "phone").columns).toBe(1);
    expect(resolveNode(block, "phone").gap).toBe(12);
  });

  it("strips overrides from the result", () => {
    expect("overrides" in resolveNode(block, "phone")).toBe(false);
  });
});

describe("commands", () => {
  it("edits, overrides and resets a block", () => {
    let h = createHistory(fixture());
    const id = h.doc.page.sections[1].blocks[0].id;
    h = exec(h, blockUpdate, { id, patch: { caption: "Hi", id: "hijack", type: "text" } });
    const b = h.doc.page.sections[1].blocks[0];
    expect(b).toMatchObject({ id, type: "image", caption: "Hi" });

    h = exec(h, blockOverride, { id, bp: "phone", patch: { width: "full" } });
    expect(h.doc.page.sections[1].blocks[0].overrides).toEqual({ phone: { width: "full" } });
    h = exec(h, blockClearOverride, { id, bp: "phone", key: "width" });
    expect(h.doc.page.sections[1].blocks[0].overrides).toBeUndefined();
  });

  it("moves a block across sections", () => {
    let h = createHistory(fixture());
    const [intro, grid] = h.doc.page.sections;
    const id = intro.blocks[0].id;
    h = exec(h, blockMove, { id, sectionId: grid.id, index: 1 });
    expect(h.doc.page.sections[0].blocks).toHaveLength(1);
    expect(h.doc.page.sections[1].blocks[1].id).toBe(id);
  });

  it("never lets project.update touch id, rev or page", () => {
    let h = createHistory(fixture());
    const before = h.doc;
    h = exec(h, projectUpdate, { patch: { title: "New", id: "x", rev: 99, page: { style: before.page.style, chrome: before.page.chrome, sections: [] } } });
    expect(h.doc.title).toBe("New");
    expect(h.doc.id).toBe(before.id);
    expect(h.doc.rev).toBe(before.rev);
    expect(h.doc.page.sections).toHaveLength(2);
  });

  it("skips no-op commands", () => {
    const h = createHistory(fixture());
    const same = exec(h, blockRemove, { id: "does-not-exist" });
    expect(same).toBe(h);
  });

  it("merges rapid edits with the same key into one undo step", () => {
    let h = createHistory(fixture());
    h = exec(h, pageStyle, { patch: { spacing: 70 } }, 1000);
    h = exec(h, pageStyle, { patch: { spacing: 80 } }, 1000 + MERGE_WINDOW_MS / 2);
    h = exec(h, pageStyle, { patch: { spacing: 90 } }, 1000 + MERGE_WINDOW_MS);
    expect(h.past).toHaveLength(1);
    h = undo(h);
    expect(h.doc.page.style.spacing).toBe(60);
  });
});

/* ── Property test: random command sequences round-trip through undo/redo ── */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPES: BlockType[] = ["heading", "text", "image", "video", "gallery", "compare", "quote", "facts", "spacer", "divider"];

function randomStep(h: History, rnd: () => number, now: number): History {
  const pick = <T,>(list: T[]): T => list[Math.floor(rnd() * list.length)];
  const sections = h.doc.page.sections;
  const blocks = sections.flatMap((s) => s.blocks);
  const roll = rnd();

  if (sections.length === 0 || roll < 0.08) {
    return exec(h, sectionInsert, { section: newSection(pick(["flow", "stack", "grid", "canvas"])), index: Math.floor(rnd() * (sections.length + 1)) }, now);
  }
  if (roll < 0.12) return exec(h, sectionRemove, { id: pick(sections).id }, now);
  if (roll < 0.18) return exec(h, sectionMove, { id: pick(sections).id, index: Math.floor(rnd() * sections.length) }, now);
  if (roll < 0.24) return exec(h, sectionUpdate, { id: pick(sections).id, patch: { name: `S${Math.floor(rnd() * 99)}`, style: { paddingTop: Math.floor(rnd() * 120) } } }, now);
  if (roll < 0.3)
    return exec(h, sectionOverride, { id: pick(sections).id, bp: pick(["tablet", "phone"] as const), patch: { style: { paddingBottom: Math.floor(rnd() * 80) } } }, now);
  if (blocks.length === 0 || roll < 0.5) {
    const section = pick(sections);
    return exec(h, blockInsert, { sectionId: section.id, block: newBlock(pick(TYPES)), index: Math.floor(rnd() * (section.blocks.length + 1)) }, now);
  }
  const block = pick(blocks);
  if (roll < 0.6) return exec(h, blockRemove, { id: block.id }, now);
  if (roll < 0.72) return exec(h, blockMove, { id: block.id, sectionId: pick(sections).id, index: Math.floor(rnd() * 6) }, now);
  if (roll < 0.86) return exec(h, blockUpdate, { id: block.id, patch: { name: `B${Math.floor(rnd() * 99)}`, hidden: rnd() < 0.3 } }, now);
  if (roll < 0.95) return exec(h, blockOverride, { id: block.id, bp: pick(["tablet", "phone"] as const), patch: { hidden: rnd() < 0.5 } }, now);
  return exec(h, projectUpdate, { patch: { title: `T${Math.floor(rnd() * 999)}`, featured: rnd() < 0.5 } }, now);
}

describe("history property test", () => {
  it("1,000 random sequences undo to the start and redo to the end", () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const rnd = mulberry32(seed);
      const start = fixture();
      let h = createHistory(start);
      const states: Project[] = [start];
      const steps = 5 + Math.floor(rnd() * 25);
      let now = 0;
      for (let i = 0; i < steps; i++) {
        now += MERGE_WINDOW_MS * 2; // no merging: one undo step per command
        const next = randomStep(h, rnd, now);
        if (next !== h) states.push(next.doc);
        h = next;
        const errors = validateProject(h.doc);
        if (errors.length) throw new Error(`seed ${seed} step ${i}: ${errors.join("; ")}`);
      }
      const end = h.doc;
      for (let i = states.length - 1; i > 0; i--) {
        h = undo(h);
        if (!deepEqual(h.doc, states[i - 1])) throw new Error(`seed ${seed}: undo mismatch at ${i}`);
      }
      expect(h.past).toHaveLength(0);
      while (h.future.length) h = redo(h);
      if (!deepEqual(h.doc, end)) throw new Error(`seed ${seed}: redo mismatch`);
    }
  });
});
