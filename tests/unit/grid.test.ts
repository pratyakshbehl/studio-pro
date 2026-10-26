import { describe, expect, it } from "vitest";
import {
  BENTO_PRESETS,
  bentoFromPreset,
  bentoProblems,
  cellAspect,
  detectEmbed,
  migrateProject,
  newProject,
  newSection,
  newBlock,
  presetsFor,
} from "../../src/model/index.ts";
// @ts-expect-error: plain .mjs server module, no types
import { parse } from "../../server/probe.mjs";

describe("bento presets", () => {
  it.each(BENTO_PRESETS.map((p) => [p.id, p] as const))("%s fills its grid with no gaps or overlaps", (_, p) => {
    const layout = bentoFromPreset(p.id);
    expect(bentoProblems(layout)).toEqual([]);
    expect(layout.cells).toHaveLength(p.count);
    const area = layout.cells.reduce((n, c) => n + c.cs * c.rs, 0);
    expect(area).toBe(layout.cols.length * layout.rows.length);
  });

  it("offers at least two layouts for 2 to 6 images", () => {
    for (let n = 2; n <= 6; n++) expect(presetsFor(n).length).toBeGreaterThanOrEqual(2);
  });

  it("computes cell shapes from track weights and the grid's aspect", () => {
    const b = bentoFromPreset("big-left");
    // Big cell spans both rows of an equal 2×2 at 1.56: 0.5 wide × 1 tall × 1.56
    expect(cellAspect(b, 0)).toBeCloseTo(0.78);
    expect(cellAspect(b, 1)).toBeCloseTo(1.56);
  });

  it("flags cells outside the grid and overlaps", () => {
    const b = bentoFromPreset("split");
    b.cells.push({ c: 1, r: 0, cs: 2, rs: 1 });
    expect(bentoProblems(b).join(" ")).toMatch(/outside|overlaps/);
  });
});

describe("detectEmbed", () => {
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ", "YouTube", 16 / 9],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ", "YouTube", 16 / 9],
    ["https://vimeo.com/76979871", "Vimeo", 16 / 9],
    ["https://sketchfab.com/3d-models/old-car-0123456789abcdef0123456789abcdef", "Sketchfab", 16 / 9],
    ["https://www.figma.com/design/abc123/My-File", "Figma", 16 / 9],
    ["https://www.behance.net/gallery/123456789/Some-Project", "Behance", 404 / 316],
    ["https://www.instagram.com/p/CxYz123/", "Instagram", 4 / 5],
  ])("%s → %s", (url, provider, aspect) => {
    const info = detectEmbed(url)!;
    expect(info.provider).toBe(provider);
    expect(info.aspect).toBeCloseTo(aspect);
  });

  it("gives audio players a fixed height", () => {
    expect(detectEmbed("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")).toMatchObject({
      provider: "Spotify",
      height: 152,
      src: expect.stringContaining("/embed/track/4uLU6hMCjMI75M1A2tKUQC"),
    });
    expect(detectEmbed("https://open.spotify.com/intl-de/album/1DFixLWuPkv3KT3TnV35m3")?.height).toBe(352);
    expect(detectEmbed("https://soundcloud.com/artist/track")).toMatchObject({ provider: "SoundCloud", height: 300 });
    expect(detectEmbed("https://music.apple.com/in/album/x/123?i=456")).toMatchObject({ provider: "Apple Music", height: 175 });
  });

  it("reads the src out of pasted iframe code and rejects non-links", () => {
    expect(detectEmbed('<iframe width="560" src="https://www.youtube.com/embed/abcdefgh"></iframe>')?.provider).toBe("YouTube");
    expect(detectEmbed("javascript:alert(1)")).toBeNull();
    expect(detectEmbed("")).toBeNull();
  });
});

describe("detectEmbed: the full table", () => {
  // [pasted link, provider, kind, aspect or height]
  const table: [string, string, string, { aspect?: number; height?: number }][] = [
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "YouTube", "video", { aspect: 16 / 9 }],
    ["https://youtube.com/shorts/abcdefghijk", "YouTube", "video", { aspect: 16 / 9 }],
    ["https://www.youtube.com/live/abcdefghijk", "YouTube", "video", { aspect: 16 / 9 }],
    ["https://www.youtube-nocookie.com/embed/abcdefghijk", "YouTube", "video", { aspect: 16 / 9 }],
    ["youtu.be/dQw4w9WgXcQ?t=42", "YouTube", "video", { aspect: 16 / 9 }],
    ["https://music.youtube.com/watch?v=abcdefghijk&list=RD", "YouTube", "video", { aspect: 16 / 9 }],
    ["https://player.vimeo.com/video/76979871?h=abc", "Vimeo", "video", { aspect: 16 / 9 }],
    ["https://vimeo.com/channels/staffpicks/76979871", "Vimeo", "video", { aspect: 16 / 9 }],
    ["https://www.loom.com/share/0123456789abcdef0123456789abcdef", "Loom", "video", { aspect: 16 / 9 }],
    ["https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x", "Spotify", "audio", { height: 152 }],
    ["https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3", "Spotify", "audio", { height: 352 }],
    ["https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", "Spotify", "audio", { height: 352 }],
    ["https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5", "Spotify", "audio", { height: 152 }],
    ["https://open.spotify.com/show/2MAi0BvDc6GTFvKFPXnkCL", "Spotify", "audio", { height: 352 }],
    ["https://open.spotify.com/artist/0OdUWJ0sBjDrqHygGUXeCF", "Spotify", "audio", { height: 352 }],
    ["https://soundcloud.com/artist/sets/an-ep", "SoundCloud", "audio", { height: 450 }],
    ["https://on.soundcloud.com/AbCdEf", "SoundCloud", "audio", { height: 300 }],
    ["https://music.apple.com/in/album/some-album/1440857781", "Apple Music", "audio", { height: 450 }],
    ["https://music.apple.com/us/playlist/x/pl.u-abc", "Apple Music", "audio", { height: 450 }],
    ["https://podcasts.apple.com/us/podcast/the-show/id1200361736", "Apple Podcasts", "audio", { height: 450 }],
    ["https://podcasts.apple.com/us/podcast/the-show/id1200361736?i=1000600000000", "Apple Podcasts", "audio", { height: 175 }],
    ["https://bandcamp.com/EmbeddedPlayer/album=123456/size=large/", "Bandcamp", "audio", { height: 470 }],
    ["https://bandcamp.com/EmbeddedPlayer/track=987654/size=small/", "Bandcamp", "audio", { height: 120 }],
    ["https://www.mixcloud.com/someone/a-mix/", "Mixcloud", "audio", { height: 180 }],
    ["https://audiomack.com/artist/song/a-song", "Audiomack", "audio", { height: 252 }],
    ["https://audiomack.com/artist/album/an-album", "Audiomack", "audio", { height: 400 }],
    ["https://sketchfab.com/models/0123456789abcdef0123456789abcdef/embed", "Sketchfab", "3d", { aspect: 16 / 9 }],
    ["https://lottie.host/embed/abc-123/xyz.json", "LottieFiles", "motion", { aspect: 1 }],
    ["https://lottie.host/abc-123/xyz.json", "LottieFiles", "motion", { aspect: 1 }],
    ["https://www.figma.com/proto/abc123/Flow?node-id=1", "Figma", "design", { aspect: 16 / 9 }],
    ["https://embed.figma.com/design/abc123/File", "Figma", "design", { aspect: 16 / 9 }],
    ["https://codepen.io/someone/pen/abcXYZ", "CodePen", "code", { height: 480 }],
    ["https://www.behance.net/embed/project/123456789", "Behance", "design", { aspect: 404 / 316 }],
    ["https://www.instagram.com/reel/CxYz123/", "Instagram", "social", { aspect: 4 / 5 }],
    ["https://dribbble.com/shots/123-thing", "Dribbble", "design", { aspect: 4 / 3 }],
    ["https://example.com/some/page", "example.com", "page", { aspect: 16 / 9 }],
  ];
  it.each(table)("%s → %s", (input, provider, kind, size) => {
    const info = detectEmbed(input)!;
    expect(info).not.toBeNull();
    expect(info.provider).toBe(provider);
    expect(info.kind).toBe(kind);
    if (size.aspect) expect(info.aspect).toBeCloseTo(size.aspect);
    if (size.height) expect(info.height).toBe(size.height);
    expect(info.src.startsWith("https://")).toBe(true);
  });

  it("refuses links that can't be framed safely", () => {
    expect(detectEmbed("http://example.com/insecure")).toBeNull();
    expect(detectEmbed("ftp://example.com/x")).toBeNull();
    expect(detectEmbed("data:text/html,hi")).toBeNull();
    expect(detectEmbed("   ")).toBeNull();
  });
});

describe("image size probe", () => {
  it("reads PNG, GIF, WebP and JPEG headers", () => {
    const png = Buffer.alloc(32);
    png.writeUInt32BE(0x89504e47, 0);
    png.writeUInt32BE(1920, 16);
    png.writeUInt32BE(1080, 20);
    expect(parse(png)).toEqual({ width: 1920, height: 1080 });

    const gif = Buffer.alloc(32);
    gif.write("GIF89a", 0, "ascii");
    gif.writeUInt16LE(400, 6);
    gif.writeUInt16LE(300, 8);
    expect(parse(gif)).toEqual({ width: 400, height: 300 });

    const webp = Buffer.alloc(40);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBP", 8, "ascii");
    webp.write("VP8X", 12, "ascii");
    webp.writeUIntLE(2160 - 1, 24, 3);
    webp.writeUIntLE(2700 - 1, 27, 3);
    expect(parse(webp)).toEqual({ width: 2160, height: 2700 });

    // Minimal JPEG: SOI, an APP0 segment, then SOF0 with 1080×1920.
    const jpg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x38, 0x07, 0x80, 0x03, 0x01, 0x22, 0x00,
      0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ]);
    expect(parse(jpg)).toEqual({ width: 1920, height: 1080 });
  });
});

describe("schema v3 migration", () => {
  it("gives existing galleries a photo-grid row height and keeps their mode", () => {
    const p = newProject();
    const s = newSection("flow");
    const g = newBlock("gallery", { mode: "grid" }) as unknown as Record<string, unknown>;
    delete g.rowHeight;
    s.blocks.push(g as never);
    p.page.sections.push(s);
    const v2 = { ...structuredClone(p), schemaVersion: 2 };
    const up = migrateProject(v2);
    const gallery = up.page.sections[0].blocks[0];
    expect(up.schemaVersion).toBe(3);
    expect(gallery).toMatchObject({ type: "gallery", mode: "grid", rowHeight: 300 });
  });
});
