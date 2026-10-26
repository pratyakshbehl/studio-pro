/**
 * Listening to a track in the browser: tempo and key, good enough to label a
 * library (and always editable). Tempo comes from how loudness rises frame to
 * frame (an onset envelope) and which beat spacing repeats most; key from how
 * much energy lands on each of the 12 notes, compared with the classic
 * Krumhansl major and minor profiles.
 */

export const KEYS = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"] as const;
export const KEY_NAMES = [...KEYS.map((k) => `${k} major`), ...KEYS.map((k) => `${k} minor`)];

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** Mono samples at roughly 11 kHz: plenty for tempo and pitch, and quick to scan. */
async function decodeMono(url: string): Promise<{ data: Float32Array; rate: number; duration: number }> {
  const buf = await (await fetch(url)).arrayBuffer();
  const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(buf);
  const step = Math.max(1, Math.round(audio.sampleRate / 11025));
  const rate = audio.sampleRate / step;
  const n = Math.floor(audio.length / step);
  const data = new Float32Array(n);
  const chans = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const ch of chans) v += ch[i * step];
    data[i] = v / chans.length;
  }
  return { data, rate, duration: audio.duration };
}

/** Beats per minute from the onset envelope's strongest repeat, folded into 70–170. */
export function detectBpm(data: Float32Array, rate: number): number | null {
  const hop = 256;
  const frames = Math.floor(data.length / hop);
  if (frames < 64) return null;
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) e += data[i] * data[i];
    energy[f] = Math.sqrt(e / hop);
  }
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) onset[f] = Math.max(0, energy[f] - energy[f - 1]);
  const fps = rate / hop;
  const minLag = Math.floor((60 / 200) * fps);
  const maxLag = Math.ceil((60 / 60) * fps);
  let best = 0;
  let bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let ac = 0;
    for (let f = lag; f < frames; f++) ac += onset[f] * onset[f - lag];
    if (ac > best) (best = ac), (bestLag = lag);
  }
  if (!bestLag) return null;
  let bpm = (60 * fps) / bestLag;
  while (bpm < 70) bpm *= 2;
  while (bpm > 170) bpm /= 2;
  return Math.round(bpm);
}

/** Energy on each of the 12 notes (C2–B5), via Goertzel filters on windows across the track. */
export function chroma(data: Float32Array, rate: number): number[] {
  const out = new Array(12).fill(0);
  const win = 4096;
  const windows = Math.min(120, Math.floor(data.length / win));
  const stride = Math.floor(data.length / Math.max(1, windows));
  for (let w = 0; w < windows; w++) {
    const start = w * stride;
    for (let midi = 36; midi < 84; midi++) {
      const freq = 440 * 2 ** ((midi - 69) / 12);
      const coeff = 2 * Math.cos((2 * Math.PI * freq) / rate);
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < win; i++) {
        const s0 = data[start + i] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      out[midi % 12] += Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2));
    }
  }
  return out;
}

function correlate(a: number[], b: number[]) {
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db || 1);
}

/** The key whose profile best matches the chroma, e.g. "A minor". */
export function detectKey(c: number[]): string | null {
  if (c.every((v) => v === 0)) return null;
  let best = -Infinity;
  let name: string | null = null;
  for (let tonic = 0; tonic < 12; tonic++) {
    const rot = c.map((_, i) => c[(i + tonic) % 12]);
    const maj = correlate(rot, MAJOR);
    const min = correlate(rot, MINOR);
    if (maj > best) (best = maj), (name = `${KEYS[tonic]} major`);
    if (min > best) (best = min), (name = `${KEYS[tonic]} minor`);
  }
  return name;
}

export async function analyzeAudio(url: string): Promise<{ bpm: number | null; key: string | null; duration: number }> {
  const { data, rate, duration } = await decodeMono(url);
  return { bpm: detectBpm(data, rate), key: detectKey(chroma(data, rate)), duration };
}
