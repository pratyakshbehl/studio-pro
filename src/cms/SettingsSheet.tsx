import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  CATEGORIES,
  CTA_KINDS,
  LICENCES,
  LIMITS,
  TOOLS,
  slugify,
  suggest,
  suggestTags,
  type Credit,
  type Project,
  type SiteCover,
  type Status,
} from "../model/index.ts";
import { api, ApiError, type LibraryItem, type ProjectSummary } from "../lib/api.ts";
import { accentCss, mediaUrl } from "../lib/media.ts";
import { STATUS_LABEL } from "../lib/format.ts";
import { loadImage, sampleColors, videoFrame } from "../lib/colors.ts";
import { Icon } from "../ui/icons.tsx";
import { ColorField, Group, MediaField, NumberSlider, Row, Segmented, TextField, Toggle } from "../editor/fields.tsx";
import { ListEditor } from "../editor/InspectorBlocks.tsx";
import { uploadFile } from "../editor/upload.ts";

type Patch = Partial<Project>;
type Focal = { x: number; y: number };

/* ── Standalone (home screen): loads, edits and autosaves one project ── */

export function SettingsSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [doc, setDoc] = useState<Project | null>(null);
  const [state, setState] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Project | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    api.project(id).then(setDoc, (e: Error) => setError(e.message));
  }, [id]);

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setState("saving");
    try {
      const saved = await api.save(next);
      // Keep any typing that happened during the save; only the rev comes back.
      setDoc((d) => (d ? { ...d, rev: saved.rev, updatedAt: saved.updatedAt } : d));
      if (pending.current) pending.current = { ...(pending.current as Project), rev: saved.rev };
      setState(pending.current ? "dirty" : "saved");
      if (pending.current) timer.current = setTimeout(() => void save(), 500);
    } catch (e) {
      setState("error");
      setError((e as ApiError).status === 409 ? "This project was changed in the editor or another window. Close and reopen to get the latest." : (e as Error).message);
    }
  }, []);

  const patch = useCallback(
    (p: Patch) => {
      setDoc((d) => {
        if (!d) return d;
        const next = { ...d, ...p };
        pending.current = next;
        return next;
      });
      setState("dirty");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), 600);
    },
    [save],
  );

  const close = async () => {
    if (pending.current) await save();
    onClose();
  };

  return (
    <Sheet title={doc?.title || "Untitled project"} state={state} onClose={() => void close()}>
      {error && (
        <p className="sheet-error" role="alert">
          {error}
        </p>
      )}
      {doc ? <SettingsForm doc={doc} patch={patch} /> : !error && <p className="muted sheet-loading">Opening…</p>}
    </Sheet>
  );
}

/** The drawer frame: title, save state, close. Esc and the backdrop close it too. */
export function Sheet({ title, kicker = "Project settings", state, onClose, children }: { title: string; kicker?: string; state?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    // showModal focuses the first control (often a hidden file input); start at the top of the form instead.
    d?.querySelector<HTMLElement>(".drawer-body")?.focus();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-label={`${kicker}: ${title}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <header className="drawer-head">
        <div>
          <p className="drawer-kicker">{kicker}</p>
          <h2>{title}</h2>
        </div>
        {state && (
          <span className="save-status" data-state={state} aria-live="polite">
            {{ saved: "Saved", saving: "Saving…", dirty: "Unsaved", error: "Couldn't save" }[state] ?? ""}
          </span>
        )}
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </header>
      <div className="drawer-body sheet-body" tabIndex={-1}>
        {children}
      </div>
    </dialog>
  );
}

/* ── The form, shared by the home screen and the editor ───────────────── */

export function SettingsForm({ doc, patch }: { doc: Project; patch: (p: Patch) => void }) {
  const [others, setOthers] = useState<ProjectSummary[]>([]);
  useEffect(() => {
    api.projects().then((all) => setOthers(all.filter((p) => p.id !== doc.id)), () => setOthers([]));
  }, [doc.id]);
  const ids = { title: useId(), slug: useId(), summary: useId(), desc: useId(), year: useId(), client: useId(), seoT: useId(), seoD: useId() };
  const usedTags = [...new Set(others.flatMap((o) => o.tags))];
  const usedTools = [...new Set(others.flatMap((o) => o.tools))];
  const usedCats = [...new Set(others.flatMap((o) => o.categories))];
  const slugTaken = !!doc.slug && others.some((o) => o.slug === doc.slug);

  return (
    <>
      <Group title="Status">
        <Segmented
          label="Status"
          value={doc.status}
          onChange={(status: Status) => patch({ status })}
          options={(Object.keys(STATUS_LABEL) as Status[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        />
        <p className="hint">
          {{
            draft: "Only in Studio. Not on the site.",
            live: "On the site and in the work index once you publish.",
            unlisted: "On the site at its own address, but left out of the work index.",
            archived: "Kept in Studio, hidden from the projects list and the site.",
          }[doc.status]}
        </p>
        <Row label="Featured">
          <Toggle checked={doc.featured} label="Show on the homepage" onChange={(featured) => patch({ featured })} />
        </Row>
      </Group>

      <CoverGroup doc={doc} patch={patch} />

      <Group title="Basics">
        <Row label="Title" htmlFor={ids.title} stack>
          <TextField id={ids.title} primary value={doc.title} placeholder="Project name" onChange={(title) => patch({ title })} />
        </Row>
        <Row label="Address" htmlFor={ids.slug} stack>
          <div className="slug-field" data-bad={slugTaken || undefined}>
            <span className="muted">/work/</span>
            <input
              id={ids.slug}
              className="input"
              value={doc.slug}
              onChange={(e) => patch({ slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
              onBlur={(e) => patch({ slug: slugify(e.target.value) || slugify(doc.title) || "untitled" })}
            />
            <button type="button" className="btn btn-sm btn-ghost" title="Make it from the title" onClick={() => patch({ slug: slugify(doc.title) || "untitled" })}>
              From title
            </button>
          </div>
          {slugTaken && <p className="hint hint-bad">Another project already uses this address.</p>}
        </Row>
        <Row label="Summary" htmlFor={ids.summary} stack>
          <TextField id={ids.summary} multiline rows={2} maxLength={LIMITS.summary} value={doc.summary} placeholder="One line for cards and search results" onChange={(summary) => patch({ summary })} />
        </Row>
        <Row label="Description" htmlFor={ids.desc} stack>
          <TextField id={ids.desc} multiline rows={4} value={doc.description} placeholder="The brief, what you did, how it turned out" onChange={(description) => patch({ description })} />
        </Row>
        <div className="row-pair even">
          <Row label="Year" htmlFor={ids.year} stack>
            <input id={ids.year} className="input tabular" type="number" min={1990} max={2100} value={doc.year} onChange={(e) => patch({ year: Number(e.target.value) || doc.year })} />
          </Row>
          <Row label="Client or brand" htmlFor={ids.client} stack>
            <TextField id={ids.client} value={doc.client} placeholder="Who it was for" onChange={(client) => patch({ client })} />
          </Row>
        </div>
      </Group>

      <Group title="Described as">
        <Row label={`Categories · ${doc.categories.length} of ${LIMITS.categories}`} stack>
          <ChipsField value={doc.categories} max={LIMITS.categories} options={[...CATEGORIES, ...usedCats]} placeholder="3D Art, Product Viz…" onChange={(categories) => patch({ categories })} />
          <p className="hint">The first one shows on the site's cards.</p>
        </Row>
        <Row label="Role" stack>
          <ChipsField value={doc.role} options={["3D Rendering", "Lookdev", "Lighting", "Animation", "Compositing", "Art Direction", "Modelling", "Texturing", "Motion Design", "Sound Design", "Direction"]} placeholder="What you did" onChange={(role) => patch({ role })} />
        </Row>
        <Row label="Tools" stack>
          <ChipsField value={doc.tools} options={[...TOOLS, ...usedTools]} placeholder="Blender, Houdini, Nuke…" onChange={(tools) => patch({ tools })} />
        </Row>
        <Row label={`Tags · ${doc.tags.length} of ${LIMITS.tags}`} stack>
          <ChipsField value={doc.tags} max={LIMITS.tags} options={usedTags} suggestions={suggestTags(doc, usedTags)} placeholder="Words people would search" onChange={(tags) => patch({ tags })} />
        </Row>
      </Group>

      <Group title="People and facts">
        <Row label="Credits" stack>
          <ListEditor<Credit>
            items={doc.credits}
            onChange={(credits) => patch({ credits })}
            make={() => ({ role: "", name: "" })}
            add="Add a person"
            empty="Everyone who worked on it, and what they did."
            render={(c, set) => (
              <div className="list-pair">
                <input className="input" value={c.role} placeholder="Role" aria-label="Role" onChange={(e) => set({ role: e.target.value })} />
                <input className="input" value={c.name} placeholder="Name" aria-label="Name" onChange={(e) => set({ name: e.target.value })} />
              </div>
            )}
          />
        </Row>
        <Row label="Facts" stack>
          <ListEditor<{ label: string; value: string }>
            items={doc.facts}
            onChange={(facts) => patch({ facts })}
            make={() => ({ label: "", value: "" })}
            add="Add a fact"
            empty="Render time: 14h · Frames: 240 · Duration: 0:45"
            render={(f, set) => (
              <div className="list-pair">
                <input className="input" value={f.label} placeholder="Label" aria-label="Label" onChange={(e) => set({ label: e.target.value })} />
                <input className="input" value={f.value} placeholder="Value" aria-label="Value" onChange={(e) => set({ value: e.target.value })} />
              </div>
            )}
          />
        </Row>
      </Group>

      <AccentGroup doc={doc} patch={patch} />

      <Group title="Soundtrack">
        <MediaField
          media={doc.soundtrack ? { src: doc.soundtrack.src, type: "audio", alt: "" } : null}
          accept="audio/*"
          label="Choose a track"
          onChange={(m) => patch({ soundtrack: m ? { src: m.src, title: doc.soundtrack?.title ?? m.src.split("/").pop()?.replace(/\.[^.]+$/, ""), volume: doc.soundtrack?.volume ?? 0.6 } : undefined })}
        />
        {doc.soundtrack && (
          <Row label="Volume" stack>
            <NumberSlider value={Math.round(doc.soundtrack.volume * 100)} min={10} max={100} unit="%" onChange={(v) => patch({ soundtrack: { ...doc.soundtrack!, volume: v / 100 } })} />
          </Row>
        )}
        <p className="hint">A small “Play soundtrack” pill. It never starts by itself, and fades in and out.</p>
      </Group>

      <Group title="End of the page">
        <Row label="Call to action" stack>
          <select className="input select" value={doc.cta.kind} onChange={(e) => patch({ cta: { ...doc.cta, kind: e.target.value as Project["cta"]["kind"] } })}>
            {CTA_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </Row>
        {doc.cta.kind !== "none" && doc.cta.kind !== "next" && (
          <div className="row-pair even">
            <Row label="Label" stack>
              <input className="input" value={doc.cta.label ?? ""} placeholder={doc.cta.kind === "hire" ? "Hire me" : doc.cta.kind === "contact" ? "Get in touch" : "See it live"} onChange={(e) => patch({ cta: { ...doc.cta, label: e.target.value || undefined } })} />
            </Row>
            <Row label="Link" stack>
              <input className="input" value={doc.cta.href ?? ""} placeholder={doc.cta.kind === "link" ? "https://…" : "mailto:you@…"} onChange={(e) => patch({ cta: { ...doc.cta, href: e.target.value || undefined } })} />
            </Row>
          </div>
        )}
      </Group>

      <Group title="Search and sharing">
        <Row label="Page title" htmlFor={ids.seoT} stack>
          <TextField id={ids.seoT} value={doc.seo.title ?? ""} placeholder={doc.title ? `${doc.title} — Pratyaksh Behl` : "Uses the project title"} onChange={(title) => patch({ seo: { ...doc.seo, title: title || undefined } })} />
        </Row>
        <Row label="Description" htmlFor={ids.seoD} stack>
          <TextField id={ids.seoD} multiline rows={2} maxLength={160} value={doc.seo.description ?? ""} placeholder={doc.summary || "Uses the summary"} onChange={(description) => patch({ seo: { ...doc.seo, description: description || undefined } })} />
        </Row>
        <Row label="Share image · 1200 × 630" stack>
          {doc.seo.image ? (
            <MediaField media={{ src: doc.seo.image, type: "image", alt: "" }} label="Choose image" onChange={(m) => patch({ seo: { ...doc.seo, image: m?.src } })} />
          ) : (
            <>
              <CropPreview src={doc.cover?.type === "video" ? doc.cover.poster : doc.cover?.src} aspect={1200 / 630} focal={doc.cover?.focal} />
              <div className="row-buttons">
                <span className="hint">Cropped from the cover. </span>
                <MediaField media={null} label="Use another image" onChange={(m) => m && patch({ seo: { ...doc.seo, image: m.src } })} />
              </div>
            </>
          )}
        </Row>
        <Row label="Licence" stack>
          <select className="input select" value={doc.license} onChange={(e) => patch({ license: e.target.value })}>
            {[...new Set([doc.license, ...LICENCES])].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Row>
      </Group>
    </>
  );
}

/* ── Cover: file, two crops with focal points, size warning, video poster ── */

function CoverGroup({ doc, patch }: { doc: Project; patch: (p: Patch) => void }) {
  const cover = doc.cover;
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const setCover = (c: Partial<SiteCover> | null) => patch({ cover: c ? ({ ...(cover ?? { src: "", type: "image", alt: "" }), ...c } as SiteCover) : null });
  const still = cover?.type === "video" ? cover.poster : cover?.src;

  // Learn the cover's pixel size, for the size warning.
  useEffect(() => {
    if (!still || (cover?.width && cover.height)) return;
    loadImage(mediaUrl(still)).then((img) => setCover({ width: img.naturalWidth, height: img.naturalHeight }), () => undefined);
  }, [still]);

  const choose = (m: { src: string; type: string; width?: number; height?: number; alt?: string; poster?: string }) => {
    const type = m.type === "video" ? "video" : "image";
    // A new picture starts with centred crops; the old focal points belonged to the old one.
    patch({ cover: { src: m.src, type, alt: cover?.alt || doc.title, poster: m.poster, width: m.width, height: m.height, focal: undefined, spiralFocal: undefined, spiral: undefined } });
    setPicking(false);
  };

  const makePoster = async () => {
    if (!cover || cover.type !== "video") return;
    setBusy(true);
    try {
      const file = await videoFrame(mediaUrl(cover.src), 1, `${cover.src.split("/").pop()?.replace(/\.[^.]+$/, "")}-poster.jpg`);
      const m = await uploadFile(file);
      setCover({ poster: m.src, width: m.width, height: m.height });
    } finally {
      setBusy(false);
    }
  };

  const small = cover?.width && cover.height && (cover.width < 1616 || cover.height < 909);
  return (
    <Group title="Cover">
      <div className="cover-pick">
        <MediaField media={cover ? { src: cover.src, type: cover.type, alt: cover.alt } : null} accept="image/*,video/*" label="Upload" onChange={(m) => (m ? choose(m) : patch({ cover: null }))} />
        <button type="button" className="btn btn-sm" onClick={() => setPicking((v) => !v)} aria-expanded={picking}>
          <Icon name="folder" size={14} />
          From library
        </button>
      </div>
      {picking && <LibraryPicker onPick={choose} />}
      {cover && (
        <>
          {small && <p className="hint hint-bad">This cover is {cover.width}×{cover.height}. At least 1616×909 stays sharp on large screens.</p>}
          {cover.type === "video" && !cover.poster && (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void makePoster()}>
              <Icon name="image" size={14} />
              {busy ? "Making a poster…" : "Make a poster from the video"}
            </button>
          )}
          <div className="crops">
            <div>
              <p className="crop-label">16:9 · project page and cards</p>
              <CropPreview src={still} aspect={16 / 9} focal={cover.focal} onFocal={(focal) => setCover({ focal })} />
            </div>
            <div>
              <p className="crop-label">4:3 · homepage spiral</p>
              <CropPreview src={cover.spiral ?? still} aspect={4 / 3} focal={cover.spiralFocal ?? cover.focal} onFocal={(spiralFocal) => setCover({ spiralFocal })} />
            </div>
          </div>
          <p className="hint">Click or drag on a crop to choose what stays in frame.</p>
          <Row label="Alt text" stack>
            <TextField value={cover.alt} placeholder="Describe the image for screen readers" onChange={(alt) => setCover({ alt })} />
          </Row>
          {!cover.alt.trim() && <p className="hint hint-bad">Add alt text before publishing.</p>}
        </>
      )}
    </Group>
  );
}

/** A crop of an image at a fixed shape, with the focal point you can drag. */
function CropPreview({ src, aspect, focal, onFocal }: { src?: string; aspect: number; focal?: Focal; onFocal?: (f: Focal) => void }) {
  const f = focal ?? { x: 0.5, y: 0.5 };
  const set = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onFocal) return;
    const r = e.currentTarget.getBoundingClientRect();
    onFocal({ x: Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 100) / 100, y: Math.round(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) * 100) / 100 });
  };
  return (
    <div
      className="crop"
      style={{ aspectRatio: String(aspect) }}
      data-editable={onFocal ? "" : undefined}
      onPointerDown={(e) => {
        if (!onFocal) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
    >
      {src ? <img src={mediaUrl(src)} alt="" draggable={false} style={{ objectPosition: `${f.x * 100}% ${f.y * 100}%` }} /> : <span className="muted">No cover yet</span>}
      {src && onFocal && <span className="crop-dot" style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%` }} />}
    </div>
  );
}

function LibraryPicker({ onPick }: { onPick: (m: LibraryItem) => void }) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  useEffect(() => {
    api.library().then((all) => setItems(all.filter((i) => i.type === "image" || i.type === "video")), () => setItems([]));
  }, []);
  if (!items) return <p className="muted">Loading the library…</p>;
  return (
    <ul className="lib-pick" role="list">
      {items.map((it) => (
        <li key={it.src}>
          <button type="button" onClick={() => onPick(it)} title={it.name}>
            {it.type === "video" ? <video src={mediaUrl(it.src)} muted preload="metadata" /> : <img src={mediaUrl(it.src)} alt="" loading="lazy" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ── Accent: five colours sampled from the cover, or your own ─────────── */

function AccentGroup({ doc, patch }: { doc: Project; patch: (p: Patch) => void }) {
  const [swatches, setSwatches] = useState<string[]>([]);
  const still = doc.cover?.type === "video" ? doc.cover.poster : doc.cover?.src;
  useEffect(() => {
    if (!still) return setSwatches([]);
    sampleColors(mediaUrl(still)).then(setSwatches, () => setSwatches([]));
  }, [still]);
  const hex = doc.accent?.startsWith("#") ? doc.accent : undefined;
  return (
    <Group title="Accent colour">
      {swatches.length > 0 && (
        <div className="swatch-row" role="radiogroup" aria-label="From the cover">
          {swatches.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={doc.accent?.toLowerCase() === c} className="swatch-pick" style={{ background: c }} title={c} onClick={() => patch({ accent: c })} />
          ))}
          <span className="hint">From the cover</span>
        </div>
      )}
      <Row label="Custom">
        <ColorField value={hex ?? (doc.accent ? accentCss(doc.accent) : undefined)} allowClear onChange={(accent) => patch({ accent })} />
      </Row>
      <p className="hint">Tints the project's links, highlights and cards on the site.</p>
    </Group>
  );
}

/* ── Chips with suggestions ───────────────────────────────────────────── */

/**
 * Type and press Enter (or comma) to add; Backspace on an empty field removes
 * the last. Suggestions come from the curated list and other projects.
 */
export function ChipsField({
  value,
  onChange,
  options = [],
  suggestions,
  max,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options?: readonly string[];
  suggestions?: string[];
  max?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const [focus, setFocus] = useState(false);
  const [active, setActive] = useState(0);
  const full = max !== undefined && value.length >= max;
  const matches = draft.trim() ? suggest(options, draft, value) : [];
  const add = (v: string) => {
    const t = v.trim().replace(/,$/, "");
    if (!t || full || value.some((x) => x.toLowerCase() === t.toLowerCase())) return setDraft("");
    onChange([...value, t]);
    setDraft("");
    setActive(0);
  };
  return (
    <div className="chips-field">
      <div className="chips" data-focus={focus || undefined}>
        {value.map((v) => (
          <span key={v} className="chip">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>
              <Icon name="close" size={10} />
            </button>
          </span>
        ))}
        {!full && (
          <input
            value={draft}
            placeholder={value.length ? "" : placeholder}
            onFocus={() => setFocus(true)}
            onBlur={() => {
              setFocus(false);
              if (draft.trim()) add(draft);
            }}
            onChange={(e) => {
              if (e.target.value.endsWith(",")) return add(e.target.value);
              setDraft(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(matches[active] ?? draft);
              } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
              else if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(matches.length - 1, a + 1)));
              else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
            }}
            aria-label={placeholder}
          />
        )}
      </div>
      {focus && matches.length > 0 && (
        <ul className="chips-menu" role="listbox">
          {matches.map((m, i) => (
            <li key={m}>
              <button type="button" role="option" aria-selected={i === active} onMouseDown={(e) => (e.preventDefault(), add(m))}>
                {m}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && suggestions && suggestions.length > 0 && (
        <div className="chips-suggest">
          <span className="muted">Suggested:</span>
          {suggestions.slice(0, 8).map((s) => (
            <button key={s} type="button" className="chip chip-add" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
