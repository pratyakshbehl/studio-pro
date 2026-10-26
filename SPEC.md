# Spec: Studio Pro — one dashboard for building and publishing the portfolio

Status: **APPROVED** · Written 2026-10-22 · Supersedes `PORTFOLIO/studio` (Behance-style) and `PORTFOLIO/studio-framer` (Framer-style). Both stay on disk untouched.

---

## 1. Objective

### What and why
Two dashboards already exist, each half of what you want:

| | `studio/` (Behance-style, :4747) | `studio-framer/` (Framer-style, :4310) |
|---|---|---|
| Strength | Editing on the page itself, a "+" between blocks, a publish sheet (cover crop, credits, accent), 4 structures, a contact-sheet home | CMS table view, media library, click-the-preview-to-edit, Ctrl+K, publish history, site renderer (`CaseStudyBlocks.tsx`) |
| Gap | No layers, no inspector, no breakpoints, no free layout, few shortcuts | Form-based editing, no on-page editing, no templates beyond one outline |

**Studio Pro** merges both into one pro-level tool. It has a Behance-style flow you build in, Framer-grade tools inside each section, a CMS-grade project manager, a template and section library built for a VFX / 3D / motion / brand / music portfolio, and a safe, reversible publish into the real site.

### User
You: a multidisciplinary creative (3D, VFX, motion, branding, AI, music), newer to code. You'll use it on a desktop. The people who read the output are recruiters, studio leads and clients judging your craft quickly.

### Success looks like
- You can build a full case study in **under 15 minutes** from a template, using only the mouse and the common shortcuts you know from Figma, Framer and Photoshop.
- What you see in the editor matches the live site page **to within 1px** at 1440 / 834 / 390 wide, because both use the same renderer and tokens.
- Nothing reaches the site until you press **Publish**. Every publish is backed up and can be restored in one click.

### Reverse-engineering evidence (observed live, 2026-10-22)
**Behance editor** (logged in, Playwright):
- Layout: 55px top bar (Back · Preview · Save as Draft · Publish). Canvas 1265px wide at a 1600px window. 240px right rail.
- Add Content (8): Image, Text, Photo Grid, Video/Audio, Embed (paste code: XD, Vimeo, YouTube, GIPHY, SoundCloud, Spotify…), Lightroom, Prototype, 3D. Edit Project: Styles, Settings. Plus Custom Button, Attach Assets, and Pro options (Schedule, Password, Link-only).
- **Styles:** page background colour plus *Content Spacing* slider, **0–150px, default 60**.
- **Text toolbar:** style (Header / Subheader / Paragraph / Caption), 12 web fonts, size 9–100, colour, B/I/U, left/centre/right align, link/unlink, clear format, LTR/RTL. Text column is **800px**.
- **Image block:** full-bleed by default, with a "padding to sides" toggle. Edit menu: Reorder, Add Caption, Replace, Delete. Also Add Tags. Inline insert bar between modules (8 icons).
- **Settings sheet:** cover (min **808×632**, GIFs don't animate), title, tags (**≤10**, suggested), categories (**≤3**, from a 120-item list), tools used, visibility (Everyone / Password / Link-only / Private), adult flag, description, licence (6 CC options + All Rights Reserved), disable comments, co-owners, companies/brands/schools, credits, teams.
- **CTA:** Follows & Appreciations · Get Hired · Link Visits · None.

**Framer editor** (logged in, project "Sparkling Objects"):
- Layout: 50px top bar (mode switcher Canvas/CMS/Localization/Analytics/Settings · Insert · Frame · Text · Shape · title + branch · Preview · Invite · Publish). **260px** left panel (Pages / Layers / Assets). **260px** right panel (Agent / Style). Floating bottom toolbar (Select, Hand, Comment, Theme, Zoom %).
- Breakpoint frame **Desktop 1200**. Base typography 16px.
- Insert library: Icons, Shaders (gradient / logo / media), **Media (Image, Video, YouTube, MP3, GIF, Vimeo, Dot Lottie, Spotify, Apple Music, SoundCloud, Podcasts, Simplecast)**, Forms, Interactive (Ticker, Carousel, Slideshow, Cookie Banner, Search, Locale Selector), Social, Utility, Creative (Arc text, Scribbles, Countdown, Time & Date), CMS (Collections, Fields).
- Inspector: align bar (8 buttons) · Link · Position (T/L/R/B pins, Absolute/Relative/Fixed/Sticky) · Size (Fixed/Fill/Fit, Min/Max, aspect lock) · **Layout (Stack/Grid, direction, distribute, align, wrap, gap, padding)** · **Effects (Appear, Hover, Press, Loop, Drag, Lightbox, Ticker, Scroll ▸, Flow)** · Overlays · Cursor · Styles (opacity, visible, fill, overflow, radius, border, shadow) · Transforms · **Text (style preset, font, weight, colour, size px, letter em, line em, align, auto/fixed, variable, OpenType)** · Scroll section · Accessibility tag · Code overrides.
- Shortcuts (from its menus): Undo Ctrl+Z · Redo Ctrl+Shift+Z · Duplicate Ctrl+D · Delete · Find Ctrl+F · Rename Ctrl+R · Lock Ctrl+L · Hide Ctrl+; · Select all Ctrl+A / siblings Ctrl+Shift+A · Select parent Esc · Preview Ctrl+P · Panels Shift+Alt+1/2/3 · Rulers Ctrl+Shift+R · Guides Alt+G · Zoom Ctrl+= / Ctrl+– / 100% Shift+0 / fit Shift+1 / selection Shift+2 · Insert I · Text T · Link L · Scale K · Zoom Z · Comment C · Add frame Ctrl+Enter · Add stack Ctrl+Alt+Enter · Remove wrapper Ctrl+Del · Fit content Shift+A · Bring to front ] · Send to back [ · Forward/back Ctrl+Alt+↑/↓ · Quick actions Ctrl+K.

**Your site (48 copy)** is the sizing truth. Gutters are **24px on phones and 40px from 768px** (`px-6 md:px-10`). Title display is 11vw on phones and `text-7xl` from md, max-w-4xl. The cover is 16:9 with a 1rem radius (`rounded-2xl`). Description uses an 8/4 split on a 12-column grid. Tokens: bg `#0a0a0a`, surface `#121212`, text `#f2ede4`, muted `#8a8580`, border `#3a3733`, accent `#f0552a`. Font: Jost. Ease `cubic-bezier(.16,1,.3,1)`.

---

## 2. Capability map (Phase 0)

The request bundles separable capabilities, so the work is split into modules. Ids are fixed from here on.

| Module id | Responsibility | Depends on |
|---|---|---|
| `core-model` | Project/Section/Block schema, migrations, undo/redo history, validation, site-format serializer | — |
| `server` | Local Node server: projects API, media upload + optimisation, autosave files, publish/backup/restore | core-model |
| `renderer` | One renderer for blocks/sections used by the editor canvas, preview, *and* the site (`CaseStudyBlocks.tsx` port) | core-model |
| `editor` | The canvas: selection, insert, drag, resize, text editing, layers, inspector, breakpoints, shortcuts, context menus | core-model, renderer |
| `library` | Templates (whole case studies), section presets, block presets, style presets | core-model, renderer |
| `cms` | Projects home: grid/table, filters, tags, categories, ordering, bulk actions, project settings sheet | core-model, server |
| `media` | Media library: images, video, audio (waveform, BPM/key/mood), alt text, focal point, colour extraction, usage | server |
| `publish` | Diff preview → backup → write site `projects.json` + copy media, history, restore, site renderer update | server, renderer |

Build order: `core-model` → `server`, `renderer` → `editor`, `media` → `library`, `cms` → `publish`.

---

## 3. Feature scope

### 3.1 Projects home (`cms`)
- Two views: **Grid** (covers, Live/Draft/Unlisted stamps, featured star, accent dot) and **Table** (title, category, tags, year, status, updated, order). Toggle with `V`.
- Search `/` · filter by status, category, tag, year, featured · sort · drag to set site order (grid and table) · multi-select with Shift/Ctrl-click → bulk status / feature / tag / duplicate / archive.
- **Statuses:** Draft · Live · Unlisted (published but left out of the work index) · Archived. Archive never deletes; "Delete" moves to `data/.trash/`.
- New project → **template picker** (3.4) or blank.
- Import from `studio/`, `studio-framer/` and the site's current `projects.json`, de-duplicated by slug, so nothing is lost from either old app.

### 3.2 Project settings sheet (Behance "Continue" + Framer CMS fields)
- **Cover:** upload or pick from media. Two crops: **16:9** (site cover) and **4:3** (spiral showcase, `cover.spiral`), each with a focal point. Minimum 1616×909 is recommended, with a warning below that. A cover can be a video with an auto poster.
- Title · slug (auto, editable, unique check) · summary (160 chars, counter) · description · year · client/brand · role (multi) · **tools** (autocomplete from a curated list of ~60: Blender, Houdini, Cinema 4D, Maya, ZBrush, Substance 3D, Unreal, Nuke, After Effects, Premiere, DaVinci Resolve, Photoshop, Illustrator, Figma, ComfyUI, Midjourney, Runway, Kling, Higgsfield, Ableton, FL Studio, Logic…).
- **Categories:** ≤3, from a creative list tuned to your work (3D Art, CGI, VFX, Motion Graphics, 3D Motion, Animation, Product Viz, Packaging, Brand Identity, Art Direction, Creative Direction, Event / Spatial Viz, AI Generation, Music, Sound Design…). Custom categories are allowed.
- **Tags:** ≤10, with suggestions drawn from the title, category and tools. Tags are shared across projects and managed in Settings.
- **Credits:** people and roles (reorderable). **Facts:** label and value pairs (e.g. *Render time: 14h*, *Frames: 240*).
- **Accent colour:** sampled from the cover (5 swatches) or custom. It drives the page accent.
- **Soundtrack (optional):** a track from the media library. Visitors get a play/mute pill. It never autoplays with sound, and it fades in and out.
- **CTA at page end:** Contact me · Hire me · External link · Next project only · None.
- **SEO:** meta title, description, OG image (auto 1200×630 crop of the cover).
- **Featured on homepage** toggle · licence (Behance's 7 options).

### 3.3 Editor (`editor`): the core
**Model:** a page is a vertical stack of **sections** (Behance flow, always responsive). Each section has a **layout**:
- `flow`: blocks stack in a column (content width Narrow 800 / Text 1040 / Wide 1360 / Full-bleed).
- `stack`: horizontal or vertical stack with gap, distribute, align and wrap (Framer Stack).
- `grid`: 1–12 columns, row gap, column gap, per-block column/row span (Framer Grid).
- `canvas`: free placement. x/y/w/h in % of section width, rotation, z-order, per-breakpoint overrides (Framer frame). It collapses to `flow` on phone unless a phone override exists.

**Breakpoints:** Desktop (≥1280, preview 1440) · Tablet (768–1279, preview 834) · Phone (<768, preview 390). These match the site's real Tailwind `md`. Edits made on Desktop cascade down. Edits made on Tablet or Phone are **overrides**, shown with a blue dot, and can be reset per property.

**Layout of the screen:** 48px top bar · 260px left panel (Pages-of-project outline / **Layers** / **Insert** / **Media**) · centre canvas (zoomable 10–400%, the real site renderer on the site's dark theme) · 280px right **Inspector** · floating bottom toolbar (Select V, Hand H, Comment C, breakpoint switch, zoom). The panel widths follow Framer's 260px rails. The right rail is 20px wider for the extra Behance-style controls.

**Selection and transform tools**
- Click to select, Shift-click to add, drag on empty canvas for marquee, Esc to go to the parent, Enter to go into children, double-click to edit text or crop an image.
- Move by drag, with **smart guides and snapping** (edges, centres, gutters, 8px grid, other blocks). Hold Alt to show distances, and Alt-drag to duplicate. Arrow keys nudge 1px, Shift+Arrow nudges 10px.
- Resize with 8 handles: Shift locks the ratio, Alt resizes from the centre. Rotate by dragging just outside a corner (Shift snaps to 15°).
- Align and distribute bar (8 buttons, same as Framer). Z-order with `]` `[` and Ctrl+Alt+↑/↓.
- Group Ctrl+G / ungroup Ctrl+Shift+G · wrap in stack Ctrl+Alt+Enter · remove wrapper Ctrl+Del.
- Lock Ctrl+L · hide Ctrl+; · rename Ctrl+R · duplicate Ctrl+D · copy, cut and paste (also between projects) · copy style Ctrl+Alt+C / paste style Ctrl+Alt+V.

**Inspector sections** (only the ones that apply to the current selection appear):
Position (pins and type) · Size (Fixed/Fill/Fit, min/max, aspect lock) · Layout (flow/stack/grid/canvas settings) · Spacing (padding, margin, section spacing 0–150px, default 60, same as Behance) · Styles (fill: colour/gradient/image, opacity, radius with linked/independent corners, border, shadow, blur, blend mode, overflow) · **Typography** (preset, font, weight, size, line height, letter spacing, align, case, colour, balance) · **Media** (replace, crop, focal point, fit cover/contain, aspect presets 1:1 4:5 3:2 16:9 21:9 2.39:1 9:16, alt text, caption, lazy, poster, loop/muted/autoplay, playback speed) · **Effects** (Appear: fade/slide/scale/blur/mask-wipe, with delay and duration · Hover · Scroll: parallax speed, sticky, scroll-linked scale/opacity · Loop · Lightbox on click) · Transforms (rotate, scale, skew) · Link · Accessibility.

**Text editing:** an inline floating toolbar while typing (Behance-style), with H1/H2/H3/Lede/Body/Caption/Label presets mapped to your site's type tokens, bold, italic, underline, strike, link, bullet and number lists, accent highlight, align, and clear format. Markdown shortcuts work: `#`, `##`, `-`, `1.`, `>`, `**bold**`. Paste from Docs or Notion keeps structure but drops their styling.

**Insert (`I` or the "+" between sections and blocks):** searchable, grouped like Framer's Insert panel:
- *Basics:* Heading, Text, Image, Video (file/YouTube/Vimeo), Audio, Button, Divider, Spacer.
- *Media layouts:* Pair (50/50, 60/40, 40/60), Triptych, Grid (2–6 cols), Masonry, Bento, Carousel, Slideshow, Ticker / marquee strip, Lightbox gallery.
- *Case-study:* Before/after compare slider, **Layer breakdown** (plate → CG → comp, scrubbable), Turntable (image sequence or video scrub), Stat row, Facts/specs table, Credits, Quote, Process timeline, Colour palette, Type specimen, Prompt card (for AI work: prompt, model, seed, settings), Moodboard.
- *Music and audio:* Audio player with waveform and chapters, Tracklist, **Spotify / Apple Music / SoundCloud / YouTube Music / Podcasts embeds** (paste a link and it's detected), Soundtrack pill.
- *Embeds:* Sketchfab / 3D model (GLB via `<model-viewer>`), Lottie, Figma, CodePen, Behance, Instagram, Vimeo, YouTube, any iframe. A paste-a-URL auto-detector picks the right one.
- *Sections:* every preset from the library (3.4).

**Drag and drop:** drop files from Explorer anywhere (one image becomes an Image block, several become a Grid, video becomes Video, audio becomes Audio). Drag blocks between sections and into grid cells. Drag from the Media panel onto the canvas.

**History:** unlimited undo/redo for the session (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y), plus a History panel with named snapshots ("Version: before client feedback") stored on disk. Autosave runs 800ms after the last change, with a visible "Saved" state.

**Other:** right-click context menus everywhere · **Ctrl+K command palette** (every command, every project, every block type) · **`?` shortcut sheet** · rulers Ctrl+Shift+R and draggable guides · outline view (Alt+O) · **Preview Ctrl+P** (new tab, the real page at any width, plus soundtrack) · comments/notes pinned to blocks (`C`) as private notes to yourself.

### 3.4 Library (`library`)
**Whole-project templates** (each is a full, realistic case-study skeleton with sample copy prompts and image slots, not lorem ipsum):
1. **Classic Case Study:** Hero → Brief → Role & tools → Process → Outcome → Credits
2. **Product Viz / CGI:** Hero render → Range lineup → Material breakdown compare → Detail grid → Turntable → Specs facts
3. **VFX Breakdown:** Final shot → Layer breakdown (plate/CG/comp) → Before/after sequence → Shot list facts → Tools
4. **Motion / Animation:** Hero video → Styleframes grid → Storyboard strip → Process → Soundtrack
5. **Brand Identity:** Logo hero → Concept → Palette → Type specimen → Applications bento → Mockups
6. **Packaging:** Hero pack → Range → Dieline / materials → Shelf lineup → Credits
7. **Event / Spatial Viz:** Wide hero → Walkthrough video → Plan vs render compare → Moments grid
8. **AI Exploration Series:** Statement → Prompt cards → Series masonry → Process notes → Models used
9. **Music Release:** Cover art → Player with waveform → Tracklist → Streaming embeds → Credits
10. **Long Read:** Text-first essay layout with pull quotes and inline figures
11. **Quick Shot:** One hero and three images, for small pieces
12. **Blank**

**Section presets** (~30): 5 heroes (full-bleed media, title over media, split, video, type-only), 4 text (lede, two-column, pull quote, numbered steps), 10 media layouts, 6 case-study sections, 3 music, CTA/contact, Next project.

**Style presets:** text presets mapped to site tokens, colour styles (bg/surface/text/muted/accent plus a per-project accent), effect presets (Fade up, Mask wipe, Parallax slow, Sticky story).

You can save your own sections and templates ("Save selection as section").

### 3.5 Media library (`media`)
- Upload by drag, paste or file picker, with progress. Images over 2880px are resized to 2880 WebP (originals kept in `media/originals/`), with 480/960/1600 thumbnails. Videos get an auto poster at 1s. Uploads never overwrite: a clash becomes `name-2.ext`.
- Images, Video, Audio and Files tabs · grid/list · search · tags · **unused-media** filter · "used in" links.
- Per-asset: alt text (required before publish, with a warning), focal point, dominant colours, dimensions, file size, a heavy-file warning (>8MB image, >40MB video).
- **Audio:** waveform, duration, BPM (auto-detected, editable), key, mood tags, loop in/out points.

### 3.6 Publish (`publish`)
- **Publish** button with a pending-changes count. It opens a **diff sheet** listing, per project, what will be added, changed or removed on the site, plus media to copy and warnings (missing alt text, no cover, empty blocks).
- On confirm: back up the site's `data/projects.json` to `studio-pro/backups/<timestamp>/`, write Live and Unlisted projects (Drafts and Archived stay in Studio), copy media to `public/images/projects/studio/` and `public/videos/projects/studio/`, keep any site-only projects, and log the run in History.
- **Restore** any backup in one click (this creates a fresh backup first).
- **Site renderer:** extend the 48 copy's `components/work/CaseStudyBlocks.tsx` and `types/project.ts` to render every new block, section layout, breakpoint override and effect. Projects without blocks render exactly as today. `npx tsc --noEmit` must pass.

### Out of scope (v1)
Online hosting or sync · multi-user collaboration · AI agent panel · Localization · Analytics · CMS collections other than Projects · code components.

---

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| App | **React 19.3 + TypeScript 7**, built with **Vite 8** (Vitest 5 for tests) | An editor this size (layers, inspector, canvas, undo) needs components and types. It's the same React your site uses. |
| State | **Zustand 5** (already in your site) + **Immer 11** patches for undo/redo | Small, fast. Patches make history cheap and exact. |
| Rich text | **TipTap 2** (ProseMirror) | Inline toolbar, markdown shortcuts, clean paste. |
| Drag and drop | **dnd-kit** | Accessible sorting for sections, layers and grid cells. |
| Canvas transforms | Own code (pointer events, snapping engine) | Framer-style move, resize, rotate and smart guides. No library does this well. |
| Audio | WaveSurfer.js 7 | Waveforms, regions for loop points. |
| 3D embed | `@google/model-viewer` | GLB turntables without three.js setup. |
| Server | **Plain Node 24** (`node:http`), no framework | Same zero-setup approach as both old studios. |
| Image processing | Browser-side `OffscreenCanvas` → WebP | No native packages to break on Windows. |
| Fonts/tokens | Jost + your site's tokens, imported from the 48 copy | The editor looks exactly like the live page. |

**You never have to build anything yourself.** `Start Studio Pro.bat` runs the prebuilt app. I rebuild it whenever I change code.

---

## 5. Commands

Run these from `PORTFOLIO/studio-pro/`.

```
Start (you):      Start Studio Pro.bat        → http://localhost:4800
Start (terminal): node server.mjs
Dev (me):         npm run dev                  → Vite on :5173, proxies /api to :4800
Build:            npm run build                → dist/
Type-check:       npm run typecheck            (tsc --noEmit)
Lint:             npm run lint
Unit tests:       npm test                     (vitest run)
E2E tests:        npm run e2e                  (playwright test, runs against a scratch site copy)
Site check:       npx tsc --noEmit             (inside the 48 site copy, after renderer changes)
```

---

## 6. Project structure

```
studio-pro/
  SPEC.md                 this file
  tasks/plan.md           implementation plan (after approval)
  tasks/todo.md           task checklist
  server.mjs              local API + static server (:4800)
  server/                 projects, media, publish, backup modules
  src/
    model/                core-model: schema.ts, migrate.ts, history.ts, serialize-site.ts
    render/               renderer: Block/Section components shared with the site
    editor/               canvas, selection, snapping, inspector/, layers/, insert/, text/
    library/              templates/, sections/, presets
    cms/                  home grid/table, settings sheet
    media/                library UI, uploads, audio analysis
    publish/              diff sheet, history
    ui/                   design-system primitives (Button, Field, Slider, Popover, Menu…)
    shortcuts.ts          single keymap table, also feeds the ? sheet and Ctrl+K
  data/
    projects/<id>.json    one file per project
    settings.json         site path, tags, categories, tool list
    snapshots/            named versions
    .trash/               soft-deleted projects
  media/                  uploads (+ originals/, thumbs/)
  backups/                site projects.json backups per publish
  tests/unit/             vitest
  tests/e2e/              playwright
```

---

## 7. Code style

```ts
// src/model/schema.ts — data is plain, serialisable, versioned.
export type Breakpoint = "desktop" | "tablet" | "phone";

export interface Section {
  id: string;
  name: string;                       // shown in Layers
  layout: SectionLayout;              // flow | stack | grid | canvas
  style: SectionStyle;                // bg, padding, width
  blocks: Block[];
  overrides?: Partial<Record<Exclude<Breakpoint, "desktop">, SectionPatch>>;
}

// Commands are the only way to change a project, so undo, autosave
// and the shortcut sheet all share one list.
export const moveBlock = command("block.move", (draft, { id, to }: MoveArgs) => {
  const block = takeBlock(draft, id);
  insertBlock(draft, to, block);
});
```

- Files are kebab-case, components PascalCase, commands `noun.verb`.
- No `any`. Each schema change bumps `schemaVersion` and adds a migration.
- UI copy is plain and short. Errors say what happened and what to do next.
- Comments explain *why*, not *what*.

---

## 8. Testing strategy

| Level | Tool | Covers |
|---|---|---|
| Unit | Vitest | schema validation, migrations, every command + undo/redo round-trip, snapping maths, breakpoint cascade, site serializer (lossless against today's `projects.json`) |
| Component | Vitest + Testing Library | inspector fields, text toolbar, insert search |
| E2E | Playwright | build a case study from each template · keyboard-only editing of a section · breakpoint overrides · drag-drop upload · publish to a **scratch copy** of the site and diff the result · restore |
| Visual | Playwright screenshots | editor canvas vs real site page at 1440/834/390 (target ≤1px drift) |
| Design QA | impeccable audit + polish passes | contrast, focus states, motion, empty/error states |

Coverage target: 90% on `src/model`. Every shortcut in `shortcuts.ts` has an e2e assertion.

---

## 9. Boundaries

- **Always:** Write to the site only from the Publish button, and only after a backup. Test publish against a scratch copy before the real one. Keep `studio/` and `studio-framer/` untouched. Keep everything working offline on `localhost`. Run typecheck and tests before handing over.
- **Ask first:** Changing the 48 site's files beyond `CaseStudyBlocks.tsx` and `types/project.ts`. Adding a dependency not listed in section 4. Changing the site's tokens or fonts. Touching the 96 copy. Moving or deleting anything.
- **Never:** Delete files (soft-delete to `.trash/` only). Publish to the internet, push to git, or upload your media anywhere. Overwrite an upload. Write to Behance or Framer accounts.

---

## 10. Success criteria (testable)

1. Importing from both old studios plus the site yields **all 7 site projects** and every studio-only draft, with no field lost (unit test vs fixture).
2. Each of the **12 templates** builds a complete page that publishes and renders on the site without type errors.
3. All shortcuts in section 3.3 work, are listed in the `?` sheet and in Ctrl+K, and pass e2e.
4. Undo/redo restores the exact previous state for every command (property test, 1,000 random command sequences).
5. Editor canvas vs live site page: ≤1px layout drift at 1440, 834 and 390 (screenshot diff).
6. Publish diff matches what is actually written. A backup exists before every write, and restore reproduces the old file byte-for-byte.
7. A 20-section project with 60 media items stays at 60fps while dragging. A 4K image is resized and shown in under 3s.
8. Keyboard focus is visible everywhere. Text contrast is ≥4.5:1 in the dashboard chrome.

---

## 11. Decisions (resolved 2026-10-22)

1. **Dashboard look:** neutral pro-tool chrome (Framer/Figma-like), with burnt orange `#f0552a` as the only accent. The canvas renders the real dark site.
2. **Name:** Studio Pro, in `PORTFOLIO/studio-pro`, on localhost:4800.
3. **Dependencies:** approved for the packages listed in section 4.
4. **Old studios:** kept as they are and imported from. No README changes.
5. **Spec approved** by the user, 2026-10-22.
