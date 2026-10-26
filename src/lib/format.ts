const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const STATUS_LABEL = { draft: "Draft", live: "Live", unlisted: "Unlisted", archived: "Archived" } as const;
