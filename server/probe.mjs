import { open, stat } from "node:fs/promises";

/**
 * Pixel size of an image from its header bytes: JPEG, PNG, GIF, WebP.
 * Photo grids and bento crops need every image's shape, and the site's own
 * images were stored without sizes. Reads at most 256 KB per file; cached by
 * path + modified time.
 */
const cache = new Map();

export async function imageSize(path) {
  let info;
  try {
    info = await stat(path);
  } catch {
    return null;
  }
  const key = `${path}:${info.mtimeMs}`;
  if (cache.has(key)) return cache.get(key);
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(Math.min(262144, info.size));
    await fh.read(buf, 0, buf.length, 0);
    const size = parse(buf);
    cache.set(key, size);
    return size;
  } finally {
    await fh.close();
  }
}

export function parse(b) {
  if (b.length < 24) return null;
  // PNG: IHDR right after the signature
  if (b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  // GIF
  if (b.toString("ascii", 0, 3) === "GIF") return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  // WebP
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    return null;
  }
  // JPEG: walk segments to the first frame header; honour EXIF rotation.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    let rotated = false;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker === 0xe1 && b.toString("ascii", i + 4, i + 8) === "Exif") rotated = exifRotated(b, i + 10);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = b.readUInt16BE(i + 5);
        const width = b.readUInt16BE(i + 7);
        return rotated ? { width: height, height: width } : { width, height };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** True when EXIF orientation is 5–8 (the camera stored the image sideways). */
function exifRotated(b, tiff) {
  try {
    const le = b.toString("ascii", tiff, tiff + 2) === "II";
    const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
    const u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
    const ifd = tiff + u32(tiff + 4);
    const n = u16(ifd);
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12;
      if (u16(e) === 0x0112) return u16(e + 8) >= 5;
    }
  } catch {
    /* malformed EXIF: treat as upright */
  }
  return false;
}
