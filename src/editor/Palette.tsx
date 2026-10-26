import { useEffect, useMemo, useRef, useState } from "react";
import { BLOCK_LABELS } from "../model/index.ts";
import { api, type ProjectSummary } from "../lib/api.ts";
import { navigate } from "../lib/router.ts";
import { Icon, type IconName } from "../ui/icons.tsx";
import { select, setPalette, useEditor } from "./store.ts";
import { CATALOG } from "./catalog.ts";
import { insertEntry } from "./actions.ts";
import { zoomToSelection } from "./camera.ts";
import { COMMANDS } from "./shortcuts.ts";

interface Item {
  key: string;
  group: "Commands" | "Insert" | "Go to" | "Projects";
  label: string;
  hint?: string;
  keys?: string;
  icon: IconName;
  /** Extra words to match on. */
  words?: string;
  run: () => void;
}

const BLOCK_ICON: Record<string, IconName> = {
  heading: "heading",
  text: "text",
  image: "image",
  video: "video",
  gallery: "gallery",
  compare: "compare",
  embed: "embed",
  audio: "audio",
  quote: "quote",
  facts: "facts",
  spacer: "spacer",
  divider: "divider",
};

/** Every word of the query has to appear; labels that start with it rank first. */
function score(item: Item, q: string): number {
  if (!q) return 1;
  const hay = `${item.label} ${item.hint ?? ""} ${item.words ?? ""} ${item.group}`.toLowerCase();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.every((w) => hay.includes(w))) return 0;
  const label = item.label.toLowerCase();
  return label.startsWith(words[0]) ? 3 : label.split(/\s+/).some((w) => w.startsWith(words[0])) ? 2 : 1;
}

/**
 * Ctrl+K: run any command, insert any block or section, jump to anything on
 * the page, or open another project, by typing a few letters.
 */
export function Palette() {
  const open = useEditor((s) => s.palette);
  if (!open) return null;
  return <PaletteDialog />;
}

function PaletteDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const doc = useEditor((s) => s.history?.doc);
  const id = useEditor((s) => s.id);

  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    api.projects().then(setProjects).catch(() => setProjects([]));
    return () => d?.close();
  }, []);

  const close = () => setPalette(false);
  const runAndClose = (fn: () => void) => {
    close();
    // Let the dialog go first, so focus returns to the page before the command runs.
    setTimeout(fn, 0);
  };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const c of COMMANDS) {
      if (c.keyOnly || (c.enabled && !c.enabled())) continue;
      out.push({ key: c.id, group: "Commands", label: c.label, keys: c.keys, icon: "command", words: c.group, run: () => c.run() });
    }
    for (const e of CATALOG) {
      out.push({ key: `ins:${e.label}`, group: "Insert", label: `Add ${e.label.toLowerCase()}`, hint: e.hint, icon: e.icon, words: e.keywords, run: () => insertEntry(e) });
    }
    for (const s of doc?.page.sections ?? []) {
      out.push({ key: s.id, group: "Go to", label: s.name, hint: "Section", icon: s.layout.type === "canvas" ? "canvas" : "flow", run: () => (select([s.id]), zoomToSelection()) });
      for (const b of s.blocks) {
        const name = b.name ?? BLOCK_LABELS[b.type];
        const text = "text" in b && typeof b.text === "string" ? b.text : "html" in b ? b.html.replace(/<[^>]+>/g, " ") : "";
        out.push({
          key: b.id,
          group: "Go to",
          label: name,
          hint: `${s.name}${text.trim() ? ` · ${text.trim().slice(0, 48)}` : ""}`,
          icon: BLOCK_ICON[b.type] ?? (b.type as IconName),
          words: text,
          run: () => (select([b.id]), zoomToSelection()),
        });
      }
    }
    for (const p of projects) {
      if (p.id === id) continue;
      out.push({ key: `p:${p.id}`, group: "Projects", label: p.title || "Untitled project", hint: "Open project", icon: "folder", run: () => navigate(`/p/${p.id}`) });
    }
    return out;
  }, [doc, projects, id]);

  const results = useMemo(() => {
    const scored = items.map((it) => ({ it, s: score(it, q.trim()) })).filter((x) => x.s > 0);
    // With no query: the commands and the insert menu; typing searches everything.
    const pool = q.trim() ? scored : scored.filter((x) => x.it.group === "Commands" || x.it.group === "Insert");
    // Groups stay together; the group with the best match comes first, then the usual order.
    const order = ["Commands", "Go to", "Insert", "Projects"];
    const best = new Map<string, number>();
    for (const x of pool) best.set(x.it.group, Math.max(best.get(x.it.group) ?? 0, x.s));
    pool.sort(
      (a, b) =>
        (best.get(b.it.group)! - best.get(a.it.group)!) ||
        order.indexOf(a.it.group) - order.indexOf(b.it.group) ||
        b.s - a.s,
    );
    return pool.slice(0, 80).map((x) => x.it);
  }, [items, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <dialog ref={ref} className="palette" onClose={close} onClick={(e) => e.target === ref.current && close()} aria-label="Command palette">
      <div className="palette-search">
        <Icon name="search" />
        <input
          autoFocus
          value={q}
          placeholder="Type a command, a block to add, or something on the page…"
          onChange={(e) => setQ(e.target.value)}
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={results[active] ? `pal-${active}` : undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(results.length - 1, a + 1)));
            else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
            else if (e.key === "Enter" && results[active]) (e.preventDefault(), runAndClose(results[active].run));
          }}
        />
        <kbd>Esc</kbd>
      </div>
      <ul className="palette-list" id="palette-list" role="listbox" ref={list}>
        {results.map((it, i) => (
          <li key={it.key} role="presentation">
            {(i === 0 || results[i - 1].group !== it.group) && <div className="palette-group">{it.group}</div>}
            <button
              type="button"
              id={`pal-${i}`}
              role="option"
              aria-selected={i === active}
              data-index={i}
              className="palette-item"
              onMouseMove={() => i !== active && setActive(i)}
              onClick={() => runAndClose(it.run)}
            >
              <Icon name={it.icon} size={15} />
              <span className="palette-label">{it.label}</span>
              {it.hint && <span className="palette-hint">{it.hint}</span>}
              {it.keys && (
                <span className="palette-keys">
                  {it.keys
                    .split(" · ")[0]
                    .split(" ")
                    .map((k, j) => (
                      <kbd key={j}>{k}</kbd>
                    ))}
                </span>
              )}
            </button>
          </li>
        ))}
        {!results.length && <li className="palette-empty">Nothing matches “{q}”.</li>}
      </ul>
    </dialog>
  );
}
