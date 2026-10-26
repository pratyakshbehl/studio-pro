/**
 * Paste a link (or an <iframe> snippet) and get something embeddable.
 * `aspect` keeps video-like players in shape; `height` fixes players that are
 * a strip (Spotify, SoundCloud). Unknown https links fall back to a 16:9 frame.
 */
export interface EmbedInfo {
  provider: string;
  src: string;
  aspect?: number;
  height?: number;
  /** For the inspector: what kind of thing this is. */
  kind: "video" | "audio" | "3d" | "design" | "code" | "social" | "motion" | "page";
}

function fromIframe(raw: string): string {
  const m = /<iframe[^>]+src=["']([^"']+)["']/i.exec(raw);
  return m ? m[1] : raw;
}

export function detectEmbed(input: string): EmbedInfo | null {
  const raw = fromIframe(input.trim());
  if (!raw) return null;
  // Another scheme (ftp:, data:, javascript:…) is never embeddable; a bare "example.com/x" gets https.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname;
  let m: RegExpExecArray | null;

  // YouTube: watch, share, shorts, live, embed, and YouTube Music
  if (/(^|\.)youtube\.com$|^youtu\.be$|^music\.youtube\.com$|^youtube-nocookie\.com$/.test(host)) {
    const id =
      url.searchParams.get("v") ??
      /^\/(?:embed|shorts|live)\/([\w-]{6,})/.exec(path)?.[1] ??
      (host === "youtu.be" ? path.slice(1).split("/")[0] : null);
    if (id) return { provider: "YouTube", src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, aspect: 16 / 9, kind: "video" };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    m = /\/(?:video\/)?(\d+)/.exec(path);
    if (m) return { provider: "Vimeo", src: `https://player.vimeo.com/video/${m[1]}?dnt=1`, aspect: 16 / 9, kind: "video" };
  }
  if (host === "open.spotify.com") {
    m = /^\/(?:embed\/)?(?:intl-[\w-]+\/)?(track|album|playlist|episode|show|artist)\/(\w+)/.exec(path);
    if (m)
      return {
        provider: "Spotify",
        src: `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0`,
        height: m[1] === "track" || m[1] === "episode" ? 152 : 352,
        kind: "audio",
      };
  }
  if (host === "soundcloud.com" || host === "on.soundcloud.com" || host === "w.soundcloud.com") {
    const target = host === "w.soundcloud.com" ? (url.searchParams.get("url") ?? raw) : raw;
    const isSet = /\/sets\//.test(target);
    return {
      provider: "SoundCloud",
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(target)}&color=%23f0552a&visual=${isSet ? "false" : "true"}`,
      height: isSet ? 450 : 300,
      kind: "audio",
    };
  }
  if (host === "podcasts.apple.com" || host === "embed.podcasts.apple.com") {
    const episode = url.searchParams.has("i");
    return { provider: "Apple Podcasts", src: `https://embed.podcasts.apple.com${path}${url.search}`, height: episode ? 175 : 450, kind: "audio" };
  }
  if (host === "bandcamp.com" && /^\/EmbeddedPlayer\//.test(path)) {
    return { provider: "Bandcamp", src: url.href, height: /\/track=/.test(path) ? 120 : 470, kind: "audio" };
  }
  if (host === "mixcloud.com" || host === "player-widget.mixcloud.com") {
    const feed = host === "mixcloud.com" ? path : (url.searchParams.get("feed") ?? "");
    if (feed && feed !== "/") return { provider: "Mixcloud", src: `https://player-widget.mixcloud.com/widget/iframe/?hide_cover=1&feed=${encodeURIComponent(feed)}`, height: 180, kind: "audio" };
  }
  if (host === "audiomack.com") {
    m = /^\/([\w-]+)\/(song|album|playlist)\/([\w-]+)/.exec(path);
    if (m) return { provider: "Audiomack", src: `https://audiomack.com/embed/${m[1]}/${m[2]}/${m[3]}`, height: m[2] === "song" ? 252 : 400, kind: "audio" };
  }
  if (host === "lottie.host" || host === "lottiefiles.com" || host === "app.lottiefiles.com") {
    // Only lottie.host embed links can be framed; LottieFiles pages need the JSON instead.
    m = /^\/embed\/([\w-]+)\/([\w-]+)\.(?:json|lottie)/.exec(path);
    if (host === "lottie.host" && m) return { provider: "LottieFiles", src: url.href, aspect: 1, kind: "motion" };
    if (host === "lottie.host" && /\.(json|lottie)$/.test(path)) return { provider: "LottieFiles", src: `https://lottie.host/embed${path}`, aspect: 1, kind: "motion" };
  }
  if (host === "loom.com") {
    m = /^\/(?:share|embed)\/([0-9a-f]{32})/.exec(path);
    if (m) return { provider: "Loom", src: `https://www.loom.com/embed/${m[1]}?hide_owner=true&hide_share=true`, aspect: 16 / 9, kind: "video" };
  }
  if (host === "music.apple.com" || host === "embed.music.apple.com") {
    const song = url.searchParams.has("i") || /\/song\//.test(path);
    return { provider: "Apple Music", src: `https://embed.music.apple.com${path}${url.search}`, height: song ? 175 : 450, kind: "audio" };
  }
  if (host === "sketchfab.com") {
    m = /([0-9a-f]{32})/.exec(path);
    if (m) return { provider: "Sketchfab", src: `https://sketchfab.com/models/${m[1]}/embed?ui_theme=dark&dnt=1`, aspect: 16 / 9, kind: "3d" };
  }
  if (host === "figma.com" || host === "embed.figma.com") {
    return {
      provider: "Figma",
      src: host === "embed.figma.com" ? raw : `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(raw)}`,
      aspect: 16 / 9,
      kind: "design",
    };
  }
  if (host === "codepen.io") {
    m = /^\/([\w-]+)\/(?:pen|embed|full)\/(\w+)/.exec(path);
    if (m) return { provider: "CodePen", src: `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result&theme-id=dark`, height: 480, kind: "code" };
  }
  if (host === "behance.net") {
    m = /\/(?:gallery|embed\/project)\/(\d+)/.exec(path);
    if (m) return { provider: "Behance", src: `https://www.behance.net/embed/project/${m[1]}?ilo0=1`, aspect: 404 / 316, kind: "design" };
  }
  if (host === "instagram.com") {
    m = /^\/(p|reel|tv)\/([\w-]+)/.exec(path);
    if (m) return { provider: "Instagram", src: `https://www.instagram.com/${m[1]}/${m[2]}/embed`, aspect: 4 / 5, kind: "social" };
  }
  if (host === "dribbble.com") return { provider: "Dribbble", src: raw, aspect: 4 / 3, kind: "design" };
  return url.protocol === "https:" ? { provider: host, src: url.href, aspect: 16 / 9, kind: "page" } : null;
}
