import { useEffect } from "react";
import { BREAKPOINTS, type Breakpoint } from "../model/index.ts";
import { linkProps } from "../lib/router.ts";
import { STATUS_LABEL } from "../lib/format.ts";
import { Icon, Mark } from "../ui/icons.tsx";
import { closeProject, keepMine, openProject, redo, saveNow, setBp, setLeftTab, setSettingsOpen, setSheet, setTool, takeTheirs, undo, useEditor } from "./store.ts";
import { setProject } from "./actions.ts";
import { Sheet, SettingsForm } from "../cms/SettingsSheet.tsx";
import { PublishButton } from "../publish/PublishSheet.tsx";
import { pasteFrom } from "./actions.ts";
import { zoomBy, zoomToFit } from "./camera.ts";
import { handleKey } from "./shortcuts.ts";
import { Palette } from "./Palette.tsx";
import { ContextMenu } from "./ContextMenu.tsx";
import { Canvas } from "./Canvas.tsx";
import { LayersPanel } from "./LayersPanel.tsx";
import { InsertPanel } from "./InsertPanel.tsx";
import { Inspector } from "./Inspector.tsx";
import { ShortcutSheet } from "./ShortcutSheet.tsx";
import { MediaPanel } from "./MediaPanel.tsx";
import { HistoryPanel } from "./HistoryPanel.tsx";

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

const BPS: { bp: Breakpoint; icon: "desktop" | "tablet" | "phone" }[] = [
  { bp: "desktop", icon: "desktop" },
  { bp: "tablet", icon: "tablet" },
  { bp: "phone", icon: "phone" },
];

function SaveStatus() {
  const save = useEditor((s) => s.save);
  const label = {
    saved: "Saved",
    dirty: "Unsaved changes",
    saving: "Saving…",
    error: "Couldn't save",
    conflict: "Changed elsewhere",
  }[save.state];
  return (
    <span className="save-status" data-state={save.state} title={save.error} aria-live="polite">
      {label}
      {save.state === "error" && (
        <button type="button" className="link-btn" onClick={() => void saveNow()}>
          Retry
        </button>
      )}
    </span>
  );
}

function EditorBar({ onShortcuts }: { onShortcuts: () => void }) {
  const doc = useEditor((s) => s.history?.doc);
  const canUndo = useEditor((s) => !!s.history?.past.length);
  const canRedo = useEditor((s) => !!s.history?.future.length);
  const undoLabel = useEditor((s) => s.history?.past.at(-1)?.label);
  const redoLabel = useEditor((s) => s.history?.future[0]?.label);
  const bp = useEditor((s) => s.bp);
  const id = useEditor((s) => s.id);

  return (
    <header className="topbar editor-bar">
      <a className="topbar-mark" {...linkProps("/")} aria-label="All projects">
        <Mark />
      </a>
      <div className="topbar-crumbs">
        <a className="crumb" {...linkProps("/")}>
          Projects
        </a>
        <Icon name="chevron" size={12} className="crumb-sep" />
        <span className="crumb-current">{doc ? doc.title || "Untitled project" : ""}</span>
        {doc && (
          <span className="status" data-status={doc.status}>
            {STATUS_LABEL[doc.status]}
          </span>
        )}
      </div>

      <div className="segmented bp-switch" role="radiogroup" aria-label="Screen size">
        {BPS.map(({ bp: b, icon }, i) => (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={bp === b}
            aria-pressed={bp === b}
            onClick={() => setBp(b)}
            title={`${BREAKPOINTS[b].label}, ${BREAKPOINTS[b].preview}px (Alt+${i + 1})`}
          >
            <Icon name={icon} />
            <span>{BREAKPOINTS[b].label}</span>
          </button>
        ))}
      </div>

      <div className="topbar-actions">
        <SaveStatus />
        <span className="bar-divider" />
        <button type="button" className="icon-btn" onClick={undo} disabled={!canUndo} title={canUndo ? `Undo ${undoLabel?.toLowerCase()} (Ctrl+Z)` : "Nothing to undo"}>
          <Icon name="undo" />
          <span className="sr-only">Undo</span>
        </button>
        <button type="button" className="icon-btn" onClick={redo} disabled={!canRedo} title={canRedo ? `Redo ${redoLabel?.toLowerCase()} (Ctrl+Shift+Z)` : "Nothing to redo"}>
          <Icon name="redo" />
          <span className="sr-only">Redo</span>
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSettingsOpen(true)} title="Project settings (Ctrl+,)">
          Settings
        </button>
        <button type="button" className="icon-btn" onClick={onShortcuts} title="Keyboard shortcuts (?)">
          <Icon name="keyboard" />
          <span className="sr-only">Keyboard shortcuts</span>
        </button>
        <PublishButton beforeOpen={saveNow} />
        <a className="btn" href={id ? `/preview/${id}` : "#"} target="_blank" rel="noreferrer" title="Open the page as visitors see it (Ctrl+P)">
          <Icon name="play" size={14} />
          Preview
        </a>
      </div>
    </header>
  );
}

function BottomBar() {
  const tool = useEditor((s) => s.tool);
  const zoom = useEditor((s) => s.camera.zoom);
  return (
    <div className="bottom-bar" role="toolbar" aria-label="Canvas tools">
      <button type="button" className="icon-btn" aria-pressed={tool === "select"} onClick={() => setTool("select")} title="Select (V)">
        <Icon name="pointer" />
        <span className="sr-only">Select</span>
      </button>
      <button type="button" className="icon-btn" aria-pressed={tool === "hand"} onClick={() => setTool("hand")} title="Hand: drag to move around (H, or hold Space)">
        <Icon name="hand" />
        <span className="sr-only">Hand</span>
      </button>
      <span className="bar-divider" />
      <button type="button" className="icon-btn" onClick={() => zoomBy(0.8)} title="Zoom out (Ctrl+−)">
        <Icon name="minus" />
        <span className="sr-only">Zoom out</span>
      </button>
      <button type="button" className="zoom-readout tabular" onClick={zoomToFit} title="Zoom to fit (Shift+1). Shift+0 for 100%">
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" className="icon-btn" onClick={() => zoomBy(1.25)} title="Zoom in (Ctrl+=)">
        <Icon name="plus" />
        <span className="sr-only">Zoom in</span>
      </button>
    </div>
  );
}

/** The project settings drawer, editing through the editor's own history (so Ctrl+Z works). */
function ProjectSettings() {
  const open = useEditor((s) => s.settings);
  const doc = useEditor((s) => s.history?.doc);
  const state = useEditor((s) => s.save.state);
  if (!open || !doc) return null;
  return (
    <Sheet title={doc.title || "Untitled project"} state={state === "conflict" ? "error" : state} onClose={() => setSettingsOpen(false)}>
      <SettingsForm doc={doc} patch={setProject} />
    </Sheet>
  );
}

function Toast() {
  const toast = useEditor((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" data-tone={toast.tone} role={toast.tone === "error" ? "alert" : "status"} key={toast.at}>
      {toast.text}
    </div>
  );
}

function ConflictBanner() {
  const save = useEditor((s) => s.save);
  if (save.state !== "conflict") return null;
  return (
    <div className="conflict" role="alert">
      <Icon name="alert" size={14} />
      <p>This project was changed in another window, so your latest edits weren't saved.</p>
      <button type="button" className="btn btn-sm" onClick={takeTheirs}>
        Load the other version
      </button>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => void keepMine()}>
        Keep mine
      </button>
    </div>
  );
}

export function Editor({ id }: { id: string }) {
  const loaded = useEditor((s) => !!s.history);
  const loadError = useEditor((s) => s.loadError);
  const leftTab = useEditor((s) => s.leftTab);
  const title = useEditor((s) => s.history?.doc.title);
  const sheet = useEditor((s) => s.sheet);

  useEffect(() => {
    void openProject(id);
    return () => closeProject();
  }, [id]);

  useEffect(() => {
    document.title = `${title || "Untitled project"} · Studio Pro`;
  }, [title]);

  // Don't let the tab close with unsaved work.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      const s = useEditor.getState();
      if (s.version !== s.savedVersion || s.save.state === "saving") {
        void saveNow();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleKey(e);
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      e.preventDefault();
      void pasteFrom(e.clipboardData);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  if (loadError) {
    return (
      <>
        <header className="topbar">
          <a className="topbar-mark" {...linkProps("/")}>
            <Mark />
            <span>Studio Pro</span>
          </a>
        </header>
        <main className="center-note" role="alert">
          <h1>Couldn't open this project</h1>
          <p>{loadError}</p>
          <a className="btn" {...linkProps("/")}>
            Back to projects
          </a>
        </main>
      </>
    );
  }

  return (
    <div className="editor">
      <EditorBar onShortcuts={() => setSheet(true)} />
      <aside className="left-panel" aria-label="Layers and insert">
        <div className="panel-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={leftTab === "layers"} onClick={() => setLeftTab("layers")} title="Layers (L)">
            Layers
          </button>
          <button type="button" role="tab" aria-selected={leftTab === "insert"} onClick={() => setLeftTab("insert")} title="Insert (I)">
            Insert
          </button>
          <button type="button" role="tab" aria-selected={leftTab === "media"} onClick={() => setLeftTab("media")} title="Media (M)">
            Media
          </button>
          <button type="button" role="tab" aria-selected={leftTab === "history"} onClick={() => setLeftTab("history")} title="History (Shift+H)">
            History
          </button>
        </div>
        {loaded &&
          (leftTab === "layers" ? (
            <LayersPanel />
          ) : leftTab === "insert" ? (
            <InsertPanel />
          ) : leftTab === "media" ? (
            <MediaPanel />
          ) : (
            <HistoryPanel />
          ))}
      </aside>
      <main
        className="canvas-area"
        onDoubleClick={() => {
          // Double-clicking words edits them on the page; anything else jumps to its field in the inspector.
          const s = useEditor.getState();
          if (s.selection.length && !s.textEdit) window.dispatchEvent(new Event("studio:edit"));
        }}
      >
        {loaded ? <Canvas /> : <div className="canvas-loading">Opening…</div>}
        <ConflictBanner />
        <BottomBar />
        <Toast />
      </main>
      {loaded && <Inspector />}
      {sheet && <ShortcutSheet onClose={() => setSheet(false)} />}
      {loaded && <Palette />}
      {loaded && <ProjectSettings />}
      {loaded && <ContextMenu />}
    </div>
  );
}
