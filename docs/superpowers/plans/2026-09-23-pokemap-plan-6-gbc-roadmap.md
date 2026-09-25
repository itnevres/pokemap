# PokeMap Roadmap — Game Boy / GBC Family (Plan 6+)

> **For agentic workers:** This is the overarching plan for a SECOND engine family, parallel to Plan 0's own GBA-family roadmap. Read it before executing Plan 6 or Plan 7. It defines the conventions, invariants, and package layout specific to the Game Boy/GBC (pret-style) disassembly family — pokecrystal first, pokeyellow as a later, lighter follow-on. Plan 0 (GBA family) is unaffected and untouched by any of this.

**Goal:** Extend PokeMap into a full standalone editor (painting, collision, events, world-view, encounter atlas — the same scope Plan 0-5 deliver for the GBA family) for Pokémon Crystal's decomp, using primitives general enough that Pokémon Yellow can reuse them later without a second from-scratch effort.

**Origin:** Requested 2026-09-23, after Plan 2 and its 5 immediate follow-ups shipped for the GBA family. Two Explore-agent surveys (this session, reports archived in this plan's own commit) read `C:\Programming Projects\Pokemon Game\refs\pokeyellow` and `C:\Programming Projects\pokecrystal-PerfPlus` directly against Plan 0's own I1-I8 to ground every claim below in real files, not assumption. Read those two survey reports (quoted at length in this document where load-bearing) before doubting anything stated here as fact — but **re-verify the specific byte/line-level claims yourself before writing literal parsing/splicing code** (see "Open verification items" below) — this document is a roadmap grounded in real research, not a substitute for reading the real source the way every GBA-family task in this project has always insisted on.

---

## 0. Why this is a separate plan family, not an extension of Plan 0

Pokecrystal and pokeyellow are **pret-style disassemblies**: pure `rgbds` assembly (no C toolchain for game logic), zero JSON anywhere, binary blockdata/metatile files, and line-oriented assembly-macro-call event records. This is not a byte-format variant of what Plan 0's `core` package already models — it fails or inverts several of Plan 0's own hard invariants outright:

| GBA invariant | Status for GBC family |
|---|---|
| I1 — split resolution per layout | **Does not apply.** Neither generation splits tilesets; each map names exactly ONE tileset, whose metatile table is self-contained (Yellow: 128 in the one tileset checked; Crystal: 40/64/128 per tileset, measured — see G1). A GBC loader must not assume a split exists, not "resolve" a split that isn't there. |
| I2 — never reserialize a JSON file, surgical splice | **No target.** There is no JSON. Editable structures are (a) fixed-width binary records (`.blk` blockdata, `_metatiles.bin`) and (b) line-oriented RGBDS assembly macro calls (`object_event ...`, `map_attributes ...`). Both need their OWN surgical-splice disciplines — see §3 below. |
| I3 — build artifacts are not sources of truth | **Ports directly**, mechanism unchanged: `.png` tile graphics (2bpp/4-shade grayscale, not GBA's 4bpp/16-color — though PerfPlus's edited `port.png` is 8-bit RGBA using only the 4 grays, so decode by gray level, not by PNG format) are checked into git; `.2bpp`/`.lz` are gitignored `rgbgfx` output. Read the PNG, never the compiled artifact. |
| I4 — tileset paths from INCBIN, never name-mangling | **Ports directly.** `gfx/tilesets.asm` (`TilesetJohtoGFX:: INCBIN "gfx/tilesets/johto.2bpp.lz"`) and `data/tilesets.asm` (`tileset TilesetJohto` → `dba \1GFX, \1Meta, \1Coll`) are the Crystal-equivalent of `metatiles.h`/`graphics.h` — resolve through these string literals, never derive a path from a tileset's own symbolic name. This is arguably even more load-bearing here than in GBA: Yellow's own `Dojo`/`Gym` and `Mart`/`Pokecenter` tilesets alias the SAME underlying `.2bpp`/`.bst` files (two logical tilesets, one graphics file) — a name-mangling loader would silently produce a wrong or duplicate-then-diverging asset. |
| I5 — round-trip corpus test is the gate | **Ports directly**, mechanism unchanged: load and re-save every map/tileset/event file across the real subject repo with no edits; assert zero bytes changed. This is Plan 6's own Tasks 2 (binary codec) and 4 (assembly splice) no-op round trips, brought forward to prove the write mechanism BEFORE any breadth is built on top of it — mirroring how Plan 2's own Task 1 ("save guards") was written first "because everything after depends on being unable to do damage." |
| I6 — no autosave, ever | **Ports directly**, no adaptation needed. |
| I7 — refuse rather than guess | **Ports directly**, new concrete triggers: an out-of-range metatile id (≥ the tileset's own count = `_metatiles.bin` size / 16, measured 40/64/128 per tileset in Crystal — not a universal constant), a `.blk` file whose byte count doesn't match `width × height` from `map_const` (2 real PerfPlus hits: read-only, flagged — see G4). Event counts turned out to be assembler-computed, so there is no count prefix to desync (resolved, see findings doc §3.1). |
| I8 — writes only decomp data files plus `.pokemap/` | **Ports directly**, adapted to Crystal's real file paths (`maps/*.blk`, `data/maps/attributes.asm`, `maps/*.asm` event blocks, `data/tilesets/*`). |

**Net:** I3/I4/I5/I6/I7/I8 port as PRINCIPLES with adapted concrete triggers. I1 doesn't need porting, it needs to NOT be assumed. I2 needs a genuinely new writer subsystem — this is where nearly all of Plan 6/7's real risk and effort lives.

---

## 1. Package layout

**Decision: a new sibling source tree inside the EXISTING `core` package, not a new top-level package.** `packages/core/src/gbc/` (working name — `load/`, `render/`, `write/`, `model/` mirroring the existing GBA-family layout under `packages/core/src/`), rather than the GBA family's own `load/`/`render/`/`write/`/`model/` directories directly. Reasoning:

- The two families share essentially no LOADING/WRITING code (different formats, per §0), but they should share the same outer conventions (`loadX`/`renderX`/`writeX`/`validateX` naming, the same `Block`-shaped output where the concept genuinely transfers, the same test-fixture/corpus-gate philosophy) — nesting under one `core` package keeps that convention-sharing enforceable by one `tsconfig`/`eslint` config rather than two drifting ones.
- `cli`/`server`/`ui` need a way to know which family a given `--project`/`projectPath` belongs to and route accordingly. A single `core` package with a `detectEngineFamily(root)` entry point (decided in Plan 6 Task 1: probe marker files, no `--family` flag — see findings doc §Config) is simpler than teaching three separate app-layer packages to import from two different core packages conditionally.
- `ui`'s own rendering pipeline SHAPE (metatile → RGBA → layout → RGBA, `Raster`/`LayoutRaster`) is genuinely reusable even though the metatile DECODER underneath it (2bpp vs 4bpp, no split vs split) is not — importing both `gba` and `gbc` render modules into one `render/raster.ts`-shaped shared primitive (or keeping `raster.ts` itself family-agnostic and giving each family its own `metatile.ts`) avoids maintaining two parallel `Raster` types with the same fields.

`packages/core/src/gbc/model/types.ts` gets its own `Block`/`Layout`/`Map`/`Tileset`/`Connection` types — do NOT reuse the GBA family's own type names verbatim even where a field looks similar (e.g. GBC's `Block` is `{ metatileId }` alone, no packed collision/elevation — aliasing it to GBA's `Block` type would be a silent lie about what fields exist). **`Map` and `Layout` are separate types** (Plan 6 Task 1 finding): 391 maps resolve to 257 `.blk` files, 23 of which are shared by 157 maps (e.g. `House1.blk` ×50) — `Layout` = `.blk` + dimensions, `Map` = header/attributes (tileset, environment, palette, group, border, connections) + a layout reference. Rendering is per-map, since palette and roof graphics depend on map fields.

`packages/cli`, `packages/server`, `packages/ui` stay single packages, gaining family-aware branches where needed — do NOT fork them into `-gbc` siblings; the whole point of sharing the UI shell is one app, two backends.

---

## 2. Hard invariants — GBC family (binds Plan 6 and Plan 7)

Numbered independently from I1-I8 (which stay GBA-specific and unrenumbered) to avoid implying a false one-to-one mapping.

### G1 — No split resolution, ever, for this family

No GBC code path may accept or compute a "primary/secondary" tileset boundary. A map names exactly one tileset; its metatile table is the whole id space (0 to the tileset's own real metatile count = `_metatiles.bin` size / 16). Crystal, measured across all 36 distinct `_metatiles.bin` files (37 `Tilesets::` entries, 2 stacked aliases, plus the unreferenced `unused_johto_metatiles.bin`): 128 (johto, johto_modern, kanto, battle_tower_outside, unused_johto), 40 (forest), 64 (all others) — NOT a hardcoded engine constant; PerfPlus's fixed `LoadMetatiles` addresses ids 0-255. Yellow's `.bst` files were confirmed 2048 bytes / 16 = 128 in the one tileset checked; re-measure every Yellow tileset in Plan 8.

### G2 — Binary records are patched at their own fixed byte offset, never re-encoded whole unless independently verified byte-identical

`.blk` blockdata and `_metatiles.bin` (or `.bst`) are fixed-width binary arrays with no delimiters. A single-block edit is `buffer[offset] = newValue`, not "decode the whole array to objects, mutate one, re-encode the whole array" UNLESS the encode step is proven (by the G5 round-trip gate) to reproduce every untouched byte exactly. This mirrors GBA's own `encodeBlocks` discipline (Plan 0's binary.ts) and the same reasoning: a whole-buffer re-encode that's subtly wrong corrupts every block in the file, not just the one edited.

### G3 — Assembly source edits are line-anchored surgical splices, never a whole-file reserialization

Analogous to I2, implemented differently: an edit to `map_attributes.asm`, a map's own event block, or `map_constants.asm` locates the EXACT line(s) it needs to change (by macro name + argument position, or by a label), replaces only the bytes of the changed argument(s) in the source TEXT, and leaves every other line — including comments, blank lines, and formatting — byte-identical. Never `readFile` → parse to an AST/object model → regenerate the whole file from that model. This is the single highest-risk piece of Plan 6/7; see "Open verification items."

### G4 — Refuse rather than guess (I7's own principle, GBC-specific triggers)

Concrete refusal conditions to implement (grow this list as Plan 6/7 discover more, matching how GBA's own `guards.ts` grew across Plan 2's tasks):
- A metatile id at or above the owning tileset's own real metatile count.
- A `.blk` file whose byte length doesn't equal `width × height` from `map_const`. Per user decision (Plan 6 Task 1): READS mimic the engine (first w×h bytes) with a flagged data-defect warning; WRITES are refused. Real hits: `CeruleanCave2F.blk`, `CeruleanCaveB1.blk` (400 B vs 9×15), both PerfPlus-added.
- A wild-data list missing its `db -1` terminator (real hit: PerfPlus `data/wild/kanto_grass.asm`): parse tolerantly (EOF ends the list), flag as a data defect.
- (Plan 7) Removing or reordering an `object_event` whose position is named by the map's hand-maintained `object_const_def` const list, unless that list is adjusted atomically — scripts address objects by those positional consts.
- (Plan 7) More than 15 `object_event`s in one map (`NUM_OBJECTS EQU 16`, slot 0 is the player).
- A map/tileset/event edit targeting a name not found in the real corpus (the GBC-equivalent of "no map named X").
- ~~Event-section count marker desync~~ — resolved: every `def_*` count is assembler-computed (`db {_NUM_X_\@}`), nothing for an editor to maintain.

### G5 — The round-trip corpus test is the gate (I5's own principle)

Load and re-save every real map/tileset/event file in the subject Crystal repo (and, once Yellow support exists, pokeyellow too) with zero edits; assert zero bytes changed, for BOTH the binary writer (G2) and the assembly-line writer (G3). No Plan 6/7 task may merge with this failing or skipped, same as Plan 0 §6's own rule. This test should exist and pass **before** any real editing feature (paint, move-event) is built on top of the writer — Plan 6's own Tasks 2/4 (no-op round trips), not deferred to Plan 7. Plan 6 runs it on a single-member corpus (PerfPlus); the user adds vanilla `pret/pokecrystal` at `C:\Programming Projects\Pokemon Game\refs\pokecrystal` before Plan 7.

### G6 — No autosave, ever (I6, unchanged)

### G7 — Writes only real decomp data files plus `.pokemap/` (I8, unchanged, adapted paths)

No stray files. No modification to files outside `maps/`, `data/maps/`, `data/tilesets/`, `gfx/tilesets/` (source PNGs only, never `.2bpp`/`.lz`) and their direct equivalents.

---

## 3. Open verification items — resolve these before writing Plan 7's real write-path code

**RESOLVED by Plan 6 Task 1** — see `docs/superpowers/specs/2026-09-23-pokemap-gbc-format-findings.md` for each answer with evidence. Summary: (1) counts assembler-computed, filler dead; (2) cap varies 40/64/128; (3) `tilecoll` = 4 bytes TL/TR/BL/BR; (4) palette resolution is env × time-of-day × map group × tileset, not "3 blocks"; (5) Town Map is a tile-composed tilemap + landmark table; (6) `.blk` sharing is pervasive, so Map/Layout split. The original questions are kept below for the record.

These are real gaps in this session's own research, called out explicitly rather than papered over with invented confidence (matching this project's own "verify against real source, never guess" culture):

1. **Event-section count/length mechanism.** The Crystal survey found `NewBarkTown_MapEvents:` starting with `db 0, 0 ; filler` before `def_warp_events` — it's genuinely unclear whether this is a human/tool-maintained count that must be kept in sync with the section's real line count (in which case G3/G4 need to detect and update it atomically) or unrelated filler bytes (alignment/legacy), or whether RGBDS's own label arithmetic (`. - LabelName`) computes section lengths automatically at ASSEMBLE time with nothing for an editor to maintain by hand. **Read `macros/scripts/maps.asm`'s real macro definitions for `def_warp_events`/`def_object_events`/etc. and at least 5 real map event blocks before writing ANY event-insert/remove code.** This is the single most important unresolved question blocking Plan 7's own event-editing tasks.
2. **Exact per-tileset metatile cap.** Confirmed 128 for one Yellow tileset (`.bst` = 2048 bytes / 16 bytes-per-metatile); NOT independently confirmed for Crystal or for every Yellow tileset. Verify from real file sizes across the whole corpus before hardcoding 128 as G1's own ceiling.
3. **Collision table's exact bit/field layout.** Crystal survey found `tilecoll WALL, WALL, WALL, WALL ; 05` (4 collision constants per metatile, likely per-quadrant) — the exact enum of possible collision constants and what each quadrant represents (visually, and for rendering an overlay) needs a direct read of `constants/tileset_constants.asm` and the `tilecoll` macro definition, not just the one example line quoted in the survey.
4. **Palette resolution completeness (Crystal only).** The survey traced `PALETTE_AUTO/DAY/NITE/MORN` → 3 RGB blocks in `bg_tiles.pal` → runtime swap logic in `engine/tilesets/timeofday_pals.asm`, but a renderer needs to REPLICATE that swap logic exactly (which of the 3 blocks applies for a given "as-if-viewed-at-time-T" render, and what `PALETTE_AUTO` itself resolves to as a rendering default) — read `timeofday_pals.asm` in full before writing `render/metatile.ts`'s GBC counterpart.
5. **Region map format (Crystal specifically).** Yellow's own region map was confirmed to be a static hand-drawn image with point-label placement (`(x, y, name)` triples), not a tile-composed layout — Plan 3's own region-map-editor scope (GBA family) doesn't transfer to Yellow at all. Crystal's own region map format was NOT surveyed — verify whether it's the same static-image model or something closer to GBA's tile-composed one before scoping any Plan 7+ region-map work.
6. **Whether `map_const`'s width/height/`.blk` file are always 1:1**, or whether (as pokeemerald sometimes reuses one Layout across multiple Maps) any Crystal `.blk` file is shared by more than one map constant. The survey's own reading of `NewBarkTown.asm`/`maps.asm` suggests 1:1 bundling per map name, but this should be confirmed across the FULL corpus (like GBA's own layout-sharing was measured, not assumed) before a `Layout`/`Map` type split decision is finalized — it's possible GBC doesn't need a separate `Layout` concept from `Map` at all, simplifying the model relative to GBA.

---

## 4. Conventions (inherits Plan 0 §4 except where noted)

Same TypeScript/ESM/Node/npm-workspaces/vitest/commander/React stack (no pngjs — PNG decoding is hand-rolled on `node:zlib`, per `packages/core/src/load/png.ts`; the GBC decoder must add gray depth-2 and RGBA depth-8). Same TDD discipline (`superpowers:test-driven-development`), same Conventional Commits, same `git add <named paths>` never `-A`, same frequent small commits. Same `loadX`/`renderX`/`writeX`/`validateX` naming inside `packages/core/src/gbc/`. Same "every UI task invokes `frontend-design`/`ui-ux-pro-max` before writing components" rule. Same subagent-model guidance (Plan 0 §4: implementers on Sonnet, reviews of design-heavy/high-risk tasks on Opus — Plan 7's own write-path/G3-splicer tasks are exactly the "hand-derived numeric fixtures, external/error-boundary parsing" category CLAUDE.md's own cost-discipline notes call out for Opus review).

**New convention specific to this family:** every task that reads a NEW real file format for the first time (the `.blk` parser, the metatile/collision/palette loader, the event-macro parser) must, per its own task text, paste at least one REAL raw byte/line excerpt from the actual subject repo as its worked example — not an invented one — mirroring how this document itself only asserted format claims backed by a real file path and excerpt. This is a direct, deliberate response to §3's own open-items list: the format is real and mostly understood, but every remaining gap traces back to a claim that wasn't yet checked against enough real examples.

---

## 5. Config

**Decided (Plan 6 Task 1):** a top-level `"gbc": { "projectPath": "C:/Programming Projects/pokecrystal-PerfPlus", "referenceProjects": [] }` block in the existing `pokemap.config.json` (zero-diff for the four existing GBA readers), plus probe-based `detectEngineFamily(root)`; lands as Plan 6 Task 2's first step. Original framing, kept for the record: Extends `pokemap.config.json` (does not replace it) with a second project registration, shape TBD by Plan 6 Task 1 (likely `{"projectPath": ..., "family": "gba"}` alongside a second `{"projectPath": "C:/Programming Projects/pokecrystal-PerfPlus", "family": "gbc"}` entry, or a sibling `pokemap.gbc.config.json` — Plan 6 Task 1 should decide this deliberately, considering whether the `ui`/`server` need to run against BOTH a GBA and a GBC project simultaneously (probably not, one server process per project) or just need a clean way to launch against either).

**Cloud sessions (claude.ai/code).** Neither corpus is present by default. Clone the subject with `git clone --branch master-AS092190 https://github.com/itnevres/pokecrystal-PerfPlus` and check that HEAD is 81ededbe3; every Plan 6 pin was measured against that commit. Vanilla `pret/pokecrystal` is public, and Plan 6's Task 11 review fetched it from GitHub without trouble. Point `gbc.projectPath` / `gbc.referenceProjects` at the clones as a LOCAL-ONLY edit that is never committed. The committed values are the Windows paths below.

Subject project for this family: `C:\Programming Projects\pokecrystal-PerfPlus` (read-only until Plan 7 lands a real write path, same posture Plan 0 §8's risk register held for the GBA family through all of Plan 1).

Reference project(s) for the G5 round-trip corpus gate: at minimum, vanilla `pokecrystal` itself if a clean checkout is available (PerfPlus's own README confirms it's a pure gameplay-balance fork with no format changes — a vanilla pokecrystal checkout would be a legitimate second corpus member, same "multiple engines, one gate" principle as Plan 0 §5's own `referenceProjects` list). pokeyellow is NOT a reference project for Crystal's own gate (different corpus, different game) — it becomes its OWN subject project once a later plan adds Yellow support.

---

## 6. Phase sequence

| Plan | File | Scope | Depends on | Status (2026-09-25) |
|---|---|---|---|---|
| 6 | `2026-09-23-pokemap-plan-6-gbc-foundation.md` | GBC `core` loaders (map/tileset/event/palette/wild), per-MAP renderer (roof tiles, border ring), `cli` read commands, world stitching, encounter atlas — all READ-ONLY. **No server/UI work** (findings §Config: server untouched in Plan 6) | This roadmap | **Done 2026-09-25** on `plan-6-gbc-foundation`; not yet merged to `master` |
| 6b (future, not yet written; scope sketch in §6b below) | — | GBC app layer, read-only: server family branch (`serve.ts`/`createServer`), map/world/atlas routes, UI map view, world view and encounter lenses for a GBC project. It is the GBC counterpart of Plan 1's UI tasks, and Plan 7 Tasks 4-5 (server edit routes, UI editing) cannot start without it | Plan 6 | Not planned |
| 7 | `2026-09-23-pokemap-plan-7-gbc-editing.md` | Painting, event editing — the write path (G2/G3's own real implementation + G5's gate). Its core+CLI tasks (1, 2, 3, 6, 7) need only Plan 6; its server/UI tasks (4, 5) need 6b | Plan 6 (+ 6b for Tasks 4-5) | Next |
| 8 (future, not yet written) | — | Pokémon Yellow support, reusing Plan 6/7's own primitives wherever the shared skeleton (§0) actually holds; Yellow-specific deltas only (no day/night palette system to build, no coord_event/scene layer, different/simpler wild-encounter model, different region-map model, `Dojo`/`Gym`-style tileset aliasing to handle in the loader) | Plan 6 + 7 | Not planned |

**Plan 6 is written to task-level granularity, not full TDD-step** — deliberately, matching Plan 0 §1's own stated reason for Plans 2-4 originally being task-level ("their own step-by-step code is calibrated against APIs [not yet built]... writing literal code against an imaginary API produces fiction the executor must discard"). Here the imagined-API risk is different in kind but just as real: §3's open verification items mean literal parsing code written now would encode unverified assumptions as if they were confirmed facts. **Before executing Plan 6 Task 1, re-read this roadmap's §3 and resolve every item against the real repo, then re-granularise Plan 6 to full step-level the same way Plan 2 was re-granularised against Plan 1's real output** — this is not optional scaffolding, it is exactly the discipline that made every GBA-family plan's execution low-drift.

---

## 6b. GBC app layer (server + UI, read-only): scope sketch

Written 2026-09-25 from a read of the real `packages/server` and `packages/ui` code. **This is a sketch to plan from, not a plan.** Write `2026-XX-XX-pokemap-plan-6b-gbc-app-layer.md` from it, re-granularised against the code at that time.

**Question answered: can Plan 1/2's server serve a Crystal project? No, not as-is. And it doesn't need a separate GBC server either.**

**Why the existing server can't serve Crystal:**
- `createServer` (`packages/server/src/index.ts`, ~1,000 lines, one route-dispatch function) calls the GBA `openProject()` at startup. That refuses any root without `include/fieldmap.h`, so a PerfPlus root never reaches a route.
- Its ~30 routes make 54 calls into the GBA `Project`, and every payload is GBA-shaped:
  - `/api/map` returns the tileset split, primary/secondary counts, and per-block collision/elevation/behaviour;
  - `/api/render` calls `renderLayout`;
  - `/api/encounters` reads `wild_encounters.json`;
  - `/api/world` combines `buildWorld` with the dungeon auto-layout and the `.pokemap` sidecar;
  - the edit routes use GBA stamps (which carry collision), the JSON-splice save funnel, and GBA events.
- `packages/server/src/editSessions.ts` and `core/edit/commands.ts`'s `EditCommandStack` are both typed to the GBA `Project` and `EditSession`.
- `serve.ts` reads only the top-level GBA `projectPath`.

**Decision: one server, with a family branch**, mirroring what Plan 6 Task 10 did for the CLI (findings §"Config and family decision").
- `createServer` calls `detectEngineFamily(root)` once. GBA keeps today's code path byte-for-byte. GBC uses `openGbcProject`, with handlers in a sibling module, e.g. `packages/server/src/gbcRoutes.ts`, the counterpart of `packages/cli/src/gbcCommands.ts`.
- `serve.ts` takes a root argument, or a `--gbc` switch that selects `cfg.gbc.projectPath`. There is still one server process per project.

**Reusable as-is:** `readBody`, the `send`/400-vs-500 error discipline, `encodePng`, and the URL conventions the UI already speaks. The session-store pattern (open/snapshot/undo/redo/discard, single save funnel) is reusable too, but only after making `EditCommandStack` and the store generic over the session type, or giving GBC its own copy of about 100 lines. Decide which when planning Plan 7 Task 4, not in 6b.

**Server routes for 6b (read-only; Plan 7 Task 4 adds the `/api/edit/*` routes later):**

| Route | GBC backing (already built in Plan 6) | Notes |
|---|---|---|
| `GET /api/project` (new, both families) | `detectEngineFamily` | `{ family, root }`. The UI branches on this once at startup |
| `GET /api/groups` | `GbcMap.group` / `newgroup` order | Crystal has real map groups. Same response shape if it fits, otherwise a family-specific one |
| `GET /api/map/:name` | `openGbcProject`: `map`, `layout`, `tileset(...).collision` | GBC payload: blocks are `{metatileId}`; collision is per tileset (4 quadrants per metatile), not per block; plus `metatileCount`, `border`, `writable` and defects |
| `GET /api/render/:name.png` | `renderGbcMap` | `?border=0..3`, `?time=morn\|day\|nite` |
| `GET /api/metatile/:tileset/:id.png` | `renderGbcMetatile` | For a read-only metatile palette view |
| `GET /api/world` | `buildGbcWorld` | Placements in BLOCKS (32 px). Include `conflicts` so the UI can show the Route17/18 misclosure |
| `GET /api/encounters/:map`, `/api/where/:species`, `/api/coverage`, `/api/species` | `gbcEncounterSources` / `gbcWhereSpecies` / `gbcCoverage` | GBC source shape: method grass/water/fish/headbutt/rock plus time/rod/list/swarm tags |
| `/api/warps/*`, `/api/dungeons*`, `/api/world/placement`, `/api/world/dungeons`, `/api/sign/*` | none | Refuse on GBC with a named message, as the CLI's `refuseIfGbc` does. Warps could come later from Plan 6 events |

**UI: the bigger unknown.** The components were built for GBA payloads (about 6,600 lines across `components/`, `hooks/` and `App.tsx`). Known hard-coded GBA assumptions to resolve:
- **Pixel sizes.** `MapCanvas.tsx` hard-codes 16-px tiles and GBA's `borderWidth`/`borderHeight` rings (lines ~354-357 and ~510). `WorldCanvas.tsx` has `TILE_PX = 16`. GBC blocks are 32 px and the ring is a single metatile, `n` blocks deep.
- **Tileset split.** `useMapLayout.ts` and `MetatilePalette.tsx` expect a split and primary/secondary counts.
- **Encounter methods.** `EncounterGutter.tsx` and `WorldCanvas.tsx` hard-code GBA method names (`land_mons`, `water_mons`, `fishing_mons`, `rock_smash_mons`). GBC has time-of-day and rod/list/swarm tags and headbutt as an extra method.
- **Collision.** `CollisionPalette.tsx` and MapCanvas's collision overlay assume per-block collision/elevation. For GBC, a read-only per-quadrant overlay from the tileset table is possible, but there is no painting (Plan 7 Goal).
- **GBA-only features.** Dungeon mode, the sidecar and warp tools (`DungeonSidebar.tsx`, `WarpDestinationModal.tsx`, parts of `WorldCanvas.tsx`) and `SignComposer.tsx` are GBA-only: hide them for GBC.

**Recommended 6b task order:**
1. The server family branch, `/api/project`, and the GBC map/render/metatile routes, with route tests against the real PerfPlus via `itWithGbcCorpus`.
2. The GBC world and atlas routes.
3. UI: fetch the family once, and parameterise tile size (16/32) instead of hard-coding it. Hide GBA-only panels for GBC.
4. A read-only GBC map view: map tree by group, MapCanvas render with border ring and time-of-day toggle, block hover (metatile id plus collision quadrants).
5. The GBC world view and encounter lenses, remapped to GBC method tags.
6. Live-verify in a real browser (RESUME: "open the app and click things"), plus a GBA regression pass on the Windows machine. Every GBA UI/server test must stay green, and the cloud can't run them.
Every UI task invokes `frontend-design`/`ui-ux-pro-max` first (§4) and follows `packages/ui/DESIGN.md`.

**Open questions for the 6b plan:**
- Can the GBC `/api/map` payload share the GBA TypeScript response type (a union with a `family` tag), or are the two separate types handled in separate hooks?
- How much of `MapCanvas.tsx` and `WorldCanvas.tsx` (~2,000 lines, already flagged for extraction) can be parameterised, and how much needs a GBC-specific wrapper?
- Where does the time-of-day toggle live: a global app setting, or per view?

---

## 7. Risk register

| Risk | Mitigation |
|---|---|
| §3's open verification items turn out to invalidate a design assumption (e.g. the event-count byte IS human-maintained and interacts with something not yet understood) | Plan 6 Task 1 resolves every §3 item against real source before any other task starts; G5's round-trip gate catches a wrong writer immediately rather than letting it ship |
| A GBC write bug damages the real subject repo (`pokecrystal-PerfPlus`) | G6, G7, G5, diff preview (same I6/I8/I5 pattern proven across all of GBA Plan 2); subject repo is under git; Plan 6 is read-only, so no write path exists until Plan 7 |
| Polished Map already does most of what Plan 6/7's own single-map block/event editing would duplicate | Accepted, discussed explicitly with the user before this plan was written — goal (a) (full standalone tool) was chosen over goal (b) (defer to Polished Map, build only what it lacks) deliberately; Plan 6/7 still deliver real, non-duplicated value via world-stitching/encounter-atlas/all-in-one-app workflow even where single-map painting overlaps Polished Map's own scope |
| Two engine families drift in code-quality/convention over time (one team's worth of review discipline spread across two formats) | Same `superpowers:subagent-driven-development` rigor, same CLAUDE.md cost-discipline rules, same task-report archive convention — this document itself follows Plan 0's own structure exactly rather than inventing a new one |
| Crystal-then-Yellow reuse assumption (§0, "roughly 20-30% more work for Yellow") turns out optimistic once Plan 6/7 are actually built | Plan 6/7 tasks should avoid Crystal-only assumptions where a shared primitive is equally cheap (explicit design note, not enforced by tooling) — re-assess honestly once Plan 6/7 are real, don't defend the original estimate past evidence |
