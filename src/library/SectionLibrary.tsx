import { useCallback, useEffect, useMemo, useState } from "react";
import { cloneSection, newSection, type Section } from "../model/index.ts";
import { api, type SavedSection } from "../lib/api.ts";
import { Icon } from "../ui/icons.tsx";
import { toast } from "../editor/store.ts";
import { PRESET_GROUPS, SECTION_PRESETS } from "./sections.ts";
import { SectionThumb } from "./SectionThumb.tsx";

/** Fired after a section is saved, so open libraries refresh. */
export const SECTIONS_CHANGED = "studio:sections";

const BLANK: { type: Section["layout"]["type"]; label: string; hint: string }[] = [
  { type: "flow", label: "Flow", hint: "Blocks stack in a column" },
  { type: "stack", label: "Stack", hint: "Side by side, wraps on small screens" },
  { type: "grid", label: "Grid", hint: "Columns you set" },
  { type: "canvas", label: "Free canvas", hint: "Place, size and layer freely" },
];

/** Thumbnails are drawn once per preset: the sections behind them never change. */
const PREVIEWS = new Map(SECTION_PRESETS.map((p) => [p.id, p.make()]));

/**
 * Every ready-made section, drawn as a wireframe of its real blocks, plus the
 * ones you've saved yourself. Picking one hands a fresh copy (new ids) back.
 */
export function SectionLibrary({ onPick, compact = false, autoFocus = false }: { onPick: (s: Section) => void; compact?: boolean; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState<SavedSection[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);

  const load = useCallback(() => {
    api.savedSections().then(setSaved).catch(() => setSaved([]));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(SECTIONS_CHANGED, load);
    return () => window.removeEventListener(SECTIONS_CHANGED, load);
  }, [load]);

  const query = q.trim().toLowerCase();
  const presets = useMemo(
    () => SECTION_PRESETS.filter((p) => !query || `${p.label} ${p.hint} ${p.group}`.toLowerCase().includes(query)),
    [query],
  );
  const mine = saved.filter((s) => !query || s.name.toLowerCase().includes(query));

  const remove = async (s: SavedSection) => {
    try {
      await api.removeSection(s.id);
      toast(`Removed “${s.name}” from your sections`);
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="seclib" data-compact={compact || undefined}>
      <label className="field catalog-search">
        <Icon name="search" />
        <span className="sr-only">Find a section</span>
        <input autoFocus={autoFocus} value={q} placeholder="Find a section: hero, results, release…" onChange={(e) => setQ(e.target.value)} />
      </label>

      {!query && (
        <div className="seclib-group">
          <h3>Blank</h3>
          <div className="seclib-blank">
            {BLANK.map((b) => (
              <button key={b.type} type="button" className="seclib-blank-item" title={b.hint} onClick={() => onPick(newSection(b.type, { name: b.label }))}>
                <Icon name={b.type} size={15} />
                {b.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div className="seclib-group">
          <h3>Your sections</h3>
          <div className="seclib-grid">
            {mine.map((s) => (
              <div key={s.id} className="seclib-card" data-mine="">
                <button type="button" className="seclib-pick" onClick={() => onPick(cloneSection(s.section))} title={`Add “${s.name}”`}>
                  <span className="seclib-thumb">
                    <SectionThumb sections={[s.section]} />
                  </span>
                </button>
                {renaming === s.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
                      setRenaming(null);
                      if (name && name !== s.name) void api.renameSection(s.id, name).then(load, (err) => toast((err as Error).message, "error"));
                    }}
                  >
                    <input name="name" className="input" defaultValue={s.name} autoFocus onBlur={(e) => e.currentTarget.form?.requestSubmit()} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} />
                  </form>
                ) : (
                  <span className="seclib-name">
                    <strong onDoubleClick={() => setRenaming(s.id)}>{s.name}</strong>
                    <span className="seclib-tools">
                      <button type="button" className="icon-btn" title="Rename" onClick={() => setRenaming(s.id)}>
                        <Icon name="text" size={12} />
                      </button>
                      <button type="button" className="icon-btn" title="Remove from your sections (kept in data/.trash)" onClick={() => void remove(s)}>
                        <Icon name="trash" size={12} />
                      </button>
                    </span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {PRESET_GROUPS.map((group) => {
        const list = presets.filter((p) => p.group === group);
        if (!list.length) return null;
        return (
          <div key={group} className="seclib-group">
            <h3>{group}</h3>
            <div className="seclib-grid">
              {list.map((p) => (
                <button key={p.id} type="button" className="seclib-card seclib-pick" onClick={() => onPick(p.make())} title={p.hint}>
                  <span className="seclib-thumb">
                    <SectionThumb sections={[PREVIEWS.get(p.id)!]} />
                  </span>
                  <span className="seclib-name">
                    <strong>{p.label}</strong>
                    {!compact && <span>{p.hint}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {!presets.length && !mine.length && <p className="catalog-empty">Nothing matches “{q}”.</p>}
    </div>
  );
}
