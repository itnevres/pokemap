# Plan 6 Task 11: GBC world/connections stitching and the world render -- implementer report

Worktree: `/home/user/pokemap/.claude/worktrees/agent-adc366c1016fd68fc`, branch fast-forwarded to `plan-6-gbc-foundation` at `9192a69` before starting.

## Files changed

New:
- `packages/core/src/gbc/world/connections.ts` -- `buildGbcWorld(proj: GbcProject): GbcWorld`, `GbcWorld`. Re-exports GBA's `Placement`/`Bounds`/`Component`/`Conflict` types and its `boundsOf`/`layOutComponents` functions.
- `packages/core/src/gbc/render/world.ts` -- `renderGbcWorld(proj, world, opts): RenderGbcWorldResult`.
- `packages/core/test/gbc/world/connections.test.ts` (14 tests: 7 hand-derived-fixture unit tests + 2 `boundsOf`/`layOutComponents` unit tests + 5 corpus tests).
- `packages/core/test/gbc/render/world.test.ts` (5 corpus tests).

Modified:
- `packages/core/src/world/connections.ts` (GBA file -- the only two permitted edits, both behaviour-neutral by inspection): `boundsOf` and `layOutComponents` changed from private to `export`ed; `layOutComponents` gained an optional third parameter `opts: { gap?: number; rowTarget?: number } = {}`, with `GAP = opts.gap ?? 8` and `ROW_TARGET = opts.rowTarget ?? 512` replacing the old hardcoded `const GAP = 8; const ROW_TARGET = 512;`. The one existing call site (`buildWorld`'s own `layOutComponents(components, placements);`) passes no third argument, so it resolves to the exact same 8/512 defaults it always used -- byte-identical behaviour. No other line in the file changed.
- `packages/cli/src/gbcCommands.ts` -- added `runGbcRenderWorld(root, opts): { stdout, stderr }`, mirroring `runGbcRender`'s shape.
- `packages/cli/src/index.ts` -- `render-world`'s action now branches on family: GBC calls `runGbcRenderWorld`; GBA's existing body is otherwise untouched (just no longer wrapped in `runGbaOnly`, since `render-world` is no longer GBA-only). `--scale` lost its commander-level default (was hardcoded `4`); the per-family default (GBA 4, GBC 8) is now resolved inside the action via `cmd.getOptionValueSource("scale")`. Added a `--time` option (GBC only, default `"day"`, ignored by the GBA path). `--no-dungeons` stays GBA-only in effect -- silently ignored on the GBC path.
- `packages/cli/test/gbcCommands.test.ts` -- removed `render-world` from the "every GBA-only command refuses" case list (it's no longer refused); added a `describe("runGbcRenderWorld", ...)` block (2 tests) and one more spawned e2e test (`render-world` against the real subject).

Local-only, not committed: `pokemap.config.json` (`gbc.projectPath`).

## Design choices

- **Units are blocks throughout** (`GbcWorld.placements` in blocks, `RenderGbcWorldOptions.bbox` in blocks, `scale` = px/block). `BLOCK_PX = 32` is the one place the 32px/block constant lives in `render/world.ts`.
- **`buildGbcWorld` resolves connections by `targetConst`**, joining once against a `Map<constName, name>` built before the BFS starts (`nameByConst`), never re-scanning `proj.maps` per edge and never trusting `targetName` (I4). Verified this matters with a unit test where `targetName` is a deliberate red herring that doesn't match any real map (see mutation #4 below and the "resolves by targetConst, not targetName" test).
- **Unknown target const throws, unlike GBA's silent `continue`.** GBA's `buildWorld` treats an unresolvable connection id as an expected case (a cross-game/debug room outside the loaded set) and skips it. GBC's `targetConst` was measured to resolve for all 142 real connections (0 misses), so an unresolved one here is a genuine data problem, not a normal case -- refusing surfaces it immediately instead of silently producing an incomplete world. Named-error style: `<map>: connection <direction> names unknown target const <const>`.
- **No `VerticalLink`/dive-emerge concept.** `Connection.direction` is `"north" | "south" | "west" | "east"` only -- there is nothing to filter into a second array, unlike GBA's `ConnectionDirection` which also carries `"dive" | "emerge"`.
- **No dungeon auto-layout / sidecar / `resolveWorldPlacements` equivalent.** `buildGbcWorld` places every one of the 391 maps unconditionally (same as GBA's `buildWorld` itself, before GBA's separate `resolve.ts` layer runs on top). There is no GBC UI in Plan 6 that would consume a dungeons-on/off toggle, so `world.placements` is exactly what `renderGbcWorld` draws from -- no resolve step. This is explicitly out of scope per the task spec.
- **Conflicts use the exact GBA `Conflict` shape**, `viaB.from` is the map that actually placed the target (tracked via a `placedBy` map), not a placeholder string -- ported verbatim from GBA's own fix for the same issue.
- **`renderGbcWorld`'s own `--scale` validation** (positive integer, divisor of 32) lives in core, not in `packages/cli/src/args.ts`'s `parseScale`. `parseScale` stays family-agnostic (just "positive integer") because it's shared by both families' `--scale` option and GBA's own unit is a divisor of 16, not 32 -- a single divisibility check in `args.ts` would be wrong for one family or the other. `renderGbcWorld` throws a named error (`renderGbcWorld: --scale must be a positive integer divisor of 32, got <n>`) for a non-divisor, non-positive, or non-integer scale.
- **CLI `--scale` default resolution.** `render-world`'s `--scale` option now has no commander-level default; the action resolves `scale = 8` for GBC only when `cmd.getOptionValueSource("scale") === "default"` (i.e., not explicitly passed), and `opts.scale ?? 4` for GBA (unchanged: `4` was always the literal default, now applied in the action body instead of by commander, with identical observable behaviour). This lets each family keep its own "quarter overview" number (GBA 16px tile / 4; GBC 32px block / 4 = 8) without a commander-level default baked in for one family that would be wrong for the other.
- **`--no-dungeons` on GBC: ignored, not refused.** Chose "ignore silently" over "refuse when explicitly passed" so a script that calls `render-world` the same way for both families doesn't have to special-case GBC just to drop a flag that means nothing for it. Documented inline in `index.ts`.
- **`renderGbcWorld`'s defect dedup** is keyed by `file + "\0" + message` (a NUL-joined string, since neither field can itself contain a NUL byte, unlike a comma or colon which do appear in real defect messages).

## LOD assessment

Measured against the real subject (`/home/user/pokecrystal-PerfPlus`, 391 maps, 142 connections):

- **Components: 326 total.** 3 have more than one map: **35** (Kanto/PalletTown's landmass), **31** (Johto/NewBarkTown's landmass), **2** (`SilverCaveOutside`+`Route28`). The remaining **323** are 1-map (isolated interiors/floors reached only by warps).
- **Kanto is NOT connected to Johto** in this graph -- confirmed by placement component index (`w.placements.get("PalletTown").component !== w.placements.get("NewBarkTown").component`). The Olivine<->Vermilion ferry is a warp, not a planar `connection` record, so it plays no part in this BFS.
- **Largest component's extent**: Johto (31 maps) is the widest at **235 blocks x 135 blocks** (7,520 x 4,320 px) pre-pack. Kanto (35 maps) is **140 x 135 blocks** (4,480 x 4,320 px).
- **Total packed world extent**: **255 x 746 blocks = 8,160 x 23,872 px** (tall and narrow: after the two landmasses and the 1 two-map component take the first ~3 rows, the 323 singleton interiors shelf-pack several-per-row into many short rows below them).
- **Time to render the full packed world** (`renderGbcWorld` over the whole `255x746`-block bbox, all 391 placements, `time: "day"`, warmed `GbcProject`/`GbcWorld`):
  - scale 32 (full size, 8,160x23,872 px): **~1.49s**
  - scale 8 (overview, 2,040x5,968 px): **~0.63s**
- **Decision: no LOD/culling needed.** Both numbers are comfortably interactive for a CLI render, and in practice the CLI only ever renders a caller-supplied bbox (a fraction of the full world), which is strictly cheaper than the full-world numbers above thanks to the bbox intersection check. There is no perceptible stutter or memory concern at either scale; a full re-render on every request would be fine for the current Plan 6 scope. This confirms the spec's expected decision.

## Measured corpus values (pinned in tests)

- `NewBarkTown` -west-> `Route29`, offset 0: `Route29.x === NewBarkTown.x - Route29.width`, `Route29.y === NewBarkTown.y`.
- `AzaleaTown` -west-> `Route34`, offset -18 (`connection west, Route34, ROUTE_34, -18`): `Route34.y === AzaleaTown.y - 18`, `Route34.x === AzaleaTown.x - Route34.width`.
- **Components**: 326 total; sizes `[35, 31, 2, 1, 1, ..., 1]` (323 ones).
- **NewBarkTown's component**: 31 maps -- `AzaleaTown, BlackthornCity, CherrygroveCity, CianwoodCity, EcruteakCity, GoldenrodCity, LakeOfRage, MahoganyTown, NewBarkTown, OlivineCity, Route26, Route27, Route29, Route30, Route31, Route32, Route33, Route34, Route35, Route36, Route37, Route38, Route39, Route40, Route41, Route42, Route43, Route44, Route45, Route46, VioletCity`. Kanto's component (`PalletTown`'s) is a different, 35-map component.
- **Conflicts: 2** (measured, not 0). Both are in Kanto's Route16/17/18/`FuchsiaCity` loop: `Route18` is placed differently depending on whether it's reached via `Route17` (east, offset 38) or via `FuchsiaCity` (west, offset 7); `Route17` differently via `Route18` (west, offset -38) vs `Route16` (south, offset 0). Each pair of computed positions differs by exactly 1 block on one axis -- a genuine, small inconsistency in the decomp's own connection data (the same class of finding as GBA's own Safari Zone/RuinsOfAlph/EcruteakCity conflicts in `packages/core/test/world/connections.test.ts`), not an artefact of this algorithm. Confirmed by mutation (see below): negating either axis's sign changes this count (8 or 10, not 2), so the pin is sensitive to a real sign error, not just noise.
- **Reciprocity**: all 142 connection records reciprocate -- **71 pairs, 0 unpaired (one-way)**, and every reciprocal pair's offset is exactly the negation of its partner's (0 sign mismatches), measured directly from `GbcMap.connections` independent of `buildGbcWorld`'s own placement math.
- **`GBC_ROW_TARGET = 256` blocks, `GBC_GAP = 8` blocks** (chosen and justified in `connections.ts`'s own doc comment): `rowTarget` is set comfortably above Johto's measured 235-block width, the widest single component in the corpus, so each of the two landmasses gets its own row rather than wrapping mid-landmass; `gap` is kept at GBA's own 8 (now blocks, not tiles) since there's no measurement arguing for a different value.

## Mutation-check

All 7 required mutations applied to a working copy, confirmed red, then reverted (`diff` confirmed byte-identical to the pre-mutation file) and confirmed green again.

| # | Mutation | Test(s) that went red | Reverted, confirmed green |
|---|---|---|---|
| 1 | Negate offset on the x axis only (north/south formulas: `here.x - c.offset` instead of `+`) | 3: hand-fixture "places all four neighbours...", corpus "AzaleaTown/Route34...", corpus "reports exactly the measured number of contradictions..." (2 -> 8) | yes |
| 2 | Negate offset on the y axis only (west/east formulas: `here.y - c.offset` instead of `+`) | 4: hand-fixture "places all four...", hand-fixture "records a conflict...", corpus "AzaleaTown/Route34..." (233 vs 269), corpus conflict count (2 -> 10) | yes |
| 3 | Swap the north/south formulas | 3: hand-fixture "places all four...", hand-fixture "records a conflict...", corpus conflict count (2 -> 10) | yes |
| 4 | Resolve targets by `targetName` instead of `targetConst` (`nameByConst` keyed by `m.name`, looked up by `c.targetName`) | 1: the dedicated hand-fixture "resolves by targetConst, not targetName" test (a map whose `targetName` is a red herring that resolves to nothing). **Equivalent on the real corpus** -- all other 13 tests, including every corpus test, stayed green, since every real connection's `targetName` happens to equal its target's real map name. This confirms the spec's own prediction and is why that dedicated unit test exists. | yes |
| 5 | Drop conflict recording (delete the `if (existing.x !== pos.x ...) conflicts.push(...)` block, keep the `continue`) | 2: hand-fixture "records a conflict...", corpus "reports exactly the measured number of contradictions..." (2 -> 0) | yes |
| 6 | Change GBA `layOutComponents`'s defaults (8/512 -> 20/900) | 1: the dedicated "layOutComponents with no opts keeps GBA's own default gap/rowTarget (8/512)" unit test in `connections.test.ts` (GBA's own corpus suite that would normally catch this can't run in this environment -- no GBA decomp -- so this GBC-side unit test of the exported function with default args is what catches it, per the spec's own instruction) | yes |
| 7 | Drop the bbox intersection check in `renderGbcWorld` | 3: "--scale 32: two pixels...", "--scale 8: exact output dimensions...", "draws only placements intersecting the bbox..." (drawn count 1/2 -> 391 in each case) | yes |

`npm run typecheck` stayed clean throughout (checked after each mutation and after each revert); `git diff`/manual `diff` against a saved pre-mutation copy confirmed each revert was byte-identical.

## Live-verify

Both rendered via the real CLI, `npx tsx packages/cli/src/index.ts --project /home/user/pokecrystal-PerfPlus render-world ...`, from the repo root:

- **`render-world --bbox 0,143,235,135 --scale 8 -o johto_scale8.png`** (Johto's full component bbox, measured from `buildGbcWorld`'s own component bounds) -> exit 0, stdout `... 1880x1080 maps=31`. **Image**: the recognisable Johto overworld region -- towns rendered as clusters of colored-roof buildings connected by dirt/grass routes, forests (dense dark-green tree tiles), lakes and coastline (blue water, including a cluster of small islands lower-left that reads as the Whirl Islands area), and a distinct town near the bottom-right coast. Every route visibly connects two towns/other routes with a continuous, single-width path -- no visible gap, duplicated strip, or path that dead-ends into blank space at a map boundary, which is the seam check: a sign error on either connection axis would show up here as a route whose path jumps sideways or a town offset from where its connecting route enters it, and none of that is visible.
- **`render-world --bbox 125,251,60,9 --scale 32 -o johto_small_full.png`** (tight bbox around `CherrygroveCity`+`Route29`+`NewBarkTown`, full size) -> exit 0, stdout `... 1920x288 maps=3`. **Image**: left-to-right, CherrygroveCity (water/dock on the left edge, three pink-roofed buildings including what reads as the Pokemon Center/Mart), then Route 29 (a long grass corridor with scattered trees, tall grass patches, and a Pokemon-trainer-sign-like object), then NewBarkTown (green-roofed houses including Elm's Lab on the right edge). The path is one continuous walkable strip the entire width of the image with the correct tree/grass texture carried across each of the two map boundaries -- no vertical seam, doubled column, or misaligned row is visible at either the Cherrygrove/Route29 or Route29/NewBarkTown boundary, confirming the west/east offset-0 placements (both connections in this stretch have offset 0, i.e. same y) line up pixel-exactly.

Both images were viewed directly (not just measured) and match the expected real-game geography.

## Test counts / gates

- `npx vitest run packages/core/test/gbc`: **15 files / 481 tests, all green, 0 skipped** (13 files/462 tests baseline + 2 new files/19 new tests: 14 in `world/connections.test.ts`, 5 in `render/world.test.ts`).
- `npx vitest run packages/cli/test/gbcCommands.test.ts`: **16 tests, all green, 0 skipped** (13 baseline + 3 new: 2 `runGbcRenderWorld` unit tests + 1 spawned `render-world` e2e test).
- `npm run typecheck`: clean.
- Full `npm test`: **947 passed, 136 skipped, 17 failed test files / 1 failed test** -- exactly the pre-existing baseline (17 GBA-family test files that construct a `Project` at module load against the still-unconfigured `gba.projectPath`, plus `write/corpus.test.ts`'s "has every reference engine available", both stemming from the missing GBA decomp on this machine, per the task's own stated environment). **No new failures.**

## Concerns / deviations

- **`GBC_ROW_TARGET`'s value (256) is a judgement call, not a uniquely correct number.** The spec says "rowTarget ≈ the largest component's width" -- I measured that (235, Johto) and rounded up to 256 for headroom. A different, equally defensible choice (e.g. exactly 235, or 300) would also satisfy "each landmass gets its own row"; I picked 256 for being a round number comfortably above the measurement, and documented the reasoning and the exact numbers it's based on in the source so a future re-measurement can sanity-check it.
- **`--scale`'s commander-level default removal**: GBA's `render-world --scale` used to have a literal `4` baked into the `.option(...)` call; it's now resolved in the action body instead (still `4` for GBA, unconditionally, when not explicitly passed). This is a refactor of *where* the default lives, not a behaviour change -- I could not find any existing test asserting on commander's own default-value introspection (`getOptionValueSource`) for this option, and the GBA corpus test suite that would exercise `render-world --scale` end-to-end can't run in this environment anyway (no GBA decomp). I'm flagging this as the one place a GBA behaviour is now indirectly dependent on `commander`'s `getOptionValueSource` API (verified present and correctly typed in the installed `commander@12.1.0`) rather than on a plain default parameter, in case a future commander upgrade changes that API's semantics.
- **The 2 measured conflicts** are real data facts about `pokecrystal-PerfPlus`'s Route16/17/18/FuchsiaCity connection records, not a defect in this implementation -- worked through by hand in the corpus test's own comment and cross-checked against the mutation-check's sign-flip results (which produce 8 or 10 conflicts, confirming 2 is specific to the correct formulas, not an artefact of an off-by-one in the algorithm itself).
- **No GBA test could be run** to confirm `packages/core/src/world/connections.ts`'s two-line change (`export` + optional third parameter with identical defaults) is behaviour-neutral for GBA. I inspected the diff line-by-line (the only change to the function body is `const GAP = 8` -> `const GAP = opts.gap ?? 8`, same for `ROW_TARGET`, plus the `export` keyword on both declarations) and added a GBC-side unit test that exercises the exported function's default-args path directly, per the spec's own suggested mitigation, but this is inspection-based confidence, not a passing GBA test run.
- No other deviations from the spec.

## Fix round 1

Addressed `task-11-spec-review.md` (❌ 2 test-strength issues; conflict analysis itself confirmed correct and cross-checked against vanilla pret/pokecrystal) and `task-11-quality-review.md` (Approved, with Important #1/#2/#4 and Minors #5-7).

### Step 0: rebase

Rebased onto `plan-6-gbc-foundation` twice, as it moved during the fix round:
1. First onto `3794891` (Task 10's fix round `e71de1a`, which converted GBA-only handlers to a `refuseIfGbc` guard clause and kept `runGbaOnly` only for `render-world`, anticipating this task removing its last caller) -- `git rebase plan-6-gbc-foundation` applied clean with **zero conflicts** (Task 10's own fix round deliberately left `render-world` untouched for exactly this reason, confirmed by the quality review's own "CLI merge alignment" check).
2. The branch then moved again to `7d095b2` (Task 12's encounter atlas, landing `encounters`/`where`/`coverage` as real GBC commands in the same 3 files this task touches). Re-ran `git rebase plan-6-gbc-foundation`; this time `packages/cli/src/index.ts` and `packages/cli/test/gbcCommands.test.ts` had import-line and comment conflicts (both sides adding to the same import statement / the same explanatory comment above the shared "every GBA-only command refuses" test) -- resolved by keeping both sides' additions (Task 12's `runGbcEncounters`/`runGbcWhere`/`runGbcCoverage` imports and comment, plus this task's `runGbcRenderWorld`).
3. After both rebases, `runGbaOnly` had zero remaining callers (Task 12 gave `encounters`/`where`/`coverage` real GBC branches too, exactly like `render`/`query`, rather than routing them through the guard-clause wrapper) -- deleted it and its doc comment entirely, as instructed.
4. Ran the full `packages/core/test/gbc packages/cli/test` suite after each rebase (Task 12's `atlas.test.ts` included) to confirm green before continuing, per the coordinator's explicit ask.

### Required fixes

1. **[spec Issue 1] Exact `Conflict` identity, not "both positions present in either order".** The hand-fixture "records a conflict" test now asserts `expect(w.conflicts).toEqual([{ map: "Bridge", viaA: { from: "East", x: 14, y: 6 }, viaB: { from: "North", x: 8, y: 10 } }])` (North is dequeued before East from Home's own `[north, south, west, east]` connection order, so North places Bridge first). The corpus conflict test now pins both real conflicts by full identity: `Route18` (`viaA` Route17 (40,87), `viaB` FuchsiaCity (40,88)) and `Route17` (`viaA` Route18 (30,50), `viaB` Route16 (30,49)), matching the spec review's own independently-derived values exactly.
2. **[spec Issue 2] A real dedup test, not just "two different defects both flow through".** Extracted the de-dupe logic into its own exported pure function, `dedupeDefects(lists: readonly (readonly DataDefect[])[]): DataDefect[]` (`render/world.ts`), which `renderGbcWorld` now calls over the per-placement `raster.defects` lists it collects. This makes the actual dedup claim unit-testable with hand-built data (two lists sharing one byte-identical `{file, message}` entry, plus a same-file-different-message entry that must NOT collapse) instead of needing to engineer two real corpus maps that happen to share a `.blk` (the real corpus has none). The old corpus test is retitled to "two different drawn maps' two different defects both surface, neither dropped nor duplicated" and its own comment now says plainly that it never covered dedup.
3. **[quality Important #1] Packed extent pinned.** Added `"packs the whole world into a 255x746-block bounding box"` (`boundsOf` over every placed map) and `"Johto and Kanto land in separate, non-overlapping rows"`. Confirmed by mutation: `GBC_ROW_TARGET`/`GBC_GAP` mutated to 50/1 now fails the extent test (`235x1068` instead of `255x746`) -- previously all 35 affected tests stayed green.
4. **[quality Important #2 / spec Minor m5] Dropped `getOptionValueSource`.** `index.ts`'s GBC branch is now `const scale = opts.scale ?? 8;` (no `Command` parameter on the action callback at all), exactly mirroring GBA's `opts.scale ?? 4` two lines down. Confirmed directly against the installed `commander@12.1.0` (per the reviewer's own check) that `getOptionValueSource("scale")` can only ever return `undefined` here, never `"default"`, since the option has no commander-level default any more.
5. **[quality Important #4 / spec Minor m2] Default-scale-8 now actually exercised.** Rather than passing `--scale 32` explicitly, the existing spawned `render-world` e2e test now omits `--scale` entirely and asserts the default-8 dimensions (`320x72` for the 40x9-block NewBarkTown+Route29 bbox) through the real CLI end to end. Confirmed by mutation: changing the CLI default to 4 now fails this test (`160x36` instead of `320x72`) -- previously nothing caught it.

### Minors

- **m1.** `render-world` on a GBC root now prints one `note: <map> placed via <viaB.from>; <viaA.from> disagrees by (dx,dy)` stderr line per `Conflict` whose map was actually drawn (`RenderGbcWorldResult.conflicts`, computed in core by filtering `world.conflicts` against the same drawn-map set the bbox intersection already builds; formatted by a new `noteLines` in `gbcCommands.ts`, appended to stderr after `warningLines`). Purely informational -- `process.exitCode` is untouched. Pinned for the Route17/Route18 bbox: `"note: Route18 placed via FuchsiaCity; Route17 disagrees by (0,-1)\n" + "note: Route17 placed via Route16; Route18 disagrees by (0,1)\n"`, plus a core-level test of `RenderGbcWorldResult.conflicts` itself (present and empty cases) and a CLI-level test of the formatted stderr text.
- **m3.** Added `"excludes a placement whose top edge exactly abuts the bbox's bottom edge"` (Route16's bottom edge exactly meets Route17's top edge, no gap). Confirmed by mutation: the bottom-edge check's `>=` mutated to `>` now fails this test (`drawn` 2 instead of 1) -- previously the whole suite stayed green under this specific mutation.
- **m4.** Documented the one-way-edge-into-an-earlier-component edge case directly in `buildGbcWorld`'s own doc comment (inherited verbatim from GBA, not fixed, moot on this corpus -- 0 one-way edges measured). Fixed the "resolves by targetConst" test's misleading comment (it previously claimed the BFS "never even has to consider a placement" for the cross-component edge, which is wrong -- it DOES record a conflict) and added `expect(w.conflicts).toEqual([...])` there, pinning the exact (if slightly wrong, per the documented `placedBy` fallback) conflict it produces.
- **m6.** Fixed the stale `LoadMapConnections` reference in `packages/core/src/gbc/model/types.ts`'s `Connection` doc comment (no such routine exists in this decomp; corrected to name `EnterMapConnection`/`FillMapConnections`/`GetMapConnection`) and added a corresponding one-line correction to `docs/superpowers/specs/2026-09-23-pokemap-gbc-format-findings.md`'s own "Connections" section. Fixed the "Route16/17/18/FuchsiaCity/Route19/Route15 loop" wording in the corpus conflict test's doc comment -- Route19 is not on the real cycle, and the actual non-closing cycle is the 13-map loop the spec review traced by hand (Route16 -> Route17 -> Route18 -> FuchsiaCity -> Route15 -> Route14 -> Route13 -> Route12 -> LavenderTown -> Route8 -> SaffronCity -> Route7 -> CeladonCity -> back to Route16); the corrected comment cites that loop and the spec review directly. `runGbaOnly`'s own stale doc comment was moot -- the function (and comment) no longer exists after Step 0's rebase deleted it.
- **m7.** Replaced every `expect(Buffer.from(a)).toEqual(Buffer.from(b))` raster comparison (one in `render/world.test.ts`, two in `gbcCommands.test.ts`) with `expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)`. A failing `toEqual` on a Buffer/Uint8ClampedArray-backed raster makes vitest's pretty-format diff engine spend minutes at 100% CPU (observed directly, matching the reviewer's own account) instead of failing fast.
- **m8.** No change -- `--time` on GBA `render-world` is already labelled "gbc only" in its own `--time` option help text.
- **Quality minors 5-7.** Documented the full-res-then-downscale trade-off directly in `renderGbcWorld`'s own doc comment (scale 8 is cheaper end-to-end purely because `blitScaled`'s destination-pixel loop shrinks, not because the per-map render cost does). Skipped sharing `BLOCK_PX` with `render/map.ts` per the coordinator's instruction (matches existing convention: `render/map.ts` hardcodes the literal `32` in five places already). The de-dupe test-title issue is the same as spec Issue 2, addressed above.

### Mutation-check (fix round)

All 7 original spec mutations re-applied against the current source and re-confirmed red (unchanged formulas/logic, so unchanged results), plus the 5 mutations the spec review found surviving -- each now caught by a new or corrected test, confirmed red, then reverted (`diff` against a saved pre-mutation copy confirmed byte-identical each time).

| # | Mutation | Killing test(s) | Reverted, confirmed green |
|---|---|---|---|
| 1 | x-offset negated (north/south) | 4: hand-fixture "places all four...", corpus "AzaleaTown/Route34...", corpus conflict identity pin, corpus extent pin | yes |
| 2 | y-offset negated (west/east) | 9: hand-fixture x2, corpus "AzaleaTown/Route34...", corpus conflict identity pin, corpus extent pin, + more | yes |
| 3 | north/south formulas swapped | 7: hand-fixture x2, corpus conflict identity pin, + more | yes |
| 4 | resolve by `targetName` | 1: dedicated hand-fixture test only; equivalent on the real corpus, as before | yes |
| 5 | conflict recording dropped | 4: hand-fixture "records a conflict...", corpus conflict identity pin, + more | yes |
| 6 | GBA `layOutComponents` defaults 8/512 -> 20/900 | 1: dedicated default-args unit test | yes |
| 7 | bbox intersection dropped | 6: all 3 original render tests + the 2 new `result.conflicts` tests + the new bottom-edge test | yes |
| 8 (reviewer survivor) | `viaA`/`viaB` swapped | 4: same conflict-identity-pin tests as #1/#2/#3/#5 above | yes |
| 9 (reviewer survivor) | defect de-dupe removed | 1: the new `dedupeDefects` unit test | yes |
| 10 (reviewer survivor) | bbox bottom edge `>=` -> `>` | 1: the new "excludes a placement whose top edge exactly abuts the bbox's bottom edge" test | yes |
| 11 (reviewer survivor) | GBC CLI default scale 8 -> 4 | 1: the updated spawned e2e test (now omits `--scale`) | yes |
| 12 (reviewer survivor) | GBC `rowTarget`/`gap` 256/8 -> 50/1 | 1: the new packed-extent pin test | yes |
| 20 (from round 1, GBA default 4->8) | untestable here (no GBA decomp) | -- accepted, per the coordinator's instruction | n/a |

`npm run typecheck` stayed clean throughout (checked after each mutation and after each revert).

### Test counts / gates (fix round)

- `npx vitest run packages/core/test/gbc`: **17 files / 548 tests, all green, 0 skipped** (Task 12's `atlas.test.ts` included; up from the pre-fix-round 15 files/481 tests plus Task 12's own additions merged in by the rebase).
- `npx vitest run packages/cli/test/gbcCommands.test.ts`: **27 tests, all green, 0 skipped** (up from 16: +1 note-line test, +1 default-scale-8 spawned e2e rewrite (same test, no net count change), +2 Buffer-comparison fixes (no count change), plus Task 12's own atlas CLI tests merged in by the rebase).
- `npm run typecheck`: clean.
- Full `npm test`: **999 passed, 136 skipped, 17 failed test files / 1 failed test** -- the identical pre-existing baseline shape (17 GBA-family files + `write/corpus.test.ts`'s reference-engine count, both from the missing GBA decomp), with the passed count up from 947 to 999 reflecting this round's new tests plus Task 12's merged-in work. **No new failures.**
- Subject porcelain (`/home/user/pokecrystal-PerfPlus`): confirmed empty (`git status --porcelain` prints nothing) after every mutation-check run.

### Concerns / deviations (fix round)

- No new deviations from the spec. The one item explicitly accepted as out of reach in this environment is the GBA CLI default (4, unconditional) -- there is no GBA decomp checked out here, so no test (existing or new) can exercise it, exactly as the original report already noted and the coordinator's fix-round instructions explicitly accepted.
- The one-way-cross-component-edge case (m4) remains a documented, unfixed edge case inherited from GBA, moot on both the GBA and GBC corpora as they exist today (0 one-way edges in each) -- flagged, not fixed, per the coordinator's own framing of it as a documentation gap rather than a defect to close in this task.
