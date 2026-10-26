import { useEffect, useId, useState } from "react";
import {
  batch,
  step,
  BLOCK_LABELS,
  LIMITS,
  blockClearOverride,
  findBlock,
  findSection,
  hasOverride,
  newLayout,
  pageChrome,
  pageStyle,
  resolveNode,
  sectionClearOverride,
  sectionUpdate,
  blockUpdate,
  type Block,
  type BlockWidth,
  type Breakpoint,
  type ContentWidth,
  type Media,
  type Project,
  type Section,
  type SectionLayout,
} from "../model/index.ts";
import { plainText, textToHtml } from "../render/sanitize.ts";
import { Icon } from "../ui/icons.tsx";
import { mediaUrl } from "../lib/media.ts";
import { run, setInspectorTab, setRenaming, setSettingsOpen, setTextEdit, useEditor } from "./store.ts";
import { DesignPanel } from "./InspectorDesign.tsx";
import { convertToCanvas } from "./canvasOps.ts";
import { deleteSelection, duplicateSelection, setProject, setProps, toggleHidden, toggleLocked } from "./actions.ts";
import { BLOCK_WIDTHS, ColorField, Group, ListField, MediaField, NumberSlider, Row, Segmented, ShapeSelect, TextField, Toggle } from "./fields.tsx";
import { nodeLabel } from "./Overlay.tsx";
import { EmbedPanel, GalleryItemPanel, GalleryPanel } from "./InspectorGallery.tsx";
import {
  AudioPanel,
  ButtonPanel,
  CreditsPanel,
  LayerBreakdownPanel,
  LottiePanel,
  ModelPanel,
  PalettePanel,
  PromptPanel,
  SpecimenPanel,
  StatsPanel,
  TimelinePanel,
  TracklistPanel,
  TurntablePanel,
} from "./InspectorBlocks.tsx";
import { galleryOf, splitSel } from "./gallery.ts";

const WIDTHS: { value: ContentWidth; label: string }[] = [
  { value: "narrow", label: "Narrow" },
  { value: "text", label: "Text" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full" },
];
const BP_NAME: Record<Breakpoint, string> = { desktop: "desktop", tablet: "tablet", phone: "phone" };

/* ── Shared bits ──────────────────────────────────────────────────────── */

/** Reset helpers for the override dot. */
function useOverride(node: Section | Block, isSection: boolean) {
  const bp = useEditor((s) => s.bp);
  return {
    bp,
    has: (key: string) => hasOverride(node, bp, key),
    reset: (key: string) =>
      bp !== "desktop" &&
      run(isSection ? sectionClearOverride : blockClearOverride, { id: node.id, bp, key } as never),
  };
}

function BreakpointNote({ bp }: { bp: Breakpoint }) {
  if (bp === "desktop") return null;
  return (
    <p className="bp-note">
      <Icon name={bp === "tablet" ? "tablet" : "phone"} size={14} />
      Layout changes here apply to {BP_NAME[bp]} only. Content is shared.
    </p>
  );
}

/* ── Page (nothing selected, or a page part) ──────────────────────────── */

function PagePanel({ project, focus }: { project: Project; focus?: string }) {
  const style = project.page.style;
  const chrome = project.page.chrome;
  const ids = { title: useId(), year: useId(), cat: useId(), sum: useId(), desc: useId(), role: useId(), tools: useId(), alt: useId() };
  return (
    <>
      {focus === "chrome:cover" && (
        <Group title="Cover">
          <MediaField
            media={project.cover ? { src: project.cover.src, type: project.cover.type, alt: project.cover.alt } : null}
            accept="image/*,video/*"
            label="Choose a cover"
            onChange={(m) =>
              setProject({ cover: m ? { src: m.src, type: m.type === "video" ? "video" : "image", alt: m.alt || project.cover?.alt || "" } : null })
            }
          />
          <Row label="Alt text" htmlFor={ids.alt} stack>
            <TextField
              id={ids.alt}
              value={project.cover?.alt ?? ""}
              placeholder="What the cover shows"
              onChange={(alt) => project.cover && setProject({ cover: { ...project.cover, alt } })}
            />
          </Row>
          <p className="hint">Shown at 16:9 on the page. Best at 1920 × 1080 or larger.</p>
        </Group>
      )}

      <Group
        title="Project"
        actions={
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSettingsOpen(true)} title="Cover crops, tags, credits, SEO… (Ctrl+,)">
            All settings
          </button>
        }
      >
        <Row label="Title" htmlFor={ids.title} stack>
          <TextField id={ids.title} value={project.title} placeholder="Project title" primary={focus !== "chrome:intro"} onChange={(title) => setProject({ title })} />
        </Row>
        <div className="row-pair">
          <Row label="Category" htmlFor={ids.cat} stack>
            <TextField
              id={ids.cat}
              value={project.categories[0] ?? ""}
              placeholder="e.g. Product Viz"
              onChange={(c) => setProject({ categories: c.trim() ? [c, ...project.categories.slice(1)] : project.categories.slice(1) })}
            />
          </Row>
          <Row label="Year" htmlFor={ids.year} stack>
            <input
              id={ids.year}
              className="input tabular"
              type="number"
              min={1990}
              max={2100}
              value={project.year}
              onChange={(e) => e.target.value && setProject({ year: Number(e.target.value) })}
            />
          </Row>
        </div>
        <Row label="Summary" htmlFor={ids.sum} stack>
          <TextField
            id={ids.sum}
            multiline
            rows={2}
            maxLength={LIMITS.summary}
            value={project.summary}
            placeholder="One line for cards and search results"
            onChange={(summary) => setProject({ summary })}
          />
        </Row>
        <Row label="Description" htmlFor={ids.desc} stack>
          <TextField
            id={ids.desc}
            multiline
            rows={5}
            value={project.description}
            placeholder="The brief, what you did, how it turned out"
            primary={focus === "chrome:intro"}
            onChange={(description) => setProject({ description })}
          />
        </Row>
        <Row label="Role" htmlFor={ids.role} stack>
          <ListField id={ids.role} value={project.role} placeholder="3D Rendering, Lookdev, Lighting" onChange={(role) => setProject({ role })} />
        </Row>
        <Row label="Tools" htmlFor={ids.tools} stack>
          <ListField id={ids.tools} value={project.tools} placeholder="Blender, Substance Painter" onChange={(tools) => setProject({ tools })} />
        </Row>
        <Row label="Featured">
          <Toggle checked={project.featured} label="Feature on the homepage" onChange={(featured) => setProject({ featured })} />
        </Row>
      </Group>

      <Group title="Page">
        <Row label="Background">
          <ColorField value={style.bg} onChange={(bg) => bg && run(pageStyle, { patch: { bg } })} />
        </Row>
        <Row label="Section spacing" stack>
          <NumberSlider value={style.spacing} min={0} max={LIMITS.spacingMax} onChange={(spacing) => run(pageStyle, { patch: { spacing } })} />
        </Row>
        <Row label="Media corners" stack>
          <NumberSlider value={style.radius} min={0} max={40} onChange={(radius) => run(pageStyle, { patch: { radius } })} />
        </Row>
      </Group>

      <Group title="Page parts">
        <Row label="Title">
          <Toggle checked={chrome.header} label="Show the title" onChange={(header) => run(pageChrome, { patch: { header } })} />
        </Row>
        <Row label="Cover">
          <Toggle checked={chrome.cover} label="Show the cover" onChange={(cover) => run(pageChrome, { patch: { cover } })} />
        </Row>
        <Row label="Intro" stack>
          <Segmented
            label="Intro position"
            value={chrome.intro}
            onChange={(intro) => run(pageChrome, { patch: { intro } })}
            options={[
              { value: "before", label: "Before story" },
              { value: "after", label: "After" },
              { value: "hidden", label: "Hidden" },
            ]}
          />
        </Row>
        <Row label="Next project">
          <Toggle checked={chrome.next} label="Show next project" onChange={(next) => run(pageChrome, { patch: { next } })} />
        </Row>
      </Group>

      <Group title="Soundtrack">
        <MediaField
          media={project.soundtrack ? { src: project.soundtrack.src, type: "audio", alt: "" } : null}
          accept="audio/*"
          label="Choose a track"
          onChange={(m) =>
            setProject({ soundtrack: m ? { src: m.src, title: project.soundtrack?.title ?? m.src.split("/").pop()?.replace(/\.[^.]+$/, ""), volume: project.soundtrack?.volume ?? 0.6 } : undefined })
          }
        />
        {project.soundtrack ? (
          <>
            <Row label="Name" stack>
              <TextField value={project.soundtrack.title ?? ""} placeholder="Shown on the pill" onChange={(title) => setProject({ soundtrack: { ...project.soundtrack!, title: title || undefined } })} />
            </Row>
            <Row label="Volume" stack>
              <NumberSlider value={Math.round(project.soundtrack.volume * 100)} min={10} max={100} unit="%" onChange={(v) => setProject({ soundtrack: { ...project.soundtrack!, volume: v / 100 } })} />
            </Row>
          </>
        ) : null}
        <p className="hint">Visitors get a small “Play soundtrack” pill. It never starts by itself, and fades in and out.</p>
      </Group>
    </>
  );
}

/* ── Section ──────────────────────────────────────────────────────────── */

function SectionPanel({ section }: { section: Section }) {
  const o = useOverride(section, true);
  const r = resolveNode(section, o.bp);
  const l = r.layout;
  const set = (patch: Record<string, unknown>) => setProps(section.id, patch);
  const setLayout = (patch: Partial<SectionLayout>) => set({ layout: patch });
  const nameId = useId();
  const changeType = (type: SectionLayout["type"]) => {
    if (type === section.layout.type) return;
    if (type === "canvas") return convertToCanvas(section.id);
    // Replace the layout outright so no setting from the old type lingers.
    run(batch, {
      label: "Change layout",
      steps: [
        step(sectionUpdate, { id: section.id, patch: { layout: null } }),
        step(sectionUpdate, { id: section.id, patch: { layout: newLayout(type, section.layout.width) } }),
      ],
    });
  };

  return (
    <>
      <Group title="Section">
        <Row label="Name" htmlFor={nameId} stack>
          <TextField id={nameId} value={section.name} onChange={(name) => run(sectionUpdate, { id: section.id, patch: { name } })} />
        </Row>
        <Row label="Layout" stack>
          <Segmented
            label="Layout"
            value={section.layout.type}
            onChange={changeType}
            options={[
              { value: "flow", label: "Flow", icon: "flow" },
              { value: "stack", label: "Stack", icon: "stack" },
              { value: "grid", label: "Grid", icon: "grid" },
              { value: "canvas", label: "Free canvas", icon: "canvas" },
            ]}
          />
        </Row>
        {o.bp !== "desktop" && <p className="hint">Switch to desktop to change the layout type.</p>}
      </Group>

      <Group title="Layout">
        <BreakpointNote bp={o.bp} />
        <Row label="Width" stack override={o.has("layout")} onReset={() => o.reset("layout")}>
          <Segmented label="Content width" value={l.width} options={WIDTHS} onChange={(width) => setLayout({ width })} />
        </Row>
        {l.type !== "canvas" && (
          <Row label={l.type === "grid" ? "Column gap" : "Gap"} stack>
            <NumberSlider value={l.gap} min={0} max={160} onChange={(gap) => setLayout({ gap })} />
          </Row>
        )}
        {l.type === "grid" && (
          <>
            <Row label="Columns" stack>
              <NumberSlider value={l.columns} min={1} max={12} unit="" onChange={(columns) => setLayout({ columns })} />
            </Row>
            <Row label="Row gap" stack>
              <NumberSlider value={l.rowGap} min={0} max={160} onChange={(rowGap) => setLayout({ rowGap })} />
            </Row>
          </>
        )}
        {l.type === "stack" && (
          <>
            <Row label="Direction" stack>
              <Segmented
                label="Direction"
                value={l.direction}
                onChange={(direction) => setLayout({ direction })}
                options={[
                  { value: "row", label: "Side by side" },
                  { value: "column", label: "Stacked" },
                ]}
              />
            </Row>
            <Row label="Distribute">
              <select className="input select" value={l.distribute} onChange={(e) => setLayout({ distribute: e.target.value as never })}>
                <option value="start">Start</option>
                <option value="center">Centre</option>
                <option value="end">End</option>
                <option value="space-between">Space between</option>
              </select>
            </Row>
            <Row label="Wrap">
              <Toggle checked={l.wrap} label="Wrap onto new lines" onChange={(wrap) => setLayout({ wrap })} />
            </Row>
          </>
        )}
        {(l.type === "flow" || l.type === "stack") && (
          <Row label="Align" stack>
            <Segmented
              label="Align"
              value={l.align === "stretch" ? "start" : l.align}
              onChange={(align) => setLayout({ align })}
              options={[
                { value: "start", label: "Start", icon: "alignLeft" },
                { value: "center", label: "Centre", icon: "alignCenter" },
                { value: "end", label: "End", icon: "alignRight" },
              ]}
            />
          </Row>
        )}
        {l.type === "canvas" && (
          <Row label="Shape" stack>
            <ShapeSelect value={l.aspect} onChange={(aspect) => setLayout({ aspect: aspect ?? 16 / 9 })} />
          </Row>
        )}
      </Group>

      <Group title="Spacing">
        <Row label="Above" stack override={o.has("style")} onReset={() => o.reset("style")}>
          <NumberSlider value={r.style.paddingTop} min={0} max={240} onChange={(paddingTop) => set({ style: { paddingTop } })} />
        </Row>
        <Row label="Below" stack>
          <NumberSlider value={r.style.paddingBottom} min={0} max={240} onChange={(paddingBottom) => set({ style: { paddingBottom } })} />
        </Row>
        <Row label="Background">
          <ColorField value={section.style.bg} allowClear onChange={(bg) => run(sectionUpdate, { id: section.id, patch: { style: { bg } } })} />
        </Row>
      </Group>
    </>
  );
}

/* ── Blocks ───────────────────────────────────────────────────────────── */

function BlockContent({ block, project }: { block: Block; project: Project }) {
  const o = useOverride(block, false);
  const r = resolveNode(block, o.bp);
  const content = (patch: Record<string, unknown>) => run(blockUpdate, { id: block.id, patch });
  const layout = (patch: Record<string, unknown>) => setProps(block.id, patch);
  const ids = { a: useId(), b: useId(), c: useId(), d: useId() };

  const widthRow = "width" in r && (
    <Row label="Width" stack override={o.has("width")} onReset={() => o.reset("width")}>
      <Segmented label="Block width" value={r.width as BlockWidth} options={BLOCK_WIDTHS} onChange={(width) => layout({ width })} />
    </Row>
  );
  const captionRow = "caption" in block || ["image", "video", "gallery", "compare"].includes(block.type) ? (
    <Row label="Caption" htmlFor={ids.d} stack>
      <TextField id={ids.d} value={(block as { caption?: string }).caption ?? ""} placeholder="Optional" onChange={(caption) => content({ caption: caption || undefined })} />
    </Row>
  ) : null;

  switch (block.type) {
    case "heading":
      return (
        <Group title="Heading">
          <Row label="Text" htmlFor={ids.a} stack>
            <TextField id={ids.a} multiline rows={2} value={block.text} placeholder="Section title" onChange={(text) => content({ text })} primary />
          </Row>
          <Row label="Size" stack>
            <Segmented
              label="Heading size"
              value={block.level}
              onChange={(level) => content({ level })}
              options={[
                { value: 1, label: "Large" },
                { value: 2, label: "Medium" },
                { value: 3, label: "Small" },
              ]}
            />
          </Row>
          <AlignRow node={block} o={o} />
        </Group>
      );
    case "text": {
      const formatted = /<(a|strong|em|b|i|u|ul|ol|mark)\b/i.test(block.html);
      return (
        <Group title="Text">
          <Row label="Style" htmlFor={ids.b}>
            <select id={ids.b} className="input select" value={block.preset} onChange={(e) => content({ preset: e.target.value })}>
              <option value="lede">Lede (large)</option>
              <option value="body">Body</option>
              <option value="caption">Caption</option>
              <option value="label">Label</option>
              <option value="h3">Small heading</option>
            </select>
          </Row>
          <Row label="Words" htmlFor={ids.a} stack>
            <TextField id={ids.a} multiline rows={9} value={plainText(block.html)} placeholder="Write something. A blank line starts a new paragraph." onChange={(t) => content({ html: textToHtml(t) })} primary />
          </Row>
          <p className="hint">
            {formatted
              ? "This text has bold, links or lists. Editing here keeps the words but drops that formatting, so change it on the page. "
              : "Bold, italic, links and lists are set on the page. "}
            <button type="button" className="link-btn" onClick={() => setTextEdit({ id: block.id, part: "text" })}>
              Edit on the page (Enter)
            </button>
          </p>
          <AlignRow node={block} o={o} />
        </Group>
      );
    }
    case "quote":
      return (
        <Group title="Quote">
          <Row label="Quote" htmlFor={ids.a} stack>
            <TextField id={ids.a} multiline rows={4} value={block.text} onChange={(text) => content({ text })} primary />
          </Row>
          <Row label="Who said it" htmlFor={ids.b} stack>
            <TextField id={ids.b} value={block.cite ?? ""} placeholder="Name, role, company" onChange={(cite) => content({ cite: cite || undefined })} />
          </Row>
        </Group>
      );
    case "image":
      return (
        <Group title="Image">
          <MediaField media={block.media} onChange={(media) => content({ media })} label="Choose an image" />
          {block.media && (
            <Row label="Alt text" htmlFor={ids.a} stack>
              <TextField id={ids.a} value={block.media.alt} placeholder="Describe the image for screen readers" onChange={(alt) => content({ media: { ...block.media!, alt } })} />
            </Row>
          )}
          {captionRow}
          {widthRow}
          <Row label="Shape" htmlFor={ids.b} override={o.has("aspect")} onReset={() => o.reset("aspect")}>
            <ShapeSelect id={ids.b} value={r.type === "image" ? r.aspect : null} onChange={(aspect) => layout({ aspect })} />
          </Row>
          {block.aspect !== null && (
            <Row label="Fit" stack>
              <Segmented label="Fit" value={block.fit} onChange={(fit) => content({ fit })} options={[{ value: "cover", label: "Fill" }, { value: "contain", label: "Fit inside" }]} />
            </Row>
          )}
          {block.media && (
            <button
              type="button"
              className="btn btn-sm btn-block"
              onClick={() => setProject({ cover: { src: block.media!.src, type: "image", alt: block.media!.alt || project.cover?.alt || "" } })}
              disabled={project.cover?.src === block.media.src}
            >
              {project.cover?.src === block.media.src ? "This is the cover" : "Use as cover"}
            </button>
          )}
        </Group>
      );
    case "video":
      return (
        <Group title="Video">
          <Row label="Source" stack>
            <Segmented label="Source" value={block.source} onChange={(source) => content({ source })} options={[{ value: "file", label: "File" }, { value: "embed", label: "YouTube / Vimeo" }]} />
          </Row>
          {block.source === "file" ? (
            <MediaField media={block.media} accept="video/*" onChange={(media) => content({ media })} label="Choose a video" />
          ) : (
            <Row label="Link" htmlFor={ids.a} stack>
              <TextField id={ids.a} value={block.url ?? ""} placeholder="https://youtu.be/… or https://vimeo.com/…" onChange={(url) => content({ url })} primary />
            </Row>
          )}
          {block.source === "file" && (
            <>
              <Row label="Autoplay">
                <Toggle checked={block.autoplay} label="Autoplay" onChange={(autoplay) => content({ autoplay, ...(autoplay ? { muted: true } : null) })} />
              </Row>
              <Row label="Loop">
                <Toggle checked={block.loop} label="Loop" onChange={(loop) => content({ loop })} />
              </Row>
              <Row label="Muted">
                <Toggle checked={block.muted} label="Muted" onChange={(muted) => content({ muted })} />
              </Row>
              <Row label="Controls">
                <Toggle checked={block.controls} label="Show player controls" onChange={(controls) => content({ controls })} />
              </Row>
            </>
          )}
          {captionRow}
          {widthRow}
          <Row label="Shape" htmlFor={ids.b}>
            <ShapeSelect id={ids.b} value={block.aspect} onChange={(aspect) => layout({ aspect })} />
          </Row>
        </Group>
      );
    case "gallery":
      return <GalleryPanel block={block} />;
    case "embed":
      return <EmbedPanel block={block} />;
    case "audio":
      return <AudioPanel block={block} />;
    case "compare":
      return (
        <Group title="Before / after">
          <Row label="Before" stack>
            <MediaField media={block.before} onChange={(before) => content({ before })} label="Choose before" />
          </Row>
          <Row label="After" stack>
            <MediaField media={block.after} onChange={(after) => content({ after })} label="Choose after" />
          </Row>
          <div className="row-pair">
            <Row label="Left label" htmlFor={ids.a} stack>
              <TextField id={ids.a} value={block.beforeLabel} onChange={(beforeLabel) => content({ beforeLabel })} />
            </Row>
            <Row label="Right label" htmlFor={ids.b} stack>
              <TextField id={ids.b} value={block.afterLabel} onChange={(afterLabel) => content({ afterLabel })} />
            </Row>
          </div>
          <Row label="Slider starts at" stack>
            <NumberSlider value={block.start} min={0} max={100} unit="%" onChange={(start) => content({ start })} />
          </Row>
          <Row label="Shape" htmlFor={ids.c}>
            <ShapeSelect id={ids.c} value={block.aspect} onChange={(aspect) => layout({ aspect: aspect ?? 16 / 9 })} />
          </Row>
          {captionRow}
          {widthRow}
        </Group>
      );
    case "facts":
      return (
        <Group title="Facts">
          <Row label="Project details">
            <Toggle checked={block.auto} label="Include role, tools, client and year" onChange={(auto) => content({ auto })} />
          </Row>
          <p className="hint">Adds Role, Tools, Client and Year from the project details.</p>
          <FactRows rows={block.rows} onChange={(rows) => content({ rows })} />
        </Group>
      );
    case "spacer":
      return (
        <Group title="Spacer">
          <Row label="Height" stack override={o.has("size")} onReset={() => o.reset("size")}>
            <NumberSlider value={r.type === "spacer" ? r.size : 48} min={0} max={400} onChange={(size) => layout({ size })} />
          </Row>
        </Group>
      );
    case "divider":
      return (
        <Group title="Divider">
          <p className="hint">A hairline across the column, in the page's border colour.</p>
        </Group>
      );
    case "layers":
      return <LayerBreakdownPanel block={block} />;
    case "turntable":
      return <TurntablePanel block={block} />;
    case "stats":
      return <StatsPanel block={block} />;
    case "palette":
      return <PalettePanel block={block} />;
    case "specimen":
      return <SpecimenPanel block={block} />;
    case "prompt":
      return <PromptPanel block={block} />;
    case "timeline":
      return <TimelinePanel block={block} />;
    case "button":
      return <ButtonPanel block={block} />;
    case "credits":
      return <CreditsPanel block={block} />;
    case "tracklist":
      return <TracklistPanel block={block} />;
    case "model":
      return <ModelPanel block={block} />;
    case "lottie":
      return <LottiePanel block={block} />;
  }
}

function AlignRow({ node, o }: { node: Block; o: ReturnType<typeof useOverride> }) {
  const r = resolveNode(node, o.bp) as { align?: "left" | "center" | "right" };
  return (
    <Row label="Align" stack override={o.has("align")} onReset={() => o.reset("align")}>
      <Segmented
        label="Text alignment"
        value={r.align ?? "left"}
        onChange={(align) => setProps(node.id, { align })}
        options={[
          { value: "left", label: "Left", icon: "alignLeft" },
          { value: "center", label: "Centre", icon: "alignCenter" },
          { value: "right", label: "Right", icon: "alignRight" },
        ]}
      />
    </Row>
  );
}

function FactRows({ rows, onChange }: { rows: { label: string; value: string }[]; onChange: (rows: { label: string; value: string }[]) => void }) {
  const update = (i: number, patch: Partial<{ label: string; value: string }>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="fact-rows">
      {rows.map((r, i) => (
        <div key={i} className="fact-row">
          <input className="input" value={r.label} placeholder="Label" aria-label="Fact label" onChange={(e) => update(i, { label: e.target.value })} />
          <input className="input" value={r.value} placeholder="Value" aria-label="Fact value" onChange={(e) => update(i, { value: e.target.value })} />
          <button type="button" className="icon-btn" title="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => onChange([...rows, { label: "", value: "" }])}>
        <Icon name="plus" size={14} />
        Add a row
      </button>
    </div>
  );
}

/* ── Inspector ────────────────────────────────────────────────────────── */

function NodeFooter({ node }: { node: Section | Block }) {
  const bp = useEditor((s) => s.bp);
  const hidden = !!resolveNode(node, bp).hidden;
  return (
    <Group title="Visibility">
      <Row label={bp === "desktop" ? "Show" : `Show on ${bp}`}>
        <Toggle checked={!hidden} label="Visible" onChange={() => toggleHidden([node.id])} />
      </Row>
      <Row label="Lock">
        <Toggle checked={!!node.locked} label="Locked" onChange={() => toggleLocked([node.id])} />
      </Row>
      <div className="node-actions">
        <button type="button" className="btn btn-sm" onClick={() => setRenaming(node.id)}>
          Rename
        </button>
        <button type="button" className="btn btn-sm" onClick={duplicateSelection}>
          <Icon name="duplicate" size={14} />
          Duplicate
        </button>
        <button type="button" className="btn btn-sm btn-danger" onClick={deleteSelection}>
          <Icon name="trash" size={14} />
          Delete
        </button>
      </div>
    </Group>
  );
}

export function Inspector() {
  const doc = useEditor((s) => s.history?.doc);
  const selection = useEditor((s) => s.selection);
  const tab = useEditor((s) => s.inspectorTab);
  const [scrollKey, setScrollKey] = useState("");
  const primary = selection[selection.length - 1];
  useEffect(() => setScrollKey(primary ?? ""), [primary]);
  useEffect(() => {
    // A short timeout, not rAF: the inspector may re-render for a new selection first.
    const focus = () =>
      setTimeout(() => {
        const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(".inspector [data-primary]");
        el?.focus();
        el?.setSelectionRange?.(el.value.length, el.value.length);
      }, 30);
    window.addEventListener("studio:edit", focus);
    return () => window.removeEventListener("studio:edit", focus);
  }, []);
  if (!doc) return null;

  let title = "Page";
  let tabs = false;
  let body: React.ReactNode;
  if (selection.length > 1) {
    title = `${selection.length} selected`;
    body = (
      <Group title="Selection">
        <p className="hint">Change one item at a time, or act on them all:</p>
        <div className="node-actions">
          <button type="button" className="btn btn-sm" onClick={duplicateSelection}>
            <Icon name="duplicate" size={14} />
            Duplicate
          </button>
          <button type="button" className="btn btn-sm" onClick={() => toggleHidden()}>
            <Icon name="eyeOff" size={14} />
            Hide / show
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={deleteSelection}>
            <Icon name="trash" size={14} />
            Delete
          </button>
        </div>
      </Group>
    );
  } else if (primary && findSection(doc, primary)) {
    const s = findSection(doc, primary)!.section;
    title = nodeLabel(doc, primary);
    body = (
      <>
        <SectionPanel section={s} />
        <NodeFooter node={s} />
      </>
    );
  } else if (primary && primary.includes("#") && galleryOf(primary)) {
    const { item } = splitSel(primary);
    const g = galleryOf(primary)!;
    title = nodeLabel(doc, primary);
    body = <GalleryItemPanel key={primary} block={g} index={item!} />;
  } else if (primary && findBlock(doc, primary)) {
    const b = findBlock(doc, primary)!.block;
    title = b.name ?? BLOCK_LABELS[b.type];
    tabs = true;
    body =
      tab === "design" ? (
        <DesignPanel key={b.id} block={b} />
      ) : (
        <>
          <BlockContent key={b.id} block={b} project={doc} />
          <NodeFooter node={b} />
        </>
      );
  } else {
    title = primary?.startsWith("chrome:") ? nodeLabel(doc, primary) : "Page";
    body = <PagePanel key={primary ?? "page"} project={doc} focus={primary} />;
  }

  return (
    <aside className="inspector" aria-label="Properties">
      <header className="inspector-head">
        <h2>{title}</h2>
        {tabs && (
          <div className="segmented insp-tabs" role="tablist" aria-label="Inspector">
            <button type="button" role="tab" aria-selected={tab === "content"} aria-pressed={tab === "content"} onClick={() => setInspectorTab("content")}>
              Content
            </button>
            <button type="button" role="tab" aria-selected={tab === "design"} aria-pressed={tab === "design"} onClick={() => setInspectorTab("design")}>
              Design
            </button>
          </div>
        )}
      </header>
      <div className="panel-scroll" key={scrollKey + (tabs ? tab : "")}>
        {body}
      </div>
    </aside>
  );
}
