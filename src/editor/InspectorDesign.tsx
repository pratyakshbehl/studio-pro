import type { ReactNode } from "react";
import {
  hasOverride,
  resolveNode,
  type AppearEffect,
  type BlendMode,
  type Block,
  type BlockStyle,
  type Effects,
  type FontStyle,
  type Shadow,
} from "../model/index.ts";
import { Icon } from "../ui/icons.tsx";
import { useEditor } from "./store.ts";
import { setProps } from "./actions.ts";
import { ColorField, Group, NumberSlider, Row, Segmented, Toggle } from "./fields.tsx";

const TEXTUAL = new Set(["heading", "text", "quote"]);

const SHADOWS: Record<string, Shadow | undefined> = {
  none: undefined,
  soft: { x: 0, y: 8, blur: 24, spread: -8, color: "rgba(0,0,0,0.35)" },
  medium: { x: 0, y: 16, blur: 40, spread: -12, color: "rgba(0,0,0,0.5)" },
  strong: { x: 0, y: 28, blur: 64, spread: -16, color: "rgba(0,0,0,0.65)" },
};
const shadowName = (s: Shadow | undefined) =>
  !s ? "none" : (Object.entries(SHADOWS).find(([, v]) => v && JSON.stringify(v) === JSON.stringify(s))?.[0] ?? "custom");

const APPEAR: { value: AppearEffect | ""; label: string }[] = [
  { value: "", label: "None" },
  { value: "fade", label: "Fade in" },
  { value: "slide-up", label: "Slide up" },
  { value: "slide-left", label: "Slide in" },
  { value: "scale", label: "Scale up" },
  { value: "blur", label: "Blur in" },
  { value: "mask", label: "Mask reveal" },
];
const BLENDS: BlendMode[] = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "difference", "luminosity"];

/** A row whose value can be cleared back to "auto" (the preset or the desktop value). */
function Clearable({ label, set, onClear, children, override, stack = true }: { label: string; set: boolean; onClear: () => void; children: ReactNode; override?: boolean; stack?: boolean }) {
  return (
    <Row label={label} stack={stack} override={override}>
      <div className="clearable">
        {children}
        {set && (
          <button type="button" className="icon-btn clear-btn" title="Back to auto" onClick={onClear}>
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
    </Row>
  );
}

/** Number input with an "Auto" placeholder when unset. */
function AutoNumber({ value, onChange, min, max, step = 1, unit, label }: { value: number | undefined; onChange: (v: number | undefined) => void; min: number; max: number; step?: number; unit?: string; label: string }) {
  return (
    <label className="auto-number">
      <input
        className="input tabular"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        placeholder="Auto"
        aria-label={label}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(undefined);
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
      />
      {unit && <span>{unit}</span>}
    </label>
  );
}

/**
 * The Design tab: how a block looks, independent of what it says. Every value
 * is per breakpoint: on tablet or phone a change is recorded for that size and
 * marked with the blue dot.
 */
export function DesignPanel({ block }: { block: Block }) {
  const bp = useEditor((s) => s.bp);
  const r = resolveNode(block, bp);
  const st: BlockStyle = r.style ?? {};
  const f: FontStyle = r.font ?? {};
  const fx: Effects = r.effects ?? {};
  const style = (patch: Partial<Record<keyof BlockStyle, unknown>>) => setProps(block.id, { style: patch });
  const font = (patch: Partial<Record<keyof FontStyle, unknown>>) => setProps(block.id, { font: patch });
  const effects = (patch: Partial<Record<keyof Effects, unknown>>) => setProps(block.id, { effects: patch });
  const ov = (k: string) => hasOverride(block, bp, k);
  const shadow = shadowName(st.shadow);

  return (
    <>
      {bp !== "desktop" && (
        <p className="bp-note design-bp">
          <Icon name={bp === "tablet" ? "tablet" : "phone"} size={14} />
          Changes here apply to {bp} only. The blue dot marks them.
        </p>
      )}

      <Group title="Layout">
        <Row label="Max width" stack override={ov("style")}>
          <AutoNumber label="Max width" value={st.maxWidth} min={40} max={2400} step={10} unit="px" onChange={(maxWidth) => style({ maxWidth })} />
        </Row>
        <div className="row-pair even">
          <Row label="Space above" stack>
            <AutoNumber label="Space above" value={st.marginTop} min={-200} max={400} unit="px" onChange={(v) => style({ marginTop: v })} />
          </Row>
          <Row label="Space below" stack>
            <AutoNumber label="Space below" value={st.marginBottom} min={-200} max={400} unit="px" onChange={(v) => style({ marginBottom: v })} />
          </Row>
        </div>
      </Group>

      <Group title="Fill and border">
        <Row label="Fill">
          <ColorField value={st.bg} allowClear onChange={(bg) => style({ bg })} />
        </Row>
        <Clearable label="Padding" set={st.padding !== undefined} onClear={() => style({ padding: undefined })}>
          <NumberSlider value={st.padding ?? 0} min={0} max={160} onChange={(padding) => style({ padding })} />
        </Clearable>
        <Clearable label="Corners" set={st.radius !== undefined} onClear={() => style({ radius: undefined })}>
          <NumberSlider value={st.radius ?? useEditor.getState().history?.doc.page.style.radius ?? 16} min={0} max={120} onChange={(radius) => style({ radius })} />
        </Clearable>
        <Row label="Border" stack>
          <div className="border-row">
            <AutoNumber label="Border width" value={st.border?.width || undefined} min={0} max={24} unit="px" onChange={(w) => style({ border: w ? { width: w, style: st.border?.style ?? "solid", color: st.border?.color ?? "#3a3733" } : undefined })} />
            <select
              className="input select"
              aria-label="Border style"
              value={st.border?.style ?? "solid"}
              disabled={!st.border}
              onChange={(e) => st.border && style({ border: { ...st.border, style: e.target.value } })}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
            </select>
          </div>
          {st.border && <ColorField value={st.border.color} onChange={(c) => c && style({ border: { ...st.border!, color: c } })} />}
        </Row>
        <Row label="Shadow" stack>
          <Segmented
            label="Shadow"
            value={shadow === "custom" ? "custom" : shadow}
            onChange={(v) => v !== "custom" && style({ shadow: SHADOWS[v] ?? undefined })}
            options={[
              { value: "none", label: "None" },
              { value: "soft", label: "Soft" },
              { value: "medium", label: "Medium" },
              { value: "strong", label: "Strong" },
            ]}
          />
          {st.shadow && (
            <div className="shadow-grid">
              {(["x", "y", "blur", "spread"] as const).map((k) => (
                <label key={k} className="mini-field">
                  <span>{k === "x" ? "X" : k === "y" ? "Y" : k === "blur" ? "Blur" : "Spread"}</span>
                  <input className="input tabular" type="number" value={st.shadow![k]} onChange={(e) => style({ shadow: { ...st.shadow!, [k]: Number(e.target.value) || 0 } })} />
                </label>
              ))}
            </div>
          )}
        </Row>
        <Row label="Opacity" stack>
          <NumberSlider value={Math.round((st.opacity ?? 1) * 100)} min={0} max={100} unit="%" onChange={(v) => style({ opacity: v === 100 ? undefined : v / 100 })} />
        </Row>
        <Row label="Blend">
          <select className="input select" value={st.blend ?? "normal"} onChange={(e) => style({ blend: e.target.value === "normal" ? undefined : e.target.value })}>
            {BLENDS.map((b) => (
              <option key={b} value={b}>
                {b[0].toUpperCase() + b.slice(1)}
              </option>
            ))}
          </select>
        </Row>
      </Group>

      {TEXTUAL.has(block.type) && (
        <Group title="Typography">
          <div className="row-pair even">
            <Row label="Size" stack override={ov("font")}>
              <AutoNumber label="Font size" value={f.size} min={8} max={240} unit="px" onChange={(size) => font({ size })} />
            </Row>
            <Row label="Weight" stack>
              <select className="input select" value={f.weight ?? ""} onChange={(e) => font({ weight: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">Auto</option>
                {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </Row>
          </div>
          <div className="row-pair even">
            <Row label="Line height" stack>
              <AutoNumber label="Line height" value={f.lineHeight} min={0.6} max={3} step={0.01} onChange={(lineHeight) => font({ lineHeight })} />
            </Row>
            <Row label="Letter spacing" stack>
              <AutoNumber label="Letter spacing" value={f.tracking} min={-0.2} max={0.6} step={0.005} unit="em" onChange={(tracking) => font({ tracking })} />
            </Row>
          </div>
          <Row label="Colour">
            <ColorField value={f.color} allowClear onChange={(color) => font({ color })} />
          </Row>
          <Row label="Case" stack>
            <Segmented
              label="Text case"
              value={f.transform ?? "none"}
              onChange={(t) => font({ transform: t === "none" ? undefined : t })}
              options={[
                { value: "none", label: "Aa" },
                { value: "uppercase", label: "AA" },
                { value: "lowercase", label: "aa" },
                { value: "capitalize", label: "Aa Bb" },
              ]}
            />
          </Row>
          <Row label="Italic">
            <Toggle checked={!!f.italic} label="Italic" onChange={(italic) => font({ italic: italic || undefined })} />
          </Row>
        </Group>
      )}

      <Group title="Effects">
        <Row label="Appear">
          <select className="input select" value={fx.appear ?? ""} onChange={(e) => effects({ appear: e.target.value || undefined })}>
            {APPEAR.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </Row>
        {fx.appear && (
          <Row label="Timing" stack>
            <Segmented
              label="Appear timing"
              value={String(fx.appearLength ?? 0.6)}
              onChange={(v) => effects({ appearLength: v === "0.6" ? undefined : Number(v) })}
              options={[
                { value: "0.3", label: "Snappy" },
                { value: "0.6", label: "Normal" },
                { value: "1", label: "Slow" },
              ]}
            />
          </Row>
        )}
        <Row label="Hover" stack>
          <Segmented
            label="Hover effect"
            value={fx.hover ?? "none"}
            onChange={(v) => effects({ hover: v === "none" ? undefined : v })}
            options={[
              { value: "none", label: "None" },
              { value: "lift", label: "Lift" },
              { value: "zoom", label: "Zoom" },
            ]}
          />
        </Row>
        <Row label="Parallax" stack>
          <NumberSlider value={fx.parallax ?? 0} min={-1} max={1} step={0.1} unit="" onChange={(v) => effects({ parallax: v || undefined })} />
        </Row>
        <p className="hint">Effects play in Preview and on the site, and switch off for visitors who prefer less motion.</p>
      </Group>

      <Group title="Transform">
        <Row label="Rotate" stack>
          <NumberSlider value={st.rotate ?? 0} min={-180} max={180} unit="°" onChange={(v) => style({ rotate: v || undefined })} />
        </Row>
        <Row label="Scale" stack>
          <NumberSlider value={Math.round((st.scale ?? 1) * 100)} min={25} max={200} unit="%" onChange={(v) => style({ scale: v === 100 ? undefined : v / 100 })} />
        </Row>
      </Group>
    </>
  );
}
