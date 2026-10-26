/**
 * Allow-list HTML cleaner for text blocks. Runs anywhere (no DOM needed), so
 * the site can use it during server rendering too. Content is the owner's own
 * writing, but pasted HTML from Docs/Notion carries styles, classes and the
 * occasional script that must never reach the page.
 */
const ALLOWED: Record<string, string[]> = {
  p: [],
  br: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  u: [],
  s: [],
  a: ["href"],
  ul: [],
  ol: [],
  li: [],
  blockquote: [],
  mark: [],
  h2: [],
  h3: [],
  h4: [],
  sub: [],
  sup: [],
  code: [],
};

const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#)/i;

function escapeAttr(v: string) {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function sanitizeHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|template|noscript)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, rawTag: string, attrs: string) => {
      const tag = rawTag.toLowerCase();
      const allowed = ALLOWED[tag];
      if (!allowed) return "";
      if (match.startsWith("</")) return `</${tag}>`;
      let out = `<${tag}`;
      for (const name of allowed) {
        const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);
        const value = m ? (m[2] ?? m[3] ?? m[4] ?? "") : "";
        if (!value) continue;
        if (name === "href" && !SAFE_HREF.test(value.trim())) continue;
        out += ` ${name}="${escapeAttr(value)}"`;
      }
      if (tag === "a") out += ' rel="noopener noreferrer"';
      return out + ">";
    });
}

export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h2|h3|h4|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Plain text (blank line = new paragraph) → paragraphs of escaped HTML. */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${esc(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
