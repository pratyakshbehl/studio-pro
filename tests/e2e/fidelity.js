/**
 * Fidelity check: the same project in Studio's Preview and on the real site
 * (next dev), compared block by block at 1440, 834 and 390. Every story block
 * must sit within 1px of where Studio puts it.
 *
 * Run with playwright-cli against a site that has the renderer synced and the
 * project published (test against a scratch copy of the site):
 *   playwright-cli -s=qa open http://localhost:4800/
 *   playwright-cli -s=qa run-code "$(sed 's#__ID__#<project id>#; s#__SLUG__#<slug>#' tests/e2e/fidelity.js)"
 * Edit STUDIO and SITE below if they run elsewhere.
 */
async (page) => {
  const STUDIO = "http://localhost:4800";
  const SITE = "http://localhost:3048";
  const ID = "__ID__";
  const SLUG = "__SLUG__";
  
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  // Story blocks relative to the first section: what must match between Studio and the site.
  const measure = () =>
    page.evaluate(() => {
      const first = document.querySelector(".sp-section");
      if (!first) return null;
      const o = first.getBoundingClientRect();
      return [...document.querySelectorAll(".sp-section .sp-block")].map((b) => {
        const r = b.getBoundingClientRect();
        return { k: b.className.split(" ")[2], x: Math.round(r.left - o.left), y: Math.round(r.top - o.top), w: Math.round(r.width), h: Math.round(r.height) };
      });
    });
  const settle = async () => {
    // Let lazy images load: walk down the page, then come back.
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 700) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
  };
  const out = {};
  for (const w of [1440, 834, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${STUDIO}/preview/${ID}`);
    await page.waitForSelector(".sp-section", { state: "attached" });
    await settle();
    const studio = await measure();
    await page.goto(`${SITE}/work/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".sp-section", { state: "attached", timeout: 60000 });
    // No scrolling here: the site jumps to the next project when you scroll past the end.
    await page.waitForTimeout(2500);
    out.url = page.url();
    const site = await measure();
    const diffs = [];
    studio.forEach((a, i) => {
      const b = site[i];
      if (!b) return diffs.push({ i, k: a.k, missing: true });
      const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h));
      if (d > 1) diffs.push({ i, k: a.k, s: [a.x, a.y, a.w, a.h].join(","), t: [b.x, b.y, b.w, b.h].join(",") });
    });
    out[w] = { blocks: studio.length, siteBlocks: site.length, drift: diffs.slice(0, 4), drifted: diffs.length };
  }
  out.errors = errors;
  return JSON.stringify(out);
}
