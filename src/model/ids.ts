const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** 10-char random id. Works in the browser and in Node 24 (global crypto). */
export function uid(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** `base`, or `base-2`, `base-3`… whichever isn't taken. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = base || "untitled";
  if (!used.has(root)) return root;
  let n = 2;
  while (used.has(`${root}-${n}`)) n++;
  return `${root}-${n}`;
}
