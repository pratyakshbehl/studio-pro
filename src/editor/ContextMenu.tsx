import { useLayoutEffect, useRef, useState } from "react";
import { findBlock, findSection, resolveNode } from "../model/index.ts";
import { select, setMenu, useEditor } from "./store.ts";
import { command, openPalette, toggleSheet, type Cmd } from "./shortcuts.ts";

type Entry = string | "|";

/** Shown greyed out when they don't apply; everything else is left out instead. */
const ALWAYS = new Set(["edit.copy", "edit.cut", "edit.paste", "edit.duplicate", "edit.delete", "arrange.up", "arrange.down"]);

const NODE_MENU: Entry[] = [
  "edit.text",
  "|",
  "edit.copy",
  "edit.cut",
  "edit.paste",
  "edit.duplicate",
  "|",
  "arrange.up",
  "arrange.down",
  "arrange.forward",
  "arrange.backward",
  "arrange.front",
  "arrange.back",
  "arrange.freeCanvas",
  "|",
  "select.parent",
  "view.zoomSelection",
  "|",
  "edit.rename",
  "edit.lock",
  "edit.hide",
  "edit.saveSection",
  "|",
  "edit.delete",
];

const EMPTY_MENU: Entry[] = ["edit.paste", "select.sections", "|", "view.fit", "view.zoom100", "|", "view.rulers", "view.columns", "|", "panel.palette", "panel.shortcuts"];

/** Lock/hide name what they'll do to this selection. */
function labelFor(cmd: Cmd): string {
  const s = useEditor.getState();
  const d = s.history?.doc;
  if (!d) return cmd.label;
  const nodes = s.selection.map((id) => findSection(d, id)?.section ?? findBlock(d, id)?.block).filter((n) => !!n);
  if (cmd.id === "edit.lock" && nodes.length) return nodes.every((n) => n!.locked) ? "Unlock" : "Lock";
  if (cmd.id === "edit.hide" && nodes.length) {
    const hidden = nodes.every((n) => resolveNode(n!, s.bp).hidden);
    return `${hidden ? "Show" : "Hide"}${s.bp === "desktop" ? "" : ` on ${s.bp}`}`;
  }
  if (cmd.id === "panel.palette") return "Command palette…";
  if (cmd.id === "panel.shortcuts") return "Keyboard shortcuts";
  return cmd.label;
}

/**
 * Right-click menu for the canvas and the layers panel: everything you can do
 * to what's under the pointer, with its shortcut, from the same command list
 * the keyboard uses.
 */
export function ContextMenu() {
  const menu = useEditor((s) => s.menu);
  if (!menu) return null;
  return <Menu x={menu.x} y={menu.y} />;
}

function Menu({ x, y }: { x: number; y: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const hasSelection = useEditor((s) => s.selection.length > 0);
  const entries = hasSelection ? NODE_MENU : EMPTY_MENU;

  const rows: ({ cmd: Cmd; on: boolean } | "|")[] = [];
  for (const e of entries) {
    if (e === "|") {
      if (rows.length && rows[rows.length - 1] !== "|") rows.push("|");
      continue;
    }
    const cmd = command(e);
    const on = !cmd.enabled || cmd.enabled();
    if (on || ALWAYS.has(e)) rows.push({ cmd, on });
  }
  while (rows[rows.length - 1] === "|") rows.pop();

  const close = () => setMenu(null);

  // Keep the whole menu on screen, then put focus in it for the arrow keys.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) });
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const away = (e: Event) => !el.contains(e.target as Node) && close();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("wheel", away, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("wheel", away, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [x, y]);

  const move = (dir: 1 | -1) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(i + dir + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div
      ref={ref}
      className="ctx-menu"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), close());
        else if (e.key === "ArrowDown") (e.preventDefault(), move(1));
        else if (e.key === "ArrowUp") (e.preventDefault(), move(-1));
      }}
    >
      {rows.map((row, i) =>
        row === "|" ? (
          <div key={`sep${i}`} className="ctx-sep" role="separator" />
        ) : (
          <button
            key={row.cmd.id}
            type="button"
            role="menuitem"
            className="ctx-item"
            data-danger={row.cmd.id === "edit.delete" || undefined}
            disabled={!row.on}
            onClick={() => {
              close();
              if (row.cmd.id === "panel.palette") return openPalette();
              if (row.cmd.id === "panel.shortcuts") return toggleSheet();
              row.cmd.run();
            }}
          >
            <span>{labelFor(row.cmd)}</span>
            {row.cmd.keys && <span className="ctx-keys">{row.cmd.keys.split(" · ")[0]}</span>}
          </button>
        ),
      )}
    </div>
  );
}

/** Right-click on a node: select it unless it's already part of the selection, then open the menu. */
export function openMenuFor(id: string | null, e: { clientX: number; clientY: number; preventDefault: () => void }, from: "canvas" | "layers") {
  e.preventDefault();
  const sel = useEditor.getState().selection;
  if (!id) select([]);
  else if (!sel.includes(id)) select([id]);
  setMenu({ x: e.clientX, y: e.clientY, from });
}
