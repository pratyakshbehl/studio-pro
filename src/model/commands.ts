import type {
  Block,
  Breakpoint,
  Overrides,
  PageChrome,
  PageStyle,
  Patch,
  Project,
  Section,
  SmallBreakpoint,
} from "./schema.ts";
import { assignDeep } from "./merge.ts";
import { clampIndex, findBlock, findSection } from "./tree.ts";

/**
 * Commands are the only way a project changes. Each runs against an Immer
 * draft, so history.ts gets exact undo/redo patches for free, and the same list
 * later feeds the shortcut sheet and the Ctrl+K palette.
 *
 * A command must be deterministic: anything random (new ids, clones) is made
 * before the call and passed in through `args`.
 */
export interface Command<A> {
  name: string;
  label: string;
  run: (draft: Project, args: A) => void;
  /** Consecutive runs with the same key inside a short window become one undo step. */
  mergeKey?: (args: A) => string | undefined;
  /** History label for this particular call, when it says more than `label`. */
  describe?: (args: A) => string;
}

export function command<A>(
  name: string,
  label: string,
  run: (draft: Project, args: A) => void,
  mergeKey?: (args: A) => string | undefined,
  describe?: (args: A) => string,
): Command<A> {
  return { name, label, run, mergeKey, describe };
}

/** One command call, ready to run inside a batch. */
export interface Step {
  run: (draft: Project) => void;
}

export function step<A>(cmd: Command<A>, args: A): Step {
  return { run: (draft) => cmd.run(draft, args) };
}

/** Several commands as one undo step, e.g. deleting a multi-selection or dropping five files. */
export const batch = command<{ label: string; steps: Step[] }>(
  "batch",
  "Edit",
  (draft, { steps }) => {
    for (const s of steps) s.run(draft);
  },
  undefined,
  ({ label }) => label,
);

/** Keys a generic update must never touch. */
const PROJECT_LOCKED = new Set(["id", "rev", "schemaVersion", "createdAt", "updatedAt", "page", "origin"]);
const NODE_LOCKED = new Set(["id", "type", "blocks", "overrides"]);

function strip(patch: Patch, locked: Set<string>): Patch {
  return Object.fromEntries(Object.entries(patch).filter(([k]) => !locked.has(k)));
}

const keysOf = (patch: Patch) => Object.keys(patch).sort().join(",");

function writeOverride(node: { overrides?: Overrides }, bp: Breakpoint, patch: Patch): void {
  if (bp === "desktop") return;
  const overrides = (node.overrides ??= {});
  const current = (overrides[bp] ??= {});
  assignDeep(current, patch);
  pruneOverride(node, bp);
}

function pruneOverride(node: { overrides?: Overrides }, bp: SmallBreakpoint): void {
  if (node.overrides?.[bp] && Object.keys(node.overrides[bp]!).length === 0) delete node.overrides[bp];
  if (node.overrides && Object.keys(node.overrides).length === 0) delete node.overrides;
}

function clearOverride(node: { overrides?: Overrides }, bp: SmallBreakpoint, key?: string): void {
  if (!node.overrides?.[bp]) return;
  if (key) delete node.overrides[bp]![key];
  else delete node.overrides[bp];
  pruneOverride(node, bp);
}

function requireSection(doc: Project, id: string): Section {
  const hit = findSection(doc, id);
  if (!hit) throw new Error(`Section ${id} not found`);
  return hit.section;
}

function requireBlock(doc: Project, id: string): Block {
  const hit = findBlock(doc, id);
  if (!hit) throw new Error(`Block ${id} not found`);
  return hit.block;
}

/** History labels from what a patch touches, e.g. "Change type", "Resize grid". */
const KEY_LABEL: Record<string, string> = {
  font: "Change type",
  style: "Change style",
  effects: "Change effects",
  media: "Replace media",
  items: "Edit gallery images",
  bento: "Resize grid",
  mode: "Change layout",
  text: "Edit text",
  html: "Edit text",
  caption: "Edit caption",
  cite: "Edit credit",
  width: "Change width",
  aspect: "Change shape",
  fit: "Change fit",
  align: "Change alignment",
  rowHeight: "Change row height",
  gap: "Change gap",
  columns: "Change columns",
  frame: "Move",
  hidden: "Hide or show",
  locked: "Lock or unlock",
  name: "Rename",
  url: "Edit link",
  level: "Change heading size",
  preset: "Change text style",
  rows: "Edit facts",
  auto: "Edit facts",
  source: "Change source",
  title: "Edit title",
  layout: "Change layout",
  before: "Set before image",
  after: "Set after image",
  peaks: "Measure waveform",
  chapters: "Edit chapters",
  steps: "Edit steps",
  colors: "Edit colours",
  tracks: "Edit tracks",
  frames: "Edit frames",
  label: "Edit label",
  href: "Edit link",
  prompt: "Edit prompt",
  family: "Change typeface",
  src: "Change file",
};
const describePatch = (patch: Patch, fallback: string) => KEY_LABEL[Object.keys(patch)[0]] ?? fallback;
const BP_TAG: Record<string, string> = { tablet: " · tablet", phone: " · phone" };

/* ── Project ──────────────────────────────────────────────────────────── */

export const projectUpdate = command<{ patch: Partial<Project> }>(
  "project.update",
  "Edit project details",
  (draft, { patch }) => assignDeep(draft as unknown as Patch, strip(patch as Patch, PROJECT_LOCKED)),
  ({ patch }) => `project:${keysOf(patch as Patch)}`,
);

export const pageStyle = command<{ patch: Partial<PageStyle> }>(
  "page.style",
  "Edit page style",
  (draft, { patch }) => assignDeep(draft.page.style as unknown as Patch, patch as Patch),
  ({ patch }) => `page.style:${keysOf(patch as Patch)}`,
);

export const pageChrome = command<{ patch: Partial<PageChrome> }>(
  "page.chrome",
  "Show or hide page parts",
  (draft, { patch }) => assignDeep(draft.page.chrome as unknown as Patch, patch as Patch),
);

/** Keys a restore leaves alone: identity and save bookkeeping. */
const RESTORE_KEEP = new Set(["id", "rev", "createdAt", "updatedAt", "schemaVersion"]);

export const projectRestore = command<{ doc: Project; label: string }>(
  "project.restore",
  "Restore version",
  (draft, { doc }) => {
    const target = draft as unknown as Patch;
    for (const k of Object.keys(target)) if (!RESTORE_KEEP.has(k)) delete target[k];
    for (const [k, v] of Object.entries(doc)) if (!RESTORE_KEEP.has(k)) target[k] = structuredClone(v);
  },
  undefined,
  ({ label }) => `Restore “${label}”`,
);

/* ── Sections ─────────────────────────────────────────────────────────── */

export const sectionInsert = command<{ section: Section; index?: number }>(
  "section.insert",
  "Add section",
  (draft, { section, index }) => {
    const list = draft.page.sections;
    list.splice(clampIndex(index ?? list.length, list.length), 0, structuredClone(section));
  },
);

export const sectionRemove = command<{ id: string }>("section.remove", "Delete section", (draft, { id }) => {
  const hit = findSection(draft, id);
  if (hit) draft.page.sections.splice(hit.index, 1);
});

export const sectionMove = command<{ id: string; index: number }>("section.move", "Move section", (draft, { id, index }) => {
  const hit = findSection(draft, id);
  if (!hit) return;
  const list = draft.page.sections;
  const [section] = list.splice(hit.index, 1);
  list.splice(clampIndex(index, list.length), 0, section);
});

export const sectionUpdate = command<{ id: string; patch: Patch }>(
  "section.update",
  "Edit section",
  (draft, { id, patch }) => assignDeep(requireSection(draft, id) as unknown as Patch, strip(patch, NODE_LOCKED)),
  ({ id, patch }) => `section:${id}:${keysOf(patch)}`,
  ({ patch }) => describePatch(patch, "Edit section")
);

export const sectionOverride = command<{ id: string; bp: Breakpoint; patch: Patch }>(
  "section.override",
  "Edit section for this screen size",
  (draft, { id, bp, patch }) => writeOverride(requireSection(draft, id), bp, strip(patch, NODE_LOCKED)),
  ({ id, bp, patch }) => `section:${id}:${bp}:${keysOf(patch)}`,
  ({ patch, bp }) => describePatch(patch, "Edit section") + (BP_TAG[bp] ?? "")
);

export const sectionClearOverride = command<{ id: string; bp: SmallBreakpoint; key?: string }>(
  "section.clearOverride",
  "Reset to desktop",
  (draft, { id, bp, key }) => clearOverride(requireSection(draft, id), bp, key),
);

/* ── Blocks ───────────────────────────────────────────────────────────── */

export const blockInsert = command<{ sectionId: string; block: Block; index?: number }>(
  "block.insert",
  "Add block",
  (draft, { sectionId, block, index }) => {
    const list = requireSection(draft, sectionId).blocks;
    list.splice(clampIndex(index ?? list.length, list.length), 0, structuredClone(block));
  },
);

export const blockRemove = command<{ id: string }>("block.remove", "Delete block", (draft, { id }) => {
  const hit = findBlock(draft, id);
  if (hit) hit.section.blocks.splice(hit.index, 1);
});

/** `index` is the position in the target section after the block has left its old spot. */
export const blockMove = command<{ id: string; sectionId: string; index: number }>(
  "block.move",
  "Move block",
  (draft, { id, sectionId, index }) => {
    const hit = findBlock(draft, id);
    const target = findSection(draft, sectionId);
    if (!hit || !target) return;
    const [block] = hit.section.blocks.splice(hit.index, 1);
    target.section.blocks.splice(clampIndex(index, target.section.blocks.length), 0, block);
  },
);

/**
 * Move several blocks (in story order) into a section, just before `before`
 * (a block that isn't moving) or at the end. Used by drag-to-reorder.
 */
export const blocksMove = command<{ ids: string[]; sectionId: string; before: string | null }>(
  "block.moveMany",
  "Move blocks",
  (draft, { ids, sectionId, before }) => {
    if (!findSection(draft, sectionId) || (before && ids.includes(before))) return;
    const moving: Block[] = [];
    for (const s of draft.page.sections)
      for (let i = s.blocks.length - 1; i >= 0; i--) if (ids.includes(s.blocks[i].id)) moving.unshift(...s.blocks.splice(i, 1));
    moving.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    const list = findSection(draft, sectionId)!.section.blocks;
    const at = before ? list.findIndex((b) => b.id === before) : -1;
    list.splice(at < 0 ? list.length : at, 0, ...moving);
  },
  undefined,
  ({ ids }) => (ids.length > 1 ? `Move ${ids.length} blocks` : "Move block"),
);

export const blockUpdate = command<{ id: string; patch: Patch }>(
  "block.update",
  "Edit block",
  (draft, { id, patch }) => assignDeep(requireBlock(draft, id) as unknown as Patch, strip(patch, NODE_LOCKED)),
  ({ id, patch }) => `block:${id}:${keysOf(patch)}`,
  ({ patch }) => describePatch(patch, "Edit block")
);

export const blockOverride = command<{ id: string; bp: Breakpoint; patch: Patch }>(
  "block.override",
  "Edit block for this screen size",
  (draft, { id, bp, patch }) => writeOverride(requireBlock(draft, id), bp, strip(patch, NODE_LOCKED)),
  ({ id, bp, patch }) => `block:${id}:${bp}:${keysOf(patch)}`,
  ({ patch, bp }) => describePatch(patch, "Edit block") + (BP_TAG[bp] ?? "")
);

export const blockClearOverride = command<{ id: string; bp: SmallBreakpoint; key?: string }>(
  "block.clearOverride",
  "Reset to desktop",
  (draft, { id, bp, key }) => clearOverride(requireBlock(draft, id), bp, key),
);

export const COMMANDS = [
  batch,
  projectUpdate,
  pageStyle,
  pageChrome,
  projectRestore,
  sectionInsert,
  sectionRemove,
  sectionMove,
  sectionUpdate,
  sectionOverride,
  sectionClearOverride,
  blockInsert,
  blockRemove,
  blockMove,
  blockUpdate,
  blockOverride,
  blockClearOverride,
];
