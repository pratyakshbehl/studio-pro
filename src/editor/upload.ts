import type { Media } from "../model/index.ts";

export type UploadKind = "image" | "video" | "audio" | "model" | "lottie";

export function kindOfFile(file: File): UploadKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg", "png", "webp", "avif", "gif", "svg"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "ogg", "flac", "aac"].includes(ext)) return "audio";
  if (["glb", "gltf"].includes(ext)) return "model";
  if (ext === "json") return "lottie";
  return null;
}

/** Pixel size, read locally before upload so blocks can reserve the right shape. */
async function dimensions(file: File, kind: UploadKind): Promise<{ width?: number; height?: number }> {
  try {
    if (kind === "image" && !file.type.includes("svg")) {
      const bmp = await createImageBitmap(file);
      const out = { width: bmp.width, height: bmp.height };
      bmp.close();
      return out;
    }
    if (kind === "video") {
      const url = URL.createObjectURL(file);
      try {
        return await new Promise((resolve) => {
          const v = document.createElement("video");
          v.preload = "metadata";
          v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight });
          v.onerror = () => resolve({});
          v.src = url;
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } catch {
    /* unknown size is fine; the block uses the file's natural shape */
  }
  return {};
}

/** The longest side a picture keeps on the page; bigger ones are resized (the original is kept). */
export const MAX_SIDE = 2880;
/** Smaller copies for phones and grids, used through srcset. */
export const THUMBS = [480, 960, 1600] as const;
const RASTER = /^image\/(jpeg|png|webp|avif)$/;

function post(file: Blob, query: string, onProgress?: (f: number) => void): Promise<{ src: string; type: UploadKind }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/media?${query}`);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body: { src?: string; type?: UploadKind; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* fall through to the status check */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.src && body.type) resolve({ src: body.src, type: body.type });
      else reject(new Error(body.error ?? `The upload didn't go through (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Can't reach Studio Pro's server. Is its window still open?"));
    xhr.send(file);
  });
}

/** A smaller WebP copy of a decoded image, at most `side` px wide or tall. */
async function resized(bmp: ImageBitmap, side: number, quality: number): Promise<Blob> {
  const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const g = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!g) throw new Error("This browser can't resize images");
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, w, h);
  if (canvas instanceof HTMLCanvasElement) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", quality));
    if (!blob) throw new Error("Couldn't resize the image");
    return blob;
  }
  return canvas.convertToBlob({ type: "image/webp", quality });
}

const stem = (name: string) => name.replace(/\.[^.]+$/, "");

/**
 * Uploads one file to /api/media and returns it as project Media.
 * - Images bigger than 2880px go up as a 2880px WebP; the full-size original
 *   is kept in media/originals.
 * - Every photo gets 480/960/1600px WebP copies for srcset.
 * - Videos get a poster frame from the first second.
 * The extras are recorded in the file's notes, so picking it from the library
 * later brings them along.
 */
export async function uploadFile(file: File, onProgress?: (fraction: number) => void): Promise<Media> {
  const kind = kindOfFile(file);
  if (!kind) throw new Error(`${file.name}: Studio Pro can't use this kind of file.`);

  let bmp: ImageBitmap | null = null;
  if (kind === "image" && RASTER.test(file.type)) bmp = await createImageBitmap(file).catch(() => null);
  const big = !!bmp && Math.max(bmp.width, bmp.height) > MAX_SIDE;
  const main: Blob = big ? await resized(bmp!, MAX_SIDE, 0.9) : file;
  const mainName = big ? `${stem(file.name)}.webp` : file.name;
  const size = bmp ? (big ? { width: Math.round(bmp.width * (MAX_SIDE / Math.max(bmp.width, bmp.height))), height: Math.round(bmp.height * (MAX_SIDE / Math.max(bmp.width, bmp.height))) } : { width: bmp.width, height: bmp.height }) : await dimensions(file, kind);

  const result = await post(main, `name=${encodeURIComponent(mainName)}`, onProgress).catch((e: Error) => {
    throw new Error(`${file.name}: ${e.message}`);
  });
  const media: Media = { src: result.src, type: result.type, alt: "", ...size };
  const extra: Promise<unknown>[] = [];
  const forMain = `for=${encodeURIComponent(result.src)}`;

  if (big) extra.push(post(file, `name=${encodeURIComponent(file.name)}&${forMain}&role=original`));
  if (bmp) {
    const width = size.width ?? bmp.width;
    for (const w of THUMBS.filter((t) => t < width)) {
      extra.push(
        resized(bmp, (w / width) * Math.max(size.width ?? 0, size.height ?? 0), 0.82)
          .then((blob) => post(blob, `name=${encodeURIComponent(`${stem(file.name)}.webp`)}&${forMain}&role=w${w}`))
          .then((r) => ((media.variants ??= []).push({ w, src: r.src }), r)),
      );
    }
  }
  if (kind === "video") {
    extra.push(
      import("../lib/colors.ts")
        .then(({ videoFrame }) => videoFrame(file, 1, `${stem(file.name)}-poster.jpg`))
        .then((poster) => post(poster, `name=${encodeURIComponent(poster.name)}&${forMain}&role=poster`))
        .then((r) => (media.poster = r.src)),
    );
  }
  // The extras are a bonus: if one fails, the upload itself still stands.
  await Promise.allSettled(extra);
  bmp?.close();
  media.variants?.sort((a, b) => a.w - b.w);
  if (media.variants || media.poster) {
    void fetch("/api/media/meta", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ src: media.src, patch: { variants: media.variants, poster: media.poster } }),
    }).catch(() => undefined);
  }
  // Alt text is left for a person to write; file names make poor descriptions.
  return media;
}
