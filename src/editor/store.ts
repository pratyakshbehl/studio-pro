import { create } from "zustand";
import {
  createHistory,
  exec,
  redo as historyRedo,
  undo as historyUndo,
  withServerMeta,
  type Breakpoint,
  type Command,
  type History,
  type Media,
  type Project,
} from "../model/index.ts";
import { api, ApiError } from "../lib/api.ts";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";
export type Tool = "select" | "hand";
export type LeftTab = "layers" | "insert" | "media" | "history";

export interface Camera {
  zoom: number;
  x: number;
  y: number;
}

interface EditorState {
  id: string | null;
  history: History | null;
  loadError: string | null;
  /** Bumped on every content change; autosave compares it with what it last sent. */
  version: number;
  savedVersion: number;
  save: { state: SaveState; error?: string; conflict?: Project };

  selection: string[];
  hover: string | null;
  bp: Breakpoint;
  camera: Camera;
  /** Canvas viewport size, reported by the canvas for fit/zoom maths. */
  viewport: { w: number; h: number };
  tool: Tool;
  leftTab: LeftTab;
  renaming: string | null;
  toast: { text: string; tone?: "error" | "info"; at: number } | null;
  nextTitle?: string;
  /** Keeps the insert bar open at a gap while one of its menus is in use. */
  barPin: { x: number; y: number; target: InsertAt } | null;
  /** Images just uploaded together, waiting for a layout choice. */
  pendingLayout: { media: Media[]; target?: InsertAt; x: number; y: number } | null;
  /** Gallery image whose focal point is being set by dragging on the canvas. */
  focalEdit: string | null;
  inspectorTab: "content" | "design";
  /** Rulers along the canvas edges (Ctrl+Shift+R). */
  rulers: boolean;
  /** The 12-column layout grid over the page (Shift+G). */
  columns: boolean;
  /** Guides dragged out of the rulers, in page px from the frame's top-left, per screen size. */
  guides: Record<Breakpoint, Guides>;
  /** Alt is held: show distances between the selection and what's under the pointer. */
  measuring: boolean;
  /** Smart guides while dragging on a free canvas, in viewport px. */
  snapLines: ScreenLine[] | null;
  /** The block whose words are being edited on the page. */
  textEdit: TextEdit | null;
  /** Ctrl+K. */
  palette: boolean;
  /** The `?` keyboard sheet. */
  sheet: boolean;
  /** The project settings drawer. */
  settings: boolean;
  /** A right-click menu, at viewport coordinates. */
  menu: { x: number; y: number; from: "canvas" | "layers" } | null;
}

export interface TextEdit {
  id: string;
  /** A quote's words or its credit. */
  part: "text" | "cite";
  /** Where the double-click landed, for the caret. */
  at?: { x: number; y: number };
}

export interface Guides {
  x: number[];
  y: number[];
}

export interface ScreenLine {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

const NO_GUIDES = (): Record<Breakpoint, Guides> => ({ desktop: { x: [], y: [] }, tablet: { x: [], y: [] }, phone: { x: [], y: [] } });

/** Same shape as actions' InsertTarget, repeated here to keep the store free of action imports. */
export type InsertAt = { sectionId: string; index: number } | { newSectionAt: number };

export const useEditor = create<EditorState>(() => ({
  id: null,
  history: null,
  loadError: null,
  version: 0,
  savedVersion: 0,
  save: { state: "saved" },
  selection: [],
  hover: null,
  bp: "desktop",
  camera: { zoom: 0.6, x: 40, y: 40 },
  viewport: { w: 1200, h: 800 },
  tool: "select",
  leftTab: "layers",
  renaming: null,
  toast: null,
  barPin: null,
  pendingLayout: null,
  focalEdit: null,
  inspectorTab: "content",
  rulers: readPref("rulers"),
  columns: false,
  guides: NO_GUIDES(),
  measuring: false,
  snapLines: null,
  textEdit: null,
  palette: false,
  sheet: false,
  settings: false,
  menu: null,
}));

// The end-to-end tests (tests/e2e) read editor state from here. Studio only ever runs on localhost.
(globalThis as { __studio?: typeof useEditor }).__studio = useEditor;

function readPref(key: string): boolean {
  try {
    return localStorage.getItem(`studio-pro:${key}`) === "1";
  } catch {
    return false;
  }
}
function writePref(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(`studio-pro:${key}`);
    else localStorage.setItem(`studio-pro:${key}`, value);
  } catch {
    /* private window: fine without */
  }
}

const set = useEditor.setState;
const get = useEditor.getState;

export const doc = (): Project => {
  const h = get().history;
  if (!h) throw new Error("No project open");
  return h.doc;
};

/* ── Loading ──────────────────────────────────────────────────────────── */

export async function openProject(id: string) {
  set({ id, history: null, loadError: null, selection: [], hover: null, version: 0, savedVersion: 0, save: { state: "saved" }, guides: loadGuides(id) });
  try {
    const [project, list] = await Promise.all([api.project(id), api.projects().catch(() => [])]);
    if (get().id !== id) return;
    const live = list.filter((p) => p.status === "live" || p.status === "unlisted");
    const i = live.findIndex((p) => p.id === id);
    const next = live.length > 1 ? live[(i + 1) % live.length] : undefined;
    set({ history: createHistory(project), nextTitle: next?.title });
  } catch (e) {
    if (get().id === id) set({ loadError: (e as Error).message });
  }
}

export function closeProject() {
  flushSave();
  set({ id: null, history: null, selection: [], hover: null });
}

/* ── Editing ──────────────────────────────────────────────────────────── */

export function run<A>(cmd: Command<A>, args: A) {
  const h = get().history;
  if (!h) return;
  const next = exec(h, cmd, args);
  if (next === h) return;
  set((s) => ({ history: next, version: s.version + 1, save: { state: "dirty" } }));
  scheduleSave();
}

export function undo() {
  const h = get().history;
  if (!h || !h.past.length) return;
  set((s) => ({ history: historyUndo(h), version: s.version + 1, save: { state: "dirty" } }));
  pruneSelection();
  scheduleSave();
}

export function redo() {
  const h = get().history;
  if (!h || !h.future.length) return;
  set((s) => ({ history: historyRedo(h), version: s.version + 1, save: { state: "dirty" } }));
  pruneSelection();
  scheduleSave();
}

/**
 * Live preview for a drag: each call re-runs the command from the history as
 * it was when the drag began, so a whole drag lands as exactly one undo step
 * however long it takes. The saved rev is carried over in case an autosave
 * finished mid-drag. Call `endPreview` when the pointer lifts.
 */
export function preview<A>(base: History, cmd: Command<A>, args: A) {
  const now = get().history;
  if (!now) return;
  const next = exec({ ...base, past: base.past.map((e) => ({ ...e, mergeKey: undefined })) }, cmd, args);
  // Keep the earlier entries' merge keys intact; only the new entry is ours.
  const fixed = next.past.length === base.past.length ? base : { ...next, past: [...base.past, ...next.past.slice(base.past.length)] };
  set((s) => ({ history: withServerMeta(fixed, { rev: now.doc.rev, updatedAt: now.doc.updatedAt }), version: s.version + 1, save: { state: "dirty" } }));
}
export const endPreview = () => scheduleSave();

/** History panel: undo or redo until `pastLength` steps are applied. */
export function jumpTo(pastLength: number) {
  let h = get().history;
  if (!h) return;
  const start = h;
  while (h.past.length > pastLength) h = historyUndo(h);
  while (h.past.length < pastLength && h.future.length) h = historyRedo(h);
  if (h === start) return;
  set((s) => ({ history: h, version: s.version + 1, save: { state: "dirty" } }));
  pruneSelection();
  scheduleSave();
}

/** After undo/redo a selected node may no longer exist. */
function pruneSelection() {
  const h = get().history;
  if (!h) return;
  const ids = new Set<string>();
  for (const s of h.doc.page.sections) {
    ids.add(s.id);
    for (const b of s.blocks) ids.add(b.id);
  }
  const keep = get().selection.filter((id) => ids.has(id.split("#")[0]) || id.startsWith("chrome:"));
  if (keep.length !== get().selection.length) set({ selection: keep });
}

/* ── Autosave ─────────────────────────────────────────────────────────── */

const SAVE_DELAY = 800;
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null;

function scheduleSave() {
  clearTimeout(timer);
  timer = setTimeout(() => void saveNow(), SAVE_DELAY);
}

export function flushSave() {
  clearTimeout(timer);
  if (get().version !== get().savedVersion) void saveNow();
}

export async function saveNow(): Promise<void> {
  clearTimeout(timer);
  if (inFlight) {
    await inFlight;
    if (get().version !== get().savedVersion) return saveNow();
    return;
  }
  const { history, version, savedVersion, save } = get();
  if (!history || version === savedVersion || save.state === "conflict") return;
  set({ save: { state: "saving" } });
  inFlight = (async () => {
    try {
      const saved = await api.save(history.doc);
      const now = get();
      if (!now.history || now.id !== saved.id) return;
      set({
        history: withServerMeta(now.history, { rev: saved.rev, updatedAt: saved.updatedAt }),
        savedVersion: version,
        save: { state: version === now.version ? "saved" : "dirty" },
      });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) set({ save: { state: "conflict", conflict: err.body.current as Project } });
      else set({ save: { state: "error", error: err.message } });
    } finally {
      inFlight = null;
    }
  })();
  await inFlight;
  if (get().version !== get().savedVersion && get().save.state === "dirty") scheduleSave();
}

/** Conflict: keep this tab's version on top of whatever is on disk. */
export async function keepMine() {
  const { history, save } = get();
  if (!history || !save.conflict) return;
  set({
    history: withServerMeta(history, { rev: save.conflict.rev, updatedAt: save.conflict.updatedAt }),
    save: { state: "dirty" },
  });
  await saveNow();
}

/** Conflict: drop this tab's changes and load what's on disk. */
export function takeTheirs() {
  const { save, id } = get();
  if (!save.conflict || !id) return;
  set({ history: createHistory(save.conflict), selection: [], save: { state: "saved" }, version: 0, savedVersion: 0 });
}

/* ── Selection ────────────────────────────────────────────────────────── */

export function select(ids: string[], mode: "replace" | "toggle" | "add" = "replace") {
  // Selecting something else finishes any text editing.
  const te = get().textEdit;
  if (te && (mode !== "replace" || ids.length !== 1 || ids[0] !== te.id)) set({ textEdit: null });
  if (mode === "replace") return set({ selection: ids });
  const current = new Set(get().selection);
  for (const id of ids) {
    if (mode === "toggle" && current.has(id)) current.delete(id);
    else current.add(id);
  }
  set({ selection: [...current] });
}

export const setHover = (hover: string | null) => {
  if (get().hover !== hover) set({ hover });
};

/* ── View ─────────────────────────────────────────────────────────────── */

export const setBp = (bp: Breakpoint) => set({ bp });
export const setTool = (tool: Tool) => set({ tool });
export const setLeftTab = (leftTab: LeftTab) => set({ leftTab });
export const setCamera = (camera: Partial<Camera>) => set((s) => ({ camera: { ...s.camera, ...camera } }));
export const setViewport = (w: number, h: number) => set({ viewport: { w, h } });
export const setRenaming = (renaming: string | null) => set({ renaming });
export const setBarPin = (barPin: EditorState["barPin"]) => set({ barPin });
export const setPendingLayout = (pendingLayout: EditorState["pendingLayout"]) => set({ pendingLayout });
export const setFocalEdit = (focalEdit: string | null) => set({ focalEdit });
export const setInspectorTab = (inspectorTab: "content" | "design") => set({ inspectorTab });
export const setMeasuring = (measuring: boolean) => get().measuring !== measuring && set({ measuring });
export const setTextEdit = (textEdit: TextEdit | null) => {
  set(textEdit ? { textEdit, selection: [textEdit.id], hover: null } : { textEdit: null });
};
export const setMenu = (menu: EditorState["menu"]) => set({ menu });
export const setPalette = (palette: boolean) => set({ palette, menu: null });
export const setSheet = (sheet: boolean) => set({ sheet });
export const setSettingsOpen = (settings: boolean) => set({ settings, menu: null, palette: false });
export const setSnapLines = (snapLines: ScreenLine[] | null) => set({ snapLines });

export function toggleRulers() {
  const rulers = !get().rulers;
  set({ rulers });
  writePref("rulers", rulers ? "1" : null);
}
export const toggleColumns = () => set((s) => ({ columns: !s.columns }));

function loadGuides(id: string): Record<Breakpoint, Guides> {
  try {
    const raw = localStorage.getItem(`studio-pro:guides:${id}`);
    return raw ? { ...NO_GUIDES(), ...JSON.parse(raw) } : NO_GUIDES();
  } catch {
    return NO_GUIDES();
  }
}

/** Replace the current screen size's guides (they're per project, kept in this browser). */
export function setGuides(guides: Guides) {
  const { id, bp } = get();
  const all = { ...get().guides, [bp]: guides };
  set({ guides: all });
  if (id) writePref(`guides:${id}`, JSON.stringify(all));
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, tone: "error" | "info" = "info") {
  clearTimeout(toastTimer);
  set({ toast: { text, tone, at: Date.now() } });
  toastTimer = setTimeout(() => set({ toast: null }), tone === "error" ? 6000 : 3200);
}
