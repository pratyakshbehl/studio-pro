/**
 * Picks accent candidates from an image: a few rounds of k-means over a small
 * copy, then the clusters ranked by how vivid and how common they are. Greys
 * and near-blacks sink, because an accent should be a colour.
 */
export async function sampleColors(url: string, count = 5): Promise<string[]> {
  const img = await loadImage(url);
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = Math.max(1, Math.round((size * img.naturalHeight) / img.naturalWidth));
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return [];
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const px: [number, number, number][] = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) px.push([data[i], data[i + 1], data[i + 2]]);
  if (!px.length) return [];

  const k = Math.min(8, px.length);
  let centres = Array.from({ length: k }, (_, i) => px[Math.floor((i * px.length) / k)]);
  let groups: [number, number, number][][] = [];
  for (let round = 0; round < 8; round++) {
    groups = centres.map(() => []);
    for (const p of px) {
      let best = 0;
      let bestD = Infinity;
      centres.forEach((c, i) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestD) (bestD = d), (best = i);
      });
      groups[best].push(p);
    }
    centres = groups.map((grp, i) => (grp.length ? (grp.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((v) => v / grp.length) as [number, number, number]) : centres[i]));
  }
  return centres
    .map((c, i) => ({ c, n: groups[i].length, s: vividness(c) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.s * Math.sqrt(b.n) - a.s * Math.sqrt(a.n))
    .slice(0, count)
    .map((x) => toHex(x.c));
}

function vividness([r, g, b]: [number, number, number]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max ? (max - min) / max : 0;
  const light = max / 255;
  // Saturated and not too dark or blown out.
  return sat * (0.3 + light) * (light > 0.12 ? 1 : 0.2);
}

const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image"));
    img.src = url;
  });
}

/** A still from a video (at `at` seconds, or the middle of short clips) as a JPEG file. */
export async function videoFrame(src: string | File, at = 1, name = "poster.jpg"): Promise<File> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    v.src = url;
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve();
      v.onerror = () => reject(new Error("Couldn't read that video"));
    });
    v.currentTime = Math.min(at, (v.duration || 2) / 2);
    await new Promise<void>((resolve) => (v.onseeked = () => resolve()));
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.88));
    if (!blob) throw new Error("Couldn't make a poster");
    return new File([blob], name, { type: "image/jpeg" });
  } finally {
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
}
