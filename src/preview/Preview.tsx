import { useEffect, useState } from "react";
import type { Project } from "../model/index.ts";
import { api } from "../lib/api.ts";
import { mediaUrl } from "../lib/media.ts";
import { linkProps } from "../lib/router.ts";
import { RenderProvider } from "../render/context.tsx";
import { PageView } from "../render/Page.tsx";

/** Widths to check the page at; "Full" is the window itself. */
const WIDTHS = [
  { w: 0, label: "Full" },
  { w: 1440, label: "Desktop 1440" },
  { w: 834, label: "Tablet 834" },
  { w: 390, label: "Phone 390" },
] as const;

/** The page as a visitor sees it: full window, nothing editable, interactions live. */
export function Preview({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [nextTitle, setNextTitle] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState<number>(() => Number(new URLSearchParams(location.search).get("w")) || 0);

  useEffect(() => {
    Promise.all([api.project(id), api.projects().catch(() => [])])
      .then(([p, list]) => {
        setProject(p);
        document.title = `${p.title || "Untitled project"} · Preview`;
        const live = list.filter((x) => x.status === "live" || x.status === "unlisted");
        const i = live.findIndex((x) => x.id === id);
        if (live.length > 1) setNextTitle(live[(i + 1) % live.length].title);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  // Follow edits made in the editor tab.
  useEffect(() => {
    const t = setInterval(() => {
      api
        .project(id)
        .then((p) => setProject((old) => (old && old.rev === p.rev ? old : p)))
        .catch(() => {});
    }, 2000);
    return () => clearInterval(t);
  }, [id]);

  if (error) return <main className="center-note">{error}</main>;
  if (!project) return null;

  return (
    <div className="preview" data-framed={width ? "" : undefined} style={{ background: width ? undefined : project.page.style.bg }}>
      {/* The page is a size container, so a narrower frame lays out exactly like a narrower window. */}
      <div className="preview-frame" style={width ? { width, background: project.page.style.bg } : undefined}>
        <RenderProvider value={{ mediaUrl, editing: false, project, nextTitle }}>
          <PageView />
        </RenderProvider>
      </div>
      <div className="preview-pill" role="toolbar" aria-label="Preview">
        <a {...linkProps(`/p/${id}`)}>Back to editor</a>
        <span className="preview-sep" />
        {WIDTHS.map((o) => (
          <button
            key={o.w}
            type="button"
            aria-pressed={width === o.w}
            onClick={() => {
              setWidth(o.w);
              const u = new URL(location.href);
              if (o.w) u.searchParams.set("w", String(o.w));
              else u.searchParams.delete("w");
              history.replaceState(null, "", u);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
