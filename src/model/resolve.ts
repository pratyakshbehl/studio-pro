import type { Breakpoint, Overrides, Page, Section } from "./schema.ts";
import { deepMerge } from "./merge.ts";

/**
 * The value a node shows at a breakpoint: desktop, then the tablet patch, then
 * the phone patch. Phone inherits tablet edits, matching how the site's
 * min-width CSS cascades. The returned node has no `overrides`.
 */
export function resolveNode<T extends { overrides?: Overrides }>(node: T, bp: Breakpoint): T {
  const { overrides, ...rest } = node;
  if (bp === "desktop" || !overrides) return rest as T;
  let out = deepMerge(rest, overrides.tablet);
  if (bp === "phone") out = deepMerge(out, overrides.phone);
  return out as T;
}

export function resolveSection(section: Section, bp: Breakpoint): Section {
  const resolved = resolveNode(section, bp);
  return { ...resolved, blocks: section.blocks.map((b) => resolveNode(b, bp)) };
}

export function resolvePage(page: Page, bp: Breakpoint): Page {
  return { ...page, sections: page.sections.map((s) => resolveSection(s, bp)) };
}

/** Which breakpoint a viewport width falls into. */
export function breakpointFor(width: number): Breakpoint {
  if (width >= 1280) return "desktop";
  if (width >= 768) return "tablet";
  return "phone";
}

/** Does this node change anything at `bp`? Drives the blue override dot. */
export function hasOverride(node: { overrides?: Overrides }, bp: Breakpoint, key?: string): boolean {
  if (bp === "desktop") return false;
  const patch = node.overrides?.[bp];
  if (!patch) return false;
  return key ? key in patch : Object.keys(patch).length > 0;
}
