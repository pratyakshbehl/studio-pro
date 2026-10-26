# Implementation Plan: Studio Pro

Source of truth: [`../SPEC.md`](../SPEC.md) (approved 2026-10-22). Tasks are tracked in [`todo.md`](todo.md).

## Overview
Studio Pro is one local app at `PORTFOLIO/studio-pro` (localhost:4800). You build case studies in it as a Behance-style stack of sections, edit each section with Framer-grade tools, manage projects like a CMS, and publish safely into the 48 site copy. It replaces the two half-dashboards (`studio/`, `studio-framer/`) and imports everything from both. Neither is modified.

## Architecture decisions
1. **One renderer, two hosts.** `src/render/` holds plain React components with no Next or Vite APIs, using `<img>` with `srcset`. The editor canvas uses them directly. The site gets a copy in `components/work/studio/`, with `CaseStudyBlocks.tsx` delegating to it. Same markup and same tokens mean the editor can't drift from the site. A `npm run sync-renderer` script copies the files and runs `tsc` in the site.
2. **The data model extends, never breaks, the site's `Project`.** New optional `page: { sections: Section[] }`. Legacy `blocks` stay readable, and projects without `page` render exactly as today. `schemaVersion` plus migrations live in `src/model/migrate.ts`.
3. **Commands only.** Every edit is a named command (`block.move`, `section.setLayout`…) applied through Immer. The recorded patches give exact undo/redo, autosave diffs, and one keymap that also feeds the `?` sheet and Ctrl+K.
4. **Breakpoint cascade.** Values are stored for desktop. Tablet and phone hold sparse `overrides`. The resolver is `resolve(node, bp) = merge(desktop, tablet?, phone?)` down to the active breakpoint, matching the site's Tailwind `md` (768) and a 1280 desktop.
5. **Canvas sections use percentages.** x/y/w are % of section width, and h is an aspect ratio. A layout drawn at 1440 then scales exactly at any width. Phone falls back to a flow stack unless a phone override exists.
6. **Server stays dependency-free Node** (`node:http`). Files on disk are the database: one JSON per project, written atomically (write tmp → rename). Media processing (resize to WebP, thumbs, posters, waveform peaks) runs in the browser through OffscreenCanvas and WebAudio, so there are no native packages.
7. **Safety rails.** The site is only written by Publish. Every publish backs up first, and test publishes go to a scratch copy in the session scratchpad. Deletes are soft (`data/.trash/`).

## Dependency graph
```
core-model (schema, commands, history, migrate, serialize-site)
   ├── server (projects API, autosave, media API, backups)
   │      ├── cms (home, settings sheet)
   │      ├── media (library, upload pipeline, audio analysis)
   │      └── publish (diff, backup, write, restore) ──┐
   └── renderer (sections + blocks + effects)          │
          ├── editor (canvas, selection, inspector,    │
          │          layers, insert, text, shortcuts)  │
          ├── library (sections, templates)            │
          └── site port (48 copy) ─────────────────────┘
```

## Phases and order
Risky work comes first. The renderer-vs-site fidelity and the canvas transform engine are the two places this could fail, so both land in Phases 2–3, before content volume (blocks, templates) piles on top.

| Phase | Tasks | Result you can see |
|---|---|---|
| 1 Foundation | T1–T3 | App opens at :4800 and shows all imported projects |
| 2 Editor core | T4–T7 | Open a project, add/remove/reorder blocks, drop images, undo, autosave |
| 3 Pro tools | T8–T12 | Inspector with breakpoints, inline text editing, free canvas with snapping, every shortcut, crop/effects |
| 4 Content | T13–T16 | All block types, music and embeds, 30 section presets, 12 templates |
| 5 CMS & media | T17–T19 | Full projects home, settings sheet, media library |
| 6 Publish | T20–T22 | Site renders it all; publish/restore; Ctrl+P preview |
| 7 Polish | T23–T24 | Design and accessibility pass, e2e suite, your README |

Each phase ends with a checkpoint where you try it before I continue.

## Parallelization
Once T4's renderer contract is fixed, **T13 (blocks)**, **T15/T16 (library)** and **T19 (media)** are independent and can run in separate sessions on separate files. Everything in Phase 3 touches the editor core, so that runs sequentially. T20 (site port) can run alongside Phase 5.

## Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Editor and site drift apart visually | High | Shared renderer (decision 1) + screenshot diff at 1440/834/390 in CI-style e2e |
| Free canvas becomes unusable on phones | High | Percent geometry + automatic phone flow fallback + phone override UI |
| Rich text (TipTap) output differs from site styling | Med | Constrain the schema to preset marks/nodes. The renderer owns all text CSS. |
| Big 4K/8K renders slow the editor | Med | Upload pipeline makes 480/960/1600/2880 sizes. The canvas uses the smallest size that fits the zoom. |
| Undo stack bugs corrupt a project | High | Property test (1,000 random command sequences round-trip); atomic writes; named snapshots |
| Publish clobbers site data | High | Backup-first, diff sheet, scratch-copy e2e, keep site-only slugs, one-click restore |
| Scope is huge | Med | Vertical slices; each checkpoint is usable on its own; library and blocks can be parallelized |
| Windows path/space issues ("CODE SESH", "Copy - Copy") | Med | Always `path.join`, quote paths, and test with the real folder names |

## Open questions (none blocking)
- **T20** adds a new folder `components/work/studio/` in the 48 site, beyond the two files the spec pre-approved. I'll show you the diff and ask at the Phase 6 checkpoint before writing it.
