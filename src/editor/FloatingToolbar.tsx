import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  blockUpdate,
  findBlock,
  findSection,
  newLayout,
  resolveNode,
  sectionUpdate,
  type Block,
  type BlockWidth,
  type ContentWidth,
  type Section,
} from "../model/index.ts";
import { Icon, type IconName } from "../ui/icons.tsx";
import { doc, run, select, setFocalEdit, setRenaming, toast, useEditor } from "./store.ts";
import {
  copySelection,
  deleteSelection,
  duplicateSelection,
  moveSelection,
  setProject,
  setProps,
  toggleHidden,
  toggleLocked,
} from "./actions.ts";
import { applyLayout, layoutLabel, placeImages, removeItem, setItem, splitSel } from "./gallery.ts";
import { uploadFile } from "./upload.ts";
import { LayoutPopover, LayoutThumb } from "./LayoutPicker.tsx";
import { nodeLabel } from "./Overlay.tsx";

function Btn({
  icon,
  label,
  onClick,
  active,
  danger,
  children,
  shortcut,
}: {
  icon?: IconName;
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  danger?: boolean;
  children?: ReactNode;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      className="ft-btn"
      data-active={active || undefined}
      data-danger={danger || undefined}
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

const Sep = () => <span className="ft-sep" />;

const WIDTHS: { value: BlockWidth; label: string; icon: IconName }[] = [
  { value: "content", label: "Column width", icon: "widthColumn" },
  { value: "wide", label: "Wide", icon: "widthWide" },
  { value: "full", label: "Edge to edge", icon: "widthFull" },
];
const SECTION_WIDTHS: { value: ContentWidth; label: string }[] = [
  { value: "narrow", label: "Narrow · 800" },
  { value: "text", label: "Text · 1040" },
  { value: "wide", label: "Wide · 1360" },
  { value: "full", label: "Full" },
];
const SHAPES: [string, number | null][] = [
  ["Original", null],
  ["21:9", 21 / 9],
  ["16:9", 16 / 9],
  ["3:2", 3 / 2],
  ["4:3", 4 / 3],
  ["1:1", 1],
  ["4:5", 4 / 5],
  ["9:16", 9 / 16],
];

type Menu = { kind: "layout" | "more" | "shape" | "width"; rect: DOMRect } | null;

/** A small anchored menu of text rows. */
function MenuList({ rect, items, onClose }: { rect: DOMRect; items: { label: string; hint?: string; onClick: () => void; checked?: boolean; danger?: boolean }[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [onClose]);
  return (
    <div ref={ref} className="popover ft-menu" data-overlay-ui role="menu" style={{ left: rect.left, top: rect.bottom + 6 }}>
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          role="menuitemcheckbox"
          aria-checked={!!it.checked}
          className="ft-menu-item"
          data-danger={it.danger || undefined}
          onClick={() => {
            it.onClick();
            onClose();
          }}
        >
          <span className="ft-check">{it.checked && <Icon name="check" size={13} />}</span>
          <span>{it.label}</span>
          {it.hint && <kbd>{it.hint}</kbd>}
        </button>
      ))}
    </div>
  );
}

function pickFile(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(input.files ? [...input.files] : []);
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

async function uploadAll(files: File[]) {
  const out = [];
  for (const f of files) out.push(await uploadFile(f));
  return out;
}

/**
 * Context bar over the selection, like Figma/Framer: the handful of actions
 * you reach for on this kind of thing, in the same place every time.
 */
export function FloatingToolbar({ box, viewport }: { box: { x: number; y: number; w: number; h: number }; viewport: { w: number; h: number } }) {
  const selection = useEditor((s) => s.selection);
  const bp = useEditor((s) => s.bp);
  const focalEdit = useEditor((s) => s.focalEdit);
  const d = useEditor((s) => s.history?.doc);
  const [menu, setMenu] = useState<Menu>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);

  useEffect(() => {
    if (ref.current) setWidth(ref.current.offsetWidth);
  });

  if (!d || !selection.length || selection[0].startsWith("chrome:")) return null;

  // Above the selection; below it when there's no room; pinned to the top when the selection is taller than the view.
  const above = box.y - 58;
  const below = box.y + box.h + 12;
  const top = above >= 8 ? above : below + 40 < viewport.h ? below : 8;
  const left = Math.min(Math.max(8, box.x + box.w / 2 - width / 2), viewport.w - width - 8);
  const openMenu = (kind: NonNullable<Menu>["kind"]) => (e: React.MouseEvent<HTMLButtonElement>) =>
    setMenu((m) => (m?.kind === kind ? null : { kind, rect: e.currentTarget.getBoundingClientRect() }));

  const primary = selection[selection.length - 1];
  const { id, item } = splitSel(primary);
  const block: Block | undefined = findBlock(d, id)?.block;
  const section: Section | undefined = block ? undefined : findSection(d, id)?.section;
  const multi = selection.length > 1;

  const common = (
    <>
      <Btn icon="arrowUp" label="Move up" shortcut="Alt+↑" onClick={() => moveSelection(-1)} />
      <Btn icon="arrowDown" label="Move down" shortcut="Alt+↓" onClick={() => moveSelection(1)} />
      <Btn icon="duplicate" label="Duplicate" shortcut="Ctrl+D" onClick={duplicateSelection} />
      <Btn icon="trash" label="Delete" shortcut="Del" danger onClick={deleteSelection} />
      <Btn icon="more" label="More" active={menu?.kind === "more"} onClick={openMenu("more")} />
    </>
  );

  let content: ReactNode;
  if (multi) {
    content = (
      <>
        <span className="ft-name">{selection.length} selected</span>
        <Sep />
        <Btn icon="duplicate" label="Duplicate" shortcut="Ctrl+D" onClick={duplicateSelection} />
        <Btn icon="eyeOff" label="Hide or show" shortcut="Ctrl+;" onClick={() => toggleHidden()} />
        <Btn icon="trash" label="Delete" shortcut="Del" danger onClick={deleteSelection} />
      </>
    );
  } else if (block && item !== null && block.type === "gallery") {
    const m = block.items[item];
    content = (
      <>
        <button type="button" className="ft-name ft-up" onClick={() => select([block.id])} title="Select the whole gallery (Esc)">
          <Icon name="gallery" size={14} />
          Image {item + 1}
        </button>
        <Sep />
        <Btn
          icon="replace"
          label={m ? "Replace image" : "Choose image"}
          onClick={async () => {
            const [f] = await pickFile("image/*,video/*", false);
            if (!f) return;
            try {
              const media = await uploadFile(f);
              setItem(block.id, item, m ? { ...media, alt: m.alt } : media);
            } catch (e) {
              toast((e as Error).message, "error");
            }
          }}
        >
          {m ? "Replace" : "Choose"}
        </Btn>
        {m && block.mode !== "masonry" && (
          <Btn icon="focus" label="Focal point: drag on the image to choose what stays in frame" active={focalEdit === primary} onClick={() => setFocalEdit(focalEdit === primary ? null : primary)}>
            Focal point
          </Btn>
        )}
        {m && <Btn icon="trash" label={block.mode === "bento" ? "Empty this cell" : "Remove from gallery"} danger onClick={() => removeItem(block.id, item)} />}
      </>
    );
  } else if (block) {
    const r = resolveNode(block, bp) as Block & { width?: BlockWidth; align?: string; aspect?: number | null };
    const hasWidth = "width" in block;
    content = (
      <>
        <span className="ft-name">
          <Icon name={block.type as IconName} size={14} />
          {nodeLabel(d, block.id)}
        </span>
        <Sep />
        {block.type === "gallery" && (
          <>
            <button type="button" className="ft-btn ft-layout" data-active={menu?.kind === "layout" || undefined} onClick={openMenu("layout")} title="Change layout">
              <LayoutThumb pick={{ mode: block.mode, preset: block.bento?.preset }} />
              {block.mode === "bento" ? "Bento" : layoutLabel(block)}
              <Icon name="chevronDown" size={10} />
            </button>
            <Btn
              icon="plus"
              label="Add images"
              onClick={async () => {
                const files = await pickFile("image/*", true);
                if (!files.length) return;
                try {
                  toast("Uploading…");
                  placeImages(block.id, await uploadAll(files));
                } catch (e) {
                  toast((e as Error).message, "error");
                }
              }}
            >
              Add
            </Btn>
            <Sep />
          </>
        )}
        {block.type === "image" && (
          <>
            <Btn
              icon="replace"
              label={block.media ? "Replace image" : "Choose image"}
              onClick={async () => {
                const [f] = await pickFile("image/*", false);
                if (!f) return;
                try {
                  const media = await uploadFile(f);
                  run(blockUpdate, { id: block.id, patch: { media: block.media ? { ...media, alt: block.media.alt } : media } });
                } catch (e) {
                  toast((e as Error).message, "error");
                }
              }}
            />
            <button type="button" className="ft-btn ft-text" data-active={menu?.kind === "shape" || undefined} onClick={openMenu("shape")} title="Shape">
              {SHAPES.find(([, v]) => v !== null && r.aspect != null && Math.abs(v - r.aspect) < 0.01)?.[0] ?? "Original"}
              <Icon name="chevronDown" size={10} />
            </button>
            <Sep />
          </>
        )}
        {hasWidth && (
          <span className="ft-group" role="radiogroup" aria-label="Width">
            {WIDTHS.map((w) => (
              <Btn key={w.value} icon={w.icon} label={w.label} active={r.width === w.value} onClick={() => setProps(block.id, { width: w.value })} />
            ))}
            <Sep />
          </span>
        )}
        {(block.type === "heading" || block.type === "text") && (
          <span className="ft-group" role="radiogroup" aria-label="Align">
            {(["left", "center", "right"] as const).map((a) => (
              <Btn
                key={a}
                icon={a === "left" ? "alignLeft" : a === "center" ? "alignCenter" : "alignRight"}
                label={`Align ${a}`}
                active={(r.align ?? "left") === a}
                onClick={() => setProps(block.id, { align: a })}
              />
            ))}
            <Sep />
          </span>
        )}
        {common}
      </>
    );
  } else if (section) {
    const r = resolveNode(section, bp);
    content = (
      <>
        <span className="ft-name">
          <Icon name={section.layout.type === "flow" ? "flow" : section.layout.type} size={14} />
          {section.name}
        </span>
        <Sep />
        <span className="ft-group" role="radiogroup" aria-label="Section layout">
          {(["flow", "stack", "grid", "canvas"] as const).map((t) => (
            <Btn
              key={t}
              icon={t}
              label={{ flow: "Flow", stack: "Stack", grid: "Grid", canvas: "Free canvas" }[t]}
              active={section.layout.type === t}
              onClick={() => t !== section.layout.type && run(sectionUpdate, { id: section.id, patch: { layout: newLayout(t, section.layout.width) } })}
            />
          ))}
        </span>
        <button type="button" className="ft-btn ft-text" data-active={menu?.kind === "width" || undefined} onClick={openMenu("width")} title="Content width">
          {SECTION_WIDTHS.find((w) => w.value === r.layout.width)?.label.split(" ·")[0]}
          <Icon name="chevronDown" size={10} />
        </button>
        <Sep />
        {common}
      </>
    );
  } else return null;

  const target = block ?? section;

  return (
    <>
      <div ref={ref} className="ftoolbar" data-overlay-ui style={{ left, top }} role="toolbar" aria-label="Selection tools" onPointerDown={(e) => e.stopPropagation()}>
        {content}
      </div>
      {menu?.kind === "layout" && block?.type === "gallery" && (
        <LayoutPopover
          x={menu.rect.left + menu.rect.width / 2}
          y={menu.rect.bottom + 6}
          count={block.items.filter(Boolean).length || undefined}
          current={{ mode: block.mode, preset: block.bento?.preset }}
          onClose={() => setMenu(null)}
          onCancel={() => setMenu(null)}
          onPick={(p) => {
            applyLayout(block.id, p);
            setMenu(null);
          }}
        />
      )}
      {menu?.kind === "shape" && block?.type === "image" && (
        <MenuList
          rect={menu.rect}
          onClose={() => setMenu(null)}
          items={SHAPES.map(([label, v]) => ({
            label,
            checked: (resolveNode(block, bp).aspect ?? null) === v || (v !== null && Math.abs((resolveNode(block, bp).aspect ?? 0) - v) < 0.01),
            onClick: () => setProps(block.id, { aspect: v }),
          }))}
        />
      )}
      {menu?.kind === "width" && section && (
        <MenuList
          rect={menu.rect}
          onClose={() => setMenu(null)}
          items={SECTION_WIDTHS.map((w) => ({
            label: w.label,
            checked: resolveNode(section, bp).layout.width === w.value,
            onClick: () => setProps(section.id, { layout: { width: w.value } }),
          }))}
        />
      )}
      {menu?.kind === "more" && target && (
        <MenuList
          rect={menu.rect}
          onClose={() => setMenu(null)}
          items={[
            { label: "Copy", hint: "Ctrl C", onClick: () => void copySelection() },
            { label: "Rename", hint: "Ctrl R", onClick: () => setRenaming(target.id) },
            { label: resolveNode(target, bp).hidden ? "Show" : `Hide${bp === "desktop" ? "" : ` on ${bp}`}`, hint: "Ctrl ;", onClick: () => toggleHidden() },
            { label: target.locked ? "Unlock" : "Lock", hint: "Ctrl L", onClick: () => toggleLocked() },
            ...(block?.type === "image" && block.media
              ? [{ label: "Use as cover", onClick: () => setProject({ cover: { src: block.media!.src, type: "image" as const, alt: block.media!.alt || doc().cover?.alt || "" } }) }]
              : []),
            ...(block?.type === "gallery" && block.mode === "bento" && block.bento
              ? [
                  {
                    label: "Stack on phones",
                    checked: block.bento.stackOnPhone,
                    onClick: () => run(blockUpdate, { id: block.id, patch: { bento: { stackOnPhone: !block.bento!.stackOnPhone } } }),
                  },
                ]
              : []),
            { label: "Delete", hint: "Del", danger: true, onClick: deleteSelection },
          ]}
        />
      )}
    </>
  );
}

