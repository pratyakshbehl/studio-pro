# Studio Pro: build context

How Studio Pro is built **right now**, for anyone (person or AI session) changing it. Read this before editing. **Update it after every change**: rewrite the section that changed, then add a line to the changelog at the bottom.

- How to use it: [README.md](README.md)
- The original design and decisions: [SPEC.md](SPEC.md)
- The build plan, with notes on each task: [tasks/todo.md](tasks/todo.md)

---

## 1. What it is

A local web app at **http://localhost:4800** for building portfolio case studies and publishing them to the website (the **48 copy**: `PORTFOLIO/PROGRESS UPDATED/pratyakshbehl - Copy - Copy - Copy 48`, Next.js 16). It merges the two older studios (`PORTFOLIO/studio`, Behance-style, and `PORTFOLIO/studio-framer`, Framer-style). Both are left untouched.

Current state (2026-10-23): all 7 phases are built. The renderer is synced into the real 48 site, all 7 site projects are live from Studio, and final sign-off is waiting on the user's testing.

## 2. Ground rules (from the user, never break these)

- **The site is written only by Publish**, which the user presses, after a backup. The renderer sync (`scripts/sync-renderer.mjs`) is the one other writer, and it's run deliberately.
- **Never delete or move files without asking.** Deleted projects soft-delete to `data/.trash/`. Uploads are never overwritten (a second file gets `-2`).
- **Ask first:** new npm dependencies; site files beyond `types/project.ts`, `app/work/[slug]/page.tsx` and `components/work/studio/`; site tokens or fonts; the 96 copy (never touch it).
- Never publish to the internet, push to git, or type passwords.
- **Testing never uses the real `data/` or site.** Use the `studio-pro-test` launch config (:4898, scratch data, scratch backups) and the scratch site (`site-48-scratch`, :3148), or `npm run e2e` (its own temp folder).
- Design: pro-tool, neutral dark chrome; **burnt orange `#f0552a` is the only accent**. Operate mode: the user's work is the loudest thing on screen.

## 3. Stack

- React 19, Vite 8, TypeScript 7, Zustand 5 (editor state), Immer 11 (undo history as patches), TipTap 3 (on-page text editing, lazy chunk).
- Lazy chunks: `@google/model-viewer` 4.3.1 (3D), `lottie-web` 5.13.0.
- **Server:** Node 24, plain `node:http`, no framework. It imports `src/model/*.ts` directly through Node's type stripping, so model code must use **erasable TypeScript only**: no enums, no parameter properties, `import type`, and `.ts` extensions in imports.
- **The server serves the built `dist/`. Run `npm run build` after any UI change**, or the browser shows the old UI. Server code changes need a server restart.
- Tests: Vitest (`npm test`, 188 unit tests) and `npm run e2e`, which drives the global `playwright-cli`. There is no Playwright package dependency.

## 4. How the pieces fit

```
Browser (React app, dist/)                Node server (server.mjs :4800)              Website (48 copy, Next.js)
──────────────────────────                ─────────────────────────────              ──────────────────────────
Home / Media / Editor / Preview  ──API──▶  data/projects/*.json (one file per project)
  editor store (Zustand)                   data/snapshots, data/.trash, settings.json
  commands → Immer patches → undo          media/uploads, media/originals, .thumbs
  render/ = the site's page renderer       publish: plan → backup → copy media ──▶  data/projects.json
                                                      → write projects.json        public/{images,videos,audio,models}/projects/studio/
                                           backups/<stamp>/ (site file copies)
scripts/sync-renderer.mjs ─────────────── copies src/render + model ─────────────▶ components/work/studio/
```

**One renderer, two places.** `src/render/` draws a project page. Studio's canvas and Preview use it directly, and the sync script copies it into the site, so the editor shows exactly what the site shows. Fidelity measured: 0px drift at 1440/834/390.

## 5. File map

### Server (`server.mjs`, `server/`)
| File | Job |
|---|---|
| `server.mjs` | Route table `[method, regex, handler(params, req, url)]` plus static serving |
| `server/args.mjs` | `--port --data --media --backups` flags (test instances) |
| `server/lib.mjs` | Paths (`DATA`, `MEDIA`, `BACKUPS`), JSON read/atomic write, `safeJoin`, `keyedQueue` (serialises writes), `HttpError` |
| `server/projects.mjs` | Project CRUD, revision check, snapshots, bulk update, duplicate, trash and restore |
| `server/media.mjs` | Uploads (never overwrite), companion files (`?for=&role=` original/poster/wNNN) |
| `server/library.mjs`, `media-meta.mjs` | Media listing with "used in"; alt/tags/focal/audio notes in `data/media-meta.json` |
| `server/import.mjs` | One-time import from both old studios plus the site |
| `server/sections.mjs` | Saved sections (`data/library/sections.json`) |
| `server/settings.mjs` | `data/settings.json`: `siteDir` (defaults to the 48 copy) and project `order` |
| `server/publish.mjs` | `getPlan({only})`, `publish({hash, only})`, `listBackups`, `restore`, log |
| `server/probe.mjs`, `static.mjs` | Media probing; serving `dist/` and `/media` |

### Model (`src/model/`), pure TypeScript shared by app, server and site
| File | Job |
|---|---|
| `schema.ts` | Types. `SCHEMA_VERSION = 3`. Project → `page` {style, chrome, sections[]} → Section {layout, style, blocks[]} → Block (about 30 types). Statuses: draft, live, unlisted, archived. Breakpoints: desktop, tablet, phone (smaller sizes are `overrides`). |
| `factories.ts` | `newProject`, `newSection(type)`, `newBlock(type, partial)` |
| `commands.ts` | Every edit as a named command (Immer recipe): section/block insert/remove/move/update/override, `batch`… |
| `history.ts` | Undo/redo stacks of Immer patches. Rapid edits with the same key merge into one step. |
| `resolve.ts`, `merge.ts` | Per-breakpoint resolution of overrides |
| `bento.ts`, `embeds.ts` | Bento grid presets; YouTube/Vimeo/Spotify/… embed parsing |
| `migrate.ts`, `validate.ts` | Upgrades old files on read; validation |
| `import-map.ts` | Site/old studio → Studio project (`fromSite`, `mergeSources`) |
| `serialize-site.ts` | Studio project → site record (`toSite`). The cover is never null. `PUBLISHED_STATUSES` = live and unlisted. |
| `publish-plan.ts` | Pure `planPublish(studio, order, site, indent, only?)` → new JSON, per-field changes, media copies, warnings |
| `taxonomy.ts` | Tools, categories, licences, tag suggestions |

### App (`src/`)
| Area | Files |
|---|---|
| Shell | `main.tsx`, `App.tsx`, `lib/router.ts` (routes: `/`, `/media`, `/p/:id`, `/preview/:id`), `cms/TopBar.tsx`, `ui/styles.css` (tokens), `ui/icons.tsx` |
| Home | `cms/Home.tsx` (filters, sort, drag order, selection), `ProjectViews.tsx` (grid and table), `BulkBar.tsx`, `TemplatePicker.tsx`, `ImportPanel.tsx`, `SettingsSheet.tsx` (also exports `Sheet`, the drawer shell) |
| Editor | `editor/Editor.tsx` (layout, key and paste listeners), `store.ts` (Zustand state; exposed as `globalThis.__studio` for e2e), `actions.ts` (copy/paste/move/delete…), `shortcuts.ts` (**the one command registry**), `Canvas.tsx`, `Overlay.tsx` (selection, handles), `Transform.tsx` / `canvasOps.ts` / `frames.ts` (free canvas), `BentoHandles.tsx`, `gallery.ts`, `camera.ts` (zoom/pan), `Rulers.tsx`, `Measure.tsx` (Alt distances), `InlineText.tsx` (TipTap), `FloatingToolbar.tsx`, `InsertBar.tsx`, `LayoutPicker.tsx`, `ContextMenu.tsx`, `Palette.tsx` (Ctrl+K), `ShortcutSheet.tsx` (?), the panels (`LayersPanel`, `InsertPanel`, `MediaPanel`, `HistoryPanel`), and inspectors (`Inspector`, `InspectorBlocks`, `InspectorDesign`, `InspectorGallery`, `fields.tsx`) |
| Uploads | `editor/upload.ts` (browser resizes to a 2880px WebP and keeps the original; 480/960/1600 copies; video posters), `editor/peaks.ts` (waveforms), `lib/audio.ts` (BPM and key), `lib/colors.ts` (accent from cover) |
| Library | `library/sections.ts` (32 presets), `templates.ts` (12 templates, `fromTemplate`), `SectionThumb.tsx`, `SectionLibrary.tsx` |
| Media screen | `media/MediaLibrary.tsx` |
| Publish | `publish/PublishSheet.tsx` (`PublishButton`, sheet with per-project checkboxes, History and restore tab) |
| Preview | `preview/Preview.tsx` (Full/1440/834/390, `?w=`) |
| Renderer | `render/Page.tsx` (`Page`, `StoryView`), `Blocks.tsx`, `BlocksMore.tsx` (Phase 4 blocks, audio, `SoundtrackPill`), `context.tsx` (`RenderProvider`), `responsive.ts`, `sanitize.ts`, `render.css`, `render-more.css`, `vars.css` (generated by `scripts/gen-vars.mjs`) |

### Scripts, adapter, tests
- `scripts/sync-renderer.mjs [--site dir] [--dry] [--diff]`:
  - copies `render/` + the needed model files + `site-adapter/*` into `<site>/components/work/studio/`;
  - patches the site's `types/project.ts` and `app/work/[slug]/page.tsx`;
  - backs up edited files to `backups/sync-<stamp>/`.
  - It's all-or-nothing, keeps CRLF, and is safe to run twice.
- `site-adapter/StudioStory.tsx`: the site's client component that renders a Studio page. `studio-site.css` uses the site's Jost font.
- `scripts/e2e.mjs` + `tests/e2e/shortcuts.js`: `npm run e2e`. `tests/e2e/fidelity.js`: manual canvas-vs-site position check.
- `tests/unit/*`: model, import (all 7 site projects, no field lost), grid, canvas, library, media, publish, render. Includes a 1,000-sequence undo/redo property test.

## 6. How the key flows work

- **Editing:** UI → `run(command, args)` in the store → Immer produces patches → pushed to history → autosave (debounced PUT with a revision check; a conflict shows up as a save state). Drags call `preview(base, cmd, args)`, which re-runs from the pre-drag state, so **a whole drag is one undo step**.
- **Shortcuts:**
  - `shortcuts.ts` `COMMANDS` feeds the keyboard handler, the `?` sheet, the Ctrl+K palette and the right-click menus. **Add new shortcuts there only.**
  - Each command has `bind` (keys), `global` (works while typing), `keyOnly` (left out of the palette) and `enabled`.
  - While a drawer or sheet is open, only global keys act (plus `?` to close the sheet).
  - The e2e runner fails if a command with keys has no test.
- **Responsive:** desktop is the base. Tablet/phone edits are stored as `overrides` on the node and resolved per breakpoint. The renderer uses one CSS container (`sp-page`, `cqw` units) with per-breakpoint vars `--x/--x-t/--x-p`. Sizes are in px, never rem.
- **Publish:**
  1. `getPlan` reads the site's `projects.json` and works out the plan (pure function).
  2. The hash shown in the sheet must match, or the publish is refused (something changed since you looked).
  3. Back up the current site file to `backups/<stamp>/`.
  4. Copy missing media into the site's `public/…/projects/studio/` (never removes any).
  5. Write the file atomically and log the run in `data/publish-log.json`.
  - `only` publishes the chosen slugs and keeps the rest exactly as the site has them, in site order.
  - Drafts and archived projects come off the site. Site-only projects are always kept.
  - Errors block (no cover, no slug, duplicate address, missing media). Warnings don't (alt text, empty blocks, unlisted, images over 8 MB or videos over 40 MB).
- **Restore:** copies a backup byte for byte after backing up the current file. Backups are matched to their site with `realpathSync.native` (Windows short names). History hides backups of other sites, and restore refuses them.
- **On the site:**
  - `page.tsx` renders `<StudioStory>` when `project.page.sections` exists; otherwise the old `CaseStudyBlocks`.
  - `page.chrome` toggles the header, cover, intro (before/after/hidden) and next project.
  - 3D and Lottie load from pinned jsdelivr scripts, because the site doesn't install those packages.

## 7. Conventions

- Match the surrounding code: short doc comments on exports, plain-language UI copy (no jargon, no "successfully").
- Model files stay framework-free and erasable-TS (the server and site import them).
- Rules overriding `.sp-media` in `render-more.css` must be written `.sp-media.x` (that file is @imported before render.css's rules).
- Portalled UI needs `data-overlay-ui`, or the canvas treats clicks as canvas clicks.
- Small controls get a 24px+ hit area via `::after { inset: -4px }` (in `ui/styles.css`).
- Python patch scripts on Windows: write with `newline="\n"`. The Bash tool breaks on heredocs containing apostrophes, so use the Write tool for CSS and scripts.

## 8. Gotchas we already hit

- Tailwind's reset on the site removes input margins → 4px drift. Fixed with `.sp-root button, .sp-root input { margin:0; font:inherit }`.
- Scrolling to the bottom of a site page triggers the site's NextProjectScroll navigation, so measure without scrolling. Next dev never fires "load", so use domcontentloaded.
- Turbopack rejects a `node_modules` junction outside the project, so give a scratch site a real copy. Use long paths (`C:/Users/Pratyaksh/...`), not `PRATYA~1`, for the Next watcher.
- The site crashes on `cover: null`, so serialize never writes null and publish blocks coverless projects.
- `<dialog>.showModal()` focuses its first button, so focus the intended input afterwards. Ctrl+K is global, so handlers that use it themselves must `preventDefault`.
- TipTap has no `editor.view` until mounted (`whenMounted` in `InlineText.tsx`). Pointer capture retargets dblclick/contextmenu, so use `elementFromPoint`.
- Background browser tabs pause `requestAnimationFrame`, so use `setTimeout` for one-shot work.
- Headless Chromium can't play some H.264 MP4s from a URL (not a server bug).
- `realpath.native` exists only on `node:fs` (sync), not `fs/promises`.
- playwright-cli `run-code`: no `require` or `setTimeout` (use `page.waitForTimeout`); routes persist between runs (`unrouteAll` first); pass long specs with `--filename`.
- The impeccable detector's URL scans need puppeteer (not installed; ask before adding).

## 9. Testing and running

| What | How |
|---|---|
| Real Studio | `Start Studio Pro.bat` or `node server.mjs` → :4800 (launch config `studio-pro`) |
| Test Studio | launch config `studio-pro-test` → :4898, scratch data, media and backups in the session scratchpad |
| Real site | launch config `site-48` → :3048 (`npm run dev` in the 48 folder) |
| Scratch site | launch config `site-48-scratch` → :3148 (scratchpad `site48`, renderer synced) |
| Unit tests | `npm test` (188) · `npm run typecheck` |
| E2E | `npm run e2e` (49 shortcut checks, throwaway server on :4897) |
| Fidelity | `tests/e2e/fidelity.js` (see its header) |
| After UI edits | `npm run build`, then reload |
| After renderer edits | `node scripts/sync-renderer.mjs --dry --diff`, then run it without `--dry` (ask first for the real site), then site `npx tsc --noEmit` |

## 10. Open items

- Unlisted projects still appear in the site's work index. Fixing it needs a site edit outside the allowed files, so ask first.
- NYOD (`the-oberoi-patisserie`) has Studio page edits from 2026-10-22 16:10 that aren't published.
- A stray scratch test backup `backups/2026-10-22T10-05-34-876Z` sits in the real backups folder (hidden from History). Move it only with the user's OK.
- Four heavy PNGs (16–56 MB) are live on the site. Re-uploading them through Studio converts them to WebP.
- Final sign-off is pending the user's full test pass.

## 11. Changelog

One line per change, newest first: date, what changed, and where.

- 2026-10-23: Added CONTEXT.md (this file).
- 2026-10-22: Phase 7: a11y fixes (slider names, contrast, hit areas, focus ring), `?` closes the sheet, `npm run e2e` with 49 shortcut checks, all 12 templates verified on the scratch site.
- 2026-10-22: Checkpoint F: renderer synced into the real 48 site. All 7 projects published (Publish pressed at 15:46); the user chose to keep them.
- 2026-10-22: Phase 6: site renderer sync, Publish sheet (diff, choose projects, backups, restore, history), preview widths, fidelity check.
- 2026-10-22: Phases 1–5: foundation and import, editor, layouts and deep panels, library and templates, project and media management.
