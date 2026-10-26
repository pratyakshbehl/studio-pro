import type { Block, Project, Section } from "./schema.ts";

export interface SectionHit {
  section: Section;
  index: number;
}

export interface BlockHit {
  block: Block;
  index: number;
  section: Section;
  sectionIndex: number;
}

export function findSection(doc: Project, id: string): SectionHit | null {
  const index = doc.page.sections.findIndex((s) => s.id === id);
  return index < 0 ? null : { section: doc.page.sections[index], index };
}

export function findBlock(doc: Project, id: string): BlockHit | null {
  const sections = doc.page.sections;
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const section = sections[sectionIndex];
    const index = section.blocks.findIndex((b) => b.id === id);
    if (index >= 0) return { block: section.blocks[index], index, section, sectionIndex };
  }
  return null;
}

/** Any node (section or block) by id. */
export function findNode(doc: Project, id: string): Section | Block | null {
  return findSection(doc, id)?.section ?? findBlock(doc, id)?.block ?? null;
}

export function allBlocks(doc: Project): Block[] {
  return doc.page.sections.flatMap((s) => s.blocks);
}

export function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length, Math.round(index)));
}
