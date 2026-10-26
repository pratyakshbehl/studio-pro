import { describe, expect, it } from "vitest";
import { newBlock, newSection } from "../../src/model/index.ts";
import { hiddenAt, responsiveVars } from "../../src/render/responsive.ts";
import { plainText, sanitizeHtml, textToHtml } from "../../src/render/sanitize.ts";
import { videoEmbedUrl } from "../../src/render/embed.ts";

describe("responsiveVars", () => {
  it("writes only the values that change per breakpoint", () => {
    const g = newBlock("gallery", { columns: 3, gap: 24 });
    g.overrides = { tablet: { columns: 2 }, phone: { columns: 1, gap: 12 } };
    expect(responsiveVars(g, (b) => ({ cols: b.columns, gap: b.gap }))).toEqual({
      "--cols": "3",
      "--cols-t": "2",
      "--cols-p": "1",
      "--gap": "24",
      "--gap-p": "12",
    });
  });

  it("skips undefined values and is a no-op without overrides", () => {
    const b = newBlock("image");
    expect(responsiveVars(b, (x) => ({ op: x.style?.opacity, isw: 0 }))).toEqual({ "--isw": "0" });
  });
});

describe("hiddenAt", () => {
  it("lists the breakpoints a node is hidden at, following the cascade", () => {
    const s = newSection("flow");
    expect(hiddenAt(s)).toBeUndefined();
    s.overrides = { tablet: { hidden: true } };
    expect(hiddenAt(s)).toBe("t p");
    s.overrides = { tablet: { hidden: true }, phone: { hidden: false } };
    expect(hiddenAt(s)).toBe("t");
  });
});

describe("sanitizeHtml", () => {
  it("keeps prose markup and drops everything else", () => {
    const dirty =
      '<p class="x" style="color:red" onclick="steal()">Hi <strong>there</strong><script>alert(1)</script></p>' +
      '<a href="javascript:alert(1)">bad</a><a href="https://example.com" target="_blank">good</a><img src=x onerror=alert(1)>';
    expect(sanitizeHtml(dirty)).toBe(
      '<p>Hi <strong>there</strong></p><a rel="noopener noreferrer">bad</a><a href="https://example.com" rel="noopener noreferrer">good</a>',
    );
  });

  it("round-trips plain text with paragraphs and line breaks", () => {
    const html = textToHtml("First <para>\nsame para\n\nSecond & last");
    expect(html).toBe("<p>First &lt;para&gt;<br>same para</p><p>Second &amp; last</p>");
    expect(plainText(html)).toBe("First <para>\nsame para\nSecond & last");
  });
});

describe("videoEmbedUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"],
    ["https://youtu.be/dQw4w9WgXcQ?t=3", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"],
    ["https://youtube.com/shorts/abcdEFGH123", "https://www.youtube-nocookie.com/embed/abcdEFGH123?rel=0"],
    ["https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
    ["https://example.com/video.mp4", ""],
  ])("%s", (url, out) => expect(videoEmbedUrl(url)).toBe(out));
});
