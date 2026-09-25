# Task 6 code-quality review — palette.ts / palette.test.ts

Diff: `git diff 5cdebac df61cb8 -- packages` (2 new files: `src/gbc/load/palette.ts` 600 lines, `test/gbc/load/palette.test.ts` 444 lines). Spec compliance already approved (2346-case corpus match). This review: reuse, cohesion, perf, errors, types, tests.

## Verification run
- `npx tsc --noEmit -p tsconfig.base.json` — clean, no errors.
- `npx vitest run packages/core` — 47 files / 578 tests pass.
- `npx vitest run packages/core/test/gbc/load/palette.test.ts` — 41/41 pass, **8.5s wall**, of which the 391×3×2=2346-case sweep test alone is **8.3s** (~3.5ms/call).

## Important

**I1 — perf: caller cannot actually apply the doc comment's own caching advice (palette.ts:518-522, 524-591).**
`resolveMapPalettes`'s doc comment says: "A caller resolving many maps should cache anything keyed only by root on its own side, the way `loadGbcTileset`'s own doc comment asks of its callers." But unlike `loadGbcTileset` (tileset.ts:393-416), which is a small pure function callers can trivially memoize whole (`Map<tilesetConst, GbcTileset>`, ~37 distinct entries for 391 maps), `resolveMapPalettes` inlines *every* root-keyed table load/parse inside its own body (map_data_constants.asm, wram_constants.asm, tileset_constants.asm, timeofday_pals.asm, engine/gfx/color.asm, engine/tilesets/tileset_palettes.asm, bg_tiles.pal, environment_colors.asm, and conditionally roofs.pal — lines 529-561, 566-567, 580-581) and none of the resulting structures (`envConsts`, `paletteConsts`, `clockConsts`, `palBg`, `brightness`, `colorAsmIncludes`, `specialIncludes`, `bgTilesPal`, `envBlockMap`/`envBlocks`, `roofPals`) are exposed. A caller cannot "cache anything keyed only by root" without re-implementing this module's own parsing — the advice is not actionable today.

Concrete fix: split into `loadPaletteTables(root): PaletteTables` (does every read/parse above, once) and a pure `resolveFromTables(tables, input, opts): RGB[][]` (the per-map logic: `resolveSpecialPalette`/`resolveEnvironmentPalette`/`resolveTimeOfDayPal`/roof overlay, lines 555-589 today). Keep `resolveMapPalettes(root, input, opts)` as a thin `loadPaletteTables` + `resolveFromTables` wrapper for existing single-call callers/tests. Task 9's world render then does `const tables = loadPaletteTables(root)` once and calls `resolveFromTables(tables, map, opts)` per map (×391, or ×391×N if it renders multiple times/flash states) — turning ~9 file reads+reparses/map into 9 total.

Measured impact: the 2346-call sweep already costs 8.3s in-repo; a 391-map single-pass world render pays roughly 391/2346 of that (~1.4s) in pure redundant I/O/parsing that the split would collapse to one root load (sub-50ms). Worth doing before Task 9 lands, since Task 9 is exactly the "call it per map, ~391 maps" consumer this module's own doc comment anticipates.

## Minor

**M1 — `parseConstDefs` now shared across two domains, still lives in tileset.ts (tileset.ts:63-81, palette.ts:43).** It was tileset-scoped when Task 5 wrote it (used for `TILESET_*`/`PAL_BG_*`); palette.ts now imports it for `map_data_constants.asm`'s environment/palette enums and `wram_constants.asm`'s clock enum — three unrelated domains. No functional problem (no second implementation — confirmed, this was the main reuse risk and it's clean), but the import now reads backwards: a generic asm-enum parser living in the "tileset loader" module. Consider moving `parseConstDefs` to `asm.ts` alongside `codeLines`/`matchCall`/etc. (the other shared RGBDS-line primitives) in a later pass; re-export from tileset.ts if churn matters more than the cleanup right now. Not blocking.

**M2 — `findClockConstIn`'s whole-word substring scan is a bit loose (palette.ts:320-330).** It returns the first of `clockConsts`' names (Map iteration = source order) that appears as `\b<name>\b` anywhere in the extracted text, rather than parsing the actual operand it's meant to read (`.UsedFlash`'s `ld a, (NITE_F<<6)|...` broadcast, or `DARKNESS_PALSET`'s `EQU` line). Bounded to a narrow, single-purpose section in both call sites today (a 3-line `.UsedFlash` body; one `EQU` line) so practical risk is low, and it's corpus- and unit-pinned. Flagging only because it would silently pick the wrong constant if a fork's `.UsedFlash` body ever referenced two different clock constants in the same section (e.g. a comment mentioning another `_F` name) — not observed in the real file. No fix required now; worth a code comment noting the "first match wins" behavior if this function gets a second call site.

**M3 — file is 600 lines, single module.** Cohesive given the single `LoadMapPals` pipeline it replicates and the density of doc comments (this matches the established sibling style in tileset.ts/map.ts, also large and heavily commented) — not recommending a split today. If the I1 `loadPaletteTables`/`resolveFromTables` split lands, consider whether the brightness-levels section (lines 270-407, ~140 lines) is cohesive enough to warrant its own file at that point; not required now.

## Reuse checklist (explicit answers)
- Second `const_def`/enum parser? **No** — `parseEnvironmentConsts`/`parseMapPaletteConsts`/`parseClockConsts` all delegate to `tileset.ts`'s `parseConstDefs` via a shared `extractConstDefBlockEndingAt` isolator (palette.ts:115-154). Clean.
- Reimplements `asm.ts` primitives? **No** — imports `matchCall`, `splitArgs`, `stripComment`, `stripMacroDefs` directly (palette.ts:40) and uses them throughout; no local reimplementation found.
- Reimplements `map.ts`'s `parseNum`? **No** — imported directly (palette.ts:41), used for all numeric literals (RGB components, `db`/`dc` args, `const_def` args via `parseConstDefs`).
- `RGB` shape: reused from `model/types.ts` (palette.ts:44), not redefined — matches GBA's `pal.ts` which does the same.
- Anything Task 9 needs buried private? **No** — `resolveMapPalettes` and its `ResolveMapPalettesInput`/`ResolveMapPalettesOpts` types are exported; no current consumer yet (`grep` for imports of `gbc/load/palette` outside the test file returns nothing, as expected pre-Task-9).

## Errors / types
Consistent with siblings: every throw is `<functionName>: <context>: <message>`, naming the offending file/value (e.g. palette.ts:80, 96, 119, 129, 185, 249, 253, 258, 264, 288, 292, 314, 329, 369, 400, 404, 445, 450, 453, 481, 559, 584, 598). `ResolveMapPalettesOpts` documents defaults inline (`time` default "day", `flash` default true) matching the findings doc's recommendation. No type issues found.

## Tests
41 tests, readable, each corpus assertion quotes and hand-verifies the exact source line(s) it's checking (e.g. lines 283-290, 369-376) rather than asserting opaque expected arrays — not brittle in the sense that matters (a real source-file edit would need the comment updated too, which is the intended trip-wire). Two mutant-killing tests explicitly called out (RadioTower vs PokeComPalette, PokecomCenter vs BattleTowerInside — lines 331-332, 354-355) show adversarial-review follow-through. No unused code, no dead imports. The 2346-case sweep (line 421-442) is the one test worth watching for CI time as the corpus grows — see I1.

## Verdict
No Critical or Important-blocking correctness issues; I1 is a real, concrete, pre-Task-9 perf fix worth doing but doesn't affect current correctness or tests. Given the guidance to flag genuine perf concerns concretely rather than block on them, and that all 578 tests + typecheck pass clean: recommend addressing I1 before/alongside Task 9's first integration (cheap to do now, expensive to retrofit once Task 9 has 391 call sites), M1-M3 are optional.

## Re-review 1 (`git diff df61cb8 e131eb7 -- packages`)

Verified all three requested fixes land correctly, no regressions:

- **I1**: `palette.ts` now exports `loadPaletteTables(root): PaletteTables` (every root-keyed read/parse, once — constants, `bg_tiles.pal`, environment-colors blocks, roofs.pal, brightness levels, all 5 `SPECIAL_TILESET_LABELS` palettes, mansion palette) and pure `resolveFromTables(tables, input, opts)` (per-map logic only, no I/O). `resolveMapPalettes` is now a thin `resolveFromTables(loadPaletteTables(root), input, opts)` wrapper — confirmed by reading the full diff, not just the signatures. The corpus sweep test (palette.test.ts:421-449) now calls `loadPaletteTables` once outside the loop and `resolveFromTables` 2346 times inside, with a comment reporting an isolated (non-vitest) measurement: reload-per-call ~3747ms vs loadPaletteTables-once(11ms)+resolveFromTables×2346(4ms) ~15ms, ~250x on the resolve work itself. Re-ran the suite: `palette.test.ts` wall time dropped 8318ms → 5435ms; the remainder is the test's own ~225k `expect()` calls (its comment says as much, and that overhead predates I1 and is orthogonal to it) — consistent with the claimed I/O-side win. Correctness unaffected: all pre-existing hand-verified RGB assertions (NewBarkTown, Route29, CeladonMansion1F, IcePath1F, HallOfFame, WhirlIslandNW, etc.) pass unchanged, confirming `resolveFromTables`'s output is identical to the old inline logic.
- **M1**: `parseConstDefs` moved from tileset.ts to asm.ts (asm.ts:134-196 in the new diff), alongside `parseNum` (also moved there from map.ts, to avoid a circular import: `parseConstDefs` needs `parseNum`, and asm.ts must not depend on map.ts). `map.ts` re-exports `parseNum` for its own existing importers (`export { parseNum };`, map.ts:11-15); `tileset.ts` now imports `parseConstDefs` from `./asm.js` and no longer defines it. `tileset.test.ts` updated its import accordingly. Confirmed no cycle: asm.ts imports nothing from map.ts or tileset.ts; map.ts and tileset.ts both import from asm.ts one-directionally.
- **M2**: `findClockConstIn`'s doc comment (palette.ts, above the function) now states the first-match-wins behavior explicitly and notes both current call sites bound `text` narrowly enough that it's unambiguous today, flagging it as worth revisiting only if a future looser-bounded call site appears. Matches what was asked.

Verification re-run: `npx tsc --noEmit -p tsconfig.base.json` clean; `npx vitest run packages/core/test/gbc/load/{palette,tileset,map}.test.ts` → 149/149 pass (41 + 55 + 53).

One residual nit, not blocking: `resolveSpecialFromTables`'s special-tileset/mansion palettes are now eagerly loaded for all 5 `SPECIAL_TILESET_LABELS` entries plus mansion inside `loadPaletteTables`, vs. the old code's lazy per-map load of only the tileset actually in use. Since `loadPaletteTables` runs once per root this is a non-issue for perf, and it's arguably an improvement (fails fast on a missing INCLUDE label at load time rather than mid-render) — flagging only because it's a small semantic shift from "throws only if a map needs it" to "throws unconditionally if any of the 5 is missing," which happens to be moot for the real corpus (all 5 present, all tested).

**APPROVED** — no Critical/Important open findings remain.
