import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type LibraryItem } from "../lib/api.ts";
import { mediaUrl } from "../lib/media.ts";
import { linkProps } from "../lib/router.ts";
import { timeAgo } from "../lib/format.ts";
import { analyzeAudio, KEY_NAMES } from "../lib/audio.ts";
import { Icon, type IconName } from "../ui/icons.tsx";
import { TopBar } from "../cms/TopBar.tsx";
import { ChipsField } from "../cms/SettingsSheet.tsx";
import { uploadFile } from "../editor/upload.ts";
import { measureAudio } from "../editor/peaks.ts";
import { formatTime } from "../render/BlocksMore.tsx";

type Kind = "all" | "image" | "video" | "audio" | "files";
const KINDS: [Kind, string][] = [
  ["all", "All"],
  ["image", "Images"],
  ["video", "Video"],
  ["audio", "Audio"],
  ["files", "3D and files"],
];
const MB = 1024 * 1024;
/** Past these, pages get slow: worth a warning. */
const HEAVY = { image: 8 * MB, video: 40 * MB } as const;
const MOODS = ["Calm", "Energetic", "Dark", "Uplifting", "Cinematic", "Playful", "Moody", "Epic", "Warm", "Minimal"];

const isHeavy = (it: LibraryItem) => (it.type === "image" && it.size > HEAVY.image) || (it.type === "video" && it.size > HEAVY.video);
const needsAlt = (it: LibraryItem) => it.type === "image" && !it.alt?.trim();
const sizeLabel = (n: number) => (n > MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const thumbOf = (it: LibraryItem) => it.variants?.find((v) => v.w === 480)?.src ?? it.variants?.[0]?.src ?? it.src;

/**
 * Every file Studio can use, outside any project: upload, find, describe and
 * tag them, see where each is used, and catch missing alt text and heavy files
 * before they reach the site.
 */
export function MediaLibrary() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [only, setOnly] = useState<{ unused: boolean; alt: boolean; heavy: boolean }>({ unused: false, alt: false, heavy: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [uploads, setUploads] = useState<{ name: string; progress: number; error?: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api.library().then(setItems, () => setItems([]));
  }, []);
  useEffect(load, [load]);

  const tags = useMemo(() => [...new Set((items ?? []).flatMap((i) => i.tags ?? []))].sort(), [items]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((it) => {
      if (kind === "files" ? !["model", "lottie"].includes(it.type) : kind !== "all" && it.type !== kind) return false;
      if (tag && !it.tags?.includes(tag)) return false;
      if (only.unused && it.usedIn.length) return false;
      if (only.alt && !needsAlt(it)) return false;
      if (only.heavy && !isHeavy(it)) return false;
      return !q || `${it.name} ${it.alt ?? ""} ${(it.tags ?? []).join(" ")} ${(it.mood ?? []).join(" ")}`.toLowerCase().includes(q);
    });
  }, [items, kind, query, tag, only]);
  const counts = useMemo(
    () => ({ unused: (items ?? []).filter((i) => !i.usedIn.length).length, alt: (items ?? []).filter(needsAlt).length, heavy: (items ?? []).filter(isHeavy).length }),
    [items],
  );
  const current = items?.find((i) => i.src === selected) ?? null;

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setUploads(files.map((f) => ({ name: f.name, progress: 0 })));
    for (const [i, f] of files.entries()) {
      try {
        await uploadFile(f, (p) => setUploads((u) => u.map((x, j) => (j === i ? { ...x, progress: p } : x))));
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, progress: 1 } : x)));
      } catch (e) {
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, error: (e as Error).message } : x)));
      }
    }
    load();
    setTimeout(() => setUploads((u) => u.filter((x) => x.error)), 2500);
  };

  /** Save notes for one file and fold the answer back into the list. */
  const note = useCallback(async (src: string, patch: Record<string, unknown>) => {
    setItems((list) => list?.map((it) => (it.src === src ? { ...it, ...patch } : it)) ?? list);
    try {
      await api.mediaMeta(src, patch);
    } catch {
      load();
    }
  }, [load]);

  return (
    <div
      className="media-page"
      data-dragging={dragging || undefined}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload([...e.dataTransfer.files]);
      }}
    >
      <TopBar
        actions={
          <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
            <Icon name="upload" />
            Upload
          </button>
        }
      />
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void upload([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <main className="media-main">
        <div className="home-toolbar">
          <h1>
            Media <span className="home-count tabular">{items ? items.length : ""}</span>
          </h1>
          <div className="segmented" role="group" aria-label="Kind">
            {KINDS.map(([k, label]) => (
              <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </div>
          <label className="field home-search">
            <Icon name="search" />
            <span className="sr-only">Search media</span>
            <input type="search" placeholder="Search name, alt text, tag or mood" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        <div className="home-filters" role="group" aria-label="Filters">
          {tags.length > 0 && (
            <label className="facet" data-on={tag ? "" : undefined}>
              <span>Tag</span>
              <select className="input select" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">Any</option>
                {tags.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="chip-toggle" aria-pressed={only.unused} onClick={() => setOnly((o) => ({ ...o, unused: !o.unused }))}>
            Unused <span className="count">{counts.unused}</span>
          </button>
          <button type="button" className="chip-toggle" aria-pressed={only.alt} onClick={() => setOnly((o) => ({ ...o, alt: !o.alt }))}>
            Missing alt text <span className="count">{counts.alt}</span>
          </button>
          <button type="button" className="chip-toggle" aria-pressed={only.heavy} onClick={() => setOnly((o) => ({ ...o, heavy: !o.heavy }))}>
            Heavy files <span className="count">{counts.heavy}</span>
          </button>
          <span className="home-filters-spacer" />
          <span className="muted home-hint">Drop files anywhere on this page to upload</span>
        </div>

        {uploads.length > 0 && (
          <ul className="upload-list" role="list" aria-live="polite">
            {uploads.map((u, i) => (
              <li key={i} data-error={u.error ? "" : undefined}>
                <span className="upload-name">{u.name}</span>
                {u.error ? <span className="hint-bad">{u.error}</span> : <progress max={1} value={u.progress} />}
              </li>
            ))}
          </ul>
        )}

        <div className="media-layout" data-detail={current ? "" : undefined}>
          {!items ? (
            <p className="muted">Loading…</p>
          ) : visible.length === 0 ? (
            <div className="empty-filter">{items.length ? "Nothing matches." : "No media yet. Drop files here to start the library."}</div>
          ) : (
            <ul className="media-tiles" role="list">
              {visible.map((it) => (
                <li key={it.src}>
                  <button type="button" className="media-tile" aria-pressed={selected === it.src} onClick={() => setSelected(selected === it.src ? null : it.src)}>
                    <span className="media-tile-img">
                      <TileArt item={it} />
                      <span className="media-badges">
                        {!it.usedIn.length && <span className="badge">Unused</span>}
                        {needsAlt(it) && <span className="badge badge-warn">No alt</span>}
                        {isHeavy(it) && <span className="badge badge-warn">{sizeLabel(it.size)}</span>}
                      </span>
                      {(it.type === "audio" || it.type === "video") && it.duration ? <span className="media-dur">{formatTime(it.duration)}</span> : null}
                    </span>
                    <span className="media-tile-name">{it.name}</span>
                    <span className="media-tile-meta">
                      {it.type === "audio" && it.bpm ? `${it.bpm} BPM${it.key ? ` · ${it.key}` : ""}` : it.width ? `${it.width}×${it.height}` : it.type}
                      {" · "}
                      {sizeLabel(it.size)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {current && <Detail key={current.src} item={current} tags={tags} onNote={(p) => void note(current.src, p)} onClose={() => setSelected(null)} />}
        </div>
      </main>
    </div>
  );
}

const ICON: Record<string, IconName> = { audio: "audio", model: "model", lottie: "lottie" };

function TileArt({ item }: { item: LibraryItem }) {
  if (item.type === "image") return <img src={mediaUrl(thumbOf(item))} alt="" loading="lazy" decoding="async" />;
  if (item.type === "video")
    return item.poster ? <img src={mediaUrl(item.poster)} alt="" loading="lazy" /> : <video src={mediaUrl(item.src)} muted preload="metadata" />;
  if (item.type === "audio" && item.peaks?.length)
    return (
      <svg className="tile-wave" viewBox={`0 0 ${item.peaks.length * 3} 40`} preserveAspectRatio="none" aria-hidden="true">
        {item.peaks.map((p, i) => (
          <rect key={i} x={i * 3} y={(40 - Math.max(1.5, p * 36)) / 2} width={2} height={Math.max(1.5, p * 36)} />
        ))}
      </svg>
    );
  return <Icon name={ICON[item.type] ?? "image"} size={26} />;
}

/** One file up close: what it is, where it's used, and its notes. */
function Detail({ item, tags, onNote, onClose }: { item: LibraryItem; tags: string[]; onNote: (p: Record<string, unknown>) => void; onClose: () => void }) {
  const [alt, setAlt] = useState(item.alt ?? "");
  const [busy, setBusy] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);

  const analyse = async () => {
    setBusy(true);
    try {
      const [{ peaks, duration }, { bpm, key }] = await Promise.all([measureAudio(item.src), analyzeAudio(mediaUrl(item.src))]);
      onNote({ peaks, duration, ...(bpm ? { bpm } : null), ...(key ? { key } : null) });
    } finally {
      setBusy(false);
    }
  };
  // Audio is listened to once, the first time it's opened here.
  useEffect(() => {
    if (item.type === "audio" && !item.peaks?.length) void analyse();
  }, [item.src]);

  const playLoop = () => {
    const a = audio.current;
    if (!a || !item.loop) return;
    a.currentTime = item.loop.in;
    void a.play();
    const stop = () => {
      if (a.currentTime >= item.loop!.out) a.currentTime = item.loop!.in;
    };
    a.ontimeupdate = stop;
  };

  return (
    <aside className="media-detail" aria-label={`About ${item.name}`}>
      <header>
        <h2 title={item.name}>{item.name}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </header>
      <div className="media-detail-preview">
        {item.type === "image" ? (
          <FocalImage item={item} onFocal={(focal) => onNote({ focal })} />
        ) : item.type === "video" ? (
          <video src={mediaUrl(item.src)} poster={item.poster ? mediaUrl(item.poster) : undefined} controls muted />
        ) : item.type === "audio" ? (
          <div className="media-audio-preview">
            {item.peaks?.length ? <TileArt item={item} /> : <p className="muted">{busy ? "Listening…" : "No waveform yet"}</p>}
            <audio ref={audio} src={mediaUrl(item.src)} controls preload="metadata" />
          </div>
        ) : (
          <div className="media-file-preview">
            <Icon name={ICON[item.type] ?? "image"} size={40} />
          </div>
        )}
      </div>

      <dl className="media-facts">
        <div>
          <dt>Type</dt>
          <dd>{item.type === "model" ? "3D model" : item.type === "lottie" ? "Lottie animation" : item.type}</dd>
        </div>
        {item.width ? (
          <div>
            <dt>Size</dt>
            <dd>
              {item.width}×{item.height}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>File</dt>
          <dd>{sizeLabel(item.size)}</dd>
        </div>
        {item.duration ? (
          <div>
            <dt>Length</dt>
            <dd>{formatTime(item.duration)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Added</dt>
          <dd>{timeAgo(item.modified)}</dd>
        </div>
        <div>
          <dt>From</dt>
          <dd>{item.origin === "site" ? "The site's own images" : "Studio uploads"}</dd>
        </div>
        {item.variants?.length ? (
          <div>
            <dt>Copies</dt>
            <dd>{item.variants.map((v) => `${v.w}`).join(" · ")} px</dd>
          </div>
        ) : null}
      </dl>

      {isHeavy(item) && (
        <p className="hint hint-bad">
          {sizeLabel(item.size)} is heavy for the web. {item.type === "video" ? "Export it at a lower bitrate (under 40 MB)." : "Re-export it under 8 MB, or upload it again: Studio resizes big images to 2880px."}
        </p>
      )}

      <section>
        <h3>Used in</h3>
        {item.usedIn.length ? (
          <ul className="used-in" role="list">
            {item.usedIn.map((u) => (
              <li key={u.id}>
                <a {...linkProps(`/p/${u.id}`)}>{u.title}</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Not on any page yet.</p>
        )}
      </section>

      {(item.type === "image" || item.type === "video") && (
        <section>
          <h3>Alt text</h3>
          <textarea className="input" rows={2} value={alt} placeholder="What's in the picture, for people who can't see it" onChange={(e) => setAlt(e.target.value)} onBlur={() => alt !== (item.alt ?? "") && onNote({ alt: alt.trim() || null })} />
          <p className="hint">{needsAlt(item) ? "Needed before publishing. " : ""}Used whenever this file is added to a page.</p>
        </section>
      )}

      <section>
        <h3>Tags</h3>
        <ChipsField value={item.tags ?? []} options={tags} placeholder="Client, shot, look…" onChange={(t) => onNote({ tags: t })} />
      </section>

      {item.type === "audio" && (
        <section className="media-audio-notes">
          <h3>Music</h3>
          <div className="row-pair even">
            <label className="mini-field">
              <span>BPM</span>
              <input className="input tabular" type="number" min={30} max={300} value={item.bpm ?? ""} placeholder="–" onChange={(e) => onNote({ bpm: Number(e.target.value) || null })} />
            </label>
            <label className="mini-field">
              <span>Key</span>
              <select className="input select" value={item.key ?? ""} onChange={(e) => onNote({ key: e.target.value || null })}>
                <option value="">Unknown</option>
                {KEY_NAMES.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void analyse()}>
            <Icon name="audio" size={14} />
            {busy ? "Listening…" : "Detect tempo and key again"}
          </button>
          <p className="hint">Detected by listening; check by ear and correct it if needed.</p>
          <h3>Mood</h3>
          <ChipsField value={item.mood ?? []} options={MOODS} suggestions={MOODS.filter((m) => !item.mood?.includes(m)).slice(0, 6)} placeholder="How it feels" onChange={(mood) => onNote({ mood })} />
          <h3>Loop</h3>
          <div className="row-pair even">
            <label className="mini-field">
              <span>In (s)</span>
              <input className="input tabular" type="number" min={0} step={0.1} value={item.loop?.in ?? ""} placeholder="0" onChange={(e) => onNote({ loop: { in: Number(e.target.value) || 0, out: item.loop?.out ?? item.duration ?? 0 } })} />
            </label>
            <label className="mini-field">
              <span>Out (s)</span>
              <input className="input tabular" type="number" min={0} step={0.1} value={item.loop?.out ?? ""} placeholder={item.duration ? String(item.duration) : "–"} onChange={(e) => onNote({ loop: { in: item.loop?.in ?? 0, out: Number(e.target.value) || 0 } })} />
            </label>
          </div>
          {item.loop && item.loop.out > item.loop.in && (
            <button type="button" className="btn btn-sm" onClick={playLoop}>
              <Icon name="play" size={14} />
              Play the loop
            </button>
          )}
        </section>
      )}
    </aside>
  );
}

/** The image with its default focal point; click to move it. */
function FocalImage({ item, onFocal }: { item: LibraryItem; onFocal: (f: { x: number; y: number }) => void }) {
  const f = item.focal ?? { x: 0.5, y: 0.5 };
  return (
    <div
      className="focal-image"
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onFocal({ x: Math.round(((e.clientX - r.left) / r.width) * 100) / 100, y: Math.round(((e.clientY - r.top) / r.height) * 100) / 100 });
      }}
      title="Click to set what stays in frame when it's cropped"
    >
      <img src={mediaUrl(item.variants?.find((v) => v.w === 960)?.src ?? item.src)} alt={item.alt ?? ""} draggable={false} />
      <span className="crop-dot" style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%` }} />
    </div>
  );
}
