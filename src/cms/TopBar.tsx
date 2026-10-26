import { useEffect, useState, type ReactNode } from "react";
import { api, type Health } from "../lib/api.ts";
import { linkProps, usePath } from "../lib/router.ts";
import { Mark } from "../ui/icons.tsx";

/** Which site copy Studio publishes to, and whether Studio can see it. */
function SiteStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .health()
      .then((h) => alive && setHealth(h))
      .catch(() => alive && setDown(true));
    return () => {
      alive = false;
    };
  }, []);

  if (down) return <span className="site-status" data-state="down">Server not reachable</span>;
  if (!health) return <span className="site-status" aria-hidden="true" />;
  const name = health.site.dir.split(/[\\/]/).pop() ?? "";
  const short = /Copy (\d+)$/.exec(name)?.[1];
  return (
    <span className="site-status" data-state={health.site.ok ? "ok" : "missing"} title={health.site.dir}>
      {health.site.ok ? `Publishes to site copy ${short ?? name}` : "Site folder not found"}
    </span>
  );
}

/** Projects and Media: the two places you manage things outside the editor. */
function Sections() {
  const path = usePath();
  return (
    <nav className="topbar-nav" aria-label="Studio">
      <a {...linkProps("/")} aria-current={path === "/" ? "page" : undefined}>
        Projects
      </a>
      <a {...linkProps("/media")} aria-current={path.startsWith("/media") ? "page" : undefined}>
        Media
      </a>
    </nav>
  );
}

export function TopBar({ children, actions }: { children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="topbar">
      <a className="topbar-mark" {...linkProps("/")} aria-label="Studio Pro, all projects">
        <Mark />
        <span>Studio Pro</span>
      </a>
      {children ? <div className="topbar-crumbs">{children}</div> : <Sections />}
      <div className="topbar-actions">
        <SiteStatus />
        {actions}
      </div>
    </header>
  );
}
