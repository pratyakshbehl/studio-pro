import { useEffect, useId, useState, type ReactNode } from "react";
import {
  blockUpdate,
  resolveNode,
  type AudioBlock,
  type Block,
  type ButtonBlock,
  type Chapter,
  type CreditsBlock,
  type LayersBlock,
  type LottieBlock,
  type Media,
  type ModelBlock,
  type PaletteBlock,
  type PromptBlock,
  type SpecimenBlock,
  type StatsBlock,
  type TimelineBlock,
  type TracklistBlock,
  type TurntableBlock,
} from "../model/index.ts";
import { formatTime } from "../render/BlocksMore.tsx";
import { Icon } from "../ui/icons.tsx";
import { run, toast, useEditor } from "./store.ts";
import { setProps } from "./actions.ts";
import { measureInto } from "./peaks.ts";
import { uploadFile } from "./upload.ts";
import { BLOCK_WIDTHS, ColorField, Group, MediaField, Row, Segmented, ShapeSelect, TextField, Toggle, NumberSlider } from "./fields.tsx";

const content = (id: string, patch: Record<string, unknown>) => run(blockUpdate, { id, patch });

/**
 * Rows you can add, reorder and remove: stats, colours, steps, credits,
 * tracks, chapters, settings. `render` draws one row's fields.
 */
export function ListEditor<T>({
  items,
  onChange,
  make,
  render,
  add,
  empty,
}: {
  items: T[];
  onChange: (next: T[]) => void;
  make: () => T;
  render: (item: T, set: (patch: Partial<T>) => void, i: number) => ReactNode;
  add: string;
  empty?: string;
}) {
  const set = (i: number, patch: Partial<T>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <div className="list-editor">
      {!items.length && empty && <p className="hint">{empty}</p>}
      {items.map((it, i) => (
        <div key={i} className="list-row">
          <div className="list-fields">{render(it, (p) => set(i, p), i)}</div>
          <div className="list-tools">
            <button type="button" className="icon-btn" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
              <Icon name="chevron" size={12} style={{ rotate: "-90deg" }} />
            </button>
            <button type="button" className="icon-btn" title="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
              <Icon name="chevron" size={12} style={{ rotate: "90deg" }} />
            </button>
            <button type="button" className="icon-btn" title="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Icon name="close" size={12} />
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => onChange([...items, make()])}>
        <Icon name="plus" size={14} />
        {add}
      </button>
    </div>
  );
}

const Input = ({ value, onChange, placeholder, label, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string; mono?: boolean }) => (
  <input className="input" data-mono={mono || undefined} value={value} placeholder={placeholder} aria-label={label} onChange={(e) => onChange(e.target.value)} />
);

function CaptionAndWidth({ block }: { block: Block & { caption?: string; width?: unknown } }) {
  const bp = useEditor((s) => s.bp);
  const r = resolveNode(block, bp) as { width?: string };
  const id = useId();
  return (
    <>
      <Row label="Caption" htmlFor={id} stack>
        <TextField id={id} value={block.caption ?? ""} placeholder="Optional" onChange={(caption) => content(block.id, { caption: caption || undefined })} />
      </Row>
      {r.width && (
        <Row label="Width" stack>
          <Segmented label="Width" value={r.width as "content"} options={BLOCK_WIDTHS} onChange={(width) => setProps(block.id, { width })} />
        </Row>
      )}
    </>
  );
}

/** Upload several files and hand them over in order. */
function AddFiles({ accept, label, onFiles, multiple = true }: { accept: string; label: string; onFiles: (m: Media[]) => void; multiple?: boolean }) {
  const [busy, setBusy] = useState(false);
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="btn btn-sm" aria-disabled={busy || undefined}>
        <Icon name="upload" size={14} />
        {busy ? "Uploading…" : label}
      </label>
      <input
        id={id}
        type="file"
        hidden
        multiple={multiple}
        accept={accept}
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (!files.length) return;
          setBusy(true);
          try {
            const out: Media[] = [];
            for (const f of files) out.push(await uploadFile(f));
            onFiles(out);
          } catch (err) {
            toast((err as Error).message, "error");
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

/* ── Music ────────────────────────────────────────────────────────────── */

/** "1:23" or "83" → 83 seconds. */
function parseTime(v: string): number {
  const parts = v.split(":").map((p) => Number(p.trim()));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((t, n) => t * 60 + n, 0);
}

export function AudioPanel({ block }: { block: AudioBlock }) {
  const ids = { t: useId(), a: useId() };
  // A track without a waveform yet gets one measured as soon as it's selected.
  useEffect(() => {
    if (block.media && !block.peaks?.length) void measureInto(block.id, block.media);
  }, [block.id, block.media?.src, block.peaks?.length]);
  return (
    <>
      <Group title="Audio">
        <MediaField media={block.media} accept="audio/*" label="Choose a track" onChange={(media) => content(block.id, { media, peaks: undefined, duration: undefined })} />
        <p className="hint">
          {block.media ? (block.peaks?.length ? `Waveform ready · ${formatTime(block.duration)}` : "Measuring the waveform…") : "MP3, WAV, M4A, OGG or FLAC."}
        </p>
        <Row label="Title" htmlFor={ids.t} stack>
          <TextField id={ids.t} primary value={block.title ?? ""} placeholder="Track name" onChange={(title) => content(block.id, { title: title || undefined })} />
        </Row>
        <Row label="Artist" htmlFor={ids.a} stack>
          <TextField id={ids.a} value={block.artist ?? ""} placeholder="Who made it" onChange={(artist) => content(block.id, { artist: artist || undefined })} />
        </Row>
        <Row label="Cover art" stack>
          <MediaField media={block.cover ?? null} label="Choose a cover" onChange={(cover) => content(block.id, { cover })} />
        </Row>
      </Group>
      <Group title="Chapters">
        <ListEditor<Chapter>
          items={block.chapters ?? []}
          onChange={(chapters) => content(block.id, { chapters })}
          make={() => ({ time: 0, label: "" })}
          add="Add a chapter"
          empty="Mark moments people can jump to: the drop, the second verse, the director's commentary."
          render={(c, set) => (
            <div className="list-pair" data-narrow-first="">
              <TimeInput value={c.time} onChange={(time) => set({ time })} />
              <Input value={c.label} placeholder="What happens here" label="Chapter name" onChange={(label) => set({ label })} />
            </div>
          )}
        />
      </Group>
      <Group title="Caption">
        <CaptionAndWidth block={block} />
      </Group>
    </>
  );
}

function TimeInput({ value, onChange }: { value: number; onChange: (s: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="input tabular"
      aria-label="Time (m:ss)"
      value={draft ?? formatTime(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null) onChange(parseTime(draft));
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function TracklistPanel({ block }: { block: TracklistBlock }) {
  const ids = { t: useId(), a: useId() };
  useEffect(() => {
    block.tracks.forEach((t, i) => t.media && !t.peaks?.length && void measureInto(block.id, t.media, i));
  }, [block.id, block.tracks.map((t) => t.media?.src ?? "").join("|")]);
  return (
    <>
      <Group title="Release">
        <Row label="Title" htmlFor={ids.t} stack>
          <TextField id={ids.t} primary value={block.title ?? ""} placeholder="EP or album name" onChange={(title) => content(block.id, { title: title || undefined })} />
        </Row>
        <Row label="Artist" htmlFor={ids.a} stack>
          <TextField id={ids.a} value={block.artist ?? ""} placeholder="Who made it" onChange={(artist) => content(block.id, { artist: artist || undefined })} />
        </Row>
        <Row label="Cover art" stack>
          <MediaField media={block.cover} label="Choose a cover" onChange={(cover) => content(block.id, { cover })} />
        </Row>
      </Group>
      <Group
        title={`Tracks · ${block.tracks.length}`}
        actions={
          <AddFiles
            accept="audio/*"
            label="Add audio"
            onFiles={(media) => {
              const start = block.tracks.length;
              content(block.id, { tracks: [...block.tracks, ...media.map((m) => ({ title: decodeURIComponent(m.src.split("/").pop() ?? "").replace(/\.[^.]+$/, ""), media: m }))] });
              media.forEach((m, i) => void measureInto(block.id, m, start + i));
            }}
          />
        }
      >
        <ListEditor
          items={block.tracks}
          onChange={(tracks) => content(block.id, { tracks })}
          make={() => ({ title: "", media: null })}
          add="Add a track by hand"
          empty="Drop audio files on the block, or use Add audio."
          render={(t, set) => (
            <div className="list-pair">
              <Input value={t.title} placeholder="Track title" label="Track title" onChange={(title) => set({ title })} />
              <span className="list-meta">{t.media ? formatTime(t.duration) : "no file"}</span>
            </div>
          )}
        />
      </Group>
    </>
  );
}

/* ── Case study ───────────────────────────────────────────────────────── */

export function LayerBreakdownPanel({ block }: { block: LayersBlock }) {
  const bp = useEditor((s) => s.bp);
  const r = resolveNode(block, bp);
  return (
    <>
      <Group title="Layer breakdown">
        <Row label="How it changes" stack>
          <Segmented
            label="Interaction"
            value={block.mode}
            onChange={(mode) => content(block.id, { mode })}
            options={[
              { value: "scrub", label: "Scrub slider" },
              { value: "tabs", label: "Tabs" },
            ]}
          />
        </Row>
        <Row label="Shape">
          <ShapeSelect value={r.aspect} onChange={(aspect) => setProps(block.id, { aspect })} />
        </Row>
        <Row label="Shows first" stack>
          <select className="input select" value={block.start} onChange={(e) => content(block.id, { start: Number(e.target.value) })}>
            {block.steps.map((s, i) => (
              <option key={i} value={i}>
                {s.label || `Stage ${i + 1}`}
              </option>
            ))}
          </select>
        </Row>
        <CaptionAndWidth block={block} />
      </Group>
      <Group title={`Stages · ${block.steps.length}`}>
        <ListEditor
          items={block.steps}
          onChange={(steps) => content(block.id, { steps, start: Math.min(block.start, Math.max(0, steps.length - 1)) })}
          make={() => ({ media: null, label: `Pass ${block.steps.length + 1}` })}
          add="Add a stage"
          render={(s, set) => (
            <div className="list-stack">
              <Input value={s.label} placeholder="Plate, Clay, Lighting, Comp…" label="Stage name" onChange={(label) => set({ label })} />
              <MediaField media={s.media} label="Choose image" onChange={(media) => set({ media })} />
            </div>
          )}
        />
        <p className="hint">Tip: drop all the passes on the block at once; they fill the stages in order.</p>
      </Group>
    </>
  );
}

export function TurntablePanel({ block }: { block: TurntableBlock }) {
  const bp = useEditor((s) => s.bp);
  const r = resolveNode(block, bp);
  return (
    <Group title="Turntable">
      <Row label="Made from" stack>
        <Segmented
          label="Source"
          value={block.source}
          onChange={(source) => content(block.id, { source })}
          options={[
            { value: "frames", label: "Image frames" },
            { value: "video", label: "A video" },
          ]}
        />
      </Row>
      {block.source === "frames" ? (
        <>
          <p className="hint">
            {block.frames.length ? `${block.frames.length} frames, sorted by file name.` : "Drop 24–72 renders of one turn (render_001…). They sort by file name."}
          </p>
          <div className="row-buttons">
            <AddFiles
              accept="image/*"
              label={block.frames.length ? "Add frames" : "Choose frames"}
              onFiles={(m) => content(block.id, { frames: [...block.frames, ...m].sort((a, b) => a.src.localeCompare(b.src, undefined, { numeric: true })) })}
            />
            {block.frames.length > 0 && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => content(block.id, { frames: [] })}>
                Clear frames
              </button>
            )}
          </div>
        </>
      ) : (
        <MediaField media={block.video} accept="video/*" label="Choose a video" onChange={(video) => content(block.id, { video })} />
      )}
      <Row label="Spin by itself">
        <Toggle checked={block.spin} label="Spin until someone drags it" onChange={(spin) => content(block.id, { spin })} />
      </Row>
      {block.spin && block.source === "frames" && (
        <Row label="One turn takes" stack>
          <NumberSlider value={block.seconds} min={2} max={30} unit="s" onChange={(seconds) => content(block.id, { seconds })} />
        </Row>
      )}
      <Row label="Shape">
        <ShapeSelect value={r.aspect} onChange={(aspect) => setProps(block.id, { aspect })} />
      </Row>
      <CaptionAndWidth block={block} />
    </Group>
  );
}

export function StatsPanel({ block }: { block: StatsBlock }) {
  return (
    <Group title="Stat row">
      <ListEditor
        items={block.items}
        onChange={(items) => content(block.id, { items })}
        make={() => ({ value: "", label: "" })}
        add="Add a number"
        render={(it, set) => (
          <div className="list-pair" data-narrow-first="">
            <Input value={it.value} placeholder="40" label="Number" onChange={(value) => set({ value })} />
            <Input value={it.label} placeholder="SKUs rendered" label="What it counts" onChange={(label) => set({ label })} />
          </div>
        )}
      />
      <p className="hint">Keep each to a number and a few words: “3 weeks”, “120 shots”, “1.2M views”.</p>
    </Group>
  );
}

export function PalettePanel({ block }: { block: PaletteBlock }) {
  return (
    <Group title="Colour palette">
      <Row label="Show as" stack>
        <Segmented
          label="Layout"
          value={block.layout}
          onChange={(layout) => content(block.id, { layout })}
          options={[
            { value: "chips", label: "Swatches" },
            { value: "bars", label: "Bands" },
          ]}
        />
      </Row>
      <ListEditor
        items={block.colors}
        onChange={(colors) => content(block.id, { colors })}
        make={() => ({ hex: "#f0552a", name: "" })}
        add="Add a colour"
        render={(c, set) => (
          <div className="list-stack">
            <ColorField value={c.hex} onChange={(hex) => hex && set({ hex })} />
            <Input value={c.name} placeholder="Name, e.g. Ghee Gold" label="Colour name" onChange={(name) => set({ name })} />
          </div>
        )}
      />
    </Group>
  );
}

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export function SpecimenPanel({ block }: { block: SpecimenBlock }) {
  const ids = { f: useId(), s: useId(), n: useId() };
  return (
    <Group title="Type specimen">
      <Row label="Typeface" htmlFor={ids.f} stack>
        <TextField id={ids.f} primary value={block.family} placeholder="e.g. Jost, Inter, Fraunces" onChange={(family) => content(block.id, { family })} />
      </Row>
      <Row label="From Google Fonts">
        <Toggle checked={block.google} label="Load it from Google Fonts" onChange={(google) => content(block.id, { google })} />
      </Row>
      <p className="hint">{block.google ? "Loaded from fonts.google.com on the page." : "Uses the font only if the site already has it (Jost does)."}</p>
      <Row label="Weights" stack>
        <div className="chip-toggles">
          {WEIGHTS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={block.weights.includes(w)}
              onClick={() => content(block.id, { weights: block.weights.includes(w) ? block.weights.filter((x) => x !== w) : [...block.weights, w].sort((a, b) => a - b) })}
            >
              {w}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Sample line" htmlFor={ids.s} stack>
        <TextField id={ids.s} multiline rows={2} value={block.sample} placeholder="A sentence in the brand's own voice" onChange={(sample) => content(block.id, { sample })} />
      </Row>
      <Row label="Note" htmlFor={ids.n} stack>
        <TextField id={ids.n} value={block.note ?? ""} placeholder="Designer, licence, why this face" onChange={(note) => content(block.id, { note: note || undefined })} />
      </Row>
    </Group>
  );
}

export function PromptPanel({ block }: { block: PromptBlock }) {
  const ids = { p: useId(), n: useId(), m: useId() };
  return (
    <>
      <Group title="Prompt card">
        <Row label="Prompt" htmlFor={ids.p} stack>
          <TextField id={ids.p} primary multiline rows={6} value={block.prompt} placeholder="Paste the prompt exactly as you ran it" onChange={(prompt) => content(block.id, { prompt })} />
        </Row>
        <Row label="Negative prompt" htmlFor={ids.n} stack>
          <TextField id={ids.n} multiline rows={2} value={block.negative ?? ""} placeholder="Optional" onChange={(negative) => content(block.id, { negative: negative || undefined })} />
        </Row>
        <Row label="Model" htmlFor={ids.m} stack>
          <TextField id={ids.m} value={block.model} placeholder="Flux.1 Dev, Midjourney v7, SDXL…" onChange={(model) => content(block.id, { model })} />
        </Row>
        <Row label="Result image" stack>
          <MediaField media={block.media} label="Choose image" onChange={(media) => content(block.id, { media })} />
        </Row>
      </Group>
      <Group title="Settings">
        <ListEditor
          items={block.settings}
          onChange={(settings) => content(block.id, { settings })}
          make={() => ({ label: "", value: "" })}
          add="Add a setting"
          empty="Seed, steps, CFG, sampler, LoRAs, aspect: whatever someone needs to get close."
          render={(s, set) => (
            <div className="list-pair">
              <Input value={s.label} placeholder="Seed" label="Setting" onChange={(label) => set({ label })} />
              <Input value={s.value} placeholder="421337" label="Value" mono onChange={(value) => set({ value })} />
            </div>
          )}
        />
      </Group>
    </>
  );
}

export function TimelinePanel({ block }: { block: TimelineBlock }) {
  return (
    <Group title="Process timeline">
      <Row label="Direction" stack>
        <Segmented
          label="Direction"
          value={block.direction}
          onChange={(direction) => content(block.id, { direction })}
          options={[
            { value: "vertical", label: "Down the page" },
            { value: "horizontal", label: "Across" },
          ]}
        />
      </Row>
      <ListEditor
        items={block.steps}
        onChange={(steps) => content(block.id, { steps })}
        make={() => ({ label: "", title: "", text: "" })}
        add="Add a step"
        empty="Brief, references, blockout, look-dev, lighting, comp, delivery…"
        render={(s, set) => (
          <div className="list-stack">
            <div className="list-pair" data-narrow-first="">
              <Input value={s.label} placeholder="Week 1" label="When" onChange={(label) => set({ label })} />
              <Input value={s.title} placeholder="Blockout" label="Step" onChange={(title) => set({ title })} />
            </div>
            <textarea className="input" rows={2} value={s.text} placeholder="What happened and what you decided" aria-label="Details" onChange={(e) => set({ text: e.target.value })} />
          </div>
        )}
      />
    </Group>
  );
}

export function ButtonPanel({ block }: { block: ButtonBlock }) {
  const ids = { l: useId(), h: useId() };
  const bp = useEditor((s) => s.bp);
  const r = resolveNode(block, bp);
  return (
    <Group title="Button">
      <Row label="Label" htmlFor={ids.l} stack>
        <TextField id={ids.l} primary value={block.label} placeholder="See it live" onChange={(label) => content(block.id, { label })} />
      </Row>
      <Row label="Link" htmlFor={ids.h} stack>
        <TextField id={ids.h} value={block.href} placeholder="https://… or /work/…" onChange={(href) => content(block.id, { href })} />
      </Row>
      <Row label="Style" stack>
        <Segmented
          label="Button style"
          value={block.variant}
          onChange={(variant) => content(block.id, { variant })}
          options={[
            { value: "solid", label: "Solid" },
            { value: "outline", label: "Outline" },
            { value: "link", label: "Link" },
          ]}
        />
      </Row>
      <Row label="Align" stack>
        <Segmented
          label="Align"
          value={r.align ?? "left"}
          onChange={(align) => setProps(block.id, { align })}
          options={[
            { value: "left", label: "Left", icon: "alignLeft" },
            { value: "center", label: "Centre", icon: "alignCenter" },
            { value: "right", label: "Right", icon: "alignRight" },
          ]}
        />
      </Row>
      <Row label="New tab">
        <Toggle checked={block.newTab} label="Open in a new tab" onChange={(newTab) => content(block.id, { newTab })} />
      </Row>
    </Group>
  );
}

export function CreditsPanel({ block }: { block: CreditsBlock }) {
  const project = useEditor((s) => s.history?.doc);
  const id = useId();
  return (
    <Group title="Credits">
      <Row label="Heading" htmlFor={id} stack>
        <TextField id={id} value={block.title ?? ""} placeholder="Credits" onChange={(title) => content(block.id, { title: title || undefined })} />
      </Row>
      <Row label="Project credits">
        <Toggle checked={block.auto} label="Include the project's credits" onChange={(auto) => content(block.id, { auto })} />
      </Row>
      {block.auto && <p className="hint">{project?.credits.length ? `Adds ${project.credits.length} from the project details.` : "The project has no credits yet; add them in the project details or below."}</p>}
      <ListEditor
        items={block.rows}
        onChange={(rows) => content(block.id, { rows })}
        make={() => ({ name: "", role: "" })}
        add="Add a person"
        render={(c, set) => (
          <div className="list-pair">
            <Input value={c.role} placeholder="Role" label="Role" onChange={(role) => set({ role })} />
            <Input value={c.name} placeholder="Name" label="Name" onChange={(name) => set({ name })} />
          </div>
        )}
      />
    </Group>
  );
}

/* ── 3D and Lottie ────────────────────────────────────────────────────── */

export function ModelPanel({ block }: { block: ModelBlock }) {
  const bp = useEditor((s) => s.bp);
  const r = resolveNode(block, bp);
  return (
    <Group title="3D model">
      <MediaField media={block.media} accept=".glb,.gltf" label="Choose a GLB" onChange={(media) => content(block.id, { media })} />
      <p className="hint">GLB works best (one file with its textures). People can drag to turn it and pinch or scroll to zoom.</p>
      <Row label="Poster" stack>
        <MediaField media={block.poster} label="Image while it loads" onChange={(poster) => content(block.id, { poster })} />
      </Row>
      <Row label="Turn by itself">
        <Toggle checked={block.autoRotate} label="Rotate slowly" onChange={(autoRotate) => content(block.id, { autoRotate })} />
      </Row>
      <Row label="Background">
        <ColorField value={block.bg} allowClear onChange={(bg) => content(block.id, { bg })} />
      </Row>
      <Row label="Shape">
        <ShapeSelect value={r.aspect} noOriginal onChange={(aspect) => setProps(block.id, { aspect: aspect ?? 1 })} />
      </Row>
      <CaptionAndWidth block={block} />
    </Group>
  );
}

export function LottiePanel({ block }: { block: LottieBlock }) {
  const bp = useEditor((s) => s.bp);
  const r = resolveNode(block, bp);
  const id = useId();
  return (
    <Group title="Lottie animation">
      <Row label="File or link" htmlFor={id} stack>
        <TextField id={id} primary value={block.src} placeholder="https://…/animation.json" onChange={(src) => content(block.id, { src })} />
      </Row>
      <div className="row-buttons">
        <AddFiles accept=".json,application/json" label="Upload a JSON" multiple={false} onFiles={([m]) => content(block.id, { src: m.src })} />
      </div>
      <p className="hint">Export from After Effects with Bodymovin, or download the Lottie JSON from LottieFiles.</p>
      <Row label="Loop">
        <Toggle checked={block.loop} label="Loop" onChange={(loop) => content(block.id, { loop })} />
      </Row>
      <Row label="Autoplay">
        <Toggle checked={block.autoplay} label="Play on its own" onChange={(autoplay) => content(block.id, { autoplay })} />
      </Row>
      <Row label="Shape">
        <ShapeSelect value={r.aspect} noOriginal onChange={(aspect) => setProps(block.id, { aspect: aspect ?? 1 })} />
      </Row>
      <CaptionAndWidth block={block} />
    </Group>
  );
}
