import type { CSSProperties } from "react";
import type { Breakpoint, Overrides } from "../model/schema.ts";
import { resolveNode } from "../model/resolve.ts";

/**
 * Responsive values without media queries. The page root is a CSS container,
 * so the same markup answers to the editor's 1440/834/390 frames and to the
 * real browser window on the site.
 *
 * For each value we write `--name` (desktop), plus `--name-t` / `--name-p`
 * only where tablet or phone differ. render.css picks the right one per
 * container width into `--_name`, which the component styles read.
 */
export type VarValue = string | number | undefined;

export function responsiveVars<T extends { overrides?: Overrides }>(
  node: T,
  pick: (resolved: T) => Record<string, VarValue>,
): CSSProperties {
  const d = pick(resolveNode(node, "desktop"));
  const t = node.overrides ? pick(resolveNode(node, "tablet")) : d;
  const p = node.overrides ? pick(resolveNode(node, "phone")) : t;
  const out: Record<string, string> = {};
  for (const key of Object.keys(d)) {
    if (d[key] !== undefined) out[`--${key}`] = String(d[key]);
    if (t[key] !== d[key] && t[key] !== undefined) out[`--${key}-t`] = String(t[key]);
    if (p[key] !== t[key] && p[key] !== undefined) out[`--${key}-p`] = String(p[key]);
  }
  return out as CSSProperties;
}

const BP_LETTER: Record<Breakpoint, string> = { desktop: "d", tablet: "t", phone: "p" };

/** "d t p" letters for the breakpoints where this node is hidden, or undefined. */
export function hiddenAt(node: { hidden?: boolean; overrides?: Overrides }): string | undefined {
  const out: string[] = [];
  for (const bp of ["desktop", "tablet", "phone"] as const) {
    if (resolveNode(node, bp).hidden) out.push(BP_LETTER[bp]);
  }
  return out.length ? out.join(" ") : undefined;
}

export const px = (n: number | undefined) => (n === undefined ? undefined : `${n}px`);
