import type { CSSProperties } from "react";
import { CONTENT_WIDTH_PX, type Section } from "../model/schema.ts";
import { SoundtrackPill } from "./BlocksMore.tsx";
import { useHost } from "./context.tsx";
import { hiddenAt, responsiveVars } from "./responsive.ts";
import { BlockView } from "./Blocks.tsx";

const ALIGN = { start: "flex-start", center: "center", end: "flex-end" } as const;
const JUSTIFY = { start: "flex-start", center: "center", end: "flex-end", "space-between": "space-between" } as const;
const ITEMS = { ...ALIGN, stretch: "stretch" } as const;

function sectionVars(section: Section) {
  return responsiveVars(section, (s) => {
    const l = s.layout;
    const sw = CONTENT_WIDTH_PX[l.width];
    const v: Record<string, string | number | undefined> = {
      "s-pt": `${s.style.paddingTop}px`,
      "s-pb": `${s.style.paddingBottom}px`,
      "s-sw": sw ? `${sw}px` : "none",
    };
    switch (l.type) {
      case "flow":
        v["s-gap"] = `${l.gap}px`;
        v["s-align"] = ALIGN[l.align];
        break;
      case "stack":
        v["s-gap"] = `${l.gap}px`;
        v["s-dir"] = l.direction;
        v["s-just"] = JUSTIFY[l.distribute];
        v["s-ai"] = ITEMS[l.align];
        v["s-wrap"] = l.wrap ? "wrap" : "nowrap";
        break;
      case "grid":
        v["s-cols"] = l.columns;
        v["s-gap"] = `${l.gap}px`;
        v["s-rgap"] = `${l.rowGap}px`;
        break;
      case "canvas":
        v["s-ar"] = l.aspect;
        break;
    }
    return v;
  });
}

export function SectionView({ section }: { section: Section }) {
  const host = useHost();
  const hidden = hiddenAt(section);
  const type = section.layout.type;
  // A canvas falls back to a stack on phones unless someone placed its blocks for phones.
  const phoneFlow = type === "canvas" && !section.blocks.some((b) => b.overrides?.phone && "frame" in b.overrides.phone);
  const style = { ...sectionVars(section), ...(section.style.bg ? { "--s-bg": section.style.bg } : null) } as CSSProperties;
  return (
    <section
      className={`sp-section sp-r sp-l-${type}`}
      style={style}
      data-node-id={section.id}
      data-node-kind="section"
      data-hide={host.editing ? undefined : hidden}
      data-ghost={host.editing ? hidden : undefined}
      aria-label={section.name}
    >
      <div className={`sp-${type}`} data-phone-flow={phoneFlow ? "" : undefined}>
        {section.blocks.map((b) => (
          <BlockView key={b.id} block={b} layout={type} />
        ))}
        {section.blocks.length === 0 && host.editing && (
          <div className="sp-placeholder" data-drop="section">
            Empty section. Drop images here or use + to add blocks.
          </div>
        )}
      </div>
    </section>
  );
}

/** Light page backgrounds flip the text to dark, so a cream page still reads. */
function tone(bg: string): "dark" | "light" {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "dark";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "light" : "dark";
}

function accentHsl(accent: string | undefined, alpha: number) {
  const a = accent?.trim() || "265 85% 58%";
  return a.startsWith("#") ? `color-mix(in srgb, ${a} ${alpha * 100}%, transparent)` : `hsl(${a} / ${alpha})`;
}

/**
 * The whole case-study page. Order follows the site: title, cover, then the
 * intro and the story in the order the page's chrome says, then next project.
 */
export function PageView() {
  const host = useHost();
  const p = host.project;
  const { style, chrome, sections } = p.page;

  const intro = (
    <section className="sp-intro" data-node-id="chrome:intro" data-node-kind="chrome">
      <p className="sp-intro-text">{p.description || (host.editing ? <span className="sp-empty-text">Describe the project…</span> : null)}</p>
      <div className="sp-intro-side">
        <div>
          <h2>Role</h2>
          <p>{p.role.join(", ")}</p>
        </div>
        <div>
          <h2>Tools</h2>
          <p>{p.tools.join(", ")}</p>
        </div>
      </div>
    </section>
  );

  return (
    <div className={`sp-page${host.editing ? " sp-editing" : ""}`} style={{ "--sp-bg": style.bg } as CSSProperties}>
      <div
        className="sp-root"
        data-tone={style.text ? undefined : tone(style.bg)}
        style={
          {
            "--sp-spacing": `${style.spacing}px`,
            "--sp-radius": `${style.radius}px`,
            ...(style.text ? { "--sp-text": style.text } : null),
          } as CSSProperties
        }
      >
        {chrome.header && (
          <section className="sp-head" data-node-id="chrome:header" data-node-kind="chrome">
            <span className="sp-eyebrow">
              {p.categories[0] ?? ""} · {p.year}
            </span>
            <h1 className="sp-title">{p.title || (host.editing ? <span className="sp-empty-text">Untitled project</span> : "")}</h1>
          </section>
        )}

        {chrome.cover && (
          <div
            className="sp-cover"
            data-node-id="chrome:cover"
            data-node-kind="chrome"
            role="img"
            aria-label={p.cover?.alt}
            style={
              p.cover?.src
                ? undefined
                : { background: `radial-gradient(circle at 30% 20%, ${accentHsl(p.accent, 0.5)}, var(--sp-surface) 65%)` }
            }
          >
            {p.cover?.src &&
              (p.cover.type === "video" ? (
                <video src={host.mediaUrl(p.cover.src)} poster={p.cover.poster ? host.mediaUrl(p.cover.poster) : undefined} muted loop autoPlay playsInline />
              ) : (
                <img src={host.mediaUrl(p.cover.src)} alt={p.cover.alt} />
              ))}
          </div>
        )}

        {chrome.intro === "before" && intro}

        {(sections.length > 0 || host.editing) && (
          <div className="sp-story" data-node-id="story" data-node-kind="story">
            {sections.map((s) => (
              <SectionView key={s.id} section={s} />
            ))}
            {sections.length === 0 && (
              <div className="sp-section">
                <div className="sp-placeholder" data-drop="story" style={{ minHeight: 280 }}>
                  Your story starts here. Drop images, or add a section with +.
                </div>
              </div>
            )}
          </div>
        )}

        {chrome.intro === "after" && intro}

        {chrome.next && (
          <section className="sp-next" data-node-id="chrome:next" data-node-kind="chrome">
            <div>
              <p className="sp-next-label">Next project</p>
              <a className="sp-next-title" href={host.nextHref ?? "#"}>
                {host.nextTitle ?? "Next project"} →
              </a>
            </div>
            <a className="sp-pill" href="/work">
              All work
            </a>
          </section>
        )}
        <SoundtrackPill />
      </div>
    </div>
  );
}

/**
 * Just the story, for the site: its page already draws the title, cover,
 * intro and next-project link, so only the sections (and the soundtrack pill)
 * come from here, inside the same root and tokens as the editor uses.
 */
export function StoryView() {
  const host = useHost();
  const { style, sections } = host.project.page;
  if (!sections.length) return null;
  return (
    <div className="sp-page sp-story-only" style={{ "--sp-bg": "transparent" } as CSSProperties}>
      <div
        className="sp-root"
        data-tone={style.text ? undefined : tone(style.bg)}
        style={
          {
            "--sp-spacing": `${style.spacing}px`,
            "--sp-radius": `${style.radius}px`,
            ...(style.text ? { "--sp-text": style.text } : null),
          } as CSSProperties
        }
      >
        <div className="sp-story">
          {sections.map((s) => (
            <SectionView key={s.id} section={s} />
          ))}
        </div>
        <SoundtrackPill />
      </div>
    </div>
  );
}
