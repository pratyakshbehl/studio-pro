/**
 * Phase 4 blocks: the moving gallery layouts (carousel, slideshow, ticker,
 * moodboard), the case-study blocks, music, 3D and Lottie. Shares its helpers
 * with Blocks.tsx so everything renders the same way on the site and in Studio.
 */
import { createElement, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type {
  AudioBlock,
  ButtonBlock,
  CreditsBlock,
  GalleryBlock,
  LayersBlock,
  LottieBlock,
  Media,
  ModelBlock,
  PaletteBlock,
  PromptBlock,
  SpecimenBlock,
  StatsBlock,
  TimelineBlock,
  TracklistBlock,
  TurntableBlock,
} from "../model/schema.ts";
import { useHost } from "./context.tsx";
import { responsiveVars } from "./responsive.ts";
import { ItemImage, MediaBox, Placeholder, shapeOf, useBlockRoot } from "./Blocks.tsx";

/* ── Shared bits ──────────────────────────────────────────────────────── */

export function formatTime(s: number | undefined): string {
  if (s === undefined || !Number.isFinite(s)) return "–:––";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** An empty structured block in the editor: a quiet note saying where to fill it in. */
function Empty({ children }: { children: ReactNode }) {
  return <div className="sp-empty-block">{children}</div>;
}

function Caption({ text }: { text?: string }) {
  return text ? <figcaption className="sp-caption">{text}</figcaption> : null;
}

/* ── Gallery layouts ──────────────────────────────────────────────────── */

/** One row at row height, keeping every image's shape, scrolled sideways. */
export function CarouselBody({ block }: { block: GalleryBlock }) {
  const host = useHost();
  const track = useRef<HTMLDivElement>(null);
  const by = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: reducedMotion() ? "auto" : "smooth" });
  return (
    <div className="sp-carousel-wrap">
      <div className="sp-carousel" ref={track} data-hscroll="">
        {block.items.map((m, i) =>
          m ? (
            <div key={m.src + i} className="sp-media sp-citem" data-item-index={i} style={{ "--iar": +shapeOf(m).toFixed(4) } as CSSProperties}>
              <ItemImage media={m} />
            </div>
          ) : null,
        )}
      </div>
      {!host.editing && (
        <div className="sp-carousel-nav">
          <button type="button" onClick={() => by(-1)} aria-label="Previous">
            ←
          </button>
          <button type="button" onClick={() => by(1)} aria-label="Next">
            →
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One image at a time, crossfading. Visitors get dots and autoplay (paused on
 * hover, off for reduced motion); Studio shows the image you've selected, with
 * a strip of every image to pick from.
 */
export function SlideshowBody({ block }: { block: GalleryBlock }) {
  const host = useHost();
  const items = block.items.filter((m): m is Media => !!m);
  const selected = host.activeItem?.startsWith(`${block.id}#`) ? Number(host.activeItem.split("#")[1]) : null;
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const current = host.editing ? Math.min(selected ?? 0, items.length - 1) : at;

  useEffect(() => {
    if (host.editing || paused || items.length < 2 || reducedMotion()) return;
    const t = setInterval(() => setAt((a) => (a + 1) % items.length), (block.interval ?? 4) * 1000);
    return () => clearInterval(t);
  }, [host.editing, paused, items.length, block.interval]);

  return (
    <div className="sp-slideshow" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <div className="sp-media sp-slides" data-fixed="" style={{ aspectRatio: String(block.aspect ?? 16 / 9) }}>
        {items.map((m, i) => (
          <div key={m.src + i} className="sp-slide" data-on={i === current || undefined} aria-hidden={i !== current}>
            <ItemImage media={m} />
          </div>
        ))}
      </div>
      {host.editing ? (
        <div className="sp-slide-strip">
          {block.items.map((m, i) =>
            m ? (
              <div key={m.src + i} className="sp-media sp-slide-thumb" data-item-index={i} data-on={i === current || undefined}>
                <ItemImage media={m} />
              </div>
            ) : null,
          )}
        </div>
      ) : (
        items.length > 1 && (
          <div className="sp-dots" role="tablist" aria-label="Slides">
            {items.map((_, i) => (
              <button key={i} type="button" role="tab" aria-selected={i === at} aria-label={`Slide ${i + 1}`} onClick={() => setAt(i)} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

/** An endless strip: the images twice over, slid by exactly one set's width. */
export function TickerBody({ block }: { block: GalleryBlock }) {
  const items = block.items.filter((m): m is Media => !!m);
  const rh = block.rowHeight || 220;
  const gap = block.gap ?? 16;
  const speed = block.speed ?? 40;
  // One set's width in page px at 1440, so the duration scales with the page like everything else.
  const setWidth = items.reduce((w, m) => w + shapeOf(m) * rh + gap, 0);
  const seconds = Math.max(4, setWidth / Math.max(4, Math.abs(speed)));
  return (
    <div className="sp-ticker" style={{ "--tdur": `${seconds.toFixed(2)}s`, "--tdir": speed < 0 ? "reverse" : "normal" } as CSSProperties}>
      <div className="sp-ticker-track">
        {[0, 1].map((copy) =>
          block.items.map((m, i) =>
            m ? (
              <div
                key={`${copy}-${m.src}-${i}`}
                className="sp-media sp-titem"
                data-item-index={copy === 0 ? i : undefined}
                aria-hidden={copy === 1 || undefined}
                style={{ "--iar": +shapeOf(m).toFixed(4) } as CSSProperties}
              >
                <ItemImage media={m} />
              </div>
            ) : null,
          ),
        )}
      </div>
    </div>
  );
}

/** Where each image of a moodboard sits on a 12-column board: column, span, row, row span, tilt. */
const BOARD = [
  [1, 5, 1, 5, -2.5],
  [5, 4, 2, 6, 2],
  [9, 4, 1, 4, -1.5],
  [2, 3, 6, 4, 3],
  [8, 5, 5, 5, -2],
  [5, 4, 8, 4, 1.5],
  [1, 4, 10, 4, -1],
  [9, 3, 10, 4, 2.5],
];

export function MoodboardBody({ block }: { block: GalleryBlock }) {
  const rows = Math.ceil(block.items.filter(Boolean).length / BOARD.length) * 13;
  return (
    <div className="sp-moodboard" style={{ "--mrows": rows } as CSSProperties}>
      {block.items.map((m, i) => {
        if (!m) return null;
        const [c, cs, r, rs, rot] = BOARD[i % BOARD.length];
        const lap = Math.floor(i / BOARD.length) * 13;
        return (
          <div
            key={m.src + i}
            className="sp-media sp-mitem"
            data-item-index={i}
            style={{ gridColumn: `${c} / span ${cs}`, gridRow: `${r + lap} / span ${rs}`, "--mrot": `${rot}deg`, zIndex: i + 1 } as CSSProperties}
          >
            <ItemImage media={m} />
          </div>
        );
      })}
    </div>
  );
}

/* ── Layer breakdown ──────────────────────────────────────────────────── */

/**
 * The same frame at each stage of the work. Scrub: drag the slider and each
 * layer fades in over the last. Tabs: click a stage.
 */
export function LayersView({ block }: { block: LayersBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  const steps = block.steps;
  const last = Math.max(0, steps.length - 1);
  const [pos, setPos] = useState(Math.min(block.start, last));
  const shown = host.editing ? Math.min(block.start, last) : pos;
  const filled = steps.some((s) => s.media);
  if (!filled && !host.editing) return null;
  const opacity = (i: number) => (i === 0 ? 1 : block.mode === "tabs" ? (i <= shown ? 1 : 0) : Math.min(1, Math.max(0, shown - (i - 1))));

  return (
    <figure {...root} className={`${root.className} sp-layers`}>
      <div className="sp-media sp-layer-stack" data-fixed="" style={{ aspectRatio: String(block.aspect ?? (steps[0]?.media ? shapeOf(steps[0].media) : 16 / 9)) }}>
        {steps.map((s, i) =>
          s.media ? (
            <div key={i} className="sp-layer" style={{ opacity: opacity(i), zIndex: i }} data-tabs={block.mode === "tabs" || undefined}>
              <ItemImage media={s.media} />
            </div>
          ) : host.editing && i === 0 ? (
            <Placeholder key={i} icon="layers" drop="layers">
              Drop the plate, the CG and the comp (in that order)
            </Placeholder>
          ) : null,
        )}
      </div>
      <div className="sp-layer-controls">
        {block.mode === "scrub" && !host.editing && (
          <input
            type="range"
            min={0}
            max={last}
            step={0.01}
            value={pos}
            onChange={(e) => setPos(Number(e.target.value))}
            aria-label="Scrub through the layers"
            aria-valuetext={steps[Math.round(pos)]?.label}
          />
        )}
        <div className="sp-layer-labels" role={block.mode === "tabs" ? "tablist" : undefined}>
          {steps.map((s, i) => (
            <button
              key={i}
              type="button"
              className="sp-label"
              role={block.mode === "tabs" ? "tab" : undefined}
              aria-selected={block.mode === "tabs" ? Math.round(shown) === i : undefined}
              data-on={Math.round(shown) === i || undefined}
              onClick={() => !host.editing && setPos(i)}
              tabIndex={host.editing ? -1 : undefined}
            >
              <span>{String(i + 1).padStart(2, "0")}</span> {s.label}
            </button>
          ))}
        </div>
      </div>
      <Caption text={block.caption} />
    </figure>
  );
}

/* ── Turntable ────────────────────────────────────────────────────────── */

/** Drag sideways to turn the object; it spins on its own until someone does. */
export function TurntableView({ block }: { block: TurntableBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  const [frame, setFrame] = useState(0);
  const [touched, setTouched] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const frames = block.frames;
  const isVideo = block.source === "video";
  const filled = isVideo ? !!block.video : frames.length > 0;
  const live = !host.editing && filled;

  // Warm the cache so turning never flickers.
  useEffect(() => {
    if (!live || isVideo) return;
    for (const f of frames) {
      const img = new Image();
      img.src = host.mediaUrl(f.src);
    }
  }, [live, isVideo, frames, host]);

  useEffect(() => {
    if (!live || !block.spin || touched || reducedMotion()) return;
    if (isVideo) {
      void video.current?.play().catch(() => undefined);
      return;
    }
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), (block.seconds * 1000) / Math.max(1, frames.length));
    return () => clearInterval(t);
  }, [live, block.spin, block.seconds, touched, isVideo, frames.length]);

  if (!filled && !host.editing) return null;

  const onDown = (e: React.PointerEvent) => {
    if (!live) return;
    const el = box.current!;
    el.setPointerCapture(e.pointerId);
    setTouched(true);
    video.current?.pause();
    const startX = e.clientX;
    const start = isVideo ? (video.current?.currentTime ?? 0) : frame;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / el.clientWidth;
      if (isVideo && video.current) {
        const d = video.current.duration || 1;
        video.current.currentTime = (((start + dx * d) % d) + d) % d;
      } else {
        const n = frames.length;
        setFrame(((Math.round(start + dx * n) % n) + n) % n);
      }
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const ar = block.aspect ?? (isVideo ? (block.video ? shapeOf(block.video) : 1) : frames[0] ? shapeOf(frames[0]) : 1);
  return (
    <figure {...root} className={`${root.className} sp-turntable`}>
      <div ref={box} className="sp-media sp-turn" data-fixed="" style={{ aspectRatio: String(ar) }} onPointerDown={onDown} data-live={live || undefined}>
        {isVideo ? (
          block.video ? (
            <video ref={video} src={host.mediaUrl(block.video.src)} muted loop playsInline preload="auto" />
          ) : (
            <Placeholder icon="turntable" drop="turntable">
              Drop a turntable video (one full turn)
            </Placeholder>
          )
        ) : frames.length ? (
          <img src={host.mediaUrl(frames[frame % frames.length].src)} alt={frames[0].alt} draggable={false} />
        ) : (
          <Placeholder icon="turntable" drop="turntable">
            Drop the frames of a turn (24–72 images, in order)
          </Placeholder>
        )}
        {filled && <span className="sp-turn-hint">⟷ Drag to turn</span>}
      </div>
      <Caption text={block.caption} />
    </figure>
  );
}

/* ── Stats, palette, type ─────────────────────────────────────────────── */

export function StatsView({ block }: { block: StatsBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  const items = block.items.filter((i) => i.value.trim());
  if (!items.length) return host.editing ? <div {...root}><Empty>Stat row: add numbers in the panel, like “40 SKUs” or “3 weeks”.</Empty></div> : null;
  return (
    <dl {...root} className={`${root.className} sp-stats`}>
      {items.map((it, i) => (
        <div key={i}>
          <dd className="sp-stat-value">{it.value}</dd>
          <dt className="sp-label">{it.label}</dt>
        </div>
      ))}
    </dl>
  );
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Dark text on light swatches, light on dark. */
function inkOn(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#fff";
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#0a0a0a" : "#f2ede4";
}

export function PaletteView({ block }: { block: PaletteBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  if (!block.colors.length) return host.editing ? <div {...root}><Empty>Colour palette: add colours in the panel.</Empty></div> : null;
  return (
    <div {...root} className={`${root.className} sp-palette`} data-layout={block.layout}>
      {block.colors.map((c, i) => {
        const rgb = hexToRgb(c.hex);
        return (
          <div key={i} className="sp-swatch" style={{ "--sw": c.hex, "--sw-ink": inkOn(c.hex) } as CSSProperties}>
            <span className="sp-swatch-chip" />
            <span className="sp-swatch-text">
              {c.name && <strong>{c.name}</strong>}
              <span className="sp-label">{c.hex.toUpperCase()}</span>
              {rgb && <span className="sp-label">RGB {rgb.join(" ")}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const loadedFonts = new Set<string>();
function useGoogleFont(family: string, weights: number[], on: boolean) {
  useEffect(() => {
    if (!on || !family.trim() || typeof document === "undefined") return;
    const w = [...new Set(weights)].sort((a, b) => a - b).join(";") || "400";
    const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family.trim()).replace(/%20/g, "+")}:wght@${w}&display=swap`;
    if (loadedFonts.has(href)) return;
    loadedFonts.add(href);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }, [family, weights.join(","), on]);
}

export function SpecimenView({ block }: { block: SpecimenBlock }) {
  const root = useBlockRoot(block);
  useGoogleFont(block.family, block.weights, block.google);
  const font = { fontFamily: `"${block.family}", ui-sans-serif, system-ui, sans-serif` };
  return (
    <div {...root} className={`${root.className} sp-specimen`} style={{ ...root.style, ...font }}>
      <div className="sp-spec-head">
        <span className="sp-spec-aa">Aa</span>
        <div>
          <p className="sp-spec-family">{block.family || "Typeface"}</p>
          {block.note && <p className="sp-caption-text">{block.note}</p>}
        </div>
      </div>
      <p className="sp-spec-glyphs">
        ABCDEFGHIJKLMNOPQRSTUVWXYZ
        <br />
        abcdefghijklmnopqrstuvwxyz
        <br />
        0123456789 &amp; @ ! ? € ₹ ( ) “ ”
      </p>
      <div className="sp-spec-weights">
        {block.weights.map((w) => (
          <div key={w} style={{ fontWeight: w }}>
            <span className="sp-spec-w">Ag</span>
            <span className="sp-label">{w}</span>
          </div>
        ))}
      </div>
      {block.sample && <p className="sp-spec-sample">{block.sample}</p>}
    </div>
  );
}

/* ── Prompt, timeline, button, credits ────────────────────────────────── */

export function PromptView({ block }: { block: PromptBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  const [copied, setCopied] = useState(false);
  if (!block.prompt.trim() && !host.editing) return null;
  const copy = () => {
    void navigator.clipboard?.writeText(block.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <figure {...root} className={`${root.className} sp-prompt`} data-has-media={block.media ? "" : undefined}>
      {block.media && <MediaBox media={block.media} aspect={null} fit="cover" />}
      <div className="sp-prompt-card">
        <div className="sp-prompt-head">
          <span className="sp-label">Prompt</span>
          {block.model && <span className="sp-chip">{block.model}</span>}
          {!host.editing && block.prompt && (
            <button type="button" className="sp-prompt-copy" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
        <p className="sp-prompt-text">{block.prompt || <span className="sp-empty-text">Paste the prompt in the panel</span>}</p>
        {block.negative && (
          <p className="sp-prompt-neg">
            <span className="sp-label">Negative</span> {block.negative}
          </p>
        )}
        {block.settings.length > 0 && (
          <dl className="sp-prompt-settings">
            {block.settings
              .filter((s) => s.label.trim())
              .map((s, i) => (
                <div key={i}>
                  <dt className="sp-label">{s.label}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
          </dl>
        )}
      </div>
    </figure>
  );
}

export function TimelineView({ block }: { block: TimelineBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  const steps = block.steps.filter((s) => s.title.trim() || s.text.trim());
  if (!steps.length) return host.editing ? <div {...root}><Empty>Process timeline: add the steps in the panel.</Empty></div> : null;
  return (
    <ol {...root} className={`${root.className} sp-timeline`} data-dir={block.direction}>
      {steps.map((s, i) => (
        <li key={i}>
          <span className="sp-tl-dot" aria-hidden="true" />
          <span className="sp-label">{s.label || String(i + 1).padStart(2, "0")}</span>
          {s.title && <strong className="sp-tl-title">{s.title}</strong>}
          {s.text && <p>{s.text}</p>}
        </li>
      ))}
    </ol>
  );
}

export function ButtonView({ block }: { block: ButtonBlock }) {
  const host = useHost();
  const root = useBlockRoot(block, responsiveVars(block, (b) => ({ align: b.align })) as Record<string, string>);
  if (!(block.label.trim() && block.href.trim()) && !host.editing) return null;
  return (
    <div {...root} className={`${root.className} sp-button-row`}>
      <a
        className="sp-button"
        data-variant={block.variant}
        href={block.href || "#"}
        target={block.newTab ? "_blank" : undefined}
        rel={block.newTab ? "noopener noreferrer" : undefined}
      >
        {block.label || "Button label"}
        <span aria-hidden="true">{block.newTab ? "↗" : "→"}</span>
      </a>
    </div>
  );
}

export function CreditsView({ block }: { block: CreditsBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  const rows = [...block.rows, ...(block.auto ? host.project.credits : [])].filter((r) => r.name.trim());
  if (!rows.length) return host.editing ? <div {...root}><Empty>Credits: add people in the panel, or in the project details.</Empty></div> : null;
  // One line per role, names joined, in the order roles first appear.
  const byRole = new Map<string, string[]>();
  for (const r of rows) byRole.set(r.role || "", [...(byRole.get(r.role || "") ?? []), r.name]);
  return (
    <div {...root} className={`${root.className} sp-credits`}>
      {block.title && <p className="sp-label sp-credits-title">{block.title}</p>}
      <dl>
        {[...byRole].map(([role, names]) => (
          <div key={role}>
            <dt className="sp-label">{role || "With"}</dt>
            <dd>{names.join(", ")}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ── Music ────────────────────────────────────────────────────────────── */

/** Bars from the stored peaks; the played part is drawn over in the accent. */
function Wave({ peaks, progress, chapters, duration, onSeek }: { peaks: number[]; progress: number; chapters?: { time: number }[]; duration?: number; onSeek?: (f: number) => void }) {
  const n = peaks.length;
  const bars = (
    <svg viewBox={`0 0 ${n * 3} 40`} preserveAspectRatio="none" aria-hidden="true">
      {peaks.map((p, i) => {
        const h = Math.max(1.5, p * 38);
        return <rect key={i} x={i * 3} y={(40 - h) / 2} width={2} height={h} rx={1} />;
      })}
    </svg>
  );
  return (
    <div
      className="sp-wave"
      onPointerDown={(e) => {
        if (!onSeek) return;
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
      }}
      role={onSeek ? "slider" : undefined}
      aria-label={onSeek ? "Seek" : undefined}
      aria-valuenow={onSeek ? Math.round(progress * 100) : undefined}
      tabIndex={onSeek ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onSeek) return;
        if (e.key === "ArrowRight") onSeek(Math.min(1, progress + 0.02));
        if (e.key === "ArrowLeft") onSeek(Math.max(0, progress - 0.02));
      }}
    >
      <div className="sp-wave-base">{bars}</div>
      <div className="sp-wave-played" style={{ clipPath: `inset(0 ${100 - progress * 100}% 0 0)` }}>
        {bars}
      </div>
      {duration && chapters?.map((c, i) => <span key={i} className="sp-wave-mark" style={{ left: `${(c.time / duration) * 100}%` }} />)}
    </div>
  );
}

/** A flat, gently varied stand-in until the real waveform is measured. */
const FLAT = Array.from({ length: 96 }, (_, i) => 0.18 + 0.12 * Math.abs(Math.sin(i * 0.7)));

function useAudio(src: string | undefined, known?: number) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(known);
  useEffect(() => {
    if (!src || typeof Audio === "undefined") return;
    const a = new Audio();
    a.preload = "metadata";
    a.src = src;
    ref.current = a;
    const on = () => setPlaying(!a.paused);
    const t = () => setTime(a.currentTime);
    const d = () => Number.isFinite(a.duration) && setDuration(a.duration);
    a.addEventListener("play", on);
    a.addEventListener("pause", on);
    a.addEventListener("ended", on);
    a.addEventListener("timeupdate", t);
    a.addEventListener("loadedmetadata", d);
    return () => {
      a.pause();
      a.src = "";
      ref.current = null;
    };
  }, [src]);
  return {
    audio: ref,
    playing,
    time,
    duration,
    toggle: () => {
      const a = ref.current;
      if (a) void (a.paused ? a.play() : a.pause());
    },
    seek: (s: number) => {
      const a = ref.current;
      if (a) a.currentTime = s;
      setTime(s);
    },
  };
}

function PlayButton({ playing, onClick, disabled }: { playing: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="sp-play" onClick={onClick} disabled={disabled} aria-label={playing ? "Pause" : "Play"}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {playing ? <path d="M7 5h3v14H7zM14 5h3v14h-3z" /> : <path d="M8 5.5v13l11-6.5z" />}
      </svg>
    </button>
  );
}

/** Audio with a waveform you can click to seek, and chapters you can jump to. */
export function AudioPlayerView({ block }: { block: AudioBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  const src = block.media && !host.editing ? host.mediaUrl(block.media.src) : undefined;
  const a = useAudio(src, block.duration);
  if (!block.media && !host.editing) return null;
  const duration = a.duration ?? block.duration;
  const progress = duration ? a.time / duration : 0;
  const chapters = [...(block.chapters ?? [])].sort((x, y) => x.time - y.time);
  const current = chapters.filter((c) => c.time <= a.time).at(-1);
  return (
    <figure {...root} className={`${root.className} sp-audio`} data-has-cover={block.cover ? "" : undefined}>
      {block.cover && (
        <div className="sp-media sp-audio-cover" data-fixed="" style={{ aspectRatio: "1" }}>
          <ItemImage media={block.cover} />
        </div>
      )}
      <div className="sp-audio-main">
        {(block.title || block.artist) && (
          <figcaption className="sp-audio-meta">
            {block.title && <strong>{block.title}</strong>}
            {block.artist && <span className="sp-label">{block.artist}</span>}
          </figcaption>
        )}
        {block.media ? (
          <div className="sp-player">
            <PlayButton playing={a.playing} onClick={a.toggle} disabled={host.editing} />
            <Wave peaks={block.peaks?.length ? block.peaks : FLAT} progress={progress} chapters={chapters} duration={duration} onSeek={host.editing || !duration ? undefined : (f) => a.seek(f * duration)} />
            <span className="sp-time sp-label">
              {formatTime(a.time)} / {formatTime(duration)}
            </span>
          </div>
        ) : (
          <Placeholder icon="audio" drop="audio">
            Drop an MP3, WAV or M4A here
          </Placeholder>
        )}
        {chapters.length > 0 && (
          <ol className="sp-chapters">
            {chapters.map((c, i) => (
              <li key={i}>
                <button type="button" data-on={c === current || undefined} onClick={() => !host.editing && a.seek(c.time)} tabIndex={host.editing ? -1 : undefined}>
                  <span className="sp-label">{formatTime(c.time)}</span> {c.label}
                </button>
              </li>
            ))}
          </ol>
        )}
        {block.caption && <p className="sp-caption">{block.caption}</p>}
      </div>
    </figure>
  );
}

export function TracklistView({ block }: { block: TracklistBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  const [at, setAt] = useState<number | null>(null);
  const track = at !== null ? block.tracks[at] : undefined;
  const a = useAudio(track?.media && !host.editing ? host.mediaUrl(track.media.src) : undefined, track?.duration);
  const startRef = useRef<number | null>(null);

  // A newly picked track starts as soon as it can.
  useEffect(() => {
    if (at === null || startRef.current !== at) return;
    const el = a.audio.current;
    if (el) void el.play().catch(() => undefined);
  }, [at, a.audio.current]);

  if (!block.tracks.length && !host.editing) return null;
  const pick = (i: number) => {
    if (host.editing || !block.tracks[i]?.media) return;
    if (i === at) return a.toggle();
    startRef.current = i;
    setAt(i);
  };
  return (
    <div {...root} className={`${root.className} sp-tracklist`} data-has-cover={block.cover ? "" : undefined}>
      {block.cover && (
        <div className="sp-media sp-tl-cover" data-fixed="" style={{ aspectRatio: "1" }}>
          <ItemImage media={block.cover} />
        </div>
      )}
      <div>
        {(block.title || block.artist) && (
          <div className="sp-audio-meta">
            {block.title && <strong>{block.title}</strong>}
            {block.artist && <span className="sp-label">{block.artist}</span>}
          </div>
        )}
        {block.tracks.length ? (
          <ol className="sp-tracks">
            {block.tracks.map((t, i) => (
              <li key={i}>
                <button type="button" onClick={() => pick(i)} data-on={i === at || undefined} disabled={!t.media} tabIndex={host.editing ? -1 : undefined}>
                  <span className="sp-track-n sp-label">{i === at && a.playing ? "▶" : String(i + 1).padStart(2, "0")}</span>
                  <span className="sp-track-title">{t.title || `Track ${i + 1}`}</span>
                  <span className="sp-label">{formatTime(i === at && a.duration ? a.duration : t.duration)}</span>
                </button>
                {i === at && t.peaks?.length ? (
                  <Wave peaks={t.peaks} progress={a.duration ? a.time / a.duration : 0} onSeek={a.duration ? (f) => a.seek(f * a.duration!) : undefined} />
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <Empty>Tracklist: drop audio files here, or add tracks in the panel.</Empty>
        )}
      </div>
    </div>
  );
}

/**
 * The project's soundtrack: a small pill, never playing until asked. It fades
 * in and out instead of starting or stopping abruptly.
 */
export function SoundtrackPill() {
  const host = useHost();
  const st = host.project.soundtrack;
  const ref = useRef<HTMLAudioElement | null>(null);
  const fade = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const [on, setOn] = useState(false);
  useEffect(() => () => {
    clearInterval(fade.current);
    ref.current?.pause();
  }, []);
  if (!st?.src) return null;
  const target = Math.min(1, Math.max(0, st.volume ?? 0.6));
  const toggle = () => {
    if (host.editing) return;
    let a = ref.current;
    if (!a) {
      a = new Audio(host.mediaUrl(st.src));
      a.loop = true;
      a.volume = 0;
      ref.current = a;
    }
    clearInterval(fade.current);
    const el = a;
    if (!on) {
      void el.play().catch(() => undefined);
      fade.current = setInterval(() => {
        el.volume = Math.min(target, el.volume + target / 20);
        if (el.volume >= target) clearInterval(fade.current);
      }, 40);
    } else {
      fade.current = setInterval(() => {
        el.volume = Math.max(0, el.volume - target / 15);
        if (el.volume <= 0) {
          clearInterval(fade.current);
          el.pause();
        }
      }, 40);
    }
    setOn(!on);
  };
  return (
    <button type="button" className="sp-soundtrack" onClick={toggle} aria-pressed={on} data-on={on || undefined}>
      <span className="sp-eq" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>{on ? "Sound on" : "Play soundtrack"}</span>
      {st.title && <span className="sp-label">{st.title}</span>}
    </button>
  );
}

/* ── 3D and Lottie ────────────────────────────────────────────────────── */

/*
 * Heavy players load only when a page uses them. These two lines are the only
 * places they're loaded; the site's copy may swap them for CDN script tags
 * (see studio-pro/scripts/sync-renderer.mjs).
 */
type LottiePlayer = { loadAnimation: (o: { container: Element; renderer: "svg"; loop: boolean; autoplay: boolean; path: string }) => { destroy: () => void; goToAndStop: (f: number, isFrame?: boolean) => void } };
const loadModelViewer = (): Promise<unknown> => import("@google/model-viewer"); // sync:model-viewer
const loadLottie = (): Promise<LottiePlayer> => import("lottie-web").then((m) => m.default as unknown as LottiePlayer); // sync:lottie

let modelViewer: Promise<unknown> | null = null;

export function ModelView({ block }: { block: ModelBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!block.media) return;
    modelViewer ??= loadModelViewer();
    let alive = true;
    void modelViewer.then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [block.media]);
  if (!block.media && !host.editing) return null;
  return (
    <figure {...root}>
      <div className="sp-media sp-model" data-fixed="" style={{ aspectRatio: String(block.aspect ?? 1), background: block.bg }}>
        {block.media ? (
          ready ? (
            createElement("model-viewer", {
              src: host.mediaUrl(block.media.src),
              poster: block.poster ? host.mediaUrl(block.poster.src) : undefined,
              alt: block.media.alt || block.caption || "3D model",
              "camera-controls": host.editing ? undefined : "",
              "auto-rotate": block.autoRotate ? "" : undefined,
              "shadow-intensity": "1",
              "interaction-prompt": "none",
              "touch-action": "pan-y",
              style: { width: "100%", height: "100%", background: "transparent" },
            })
          ) : (
            block.poster && <ItemImage media={block.poster} />
          )
        ) : (
          <Placeholder icon="model" drop="model">
            Drop a GLB or glTF model here
          </Placeholder>
        )}
      </div>
      <Caption text={block.caption} />
    </figure>
  );
}

export function LottieView({ block }: { block: LottieBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  const box = useRef<HTMLDivElement>(null);
  const src = block.src.trim() ? (block.src.startsWith("http") ? block.src : host.mediaUrl(block.src)) : "";
  useEffect(() => {
    const el = box.current;
    if (!el || !src) return;
    let anim: { destroy: () => void; goToAndStop: (f: number, isFrame?: boolean) => void } | null = null;
    let alive = true;
    void loadLottie().then((lottie) => {
      if (!alive) return;
      const still = host.editing || reducedMotion();
      anim = lottie.loadAnimation({ container: el, renderer: "svg", loop: block.loop, autoplay: block.autoplay && !still, path: src });
      if (still) anim.goToAndStop(0, true);
    });
    return () => {
      alive = false;
      anim?.destroy();
    };
  }, [src, block.loop, block.autoplay, host.editing]);
  if (!src && !host.editing) return null;
  return (
    <figure {...root}>
      <div className="sp-media sp-lottie" data-fixed="" style={{ aspectRatio: String(block.aspect ?? 1) }}>
        {src ? (
          <div ref={box} className="sp-lottie-box" />
        ) : (
          <Placeholder icon="lottie" drop="lottie">
            Drop a Lottie JSON file, or paste its link in the panel
          </Placeholder>
        )}
      </div>
      <Caption text={block.caption} />
    </figure>
  );
}
