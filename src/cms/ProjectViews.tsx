import { useState } from "react";
import type { ProjectSummary } from "../lib/api.ts";
import { accentCss, mediaUrl } from "../lib/media.ts";
import { linkProps, navigate } from "../lib/router.ts";
import { STATUS_LABEL, plural, timeAgo } from "../lib/format.ts";
import { Icon } from "../ui/icons.tsx";

function Cover({ project }: { project: ProjectSummary }) {
  const [failed, setFailed] = useState(false);
  const cover = project.cover;
  if (!cover?.src || failed) {
    return (
      <div className="cover-empty">
        <Icon name="image" size={20} />
        <span>{failed ? "Cover file is missing" : "No cover yet"}</span>
      </div>
    );
  }
  if (cover.type === "video") {
    return cover.poster ? (
      <img src={mediaUrl(cover.poster)} alt={cover.alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    ) : (
      <video src={mediaUrl(cover.src)} muted playsInline preload="metadata" aria-label={cover.alt} />
    );
  }
  return <img src={mediaUrl(cover.src)} alt={cover.alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

/** What both views need from the home screen. */
export interface ViewProps {
  projects: ProjectSummary[];
  selected: Set<string>;
  /** Click with Ctrl/⌘ toggles one; with Shift selects a range; the box toggles too. */
  onSelect: (id: string, mode: "toggle" | "range") => void;
  onSettings: (id: string) => void;
  /** Present only when dragging can change the site order (no search, filters or other sort). */
  onReorder?: (id: string, beforeId: string | null) => void;
}

/** Drag-and-drop for the site order: a line shows where the dragged project lands. */
function useReorder(onReorder: ViewProps["onReorder"], vertical: boolean) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  if (!onReorder) return { item: () => ({}), dragging: null, over: null };
  return {
    dragging,
    over,
    item: (id: string, next: string | null) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
        setDragging(id);
      },
      onDragEnd: () => {
        setDragging(null);
        setOver(null);
      },
      onDragOver: (e: React.DragEvent) => {
        if (!dragging || dragging === id) return;
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const after = vertical ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
        if (over?.id !== id || over.after !== after) setOver({ id, after });
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (dragging && over) onReorder(dragging, over.after ? next : over.id);
        setDragging(null);
        setOver(null);
      },
    }),
  };
}

function SelectBox({ id, selected, onSelect, label }: { id: string; selected: boolean; onSelect: ViewProps["onSelect"]; label: string }) {
  return (
    <button
      type="button"
      className="select-box"
      role="checkbox"
      aria-checked={selected}
      aria-label={`Select ${label}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(id, e.shiftKey ? "range" : "toggle");
      }}
    >
      {selected && <Icon name="check" size={12} />}
    </button>
  );
}

/** Ctrl/⌘/Shift-click selects instead of opening. */
function selectClick(e: React.MouseEvent, id: string, onSelect: ViewProps["onSelect"], selecting: boolean) {
  if (e.shiftKey || e.ctrlKey || e.metaKey || selecting) {
    e.preventDefault();
    onSelect(id, e.shiftKey ? "range" : "toggle");
    return true;
  }
  return false;
}

export function ProjectGrid({ projects, selected, onSelect, onSettings, onReorder }: ViewProps) {
  const dnd = useReorder(onReorder, false);
  const selecting = selected.size > 0;
  return (
    <ul className="grid" role="list" data-selecting={selecting || undefined}>
      {projects.map((p, i) => (
        <li
          key={p.id}
          {...dnd.item(p.id, projects[i + 1]?.id ?? null)}
          data-dragging={dnd.dragging === p.id || undefined}
          data-drop={dnd.over?.id === p.id ? (dnd.over.after ? "after" : "before") : undefined}
          data-selected={selected.has(p.id) || undefined}
        >
          <a className="card" {...linkProps(`/p/${p.id}`)} onClickCapture={(e) => selectClick(e, p.id, onSelect, selecting) && e.stopPropagation()} draggable={false}>
            <div className="card-media">
              <Cover project={p} />
              {p.featured && (
                <span className="card-featured" title="Featured on the homepage">
                  <Icon name="star" size={14} />
                  <span className="sr-only">Featured</span>
                </span>
              )}
            </div>
            <div className="card-body">
              <div className="card-title-row">
                {p.accent && <span className="swatch" style={{ background: accentCss(p.accent) }} aria-hidden="true" />}
                <h2 className="card-title">{p.title || "Untitled project"}</h2>
                <span className="card-year tabular">{p.year}</span>
              </div>
              <div className="card-meta">
                <span className="status" data-status={p.status}>
                  {STATUS_LABEL[p.status]}
                </span>
                {p.categories[0] && <span className="card-cat">{p.categories[0]}</span>}
                <span className="card-story tabular">{p.blocks ? plural(p.blocks, "block") : "Empty story"}</span>
              </div>
            </div>
          </a>
          <SelectBox id={p.id} selected={selected.has(p.id)} onSelect={onSelect} label={p.title || "Untitled project"} />
          <button type="button" className="card-settings icon-btn" title="Project settings" aria-label={`Settings for ${p.title || "Untitled project"}`} onClick={() => onSettings(p.id)}>
            <Icon name="more" size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ProjectTable({ projects, selected, onSelect, onSettings, onReorder }: ViewProps) {
  const dnd = useReorder(onReorder, true);
  const selecting = selected.size > 0;
  const all = projects.length > 0 && projects.every((p) => selected.has(p.id));
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col" className="col-check">
              <button
                type="button"
                className="select-box"
                role="checkbox"
                aria-checked={all ? true : selecting ? "mixed" : false}
                aria-label="Select all shown"
                onClick={() => projects.forEach((p) => (all ? selected.has(p.id) : !selected.has(p.id)) && onSelect(p.id, "toggle"))}
              >
                {all ? <Icon name="check" size={12} /> : selecting ? <Icon name="minus" size={12} /> : null}
              </button>
            </th>
            <th scope="col" className="col-thumb">
              <span className="sr-only">Cover</span>
            </th>
            <th scope="col">Title</th>
            <th scope="col">Category</th>
            <th scope="col">Tags</th>
            <th scope="col">Status</th>
            <th scope="col" className="num">
              Year
            </th>
            <th scope="col" className="num">
              Story
            </th>
            <th scope="col">Edited</th>
            <th scope="col" className="col-check">
              <span className="sr-only">Settings</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p, i) => (
            // The title link is the keyboard/screen-reader target; clicking anywhere on the row is a mouse shortcut.
            <tr
              key={p.id}
              {...dnd.item(p.id, projects[i + 1]?.id ?? null)}
              data-dragging={dnd.dragging === p.id || undefined}
              data-drop={dnd.over?.id === p.id ? (dnd.over.after ? "after" : "before") : undefined}
              data-selected={selected.has(p.id) || undefined}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a, button")) return;
                if (selectClick(e, p.id, onSelect, selecting)) return;
                navigate(`/p/${p.id}`);
              }}
            >
              <td className="col-check">
                <SelectBox id={p.id} selected={selected.has(p.id)} onSelect={onSelect} label={p.title || "Untitled project"} />
              </td>
              <td className="col-thumb">
                <div className="thumb">
                  <Cover project={p} />
                </div>
              </td>
              <th scope="row">
                <a className="row-link" {...linkProps(`/p/${p.id}`)} onClickCapture={(e) => selectClick(e, p.id, onSelect, selecting) && e.stopPropagation()} draggable={false}>
                  {p.accent && <span className="swatch" style={{ background: accentCss(p.accent) }} aria-hidden="true" />}
                  {p.title || "Untitled project"}
                  {p.featured && <Icon name="star" size={12} className="row-star" aria-label="Featured" />}
                </a>
                <span className="row-slug">/{p.slug}</span>
              </th>
              <td>{p.categories.join(", ") || <span className="muted">None</span>}</td>
              <td className="row-tags">{p.tags.length ? p.tags.slice(0, 3).join(", ") + (p.tags.length > 3 ? ` +${p.tags.length - 3}` : "") : <span className="muted">None</span>}</td>
              <td>
                <span className="status" data-status={p.status}>
                  {STATUS_LABEL[p.status]}
                </span>
              </td>
              <td className="num tabular">{p.year}</td>
              <td className="num tabular muted">
                {p.blocks ? `${plural(p.sections, "section")}, ${plural(p.blocks, "block")}` : "Empty"}
              </td>
              <td className="muted">{timeAgo(p.updatedAt)}</td>
              <td className="col-check">
                <button type="button" className="icon-btn" title="Project settings" aria-label={`Settings for ${p.title || "Untitled project"}`} onClick={() => onSettings(p.id)}>
                  <Icon name="more" size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
