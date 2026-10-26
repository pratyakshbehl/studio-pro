# Studio Pro

One place to build case studies for your portfolio and publish them to your website. It replaces the two earlier studios (`studio/` and `studio-framer/`). Both are still there, untouched.

The plan is in [SPEC.md](SPEC.md) and [tasks/todo.md](tasks/todo.md). All seven phases are built: projects and import, the editor, grids and the deep panels, templates and section presets, project and media management, publishing to the site, and a quality pass.

## Start it

Double-click **Start Studio Pro.bat**. A black window opens; keep it open while you work. Your browser opens at http://localhost:4800.

Or in a terminal, from this folder:

```
node server.mjs
```

## The editor

Click any project to open it. The middle is your **real case-study page**, drawn exactly as your site draws it, at desktop (1440), tablet (834) or phone (390) width. Switch sizes at the top.

- **Left: Layers.** The page parts (Title, Cover, Intro, Next project) and your story's sections and blocks. Click to select, double-click to rename, drag to reorder. Use the eye to hide and the lock to lock.
- **Left: Insert.** Every block and section type. Click to add after whatever is selected.
- **Left: Media.** Every image, video and audio file you've uploaded plus the site's own images. Drag one onto the page, or click it to replace the selected image. *In use* marks the ones already on this page.
- **Left: History.** Every change this session (click one to go back to it) and named **versions** you save before big changes. Restoring a version saves your current state as a version first, and is one undo.
- **Right: the inspector.** Settings for whatever is selected, in two tabs: **Content** (what it says and shows) and **Design** (max width, spacing, fill, corners, border, shadow, opacity, blend, typography, appear/hover/parallax effects, rotate and scale). With nothing selected it shows the project details and page settings.
- **On the page:** click to select, and **drop images or videos straight onto the page**. One image becomes an Image block; several open a layout picker (photo grid or bento). Drop onto an existing image or gallery to replace or add to it.
- **Insert bar:** hover between blocks and an *Insert* bar appears: Image, Text, Photo grid, Video, Audio, Embed (Spotify, SoundCloud, Figma…), 3D (Sketchfab), Layouts, Section, and More.
- **Grids:** a gallery is a **Photo grid** (keeps every image's shape; rows line up edge to edge), a **Bento** (big + small cells you fill), a **Uniform grid** or **Masonry**. Switch any time from the toolbar's layout button. In a bento, drag the dividers to resize (they snap to halves, thirds and quarters; hold Alt for free sizing) and drag the bottom handle to change its height.
- **Images inside a grid:** click a gallery, then click an image to select it. Drag it onto another to swap; use **Focal point** to choose what stays in frame; drop a file on a cell to fill it.
- **Floating toolbar:** whatever you select gets a small toolbar above it with the common actions (layout, replace, width, align, move, duplicate, delete, more).
- **Editing words:** double-click a heading, text or quote (or press `Enter`) and type right on the page. Text blocks get a formatting bar (bold, italic, underline, strike, highlight, lists, quote, link). `- ` starts a list, `1. ` a numbered one, `> ` a quote. Pasting from Docs or Notion keeps the words and drops the styling. `Esc` or a click elsewhere finishes; `Ctrl Z` steps back through your typing.
- **Moving things:** drag a block to a new place in the story (a line shows where it lands), or drag a section between sections.
- **Free canvas:** set a section's layout to *Free canvas* and everything stays exactly where it was, now placed freely. Drag to move, use the 8 handles to resize (Shift keeps the shape, Alt resizes from the centre) and drag just outside a corner to rotate (Shift snaps to 15°). Edges and centres snap to the section, other blocks, guides and columns, with lines showing the match; hold Ctrl to place freely. Arrow keys nudge 1px (Shift: 10px); `]` and `[` change the stacking order.
- **Rulers, guides and columns:** `Ctrl Shift R` shows rulers in page pixels. Drag out of a ruler for a guide; drag it back to remove it. `Shift G` overlays the layout columns (12 on desktop, 8 on tablet, 4 on phone). Hold **Alt** to see the distance from the selection to whatever is under the pointer.
- **New project** opens a picker of 12 templates (classic case study, product viz, VFX breakdown, motion, brand, packaging, event, AI series, music release, long read, quick shot, blank). The words are prompts telling you what to write; the empty boxes take your images.
- **Sections library:** Insert › Sections (or the insert bar's *Section* button) has 32 ready-made sections, each drawn as a sketch of its real blocks. Select a section, or some blocks, and choose *Save to Your sections* (right-click or `Ctrl K`) to reuse it in any project.
- **More blocks:** Carousel, Slideshow, Ticker and Moodboard layouts for galleries; Layer breakdown (plate → CG → comp, scrubbed), Turntable (drag to turn), Stat row, Colour palette, Type specimen, Prompt card (for AI work), Process timeline, Button, Credits; Audio with a waveform and chapters, Tracklist, 3D model (GLB) and Lottie. Drop files straight on them: passes fill a breakdown in order, renders fill a turntable sorted by file name, audio files become tracks.
- **Soundtrack:** in the page settings, give the project a track. Visitors get a small pill that never plays by itself and fades in and out.
- **Right-click** anything (on the page or in Layers) for a menu of what you can do to it. **`Ctrl K`** opens the command palette: run any command, add any block, jump to any section or block, or open another project.
- **Tablet and phone:** layout changes made at those sizes apply to that size only. A blue dot marks them; click it to go back to the desktop value. Text and images are shared across sizes.
- **Saving** is automatic. The top bar shows *Saved*. **Preview** opens the page as a visitor sees it, in a new tab.

## Keyboard

Press `?` in the editor for the full sheet. The essentials:

| Key | Does |
|---|---|
| `Ctrl Z` · `Ctrl Shift Z` | Undo · redo |
| `Ctrl C` / `X` / `V` | Copy, cut, paste. Pasting an image or a YouTube/Vimeo link adds it to the page. |
| `Ctrl D` · `Delete` | Duplicate · delete |
| `Alt ↑` / `Alt ↓` | Move a block up or down the story |
| `Enter` · double-click | Edit the selected block's words on the page |
| `Ctrl K` | Command palette |
| `← → ↑ ↓` · `]` `[` | Free canvas: nudge · stacking order |
| `Ctrl Shift R` · `Shift G` · hold `Alt` | Rulers · columns · distances |
| `L` `I` `M` · `Shift H` | Layers, Insert, Media · History |
| `Esc` | Select the parent (image → gallery → section), then nothing |
| `Alt 1` / `2` / `3` | Desktop, tablet, phone |
| `Space` + drag · scroll | Move around the canvas |
| `Ctrl` + scroll · `Shift 1` | Zoom · fit to screen |
| `Ctrl P` | Preview |

On the projects screen: `N` new project · `/` search · `V` grid or table · `Ctrl` or `Shift` click to select several.

## Projects and media

- **Projects** (the home screen): filter by status, category, tag, year or featured, and sort. With *Site order* and no filters, drag cards (or table rows) to set the order on your site. Ctrl/Shift-click to select several; a bar appears to set their status, feature them, tag them, duplicate them or move them to the trash. **Trash** lists deleted projects with *Restore*; nothing is ever erased.
- **Project settings** (the ⋯ on a card, *Settings* in the editor, or `Ctrl ,`): cover with separate 16:9 and 4:3 crops and focal points, address, summary, categories, tags with suggestions, tools, credits, facts, an accent colour picked from the cover, soundtrack, end-of-page button, search and sharing image, licence.
- **Media** (top bar): every upload and the site's own images. Filter to unused files, files missing alt text, or heavy files; see which projects use each file; give files default alt text, tags and a focal point. Audio shows its waveform, tempo and key (detected; correct them by ear), mood and a loop.
- **Uploads:** images over 2880px are saved as a 2880px WebP and the full-size original is kept in `media/originals/`. Every photo also gets 480/960/1600px copies, which phones and grids load instead. Videos get a poster frame.

## Where things live

| Folder | What's in it |
|---|---|
| `data/projects/` | One file per project |
| `data/snapshots/` | Earlier versions |
| `data/.trash/` | Deleted projects (never really deleted) |
| `media/uploads/` | Everything you drop in, by month. Files are never overwritten. |
| `media/imported/` | Media copied from the old studio |
| `data/settings.json` | Which site copy to publish to (`siteDir`) and project order |
| `data/library/sections.json` | Your saved sections |
| `data/media-meta.json` | Alt text, tags, focal points and audio notes for media files |
| `media/originals/` | Full-size originals of images that were resized on upload |
| `backups/` | The site's `projects.json` before every publish and restore, and site files before each renderer sync (`sync-*`) |
| `data/publish-log.json` | Every publish and restore |

## Checking it still works

```
npm test
npm run e2e
```

`npm test` runs the unit tests (the data model, import, layouts, publishing). `npm run e2e` starts a throwaway copy of Studio with its own data in your temp folder, opens it in a hidden browser and presses every keyboard shortcut, checking each one did its job. It never touches your projects, media or website. It needs `playwright-cli` installed globally (it already is on this machine).

`tests/e2e/fidelity.js` compares Studio's preview with the site's page for one published project, block by block, at 1440/834/390. It needs Studio and a site dev server running; how to run it is at the top of the file.

## Publishing to your site

Studio only writes to your site when you press **Publish** (top bar on Home and in the editor; the number is how many projects would change).

- The sheet lists what's new, updated and taken off the site (Drafts and Archived come off), the media it will copy and anything to fix first. **Untick a project** to leave its site version alone this time. Projects that exist only on the site are never touched.
- Before writing, the site's current `data/projects.json` is copied into `backups/`. Media goes into the site's `public/…/projects/studio/` folders; nothing is ever removed from the site.
- **History and restore** (second tab) lists every backup of this site. *Restore* puts that exact file back, after backing up what's there now, so a restore can be undone the same way.
- **Preview** (`Ctrl P`) shows the page as the site will render it, at full width or 1440/834/390.

The site needs Studio's page renderer once (and again after renderer changes). Look first, then write:

```
node scripts/sync-renderer.mjs --dry --diff
node scripts/sync-renderer.mjs
```

It adds `components/work/studio/` and edits `types/project.ts` and `app/work/[slug]/page.tsx` (backed up to `backups/sync-…` first). Use `--site <folder>` to target a different site copy.
