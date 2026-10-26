#!/usr/bin/env node
/**
 * Puts Studio Pro's page renderer into the website so published stories look
 * exactly as they do in the editor.
 *
 *   node scripts/sync-renderer.mjs --site <site folder>   write it
 *   node scripts/sync-renderer.mjs --site <site folder> --dry   only say what would change
 *
 * Without --site it uses `siteDir` from data/settings.json. What it does:
 * 1. Copies src/render and the model files it needs into
 *    <site>/components/work/studio/ (import paths made extensionless,
 *    "use client" where React state lives, a do-not-edit header).
 * 2. Copies the site adapter (StudioStory.tsx, studio-site.css).
 * 3. Teaches types/project.ts about `page` and `studio`.
 * 4. Lets app/work/[slug]/page.tsx show a Studio Pro story and follow its page
 *    settings (title, cover, intro position, next project).
 * Every site file it changes is copied to studio-pro/backups/sync-<time>/ first.
 * Running it again only refreshes the copied renderer.
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const siteArg = args[args.indexOf("--site") + 1];
const settings = existsSync(join(ROOT, "data", "settings.json")) ? JSON.parse(await readFile(join(ROOT, "data", "settings.json"), "utf8")) : {};
const SITE = resolve(ROOT, args.includes("--site") ? siteArg : (settings.siteDir ?? ""));
if (!existsSync(join(SITE, "package.json")) || !existsSync(join(SITE, "types", "project.ts"))) {
  console.error(`That doesn't look like the site: ${SITE}`);
  process.exit(1);
}

const OUT = join(SITE, "components", "work", "studio");
const RENDER = ["context.tsx", "responsive.ts", "sanitize.ts", "embed.ts", "Blocks.tsx", "BlocksMore.tsx", "Page.tsx", "render.css", "render-more.css", "vars.css"];
const MODEL = ["schema.ts", "resolve.ts", "merge.ts", "embeds.ts", "bento.ts"];
const CLIENT = new Set(["context.tsx", "Blocks.tsx", "BlocksMore.tsx", "Page.tsx"]);
const HEADER = "Copied from studio-pro by scripts/sync-renderer.mjs. Don't edit here: change studio-pro/src and sync again.";

const pkg = JSON.parse(await readFile(join(SITE, "package.json"), "utf8"));
const has = (name) => !!(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);

/** Script-tag loaders for the two heavy players, used when the site doesn't have the packages. */
const CDN = {
  "model-viewer": `const loadModelViewer = (): Promise<unknown> => loadScript("https://cdn.jsdelivr.net/npm/@google/model-viewer@4.3.1/dist/model-viewer.min.js", true); // sync:model-viewer (CDN: not installed in the site)`,
  lottie: `const loadLottie = (): Promise<LottiePlayer> => loadScript("https://cdn.jsdelivr.net/npm/lottie-web@5.13.0/build/player/lottie.min.js").then(() => (window as unknown as { lottie: LottiePlayer }).lottie); // sync:lottie (CDN: not installed in the site)`,
};
const LOAD_SCRIPT = `
/** Adds a <script> once and resolves when it has loaded. */
const scripts = new Map<string, Promise<void>>();
function loadScript(src: string, module = false): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = src;
      if (module) s.type = "module";
      s.onload = () => ok();
      s.onerror = () => fail(new Error(\`Couldn't load \${src}\`));
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}
`;

function transform(name, text) {
  if (name.endsWith(".css")) {
    // The site loads Jost through next/font; Studio's own @font-face isn't needed there.
    const body = name === "render.css" ? text.replace(/@font-face\s*{[^}]*}\s*/, "") : text;
    return `/* ${HEADER} */\n${body}`;
  }
  let out = text.replace(/(from\s+["'])(\.{1,2}\/[^"']+?)\.(tsx|ts)(["'])/g, "$1$2$4");
  if (name === "BlocksMore.tsx") {
    if (!has("@google/model-viewer")) out = out.replace(/^const loadModelViewer = .*\/\/ sync:model-viewer.*$/m, CDN["model-viewer"]);
    if (!has("lottie-web")) out = out.replace(/^const loadLottie = .*\/\/ sync:lottie.*$/m, CDN.lottie);
    if (!has("@google/model-viewer") || !has("lottie-web")) out = out.replace(/^let modelViewer: /m, `${LOAD_SCRIPT}\nlet modelViewer: `);
  }
  const head = `// ${HEADER}\n`;
  return CLIENT.has(name) ? `"use client";\n${head}${out}` : `${head}${out}`;
}

/* Everything is worked out first; nothing is written unless every step succeeds. */
const plan = [];
const writes = [];
const write = async (path, text) => {
  const before = existsSync(path) ? await readFile(path, "utf8") : null;
  if (before === text) return;
  plan.push({ path: relative(SITE, path), kind: before === null ? "new" : "update" });
  writes.push({ path, text });
};

/* 1–2. The renderer, the model files it reads, and the adapter. */
for (const f of RENDER) await write(join(OUT, "render", f), transform(f, await readFile(join(ROOT, "src", "render", f), "utf8")));
for (const f of MODEL) await write(join(OUT, "model", f), transform(f, await readFile(join(ROOT, "src", "model", f), "utf8")));
for (const f of ["StudioStory.tsx", "studio-site.css"]) {
  const text = await readFile(join(ROOT, "site-adapter", f), "utf8");
  await write(join(OUT, f), f.endsWith(".css") ? `/* ${HEADER} */\n${text}` : text.replace(/^"use client";\n/, `"use client";\n// ${HEADER}\n`));
}

/* 3–4. Two small, one-time edits to the site's own files (backed up first). */
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const BACKUP = join(ROOT, "backups", `sync-${stamp}`);
const patches = [];

/** Edits a site file in LF form and writes it back with the file's own line endings. */
async function patchFile(rel, edit) {
  const path = join(SITE, rel);
  const raw = await readFile(path, "utf8");
  const crlf = raw.includes("\r\n");
  const before = raw.replace(/\r\n/g, "\n");
  const after = edit(before);
  if (after === before) return;
  patches.push({ rel, before: raw, after: crlf ? after.replace(/\n/g, "\r\n") : after });
}

await patchFile("types/project.ts", (s) => {
  if (s.includes("studio?:")) return s;
  const anchor = `  /** Case-study story authored in Studio (studio-framer). Absent = legacy layout. */\n  blocks?: Block[];\n}`;
  if (!s.includes(anchor)) throw new Error("types/project.ts has changed shape; update sync-renderer before syncing.");
  return `import type { Credit as StudioCredit, Cta as StudioCta, Page as StudioPage, Soundtrack as StudioSoundtrack } from "@/components/work/studio/model/schema";\n\n${s.replace(
    anchor,
    `  /** Case-study story authored in Studio (studio-framer). Absent = legacy layout. */
  blocks?: Block[];
  /** Case-study page authored in Studio Pro. Takes over from \`blocks\` when present. */
  page?: StudioPage;
  /** Studio Pro fields the story renderer reads. */
  studio?: { client?: string; credits?: StudioCredit[]; soundtrack?: StudioSoundtrack; cta?: StudioCta };
}`,
  )}`;
});

await patchFile("app/work/[slug]/page.tsx", (s) => {
  if (s.includes("StudioStory")) return s;
  const need = (what) => {
    if (!s.includes(what)) throw new Error(`app/work/[slug]/page.tsx has changed (looking for: ${what.slice(0, 60)}…); update sync-renderer before syncing.`);
  };
  const imp = `import { CaseStudyBlocks } from "@/components/work/CaseStudyBlocks";`;
  const story = `  const hasStory = !!project.blocks?.length;`;
  const title = `      <section className="px-6 md:px-10 pt-32 md:pt-44 pb-10">`;
  const cover = `      <div\n        className="mx-6 md:mx-10 aspect-[16/9] rounded-2xl overflow-hidden relative"`;
  const intro = `      <section className="px-6 md:px-10 py-16 md:py-24 grid grid-cols-1 md:grid-cols-12 gap-10">`;
  const blocks = `      {hasStory && <CaseStudyBlocks blocks={project.blocks!} />}`;
  const next = `      <section className="px-6 md:px-10 py-16 border-t border-border flex items-center justify-between">`;
  [imp, story, title, cover, intro, blocks, next].forEach(need);

  /** Wraps the element starting at `open` (up to its closing tag) in `{cond && ( … )}`. */
  const wrap = (src, open, close, cond) => {
    const a = src.indexOf(open);
    const b = src.indexOf(close, a) + close.length;
    const el = src.slice(a, b);
    return `${src.slice(0, a)}      {${cond} && (\n${el.replace(/^/gm, "  ")}\n      )}${src.slice(b)}`;
  };

  let out = s.replace(imp, `${imp}\nimport { StudioStory } from "@/components/work/studio/StudioStory";`);
  out = out.replace(
    story,
    `  // A Studio Pro page takes over from Studio (framer) blocks, which take over from the legacy gallery.
  const studioStory = !!project.page?.sections?.length;
  const hasStory = studioStory || !!project.blocks?.length;
  // Studio Pro's page settings: what shows around the story, and where the intro sits.
  const chrome = { header: true, cover: true, intro: "before", next: true, ...project.page?.chrome };`,
  );
  out = wrap(out, title, "</section>", "chrome.header");
  out = wrap(out, cover, "\n      </div>", "chrome.cover");
  // The intro moves into a variable so it can sit before or after the story.
  const ia = out.indexOf(intro);
  const ib = out.indexOf("</section>", ia) + "</section>".length;
  const introEl = out.slice(ia, ib);
  out = `${out.slice(0, ia)}      {chrome.intro === "before" && intro}${out.slice(ib)}`;
  out = out.replace(
    "  return (\n    <>",
    `  const intro = (\n${introEl.replace(/^ {6}/gm, "    ")}\n  );\n\n  return (\n    <>`,
  );
  out = out.replace(
    blocks,
    `      {studioStory ? <StudioStory project={project} /> : hasStory && <CaseStudyBlocks blocks={project.blocks!} />}\n\n      {chrome.intro === "after" && intro}`,
  );
  out = wrap(out, next, "</section>", "chrome.next");
  return out;
});

for (const p of patches) plan.push({ path: p.rel, kind: "edit" });
if (!dry) {
  for (const p of patches) {
    await mkdir(dirname(join(BACKUP, p.rel)), { recursive: true });
    await copyFile(join(SITE, p.rel), join(BACKUP, p.rel));
  }
  for (const w of writes) {
    await mkdir(dirname(w.path), { recursive: true });
    await writeFile(w.path, w.text);
  }
  for (const p of patches) await writeFile(join(SITE, p.rel), p.after);
}

console.log(`${dry ? "Would change" : "Changed"} ${plan.length} file(s) in ${SITE}`);
for (const p of plan) console.log(`  ${p.kind.padEnd(6)} ${p.path}`);
if (!dry && patches.length) console.log(`Backups of edited site files: ${relative(ROOT, BACKUP)}`);
if (dry && args.includes("--diff")) for (const p of patches) console.log(`\n--- ${p.rel}\n${p.after}`);
if (!has("@google/model-viewer") || !has("lottie-web")) console.log("3D models and Lottie load from cdn.jsdelivr.net (pinned versions) because the site doesn't install those packages.");
