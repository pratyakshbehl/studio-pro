/**
 * Everything the editor does to the document goes through here: one function
 * per user intent, each turned into model commands so it is one undo step.
 */
import {
  batch,
  blockInsert,
  blockMove,
  blockOverride,
  blockRemove,
  blockUpdate,
  cloneBlock,
  cloneSection,
  findBlock,
  findSection,
  newBlock,
  newSection,
  projectUpdate,
  sectionInsert,
  sectionMove,
  sectionOverride,
  sectionRemove,
  sectionUpdate,
  step,
  BLOCK_LABELS,
  type Block,
  type Media,
  type Patch,
  type Project,
  type Section,
  type Step,
} from "../model/index.ts";
import { resolveNode } from "../model/resolve.ts";
import { doc, run, select, setPendingLayout, setTextEdit, toast, useEditor } from "./store.ts";
import { placeImages } from "./gallery.ts";
import { withFrames } from "./canvasOps.ts";
import { measureInto } from "./peaks.ts";
import type { CatalogEntry } from "./catalog.ts";
import { kindOfFile, uploadFile } from "./upload.ts";
import { api } from "../lib/api.ts";
import { plural } from "../lib/format.ts";

const state = () => useEditor.getState();

/* ── Targets ──────────────────────────────────────────────────────────── */

/** Where a new block goes: into a section at an index, or a new section at a story index. */
export type InsertTarget = { sectionId: string; index: number } | { newSectionAt: number };

export function defaultTarget(): InsertTarget {
  const d = doc();
  const sel = state().selection;
  const last = sel[sel.length - 1];
  if (last) {
    const b = findBlock(d, last);
    if (b) return { sectionId: b.section.id, index: b.index + 1 };
    const s = findSection(d, last);
    if (s) return { sectionId: s.section.id, index: s.section.blocks.length };
  }
  const sections = d.page.sections;
  if (!sections.length) return { newSectionAt: 0 };
  const lastSection = sections[sections.length - 1];
  return { sectionId: lastSection.id, index: lastSection.blocks.length };
}

/** Inserts blocks at a target as one undo step and selects them. */
export function insertBlocks(blocks: Block[], target: InsertTarget = defaultTarget(), label = "Add block") {
  if (!blocks.length) return;
  if ("newSectionAt" in target) {
    const count = doc().page.sections.length;
    const section = newSection("flow", { name: count ? `Section ${count + 1}` : "Story" });
    section.blocks = blocks;
    run(sectionInsert, { section, index: target.newSectionAt });
  } else {
    const section = findSection(doc(), target.sectionId)?.section;
    if (section) blocks = withFrames(section, blocks);
    run(batch, {
      label,
      steps: blocks.map((block, i) => step(blockInsert, { sectionId: target.sectionId, block, index: target.index + i })),
    });
  }
  select(blocks.map((b) => b.id));
}

export function insertSection(section: Section, index?: number) {
  const d = doc();
  const sel = state().selection;
  let at = index;
  if (at === undefined) {
    const last = sel[sel.length - 1];
    const hit = last ? (findSection(d, last) ?? (findBlock(d, last) && { index: findBlock(d, last)!.sectionIndex })) : null;
    at = hit ? hit.index + 1 : d.page.sections.length;
  }
  run(sectionInsert, { section, index: at });
  select([section.id]);
}

export function insertEntry(entry: CatalogEntry, target?: InsertTarget) {
  if (entry.kind === "section") {
    const index = target && "newSectionAt" in target ? target.newSectionAt : undefined;
    insertSection(entry.make(), index);
  } else {
    const block = entry.make();
    insertBlocks([block], target, `Add ${entry.label.toLowerCase()}`);
    // A new heading, text or quote is ready to type into.
    if (TEXTUAL.has(block.type)) setTextEdit({ id: block.id, part: "text" });
  }
}

export const TEXTUAL = new Set(["heading", "text", "quote"]);

/**
 * Keep the selected section (or the selected blocks, as a new section) in
 * "Your sections", to add to any project later.
 */
export async function saveSelectionAsSection() {
  const d = doc();
  const { sections, blocks } = picked(d);
  let section: Section | null = null;
  if (sections.length === 1 && !blocks.length) section = sections[0];
  else if (blocks.length) section = { ...newSection("flow", { name: blocks.length === 1 ? BLOCK_LABELS[blocks[0].type] : "Saved blocks" }), blocks: blocks.map(cloneBlock) };
  if (!section) return toast("Select one section, or some blocks, to save them.", "error");
  try {
    const saved = await api.saveSection(section.name, structuredClone(section));
    window.dispatchEvent(new Event("studio:sections"));
    toast(`Saved “${saved.name}” to Your sections (Insert › Sections)`);
  } catch (e) {
    toast((e as Error).message, "error");
  }
}

/* ── Selection helpers ────────────────────────────────────────────────── */

type Picked = { sections: Section[]; blocks: Block[] };

/** The selection in document order; blocks inside a selected section are covered by it. */
export function picked(d: Project = doc(), ids = state().selection): Picked {
  const set = new Set(ids);
  const sections: Section[] = [];
  const blocks: Block[] = [];
  for (const s of d.page.sections) {
    if (set.has(s.id)) {
      sections.push(s);
      continue;
    }
    for (const b of s.blocks) if (set.has(b.id)) blocks.push(b);
  }
  return { sections, blocks };
}

export function selectParent() {
  const sel = state().selection;
  if (!sel.length) return;
  const last = sel[sel.length - 1];
  if (last.includes("#")) return select([last.split("#")[0]]);
  const b = findBlock(doc(), last);
  select(b ? [b.section.id] : []);
}

export function selectChild() {
  const last = state().selection[state().selection.length - 1];
  const s = last && findSection(doc(), last);
  if (s && s.section.blocks.length) select([s.section.blocks[0].id]);
}

export function selectAll() {
  const d = doc();
  const last = state().selection[state().selection.length - 1];
  const b = last && findBlock(d, last);
  const s = b ? b.section : last && findSection(d, last)?.section;
  if (s && b) select(s.blocks.map((x) => x.id));
  else select(d.page.sections.map((x) => x.id));
}

/* ── Delete, duplicate, move ──────────────────────────────────────────── */

export function deleteSelection() {
  const items = state().selection.filter((id) => id.includes("#"));
  if (items.length) {
    // Images inside a gallery: empty the bento cell or take the image out, highest index first.
    const byBlock = new Map<string, number[]>();
    for (const id of items) {
      const [blockId, i] = id.split("#");
      byBlock.set(blockId, [...(byBlock.get(blockId) ?? []), Number(i)]);
    }
    const d = doc();
    const steps: Step[] = [];
    for (const [blockId, idx] of byBlock) {
      const g = findBlock(d, blockId)?.block;
      if (g?.type !== "gallery") continue;
      const next = [...g.items];
      for (const i of idx.sort((a, b) => b - a)) {
        if (g.mode === "bento") next[i] = null;
        else next.splice(i, 1);
      }
      steps.push(step(blockUpdate, { id: blockId, patch: { items: next } }));
    }
    run(batch, { label: items.length === 1 ? "Remove image" : `Remove ${items.length} images`, steps });
    select([...byBlock.keys()]);
    return;
  }
  const { sections, blocks } = picked();
  const locked = [...sections, ...blocks].filter((n) => n.locked);
  const go = [...sections, ...blocks].filter((n) => !n.locked);
  if (!go.length) {
    if (locked.length) toast("That's locked. Unlock it in Layers first.");
    return;
  }
  run(batch, {
    label: go.length === 1 ? `Delete ${sections.length ? "section" : BLOCK_LABELS[(go[0] as Block).type].toLowerCase()}` : `Delete ${go.length} items`,
    steps: go.map((n) => (sections.includes(n as Section) ? step(sectionRemove, { id: n.id }) : step(blockRemove, { id: n.id }))),
  });
  select([]);
  if (locked.length) toast(`${plural(locked.length, "locked item")} kept.`);
}

export function duplicateSelection() {
  const d = doc();
  const { sections, blocks } = picked(d);
  const steps: Step[] = [];
  const fresh: string[] = [];
  // Work bottom-up so earlier inserts don't shift later indices.
  for (const s of [...sections].reverse()) {
    const copy = cloneSection(s);
    steps.push(step(sectionInsert, { section: copy, index: findSection(d, s.id)!.index + 1 }));
    fresh.push(copy.id);
  }
  for (const b of [...blocks].reverse()) {
    const hit = findBlock(d, b.id)!;
    const copy = cloneBlock(b);
    steps.push(step(blockInsert, { sectionId: hit.section.id, block: copy, index: hit.index + 1 }));
    fresh.push(copy.id);
  }
  if (!steps.length) return;
  run(batch, { label: "Duplicate", steps });
  select(fresh.reverse());
}

/** Alt+↑/↓: one step through the story, crossing into the next section at the edges. */
export function moveSelection(dir: -1 | 1) {
  const d = doc();
  const { sections, blocks } = picked(d);
  if (sections.length === 1 && !blocks.length) {
    const hit = findSection(d, sections[0].id)!;
    const to = hit.index + dir;
    if (to >= 0 && to < d.page.sections.length) run(sectionMove, { id: hit.section.id, index: to });
    return;
  }
  if (blocks.length !== 1 || sections.length) return;
  const hit = findBlock(d, blocks[0].id)!;
  const to = hit.index + dir;
  if (to >= 0 && to < hit.section.blocks.length) {
    run(blockMove, { id: hit.block.id, sectionId: hit.section.id, index: to });
  } else {
    const neighbour = d.page.sections[hit.sectionIndex + dir];
    if (neighbour) run(blockMove, { id: hit.block.id, sectionId: neighbour.id, index: dir < 0 ? neighbour.blocks.length : 0 });
  }
}

/* ── Clipboard ────────────────────────────────────────────────────────── */

interface Clip {
  studioPro: 1;
  sections: Section[];
  blocks: Block[];
}
let clipboard: Clip | null = null;

export async function copySelection(cut = false) {
  const { sections, blocks } = picked();
  if (!sections.length && !blocks.length) return;
  clipboard = { studioPro: 1, sections: structuredClone(sections), blocks: structuredClone(blocks) };
  try {
    await navigator.clipboard.writeText(JSON.stringify(clipboard));
  } catch {
    /* the in-app clipboard still works */
  }
  if (cut) deleteSelection();
  toast(cut ? "Cut" : `Copied ${plural(sections.length + blocks.length, "item")}`);
}

/** Paste Studio Pro nodes (from this tab or another), image files, or a video link. */
export async function pasteFrom(data: DataTransfer | null) {
  const files = data ? [...data.files] : [];
  if (files.length) return addFiles(files);
  const text = data?.getData("text/plain")?.trim() ?? "";
  let clip: Clip | null = null;
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as Clip;
      if (parsed.studioPro === 1) clip = parsed;
    } catch {
      /* not ours */
    }
  }
  if (!clip && /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\//.test(text)) {
    insertBlocks([newBlock("video", { source: "embed", url: text, autoplay: false, controls: true })], undefined, "Paste video link");
    return;
  }
  clip ??= clipboard;
  if (!clip) return;
  if (clip.sections.length) {
    const copies = clip.sections.map(cloneSection);
    const d = doc();
    const last = state().selection[state().selection.length - 1];
    const at = last ? (findSection(d, last)?.index ?? findBlock(d, last)?.sectionIndex ?? d.page.sections.length - 1) + 1 : d.page.sections.length;
    run(batch, { label: "Paste", steps: copies.map((section, i) => step(sectionInsert, { section, index: at + i })) });
    select(copies.map((s) => s.id));
  }
  if (clip.blocks.length) insertBlocks(clip.blocks.map(cloneBlock), undefined, "Paste");
}

/* ── Properties (breakpoint-aware) ────────────────────────────────────── */

/** On desktop this edits the value; on tablet/phone it records an override. */
export function setProps(id: string, patch: Patch, opts: { anyBreakpoint?: boolean } = {}) {
  const bp = state().bp;
  const d = doc();
  const isSection = !!findSection(d, id);
  if (bp === "desktop" || opts.anyBreakpoint) run(isSection ? sectionUpdate : blockUpdate, { id, patch });
  else run(isSection ? sectionOverride : blockOverride, { id, bp, patch });
}

export function toggleHidden(ids = state().selection) {
  const d = doc();
  const bp = state().bp;
  const nodes = ids.map((id) => findSection(d, id)?.section ?? findBlock(d, id)?.block).filter((n): n is Section | Block => !!n);
  if (!nodes.length) return;
  const hide = !nodes.every((n) => resolveNode(n, bp).hidden);
  run(batch, {
    label: hide ? "Hide" : "Show",
    steps: nodes.map((n) => {
      const isSection = "blocks" in n;
      if (bp === "desktop") return step(isSection ? sectionUpdate : blockUpdate, { id: n.id, patch: { hidden: hide || undefined } });
      return step(isSection ? sectionOverride : blockOverride, { id: n.id, bp, patch: { hidden: hide } });
    }),
  });
  if (hide && bp !== "desktop") toast(`Hidden on ${bp} only. Desktop is unchanged.`);
}

export function toggleLocked(ids = state().selection) {
  const d = doc();
  const nodes = ids.map((id) => findSection(d, id)?.section ?? findBlock(d, id)?.block).filter((n): n is Section | Block => !!n);
  if (!nodes.length) return;
  const lock = !nodes.every((n) => n.locked);
  run(batch, {
    label: lock ? "Lock" : "Unlock",
    steps: nodes.map((n) => step("blocks" in n ? sectionUpdate : blockUpdate, { id: n.id, patch: { locked: lock || undefined } })),
  });
}

export function rename(id: string, name: string) {
  const d = doc();
  const s = findSection(d, id);
  const clean = name.trim();
  if (s) run(sectionUpdate, { id, patch: { name: clean || "Section" } });
  else if (findBlock(d, id)) run(blockUpdate, { id, patch: { name: clean || undefined } });
}

/* ── Files ────────────────────────────────────────────────────────────── */

export interface DropTarget {
  /** Fill or replace the media of this block. */
  blockId?: string;
  /** For a gallery: the image slot the files landed on. */
  itemIndex?: number;
  /** Screen point of the drop, for the layout picker. */
  point?: { x: number; y: number };
  /** For a compare block: which side the file landed on. */
  side?: "before" | "after";
  insert?: InsertTarget;
}

let uploading = 0;

/**
 * Uploads dropped or pasted files, then turns them into blocks: one image an
 * Image, several a Gallery, each video a Video. Dropped on a media block, they
 * fill or replace it instead.
 */
export async function addFiles(files: File[], target: DropTarget = {}) {
  const usable = files.filter((f) => kindOfFile(f) !== null);
  const skipped = files.length - usable.length;
  if (!usable.length) {
    toast("Studio Pro can use images, videos and audio here.", "error");
    return;
  }

  uploading += usable.length;
  toast(`Uploading ${plural(usable.length, "file")}…`);
  const media: Media[] = [];
  try {
    for (const f of usable) media.push(await uploadFile(f));
  } catch (e) {
    toast((e as Error).message, "error");
    if (!media.length) return;
  } finally {
    uploading -= usable.length;
  }
  placeMedia(media, target);
  if (skipped) toast(`${plural(skipped, "file")} skipped: only images, videos and audio can go here.`, "error");
}

/**
 * Puts media (just uploaded, or dragged from the Media panel) where it was
 * dropped: into the media block or gallery cell under it, or as new blocks.
 */
export function placeMedia(media: Media[], target: DropTarget = {}) {
  const d = doc();
  const intoHit = target.blockId ? findBlock(d, target.blockId) : null;
  let rest = media;
  let insert = target.insert;
  if (intoHit?.block.type === "gallery") {
    const images = media.filter((m) => m.type === "image");
    if (images.length) {
      placeImages(intoHit.block.id, images, target.itemIndex);
      toast(`Added ${plural(images.length, "image")} to the gallery`);
    }
    rest = media.filter((m) => m.type !== "image");
    insert = { sectionId: intoHit.section.id, index: intoHit.index + 1 };
  } else if (intoHit) {
    rest = fillBlock(intoHit.block, media, target.side);
    insert = { sectionId: intoHit.section.id, index: intoHit.index + 1 };
    if (rest.length < media.length) toast(`Added to ${BLOCK_LABELS[intoHit.block.type].toLowerCase()}`);
  }
  if (rest.length) {
    const images = rest.filter((m) => m.type === "image");
    const videos = rest.filter((m) => m.type === "video");
    const audio = rest.filter((m) => m.type === "audio");
    const blocks: Block[] = [];
    if (images.length === 1) blocks.push(newBlock("image", { media: images[0] }));
    for (const v of videos) blocks.push(newBlock("video", { media: v, aspect: null }));
    for (const a of audio) blocks.push(newBlock("audio", { media: a, title: fileTitle(a) }));
    for (const m of rest.filter((x) => x.type === "model")) blocks.push(newBlock("model", { media: m }));
    for (const m of rest.filter((x) => x.type === "lottie")) blocks.push(newBlock("lottie", { src: m.src }));
    if (blocks.length) insertBlocks(blocks, insert, `Add ${plural(blocks.length, "file")}`);
    for (const b of blocks) if (b.type === "audio" && b.media) void measureInto(b.id, b.media);
    if (images.length > 1) {
      // Several images: ask how to lay them out (Enter takes the photo grid).
      const after = insert && "sectionId" in insert ? { ...insert, index: insert.index + blocks.length } : insert;
      const at = target.point ?? { x: window.innerWidth / 2, y: window.innerHeight / 3 };
      setPendingLayout({ media: images, target: after, x: at.x, y: at.y });
      toast(`${plural(images.length, "image")} ready. Pick a layout.`);
    } else toast(`Added ${plural(media.length, "file")}`);
  }
}

/** "My Track_v2.mp3" → "My Track_v2", for a title to start from. */
const fileTitle = (m: Media) => decodeURIComponent(m.src.split("/").pop() ?? "").replace(/\.[^.]+$/, "");

/** Puts uploaded media into an existing media block; returns what it couldn't take. */
function fillBlock(block: Block, media: Media[], side?: "before" | "after"): Media[] {
  const images = media.filter((m) => m.type === "image");
  const videos = media.filter((m) => m.type === "video");
  switch (block.type) {
    case "image":
      if (!images.length) return media;
      run(blockUpdate, { id: block.id, patch: { media: images[0] } });
      return media.filter((m) => m !== images[0]);
    case "video":
      if (!videos.length) return media;
      run(blockUpdate, { id: block.id, patch: { media: videos[0], source: "file" } });
      return media.filter((m) => m !== videos[0]);
    case "gallery":
      if (!images.length) return media;
      run(blockUpdate, { id: block.id, patch: { items: [...block.items, ...images] } });
      return media.filter((m) => m.type !== "image");
    case "compare": {
      if (images.length >= 2) {
        run(blockUpdate, { id: block.id, patch: { before: images[0], after: images[1] } });
        return media.filter((m) => m !== images[0] && m !== images[1]);
      }
      if (images.length === 1) {
        const key = side ?? (!block.before ? "before" : "after");
        run(blockUpdate, { id: block.id, patch: { [key]: images[0] } });
        return media.filter((m) => m !== images[0]);
      }
      return media;
    }
    case "audio": {
      const track = media.find((m) => m.type === "audio");
      const cover = media.find((m) => m.type === "image");
      if (!track && !cover) return media;
      run(blockUpdate, { id: block.id, patch: { ...(track ? { media: track, peaks: undefined, duration: undefined } : null), ...(cover ? { cover } : null) } });
      if (track) void measureInto(block.id, track);
      return media.filter((m) => m !== track && m !== cover);
    }
    case "layers": {
      // Fill the empty stages in order, then add a stage per extra image.
      if (!images.length) return media;
      const steps = block.steps.map((s) => ({ ...s }));
      const queue = [...images];
      for (const s of steps) if (!s.media && queue.length) s.media = queue.shift()!;
      for (const m of queue) steps.push({ media: m, label: `Pass ${steps.length + 1}` });
      run(blockUpdate, { id: block.id, patch: { steps } });
      return media.filter((m) => m.type !== "image");
    }
    case "turntable": {
      if (videos.length) {
        run(blockUpdate, { id: block.id, patch: { source: "video", video: videos[0] } });
        return media.filter((m) => m !== videos[0] && m.type !== "image");
      }
      if (!images.length) return media;
      // Frames sort by file name, so render_0001…render_0072 land in order.
      const frames = [...block.frames, ...images].sort((a, b) => a.src.localeCompare(b.src, undefined, { numeric: true }));
      run(blockUpdate, { id: block.id, patch: { source: "frames", frames } });
      return media.filter((m) => m.type !== "image");
    }
    case "model": {
      const model = media.find((m) => m.type === "model");
      const poster = images[0];
      if (!model && !poster) return media;
      run(blockUpdate, { id: block.id, patch: { ...(model ? { media: model } : null), ...(poster ? { poster } : null) } });
      return media.filter((m) => m !== model && m !== poster);
    }
    case "lottie": {
      const anim = media.find((m) => m.type === "lottie");
      if (!anim) return media;
      run(blockUpdate, { id: block.id, patch: { src: anim.src } });
      return media.filter((m) => m !== anim);
    }
    case "prompt":
      if (!images.length) return media;
      run(blockUpdate, { id: block.id, patch: { media: images[0] } });
      return media.filter((m) => m !== images[0]);
    case "tracklist": {
      const audio = media.filter((m) => m.type === "audio");
      const cover = !block.cover ? images[0] : undefined;
      if (!audio.length && !cover) return media;
      const start = block.tracks.length;
      run(blockUpdate, {
        id: block.id,
        patch: { tracks: [...block.tracks, ...audio.map((m) => ({ title: fileTitle(m), media: m }))], ...(cover ? { cover } : null) },
      });
      audio.forEach((m, i) => void measureInto(block.id, m, start + i));
      return media.filter((m) => m.type !== "audio" && m !== cover);
    }
    default:
      return media;
  }
}

export const isUploading = () => uploading > 0;

/* ── Project details ──────────────────────────────────────────────────── */

export function setProject(patch: Partial<Project>) {
  run(projectUpdate, { patch });
}
