import { useSyncExternalStore } from "react";

/**
 * Tiny history router. Two routes today: "/" (projects) and "/p/:id"
 * (a project). The server falls back to index.html, so reloads work.
 */
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

if (typeof window !== "undefined") window.addEventListener("popstate", emit);

export function navigate(to: string, { replace = false } = {}) {
  if (to === location.pathname + location.search) return;
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  emit();
  window.scrollTo(0, 0);
}

export function usePath(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => location.pathname,
  );
}

export type Route =
  | { name: "home" }
  | { name: "media" }
  | { name: "project"; id: string }
  | { name: "preview"; id: string }
  | { name: "missing"; path: string };

export function match(path: string): Route {
  if (path === "/" || path === "") return { name: "home" };
  if (/^\/media\/?$/.test(path)) return { name: "media" };
  const p = /^\/p\/([\w-]+)\/?$/.exec(path);
  if (p) return { name: "project", id: p[1] };
  const v = /^\/preview\/([\w-]+)\/?$/.exec(path);
  if (v) return { name: "preview", id: v[1] };
  return { name: "missing", path };
}

/** Left-click on an <a href="/…"> without modifiers stays in the app. */
export function linkProps(to: string) {
  return {
    href: to,
    onClick(e: React.MouseEvent<HTMLAnchorElement>) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(to);
    },
  };
}
