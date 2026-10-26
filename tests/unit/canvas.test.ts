import { describe, expect, it } from "vitest";
import { blockOverride, blocksMove, blockUpdate, createHistory, exec, newBlock, newProject, newSection } from "../../src/model/index.ts";
import { bounds, layoutColumns, resizeBox, rotateBox, snapMove, snapResize, snapTargets, toFrame, toPx } from "../../src/editor/frames.ts";
import { distances } from "../../src/editor/Measure.tsx";

const box = { x: 100, y: 100, w: 200, h: 100, r: 0 };

describe("frame geometry", () => {
  it("round-trips between % and px", () => {
    const f = toFrame(box, 1000, 500, 3);
    expect(f).toEqual({ x: 10, y: 20, w: 20, h: 20, rotation: 0, z: 3 });
    expect(toPx(f, 1000, 500)).toEqual(box);
  });

  it("resizes from a corner, keeping the opposite corner put", () => {
    const b = resizeBox(box, "se", 50, 20);
    expect(b).toMatchObject({ x: 100, y: 100, w: 250, h: 120 });
    const nw = resizeBox(box, "nw", -10, -10);
    expect(nw).toMatchObject({ x: 90, y: 90, w: 210, h: 110 });
  });

  it("keeps the shape with Shift and grows from the centre with Alt", () => {
    const ratio = resizeBox(box, "e", 100, 0, { ratio: true });
    expect(ratio.w / ratio.h).toBeCloseTo(2);
    expect(ratio.w).toBe(300);
    const centre = resizeBox(box, "e", 20, 0, { centre: true });
    expect(centre).toMatchObject({ x: 80, w: 240 });
  });

  it("resizes a rotated box along its own axes", () => {
    const tilted = { ...box, r: 90 };
    // Rotated 90°, the box's own x-axis points down the page.
    const b = resizeBox(tilted, "e", 0, 40);
    expect(b.w).toBeCloseTo(240);
    expect(b.h).toBeCloseTo(100);
    // The far edge moved, so the centre moves half the distance down.
    expect(b.y + b.h / 2).toBeCloseTo(170);
  });

  it("rotates round the centre and snaps to 15° with Shift", () => {
    const c = { x: 200, y: 150 };
    const r = rotateBox(box, { x: c.x + 100, y: c.y }, { x: c.x, y: c.y + 100 });
    expect(r.r).toBeCloseTo(90);
    const s = rotateBox(box, { x: c.x + 100, y: c.y }, { x: c.x + 100, y: c.y + 20 }, true);
    expect(s.r % 15).toBe(0);
  });

  it("measures the bounds of a rotated box", () => {
    const b = bounds({ x: 0, y: 0, w: 100, h: 100, r: 45 });
    expect(b.w).toBeCloseTo(141.42, 1);
  });

  it("snaps edges and centres to the section and other blocks", () => {
    const targets = snapTargets(1000, 500, [{ x: 600, y: 0, w: 100, h: 100, r: 0 }]);
    const moved = snapMove({ ...box, x: 446, w: 150 }, targets, 6, 500, 1000);
    // Right edge 596 pulls onto the other block's left edge at 600.
    expect(moved.box.x).toBe(450);
    expect(moved.lines[0]).toMatchObject({ axis: "x", at: 600 });
    const centred = snapMove({ ...box, x: 403 }, targets, 6, 500, 1000);
    expect(centred.box.x + centred.box.w / 2).toBe(500);
  });

  it("snaps only the edge a handle drags", () => {
    const targets = snapTargets(1000, 500, []);
    const s = snapResize({ ...box, w: 397 }, "e", targets, 6, 500, 1000);
    expect(s.box.x + s.box.w).toBe(500);
    expect(s.box.x).toBe(100);
  });

  it("lays out 12, 8 and 4 columns inside the site's gutters", () => {
    const d = layoutColumns(1440);
    expect(d).toHaveLength(12);
    expect(d[0].x).toBe(40);
    expect(d[11].x + d[11].w).toBeCloseTo(1400);
    expect(layoutColumns(834)).toHaveLength(8);
    const p = layoutColumns(390);
    expect(p).toHaveLength(4);
    expect(p[0].x).toBe(24);
  });
});

describe("distances (Alt)", () => {
  it("gives the gap between two boxes side by side", () => {
    const d = distances({ x: 0, y: 0, w: 100, h: 100 }, { x: 150, y: 20, w: 50, h: 50 }, 0.5);
    expect(d).toHaveLength(1);
    expect(d[0].value).toBe(100);
  });
  it("gives four insets when one box holds the other", () => {
    const d = distances({ x: 10, y: 20, w: 50, h: 50 }, { x: 0, y: 0, w: 100, h: 100 }, 1);
    expect(d.map((x) => x.value).sort((a, b) => a - b)).toEqual([10, 20, 30, 40]);
  });
});

describe("blocksMove", () => {
  const setup = () => {
    const p = newProject({ title: "Moves" });
    const a = newSection("flow");
    const b = newSection("flow");
    a.blocks = [newBlock("text"), newBlock("text"), newBlock("text")];
    b.blocks = [newBlock("image")];
    p.page.sections = [a, b];
    return { p, a, b };
  };

  it("moves blocks from two sections before an anchor, in the order given", () => {
    const { p, a, b } = setup();
    const ids = [a.blocks[0].id, b.blocks[0].id];
    const h = exec(createHistory(p), blocksMove, { ids, sectionId: a.id, before: a.blocks[2].id });
    expect(h.doc.page.sections[0].blocks.map((x) => x.id)).toEqual([a.blocks[1].id, a.blocks[0].id, b.blocks[0].id, a.blocks[2].id]);
    expect(h.doc.page.sections[1].blocks).toHaveLength(0);
    expect(h.past[0].label).toBe("Move 2 blocks");
  });

  it("refuses an anchor that is itself moving", () => {
    const { p, a } = setup();
    const h0 = createHistory(p);
    const h = exec(h0, blocksMove, { ids: [a.blocks[0].id], sectionId: a.id, before: a.blocks[0].id });
    expect(h).toBe(h0);
  });
});

describe("history labels", () => {
  it("names a change by what it touched", () => {
    const p = newProject({ title: "Labels" });
    const s = newSection("flow");
    s.blocks = [newBlock("heading")];
    p.page.sections = [s];
    const id = s.blocks[0].id;
    let h = exec(createHistory(p), blockUpdate, { id, patch: { font: { size: 40 } } });
    expect(h.past[0].label).toBe("Change type");
    h = exec(h, blockOverride, { id, bp: "phone", patch: { effects: { appear: "fade" } } });
    expect(h.past[1].label).toBe("Change effects · phone");
  });
});
