import { useCallback, useEffect, useState } from "react";
import { projectRestore } from "../model/index.ts";
import { api, type SnapshotInfo } from "../lib/api.ts";
import { timeAgo } from "../lib/format.ts";
import { Icon } from "../ui/icons.tsx";
import { jumpTo, run, saveNow, toast, useEditor } from "./store.ts";

/**
 * Left-panel History tab. Steps: every change this session, newest first;
 * click one to go back (or forward) to just after it. Versions: named copies
 * saved to disk that survive closing Studio, restorable in one undoable step.
 */
export function HistoryPanel() {
  const history = useEditor((s) => s.history);
  const id = useEditor((s) => s.id);
  const [versions, setVersions] = useState<SnapshotInfo[] | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (id) api.snapshots(id).then(setVersions).catch(() => setVersions([]));
  }, [id]);
  useEffect(load, [load]);

  if (!history || !id) return null;
  const past = history.past;
  const future = history.future;

  const save = async () => {
    setBusy(true);
    try {
      await saveNow();
      await api.saveVersion(id, name || `Version ${(versions?.length ?? 0) + 1}`);
      toast("Version saved");
      setNaming(false);
      setName("");
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (v: SnapshotInfo) => {
    setBusy(true);
    try {
      await saveNow();
      // Keep a way back: the current state becomes a version first.
      await api.saveVersion(id, `Before restoring “${v.label}”`);
      const snap = await api.snapshot(id, v.file);
      run(projectRestore, { doc: snap.doc, label: v.label });
      toast(`Restored “${v.label}”. Undo brings back what you had.`);
      setConfirm(null);
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-scroll history-panel">
      <div className="layers-group">
        <h3>Versions</h3>
        {naming ? (
          <form
            className="version-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input
              className="input"
              autoFocus
              value={name}
              placeholder="Name, e.g. Before client feedback"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setNaming(false)}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              Save
            </button>
          </form>
        ) : (
          <button type="button" className="btn btn-sm btn-block" onClick={() => setNaming(true)}>
            <Icon name="plus" size={14} />
            Save a version
          </button>
        )}
        {versions?.length === 0 && <p className="panel-tip">No saved versions yet. Save one before big changes.</p>}
        <ul className="version-list" role="list">
          {versions?.map((v) => (
            <li key={v.file} className="version">
              <div className="version-text">
                <strong title={v.label}>{v.label}</strong>
                <span className="muted">{timeAgo(v.at)}</span>
              </div>
              {confirm === v.file ? (
                <span className="version-confirm">
                  <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void restore(v)}>
                    Restore
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" className="btn btn-sm" onClick={() => setConfirm(v.file)} title="Your current state is saved as a version first">
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="layers-group">
        <h3>Steps this session</h3>
        <ol className="steps" role="list">
          {[...future].reverse().map((e, i) => {
            const target = past.length + future.length - i;
            return (
              <li key={`f${i}`}>
                <button type="button" className="step" data-undone="" onClick={() => jumpTo(target)} title="Redo up to here">
                  <span>{e.label}</span>
                  <span className="muted">undone</span>
                </button>
              </li>
            );
          })}
          {[...past].reverse().map((e, i) => {
            const target = past.length - i;
            return (
              <li key={`p${i}`}>
                <button type="button" className="step" data-current={i === 0 || undefined} onClick={() => jumpTo(target)} title={i === 0 ? "Where you are now" : "Go back to just after this"}>
                  <span>{e.label}</span>
                  <span className="muted">{i === 0 ? "now" : timeAgo(new Date(e.at).toISOString())}</span>
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" className="step" data-current={past.length === 0 || undefined} onClick={() => jumpTo(0)}>
              <span>Opened the project</span>
              <span className="muted">start</span>
            </button>
          </li>
        </ol>
      </div>
    </div>
  );
}
