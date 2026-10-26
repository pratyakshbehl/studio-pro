import { describe, expect, it } from "vitest";
import { chroma, detectBpm, detectKey } from "../../src/lib/audio.ts";
import { CATEGORIES, LICENCES, TOOLS, suggest, suggestTags } from "../../src/model/taxonomy.ts";
import { slugify, uniqueSlug } from "../../src/model/index.ts";

const RATE = 11025;

/** Short clicks every beat, like a metronome. */
function clicks(bpm: number, seconds: number) {
  const data = new Float32Array(Math.floor(RATE * seconds));
  const every = (60 / bpm) * RATE;
  for (let t = 0; t < data.length; t += every) for (let i = 0; i < 200 && t + i < data.length; i++) data[Math.floor(t) + i] = Math.exp(-i / 40) * Math.sin(i * 0.9);
  return data;
}

/** A held chord of sine tones. */
function chord(freqs: number[], seconds: number) {
  const data = new Float32Array(Math.floor(RATE * seconds));
  for (let i = 0; i < data.length; i++) data[i] = freqs.reduce((v, f, k) => v + Math.sin((2 * Math.PI * f * i) / RATE) / (k === 0 ? 1 : 1.6), 0) / freqs.length;
  return data;
}

describe("tempo", () => {
  it.each([90, 120, 140])("hears a %i BPM click track", (bpm) => {
    const got = detectBpm(clicks(bpm, 12), RATE)!;
    expect(Math.abs(got - bpm)).toBeLessThanOrEqual(2);
  });
  it("says nothing for a clip too short to tell", () => {
    expect(detectBpm(new Float32Array(1000), RATE)).toBeNull();
  });
});

describe("key", () => {
  it("hears A minor in an A–C–E chord", () => {
    expect(detectKey(chroma(chord([220, 261.63, 329.63, 110], 6), RATE))).toBe("A minor");
  });
  it("hears C major in a C–E–G chord", () => {
    expect(detectKey(chroma(chord([261.63, 329.63, 392, 130.81], 6), RATE))).toBe("C major");
  });
  it("says nothing for silence", () => {
    expect(detectKey(new Array(12).fill(0))).toBeNull();
  });
});

describe("taxonomy", () => {
  it("has the curated lists from the spec", () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(55);
    expect(LICENCES).toHaveLength(7);
    expect(CATEGORIES).toContain("Product Viz");
    for (const t of ["Blender", "Houdini", "Nuke", "ComfyUI", "Higgsfield", "Ableton Live"]) expect(TOOLS).toContain(t);
  });
  it("suggests starts-with first and skips what's taken", () => {
    expect(suggest(TOOLS, "sub")[0]).toBe("Substance 3D Painter");
    expect(suggest(TOOLS, "nuke", ["Nuke"])).not.toContain("Nuke");
    expect(suggest(["Blender", "Unreal Engine"], "en")).toEqual(["Blender", "Unreal Engine"]);
  });
  it("suggests tags from what the project is, never one it has", () => {
    const tags = suggestTags({ title: "Joi Farm dairy range", summary: "", categories: ["Product Viz"], tools: ["Blender"], tags: ["blender"], client: "Joi" }, ["packaging"]);
    expect(tags).toContain("product viz");
    expect(tags).toContain("dairy");
    expect(tags).toContain("packaging");
    expect(tags).not.toContain("blender");
  });
});

describe("slugs", () => {
  it("makes clean, unique addresses", () => {
    expect(slugify("Joi Farm — Dairy Range!")).toBe("joi-farm-dairy-range");
    expect(uniqueSlug("joi-farm", ["joi-farm", "joi-farm-2"])).toBe("joi-farm-3");
  });
});
