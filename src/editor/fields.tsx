import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";
import type { BlockWidth, Media } from "../model/index.ts";
import { mediaUrl } from "../lib/media.ts";
import { Icon, type IconName } from "../ui/icons.tsx";
import { uploadFile } from "./upload.ts";
import { toast } from "./store.ts";

/** The row a control sits in, so controls without their own label (sliders) can still be named for screen readers. */
const RowLabel = createContext("");

/** A labelled inspector row. `override` shows the dot and the reset for tablet/phone values. */
export function Row({
  label,
  children,
  override,
  onReset,
  stack = false,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  override?: boolean;
  onReset?: () => void;
  stack?: boolean;
  htmlFor?: string;
}) {
  return (
    <div className="row" data-stack={stack || undefined}>
      <label className="row-label" htmlFor={htmlFor}>
        {label}
        {override && (
          <button type="button" className="override-dot" title="Changed for this screen size. Click to match desktop." onClick={onReset}>
            <span className="sr-only">Reset to desktop</span>
          </button>
        )}
      </label>
      <div className="row-control">
        <RowLabel.Provider value={label}>{children}</RowLabel.Provider>
      </div>
    </div>
  );
}

export function Group({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="group">
      <header className="group-head">
        <h3>{title}</h3>
        {actions}
      </header>
      <div className="group-body">{children}</div>
    </section>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  id,
  multiline = false,
  rows = 3,
  maxLength,
  primary,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  /** The field a double-click on the page (or Enter) jumps to. */
  primary?: boolean;
}) {
  const over = maxLength !== undefined && value.length > maxLength;
  const common = {
    id,
    value,
    placeholder,
    "data-primary": primary || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
  };
  return (
    <div className="text-field" data-over={over || undefined}>
      {multiline ? <textarea className="input" rows={rows} {...common} /> : <input className="input" {...common} />}
      {maxLength !== undefined && (
        <span className="counter tabular" aria-live="polite">
          {value.length}/{maxLength}
        </span>
      )}
    </div>
  );
}

export function NumberSlider({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "px",
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  id?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const label = useContext(RowLabel) || undefined;
  return (
    <div className="slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-labelledby={id}
        aria-label={id ? undefined : label}
        style={{ "--fill": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      />
      <label className="num">
        <input
          id={id}
          className="input tabular"
          type="number"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => e.target.value !== "" && onChange(clamp(Number(e.target.value)))}
        />
        {unit && <span>{unit}</span>}
      </label>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented seg-fill" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-pressed={value === o.value}
          title={o.icon ? o.label : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.icon ? <Icon name={o.icon} /> : o.label}
          {o.icon && <span className="sr-only">{o.label}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch" onClick={() => onChange(!checked)} aria-label={label}>
      <span />
    </button>
  );
}

export function ColorField({ value, onChange, allowClear }: { value: string | undefined; onChange: (v: string | undefined) => void; allowClear?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value ?? "";
  return (
    <div className="color-field">
      <label className="color-swatch" style={{ background: value || "transparent" }}>
        <input type="color" value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} aria-label="Pick a colour" />
      </label>
      <input
        className="input tabular"
        value={shown}
        placeholder={allowClear ? "None" : "#000000"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft === null) return;
          const v = draft.trim();
          if (!v && allowClear) onChange(undefined);
          else if (/^#?[0-9a-f]{6}$/i.test(v)) onChange(v.startsWith("#") ? v : `#${v}`);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {allowClear && value && (
        <button type="button" className="icon-btn" title="Remove colour" onClick={() => onChange(undefined)}>
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

/** Image/video picker: shows what's there, replaces it from disk, or clears it. */
export function MediaField({
  media,
  accept = "image/*",
  onChange,
  label = "Choose a file",
}: {
  media: Media | null;
  accept?: string;
  onChange: (m: Media | null) => void;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const m = await uploadFile(file);
      onChange(media ? { ...m, alt: media.alt } : m);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="media-field">
      <div className="media-thumb">
        {media?.type === "video" ? (
          <video src={mediaUrl(media.src)} muted preload="metadata" />
        ) : media?.type === "image" ? (
          <img src={mediaUrl(media.src)} alt="" />
        ) : (
          <Icon name={THUMB_ICON[media?.type ?? accept.split("/")[0]] ?? "image"} size={18} />
        )}
      </div>
      <div className="media-actions">
        <span className="media-name" title={media?.src}>
          {busy ? "Uploading…" : media ? decodeURIComponent(media.src.split("/").pop() ?? "") : "Nothing yet"}
        </span>
        <span className="media-buttons">
          <button type="button" className="btn btn-sm" onClick={() => input.current?.click()} disabled={busy}>
            <Icon name="upload" size={14} />
            {media ? "Replace" : label}
          </button>
          {media && (
            <button type="button" className="icon-btn" title="Remove" onClick={() => onChange(null)}>
              <Icon name="close" size={14} />
            </button>
          )}
        </span>
      </div>
      <input id={id} ref={input} type="file" accept={accept} hidden onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  );
}

/** Comma-separated list editor for roles and tools. */
export function ListField({ value, onChange, placeholder, id }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; id?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      id={id}
      className="input"
      value={draft ?? value.join(", ")}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === null) return;
        onChange(
          draft
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

const THUMB_ICON: Record<string, IconName> = { video: "video", audio: "audio", model: "model", lottie: "lottie", image: "image", ".glb,.gltf": "model", ".json": "lottie" };

export const BLOCK_WIDTHS: { value: BlockWidth; label: string }[] = [
  { value: "content", label: "Column" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Edge" },
];

const SHAPES: { value: string; label: string; ratio: number | null }[] = [
  { value: "auto", label: "Original", ratio: null },
  { value: "21:9", label: "21:9", ratio: 21 / 9 },
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "3:2", label: "3:2", ratio: 3 / 2 },
  { value: "4:3", label: "4:3", ratio: 4 / 3 },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "4:5", label: "4:5", ratio: 4 / 5 },
  { value: "9:16", label: "9:16", ratio: 9 / 16 },
];
const shapeName = (ratio: number | null) =>
  ratio === null ? "auto" : (SHAPES.find((s) => s.ratio !== null && Math.abs(s.ratio - ratio) < 0.01)?.value ?? "auto");

/** Aspect ratio picker: Original keeps the file's own shape. */
export function ShapeSelect({ value, onChange, id, noOriginal }: { value: number | null; onChange: (r: number | null) => void; id?: string; noOriginal?: boolean }) {
  return (
    <select id={id} className="input select" value={shapeName(value)} onChange={(e) => onChange(SHAPES.find((s) => s.value === e.target.value)!.ratio)}>
      {SHAPES.filter((s) => !(noOriginal && s.ratio === null)).map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
