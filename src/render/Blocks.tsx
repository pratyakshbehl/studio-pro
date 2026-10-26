import { useState, type CSSProperties, type ReactNode } from "react";
import type {
  Block,
  BlockWidth,
  CompareBlock,
  EmbedBlock,
  FactsBlock,
  GalleryBlock,
  HeadingBlock,
  ImageBlock,
  Media,
  QuoteBlock,
  SectionLayoutType,
  SpacerBlock,
  TextBlock,
  VideoBlock,
} from "../model/schema.ts";
import { useHost } from "./context.tsx";
import { hiddenAt, responsiveVars } from "./responsive.ts";
import { sanitizeHtml } from "./sanitize.ts";
import { videoEmbedUrl } from "./embed.ts";
import { detectEmbed } from "../model/embeds.ts";
import { cellAspect } from "../model/bento.ts";
import {
  AudioPlayerView,
  ButtonView,
  CarouselBody,
  CreditsView,
  LayersView,
  LottieView,
  ModelView,
  MoodboardBody,
  PaletteView,
  PromptView,
  SlideshowBody,
  SpecimenView,
  StatsView,
  TickerBody,
  TimelineView,
  TracklistView,
  TurntableView,
} from "./BlocksMore.tsx";

const TEXTUAL = new Set(["heading", "text", "quote"]);

function widthSwitches(width: BlockWidth | undefined) {
  return { isw: width === "wide" ? 1 : 0, isf: width === "full" ? 1 : 0 };
}

/** Root attributes every block shares: identity for the editor, responsive vars, hiding. */
export function useBlockRoot(block: Block, extra: Record<string, string | number | undefined> = {}, cls = "") {
  const host = useHost();
  const vars = responsiveVars(block, (b) => {
    const st = b.style ?? {};
    const f = b.font ?? {};
    const px = (n: number | undefined) => (n === undefined ? undefined : `${n}px`);
    const base: Record<string, string | number | undefined> = {
      op: st.opacity,
      rad: px(st.radius),
      bbg: st.bg,
      pad: px(st.padding),
      bdr: st.border && st.border.width > 0 ? `${st.border.width}px ${st.border.style} ${st.border.color}` : undefined,
      shd: st.shadow ? `${st.shadow.x}px ${st.shadow.y}px ${st.shadow.blur}px ${st.shadow.spread}px ${st.shadow.color}` : undefined,
      blend: st.blend,
      mw: px(st.maxWidth),
      mt: px(st.marginTop),
      mb: px(st.marginBottom),
      srot: st.rotate,
      scl: st.scale,
      fs: px(f.size),
      fw: f.weight,
      lh: f.lineHeight,
      ls: f.tracking === undefined ? undefined : `${f.tracking}em`,
      tc: f.color,
      tt: f.transform,
      fst: f.italic === undefined ? undefined : f.italic ? "italic" : "normal",
      par: b.effects?.parallax || undefined,
      x: b.frame?.x,
      y: b.frame?.y,
      w: b.frame?.w,
      h: b.frame?.h,
      rot: b.frame?.rotation,
      z: b.frame?.z,
      sc: b.span?.col,
      sr: b.span?.row,
    };
    if ("width" in b) Object.assign(base, widthSwitches(b.width as BlockWidth));
    return base;
  });
  const hidden = hiddenAt(block);
  return {
    className: `sp-block sp-r sp-${block.type}${TEXTUAL.has(block.type) ? " sp-textual" : ""}${cls ? ` ${cls}` : ""}`,
    style: { ...vars, ...extra } as CSSProperties,
    "data-node-id": block.id,
    "data-node-kind": "block",
    "data-w": "width" in block ? (block.width as string) : undefined,
    "data-hide": host.editing ? undefined : hidden,
    "data-ghost": host.editing ? hidden : undefined,
    "data-appear": block.effects?.appear,
    "data-parallax": block.effects?.parallax ? "" : undefined,
    "data-hover": block.effects?.hover,
    "data-len": block.effects?.appearLength,
  };
}

const PLACEHOLDER_ICON = {
  image: "M4 5h16v14H4zM4 15l4-4 4 4 2-2 6 6M15 9h.01",
  video: "M4 6h11v12H4zM15 10l5-3v10l-5-3",
  gallery: "M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z",
  compare: "M12 3v18M4 5h16v14H4z",
  embed: "M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14",
  audio: "M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  turntable: "M12 4a8 3 0 1 0 0 6 8 3 0 1 0 0-6zM4 7v6c0 1.7 3.6 3 8 3s8-1.3 8-3V7M17 19l2 1-1 2M19 20c-2 .7-4.4 1-7 1",
  model: "M12 2l9 5v10l-9 5-9-5V7zM12 12l9-5M12 12v10M12 12L3 7",
  lottie: "M4 18c4 0 5-12 9-12 3 0 3 6 7 6",
};

export function Placeholder({ icon, children, drop }: { icon: keyof typeof PLACEHOLDER_ICON; children: ReactNode; drop?: string }) {
  return (
    <div className="sp-placeholder" data-drop={drop}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={PLACEHOLDER_ICON[icon]} />
      </svg>
      <span>{children}</span>
    </div>
  );
}

/** srcset from the 480/960/1600 copies plus the file itself, when the upload made them. */
export function srcSetOf(m: Media, url: (src: string) => string): string | undefined {
  if (!m.variants?.length) return undefined;
  const list = m.variants.map((v) => `${url(v.src)} ${v.w}w`);
  if (m.width) list.push(`${url(m.src)} ${m.width}w`);
  return list.join(", ");
}

/** An image or video, filling its box when the block fixes a shape, natural otherwise. */
export function MediaBox({
  media,
  aspect,
  fit,
  children,
  className = "",
  style,
}: {
  media: Media | null;
  aspect: number | null;
  fit?: "cover" | "contain";
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const host = useHost();
  // Without a fixed shape, use the file's own; without either, a 16:9 slot.
  const ar = aspect ?? (media?.width && media?.height ? media.width / media.height : media ? undefined : 16 / 9);
  const fixed = aspect !== null || !media;
  const pos = media?.focal ? `${media.focal.x * 100}% ${media.focal.y * 100}%` : undefined;
  return (
    <div
      className={`sp-media ${className}`}
      data-fixed={fixed ? "" : undefined}
      style={{ ...(ar ? { aspectRatio: String(ar) } : null), ...style }}
    >
      {media?.type === "video" ? (
        <video
          src={host.mediaUrl(media.src)}
          poster={media.poster ? host.mediaUrl(media.poster) : undefined}
          muted
          loop
          autoPlay
          playsInline
          style={{ objectFit: fit, objectPosition: pos }}
        />
      ) : media ? (
        <img
          src={host.mediaUrl(media.src)}
          srcSet={srcSetOf(media, host.mediaUrl)}
          sizes="(max-width: 1440px) 100vw, 1440px"
          alt={media.alt}
          width={media.width}
          height={media.height}
          loading="lazy"
          decoding="async"
          style={{ objectFit: fit, objectPosition: pos }}
        />
      ) : null}
      {children}
    </div>
  );
}

/* ── Text ─────────────────────────────────────────────────────────────── */

function HeadingView({ block }: { block: HeadingBlock }) {
  const host = useHost();
  const root = useBlockRoot(block, responsiveVars(block, (b) => ({ align: b.align })) as Record<string, string>);
  const Tag = (`h${block.level}` as "h1" | "h2" | "h3");
  const empty = !block.text.trim();
  const editor = host.editText?.id === block.id ? host.editText.render(block) : null;
  if (empty && !host.editing) return null;
  return (
    <Tag {...root} className={`${root.className} sp-heading sp-h${block.level}`}>
      {editor ?? (empty ? <span className="sp-empty-text">Heading</span> : block.text)}
    </Tag>
  );
}

const PRESET_CLASS: Record<TextBlock["preset"], string> = {
  h1: "sp-h1",
  h2: "sp-h2",
  h3: "sp-h3",
  lede: "sp-lede",
  body: "sp-body",
  caption: "sp-caption-text",
  label: "sp-label",
};

function TextView({ block }: { block: TextBlock }) {
  const host = useHost();
  const root = useBlockRoot(block, responsiveVars(block, (b) => ({ align: b.align })) as Record<string, string>);
  const html = sanitizeHtml(block.html);
  const empty = !html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").trim();
  if (empty && !host.editing) return null;
  const cls = `${root.className} sp-text ${PRESET_CLASS[block.preset] ?? "sp-body"}`;
  if (host.editText?.id === block.id) {
    return (
      <div {...root} className={cls}>
        {host.editText.render(block)}
      </div>
    );
  }
  return empty ? (
    <div {...root} className={cls}>
      <p className="sp-empty-text">Write something…</p>
    </div>
  ) : (
    <div {...root} className={cls} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function QuoteView({ block }: { block: QuoteBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  if (!block.text.trim() && !host.editing) return null;
  const edit = host.editText?.id === block.id ? host.editText : null;
  return (
    <figure {...root} className={`${root.className} sp-quote`}>
      <blockquote>
        {edit?.part === "text" ? (
          <>“{edit.render(block)}”</>
        ) : block.text.trim() ? (
          `“${block.text}”`
        ) : (
          <span className="sp-empty-text">“A line worth quoting”</span>
        )}
      </blockquote>
      {edit?.part === "cite" ? (
        <figcaption className="sp-label">{edit.render(block)}</figcaption>
      ) : (
        block.cite && <figcaption className="sp-label">{block.cite}</figcaption>
      )}
    </figure>
  );
}

/* ── Media ────────────────────────────────────────────────────────────── */

function ImageView({ block }: { block: ImageBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  if (!block.media && !host.editing) return null;
  return (
    <figure {...root}>
      <MediaBox media={block.media} aspect={block.aspect} fit={block.fit}>
        {!block.media && (
          <Placeholder icon="image" drop="image">
            Drop an image here
          </Placeholder>
        )}
      </MediaBox>
      {block.caption && <figcaption className="sp-caption">{block.caption}</figcaption>}
    </figure>
  );
}

function VideoView({ block }: { block: VideoBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  const embed = block.source === "embed" ? videoEmbedUrl(block.url) : "";
  const filled = block.source === "embed" ? !!embed : !!block.media;
  if (!filled && !host.editing) return null;
  return (
    <figure {...root}>
      {block.source === "embed" ? (
        <div className="sp-media" data-fixed="" style={{ aspectRatio: String(block.aspect ?? 16 / 9) }}>
          {embed ? (
            <iframe
              src={embed}
              title={block.caption || "Video"}
              loading="lazy"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <Placeholder icon="video">Paste a YouTube or Vimeo link in the panel</Placeholder>
          )}
        </div>
      ) : (
        <div
          className="sp-media"
          data-fixed={block.aspect !== null || !block.media ? "" : undefined}
          style={{ aspectRatio: String(block.aspect ?? (block.media?.width && block.media?.height ? block.media.width / block.media.height : 16 / 9)) }}
        >
          {block.media ? (
            <video
              src={host.mediaUrl(block.media.src)}
              poster={block.media.poster ? host.mediaUrl(block.media.poster) : undefined}
              autoPlay={block.autoplay}
              loop={block.loop}
              muted={block.muted}
              controls={block.controls}
              playsInline
              preload="metadata"
            />
          ) : (
            <Placeholder icon="video" drop="video">
              Drop a video here
            </Placeholder>
          )}
        </div>
      )}
      {block.caption && <figcaption className="sp-caption">{block.caption}</figcaption>}
    </figure>
  );
}

/** Shape of a media item, falling back to 3:2 when the file's size is unknown. */
export const shapeOf = (m: Media) => (m.width && m.height ? m.width / m.height : 1.5);
const focalOf = (m: Media) => (m.focal ? `${m.focal.x * 100}% ${m.focal.y * 100}%` : undefined);

export function ItemImage({ media }: { media: Media }) {
  const host = useHost();
  return media.type === "video" ? (
    <video src={host.mediaUrl(media.src)} muted loop autoPlay playsInline style={{ objectPosition: focalOf(media) }} />
  ) : (
    <img
      src={host.mediaUrl(media.src)}
      srcSet={srcSetOf(media, host.mediaUrl)}
      sizes="(max-width: 767px) 100vw, 50vw"
      alt={media.alt}
      width={media.width}
      height={media.height}
      loading="lazy"
      decoding="async"
      style={{ objectPosition: focalOf(media) }}
    />
  );
}

const fr = (weights: number[]) => weights.map((w) => `${+w.toFixed(4)}fr`).join(" ");

/** Bento track and cell values per breakpoint, as responsive CSS vars. */
function bentoVars(block: GalleryBlock) {
  return responsiveVars(block, (b) =>
    b.bento ? { bcols: fr(b.bento.cols), brows: fr(b.bento.rows), bar: +b.bento.aspect.toFixed(4) } : {},
  );
}

function cellVars(block: GalleryBlock, i: number) {
  return responsiveVars(block, (b) => {
    const c = b.bento?.cells[i];
    return c ? { gc: `${c.c + 1} / span ${c.cs}`, gr: `${c.r + 1} / span ${c.rs}` } : {};
  });
}

function GalleryView({ block }: { block: GalleryBlock }) {
  const host = useHost();
  const vars = responsiveVars(block, (b) => ({ cols: b.columns, gap: b.gap, rh: b.rowHeight }));
  const root = useBlockRoot(block, { ...vars, ...(block.mode === "bento" ? bentoVars(block) : null) } as Record<string, string>);
  const hasItems = block.items.some(Boolean);
  const bento = block.mode === "bento" ? block.bento : undefined;
  if (!hasItems && !(bento && host.editing)) {
    if (!host.editing) return null;
    return (
      <figure {...root}>
        <Placeholder icon="gallery" drop="gallery">
          Drop several images here
        </Placeholder>
      </figure>
    );
  }

  let body: ReactNode;
  if (bento) {
    body = (
      <div className="sp-bento" data-stack-phone={bento.stackOnPhone ? "" : undefined}>
        {bento.cells.map((_, i) => {
          const m = block.items[i];
          if (!m && !host.editing) return null;
          return (
            <div
              key={i}
              className="sp-cell sp-media sp-r"
              data-item-index={i}
              data-empty={m ? undefined : ""}
              style={{ ...cellVars(block, i), "--car": +cellAspect(bento, i).toFixed(4) } as CSSProperties}
            >
              {m ? (
                <ItemImage media={m} />
              ) : (
                <Placeholder icon="image" drop="cell">
                  Drop image
                </Placeholder>
              )}
            </div>
          );
        })}
      </div>
    );
  } else if (block.mode === "carousel") {
    body = <CarouselBody block={block} />;
  } else if (block.mode === "slideshow") {
    body = <SlideshowBody block={block} />;
  } else if (block.mode === "ticker") {
    body = <TickerBody block={block} />;
  } else if (block.mode === "moodboard") {
    body = <MoodboardBody block={block} />;
  } else if (block.mode === "justified") {
    body = (
      <div className="sp-justified">
        {block.items.map((m, i) =>
          m ? (
            <div key={m.src + i} className="sp-media sp-jitem" data-item-index={i} style={{ "--iar": +shapeOf(m).toFixed(4) } as CSSProperties}>
              <ItemImage media={m} />
            </div>
          ) : null,
        )}
      </div>
    );
  } else {
    body = (
      <div className={block.mode === "masonry" ? "sp-gallery-masonry" : "sp-gallery-grid"}>
        {block.items.map((m, i) =>
          m ? (
            <div key={m.src + i} data-item-index={i} className="sp-gallery-item">
              <MediaBox media={m} aspect={block.mode === "masonry" ? null : block.aspect} fit="cover" />
            </div>
          ) : null,
        )}
      </div>
    );
  }

  return (
    <figure {...root} data-mode={block.mode}>
      {body}
      {block.caption && <figcaption className="sp-caption">{block.caption}</figcaption>}
    </figure>
  );
}

function EmbedView({ block }: { block: EmbedBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  const info = detectEmbed(block.url);
  if (!info && !host.editing) return null;
  return (
    <figure {...root}>
      {info ? (
        <div
          className="sp-media sp-embed"
          data-fixed=""
          data-kind={info.kind}
          style={info.height ? { height: info.height, aspectRatio: "auto" } : { aspectRatio: String(info.aspect ?? 16 / 9) }}
        >
          <iframe
            src={info.src}
            title={block.caption || `${info.provider} embed`}
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <div className="sp-media" data-fixed="" style={{ aspectRatio: "16 / 9" }}>
          <Placeholder icon="embed">
            {block.url ? "That link can't be embedded. Try YouTube, Vimeo, Spotify, SoundCloud, Sketchfab or Figma." : "Paste a link in the panel: YouTube, Spotify, SoundCloud, Sketchfab, Figma…"}
          </Placeholder>
        </div>
      )}
      {block.caption && <figcaption className="sp-caption">{block.caption}</figcaption>}
    </figure>
  );
}

function CompareView({ block }: { block: CompareBlock }) {
  const host = useHost();
  const root = useBlockRoot(block);
  const [pos, setPos] = useState(block.start);
  const ready = !!(block.before && block.after);
  if (!ready && !host.editing) return null;
  const shown = host.editing ? block.start : pos;
  return (
    <figure {...root}>
      <MediaBox
        media={block.after}
        aspect={block.aspect ?? 16 / 9}
        fit="cover"
        className="sp-compare"
        style={{ "--pos": `${shown}%` } as CSSProperties}
      >
        {block.before && (
          <div className="sp-compare-before">
            <MediaBox media={block.before} aspect={block.aspect ?? 16 / 9} fit="cover" style={{ height: "100%", borderRadius: 0 }} />
          </div>
        )}
        {!ready && (
          <Placeholder icon="compare" drop="compare">
            Drop the before image on the left half, the after image on the right
          </Placeholder>
        )}
        {ready && (
          <>
            <span className="sp-compare-handle" aria-hidden="true" />
            <span className="sp-compare-label" data-side="before">
              {block.beforeLabel}
            </span>
            <span className="sp-compare-label" data-side="after">
              {block.afterLabel}
            </span>
            {!host.editing && (
              <input
                type="range"
                min={0}
                max={100}
                value={pos}
                onChange={(e) => setPos(Number(e.target.value))}
                aria-label={`Compare ${block.beforeLabel} and ${block.afterLabel}`}
              />
            )}
          </>
        )}
      </MediaBox>
      {block.caption && <figcaption className="sp-caption">{block.caption}</figcaption>}
    </figure>
  );
}

/* ── Facts, spacing ───────────────────────────────────────────────────── */

function FactsView({ block }: { block: FactsBlock }) {
  const { project } = useHost();
  const root = useBlockRoot(block);
  const rows = [...block.rows.filter((r) => r.label.trim() && r.value.trim())];
  if (block.auto) {
    if (project.role.length) rows.push({ label: "Role", value: project.role.join(", ") });
    if (project.tools.length) rows.push({ label: "Tools", value: project.tools.join(", ") });
    if (project.client) rows.push({ label: "Client", value: project.client });
    if (project.year) rows.push({ label: "Year", value: String(project.year) });
  }
  if (!rows.length) return null;
  return (
    <dl {...root} className={`${root.className} sp-facts`}>
      {rows.map((r, i) => (
        <div key={r.label + i}>
          <dt className="sp-label">{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SpacerView({ block }: { block: SpacerBlock }) {
  const root = useBlockRoot(block, responsiveVars(block, (b) => ({ size: b.size })) as Record<string, string>);
  return <div {...root} aria-hidden="true" />;
}

function DividerView({ block }: { block: Block }) {
  const root = useBlockRoot(block);
  return <hr {...root} className={`${root.className} sp-divider`} />;
}

export function BlockView({ block }: { block: Block; layout: SectionLayoutType }) {
  switch (block.type) {
    case "heading":
      return <HeadingView block={block} />;
    case "text":
      return <TextView block={block} />;
    case "quote":
      return <QuoteView block={block} />;
    case "image":
      return <ImageView block={block} />;
    case "video":
      return <VideoView block={block} />;
    case "gallery":
      return <GalleryView block={block} />;
    case "compare":
      return <CompareView block={block} />;
    case "embed":
      return <EmbedView block={block} />;
    case "audio":
      return <AudioPlayerView block={block} />;
    case "facts":
      return <FactsView block={block} />;
    case "spacer":
      return <SpacerView block={block} />;
    case "divider":
      return <DividerView block={block} />;
    case "layers":
      return <LayersView block={block} />;
    case "turntable":
      return <TurntableView block={block} />;
    case "stats":
      return <StatsView block={block} />;
    case "palette":
      return <PaletteView block={block} />;
    case "specimen":
      return <SpecimenView block={block} />;
    case "prompt":
      return <PromptView block={block} />;
    case "timeline":
      return <TimelineView block={block} />;
    case "button":
      return <ButtonView block={block} />;
    case "credits":
      return <CreditsView block={block} />;
    case "tracklist":
      return <TracklistView block={block} />;
    case "model":
      return <ModelView block={block} />;
    case "lottie":
      return <LottieView block={block} />;
  }
}
