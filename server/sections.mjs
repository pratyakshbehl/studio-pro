import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { DATA, HttpError, TRASH, keyedQueue, readJson, stamp, writeJsonAtomic } from "./lib.mjs";

/**
 * "Your sections": sections saved from any project to reuse in others, kept in
 * data/library/sections.json. Removing one copies it to data/.trash first.
 */
const FILE = join(DATA, "library", "sections.json");
const queue = keyedQueue();

const load = async () => (await readJson(FILE, { sections: [] })).sections ?? [];
const save = async (sections) => {
  await mkdir(join(DATA, "library"), { recursive: true });
  await writeJsonAtomic(FILE, { sections });
};

export const listSections = () => load();

function checkSection(section) {
  if (!section || typeof section !== "object" || !Array.isArray(section.blocks) || !section.layout) throw new HttpError(400, "That isn't a section.");
}

export function addSection({ name, section }) {
  checkSection(section);
  return queue("sections", async () => {
    const list = await load();
    const item = { id: randomUUID().slice(0, 12), name: String(name || section.name || "Section").slice(0, 80), createdAt: new Date().toISOString(), section };
    await save([item, ...list]);
    return item;
  });
}

export function renameSection(id, { name }) {
  return queue("sections", async () => {
    const list = await load();
    const item = list.find((x) => x.id === id);
    if (!item) throw new HttpError(404, "That saved section is gone.");
    item.name = String(name || item.name).slice(0, 80);
    await save(list);
    return item;
  });
}

export function removeSection(id) {
  return queue("sections", async () => {
    const list = await load();
    const item = list.find((x) => x.id === id);
    if (!item) throw new HttpError(404, "That saved section is gone.");
    await mkdir(TRASH, { recursive: true });
    await writeJsonAtomic(join(TRASH, `section-${id}-${stamp()}.json`), item);
    await save(list.filter((x) => x.id !== id));
    return { ok: true };
  });
}
