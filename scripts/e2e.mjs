#!/usr/bin/env node
/**
 * End-to-end tests, without a test framework: starts a throwaway Studio server
 * (its own data, media, backups and an empty site folder, all in the system
 * temp folder), seeds a project, and runs each spec in tests/e2e through the
 * global `playwright-cli` in a headless browser.
 *
 *   npm run e2e               every spec
 *   npm run e2e -- shortcuts  just tests/e2e/shortcuts.js
 *
 * Your real data/, media/ and site are never touched. fidelity.js isn't run
 * here: it compares a published project with a running site (see its header).
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4897;
const STUDIO = `http://localhost:${PORT}`;
const SESSION = "studio-e2e";
const only = process.argv.slice(2);
const specs = readdirSync(join(ROOT, "tests/e2e"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => f.replace(/\.js$/, ""))
  .filter((name) => name !== "fidelity" && (!only.length || only.includes(name)));

const tmp = mkdtempSync(join(tmpdir(), "studio-pro-e2e-"));
for (const d of ["data", "media", "backups", "site/data"]) mkdirSync(join(tmp, d), { recursive: true });
writeFileSync(join(tmp, "data/settings.json"), JSON.stringify({ siteDir: join(tmp, "site") }));
writeFileSync(join(tmp, "site/data/projects.json"), "[]\n");

const cli = (...args) => spawnSync("playwright-cli", [`-s=${SESSION}`, ...args], { encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });

const server = spawn(process.execPath, [join(ROOT, "server.mjs"), "--port", String(PORT), "--data", join(tmp, "data"), "--media", join(tmp, "media"), "--backups", join(tmp, "backups")], { stdio: "ignore" });
let failed = 0;
try {
  for (let i = 0; ; i++) {
    const up = await fetch(`${STUDIO}/api/health`).then((r) => r.ok, () => false);
    if (up) break;
    if (i > 50) throw new Error("The test server didn't start.");
    await new Promise((r) => setTimeout(r, 200));
  }
  const id = await seed();
  cli("open", "about:blank");
  for (const name of specs) {
    const code = readFileSync(join(ROOT, "tests/e2e", `${name}.js`), "utf8").replaceAll("__STUDIO__", STUDIO).replaceAll("__ID__", id).replaceAll("__ROOT__", ROOT.replaceAll("\\", "/"));
    const file = join(tmp, `${name}.run.js`);
    writeFileSync(file, code);
    const out = cli("run-code", "--filename", `"${file}"`);
    const m = /### Result\s*\n("(?:[^"\\]|\\.)*")/.exec(out.stdout);
    if (!m) {
      failed++;
      console.log(`\n✗ ${name}: the spec didn't finish\n${(out.stdout + out.stderr).slice(0, 2000)}`);
      continue;
    }
    const results = JSON.parse(JSON.parse(m[1]));
    if (name === "shortcuts") for (const missing of untested(results)) results.push({ name: `${missing}: has keys but no test`, ok: false });
    const bad = results.filter((r) => !r.ok);
    failed += bad.length;
    console.log(`\n${bad.length ? "✗" : "✓"} ${name}: ${results.length - bad.length}/${results.length} passed`);
    for (const r of results) if (!r.ok || process.env.E2E_VERBOSE) console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}${r.note ? ` (${r.note})` : ""}`);
  }
} finally {
  cli("close");
  server.kill();
}
console.log(failed ? `\n${failed} failed. Test data: ${tmp}` : "\nAll e2e tests passed.");
process.exit(failed ? 1 : 0);

/** Commands in the registry that show keys, minus the ones a result name starts with. */
function untested(results) {
  const src = readFileSync(join(ROOT, "src/editor/shortcuts.ts"), "utf8").split("export const GESTURES")[0];
  const ids = [...src.matchAll(/id: "([\w.]+)",[^}]*?keys: /gs)].map((x) => x[1]);
  for (const [, bp] of src.matchAll(/bpCmd\("(\w+)"/g)) ids.push(`view.${bp}`);
  const tested = new Set(results.map((r) => r.name.split(":")[0]));
  return ids.filter((id) => !tested.has(id));
}

/** One project with a flow section, a free canvas and a second flow section. */
async function seed() {
  const { newBlock, newSection } = await import(pathToFileURL(join(ROOT, "src/model/index.ts")).href);
  const created = await (await fetch(`${STUDIO}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "E2E" }) })).json();
  const doc = await (await fetch(`${STUDIO}/api/projects/${created.id}`)).json();
  doc.page.sections = [
    newSection("flow", { name: "First", blocks: [newBlock("heading", { text: "Alpha" }), newBlock("text", { html: "<p>One</p>" }), newBlock("heading", { text: "Beta" }), newBlock("text", { html: "<p>Two</p>" })] }),
    newSection("canvas", { name: "Free", blocks: [newBlock("heading", { text: "Back" }), newBlock("heading", { text: "Front" })] }),
    newSection("flow", { name: "Last", blocks: [newBlock("heading", { text: "Gamma" })] }),
  ];
  const r = await fetch(`${STUDIO}/api/projects/${created.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(doc) });
  if (!r.ok) throw new Error(`Seeding failed: ${r.status} ${await r.text()}`);
  return created.id;
}
