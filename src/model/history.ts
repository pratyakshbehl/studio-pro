import { applyPatches, enablePatches, produceWithPatches, type Patch as ImmerPatch } from "immer";
import type { Project } from "./schema.ts";
import type { Command } from "./commands.ts";

enablePatches();

export interface HistoryEntry {
  name: string;
  label: string;
  patches: ImmerPatch[];
  inverse: ImmerPatch[];
  at: number;
  mergeKey?: string;
}

export interface History {
  doc: Project;
  past: HistoryEntry[];
  future: HistoryEntry[];
}

/** Slider drags and typing within this window collapse into one undo step. */
export const MERGE_WINDOW_MS = 800;
export const HISTORY_LIMIT = 500;

export function createHistory(doc: Project): History {
  return { doc, past: [], future: [] };
}

/** Run a command. A no-op (no patches) leaves history untouched. */
export function exec<A>(history: History, cmd: Command<A>, args: A, now = Date.now()): History {
  const [doc, patches, inverse] = produceWithPatches(history.doc, (draft) => {
    cmd.run(draft as Project, args);
  });
  if (patches.length === 0) return history;

  const mergeKey = cmd.mergeKey?.(args);
  const last = history.past[history.past.length - 1];
  if (mergeKey && last && last.mergeKey === mergeKey && now - last.at < MERGE_WINDOW_MS) {
    const merged: HistoryEntry = {
      ...last,
      patches: [...last.patches, ...patches],
      inverse: [...inverse, ...last.inverse],
      at: now,
    };
    return { doc, past: [...history.past.slice(0, -1), merged], future: [] };
  }

  const entry: HistoryEntry = {
    name: cmd.name,
    label: cmd.describe?.(args) ?? cmd.label,
    patches,
    inverse,
    at: now,
    mergeKey,
  };
  const past = [...history.past, entry];
  return { doc, past: past.length > HISTORY_LIMIT ? past.slice(-HISTORY_LIMIT) : past, future: [] };
}

export function undo(history: History): History {
  const entry = history.past[history.past.length - 1];
  if (!entry) return history;
  return {
    doc: applyPatches(history.doc, entry.inverse),
    past: history.past.slice(0, -1),
    future: [entry, ...history.future],
  };
}

export function redo(history: History): History {
  const [entry, ...future] = history.future;
  if (!entry) return history;
  return {
    doc: applyPatches(history.doc, entry.patches),
    past: [...history.past, { ...entry, mergeKey: undefined }],
    future,
  };
}

/**
 * After a save, the server returns a new `rev`/`updatedAt`. Those aren't user
 * edits, so they change the document without becoming an undo step. Undo
 * patches only touch the paths they edited, so they still apply.
 */
export function withServerMeta(history: History, meta: Pick<Project, "rev" | "updatedAt">): History {
  return { ...history, doc: { ...history.doc, ...meta } };
}

export const canUndo = (history: History) => history.past.length > 0;
export const canRedo = (history: History) => history.future.length > 0;
