import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Status } from "../model/index.ts";
import { api, ApiError, type ImportDone, type ProjectSummary, type TrashItem } from "../lib/api.ts";
import { plural, timeAgo } from "../lib/format.ts";
import { Icon } from "../ui/icons.tsx";
import { TopBar } from "./TopBar.tsx";
import { TemplatePicker } from "./TemplatePicker.tsx";
import { ImportPanel, ImportReport } from "./ImportPanel.tsx";
import { ProjectGrid, ProjectTable } from "./ProjectViews.tsx";
import { BulkBar } from "./BulkBar.tsx";
import { SettingsSheet } from "./SettingsSheet.tsx";
import { PublishButton } from "../publish/PublishSheet.tsx";

type View = "grid" | "table";
type Filter = "all" | "live" | "draft" | "archived" | "trash";
type Sort = "order" | "edited" | "title" | "year";

const VIEW_KEY = "studio-pro:view";
const SORTS: [Sort, string][] = [
  ["order", "Site order"],
  ["edited", "Last edited"],
  ["title", "Title A–Z"],
  ["year", "Newest year"],
];

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "table" ? "table" : "grid";
  } catch {
    return "grid";
  }
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

const unique = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));

export function Home() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<View>(readView);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [year, setYear] = useState("");
  const [featured, setFeatured] = useState(false);
  const [sort, setSort] = useState<Sort>("order");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportDone | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [creating, setCreating] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .projects()
      .then(setProjects)
      .catch((e: ApiError) => setError(e.message));
    api.trashList().then(setTrash, () => setTrash([]));
  }, []);

  useEffect(load, [load]);

  const say = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 4000);
  }, []);

  const changeView = useCallback((v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }, []);

  // New project opens the template picker; it creates and opens the project.
  const createProject = useCallback(() => setCreating(true), []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selected.size && !isTyping(e.target)) return clearSelection();
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || creating || settingsFor) return;
      if (e.key === "/") {
        e.preventDefault();
        search.current?.focus();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        createProject();
      } else if (e.key === "v" || e.key === "V") {
        changeView(view === "grid" ? "table" : "grid");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, changeView, createProject, selected, clearSelection, creating, settingsFor]);

  const counts = useMemo(() => {
    const c = { all: 0, live: 0, draft: 0, archived: 0, trash: trash.length };
    for (const p of projects ?? []) {
      if (p.status === "archived") c.archived++;
      else {
        c.all++;
        if (p.status === "draft") c.draft++;
        else c.live++;
      }
    }
    return c;
  }, [projects, trash]);

  const facets = useMemo(
    () => ({
      categories: unique((projects ?? []).flatMap((p) => p.categories)),
      tags: unique((projects ?? []).flatMap((p) => p.tags)),
      years: [...new Set((projects ?? []).map((p) => p.year))].sort((a, b) => b - a),
    }),
    [projects],
  );

  const narrowed = !!(query.trim() || category || tag || year || featured);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (projects ?? []).filter((p) => {
      if (filter === "all" && p.status === "archived") return false;
      if (filter === "live" && p.status !== "live" && p.status !== "unlisted") return false;
      if (filter === "draft" && p.status !== "draft") return false;
      if (filter === "archived" && p.status !== "archived") return false;
      if (category && !p.categories.includes(category)) return false;
      if (tag && !p.tags.includes(tag)) return false;
      if (year && String(p.year) !== year) return false;
      if (featured && !p.featured) return false;
      if (!q) return true;
      return [p.title, p.slug, p.summary, ...p.categories, ...p.tags, ...p.tools].some((s) => s.toLowerCase().includes(q));
    });
    if (sort === "edited") list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (sort === "title") list.sort((a, b) => (a.title || "~").localeCompare(b.title || "~"));
    if (sort === "year") list.sort((a, b) => b.year - a.year);
    return list;
  }, [projects, filter, query, category, tag, year, featured, sort]);

  // The site order can only be dragged when the whole list is showing in that order.
  const canReorder = sort === "order" && !narrowed && filter === "all";

  const onSelect = useCallback(
    (id: string, mode: "toggle" | "range") => {
      setSelected((cur) => {
        const next = new Set(cur);
        if (mode === "range" && anchor) {
          const ids = visible.map((p) => p.id);
          const [a, b] = [ids.indexOf(anchor), ids.indexOf(id)].sort((x, y) => x - y);
          if (a >= 0 && b >= 0) for (const x of ids.slice(a, b + 1)) next.add(x);
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setAnchor(id);
    },
    [anchor, visible],
  );

  const reorder = useCallback(
    (id: string, beforeId: string | null) => {
      if (!projects) return;
      const ids = projects.map((p) => p.id).filter((x) => x !== id);
      const at = beforeId ? ids.indexOf(beforeId) : ids.length;
      ids.splice(at < 0 ? ids.length : at, 0, id);
      const byId = new Map(projects.map((p) => [p.id, p]));
      setProjects(ids.map((x) => byId.get(x)!));
      api.order(ids).catch((e: Error) => {
        say(`Couldn't save the order: ${e.message}`);
        load();
      });
    },
    [projects, load, say],
  );

  /** Runs a bulk change and folds the updated summaries back into the list. */
  const bulk = useCallback(
    async (run: () => Promise<unknown>, done: string) => {
      setBusy(true);
      try {
        await run();
        say(done);
        load();
      } catch (e) {
        say((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [load, say],
  );

  const ids = [...selected];
  const chosen = (projects ?? []).filter((p) => selected.has(p.id));
  const bulkActions = {
    status: (s: Status) => void bulk(() => api.bulk(ids, { status: s }), `${plural(ids.length, "project")} set to ${s}`),
    feature: (on: boolean) => void bulk(() => api.bulk(ids, { featured: on }), on ? "Featured on the homepage" : "No longer featured"),
    tag: (t: string) => void bulk(() => api.bulk(ids, { addTags: [t] }), `Tagged “${t}”`),
    duplicate: () => void bulk(async () => {
      for (const id of ids) await api.duplicate(id);
    }, `Duplicated ${plural(ids.length, "project")} as drafts`),
    trash: () =>
      void bulk(async () => {
        for (const id of ids) await api.trash(id);
        clearSelection();
      }, `Moved ${plural(ids.length, "project")} to the trash. Restore them from Trash.`),
    clear: clearSelection,
  };

  const newButton = (
    <>
      <PublishButton />
      <button className="btn btn-primary" onClick={createProject} aria-keyshortcuts="N">
        <Icon name="plus" />
        New project
      </button>
    </>
  );

  if (error && !projects) {
    return (
      <>
        <TopBar />
        <main className="center-note" role="alert">
          <h1>Couldn't load your projects</h1>
          <p>{error}</p>
          <button className="btn" onClick={load}>
            Try again
          </button>
        </main>
      </>
    );
  }

  if (projects && projects.length === 0 && !trash.length) {
    return (
      <>
        <TopBar actions={newButton} />
        <ImportPanel
          onDone={(result) => {
            setImported(result);
            load();
          }}
          onSkip={createProject}
        />
        {creating && <TemplatePicker onClose={() => setCreating(false)} />}
      </>
    );
  }

  const filters: [Filter, string][] = [
    ["all", "All"],
    ["live", "Live"],
    ["draft", "Drafts"],
  ];
  if (counts.archived) filters.push(["archived", "Archived"]);
  if (counts.trash) filters.push(["trash", "Trash"]);

  const clearFacets = () => {
    setQuery("");
    setCategory("");
    setTag("");
    setYear("");
    setFeatured(false);
  };

  return (
    <>
      <TopBar actions={newButton} />
      <main className="home" data-selecting={selected.size > 0 || undefined}>
        {imported && (
          <section className="notice" aria-live="polite">
            <div className="notice-row">
              <Icon name="check" className="notice-icon" />
              <p>
                Imported {plural(imported.imported, "project")} from your site and both earlier studios
                {imported.snapshots > 0 && <> · {plural(imported.snapshots, "earlier version")} kept as snapshots</>}
                {imported.media.copied > 0 && <> · {plural(imported.media.copied, "media file")} copied</>}.
                Nothing in those folders was changed.
              </p>
              <button className="btn btn-ghost" onClick={() => setShowReport((s) => !s)} aria-expanded={showReport}>
                {showReport ? "Hide details" : "Details"}
              </button>
              <button className="icon-btn" onClick={() => setImported(null)} aria-label="Dismiss">
                <Icon name="close" />
              </button>
            </div>
            {showReport && <ImportReport report={imported.report} skipped={imported.skipped} />}
          </section>
        )}

        <div className="home-toolbar">
          <h1>
            Projects <span className="home-count tabular">{projects ? counts.all : ""}</span>
          </h1>
          <div className="segmented" role="group" aria-label="Show">
            {filters.map(([key, label]) => (
              <button
                key={key}
                aria-pressed={filter === key}
                onClick={() => {
                  setFilter(key);
                  clearSelection();
                }}
              >
                {label} <span className="count">{projects ? counts[key] : ""}</span>
              </button>
            ))}
          </div>
          <label className="field home-search">
            <Icon name="search" />
            <span className="sr-only">Search projects</span>
            <input
              ref={search}
              type="search"
              placeholder="Search title, tag or tool"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  e.currentTarget.blur();
                }
              }}
            />
            {!query && <kbd>/</kbd>}
          </label>
          <div className="segmented home-view" role="group" aria-label="Layout">
            <button aria-pressed={view === "grid"} onClick={() => changeView("grid")} title="Grid (V)">
              <Icon name="grid" />
              <span className="sr-only">Grid</span>
            </button>
            <button aria-pressed={view === "table"} onClick={() => changeView("table")} title="Table (V)">
              <Icon name="rows" />
              <span className="sr-only">Table</span>
            </button>
          </div>
        </div>

        {filter !== "trash" && (
          <div className="home-filters" role="group" aria-label="Filters">
            <FacetSelect label="Category" value={category} options={facets.categories} onChange={setCategory} />
            <FacetSelect label="Tag" value={tag} options={facets.tags} onChange={setTag} />
            <FacetSelect label="Year" value={year} options={facets.years.map(String)} onChange={setYear} />
            <button type="button" className="chip-toggle" aria-pressed={featured} onClick={() => setFeatured((f) => !f)}>
              <Icon name="star" size={13} />
              Featured
            </button>
            {narrowed && (
              <button type="button" className="link-btn" onClick={clearFacets}>
                Clear filters
              </button>
            )}
            <span className="home-filters-spacer" />
            <label className="facet">
              <span>Sort</span>
              <select className="input select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {SORTS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <span className="home-hint muted">
              {canReorder ? "Drag to set the order on your site" : sort === "order" ? "Clear filters to drag the order" : ""}
            </span>
          </div>
        )}

        {notice && (
          <p className="home-notice" role="status">
            {notice}
          </p>
        )}

        {filter === "trash" ? (
          <TrashList
            items={trash}
            onRestore={(item) =>
              void bulk(async () => {
                await api.restore(item.file);
              }, `Restored “${item.title || "Untitled project"}” as a project again`)
            }
          />
        ) : !projects ? (
          <div className="grid" aria-busy="true" aria-label="Loading projects">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="card-skeleton">
                <div className="skeleton" style={{ aspectRatio: "16 / 9" }} />
                <div className="skeleton" style={{ height: 12, width: "60%", marginTop: 12 }} />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-filter">
            <p>{narrowed ? "No projects match these filters." : "Nothing here yet."}</p>
            {(narrowed || filter !== "all") && (
              <button
                className="btn"
                onClick={() => {
                  clearFacets();
                  setFilter("all");
                }}
              >
                Show all projects
              </button>
            )}
          </div>
        ) : view === "grid" ? (
          <ProjectGrid projects={visible} selected={selected} onSelect={onSelect} onSettings={setSettingsFor} onReorder={canReorder ? reorder : undefined} />
        ) : (
          <ProjectTable projects={visible} selected={selected} onSelect={onSelect} onSettings={setSettingsFor} onReorder={canReorder ? reorder : undefined} />
        )}

        <footer className="home-keys" aria-label="Keyboard shortcuts">
          <span>
            <kbd>N</kbd> New project
          </span>
          <span>
            <kbd>/</kbd> Search
          </span>
          <span>
            <kbd>V</kbd> Grid or table
          </span>
          <span>
            <kbd>Ctrl</kbd> or <kbd>Shift</kbd> click to select
          </span>
        </footer>
      </main>
      <BulkBar count={selected.size} allFeatured={chosen.length > 0 && chosen.every((p) => p.featured)} busy={busy} actions={bulkActions} />
      {creating && <TemplatePicker onClose={() => setCreating(false)} />}
      {settingsFor && (
        <SettingsSheet
          id={settingsFor}
          onClose={() => {
            setSettingsFor(null);
            load();
          }}
        />
      )}
    </>
  );
}

function FacetSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  if (!options.length) return null;
  return (
    <label className="facet" data-on={value ? "" : undefined}>
      <span>{label}</span>
      <select className="input select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Deleted projects, newest first. Restoring puts one back at the top of the list. */
function TrashList({ items, onRestore }: { items: TrashItem[]; onRestore: (item: TrashItem) => void }) {
  if (!items.length) return <div className="empty-filter">The trash is empty.</div>;
  return (
    <div className="trash">
      <p className="muted">Projects moved here are kept as files in data/.trash. Nothing is ever erased.</p>
      <ul role="list">
        {items.map((t) => (
          <li key={t.file} className="trash-row">
            <span className="trash-title">{t.title || "Untitled project"}</span>
            <span className="muted">{t.categories[0] ?? ""}</span>
            <span className="muted">{t.deletedAt ? `Deleted ${timeAgo(t.deletedAt)}` : ""}</span>
            <button type="button" className="btn btn-sm" onClick={() => onRestore(t)}>
              <Icon name="undo" size={14} />
              Restore
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
