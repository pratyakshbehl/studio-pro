"use client";

/**
 * Renders a case-study story authored in Studio Pro, with the same renderer
 * Studio's editor uses (copied in by studio-pro/scripts/sync-renderer.mjs).
 * The page around it (title, cover, intro, next project) stays the site's own.
 */
import "./render/render.css";
import "./studio-site.css";
import { RenderProvider, type RenderHost } from "./render/context";
import { StoryView } from "./render/Page";
import type { Project as StudioProject } from "./model/schema";
import type { Project } from "@/types/project";

/** The fields the renderer reads, from the site's record of the project. */
function forRenderer(p: Project): StudioProject {
  return {
    title: p.title,
    year: p.year,
    role: p.role,
    tools: p.tools,
    categories: p.category ? [p.category] : [],
    client: p.studio?.client ?? "",
    credits: p.studio?.credits ?? [],
    soundtrack: p.studio?.soundtrack,
    page: p.page!,
  } as unknown as StudioProject;
}

export function StudioStory({ project }: { project: Project }) {
  if (!project.page?.sections?.length) return null;
  // Published media already lives in /public, so paths are used as they are.
  const host: RenderHost = { mediaUrl: (src) => src, editing: false, project: forRenderer(project) };
  return (
    <RenderProvider value={host}>
      <StoryView />
    </RenderProvider>
  );
}
