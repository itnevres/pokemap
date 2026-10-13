# Plan 8 Task 2: coordinator record (shared world context mode)

Code range `dc33490..3b7051f` (de33885 hook + tests, 88340ad GBC consumes + M6 fix, 3b7051f GBA consumes); report 862a77c; executed spec `task-2-spec.md` (9dc4294).

- **Gate (implementer, 3b7051f):** `npm test` 156 files, 2,644 pass / 0 fail; typecheck and UI build pass. Oracle `git diff dc33490 -- ':(glob)packages/*/test/**' | grep -E '^-[^-]'` empty.
- **Reviews:** spec (Opus) Spec ✅ 0C/0I/3M + 2 ⚠️; quality (Sonnet) Approved 0C/0I/4M. No fix round. Both ⚠️ (hook-only `native` default unkillable; no `indexOf` site) were answered by the mutation design below.
- **Step 6 mutations** (detached worktree at 3b7051f, `task-2-mutations.mjs` / `.log`; restore byte-identical for all three source files; PerfPlus porcelain empty):

| Mutant | shared | GBA WorldCanvasContext | GBA AppContextEdit | GBC WorldCanvasContext | GBC AppContext | GBC Zoom (new) |
|---|---|---|---|---|---|---|
| M0 baseline | 18P | 37P | 12P | 36P | 23P | 2P |
| M1a hook native forced 16 | KILL | — | — | KILL | KILL | — |
| M1b hook native forced 32 | KILL | KILL | KILL | — | — | — |
| M2 Escape listener bubble phase | KILL | KILL | — | KILL | — | — |
| M3a GBA canvas key toggled | — | KILL | KILL | — | — | — |
| M3b GBC canvas key toggled | — | — | — | KILL | KILL | — |
| M4 outside double-click ignored | KILL | KILL | — | KILL | — | — |
| M5 pre-fix `indexOf` step | KILL | n/a (no GBA step UI, ruling R4) | — | — | — | KILL |
| M6 no focus on exit | KILL | KILL | — | KILL | — | — |
| M7 family `isBlocked` ignored | KILL | KILL | — | KILL | — | — |

  Every plan-named mutant kills in both families except M5 (GBC + shared only, per R4). M1a/M1b together cover "a family's native ignored" in both directions.
- **Step 7 live check** (scratch hub 5184 + `preload.mjs`, scratch `POKEMAP_HOME`, Vite 5183 → `p8`; the Playwright MCP browser was held by another session, so a headless `chromium-1208` was driven over CDP with the cached `playwright-core`; `visibilityState` visible before each write):
  - **GBC PerfPlus NewBarkTown** (1280×860): ContextMenu key → Edit here. Same world canvas node, 0 `/api/world` requests after entry, bar `Editing NewBarkTown in place`, 1× pressed. Map body 320×288 at 1×: **368,640 RGBA bytes, 0 mismatches** world vs overlay. Pencil 0x7 at block (5,4) → `paint/begin, apply, end`. Escape → SaveDialog "maps/NewBarkTown.blk -- 1 block changed", still in context; Escape inside the dialog closes only the dialog, still in context. Undo → `/undo`; Done exits with no dialog, same canvas node, focus on `world-canvas__stage`. Later re-entries show diffs only on the overlay's cyan (34,211,238) cursor-cell outline (240 px), not a misalignment. `NewBarkTown.blk` `0b7d45d…`, `.asm` `56f87ef…` unchanged; porcelain empty, no `.pokemap`.
  - **GBA LittlerootTown** (1280×860): same entry path; same node, 0 `/api/world` after entry. Visible map body 280×320 at 1× (right edge clipped by the stage): **358,400 RGBA bytes, 0 mismatches**. Pencil 0x7 → `begin, apply, end`; Escape → SaveDialog "data/layouts/LittlerootTown/map.bin -- 1 block changed", still in context; Escape in the dialog closes only it; Undo; Done exits clean, same node, focus on the canvas. `map.bin`, `map.json`, `layouts.json`, `world.json` `9c8ab2a…`, `dungeons.json` `f73f9b7…` and the 8-line porcelain unchanged.
  - Not Task 2: GBA with the Pencil metatile strip open moves the stage so the composite's top is clipped; my bbox-based body finder then mis-measures (33,785 "mismatches"), so alignment was measured before the strip opened. A clean paint of the metatile already at a cell (0x1 on grass) leaves the session clean, so Escape exits directly — correct.
