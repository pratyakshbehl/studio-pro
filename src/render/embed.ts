/** YouTube / Vimeo page or share link → privacy-friendly embed URL, or "" if unknown. */
export function videoEmbedUrl(raw = ""): string {
  const yt = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/.exec(raw);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`;
  const vm = /vimeo\.com\/(?:video\/)?(\d+)/.exec(raw);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?dnt=1`;
  return "";
}
