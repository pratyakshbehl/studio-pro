import { useEffect, useRef, useState, type ReactNode } from "react";
import { detectEmbed, findSection, newBlock } from "../model/index.ts";
import { Icon, type IconName } from "../ui/icons.tsx";
import { doc, setBarPin, setTextEdit, toast, useEditor } from "./store.ts";
import { measureInto } from "./peaks.ts";
import { addFiles, insertBlocks, insertSection, type InsertTarget } from "./actions.ts";
import { insertGallery } from "./gallery.ts";
import { uploadFile } from "./upload.ts";
import { LayoutPopover } from "./LayoutPicker.tsx";
import { InsertMenu } from "./InsertPanel.tsx";
import { SectionLibrary } from "../library/SectionLibrary.tsx";
import { plural } from "../lib/format.ts";

type Menu = "video" | "embed" | "3d" | "layouts" | "sections" | "more" | null;

function Tool({
  icon,
  label,
  hint,
  onClick,
  active,
  caret,
}: {
  icon: IconName;
  label: string;
  hint: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  caret?: boolean;
}) {
  return (
    <button type="button" className="ib-tool" data-active={active || undefined} aria-label={label} onClick={onClick}>
      <Icon name={icon} />
      {caret && <Icon name="chevronDown" size={10} className="ib-caret" />}
      <span className="ib-tip" role="tooltip">
        <strong>{label}</strong>
        <span>{hint}</span>
      </span>
    </button>
  );
}

/** Small popover anchored under a bar button. */
function Pop({ anchor, children, onClose, width = 320 }: { anchor: DOMRect; children: ReactNode; onClose: () => void; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener("pointerdown", away, true);
    return () => window.removeEventListener("pointerdown", away, true);
  }, [onClose]);
  const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - 8);
  return (
    <div ref={ref} className="popover ib-pop" data-overlay-ui style={{ left, top: anchor.bottom + 8, width }}>
      {children}
    </div>
  );
}

/** Paste-a-link field with live detection. */
function LinkForm({
  title,
  placeholder,
  examples,
  onSubmit,
  extra,
  accept,
}: {
  title: string;
  placeholder: string;
  examples: string;
  onSubmit: (url: string) => void;
  extra?: ReactNode;
  accept?: (url: string) => string | null;
}) {
  const [url, setUrl] = useState("");
  const info = url.trim() ? detectEmbed(url) : null;
  const problem = url.trim() && accept ? accept(url) : null;
  const ok = !!info && !problem;
  return (
    <form
      className="ib-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSubmit(url.trim());
      }}
    >
      <h3>{title}</h3>
      <input className="input" autoFocus value={url} placeholder={placeholder} onChange={(e) => setUrl(e.target.value)} aria-label={title} />
      <p className="ib-detect" data-ok={ok || undefined}>
        {!url.trim() ? examples : problem ? problem : info ? `${info.provider} detected` : "That doesn't look like a link"}
      </p>
      <div className="ib-form-actions">
        {extra}
        <button type="submit" className="btn btn-primary btn-sm" disabled={!ok}>
          Add
        </button>
      </div>
    </form>
  );
}

/**
 * The insert bar that appears between blocks (Behance's "Insert Media" strip):
 * the media set first, then layouts and sections, then everything else.
 */
export function InsertBar({ x, y, target }: { x: number; y: number; target: InsertTarget }) {
  const [menu, setMenu] = useState<Menu>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const files = useRef<HTMLInputElement>(null);
  const kind = useRef<"media" | "grid" | "audio" | "video" | "model">("media");
  const busy = useRef(false);

  // While a menu is open the bar stays put, even if the pointer wanders.
  useEffect(() => {
    if (menu) setBarPin({ x, y, target });
    return () => {
      if (menu) setBarPin(null);
    };
  }, [menu, x, y, target]);

  // The file dialog's own cancel event (not exposed as a React prop) releases the pin.
  useEffect(() => {
    const el = files.current;
    const cancel = () => {
      setMenu(null);
      setBarPin(null);
    };
    el?.addEventListener("cancel", cancel);
    return () => el?.removeEventListener("cancel", cancel);
  }, []);

  const open = (m: Menu) => (e: React.MouseEvent<HTMLButtonElement>) => {
    setAnchor(e.currentTarget.getBoundingClientRect());
    setMenu((cur) => (cur === m ? null : m));
  };
  const close = () => {
    setMenu(null);
    setBarPin(null);
  };
  /** Opens the system file dialog. The bar is pinned so it stays mounted while the dialog is up. */
  const pick = (k: typeof kind.current) => {
    const input = files.current;
    if (!input) return;
    kind.current = k;
    input.accept = { media: "image/*,video/*", grid: "image/*", audio: "audio/*", video: "video/*", model: ".glb,.gltf" }[k];
    input.multiple = k !== "audio" && k !== "model";
    setBarPin({ x, y, target });
    input.click();
  };

  const onFiles = async (list: FileList | null) => {
    const chosen = list ? [...list] : [];
    if (files.current) files.current.value = "";
    if (!chosen.length || busy.current) return close();
    busy.current = true;
    try {
      if (kind.current === "grid") {
        toast(`Uploading ${plural(chosen.length, "image")}…`);
        const media = [];
        for (const f of chosen) media.push(await uploadFile(f));
        insertGallery({ mode: "justified" }, target, media);
        toast(`Added a photo grid of ${plural(media.length, "image")}`);
      } else if (kind.current === "audio") {
        toast("Uploading audio…");
        const media = await uploadFile(chosen[0]);
        const block = newBlock("audio", { media, title: chosen[0].name.replace(/\.[^.]+$/, "") });
        insertBlocks([block], target, "Add audio");
        void measureInto(block.id, media);
      } else if (kind.current === "model") {
        toast("Uploading the model…");
        const media = await uploadFile(chosen[0]);
        insertBlocks([newBlock("model", { media })], target, "Add 3D model");
      } else {
        await addFiles(chosen, { insert: target });
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      busy.current = false;
      close();
    }
  };

  const sectionIndex = () => {
    if ("newSectionAt" in target) return target.newSectionAt;
    return (findSection(doc(), target.sectionId)?.index ?? doc().page.sections.length - 1) + 1;
  };

  const pinned = useEditor((s) => !!s.barPin);

  return (
    <>
      <div className="insert-bar" data-overlay-ui style={{ left: x, top: y }} data-pinned={pinned || undefined} role="toolbar" aria-label="Insert">
        <span className="ib-label">Insert</span>
        <Tool icon="image" label="Image" hint="Upload images or video. Several become a grid." onClick={() => pick("media")} />
        <Tool
          icon="text"
          label="Text"
          hint="A paragraph"
          onClick={() => {
            const block = newBlock("text");
            insertBlocks([block], target, "Add text");
            setTextEdit({ id: block.id, part: "text" });
          }}
        />
        <Tool icon="gallery" label="Photo grid" hint="Upload several; rows line up edge to edge" onClick={() => pick("grid")} />
        <Tool icon="video" label="Video" hint="A file, or a YouTube or Vimeo link" onClick={open("video")} active={menu === "video"} />
        <Tool icon="audio" label="Audio" hint="An MP3, WAV or M4A with a player" onClick={() => pick("audio")} />
        <Tool icon="embed" label="Embed" hint="Spotify, SoundCloud, Figma, CodePen…" onClick={open("embed")} active={menu === "embed"} />
        <Tool icon="cube" label="3D" hint="A GLB file, or a Sketchfab model" onClick={open("3d")} active={menu === "3d"} />
        <span className="ib-divider" />
        <Tool icon="layouts" label="Layouts" hint="Bento and photo-grid layouts to fill" onClick={open("layouts")} active={menu === "layouts"} caret />
        <Tool icon="flow" label="Section" hint="Ready-made sections, or a blank layout" onClick={open("sections")} active={menu === "sections"} caret />
        <Tool icon="more" label="More" hint="Heading, quote, before/after, facts…" onClick={open("more")} active={menu === "more"} />
        <input ref={files} type="file" hidden onChange={(e) => void onFiles(e.target.files)} />
      </div>

      {menu === "video" && anchor && (
        <Pop anchor={anchor} onClose={close}>
          <LinkForm
            title="Video"
            placeholder="https://youtu.be/… or https://vimeo.com/…"
            examples="Paste a YouTube or Vimeo link, or upload a file"
            accept={(u) => (["YouTube", "Vimeo"].includes(detectEmbed(u)?.provider ?? "") ? null : "Use a YouTube or Vimeo link here")}
            onSubmit={(url) => {
              insertBlocks([newBlock("video", { source: "embed", url, autoplay: false, controls: true })], target, "Add video");
              close();
            }}
            extra={
              <button type="button" className="btn btn-sm" onClick={() => pick("video")}>
                <Icon name="upload" size={14} />
                Upload a file
              </button>
            }
          />
        </Pop>
      )}
      {(menu === "embed" || menu === "3d") && anchor && (
        <Pop anchor={anchor} onClose={close}>
          <LinkForm
            title={menu === "3d" ? "3D model" : "Embed"}
            placeholder={menu === "3d" ? "https://sketchfab.com/3d-models/…" : "Paste a link or <iframe> code"}
            examples={
              menu === "3d"
                ? "Paste a Sketchfab model link, or upload a GLB to show it right on the page"
                : "YouTube, Vimeo, Loom, Spotify, SoundCloud, Apple Music and Podcasts, Bandcamp, Mixcloud, Sketchfab, LottieFiles, Figma, CodePen, Behance, Instagram"
            }
            accept={menu === "3d" ? (u) => (detectEmbed(u)?.kind === "3d" ? null : "Use a Sketchfab model link") : undefined}
            extra={
              menu === "3d" ? (
                <button type="button" className="btn btn-sm" onClick={() => pick("model")}>
                  <Icon name="upload" size={14} />
                  Upload a GLB
                </button>
              ) : undefined
            }
            onSubmit={(url) => {
              insertBlocks([newBlock("embed", { url })], target, menu === "3d" ? "Add 3D model" : "Add embed");
              close();
            }}
          />
        </Pop>
      )}
      {menu === "sections" && anchor && (
        <Pop anchor={anchor} onClose={close} width={560}>
          <SectionLibrary
            compact
            autoFocus
            onPick={(section) => {
              insertSection(section, sectionIndex());
              close();
            }}
          />
        </Pop>
      )}
      {menu === "layouts" && anchor && (
        <LayoutPopover
          x={anchor.left + anchor.width / 2}
          y={anchor.bottom + 8}
          title="Add a layout, then drop images into it"
          onClose={close}
          onCancel={close}
          onPick={(p) => {
            insertGallery(p, target);
            close();
          }}
        />
      )}
      {menu === "more" && anchor && <InsertMenu x={anchor.left + anchor.width / 2} y={anchor.bottom + 8} target={target} onClose={close} />}
    </>
  );
}
