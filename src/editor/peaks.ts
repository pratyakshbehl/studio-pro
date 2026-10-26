import { blockUpdate, findBlock, type Media } from "../model/index.ts";
import { mediaUrl } from "../lib/media.ts";
import { doc, run } from "./store.ts";

/** How many bars a waveform has: enough for detail, small enough to store in the page. */
export const BARS = 120;

const cache = new Map<string, Promise<{ peaks: number[]; duration: number }>>();

/**
 * Decode a track once and boil it down to `BARS` loudness values (0–1) and its
 * length. Done in Studio, so the site draws the waveform without decoding audio.
 */
export function measureAudio(src: string): Promise<{ peaks: number[]; duration: number }> {
  let job = cache.get(src);
  if (!job) {
    job = (async () => {
      const buf = await (await fetch(mediaUrl(src))).arrayBuffer();
      const ctx = new OfflineAudioContext(1, 1, 44100);
      const audio = await ctx.decodeAudioData(buf);
      const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
      const size = Math.floor(audio.length / BARS) || 1;
      const raw: number[] = [];
      for (let b = 0; b < BARS; b++) {
        let peak = 0;
        // Every 8th sample is plenty for a bar's loudest point.
        for (let i = b * size; i < Math.min(audio.length, (b + 1) * size); i += 8)
          for (const ch of channels) peak = Math.max(peak, Math.abs(ch[i]));
        raw.push(peak);
      }
      const max = Math.max(...raw, 0.0001);
      // A gentle curve so quiet passages still read.
      const peaks = raw.map((v) => Math.round(Math.sqrt(v / max) * 100) / 100);
      return { peaks, duration: Math.round(audio.duration * 10) / 10 };
    })();
    cache.set(src, job);
    job.catch(() => cache.delete(src));
  }
  return job;
}

/** Measure an audio block's track (or one tracklist track) and store the result, if it still has that track. */
export async function measureInto(blockId: string, media: Media, trackIndex?: number) {
  try {
    const { peaks, duration } = await measureAudio(media.src);
    const hit = findBlock(doc(), blockId);
    if (!hit) return;
    const b = hit.block;
    if (b.type === "audio" && b.media?.src === media.src) run(blockUpdate, { id: blockId, patch: { peaks, duration } });
    if (b.type === "tracklist" && trackIndex !== undefined && b.tracks[trackIndex]?.media?.src === media.src) {
      const tracks = b.tracks.map((t, i) => (i === trackIndex ? { ...t, peaks, duration } : t));
      run(blockUpdate, { id: blockId, patch: { tracks } });
    }
  } catch {
    /* an unreadable file just keeps the plain waveform */
  }
}
