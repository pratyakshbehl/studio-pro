import { SCHEMA_VERSION, type Project, type Section } from "./schema.ts";
import { DEFAULT_CHROME, guessIntro } from "./factories.ts";

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/**
 * MIGRATIONS[n] upgrades a document from version n to n + 1. A schema change
 * bumps SCHEMA_VERSION and adds one entry here, so files saved by an older
 * Studio Pro always open in a newer one.
 */
const MIGRATIONS: Record<number, Migration> = {
  /** v2: the page records which site-page parts (header, cover, intro, next) it shows. */
  1: (doc) => {
    const page = doc.page as { sections: Section[] } & Record<string, unknown>;
    return { page: { ...page, chrome: { ...DEFAULT_CHROME, intro: guessIntro(page.sections) } } };
  },
  /** v3: galleries gain the photo-grid row height (and bento, set only when chosen). */
  2: (doc) => {
    const page = doc.page as { sections: Section[] } & Record<string, unknown>;
    const sections = page.sections.map((s) => ({
      ...s,
      blocks: s.blocks.map((b) => (b.type === "gallery" && b.rowHeight === undefined ? { ...b, rowHeight: 300 } : b)),
    }));
    return { page: { ...page, sections } };
  },
};

export function migrateProject(raw: unknown): Project {
  const doc = { ...(raw as Record<string, unknown>) };
  let version = typeof doc.schemaVersion === "number" ? doc.schemaVersion : 1;
  if (version > SCHEMA_VERSION) {
    throw new Error(`This project was saved by a newer Studio Pro (schema ${version}).`);
  }
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No migration from schema ${version}`);
    Object.assign(doc, step(doc));
    version++;
  }
  doc.schemaVersion = SCHEMA_VERSION;
  return doc as unknown as Project;
}
