/**
 * Every command in the editor, in one place: its name, its keys, and what it
 * does. The keyboard handler, the `?` sheet, the Ctrl+K palette and the
 * right-click menus all read from here, so a shortcut shown anywhere is the
 * shortcut that works.
 */
import { BREAKPOINTS, findBlock, findSection, type Breakpoint } from "../model/index.ts";
import {
  redo,
  saveNow,
  select,
  setBp,
  setFocalEdit,
  setLeftTab,
  setRenaming,
  setSettingsOpen,
  setTextEdit,
  setTool,
  toggleColumns,
  toggleRulers,
  undo,
  useEditor,
} from "./store.ts";
import {
  copySelection,
  deleteSelection,
  duplicateSelection,
  moveSelection,
  pasteFrom,
  saveSelectionAsSection,
  selectAll,
  selectChild,
  selectParent,
  TEXTUAL,
  toggleHidden,
  toggleLocked,
} from "./actions.ts";
import { zoomBy, zoomTo100, zoomToFit, zoomToSelection } from "./camera.ts";
import { convertToCanvas, freeGroup, isFree, nudge, zOrder } from "./canvasOps.ts";

export type CmdGroup = "Edit" | "Select" | "Arrange" | "View" | "Panels";

export interface Cmd {
  id: string;
  label: string;
  group: CmdGroup;
  /** Shown to people: words separated by spaces are keys pressed together; " · " separates alternatives. */
  keys?: string;
  /** What the keyboard matches: "mod+shift+z", "alt+arrowup", "code:BracketRight", "?". */
  bind?: string[];
  /** Also works while typing in a field (undo, save, preview). */
  global?: boolean;
  /** Left out of the palette (they only make sense as keys). */
  keyOnly?: boolean;
  enabled?: () => boolean;
  /** Return false when there was nothing to do, so the key does its usual thing. */
  run: (e?: KeyboardEvent) => boolean | void;
}

const st = () => useEditor.getState();
const docOf = () => st().history?.doc;
const single = () => (st().selection.length === 1 ? st().selection[0] : null);
const hasSelection = () => st().selection.length > 0;
const isNode = (id: string | null) => {
  const d = docOf();
  return !!(id && d && !id.includes("#") && !id.startsWith("chrome:") && (findSection(d, id) || findBlock(d, id)));
};
const onFreeCanvas = () => {
  const d = docOf();
  return !!d && !!freeGroup(d, st().selection, st().bp);
};
const textual = () => {
  const id = single();
  const d = docOf();
  return !!(id && d && TEXTUAL.has(findBlock(d, id)?.block.type ?? ""));
};
const sectionSelected = () => {
  const id = single();
  const d = docOf();
  return !!(id && d && findSection(d, id));
};

/** Plain events the palette and menus can fire for things the Editor component owns. */
export const openPalette = () => useEditor.setState({ palette: true, menu: null });
export const toggleSheet = () => useEditor.setState((s) => ({ sheet: !s.sheet, menu: null }));

function arrow(e: KeyboardEvent | undefined, dx: number, dy: number) {
  const n = e?.shiftKey ? 10 : 1;
  return nudge(dx * n, dy * n);
}

const bpCmd = (bp: Breakpoint, n: number): Cmd => ({
  id: `view.${bp}`,
  label: `${BREAKPOINTS[bp].label} (${BREAKPOINTS[bp].preview}px)`,
  group: "View",
  keys: `Alt ${n}`,
  bind: [`alt+code:Digit${n}`],
  run: () => setBp(bp),
});

export const COMMANDS: Cmd[] = [
  /* Edit */
  { id: "edit.undo", label: "Undo", group: "Edit", keys: "Ctrl Z", bind: ["mod+z"], global: true, enabled: () => !!st().history?.past.length, run: undo },
  { id: "edit.redo", label: "Redo", group: "Edit", keys: "Ctrl Shift Z · Ctrl Y", bind: ["mod+shift+z", "mod+y"], global: true, enabled: () => !!st().history?.future.length, run: redo },
  { id: "edit.copy", label: "Copy", group: "Edit", keys: "Ctrl C", bind: ["mod+c"], enabled: hasSelection, run: () => void copySelection() },
  { id: "edit.cut", label: "Cut", group: "Edit", keys: "Ctrl X", bind: ["mod+x"], enabled: hasSelection, run: () => void copySelection(true) },
  {
    id: "edit.paste",
    label: "Paste",
    group: "Edit",
    keys: "Ctrl V",
    // The keyboard paste arrives as a paste event (with the clipboard); this is for menus.
    run: () => {
      navigator.clipboard
        ?.read?.()
        .then(async (items) => {
          const dt = new DataTransfer();
          for (const item of items)
            for (const type of item.types) {
              const blob = await item.getType(type);
              if (type.startsWith("text/")) dt.setData(type, await blob.text());
              else dt.items.add(new File([blob], `pasted.${type.split("/")[1]}`, { type }));
            }
          await pasteFrom(dt);
        })
        .catch(() => void 0);
    },
  },
  { id: "edit.duplicate", label: "Duplicate", group: "Edit", keys: "Ctrl D", bind: ["mod+d"], enabled: hasSelection, run: duplicateSelection },
  { id: "edit.delete", label: "Delete", group: "Edit", keys: "Delete", bind: ["delete", "backspace"], enabled: hasSelection, run: deleteSelection },
  {
    id: "edit.text",
    label: "Edit text on the page",
    group: "Edit",
    keys: "Enter · Double-click",
    enabled: textual,
    run: () => {
      const id = single();
      if (id) setTextEdit({ id, part: "text" });
    },
  },
  {
    id: "edit.rename",
    label: "Rename",
    group: "Edit",
    keys: "Ctrl R",
    bind: ["mod+r"],
    enabled: () => isNode(single()),
    run: () => {
      const id = single();
      if (!id || !isNode(id)) return false;
      setLeftTab("layers");
      setRenaming(id);
    },
  },
  { id: "edit.lock", label: "Lock or unlock", group: "Edit", keys: "Ctrl L", bind: ["mod+l"], enabled: hasSelection, run: () => toggleLocked() },
  { id: "edit.hide", label: "Hide or show on this screen size", group: "Edit", keys: "Ctrl ;", bind: ["mod+;"], enabled: hasSelection, run: () => toggleHidden() },
  { id: "edit.save", label: "Save now", group: "Edit", keys: "Ctrl S", bind: ["mod+s"], global: true, run: () => void saveNow() },
  {
    id: "edit.preview",
    label: "Preview in a new tab",
    group: "Edit",
    keys: "Ctrl P",
    bind: ["mod+p"],
    global: true,
    run: () => void window.open(`/preview/${st().id}`, "_blank", "noreferrer"),
  },

  /* Select */
  { id: "select.all", label: "Select all in the section", group: "Select", keys: "Ctrl A", bind: ["mod+a"], run: selectAll },
  {
    id: "select.sections",
    label: "Select all sections",
    group: "Select",
    keys: "F",
    bind: ["f"],
    run: () => {
      const d = docOf();
      if (d) select(d.page.sections.map((x) => x.id));
    },
  },
  {
    id: "select.parent",
    label: "Select parent",
    group: "Select",
    keys: "Esc",
    bind: ["escape"],
    enabled: hasSelection,
    run: () => {
      if (st().focalEdit) setFocalEdit(null);
      else selectParent();
    },
  },
  {
    id: "select.child",
    label: "Into the section · edit the block",
    group: "Select",
    keys: "Enter",
    bind: ["enter"],
    keyOnly: true,
    enabled: () => !!single(),
    run: () => {
      const id = single();
      if (!id) return false;
      if (sectionSelected()) selectChild();
      else if (textual()) setTextEdit({ id, part: "text" });
      else window.dispatchEvent(new Event("studio:edit"));
    },
  },

  /* Arrange */
  { id: "arrange.up", label: "Move up the story", group: "Arrange", keys: "Alt ↑", bind: ["alt+arrowup"], enabled: hasSelection, run: () => moveSelection(-1) },
  { id: "arrange.down", label: "Move down the story", group: "Arrange", keys: "Alt ↓", bind: ["alt+arrowdown"], enabled: hasSelection, run: () => moveSelection(1) },
  { id: "arrange.nudgeLeft", label: "Nudge left", group: "Arrange", keys: "← · Shift ←", bind: ["arrowleft", "shift+arrowleft"], keyOnly: true, run: (e) => arrow(e, -1, 0) },
  { id: "arrange.nudgeRight", label: "Nudge right", group: "Arrange", keys: "→ · Shift →", bind: ["arrowright", "shift+arrowright"], keyOnly: true, run: (e) => arrow(e, 1, 0) },
  { id: "arrange.nudgeUp", label: "Nudge up", group: "Arrange", keys: "↑ · Shift ↑", bind: ["arrowup", "shift+arrowup"], keyOnly: true, run: (e) => arrow(e, 0, -1) },
  { id: "arrange.nudgeDown", label: "Nudge down", group: "Arrange", keys: "↓ · Shift ↓", bind: ["arrowdown", "shift+arrowdown"], keyOnly: true, run: (e) => arrow(e, 0, 1) },
  { id: "arrange.forward", label: "Bring forward", group: "Arrange", keys: "]", bind: ["code:BracketRight"], enabled: onFreeCanvas, run: () => zOrder("forward") },
  { id: "arrange.backward", label: "Send backward", group: "Arrange", keys: "[", bind: ["code:BracketLeft"], enabled: onFreeCanvas, run: () => zOrder("backward") },
  { id: "arrange.front", label: "Bring to front", group: "Arrange", keys: "Shift ]", bind: ["shift+code:BracketRight"], enabled: onFreeCanvas, run: () => zOrder("front") },
  { id: "arrange.back", label: "Send to back", group: "Arrange", keys: "Shift [", bind: ["shift+code:BracketLeft"], enabled: onFreeCanvas, run: () => zOrder("back") },
  {
    id: "edit.saveSection",
    label: "Save to Your sections",
    group: "Edit",
    enabled: () => {
      const d = docOf();
      return !!d && st().selection.some((id) => !id.includes("#") && !id.startsWith("chrome:"));
    },
    run: () => void saveSelectionAsSection(),
  },
  {
    id: "arrange.freeCanvas",
    label: "Make this section a free canvas",
    group: "Arrange",
    enabled: () => {
      const id = single();
      const d = docOf();
      const s = id && d ? findSection(d, id)?.section : null;
      return !!s && !isFree(s, "desktop") && st().bp === "desktop";
    },
    run: () => {
      const id = single();
      if (id) convertToCanvas(id);
    },
  },

  /* View */
  bpCmd("desktop", 1),
  bpCmd("tablet", 2),
  bpCmd("phone", 3),
  { id: "view.zoomIn", label: "Zoom in", group: "View", keys: "Ctrl =", bind: ["mod+=", "mod++"], run: () => zoomBy(1.25) },
  { id: "view.zoomOut", label: "Zoom out", group: "View", keys: "Ctrl −", bind: ["mod+-"], run: () => zoomBy(0.8) },
  { id: "view.zoom100", label: "Zoom to 100%", group: "View", keys: "Shift 0 · Ctrl 0", bind: ["shift+code:Digit0", "mod+code:Digit0"], run: zoomTo100 },
  { id: "view.fit", label: "Zoom to fit", group: "View", keys: "Shift 1", bind: ["shift+code:Digit1"], run: zoomToFit },
  { id: "view.zoomSelection", label: "Zoom to selection", group: "View", keys: "Shift 2", bind: ["shift+code:Digit2"], enabled: hasSelection, run: zoomToSelection },
  { id: "view.rulers", label: "Show or hide rulers and guides", group: "View", keys: "Ctrl Shift R", bind: ["mod+shift+r"], global: true, run: toggleRulers },
  { id: "view.columns", label: "Show or hide layout columns", group: "View", keys: "Shift G", bind: ["shift+g"], run: toggleColumns },
  { id: "view.select", label: "Select tool", group: "View", keys: "V", bind: ["v"], run: () => setTool("select") },
  { id: "view.hand", label: "Hand tool", group: "View", keys: "H · hold Space", bind: ["h"], run: () => setTool("hand") },

  /* Panels */
  { id: "panel.settings", label: "Project settings", group: "Panels", keys: "Ctrl ,", bind: ["mod+,"], global: true, run: () => setSettingsOpen(!st().settings) },
  { id: "panel.palette", label: "Command palette", group: "Panels", keys: "Ctrl K", bind: ["mod+k"], keyOnly: true, global: true, run: openPalette },
  { id: "panel.layers", label: "Layers", group: "Panels", keys: "L", bind: ["l"], run: () => setLeftTab("layers") },
  { id: "panel.insert", label: "Insert", group: "Panels", keys: "I", bind: ["i"], run: () => setLeftTab("insert") },
  { id: "panel.media", label: "Media library", group: "Panels", keys: "M", bind: ["m"], run: () => setLeftTab("media") },
  { id: "panel.history", label: "History and versions", group: "Panels", keys: "Shift H", bind: ["shift+h"], run: () => setLeftTab("history") },
  { id: "panel.shortcuts", label: "Keyboard shortcuts", group: "Panels", keys: "?", bind: ["?"], run: toggleSheet },
];

export const command = (id: string) => COMMANDS.find((c) => c.id === id)!;

/** Things done with the mouse or held keys: shown on the sheet, not bound here. */
export const GESTURES: { group: CmdGroup | "Text"; keys: string; label: string }[] = [
  { group: "Select", keys: "Click · Shift click", label: "Select · add to the selection" },
  { group: "Select", keys: "Drag on empty canvas", label: "Select an area" },
  { group: "Select", keys: "Double-click", label: "Into a gallery image · edit words" },
  { group: "Select", keys: "Right-click", label: "Menu for what's under the pointer" },
  { group: "Arrange", keys: "Drag a block", label: "Move it in the story (or on a free canvas)" },
  { group: "Arrange", keys: "Shift drag · Ctrl drag", label: "Free canvas: one axis · no snapping" },
  { group: "Arrange", keys: "Shift resize · Alt resize", label: "Free canvas: keep shape · from the centre" },
  { group: "View", keys: "Hold Alt", label: "Distances to what's under the pointer" },
  { group: "View", keys: "Ctrl scroll", label: "Zoom at the pointer" },
  { group: "View", keys: "Drag a ruler", label: "Add a guide (drag it back to remove)" },
  { group: "Text", keys: "Ctrl B · Ctrl I · Ctrl U", label: "Bold · italic · underline" },
  { group: "Text", keys: "Ctrl K", label: "Link (while editing text)" },
  { group: "Text", keys: "- space · 1. space · > space", label: "List · numbered list · quote" },
  { group: "Text", keys: "Esc · Enter", label: "Finish editing (Enter in headings)" },
];

/* ── Matching ─────────────────────────────────────────────────────────── */

interface Binding {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  key?: string;
  code?: string;
}

function parse(spec: string): Binding {
  const parts = spec.split("+");
  // "mod++" is mod with the "+" key.
  if (spec.endsWith("++")) parts.splice(parts.length - 2, 2, "+");
  const last = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  return {
    mod: mods.has("mod"),
    shift: mods.has("shift"),
    alt: mods.has("alt"),
    ...(last.startsWith("code:") ? { code: last.slice(5) } : { key: last }),
  };
}

const BINDINGS = COMMANDS.flatMap((cmd) => (cmd.bind ?? []).map((spec) => ({ cmd, b: parse(spec) })));

function matches(b: Binding, e: KeyboardEvent): boolean {
  if (b.mod !== (e.ctrlKey || e.metaKey) || b.alt !== e.altKey) return false;
  if (b.code) return e.code === b.code && b.shift === e.shiftKey;
  const key = e.key.toLowerCase();
  if (key !== b.key) return false;
  // Letters and named keys care about Shift; symbols like "?" already include it.
  return /^[a-z]$|^arrow|^(escape|enter|delete|backspace)$/.test(b.key) ? b.shift === e.shiftKey : true;
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/** The editor's one keydown handler. */
export function handleKey(e: KeyboardEvent) {
  const s = st();
  // Something closer to the focus already handled it (the text editor's Ctrl+K link, say).
  if (!s.history || s.palette || s.menu || e.defaultPrevented) return;
  const typing = isTyping(e.target);
  // Enter and Space on a focused button or link press it, as they should.
  if ((e.key === "Enter" || e.key === " ") && (e.target as Element | null)?.closest?.("button, a[href], summary, [role=menuitem], [role=option], [role=tab]")) return;
  for (const { cmd, b } of BINDINGS) {
    if (!matches(b, e)) continue;
    // In a field, or with a drawer or sheet over the canvas, only the global keys (undo, save…) act,
    // plus the key that opened the sheet, so it closes it again.
    const closesSheet = s.sheet && !typing && cmd.id === "panel.shortcuts";
    if ((typing || s.settings || s.sheet) && !cmd.global && !closesSheet) return;
    if (cmd.enabled && !cmd.enabled()) return;
    if (cmd.run(e) !== false) e.preventDefault();
    return;
  }
}
