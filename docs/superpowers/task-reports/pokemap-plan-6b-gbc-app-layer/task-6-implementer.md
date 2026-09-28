# Plan 6b Task 6: implementer report

Executed against `task-6-spec.md` (incl. "Notes from the Task 5 quality review", "Facts (measured)", coordinator amendments), branch `plan-6b-gbc-app-layer`, no worktree.

## Summary

GBC gets its own encounter gutter, coverage lenses (level-curve/empty-maps/method) and species spotlight inside `GbcWorldCanvas`, reusing `LensPanel`/`SpeciesSpotlight` via new additive props/generics rather than forking them. Encounter data is cached per map, once ever (time-independent); time filtering is client-side at render.

## Commits

| SHA | Summary |
|---|---|
| `c3be221` | `SpeciesSpotlight`: prefix-agnostic matcher, generic `onHits<H>` |
| `96eefad` | `LensPanel`: optional `methodKey`/`legendCopy` props, `--encounter-headbutt` token |
| `9d6eec5` | `WorldCanvas`: export `levelColorMap` (pure ramp, additive) |
| `a9842f0` | `isGbcEncountersPayload`/`isGbcCoveragePayload` guards, `useGbcCoverage` |
| `656e12c` | `GbcEncounterGutter` (new, GBC-only) |
| `07d97ea` | `GbcWorldCanvas` integration: encounter cache, gutter, lens/spotlight |
| `2d9ac36` | test: GBA default-methodKey regression (found while running mutation #5) |

## Files changed

- `packages/ui/src/components/SpeciesSpotlight.tsx` — generic `<H extends {mapName?:string}> = SpeciesHit`; matcher strips `SPECIES_` from both sides.
- `packages/ui/src/components/LensPanel.tsx` — optional `methodKey`/`legendCopy` props, both defaulting to today's GBA values.
- `packages/ui/src/components/WorldCanvas.tsx` — `levelColorByMap` memo now calls a new exported `levelColorMap(entries, low, high)` pure function (same algorithm, no behaviour change).
- `packages/ui/src/styles.css`, `packages/ui/DESIGN.md` — `--encounter-headbutt` token + `.lens-panel__legend-swatch--headbutt`/`.encounter-gutter__legend-swatch--headbutt`/`.encounter-gutter__method-tag--headbutt`; new `.encounter-gutter__chip` (text chip) and `.encounter-gutter__rate` leaf classes for `GbcEncounterGutter`.
- `packages/ui/src/gbc/GbcEncounterGutter.tsx` (new) — exports `matchesTime`, `rowLabel`, `chipText`, plus the component.
- `packages/ui/src/gbc/guards.ts` — `isGbcEncountersPayload`, `isGbcCoveragePayload`.
- `packages/ui/src/gbc/hooks/useGbcCoverage.ts` (new).
- `packages/ui/src/gbc/GbcWorldCanvas.tsx` — encounter cache/fetch effect, `gutterEntries`/`lensOverlayEntries`/`spotlightOverlayEntries` memos, exported `methodTint`, toolbar wiring, overlay JSX.
- Tests: `SpeciesSpotlight.test.tsx` (+2), `LensPanel.test.tsx` (+3), `guards.test.ts` (+12, fixed from the original's inconsistent "+13" -- see Fix round 1, F12), `useGbcCoverage.test.ts` (new, 4), `GbcEncounterGutter.test.tsx` (new, 19), `GbcWorldCanvas.test.tsx` (+19: 11 pure `methodTint`, 8 integration).

## Design decisions / deviations

1. **`SpeciesSpotlight` genericised over `<H>`** rather than a bare structural `onHits` type — lets `GbcWorldCanvas` pass `<SpeciesSpotlight<GbcSpeciesHit> onHits={...} />` with zero casts, and the default type param (`= SpeciesHit`) keeps every existing GBA call site (no type argument) byte-identical. Spec offered both options; picked the more type-safe one.
2. **`levelColorMap` exported from `WorldCanvas.tsx`** (spec: "reuse the helper if it's exported, or export it additively") — the original computation was an inline `useMemo`, not a standalone function, so it didn't exist to "reuse"; factored it out additively, preserving the exact algorithm/output. Existing GBA tests pass unchanged (no test reads the internals directly).
3. **`GbcEncounterGutter` reuses the `encounter-gutter__*` CSS prefix** for structural pieces (control/toggle/legend/badge/strip/row/method-tag) and adds two new leaf classes (`__chip`, `__rate`) rather than reusing `__icon` (fixed 20×20 image button — doesn't fit GBC's text chips, since GBC has no per-species icon art). `EncounterGutter.tsx` itself is untouched.
4. **Grass rows in the gutter use the `land` slug/token** (reusing `--encounter-land`) — same real-world concept as GBA's "walking in tall grass"; not part of the coordinator's 4-slug GBC *lens* key (grass is never a lens tint), but the gutter shows grass rows, a different surface.
5. **`--encounter-headbutt`: violet `#a855f7`**, checked against every hue in `DESIGN.md`'s palette (documented inline); sits in the gap between the blue/indigo and purple/pink clusters, and never co-occurs on screen with either of the closest existing tokens (connection lines are GBA-only dungeon mode; event-coord is Map view, not World view).
6. **`onListEmptyMaps` left unwired for GBC** — spec's LensPanel mount list doesn't request it; `LensPanel` already renders the button as a no-op when the prop is unset, so this is inert, not broken.
7. **Row-tag ordering in `rowLabel`**: method, then rod, then list, then time, then swarm — derived by matching all 6 of the spec's exact-string examples; not stated explicitly as an order in the spec.
8. **`chipText`'s percent is rounded (no decimal)**, matching the spec's literal `"Name 30% Lv 3-5"` example; the hover/focus tooltip uses full one-decimal precision (`EncounterGutter.tsx`'s own `describeChance` convention), per spec's "the full `describeChance` equivalent" instruction for the tooltip specifically.

## Tests added (59 total, matching `npm test`'s net +59: SpeciesSpotlight +2, LensPanel +3, guards.test.ts +12, useGbcCoverage.test.ts +4 new, GbcEncounterGutter.test.tsx +19 new, GbcWorldCanvas.test.tsx +19)

- `matchesTime`: full truth table incl. old-rod-always-matches, fish-day-matches-morn-and-day, grass-exact-only.
- `rowLabel`/`chipText`: exact spec strings, `+` buff marker on/off.
- `GbcEncounterGutter` component: toggle-off-by-default, legend-on-toggle, time-filtered row set + label pins, time-switch changes rows, chip cap/overflow, LOD collapse badge, loading/empty states, tooltip full precision.
- `methodTint` (pure): every precedence combination incl. the water/fish-swap mutation target.
- `GbcWorldCanvas` integration: encounters fetched once per visible map and NOT refetched on time change; gutter renders real fetched chips; method/level-curve/empty-maps lens tinting; GBC method key excludes grass; coverage-fetch-failure banner; spotlight dim/hit + badge text.
- `SpeciesSpotlight`: GBA `"pika"`→`SPECIES_PIKACHU` pin; GBC bare-list `"chiko"`→`CHIKORITA`.
- `LensPanel`: GBC `methodKey`/`legendCopy` rendering; GBA default-methodKey pin (added while running mutation #5 — no prior test covered it).
- `isGbcEncountersPayload`/`isGbcCoveragePayload`: every clause, incl. the GBA-shaped-payload rejection (mutation #8).

## Mutation table

| # | Mutation | File | Verdict | Killed by |
|---|---|---|---|---|
| 1 | `matchesTime` treats morn as never matching fish | `GbcEncounterGutter.tsx` | KILLED | "fish tagged 'day' matches at BOTH morn and day" |
| 2 | Old-rod untagged fish filtered out | `GbcEncounterGutter.tsx` | KILLED | "an untagged (old-rod) fish source always matches" |
| 3 | Method precedence swaps fish and water | `GbcWorldCanvas.tsx` (`methodTint`) | KILLED | "water beats fish/headbutt/rock (mutation check #3)" |
| 4 | Matcher reverted to prefix-only | `SpeciesSpotlight.tsx` | KILLED | "matches a bare (unprefixed) GBC-style species list" |
| 5 | `LensPanel` default `methodKey` changed | `LensPanel.tsx` | KILLED (after adding the missing GBA test) | new "default key... lists Water, Fishing and Rock Smash" |
| 6 | Gutter shows grass for every time | `GbcEncounterGutter.tsx` | KILLED | 3 tests (exact row-label pins + time-switch test) |
| 7 | Drop the `+` buff marker | `GbcEncounterGutter.tsx` (`chipText`) | KILLED | "appends a trailing + ... (mutation check #7)" |
| 8 | Encounters guard accepts a GBA-shaped `{ methods }` payload | `guards.ts` | KILLED | "rejects a GBA-shaped { mapName, mapId, methods } payload" + family-check test |

8/8 killed, 0 survivors. Each applied to the real source, confirmed red on a targeted `vitest run`, restored via `git checkout -- <path>`; `git status --short` clean after every restore (re-verified at the end of the whole sequence).

## Gate

- `npm test`: **1659 passed, 0 failed** (Windows baseline at `123d89f`: 1600/0; net +59). Re-run in full a second time after the mutation pass — identical result, tree clean throughout.
- `npm run typecheck`: clean (both `tsconfig.base.json` and `packages/ui/tsconfig.json`).
- No flaky/rerun needed — both full runs were single-pass green.

## Concerns

- None outstanding. `onListEmptyMaps` is inert for GBC (see deviation 6) — flagging in case the coordinator wants it wired for parity; not requested by the spec.
- The violet `--encounter-headbutt` hue choice (deviation 5) is a judgment call, not a measured fact — worth a look in live-verify alongside the other 3 GBC method swatches for perceptual distinctness at swatch size.

**Live-verify: deferred to coordinator per amendment** ("Live-verify is the coordinator's, with the in-app browser, after the fix round"). Not run by this implementer.

---

## Fix round 1

Addresses `task-6-spec-review.md` (Opus, ISSUES: 1 blocking/3 important/8 minor, 11 surviving mutations) and `task-6-quality-review.md` (Sonnet, APPROVED_WITH_MINORS, Q1-Q3), per the coordinator's explicit decisions (do all of F1-F12, Q1, Q3; Q2 no code change).

### Findings → fixes

| Finding | Fix | Commit | New/changed tests |
|---|---|---|---|
| **F1 (blocking)**: `rowKey` omitted `conditional` — a swarm/non-swarm source sharing every other tag (real on `DarkCaveVioletEntrance`/`Route32`/`Route35`) got duplicate React keys; on a time switch a stale row from the previous time kept rendering | Added `conditional` to `rowKey` | `18bda98` | `GbcEncounterGutter.test.tsx`: day→nite switch shows no stale row + zero `console.error` duplicate-key warnings |
| **F9**: overflow text was `+N`, spec says `+N more` | Fixed | `18bda98` | re-pinned "+2 more"; new exactly-6-no-overflow test |
| **Q3**: `chipText`/`chipTooltip` duplicated the buff ternary | One shared `isBuffedMethod(method)` | `18bda98` | existing chipText tests unchanged |
| **F2 a-d**: gutter tests only did per-label presence (order/extras unpinned, R1 survived); no fish-`day`-at-morn coverage; LOD threshold (R2/R3) and exactly-6-overflow (R5) boundaries unpinned | One rich fixture (grass morn/day/nite, water, fish old/good·day/good·nite, headbutt common/rare, rock); exact `toEqual` ordered label lists at morn/day/nite; zoom-7-collapses/zoom-8-expands boundary test | `ec1b2ea` | `GbcEncounterGutter.test.tsx` +6 |
| **F3**: "does NOT refetch on time change" only counted fetch calls — R11 (clear cache on time change) survived, since neither `gutterEntries` nor `lensOverlayEntries` recompute on `time` alone | Added a post-switch wheel zoom (forces a real recompute) + tint-count assertion | `eeb8a15` | same test, strengthened; spot-verified red under R11 before the F4 fix, green after |
| **F4 (important)**: hand-rolled fetch→ok→guard→catch in the encounter effect, not the shared guarded-fetch helper; guard failures invisible; R13 (guard bypass) survived | Extracted `fetchGuarded<T>` out of `useGuardedFetch` (hook now wraps it, behaviour/tests unchanged); encounter effect uses it; failed maps counted, visible `world-canvas__toolbar-error` note ("Encounter data unavailable for N maps") | `eeb8a15`, `9e573dd` | `useGuardedFetch.test.ts` +4 (`fetchGuarded` direct); `GbcWorldCanvas.test.tsx`: GBA-shaped-payload integration test (note shown, not retried in a loop) |
| **F5 (minor)**: `levelColorMap`'s direction/values unpinned — R7 and R18 both survived | Unit-tested with exact `rgb()` endpoints (low map → low endpoint, high map → high endpoint, midpoint, n≤1, empty) | `2bd5be1` | `WorldCanvas.test.tsx` +3 |
| **F6 (minor)**: `isGbcCoveragePayload`'s `isRecord(e)` clause untested — R9 survived | Added `levelByMap: [null]` / `["x"]` cases | `5978213` | `guards.test.ts` +1 |
| **F7 (minor)**: matcher comment overclaimed a fully GBA-identical result set; `"SPECIES_"`-alone edge (R14) untested | Comment corrected to name the one accepted exception (typing bare `"SPECIES_"` now shows no dropdown, was "list all 50"); added `"species_pika"` GBA test | `fc9ad86` | `SpeciesSpotlight.test.tsx` +1 |
| **F8 (minor)**: spotlight best-hit-per-map rule untested — R6 survived | 2-hits-same-map fixture (10%, 45%) asserts badge starts `45%` | `29371e7` | `GbcWorldCanvas.test.tsx` +1 |
| **F10 (minor) + Q1**: no single screen-rect memo; `gutterEntries` looked up the cache twice | One `rectByMap` memo (`[visible, pan, zoom]`) feeding gutter/lens/spotlight entries; single cache lookup | `9e573dd` | covered by existing integration tests (no behaviour change) |
| **F11 (minor)**: GBC's empty-maps lens showed a dead "List them" button | **Correction (coordinator):** the first attempt (`e1d39d7`, hide the button when `onListEmptyMaps` is unset) edited a pre-existing GBA `LensPanel` test — against the absolute "existing GBA tests pass unchanged" rule — and was reverted (`0be8111`; `LensPanel.tsx`/`LensPanel.test.tsx` verified byte-identical to `8190970`/`bef0f5f`). Replaced with a real `focusEmptyMaps` in `GbcWorldCanvas`, mirroring `WorldCanvas.tsx`'s own: fits empty maps in a multi-map component, falls back to every empty map, no-op if none. Wired as `onListEmptyMaps`; no `LensPanel`/GBA file touched at all this time | `0be8111` (revert), `f5dd849` | `GbcWorldCanvas.test.tsx` +1: exact zoom (63% vs the initial fit's 31%) and exact rendered lens-tint transform (`left/top/width/height`) pinned for a hand-computed fixture; spot-verified red when `onListEmptyMaps` is dropped |
| **F12 (minor)**: report's own guards.test.ts count said +13 in one place, +12 in another | Corrected to +12 (6 encounters + 6 coverage clauses) | `d1d0fb0` | — |
| **Q2**: `--encounter-headbutt` hue closeness — informational | No code change (coordinator checks live) | — | — |

One incidental fix during the mutation re-run: the "level-curve lens" integration test only asserted 2 tints differ (survives R7, a low/high swap, since two swapped colours are still distinct) — stubbed `getComputedStyle` to fix known endpoints and assert the low map gets the low endpoint, the high map the high one (`b55b69f`).

**Recovery note**: this round hit a rate-limit interruption after F1-F4 landed; on resume, `git status --short`/`git diff` confirmed only a harmless uncommitted import-line addition (no stray mutation), and work continued from there — no rework needed. Earlier in the round, one `git checkout --` restore (after a spot-check of R13) was run before the corresponding F4 edit had been committed, silently discarding it; caught immediately by grepping the file for the expected symbols post-restore, and redone from the same design before continuing — no mutation was left mis-applied and no test result in this report depends on the lost interval.

### Mutation re-run (all 26, on final commit `b55b69f`)

Every mutation applied to the real (then-current) source, confirmed red on the file the spec review names, restored via `git checkout -- <path>`, `git status --short` confirmed clean after each — cross-checked that all 26 requested IDs actually ran (none silently skipped).

| ID | Mutation | Result | Killed by |
|---|---|---|---|
| I1 | fish `day` matches day only (morn never) | KILLED | `matchesTime` "fish tagged 'day' matches at BOTH morn and day" |
| I2 | untagged fish filtered out | KILLED | "untagged (old-rod) fish source always matches" |
| I3 | `methodTint` swaps water/fish | KILLED | "water beats fish/headbutt/rock" |
| I4 | matcher prefix-only | KILLED | "matches a bare (unprefixed) GBC-style species list" |
| I5 | `LensPanel` default key `.slice(0,2)` | KILLED | new "default key... Water, Fishing and Rock Smash" |
| I6 | grass matches every time | KILLED | `matchesTime` grass test + exact-label-list tests |
| I7 | `chipText` drops `+` | KILLED | "appends a trailing +... only" |
| I8 | encounters guard accepts `{methods}` without `family` | KILLED | "rejects a GBA-shaped... payload" |
| R1 | gutter group sort reversed | **KILLED** (was SURVIVED) | new exact ordered-label-list tests (F2) |
| R2 | `LOW_ZOOM_THRESHOLD` 8→5 | **KILLED** (was SURVIVED) | new zoom-7/zoom-8 boundary test (F2) |
| R3 | collapse `<`→`<=` | **KILLED** (was SURVIVED) | same boundary test (F2) |
| R4 | `+` for grass only (water dropped) | KILLED | `chipText` "+ ... grass and water only" |
| R5 | overflow `>`→`>=` | **KILLED** (was SURVIVED) | new exactly-6-no-overflow test (F2) |
| R6 | spotlight keeps lowest-% hit | **KILLED** (was SURVIVED) | new 2-hits-same-map test (F8) |
| R7 | GBC level ramp low/high swapped | **KILLED** (was SURVIVED) | new exact-endpoint integration test |
| R8 | coverage error slot disabled | KILLED | "coverage fetch failure shows a visible error" |
| R9 | coverage guard drops `isRecord(e)` | **KILLED** (was SURVIVED) | new `[null]`/`["x"]` test (F6) |
| R10 | coverage guard drops `unusedSpecies` string check | KILLED | "rejects a non-string-array unusedSpecies" |
| R11 | encounter cache cleared on `time` change | **KILLED** (was SURVIVED) | strengthened F3 test (post-switch wheel zoom + tint assertion) |
| R12 | `methodTint` tints grass | KILLED | "grass alone is never tinted" + "grass alongside a real method..." |
| R13 | canvas bypasses `isGbcEncountersPayload` | **KILLED** (was SURVIVED) | new GBA-shaped-payload integration test (F4) |
| R14 | matcher no longer strips `SPECIES_` from query | **KILLED** (was SURVIVED) | new "species_pika" test (F7) |
| R15 | spotlight-dim class renamed | KILLED | "species spotlight dims non-matching maps" |
| R16 | empty-maps tint `--warn`→`--danger` | KILLED | "empty-maps lens tints... with --warn" |
| R17 | `CHIP_CAP` 6→7 | KILLED | "+2 more" overflow pin (F9) |
| R18 | `levelColorMap` divisor `n-1`→`n` | **KILLED** (was SURVIVED) | new exact-`rgb()` unit tests (F5) |

**26/26 killed, 0 survivors** (11 previously-surviving R-mutations now killed; the other 7 R-mutations and all 8 I-mutations re-confirmed killed).

### Gate (commit `b55b69f`, before the F11 correction below)

- `npm test`: **1678 passed, 0 failed**, 106 files. Single pass, no flake.
- `npm run typecheck`: clean (`tsconfig.base.json` and `packages/ui/tsconfig.json`).
- `git status --short`: clean.

### F11 correction (post-round follow-up)

The coordinator caught that `e1d39d7`'s F11 fix edited a pre-existing GBA `LensPanel` test — violating the absolute "existing GBA tests pass unchanged" rule (the general fix-round rule, distinct from the spec's own narrower "GBA components change only additively as the spec lists"). Corrected:

1. **Revert.** `git revert --no-edit e1d39d7` → `0be8111`. Verified `git diff bef0f5f -- packages/ui/test/LensPanel.test.tsx` and `git diff 8190970 -- packages/ui/src/components/LensPanel.tsx` both empty — `LensPanel.tsx`/`LensPanel.test.tsx` are byte-identical to their pre-F11 content; `LensPanel.test.tsx` back to 9 tests.
2. **Real fix.** `GbcWorldCanvas` gains `focusEmptyMaps` (`f5dd849`), mirroring `WorldCanvas.tsx`'s own of the same name: fits the empty maps (`coverage.mapsWithoutEncounters`) that sit in a multi-map component (reusing the existing `fitAllBounds` pure helper, no new geometry), falling back to every empty map when none resolve to a real component, no-op when there are no empty maps at all. One `setView({ ...computeFit(...), fitted: true })` call, no nested updater — the same shape `fitAll`/the initial-fit effect already use. Wired as `LensPanel`'s `onListEmptyMaps`. No `LensPanel`/GBA file touched.
3. **Test.** `GbcWorldCanvas.test.tsx` +1: using `WORLD`'s own fixture (MapA+MapB share one 2-map component), with only MapA marked empty, clicking "List them" is asserted against an exactly hand-computed result — zoom 20 (status strip "zoom 63%", vs the initial fit's zoom 10 = "zoom 31%") and pan `{0,0}`, pinned a second way via the rendered `.world-canvas__lens-tint` transform (`left/top/width/height`). Mutation: dropped `onListEmptyMaps={focusEmptyMaps}` at the JSX call site → the new test went red (`expected... "zoom 63%"` never appeared); restored, re-confirmed green.

### Gate (final commit, after the F11 correction)

- `npm test`: **1677 passed, 0 failed**, 106 files (baseline at `123d89f`: 1600/0; net +77 for the whole task including both fix-round passes — LensPanel net back to its pre-fix-round +3, GbcWorldCanvas net +1 higher than the `b55b69f` gate above). Single pass, no flake.
- `npm run typecheck`: clean (`tsconfig.base.json` and `packages/ui/tsconfig.json`).
- `git status --short`: clean.

**Live-verify: still the coordinator's**, unchanged from the original report's note.
