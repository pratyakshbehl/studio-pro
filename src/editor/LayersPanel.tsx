import { useEffect, useRef, useState } from "react";
import {
  BLOCK_LABELS,
  blockMove,
  pageChrome,
  resolveNode,
  sectionMove,
  findSection,
  detectEmbed,
  type Block,
  type PageChrome,
  type Section,
} from "../model/index.ts";
import { openMenuFor } from "./ContextMenu.tsx";
import { Icon, type IconName } from "../ui/icons.tsx";
import { run, select, setRenaming, useEditor } from "./store.ts";
import { rename, toggleHidden, toggleLocked } from "./actions.ts";
import { reveal } from "./camera.ts";
import { plainText } from "../render/sanitize.ts";

const LAYOUT_ICON: Record<Section["layout"]["type"], IconName> = { flow: "flow", stack: "stack", grid: "grid", canvas: "canvas" };

function blockSubtitle(b: Block): string {
  switch (b.type) {
    case "heading":
    case "quote":
      return b.text;
    case "text":
      return plainText(b.html).slice(0, 60);
    case "image":
      return b.media ? (b.media.src.split("/").pop() ?? "") : "Empty";
    case "gallery": {
      const n = b.items.filter(Boolean).length;
      const layout = b.mode === "bento" ? "Bento" : b.mode === "justified" ? "Photo grid" : b.mode === "masonry" ? "Masonry" : "Grid";
      return `${layout} · ${n} image${n === 1 ? "" : "s"}`;
    }
    case "embed":
      return b.url ? (detectEmbed(b.url)?.provider ?? "Link") : "Empty";
    case "audio":
      return b.title ?? (b.media ? (b.media.src.split("/").pop() ?? "") : "Empty");
    case "video":
      return b.source === "embed" ? (b.url ?? "") : b.media ? (b.media.src.split("/").pop() ?? "") : "Empty";
    case "compare":
      return `${b.beforeLabel} / ${b.afterLabel}`;
    default:
      return "";
  }
}

type Drag = { kind: "section" | "block"; id: string } | null;
type DropAt = { kind: "section"; index: number } | { kind: "block"; sectionId: string; index: number } | null;

function NameEditor({ id, initial }: { id: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const done = (commit: boolean) => {
    if (commit && value !== initial) rename(id, value);
    setRenaming(null);
  };
  return (
    <input
      ref={ref}
      className="layer-rename"
      value={value}
      aria-label="Layer name"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") done(true);
        if (e.key === "Escape") done(false);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

const CHROME_ROWS: { id: string; key: keyof PageChrome; label: string; icon: IconName }[] = [
  { id: "chrome:header", key: "header", label: "Title", icon: "heading" },
  { id: "chrome:cover", key: "cover", label: "Cover", icon: "image" },
  { id: "chrome:intro", key: "intro", label: "Intro", icon: "text" },
  { id: "chrome:next", key: "next", label: "Next project", icon: "flow" },
];

export function LayersPanel() {
  const doc = useEditor((s) => s.history?.doc);
  const selection = useEditor((s) => s.selection);
  const hover = useEditor((s) => s.hover);
  const bp = useEditor((s) => s.bp);
  const renaming = useEditor((s) => s.renaming);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Drag>(null);
  const [dropAt, setDropAt] = useState<DropAt>(null);
  if (!doc) return null;
  const chrome = doc.page.chrome;

  const pick = (id: string, e: React.MouseEvent) => {
    select([id], e.shiftKey || e.ctrlKey || e.metaKey ? "toggle" : "replace");
    setTimeout(() => reveal(id), 0);
  };

  const finishDrop = () => {
    if (drag && dropAt) {
      if (drag.kind === "section" && dropAt.kind === "section") {
        const from = findSection(doc, drag.id)!.index;
        run(sectionMove, { id: drag.id, index: dropAt.index > from ? dropAt.index - 1 : dropAt.index });
      } else if (drag.kind === "block" && dropAt.kind === "block") {
        const src = doc.page.sections.find((s) => s.blocks.some((b) => b.id === drag.id))!;
        const from = src.blocks.findIndex((b) => b.id === drag.id);
        const index = src.id === dropAt.sectionId && dropAt.index > from ? dropAt.index - 1 : dropAt.index;
        run(blockMove, { id: drag.id, sectionId: dropAt.sectionId, index });
      }
    }
    setDrag(null);
    setDropAt(null);
  };

  /** Where a dragged row would land, from the pointer's position over a row. */
  const overRow = (e: React.DragEvent, row: { kind: "section"; index: number; section: Section } | { kind: "block"; section: Section; index: number }) => {
    if (!drag) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    if (drag.kind === "section") {
      const index = row.kind === "section" ? row.index : doc.page.sections.indexOf(row.section);
      setDropAt({ kind: "section", index: index + (after ? 1 : 0) });
    } else if (row.kind === "block") {
      setDropAt({ kind: "block", sectionId: row.section.id, index: row.index + (after ? 1 : 0) });
    } else {
      // Over a section row: into that section, at the top or bottom.
      setDropAt({ kind: "block", sectionId: row.section.id, index: after ? row.section.blocks.length : 0 });
    }
  };

  const toggles = (node: Section | Block) => {
    const r = resolveNode(node, bp);
    return (
      <span className="layer-toggles">
        <button
          type="button"
          className="layer-toggle"
          data-on={r.hidden || undefined}
          title={r.hidden ? `Show${bp === "desktop" ? "" : ` on ${bp}`} (Ctrl+;)` : `Hide${bp === "desktop" ? "" : ` on ${bp}`} (Ctrl+;)`}
          onClick={(e) => {
            e.stopPropagation();
            toggleHidden([node.id]);
          }}
        >
          <Icon name={r.hidden ? "eyeOff" : "eye"} size={14} />
        </button>
        <button
          type="button"
          className="layer-toggle"
          data-on={node.locked || undefined}
          title={node.locked ? "Unlock (Ctrl+L)" : "Lock (Ctrl+L)"}
          onClick={(e) => {
            e.stopPropagation();
            toggleLocked([node.id]);
          }}
        >
          <Icon name={node.locked ? "lock" : "unlock"} size={14} />
        </button>
      </span>
    );
  };

  return (
    <div className="panel-scroll layers" onDragEnd={finishDrop}>
      <div className="layers-group">
        <h3>Page</h3>
        {CHROME_ROWS.map((row) => {
          const on = row.key === "intro" ? chrome.intro !== "hidden" : chrome[row.key];
          return (
            <div
              key={row.id}
              className="layer"
              data-selected={selection.includes(row.id) || undefined}
              data-hover={hover === row.id || undefined}
              data-off={!on || undefined}
              onClick={(e) => on && pick(row.id, e)}
            >
              <Icon name={row.icon} className="layer-icon" />
              <span className="layer-name">{row.label}</span>
              <span className="layer-toggles">
                <button
                  type="button"
                  className="layer-toggle"
                  data-on={!on || undefined}
                  title={on ? `Hide the ${row.label.toLowerCase()}` : `Show the ${row.label.toLowerCase()}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    run(pageChrome, { patch: { [row.key]: row.key === "intro" ? (on ? "hidden" : "before") : !on } });
                  }}
                >
                  <Icon name={on ? "eye" : "eyeOff"} size={14} />
                </button>
              </span>
            </div>
          );
        })}
      </div>

      <div className="layers-group">
        <h3>Story</h3>
        {doc.page.sections.length === 0 && <p className="panel-tip">No sections yet. Drop images onto the page, or add one from Insert.</p>}
        {doc.page.sections.map((section, si) => {
          const open = !collapsed.has(section.id);
          const resolved = resolveNode(section, bp);
          return (
            <div key={section.id} className="layer-section">
              {dropAt?.kind === "section" && dropAt.index === si && <div className="layer-drop" />}
              <div
                className="layer"
                data-kind="section"
                data-selected={selection.includes(section.id) || undefined}
                data-hover={hover === section.id || undefined}
                data-off={resolved.hidden || undefined}
                draggable={renaming !== section.id}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", section.id);
                  setDrag({ kind: "section", id: section.id });
                }}
                onDragOver={(e) => overRow(e, { kind: "section", index: si, section })}
                onDrop={(e) => {
                  e.preventDefault();
                  finishDrop();
                }}
                onClick={(e) => pick(section.id, e)}
                onContextMenu={(e) => openMenuFor(section.id, e, "layers")}
                onDoubleClick={() => setRenaming(section.id)}
              >
                <button
                  type="button"
                  className="layer-caret"
                  aria-label={open ? "Collapse" : "Expand"}
                  aria-expanded={open}
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = new Set(collapsed);
                    if (open) next.add(section.id);
                    else next.delete(section.id);
                    setCollapsed(next);
                  }}
                >
                  <Icon name="chevron" size={12} style={{ rotate: open ? "90deg" : "0deg" }} />
                </button>
                <Icon name={LAYOUT_ICON[section.layout.type]} className="layer-icon" />
                {renaming === section.id ? (
                  <NameEditor id={section.id} initial={section.name} />
                ) : (
                  <span className="layer-name">{section.name}</span>
                )}
                {toggles(section)}
              </div>
              {open &&
                section.blocks.map((block, bi) => {
                  const r = resolveNode(block, bp);
                  const name = block.name ?? BLOCK_LABELS[block.type];
                  return (
                    <div key={block.id}>
                      {dropAt?.kind === "block" && dropAt.sectionId === section.id && dropAt.index === bi && <div className="layer-drop" data-depth="1" />}
                      <div
                        className="layer"
                        data-depth="1"
                        data-selected={selection.some((id) => id.split("#")[0] === block.id) || undefined}
                        data-hover={hover === block.id || undefined}
                        data-off={r.hidden || undefined}
                        draggable={renaming !== block.id}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", block.id);
                          setDrag({ kind: "block", id: block.id });
                        }}
                        onDragOver={(e) => overRow(e, { kind: "block", section, index: bi })}
                        onDrop={(e) => {
                          e.preventDefault();
                          finishDrop();
                        }}
                        onClick={(e) => pick(block.id, e)}
                onContextMenu={(e) => openMenuFor(block.id, e, "layers")}
                        onDoubleClick={() => setRenaming(block.id)}
                      >
                        <Icon name={block.type as IconName} className="layer-icon" />
                        {renaming === block.id ? (
                          <NameEditor id={block.id} initial={block.name ?? ""} />
                        ) : (
                          <span className="layer-name">
                            {name}
                            {!block.name && blockSubtitle(block) && <span className="layer-sub">{blockSubtitle(block)}</span>}
                          </span>
                        )}
                        {toggles(block)}
                      </div>
                    </div>
                  );
                })}
              {open && dropAt?.kind === "block" && dropAt.sectionId === section.id && dropAt.index === section.blocks.length && (
                <div className="layer-drop" data-depth="1" />
              )}
            </div>
          );
        })}
        {dropAt?.kind === "section" && dropAt.index === doc.page.sections.length && <div className="layer-drop" />}
      </div>
    </div>
  );
}
