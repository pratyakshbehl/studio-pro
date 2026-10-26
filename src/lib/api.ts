import type { Project, ReportLine, Section, Status } from "../model/index.ts";

export interface ProjectSummary {
  id: string;
  slug: string;
  title: string;
  status: Status;
  categories: string[];
  year: number;
  featured: boolean;
  cover: Project["cover"];
  accent?: string;
  tags: string[];
  tools: string[];
  summary: string;
  createdAt: string;
  updatedAt: string;
  origin: Project["origin"]["source"];
  sections: number;
  blocks: number;
}

interface SourceFound {
  path: string;
  ok: boolean;
  count: number;
}

export interface ImportPreview {
  found: { site: SourceFound; studio: SourceFound; framer: SourceFound };
  report: (ReportLine & { alreadyInStudio: boolean })[];
  skipped: { source: string; ref: string; reason: string }[];
  newProjects: number;
  snapshots: number;
  media: number;
}

export interface ImportDone extends Omit<ImportPreview, "newProjects" | "media"> {
  imported: number;
  media: { copied: number; missing: string[] };
}

export interface Health {
  ok: boolean;
  site: { dir: string; ok: boolean; url: string };
}

export interface SnapshotInfo {
  file: string;
  label: string;
  at: string;
}

export interface LibraryItem {
  src: string;
  type: "image" | "video" | "audio" | "model" | "lottie";
  name: string;
  size: number;
  modified: string;
  origin: "studio" | "site";
  width?: number;
  height?: number;
  /** Notes kept in data/media-meta.json. */
  alt?: string;
  tags?: string[];
  focal?: { x: number; y: number };
  variants?: { w: number; src: string }[];
  poster?: string;
  peaks?: number[];
  duration?: number;
  bpm?: number;
  key?: string;
  mood?: string[];
  loop?: { in: number; out: number };
  /** Projects whose pages use this file. */
  usedIn: { id: string; title: string }[];
}

export type MediaMeta = Partial<Pick<LibraryItem, "alt" | "tags" | "focal" | "variants" | "poster" | "peaks" | "duration" | "bpm" | "key" | "mood" | "loop">>;

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, message: string, body: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach Studio Pro's server. Is its window still open?", {});
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? res.statusText), data);
  return data as T;
}

export const api = {
  health: () => call<Health>("GET", "/api/health"),
  projects: () => call<ProjectSummary[]>("GET", "/api/projects"),
  project: (id: string) => call<Project>("GET", `/api/projects/${id}`),
  create: (partial: Partial<Project> = {}) => call<Project>("POST", "/api/projects", partial),
  save: (doc: Project) => call<Project>("PUT", `/api/projects/${doc.id}`, doc),
  trash: (id: string) => call<{ id: string; title: string }>("DELETE", `/api/projects/${id}`),
  snapshots: (id: string) => call<SnapshotInfo[]>("GET", `/api/projects/${id}/snapshots`),
  saveVersion: (id: string, label: string) => call<SnapshotInfo>("POST", `/api/projects/${id}/snapshots`, { label }),
  snapshot: (id: string, file: string) => call<SnapshotInfo & { doc: Project }>("GET", `/api/projects/${id}/snapshots/${file}`),
  library: () => call<LibraryItem[]>("GET", "/api/media"),
  mediaMeta: (src: string, patch: Record<string, unknown>) => call<LibraryItem>("PUT", "/api/media/meta", { src, patch }),
  order: (ids: string[]) => call<{ order: string[] }>("PUT", "/api/order", { ids }),
  importPreview: () => call<ImportPreview>("GET", "/api/import"),
  importRun: () => call<ImportDone>("POST", "/api/import"),
  bulk: (ids: string[], patch: BulkPatch) => call<ProjectSummary[]>("POST", "/api/projects/bulk", { ids, patch }),
  duplicate: (id: string) => call<ProjectSummary>("POST", `/api/projects/${id}/duplicate`),
  trashList: () => call<TrashItem[]>("GET", "/api/trash"),
  restore: (file: string) => call<ProjectSummary>("POST", `/api/trash/${encodeURIComponent(file)}/restore`),
  /** `only`: just these slugs; leave it out to publish everything. */
  publishPlan: (only?: string[]) => call<PublishPlanInfo>("GET", `/api/publish/plan${only ? `?only=${encodeURIComponent(only.join(","))}` : ""}`),
  publish: (hash: string, only?: string[]) => call<PublishRun>("POST", "/api/publish", { hash, only }),
  backups: () => call<BackupInfo[]>("GET", "/api/publish/backups"),
  restoreBackup: (id: string) => call<PublishRun>("POST", `/api/publish/restore/${encodeURIComponent(id)}`),
  publishLog: () => call<PublishRun[]>("GET", "/api/publish/log"),
  savedSections: () => call<SavedSection[]>("GET", "/api/library/sections"),
  saveSection: (name: string, section: Section) => call<SavedSection>("POST", "/api/library/sections", { name, section }),
  renameSection: (id: string, name: string) => call<SavedSection>("PUT", `/api/library/sections/${id}`, { name }),
  removeSection: (id: string) => call<{ ok: true }>("DELETE", `/api/library/sections/${id}`),
};

export interface BulkPatch {
  status?: Status;
  featured?: boolean;
  addTags?: string[];
  removeTags?: string[];
}

export interface TrashItem extends ProjectSummary {
  file: string;
  deletedAt: string | null;
}

/** A section someone saved to reuse ("Your sections"). */
export interface SavedSection {
  id: string;
  name: string;
  createdAt: string;
  section: Section;
}

export interface PublishPlanInfo {
  hash: string;
  site: { dir: string; file: string };
  changes: { slug: string; title: string; kind: "added" | "changed" | "unchanged" | "removed" | "kept"; fields: string[]; why?: string; held?: boolean }[];
  warnings: { slug: string; title: string; level: "error" | "warn"; text: string }[];
  media: { from: string; to: string; size: number; missing: boolean; present: boolean }[];
  pending: number;
  blocked: boolean;
  bytes: number;
}

export interface PublishRun {
  at: string;
  kind: "publish" | "restore";
  backup: string;
  added?: string[];
  changed?: string[];
  removed?: string[];
  held?: string[];
  media?: number;
  restored?: string;
}

export interface BackupInfo {
  id: string;
  at: string;
  reason: string;
  size: number;
  changes: { slug: string; title: string; kind: string }[];
}
