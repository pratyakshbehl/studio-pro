import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/icons.tsx";
import { CATALOG, searchCatalog, type CatalogEntry } from "./catalog.ts";
import { insertEntry, insertSection, type InsertTarget } from "./actions.ts";
import { SectionLibrary } from "../library/SectionLibrary.tsx";

const GROUPS = ["Text", "Media", "Case study", "Music", "Details", "Sections"] as const;

/** Searchable, keyboard-driven list of things to add. Used by the panel and the + menus. */
function CatalogList({
  onPick,
  autoFocus,
  onEscape,
  sectionsOnly = false,
}: {
  onPick: (e: CatalogEntry) => void;
  autoFocus?: boolean;
  onEscape?: () => void;
  sectionsOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useMemo(
    () => searchCatalog(query, sectionsOnly ? CATALOG.filter((e) => e.kind === "section") : CATALOG),
    [query, sectionsOnly],
  );

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  useEffect(() => setActive(0), [query]);

  let n = -1;
  return (
    <div className="catalog">
      <label className="field catalog-search">
        <Icon name="search" />
        <span className="sr-only">Find a block</span>
        <input
          ref={input}
          value={query}
          placeholder="Find a block or section"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(list.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && list[active]) {
              e.preventDefault();
              onPick(list[active]);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              if (query) setQuery("");
              else onEscape?.();
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="catalog-list"
          aria-activedescendant={list[active] ? `cat-${active}` : undefined}
        />
      </label>
      <div id="catalog-list" role="listbox" aria-label="Blocks and sections">
        {list.length === 0 && <p className="catalog-empty">Nothing matches “{query}”.</p>}
        {GROUPS.map((group) => {
          const items = list.filter((e) => e.group === group);
          if (!items.length) return null;
          return (
            <div key={group} className="catalog-group" role="group" aria-label={group}>
              <h3>{group}</h3>
              {items.map((entry) => {
                n++;
                const i = n;
                return (
                  <button
                    key={entry.group + entry.label}
                    id={`cat-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    className="catalog-item"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => onPick(entry)}
                  >
                    <span className="catalog-icon">
                      <Icon name={entry.icon} />
                    </span>
                    <span className="catalog-text">
                      <strong>{entry.label}</strong>
                      <span>{entry.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Left-panel tab: adds after the current selection, or at the end of the story. */
export function InsertPanel() {
  const [mode, setMode] = useState<"blocks" | "sections">("blocks");
  return (
    <div className="panel-scroll">
      <div className="segmented seg-fill insert-mode" role="tablist" aria-label="What to add">
        <button type="button" role="tab" aria-selected={mode === "blocks"} aria-pressed={mode === "blocks"} onClick={() => setMode("blocks")}>
          Blocks
        </button>
        <button type="button" role="tab" aria-selected={mode === "sections"} aria-pressed={mode === "sections"} onClick={() => setMode("sections")}>
          Sections
        </button>
      </div>
      {mode === "blocks" ? (
        <>
          <CatalogList onPick={(e) => insertEntry(e)} autoFocus />
          <p className="panel-tip">
            Tip: drop images or videos straight onto the page. One image becomes an Image block, several become a Gallery.
          </p>
        </>
      ) : (
        <SectionLibrary onPick={(s) => insertSection(s)} autoFocus />
      )}
    </div>
  );
}

/** The menu a + button opens, anchored under it. */
export function InsertMenu({ x, y, target, onClose }: { x: number; y: number; target: InsertTarget; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8);
    const top = y + r.height > window.innerHeight - 8 ? Math.max(8, y - r.height - 44) : y;
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [onClose]);

  return (
    <div ref={ref} className="popover insert-menu" data-overlay-ui style={pos} role="dialog" aria-label="Add">
      <CatalogList
        autoFocus
        onEscape={onClose}
        onPick={(entry) => {
          insertEntry(entry, target);
          onClose();
        }}
      />
    </div>
  );
}
