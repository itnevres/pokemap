# PokeMap Plan 6 — GBC Foundation (Pokémon Crystal, read-only)

> **For agentic workers:** REQUIRED READING FIRST: `docs/superpowers/plans/2026-09-23-pokemap-plan-6-gbc-roadmap.md` in full — invariants G1-G7 bind every task below, and §3 ("Open verification items") lists unresolved format questions that MUST be resolved (Task 1) before any other task in this plan starts. This plan is written to TASK level, not full TDD-step — re-read each task against the real `pokecrystal-PerfPlus` source and expand to step granularity immediately before executing it, exactly the discipline Plan 0 §1 established for the GBA family's own Plans 2-4.

**Goal:** Load, render, and browse (world-view + encounter atlas) real Pokémon Crystal map data, read-only — the GBC-family equivalent of Plan 1's own scope for GBA. No write path in this plan (that's Plan 7).

**Subject project:** `C:\Programming Projects\pokecrystal-PerfPlus` (read-only throughout this plan — no write path exists until Plan 7, same posture Plan 1 held for the GBA family).

**Tech stack:** As Plan 0 §4/roadmap §4 — TypeScript/ESM/Node, vitest, pngjs, commander, React — inside `packages/core/src/gbc/`, `packages/cli`, `packages/server`, `packages/ui` (shared packages, family-aware branches, per the roadmap's own §1 package-layout decision).

**Success criteria — demonstrated, not asserted, per `superpowers:verification-before-completion`:**
1. `pokemap-gbc render NewBarkTown -o out.png` (or whatever the real CLI command ends up named) produces a real, visually-correct PNG of a real Crystal map, byte-reproducible on a second run.
2. The binary codec round-trip identity test (Task 2) passes across every real `.blk` and metatile-table file in the subject repo — parse then re-encode reproduces the original bytes exactly, zero exceptions.
3. The assembly-line round-trip identity test (Task 4) passes across every real map's own attributes/event block — read then write-back-unchanged reproduces the original text exactly, zero exceptions.
4. A world-view-equivalent (however scaled down given Crystal's own smaller, differently-shaped world — see Task 9) renders a recognizable stitched region from real connection data, not a placeholder.
5. `pokemap-gbc where <SPECIES>` (or equivalent) reports real Crystal encounter locations for a real species.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/core/src/gbc/config/paths.ts` | Path resolution for a Crystal project root — mirrors GBA's own `config/paths.ts` shape |
| `packages/core/src/gbc/config/constants.ts` | Parsed `map_const`/tileset/species/etc. constant tables — the GBC-equivalent of GBA's fieldmap-constants merge, but there is no fieldmap.h workaround to eliminate here since G1 means there's no split to begin with |
| `packages/core/src/gbc/model/types.ts` | `Block` (`{metatileId}` only — no packed collision/elevation), `Map` (folds what GBA calls `Layout`+`Map` into one, pending Task 1's own verification of whether GBC needs the split at all — see roadmap §3 item 6), `Tileset`, `Connection`, event types |
| `packages/core/src/gbc/load/blocks.ts` | `.blk` parser/encoder — binary, fixed-width, no header |
| `packages/core/src/gbc/load/tileset.ts` | Metatile table (`.bin`/`.bst`) + collision table (`*_collision.asm`) + palette map (`*_palette_map.asm`) loader |
| `packages/core/src/gbc/load/palette.ts` | Time-of-day palette resolution (`PALETTE_AUTO/DAY/NITE/MORN` → real RGB, per roadmap §3 item 4) |
| `packages/core/src/gbc/load/map.ts` | Map header/attributes/connections loader (`data/maps/attributes.asm` + `map_constants.asm` + `data/maps/maps.asm`'s own tileset-assignment table) |
| `packages/core/src/gbc/load/events.ts` | Object/warp/bg/coord event parser from each map's own inline event block |
| `packages/core/src/gbc/load/encounters.ts` | Wild encounter table parser (`data/wild/maps/*.asm`) |
| `packages/core/src/gbc/render/metatile.ts` | 2bpp tile decode + metatile composite → RGBA, palette-aware |
| `packages/core/src/gbc/render/layout.ts` | Full-map RGBA composite, mirrors GBA's own `render/layout.ts` shape |
| `packages/core/src/gbc/write/blocks.ts` | Binary encode half of the Task 2 round-trip proof (full write path is Plan 7's own scope; this task only proves the codec is lossless, no session/guard machinery yet) |
| `packages/core/src/gbc/write/asmSplice.ts` | Read-and-write-back-unchanged half of the Task 4 round-trip proof (same scope limit as above) |
| `packages/core/test/gbc/**` | Mirrors `packages/core/test/**`'s own structure |
| `packages/cli/src/gbcCommands.ts` (or a family-aware branch in the existing `index.ts` — Task 1 decides) | `render`, `query`, `where`, `coverage` GBC-family commands |

---

## Task 1: Resolve open verification items + family/config wiring decision

Not a feature task — a research-and-decide task, written first because every other task in this plan depends on its answers. Re-verify roadmap §3's six open items against the real `pokecrystal-PerfPlus` repo directly (read `macros/scripts/maps.asm`'s real macro definitions, read at least 5 real map event blocks, measure every tileset's real metatile-table byte count, read `constants/tileset_constants.asm` and the `tilecoll` macro definition, read `engine/tilesets/timeofday_pals.asm` in full, check Crystal's own region-map format, and measure whether any `.blk` file is shared by more than one `map_const` entry across the WHOLE corpus, not a sample).

**Deliverable:** a short findings document (`docs/superpowers/specs/2026-09-23-pokemap-gbc-format-findings.md` or appended to this plan's own header — implementer's call) recording the real answer to each of roadmap §3's six items, each with a cited file path and excerpt, matching this whole plan family's own established evidence discipline. Any item whose answer changes a design decision already asserted elsewhere in this plan (Task list, model types, invariants G1/G3/G4) must have that consequence noted explicitly, not silently absorbed.

Also decide, and document the decision: how `pokemap.config.json` (or a sibling file) registers a GBC project alongside a GBA one (roadmap §5), and how `cli`/`server` detect/select the family for a given `--project` (an explicit flag, a config field, or auto-detection by probing for `pokecrystal`-shaped vs `pokeemerald`-shaped directory structure — state the trade-off, pick one, don't leave it open for Task 2 to rediscover).

**No code changes to `core`'s GBA-family files.** This task may freely read them for convention reference (naming, test structure) but must not modify them.

---

## Task 2: `.blk` blockdata + metatile-table binary codec, with round-trip identity proof

`load/blocks.ts`: `parseBlk(buf: Buffer): Block[]` (row-major, one byte per block, `Block = {metatileId: number}` — confirm via Task 1 whether ANY per-instance bits exist beyond the raw id, roadmap research found none, but re-confirm) and `encodeBlk(blocks: Block[]): Buffer`, the inverse. Same for the metatile table itself if it turns out to need independent parse/encode (likely yes, for the renderer in Task 7 to consume) — `load/tileset.ts`'s own metatile-table half.

**Round-trip identity test (this plan's own G5-lite, mirroring GBA Plan 1's own `corpus.test.ts` precedent of proving the codec lossless before any editing feature exists):** for every real `.blk` file and every real metatile-table file in the subject repo, `encodeBlk(parseBlk(buf))` (and the metatile-table equivalent) must equal the original buffer byte-for-byte. Zero exceptions across the whole corpus — a single mismatch is a real bug in the codec, not a test to loosen (same rule Plan 0 §7/Task 19 already established for the GBA family's own identity gate).

---

## Task 3: Map header/attributes/tileset-assignment loader

`load/map.ts`: parse `constants/map_constants.asm`'s `map_const NAME, width, height` table into a name→dimensions map; parse `data/maps/attributes.asm`'s `map_attributes`/`connection` macro calls per map into a `Map`/`Connection` model; parse `data/maps/maps.asm`'s own `map NAME, TILESET, ...` table for tileset assignment. Cross-reference all three against Task 1's own finding on whether `.blk`↔`map_const` is always 1:1 — if it is, `Map`/`Layout` can fold into one type (file-structure table above already assumes this pending confirmation); if not, split them the way GBA does.

No JSON, no `layouts.json`/`map_groups.json` equivalent exists — `mapNames()`/`allMaps()`-shaped functions read directly off the parsed `map_constants.asm` table.

---

## Task 4: Assembly-line surgical splice primitive, with round-trip identity proof

`write/asmSplice.ts` (name pending Task 1's own findings — if G3's "line-anchored splice" needs a different shape than JSON's `editJson`, e.g. because event counts are assembler-computed and never need touching, this task's real scope may shrink): the GBC-family's own equivalent of `core/write/jsonEdit.ts`, but operating on RGBDS assembly source text — locate a macro-call line by macro name + preceding label/section markers, splice a single argument's text in place, leave every other byte of the file untouched.

**Round-trip identity test, no-op case only (mirrors Task 2's own scope limit — this is NOT Plan 7's full edit-and-restore write path):** read every real `attributes.asm`/map event block, run it through the splice primitive with a no-op edit (replace a field's value with itself), confirm the output is byte-identical to the input. This proves the splicer's own text-scanning/reconstruction logic doesn't silently mangle real formatting (trailing whitespace, comment placement, blank lines) even before any REAL edit is attempted — the same "prove the mechanism before building on it" instinct as Task 2, and as GBA Plan 2's own Task 1 (guards, written first).

---

## Task 5: Tileset loader — metatile table, collision, palette map, PNG/2bpp decode

`load/tileset.ts`: wires Task 2's metatile-table codec together with the collision table (`*_collision.asm`, `tilecoll` macro — exact field meaning per Task 1's own findings) and the palette map (`*_palette_map.asm`, `tilepal` macro) into one `Tileset` model. `render/metatile.ts` (or a `load/`-side decode step feeding it): decode the source `.png` (2bpp/4-shade grayscale, confirmed 128×96 for one real Johto tileset) into raw tile pixel data — a genuinely new decoder, GBA's own `pngjs`-based 4bpp/16-color path does not transfer.

**Test:** decode a real tileset PNG, confirm real pixel values at known coordinates (not just "didn't throw" — pin actual pixel values read directly from the source image via an independent tool/manual check, matching this project's own "a test must be able to fail" discipline, Plan 0 §7 item 1-4).

---

## Task 6: Time-of-day palette resolution (Crystal-specific)

`load/palette.ts`: implements the real swap logic found in `engine/tilesets/timeofday_pals.asm` (Task 1's own findings) — given a tileset's `PALETTE_AUTO/DAY/NITE/MORN` field and a caller-supplied "as of what in-game time" parameter (or a fixed default matching what `PALETTE_AUTO` itself resolves to, per Task 1), resolve to one of the three real RGB blocks in `bg_tiles.pal`. This is genuinely new complexity Plan 1's own GBA renderer never needed (I1's split concept has no day/night analog) — keep it isolated to this one file so Task 5/7's own renderer code stays simple and takes a resolved palette as input, not a time-of-day enum.

---

## Task 7: Event loader — object/warp/bg/coord events

`load/events.ts`: parses each map's own inline event block (`def_object_events`/`object_event ...`, `def_warp_events`/`warp_event ...`, `def_bg_events`/`bg_event ...`, `def_coord_events`/`coord_event ...` — Crystal-only, no Yellow analog) into the same four-list shape GBA's `MapData` already uses conceptually (`objectEvents`/`warpEvents`/`bgEvents`/`coordEvents`), but with GBC's own real field set per event kind (hour-limit fields on `object_event`, scene/callback references on `coord_event` — read the real macro argument order from `macros/scripts/maps.asm` directly, do not assume it matches the one example line quoted in this plan's own roadmap).

---

## Task 8: Wild encounter loader

`load/encounters.ts`: parses `data/wild/maps/*.asm`'s `def_grass_wildmons`/`def_water_wildmons` blocks (species+level pairs, one flat encounter rate — simpler than GBA's own min/max-level 12-slot table, per the roadmap's own research) and the `WildDataPointers` dispatch table for per-map lookup.

---

## Task 9: Full-map renderer

`render/layout.ts`: composites Task 5/6/7's outputs into one RGBA raster — metatile-grid → tile pixels → palette-applied color, mirroring GBA's own `renderLayout` SHAPE (same `Raster`/output-dimension conventions where they genuinely transfer) but calling GBC's own decode/palette pipeline underneath. No border-ring concept unless Task 1's research finds one (GBA's `border.bin` may have no Crystal analog — verify, don't assume it exists).

**Test:** render a real, known map; confirm real pixel values at known coordinates against what the raw tile+palette data should produce (same "pin the value, don't just assert non-crash" discipline as every prior render test in this project).

---

## Task 10: CLI read commands

Wire `render`/`query`/`where`/`coverage`-shaped commands (mirroring the GBA CLI's own established thin-handler/`resolveProject` pattern, Task 1's own family-detection decision deciding whether this is a flag on the SAME `pokemap` binary or a separate one) against the GBC loaders. Live-verify against the real subject repo (`pokemap-gbc render NewBarkTown -o out.png`, inspect the PNG).

---

## Task 11: World/connections graph + stitching

Builds the GBC-equivalent of GBA's `world/resolve.ts`/`world/connections.ts` from Task 3's own parsed `connection` macro data (north/south/east/west + target map + offset — structurally the same four-directional model as GBA per the roadmap's own research, likely the CLEANEST direct port in this whole plan). Given Crystal's own much smaller corpus (~257 layouts vs. GBA's 1,209 maps), the perf-driven design concerns Plan 1's own Task 23 (LOD mips, viewport culling) may be unnecessary — assess against Crystal's real measured world-pixel-size before porting that complexity, don't assume it's needed.

---

## Task 12: Encounter atlas (`whereSpecies`/`coverage` equivalents)

Ports GBA's own `analyse/coverage.ts` shape against Task 8's simpler encounter model (no multi-table day/night encounter variants to worry about at the DATA level — Crystal's own day/night system per Task 6 affects rendering, not which Pokémon appear where, unless Task 1's research finds otherwise; verify before assuming).

---

## Self-review checklist (fill in when this plan is re-granularised before execution, per its own header instruction)

- [ ] Every File Structure table entry traced to the task that creates it.
- [ ] Every roadmap §3 open item has a task (Task 1) that resolves it BEFORE any task depending on the answer starts.
- [ ] No task in this plan writes to the real subject repo (Plan 6 is read-only; Tasks 2/4's own "round-trip identity" tests read+encode+COMPARE in memory, or write only to a throwaway/test fixture copy — never the real repo — confirm this explicitly when re-granularising each task's real steps).
- [ ] Placeholder scan (TBD/TODO/"handle it later") — this plan intentionally has open items (§3, flagged explicitly, not hidden) but no task's own CORE deliverable should be a placeholder.
