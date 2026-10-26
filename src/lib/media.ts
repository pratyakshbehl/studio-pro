/**
 * Project media paths are stored the way the site uses them:
 *   "/images/…", "/videos/…"  → the site's public folder (served here at /site/…)
 *   "/media/…"                 → Studio Pro's own uploads
 * Only the host decides how to reach them; the stored path never changes.
 */
export function mediaUrl(src: string | undefined | null): string {
  if (!src) return "";
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  if (src.startsWith("/media/") || src.startsWith("/site/")) return src;
  return `/site${src.startsWith("/") ? "" : "/"}${src}`;
}

/** The site stores accents as an HSL triple ("230 75% 55%"); hex also works. */
export function accentCss(accent: string | undefined): string | undefined {
  if (!accent) return undefined;
  return accent.trim().startsWith("#") ? accent : `hsl(${accent})`;
}

export function fileName(src: string): string {
  return decodeURIComponent(src.split("/").pop() ?? src);
}
