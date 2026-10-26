import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blockUpdate, findBlock, type Media } from "../model/index.ts";
import { api, type LibraryItem } from "../lib/api.ts";
import { mediaUrl } from "../lib/media.ts";
import { plural } from "../lib/format.ts";
import { Icon } from "../ui/icons.tsx";
import { doc, run, toast, useEditor } from "./store.ts";
import { placeMedia } from "./actions.ts";
import { setItem, splitSel } from "./gallery.ts";
import { uploadFile } from "./upload.ts";

export const MEDIA_MIME = "application/x-studio-media";

type Kind = "all" | "image" | "video" | "audio" | "model";

/** A library file as page media, bringing its default alt, focal point, thumbnails and poster. */
export const toMedia = (it: LibraryItem): Media => ({
  src: it.src,
  type: it.type,
  alt: it.alt ?? "",
  ...(it.width ? { width: it.width, height: it.height } : null),
  ...(it.focal ? { focal: it.focal } : null),
  ...(it.variants?.length ? { variants: it.variants } : null),
  ...(it.poster ? { poster: it.poster } : null),
});

const sizeLabel = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

/** Every media src this project already uses, to mark them in the grid. */
function usedSrcs(): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.src === "string") out.add(o.src);
      Object.values(o).forEach(walk);
    }
  };
  walk(doc());
  return out;
}

/**
 * Left-panel Media tab: Studio's uploads and the site's own project media.
 * Drag onto the page, or click to put it into what's selected (or add it as a
 * new block when nothing that takes media is selected).
 */
export function MediaPanel() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [origin, setOrigin] = useState<"all" | "studio" | "site">("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const version = useEditor((s) => s.version);

  const load = useCallback(() => {
    setError(null);
    api
      .library()
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const used = useMemo(() => usedSrcs(), [version, items]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter(
      (it) => (kind === "all" || it.type === kind) && (origin === "all" || it.origin === origin) && (!q || it.name.toLowerCase().includes(q)),
    );
  }, [items, kind, origin, query]);

  /** Click: replace what's selected if it takes this kind of media, else add a block. */
  const use = (it: LibraryItem) => {
    const m = toMedia(it);
    const sel = useEditor.getState().selection;
    const last = sel[sel.length - 1];
    if (last) {
      const { id, item } = splitSel(last);
      const b = findBlock(doc(), id)?.block;
      if (b?.type === "gallery" && item !== null && m.type === "image") return setItem(b.id, item, { ...m, alt: b.items[item]?.alt ?? "" });
      if (b?.type === "image" && m.type === "image") return run(blockUpdate, { id: b.id, patch: { media: { ...m, alt: b.media?.alt ?? "" } } });
      if (b?.type === "video" && m.type === "video") return run(blockUpdate, { id: b.id, patch: { media: m, source: "file" } });
      if (b && ["audio", "layers", "turntable", "model", "lottie", "prompt", "tracklist"].includes(b.type)) return placeMedia([m], { blockId: b.id });
      if (b?.type === "gallery" && m.type === "image") return placeMedia([m], { blockId: b.id });
    }
    placeMedia([m]);
  };

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) await uploadFile(f);
      toast(`Uploaded ${plural(files.length, "file")}`);
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-scroll media-panel">
      <div className="media-tools">
        <label className="field">
          <Icon name="search" />
          <span className="sr-only">Search media</span>
          <input value={query} placeholder="Search files" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button type="button" className="icon-btn" title="Upload files" disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="upload" />
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept="image/*,video/*,audio/*"
          onChange={(e) => {
            const files = e.target.files ? [...e.target.files] : [];
            e.target.value = "";
            void upload(files);
          }}
        />
      </div>
      <div className="segmented seg-fill media-kinds" role="group" aria-label="Kind">
        {(["all", "image", "video", "audio", "model"] as Kind[]).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {{ all: "All", image: "Images", video: "Video", audio: "Audio", model: "3D" }[k]}
          </button>
        ))}
      </div>
      <div className="media-origin" role="group" aria-label="Source">
        {(["all", "studio", "site"] as const).map((o) => (
          <button key={o} type="button" className="chip" aria-pressed={origin === o} onClick={() => setOrigin(o)}>
            {{ all: "Everything", studio: "Uploads", site: "Site images" }[o]}
          </button>
        ))}
      </div>

      {error && (
        <p className="panel-tip" role="alert">
          {error}{" "}
          <button type="button" className="link-btn" onClick={load}>
            Try again
          </button>
        </p>
      )}
      {!items && !error && <div className="skeleton" style={{ height: 240, margin: "8px 0" }} />}
      {items && visible.length === 0 && <p className="panel-tip">Nothing here yet. Drop files onto the page or use Upload.</p>}

      <ul className="media-grid" role="list">
        {visible.map((it) => (
          <li key={it.src}>
            <button
              type="button"
              className="media-cell"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData(MEDIA_MIME, JSON.stringify([toMedia(it)]));
                e.dataTransfer.setData("text/plain", it.src);
              }}
              onClick={() => use(it)}
              title={`${it.name} · ${sizeLabel(it.size)}${it.width ? ` · ${it.width}×${it.height}` : ""}\nClick to use · drag onto the page`}
            >
              {it.type === "image" ? (
                <img src={mediaUrl(it.src)} alt="" loading="lazy" decoding="async" draggable={false} />
              ) : it.type === "video" ? (
                <video src={mediaUrl(it.src)} muted preload="metadata" />
              ) : (
                <span className="media-audio">
                  <Icon name={it.type === "model" ? "model" : it.type === "lottie" ? "lottie" : "audio"} size={18} />
                </span>
              )}
              {used.has(it.src) && <span className="media-used">In use</span>}
              {it.type === "video" && <Icon name="play" size={12} className="media-kind" />}
            </button>
            <span className="media-name">{it.name}</span>
          </li>
        ))}
      </ul>
      {items && (
        <p className="panel-tip">
          {plural(visible.length, "file")}
          {busy && " · uploading…"}
        </p>
      )}
    </div>
  );
}
