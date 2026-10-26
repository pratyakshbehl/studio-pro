/**
 * The words projects are described with: tools, categories, licences, and the
 * tag suggestions drawn from them. Curated for 3D, motion, VFX, AI and music
 * work; anything typed that isn't here is still allowed.
 */
import { LIMITS, type Project } from "./schema.ts";

export const TOOLS = [
  "Blender", "Houdini", "Cinema 4D", "Maya", "3ds Max", "ZBrush", "Substance 3D Painter", "Substance 3D Designer",
  "Marvelous Designer", "KeyShot", "Redshift", "Octane", "Arnold", "V-Ray", "Cycles", "Eevee", "Unreal Engine",
  "Unity", "TouchDesigner", "Nuke", "After Effects", "Premiere Pro", "DaVinci Resolve", "Final Cut Pro", "Photoshop",
  "Illustrator", "InDesign", "Lightroom", "Figma", "Spline", "Rive", "Lottie", "ComfyUI", "Stable Diffusion", "Flux",
  "Midjourney", "DALL·E", "Firefly", "Runway", "Kling", "Luma", "Pika", "Sora", "Veo", "Higgsfield", "ElevenLabs",
  "Suno", "Topaz", "Ableton Live", "FL Studio", "Logic Pro", "Pro Tools", "Cubase", "Reaper", "Serum", "Kontakt",
  "Embergen", "PFTrack", "SynthEyes", "Mocha", "Element 3D", "Trapcode", "Plasticity",
] as const;

export const CATEGORIES = [
  "3D Art", "CGI", "VFX", "Motion Graphics", "3D Motion", "Animation", "Product Viz", "Packaging", "Packaging Design",
  "Brand Identity", "Branding", "Art Direction", "Creative Direction", "Event / Spatial Viz", "Event Visualization",
  "Automotive", "Architecture Viz", "Character Design", "Illustration", "AI Generation", "Music", "Sound Design",
  "Music Video", "Typography", "UI / Interaction",
] as const;

/** Behance's seven. */
export const LICENCES = [
  "All Rights Reserved",
  "Attribution (CC BY)",
  "Attribution-ShareAlike (CC BY-SA)",
  "Attribution-NoDerivs (CC BY-ND)",
  "Attribution-NonCommercial (CC BY-NC)",
  "Attribution-NonCommercial-ShareAlike (CC BY-NC-SA)",
  "Attribution-NonCommercial-NoDerivs (CC BY-NC-ND)",
] as const;

export const CTA_KINDS = [
  { value: "next", label: "Next project only" },
  { value: "contact", label: "Contact me" },
  { value: "hire", label: "Hire me" },
  { value: "link", label: "Link somewhere" },
  { value: "none", label: "Nothing" },
] as const;

/** Case-insensitive matches, best first: starts-with before contains, then the curated order. */
export function suggest(list: readonly string[], query: string, exclude: string[] = [], max = 8): string[] {
  const q = query.trim().toLowerCase();
  const taken = new Set(exclude.map((x) => x.toLowerCase()));
  const pool = [...new Set(list)].filter((x) => !taken.has(x.toLowerCase()));
  if (!q) return pool.slice(0, max);
  const starts = pool.filter((x) => x.toLowerCase().startsWith(q));
  const has = pool.filter((x) => !x.toLowerCase().startsWith(q) && x.toLowerCase().includes(q));
  return [...starts, ...has].slice(0, max);
}

const STOP = new Set([
  "the", "and", "for", "with", "from", "into", "a", "an", "of", "x", "by", "at", "on", "in", "to", "studio", "project",
  "full", "single", "first", "line", "each", "every", "over", "more", "most", "some", "this", "that", "their", "your", "made", "work",
]);
const tagify = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, " ").trim().replace(/\s+/g, " ");

/**
 * Tags worth offering for a project: words from its title and summary, its
 * categories and tools, then tags already used elsewhere. Never more than the
 * room left under the 10-tag limit, never one it already has.
 */
export function suggestTags(p: Pick<Project, "title" | "summary" | "categories" | "tools" | "tags" | "client">, used: string[] = []): string[] {
  const have = new Set(p.tags.map((t) => t.toLowerCase()));
  const out: string[] = [];
  const add = (t: string) => {
    const v = tagify(t);
    if (v.length > 1 && !STOP.has(v) && !have.has(v) && !out.includes(v)) out.push(v);
  };
  p.categories.forEach(add);
  p.tools.forEach(add);
  if (p.client) add(p.client);
  for (const w of `${p.title} ${p.summary}`.split(/[^\p{L}\p{N}+#-]+/u)) if (w.length > 3) add(w);
  used.forEach(add);
  return out.slice(0, Math.max(0, Math.min(12, LIMITS.tags - p.tags.length + 4)));
}

/** Room left under a limit, for counters like "3 of 10". */
export const roomLeft = (n: number, limit: number) => Math.max(0, limit - n);
