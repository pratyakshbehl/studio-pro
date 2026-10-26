# Studio Pro — task list

Plan: [plan.md](plan.md) · Spec: [../SPEC.md](../SPEC.md)
Verify commands (from `studio-pro/`): `npm run typecheck` · `npm test` · `npm run build` · `npm run e2e`

---

## Phase 1: Foundation

- [x] **T1 Scaffold app and server** (M)
  - Accept: Vite + React 19 + TS app builds to `dist/`. `node server.mjs` serves it on :4800 with `/api/health`. `Start Studio Pro.bat` launches it and opens the browser. A `studio-pro` entry exists in `CODE SESH/.claude/launch.json`.
  - Verify: `npm run build` · `npm run typecheck` · preview shows the empty shell.
  - Files: `package.json`, `vite.config.ts`, `tsconfig.json`, `server.mjs`, `Start Studio Pro.bat`, `src/main.tsx`

- [x] **T2 Core model: schema, commands, history** (M)
  - Accept: `Project/Section/Block` types with `schemaVersion`. A `command()` helper uses Immer patches with undo/redo. The breakpoint resolver works. 1,000-sequence random property test round-trips.
  - Verify: `npm test -- model` (≥90% coverage on `src/model`).
  - Files: `src/model/schema.ts`, `commands.ts`, `history.ts`, `resolve.ts`, `tests/unit/model.test.ts`

- [x] **T3 Import + projects API + basic home** (M)
  - Accept: The importer reads the site's `projects.json` (48), `studio/data/projects/*.json` and `studio-framer/data/workspace.json`. It de-duplicates by slug, keeps the newest fields, and maps old block types (`section`→heading, `grid`→grid, `pair`→grid 2, etc.). API: list/get/create/save (atomic)/trash. Home lists every project as a cover card.
  - Verify: unit test against fixture copies shows 7 site projects + studio drafts, no field lost · preview shows the cards.
  - Files: `server/projects.mjs`, `server/import.mjs`, `src/model/migrate.ts`, `src/cms/Home.tsx`, `tests/unit/import.test.ts`

### Checkpoint A
- [x] Tests, typecheck and build are clean · You open :4800 and see all your projects · **Reviewed by you, 2026-10-22**

## Phase 2: Editor core

- [x] **T4 Renderer v1 (flow/stack/grid + 9 core blocks)** (L, split if needed)
  - Accept: Section layouts flow/stack/grid and blocks heading, text, image, video, grid, compare, quote, facts, spacer render with the site tokens (Jost, gutters 24/40, radius 16). The phone/tablet/desktop cascade applies.
  - Verify: component tests · a screenshot of one imported project at 1440/834/390 matches the live site page (≤1px drift on the shared parts).
  - Files: `src/render/Section.tsx`, `src/render/blocks/*.tsx`, `src/render/tokens.css`, `tests/e2e/fidelity.spec.ts`

- [x] **T5 Editor shell** (M)
  - Accept: 48px top bar, a 260px left panel (Outline/Layers/Insert/Media tabs), canvas with zoom 10–400% and pan (Space-drag, Ctrl+wheel, Shift+0/1/2), a 280px inspector shell, breakpoint switcher with frames at 1440/834/390, and the pro-tool chrome theme.
  - Verify: preview; keyboard zoom/pan work.
  - Files: `src/editor/EditorShell.tsx`, `Canvas.tsx`, `TopBar.tsx`, `src/ui/*`

- [x] **T6 Selection, layers, history UI** (M)
  - Accept: Click/shift/marquee select, Esc for parent, Enter for child. The Layers tree supports drag reorder, rename, lock and hide. Delete, Ctrl+D, Ctrl+Z/Shift+Z/Y work. Autosave runs at 800ms with a Saved/Saving indicator.
  - Verify: e2e `selection.spec.ts`.
  - Files: `src/editor/selection.ts`, `layers/LayersPanel.tsx`, `src/editor/autosave.ts`

- [x] **T7 Insert + drop-to-add** (M)
  - Accept: The Insert panel (`I`) is searchable and grouped. "+" inserters sit between sections and blocks. Dropping files from Explorer works: one image becomes Image, several become Grid, video becomes Video, audio becomes Audio. Uploads land via `/api/media`.
  - Verify: e2e `insert.spec.ts` with test images.
  - Files: `src/editor/insert/*`, `server/media.mjs`

### Checkpoint B
- [ ] Build a simple case study end to end, reload, and it persists · **You try it before Phase 3**

## Phase 3: Pro editing tools (revised 2026-10-22 from your Behance screenshots)

Split into two checkpoints. 3A fixes what blocked you (grids, insert bar); 3B adds the deep panels.

### Phase 3A: grid system and insert bar

- [x] **T8a Photo grid (Behance-style, justified)** (M)
  - Accept: Images keep their shape and every row's edges line up exactly, at any width and at each breakpoint (row height per breakpoint). The last row doesn't stretch. Works without JS on the site. Missing image sizes are read from the files by the server.
  - Verify: unit tests for the image-size probe (JPEG/PNG/WebP/GIF) · measured equal row heights in the browser.
- [x] **T8b Bento layouts** (L)
  - Accept: 12+ presets (2×2 + tall, big + 2 stacked, 3 equal, 2:1:1 row, 1 + 3, hero + 4, 3×2…) drawn as thumbnails. Column/row weights, overall shape, gap and corners. Images crop to fill each cell, with a focal point. Empty cells show a drop target. Optional stack-on-phone.
  - Verify: unit tests for presets (cells cover the grid, no overlaps) · each preset renders at 3 breakpoints.
- [x] **T8c Bento editing on the canvas** (M)
  - Accept: Drag column and row dividers to resize, snapping to equal, thirds and halves, with a live ratio readout. Drag one image onto another to swap them. Drop a file onto a cell to fill or replace it. Alt-drag a divider for free resize.
  - Verify: manual · undo restores each step.
- [x] **T9 Insert Media bar + layout picker** (M)
  - Accept: Behance-style bar on hover between blocks and in empty sections: Image, Text, Photo grid, Video, Audio, Embed, 3D, Layouts ▸ (thumbnail picker), Sections ▸ (Flow/Stack/Grid/Canvas). Each has a tooltip and shortcut, and a matching style. Dropping several images opens the layout picker with a suggestion (Enter accepts).
  - Verify: manual · insert lands at the hovered gap.
- [x] **T9b Embed and Audio blocks** (M)
  - Accept: Paste a link and the type is detected: YouTube, Vimeo, Spotify, SoundCloud, Apple Music, Sketchfab, Figma, CodePen, Behance, Instagram, any iframe. Audio file block with a player.
  - Verify: unit tests for the URL detector.
- [x] **T10 Floating toolbar** (M)
  - Accept: A context bar above the selection: layout switcher (galleries), replace, width (Column/Wide/Edge), align, move up/down, duplicate, delete, plus a more menu. It never covers the selection and flips below it near the top edge.
  - Verify: manual on every block type.

### Checkpoint C1
- [ ] Rebuild your NYOD grids from the screenshots in under 2 minutes · **You try it**

### Phase 3B: deep panels

- [x] **T11 Full properties inspector** (L): Position, Size (fixed/fill/fit, max width), Spacing (margins per block), Styles (fill, radius, border, shadow, opacity, blend), Typography, Effects (appear, hover, scroll, parallax), Transforms, all per breakpoint with the override dot, and rendered by the site renderer.
  - Done as the Design tab (Layout, Fill and border, Typography, Effects, Transform). Position and size live on the free canvas (T13); fixed/fill/fit sizing is covered by max width plus block width and is not a separate control.
- [x] **T12 Media + History panels** (M): Media tab of uploads and site images to drag onto the page. History tab of every step (click to jump) plus named versions (save/restore snapshots).
- [x] **T13 Rulers, guides, measurements, canvas drag** (L): Rulers in frame pixels, 12-column overlay (Shift+G), Alt-hover distances, drag blocks to reorder on the canvas, and free-canvas move/resize/rotate with smart-guide snapping.
- [x] **T14 Inline text editing** (M): Double-click to edit on the page (TipTap), with a floating text toolbar, markdown shortcuts and clean paste.
- [x] **T15 Ctrl+K, context menus, full keymap** (M): Command palette, right-click menus everywhere, and every shortcut in one keymap that also drives the `?` sheet.

### Checkpoint C2
- [ ] Every shortcut works; a free-layout section looks right on all 3 breakpoints · **You try it before Phase 4**

## Phase 4: Content and library

- [x] **T13 Advanced blocks** (L, split by group)
  - Done: Carousel, Slideshow, Ticker and Moodboard are gallery layouts; Layer breakdown, Turntable, Stat row, Palette, Type specimen, Prompt card, Process timeline, Button and Credits are blocks. Divider already existed.
  - Accept: Carousel, Slideshow, Ticker, Layer breakdown (plate→CG→comp scrub), Turntable, Stat row, Palette, Type specimen, Prompt card, Process timeline, Moodboard, Button, Divider.
  - Verify: component test per block · each appears in Insert.
  - Files: `src/render/blocks/*`, `src/editor/insert/catalog.ts`

- [x] **T14 Music, audio and embeds** (M)
  - Done: waveform (measured once in Studio) and chapters, Tracklist, Apple Podcasts/Bandcamp/Mixcloud/Audiomack/LottieFiles/Loom embeds (36-link test table), GLB via model-viewer 4.3.1, Lottie via lottie-web, soundtrack pill.
  - Accept: Waveform and chapters for the audio block (from T9b), Tracklist, Podcasts/Lottie embeds, GLB via model-viewer, and a project soundtrack pill (no autoplay with sound, fades).
  - Verify: unit tests for the URL detector (30+ URLs) · manual playback.
  - Files: `src/render/blocks/Audio.tsx`, `Embed.tsx`, `src/model/embeds.ts`

- [x] **T15 Section presets + save-as-section** (M)
  - Done: 32 presets with wireframe thumbnails drawn from their real blocks; Insert › Sections and the insert bar's Section menu; Save to Your sections (palette, right-click) stored in data/library/sections.json.
  - Accept: ~30 presets (5 heroes, 4 text, 10 media, 6 case-study, 3 music, CTA, Next project) with thumbnails. "Save selection as section" works for your own presets.
  - Verify: each preset inserts and renders at 3 breakpoints (e2e loop).
  - Files: `src/library/sections/*`, `src/library/LibraryPanel.tsx`

- [x] **T16 12 templates + picker + snapshots** (M)
  - Done: New project opens a picker with the 12 templates; snapshots shipped in T12.
  - Accept: The new-project picker previews the 12 templates from SPEC §3.4 with real prompts, not lorem ipsum. Named snapshots (History panel) save and restore.
  - Verify: e2e creates a project from each template.
  - Files: `src/library/templates/*`, `src/cms/TemplatePicker.tsx`, `src/editor/HistoryPanel.tsx`, `server/snapshots.mjs`

### Checkpoint D
- [ ] Build a VFX breakdown and a music release from templates · **You review before Phase 5**

## Phase 5: CMS and media

- [x] **T17 Projects home (CMS)** (M)
  - Done: category/tag/year/featured filters, sort, drag to set site order (grid and table), Ctrl/Shift multi-select with bulk status, feature, tag, duplicate and trash, and a Trash view with restore.
  - Accept: Grid/table (`V`), search `/`, filters (status/category/tag/year/featured), sort, drag order, multi-select bulk actions, the Draft/Live/Unlisted/Archived statuses, and trash with restore.
  - Verify: e2e `home.spec.ts`.
  - Files: `src/cms/Home.tsx`, `ProjectTable.tsx`, `Filters.tsx`, `BulkBar.tsx`

- [x] **T18 Project settings sheet** (M)
  - Done: drawer from Home (autosaves) and the editor (Ctrl+, through undo). Covers 16:9 and 4:3 crops with focal points, size warning, video poster, slug check, curated tools/categories/licences, tag suggestions, credits, facts, accent swatches from the cover, soundtrack, CTA, SEO with share-image crop.
  - Accept: Cover with 16:9 and 4:3 crops plus a focal point (video cover too). Title, slug (unique), summary counter, year, client, roles, tools (autocomplete from 60), categories ≤3, tags ≤10 with suggestions, credits, facts, accent sampled from the cover, soundtrack, CTA, SEO + OG crop, featured, licence.
  - Verify: unit tests for limits and slug; e2e fills it in and saves.
  - Files: `src/cms/SettingsSheet.tsx`, `src/cms/fields/*`, `src/model/taxonomy.ts`

- [x] **T19 Media library + upload pipeline** (L)
  - Done: 2880 WebP + kept original, 480/960/1600 copies used via srcset, video posters, /media screen with tabs, search, tags, unused, missing alt, heavy files, used-in, alt, focal, and audio waveform/BPM/key/mood/loop. A fresh 6000px upload took about 0.4s in testing.
  - Accept: Browser resizes to a 2880 WebP plus 480/960/1600 thumbs, and keeps the original. Videos get a poster. No overwrites (`-2`). Images/Video/Audio/Files tabs, search, tags, an unused filter, "used in", an alt warning and a heavy-file warning. Audio gets a waveform, BPM (detected, editable), key, mood and loop points.
  - Verify: unit tests for naming/collisions; e2e uploads a 6000px image (under 3s).
  - Files: `src/media/*`, `server/media.mjs`

### Checkpoint E
- [x] Manage all projects and media without touching the editor · **You review before Phase 6** (approved)

## Phase 6: Publish and site

- [x] **T20 Site renderer port (48 copy)** (M)
  - Done (tested on a scratch copy of the site; the real site is not written yet): `node scripts/sync-renderer.mjs [--site dir] [--dry] [--diff]` copies the renderer + model into `components/work/studio/{render,model}` plus `StudioStory.tsx`/`studio-site.css`. It adds `page?`/`studio?` to `types/project.ts` and makes `app/work/[slug]/page.tsx` render `StudioStory` when a project has a Studio page (chrome toggles for header, cover, intro and next). It backs edited files up to `backups/sync-*`, writes nothing unless every step works, keeps CRLF, and runs twice safely. 3D/Lottie load from pinned jsdelivr scripts because the site lacks those packages. `CaseStudyBlocks.tsx` is left as is: page.tsx chooses between them instead. Site tsc passes.
  - Accept: `sync-renderer` copies `src/render` into `components/work/studio/`. `types/project.ts` gains `page?`. `CaseStudyBlocks.tsx` delegates. Legacy projects are unchanged and `npx tsc --noEmit` passes. **Ask the user before writing** (new folder in the site).
  - Verify: tsc in the site; Next dev renders a published project.
  - Files: `scripts/sync-renderer.mjs`, site `types/project.ts`, `components/work/CaseStudyBlocks.tsx`, `components/work/studio/*`

- [x] **T21 Publish, backups, restore** (M)
  - Done: Publish sheet (from Home and the editor) with added/updated/taken-off groups, per-field changes, media to copy with sizes, blocking errors (no cover, no slug, duplicate address, missing media) and warnings (alt text, empty blocks, unlisted, files over 8 MB/40 MB). **Untick projects to publish only some**: the rest keep their site version and the site's order. The write is refused if anything changed since the sheet opened (hash). Backup first, media copied into `public/{images,videos,audio,models}/projects/studio/`, atomic write, log in `data/publish-log.json`. History lists only backups of the current site; restore refuses a backup from another site folder and is byte-exact (checked on scratch).
  - Accept: The diff sheet (added/changed/removed + media + warnings) matches the actual write. Backup first. Only Live and Unlisted projects are written, site-only slugs are kept, media is copied, and a history log is kept. Restore is byte-exact.
  - Verify: e2e against a scratch copy of the site; byte-compare restore.
  - Files: `server/publish.mjs`, `src/publish/PublishSheet.tsx`, `HistoryList.tsx`

- [x] **T22 Preview + fidelity check** (S)
  - Done: Preview has Full/1440/834/390 widths (`?w=`). `tests/e2e/fidelity.js` (playwright-cli run-code) compares block positions in Studio's preview and the scratch site: 0px drift at all three widths for QA blocks (21 blocks), QA VFX shot and Joi Farm. The 4px drift Tailwind's reset caused on inputs is fixed in `render-more.css`.
  - Accept: Ctrl+P opens the real page at any width with the soundtrack. The fidelity e2e covers 3 templates at 1440/834/390.
  - Verify: `npm run e2e -- fidelity`.
  - Files: `src/preview/*`, `tests/e2e/fidelity.spec.ts`

### Checkpoint F
- [x] Publish one project to the real 48 site **only after your yes**, then check it in `next dev` (approved: all 7 kept live)
  - 2026-10-22: renderer synced into the real site (your yes; edited files backed up in `backups/sync-2026-10-22T14-47-22-546Z`), site tsc passes. A full publish of all 7 projects had already been pressed in Studio at 15:46 IST (backup `2026-10-22T10-16-25-542Z` = the last git commit of `projects.json`). All 9 pages return 200 in `next dev` and render Studio's story with no errors. You chose to keep all 7 live.

## Phase 7: Polish

- [x] **T23 Design and quality pass (impeccable)** (M)
  - Done: the static detector found nothing. A rendered audit of Home, the publish sheet, Media, the editor, the settings drawer and the palette found and fixed: unnamed sliders (they now take their row's label), two text colours under 4.5:1 (the pressed filter count and the canvas width label), small hit areas (caret, switch, chips: 24px+ now), and a 1px focus border on search and chips fields (2px now). Every Tab stop on Home shows the orange ring. Empty, loading (skeletons) and error states (missing project, unknown address, server down) all exist. With 20 sections and 60 images, a layer drag, block drag, pan and scroll all ran at p95 6.2ms per frame (one 67ms frame as a block drag starts). Screenshots at 1440 and 1280 look right.
  - Accept: An impeccable audit and polish leave no criticals. Empty, loading and error states exist. Focus is visible and contrast is ≥4.5:1. Reduced motion is respected. 60fps drag with 20 sections and 60 media items.
  - Verify: impeccable detector · performance trace · screenshots at desktop and laptop sizes.

- [x] **T24 E2E suite, README, memory** (S)
  - Done: `npm run e2e` (`scripts/e2e.mjs`, no new dependencies) runs `tests/e2e/shortcuts.js` against a throwaway server. It has 49 checks covering all 46 registry shortcuts plus Home's N, / and V, and fails any shortcut added later without a test. It found and fixed `?` not closing the shortcuts sheet. The README covers tests, publish and restore; memory is updated.
  - Accept: Every keymap entry is covered by e2e. A plain-language README covers start, panels, shortcuts, publish and restore. The memory note is updated.
  - Verify: `npm run e2e` all green.

### Final checkpoint
- [ ] All SPEC §10 success criteria met · You sign off
  - 1 import keeps all 7 + drafts (unit) · 2 all 12 templates published to the scratch site, each page 200 with no console errors · 3 shortcuts e2e 49/49 · 4 undo/redo property test, 1,000 sequences · 5 fidelity 0px drift at 1440/834/390 · 6 publish = write, backup first, byte-exact restore · 7 drag p95 6.2ms; 6000px upload about 0.4s · 8 focus ring everywhere, chrome contrast ≥4.5:1
