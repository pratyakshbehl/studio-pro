import { capture } from "./pointer.ts";
import { useId, useRef, useState } from "react";
import {
  bentoFromPreset,
  blockUpdate,
  detectEmbed,
  hasOverride,
  resolveNode,
  type BlockWidth,
  type EmbedBlock,
  type GalleryBlock,
  type Media,
} from "../model/index.ts";
import { mediaUrl } from "../lib/media.ts";
import { Icon } from "../ui/icons.tsx";
import { run, select, toast, useEditor } from "./store.ts";
import { setProps } from "./actions.ts";
import { applyLayout, itemSel, layoutLabel, placeImages, removeItem, setBento, setFocal, setItem } from "./gallery.ts";
import { uploadFile } from "./upload.ts";
import { LayoutPicker, LayoutThumb } from "./LayoutPicker.tsx";
import { Group, MediaField, NumberSlider, Row, Segmented, TextField, Toggle } from "./fields.tsx";

const BLOCK_WIDTHS: { value: BlockWidth; label: string }[] = [
  { value: "content", label: "Column" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Edge" },
];
const ASPECTS: [string, number][] = [
  ["21:9", 21 / 9],
  ["2:1", 2],
  ["16:9", 16 / 9],
  ["3:2", 1.5],
  ["4:3", 4 / 3],
  ["1:1", 1],
  ["4:5", 0.8],
  ["9:16", 9 / 16],
];

/** Editable list of track weights, e.g. 2 · 1 · 1. */
function Tracks({ label, values, onChange }: { label: string; values: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="tracks" role="group" aria-label={label}>
      {values.map((v, i) => (
        <label key={i} className="track">
          <input
            className="input tabular"
            type="number"
            min={0.1}
            max={12}
            step={0.1}
            value={+v.toFixed(2)}
            aria-label={`${label} ${i + 1}`}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n > 0) onChange(values.map((x, j) => (j === i ? n : x)));
            }}
          />
        </label>
      ))}
      <span className="track-unit">fr</span>
    </div>
  );
}

function useUploadMany() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const run = (onDone: (m: Media[]) => void) => {
    const el = input.current;
    if (!el) return;
    el.onchange = async () => {
      const files = el.files ? [...el.files] : [];
      el.value = "";
      if (!files.length) return;
      setBusy(true);
      try {
        const out: Media[] = [];
        for (const f of files) out.push(await uploadFile(f));
        onDone(out);
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setBusy(false);
      }
    };
    el.click();
  };
  return { input: <input ref={input} type="file" accept="image/*" multiple hidden />, busy, run };
}

export function GalleryPanel({ block }: { block: GalleryBlock }) {
  const bp = useEditor((s) => s.bp);
  const [picking, setPicking] = useState(false);
  const r = resolveNode(block, bp);
  const has = (k: string) => hasOverride(block, bp, k);
  const upload = useUploadMany();
  const count = block.items.filter(Boolean).length;
  const bento = block.mode === "bento" ? r.bento : undefined;
  const ids = { cap: useId() };

  return (
    <>
      <Group title="Layout">
        <button type="button" className="layout-current" onClick={() => setPicking((v) => !v)} aria-expanded={picking}>
          <LayoutThumb pick={{ mode: block.mode, preset: block.bento?.preset }} />
          <span>
            <strong>{layoutLabel(block)}</strong>
            <span className="muted">{block.mode === "bento" ? `${block.bento?.cells.length ?? 0} cells` : `${count} image${count === 1 ? "" : "s"}`}</span>
          </span>
          <span className="btn btn-sm">{picking ? "Done" : "Change"}</span>
        </button>
        {picking && (
          <LayoutPicker
            count={count || undefined}
            current={{ mode: block.mode, preset: block.bento?.preset }}
            onPick={(p) => {
              applyLayout(block.id, p);
              setPicking(false);
            }}
            onCancel={() => setPicking(false)}
          />
        )}

        {block.mode === "justified" && (
          <Row label="Row height" stack override={has("rowHeight")} onReset={() => setProps(block.id, { rowHeight: undefined })}>
            <NumberSlider value={r.rowHeight} min={140} max={900} step={10} onChange={(rowHeight) => setProps(block.id, { rowHeight })} />
          </Row>
        )}
        {(block.mode === "carousel" || block.mode === "ticker") && (
          <Row label="Height" stack override={has("rowHeight")} onReset={() => setProps(block.id, { rowHeight: undefined })}>
            <NumberSlider value={r.rowHeight} min={60} max={900} step={10} onChange={(rowHeight) => setProps(block.id, { rowHeight })} />
          </Row>
        )}
        {block.mode === "ticker" && (
          <>
            <Row label="Speed" stack>
              <NumberSlider value={Math.abs(block.speed ?? 40)} min={5} max={200} unit="" onChange={(v) => run(blockUpdate, { id: block.id, patch: { speed: (block.speed ?? 40) < 0 ? -v : v } })} />
            </Row>
            <Row label="Direction" stack>
              <Segmented
                label="Direction"
                value={(block.speed ?? 40) < 0 ? "right" : "left"}
                onChange={(d) => run(blockUpdate, { id: block.id, patch: { speed: (d === "right" ? -1 : 1) * Math.abs(block.speed ?? 40) } })}
                options={[
                  { value: "left", label: "← Left" },
                  { value: "right", label: "Right →" },
                ]}
              />
            </Row>
            <p className="hint">It moves on the site and in Preview; here it holds still. Hovering pauses it.</p>
          </>
        )}
        {block.mode === "slideshow" && (
          <>
            <Row label="Shape">
              <select
                className="input select"
                value={ASPECTS.find(([, v]) => block.aspect && Math.abs(v - block.aspect) < 0.01)?.[0] ?? "16:9"}
                onChange={(e) => setProps(block.id, { aspect: ASPECTS.find(([k]) => k === e.target.value)?.[1] ?? 16 / 9 })}
              >
                {ASPECTS.map(([k]) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Each image" stack>
              <NumberSlider value={block.interval ?? 4} min={1} max={15} step={0.5} unit="s" onChange={(interval) => run(blockUpdate, { id: block.id, patch: { interval } })} />
            </Row>
            <p className="hint">Click an image in the strip below the slide to see it here.</p>
          </>
        )}
        {(block.mode === "grid" || block.mode === "masonry") && (
          <Row label="Columns" stack override={has("columns")}>
            <NumberSlider value={r.columns} min={1} max={6} unit="" onChange={(columns) => setProps(block.id, { columns })} />
          </Row>
        )}
        {block.mode === "grid" && (
          <Row label="Shape">
            <select
              className="input select"
              value={ASPECTS.find(([, v]) => block.aspect && Math.abs(v - block.aspect) < 0.01)?.[0] ?? "auto"}
              onChange={(e) => setProps(block.id, { aspect: ASPECTS.find(([k]) => k === e.target.value)?.[1] ?? null })}
            >
              <option value="auto">Original</option>
              {ASPECTS.map(([k]) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Row>
        )}
        {bento && (
          <>
            <Row label="Shape" stack override={has("bento")}>
              <div className="aspect-row">
                <NumberSlider value={+bento.aspect.toFixed(2)} min={0.4} max={4} step={0.01} unit="" onChange={(aspect) => setBento(block.id, { aspect })} />
                <select
                  className="input select"
                  aria-label="Shape preset"
                  value={ASPECTS.find(([, v]) => Math.abs(v - bento.aspect) < 0.01)?.[0] ?? ""}
                  onChange={(e) => {
                    const v = ASPECTS.find(([k]) => k === e.target.value)?.[1];
                    if (v) setBento(block.id, { aspect: v });
                  }}
                >
                  <option value="">Custom</option>
                  {ASPECTS.map(([k]) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
            </Row>
            <Row label="Columns" stack>
              <Tracks label="Column" values={bento.cols} onChange={(cols) => setBento(block.id, { cols })} />
            </Row>
            <Row label="Rows" stack>
              <Tracks label="Row" values={bento.rows} onChange={(rows) => setBento(block.id, { rows })} />
            </Row>
            <p className="hint">Or drag the dividers on the page. They snap to halves, thirds and quarters; hold Alt for free sizing.</p>
            <Row label="Stack on phones">
              <Toggle
                checked={!!block.bento?.stackOnPhone}
                label="Stack cells on phones"
                onChange={(stackOnPhone) => run(blockUpdate, { id: block.id, patch: { bento: { stackOnPhone } } })}
              />
            </Row>
            {block.bento?.preset && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => run(blockUpdate, { id: block.id, patch: { bento: bentoFromPreset(block.bento!.preset!, block.bento!.stackOnPhone) } })}
              >
                <Icon name="reset" size={14} />
                Reset the grid to the layout
              </button>
            )}
          </>
        )}
        <Row label="Gap" stack override={has("gap")} onReset={() => setProps(block.id, { gap: undefined })}>
          <NumberSlider value={r.gap} min={0} max={80} onChange={(gap) => setProps(block.id, { gap })} />
        </Row>
        <Row label="Width" stack override={has("width")}>
          <Segmented label="Width" value={r.width} options={BLOCK_WIDTHS} onChange={(width) => setProps(block.id, { width })} />
        </Row>
      </Group>

      <Group
        title={`Images · ${count}`}
        actions={
          <button type="button" className="btn btn-sm" disabled={upload.busy} onClick={() => upload.run((m) => placeImages(block.id, m))}>
            <Icon name="plus" size={14} />
            {upload.busy ? "Uploading…" : "Add"}
          </button>
        }
      >
        {upload.input}
        <ul className="gallery-items-grid" role="list">
          {(block.mode === "bento" && block.bento ? block.bento.cells.map((_, i) => block.items[i] ?? null) : block.items).map((m, i) =>
            m || block.mode === "bento" ? (
              <li key={i} data-empty={!m || undefined}>
                <button type="button" className="gi-thumb" onClick={() => select([itemSel(block.id, i)])} title={`Image ${i + 1}`}>
                  {m ? <img src={mediaUrl(m.src)} alt="" /> : <span className="tabular">{i + 1}</span>}
                </button>
                {m && (
                  <button type="button" className="gallery-remove" title={block.mode === "bento" ? "Empty this cell" : "Remove"} onClick={() => removeItem(block.id, i)}>
                    <Icon name="close" size={12} />
                  </button>
                )}
              </li>
            ) : null,
          )}
        </ul>
        <p className="hint">Click an image on the page to select it, then drag it onto another to swap. Drop files onto a cell to fill it.</p>
        <Row label="Caption" htmlFor={ids.cap} stack>
          <TextField id={ids.cap} value={block.caption ?? ""} placeholder="Optional" onChange={(caption) => run(blockUpdate, { id: block.id, patch: { caption: caption || undefined } })} />
        </Row>
      </Group>
    </>
  );
}

/** One image inside a gallery: replace, alt text, focal point. */
export function GalleryItemPanel({ block, index }: { block: GalleryBlock; index: number }) {
  const m = block.items[index] ?? null;
  const altId = useId();
  const focal = m?.focal ?? { x: 0.5, y: 0.5 };
  return (
    <Group title={`Image ${index + 1}`} actions={<button type="button" className="btn btn-sm" onClick={() => select([block.id])}>Whole gallery</button>}>
      <MediaField media={m} onChange={(next) => setItem(block.id, index, next ? { ...next, alt: next.alt || m?.alt || "" } : null)} label="Choose an image" />
      {m && (
        <>
          <Row label="Alt text" htmlFor={altId} stack>
            <TextField id={altId} value={m.alt} primary placeholder="Describe the image for screen readers" onChange={(alt) => setItem(block.id, index, { ...m, alt })} />
          </Row>
          {block.mode !== "masonry" && (
            <Row label="Focal point" stack>
              <div
                className="focal-picker"
                onPointerDown={(e) => {
                  const el = e.currentTarget;
                  capture(el, e.pointerId);
                  const set = (ev: { clientX: number; clientY: number }) => {
                    const r = el.getBoundingClientRect();
                    setFocal(block.id, index, {
                      x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
                      y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)),
                    });
                  };
                  set(e);
                  el.onpointermove = (ev) => ev.buttons && set(ev);
                }}
              >
                <img src={mediaUrl(m.src)} alt="" draggable={false} />
                <span className="focal-dot" style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }} />
              </div>
              <p className="hint tabular">
                Keeps {Math.round(focal.x * 100)}% across, {Math.round(focal.y * 100)}% down in frame when the cell crops.
              </p>
            </Row>
          )}
        </>
      )}
    </Group>
  );
}

export function EmbedPanel({ block }: { block: EmbedBlock }) {
  const bp = useEditor((s) => s.bp);
  const r = resolveNode(block, bp);
  const info = block.url.trim() ? detectEmbed(block.url) : null;
  const ids = { url: useId(), cap: useId() };
  return (
    <Group title="Embed">
      <Row label="Link or embed code" htmlFor={ids.url} stack>
        <TextField id={ids.url} multiline rows={3} primary value={block.url} placeholder="https://open.spotify.com/track/…" onChange={(url) => run(blockUpdate, { id: block.id, patch: { url } })} />
      </Row>
      <p className="hint" data-ok={!!info || undefined}>
        {!block.url.trim()
          ? "YouTube, Vimeo, Loom, Spotify, SoundCloud, Apple Music and Podcasts, Bandcamp, Mixcloud, Audiomack, Sketchfab, LottieFiles, Figma, CodePen, Behance, Instagram, or any https page."
          : info
            ? `${info.provider}${info.height ? ` · ${info.height}px tall player` : ""}`
            : "That link can't be embedded."}
      </p>
      <Row label="Width" stack>
        <Segmented label="Width" value={r.width} options={BLOCK_WIDTHS} onChange={(width) => setProps(block.id, { width })} />
      </Row>
      <Row label="Caption" htmlFor={ids.cap} stack>
        <TextField id={ids.cap} value={block.caption ?? ""} placeholder="Optional" onChange={(caption) => run(blockUpdate, { id: block.id, patch: { caption: caption || undefined } })} />
      </Row>
    </Group>
  );
}
