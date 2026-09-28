# Plan 6b Task 6: spec-compliance review (adversarial)

Range `135414e..8190970`, branch `plan-6b-gbc-app-layer`. Reviewer: Opus, read-only except transient mutations (all restored; `git status --short` clean at end).

## Verdict: ISSUES — 1 blocking, 3 important, 8 minor

## Findings

**F1 (blocking): `rowKey` omits `conditional`, so swarm and non-swarm rows get duplicate React keys. On real data the time filter renders stale rows.**
- Where: `packages/ui/src/gbc/GbcEncounterGutter.tsx:179-181` (`rowKey`). The chip/tooltip key at :318 derives from it.
- Evidence (live `--gbc` server; all 125 encounter maps scanned):
  - 3 maps produce duplicate row keys at every time: `Route32` (fish old/good/super plus their swarm twins), `Route35` (grass plus grass-swarm) and **`DarkCaveVioletEntrance`** (grass plus grass-swarm), which is criterion 3's spotlight target.
  - Scratch jsdom test with the real DarkCaveVioletEntrance payload, toggling on, then rerendering `time` from day to nite:
    - labels rendered: `["Grass · day","Grass · nite","Grass · nite · swarm","Surf",…]`, i.e. 8 rows, with a **stale `Grass · day` row showing at Nite**;
    - 2 × "Encountered two children with the same key".
- The fix was verified by a transient patch, now restored: adding `source.conditional ?? ""` to `rowKey` gives 7 correct rows and 0 warnings.
- This breaks criterion 3 ("gutter lists a map's grass slots for the selected time of day") on real maps. No test has a swarm row next to a non-swarm row with the same tags.
- Fix:
  - add `conditional` to `rowKey`;
  - add a gutter test with sources `grass·day`, `grass·day·swarm`, `grass·nite`, `grass·nite·swarm`: switch day to nite and assert the exact label list with no `Grass · day`, and spy `console.error` for zero duplicate-key warnings.

**F2 (important): gutter tests don't meet the spec's or the plan's test lines.**
- Where: `packages/ui/test/gbc/GbcEncounterGutter.test.tsx`, fixture `ROUTE29_SOURCES`.
- a. The spec says "Pin the exact label list". The tests only do per-label `getByText`/`queryByText`, so order and extra rows are unpinned. **R1** (reversing the method-group sort) SURVIVED.
- b. The plan's Task 6 tests line requires "the chip rows for a fixture source set … with a morning fish row shown via its `day` tag". The component fixture has **no fish source**, so the only coverage is the pure `matchesTime` test. (Live: 67/125 maps show a fish `day` row at Morn.)
- c. The LOD threshold of 8 px/block is unpinned at the boundary: tests use zoom 4 and 32. **R2** (`LOW_ZOOM_THRESHOLD=5`) and **R3** (`<` changed to `<=`) both SURVIVED.
- d. Overflow at exactly 6 chips is unpinned: **R5** (`>` changed to `>=`, which renders "+0") SURVIVED.
- Fix: one fixture with grass morn/day/nite, water, fish old (untagged), good·day, good·nite, headbutt common/rare and rock. Then:
  - assert `[...querySelectorAll(".encounter-gutter__method-tag")].map(e => e.textContent)` with `toEqual` at morn, day and nite (the morn list includes `Fish · Good Rod · day`);
  - zoom 7 collapses and zoom 8 expands;
  - a row with exactly 6 chances has no `.encounter-gutter__more`.

**F3 (important): nothing pins that the encounter cache *survives* a time switch, which is the binding Task 5 review note.**
- Where: `packages/ui/test/gbc/GbcWorldCanvas.test.tsx`, "fetches /api/encounters/:map once … does NOT refetch when time changes".
- Evidence: **R11** (adding `encounterCacheRef.current.clear()` to the image cache's `[time]` effect) SURVIVED.
  - The fetch effect is keyed on `[visible]` only, so the cleared cache is never refetched either.
  - The gutter and method tint would go blank after every time switch until a pan. The test only counts fetches.
- The code itself is correct: there is no clear-on-time, and the placeholder is written synchronously.
- Fix: after `rerender(time="nite")`, also assert that retained data still renders (a method-lens tint count of 2, or a gutter chip still present).

**F4 (important): the encounter fetch is a hand-rolled fetch→ok→guard→**silent** catch, not the shared guarded-fetch helper. Its failures are invisible, and it isn't listed as a deviation.**
- Where: `packages/ui/src/gbc/GbcWorldCanvas.tsx`, the encounter fetch effect (grep `GET /api/encounters/${p.map} returned an unexpected shape`).
- The spec's convention is binding: "Every fetch goes through Task 3's shared guarded-fetch helper … Don't hand-roll another fetch, then guard, then error block."
- As built, a 500 or a guard rejection (the GBA-shaped payload that mutation #8 exists for) leaves the map with no rows and no tint. That looks the same as "no encounters", and nothing appears on screen.
- The guard's wiring is also untested: **R13** (bypassing `isGbcEncountersPayload` in the canvas) SURVIVED. Only the pure guard is tested.
- Mitigation: `useGuardedFetch` is a hook, so it can't run per map in a loop, and the GBA `encounterCacheRef` effect that the spec points to has the same silent posture. It is still an undisclosed departure from an explicit convention.
- Fix:
  - factor a non-hook `fetchGuarded<T>(url, guard, label): Promise<T>` out of `src/hooks/useGuardedFetch.ts` (the hook calls it) and use it here;
  - count failed maps into state and show a `world-canvas__toolbar-error`-style note ("Encounter data unavailable for N maps");
  - add an integration test that serves a GBA-shaped `{mapName,mapId,methods}` and asserts the note.

**F5 (minor): the level-curve ramp's direction and values are unpinned.**
- Where: `GbcWorldCanvas.tsx` `levelColorByMap`, and `WorldCanvas.tsx` `export function levelColorMap`.
- **R7** (swapping low and high in the GBC call, so red is low) SURVIVED. The legend copy says "Blue is low, red is high", and the only test asserts that the 2 tints differ.
- **R18** (divisor `n-1` changed to `n` inside the newly exported `levelColorMap`) SURVIVED the GBA and GBC suites. The exported pure function has no unit test.
- The move itself is verified byte-identical: the same binary-search percentile and lerp, and the same fallbacks `#3b82f6`/`#ef4444`. The only change is that `getComputedStyle` is now read even when `entries` is empty, which has no observable effect.
- Fix: unit-test `levelColorMap` with 3 entries and endpoints `#0000ff`/`#ff0000`, pinning the exact `rgb()` strings, and assert that the GBC low map gets the low endpoint.

**F6 (minor): the `isGbcCoveragePayload` clause `if (!isRecord(e)) return false` is untested.**
- Where: `packages/ui/src/gbc/guards.ts`, `isGbcCoveragePayload` loop.
- Spec: "Guards: every clause". **R9** (removing it) SURVIVED; `levelByMap: [null]` would then throw a TypeError instead of returning false.
- Fix: add `levelByMap: [null]` and `["x"]` cases.

**F7 (minor): the `SpeciesSpotlight` matcher is not strictly result-identical for GBA, and the query-side strip is untested.**
- Where: `packages/ui/src/components/SpeciesSpotlight.tsx`, `const matches = useMemo`.
- Old code: the query `"species_"` became `withPrefix="SPECIES_"`, which matched every species, so the first 50 were listed.
- New code: `q` strips to `""`, so there is no dropdown. The spec's (and the code comment's) claim of an "identical result set" fails for this one input. The UX impact is negligible.
- **R14** (dropping `.replace(/^SPECIES_/,"")` from `q`) SURVIVED, so typing `SPECIES_PIKA` is unpinned.
- Fix: add a GBA test that `"species_pika"` shows Pikachu. Either accept and document the `"SPECIES_"`-alone edge, or keep old behaviour by returning the first 50 when the stripped query is empty and the raw query is non-empty.

**F8 (minor): the spotlight's best-hit-per-map choice is untested.**
- Where: `GbcWorldCanvas.tsx` `spotlightByMap`.
- **R6** (picking the lowest-percent hit) SURVIVED. The test has 1 hit on 1 map. Live `/api/where/dunsparce` returns several hits (one per time/variant) for DarkCaveVioletEntrance, so the badge value depends on this rule.
- Fix: a test with 2 hits on the same map at 10 and 45 percent, asserting the badge starts with `45%`.

**F9 (minor): the overflow text is `+N`, not the spec's `+N more`.**
- Where: `GbcEncounterGutter.tsx:334-336`.
- It mirrors GBA `EncounterGutter`'s `+N`. The test is titled "'+N more' overflow" but asserts `"+2"`. It isn't listed as a deviation.
- Fix: render `+N more`, or record the deviation (coordinator's call).

**F10 (minor): there is no single screen-rect memo.**
- The binding Task 5 note says "Build a memo of screen-space rects … Feed the gutter and lens overlays from it."
- As built, `gutterEntries`, `lensOverlayEntries` and `spotlightOverlayEntries` each recompute `{x:p.x*zoom+pan.x,…}`. With the draw effect, that is 4 copies of the formula.
- This mirrors WorldCanvas's own structure and is functionally equivalent. It is still not the one shared memo the note describes.
- Fix: one `rectByMap = useMemo(…, [visible, pan, zoom])` consumed by all 3.

**F11 (minor): the GBC empty-maps lens shows a dead "List them" button.**
- `LensPanel` always renders it for `active==="empty-maps"`, and GBC leaves `onListEmptyMaps` unset.
- It is disclosed as the implementer's deviation 6. It is outside the spec's mount list, but it is a visible control that does nothing.
- Fix: wire it to GBC (the coordinator's call), or hide it when the prop is unset. That change is additive for GBA, since GBA always passes the prop.

**F12 (minor): the implementer report is internally inconsistent.** "Files changed" says `guards.test.ts (+13)`, while "Tests added" says `+12`. The actual count is 12 (6 encounters + 6 coverage). The totals (59) are correct.

## Verified compliant (independent evidence)

**GBA changes are additive only.**
- `EncounterGutter.tsx` is untouched.
- `styles.css` and `DESIGN.md` have 0 removed lines.
- GBA test files (`LensPanel`, `SpeciesSpotlight`) have additions only. The only removed test line anywhere is the `gbc/guards.test.ts` import, reformatted.
- `LensPanel` defaults (`methodKey ?? METHOD_LENS_KEY`, and `legendCopy?.[lens] ?? LEGEND_COPY[lens]`) render identically.
- The `SpeciesSpotlight` generic defaults `= SpeciesHit`.
- The GBA test `"pika"` → `SPECIES_PIKACHU` is present.
- The `WorldCanvas` `levelColorMap` extraction is behaviour-identical (see F5).

**Time rule.** Re-derived from `engine/events/fish.asm` `.TimeEncounter` (`ld a,[wTimeOfDay] / maskbits NUM_DAYTIMES / cp NITE_F / jr c,.time_species`) and `wram_constants.asm` (`MORN_F=0, DAY_F=1, NITE_F=2, DARKNESS_F=3`). Morn and day take the day entry.
- `matchesTime` gets: untagged → true (including old rod); grass → exact match; fish `day` → morn|day; fish `nite` → nite. All correct.
- Live: 0 unexpected time tags across 125 maps.

**Encounter cache.**
- Keyed `[visible]` only; no clear-on-`time`.
- The placeholder is written synchronously, so there is one fetch per map ever, and StrictMode's double effect doesn't refetch.
- It is validated with `isGbcEncountersPayload`.

**State.**
- `GbcWorldCanvas` still has a single `view` state. The new state is only `encounterVersion`, `lens` and `spotlightHits`.
- No setter is called inside an updater: `setEncounterVersion` runs in promise callbacks.

**Mounting.** `SpeciesSpotlight` and `LensPanel` are in `world-canvas__toolbar-group world-canvas__toolbar-group--grow`. The coverage error slot mirrors GBA's `Coverage lenses unavailable:`.

**Tint and tokens.**
- Tint precedence is water > fish > headbutt > rock, and grass returns null.
- Token mapping follows the amendment: `--encounter-water/-fishing/-headbutt/-rock-smash`.
- The method key slugs are `water/fishing/headbutt/rock-smash`, with labels `Water (surfing)/Fish/Headbutt/Rock Smash`.
- There is no `--fish` swatch. The `--encounter-headbutt` token and swatch are added, and `DESIGN.md` documents it with the no-light-override reasoning and the hue check.

**Other checks.**
- The `legendCopy` strings match the spec exactly.
- Empty-maps uses `--warn`, and the spotlight dim uses `.world-canvas__spotlight-dim` (`--overlay-spotlight-dim`).
- `useGbcCoverage` goes through `useGuardedFetch` plus `isGbcCoveragePayload`.
- `rowLabel` matches all 6 spec strings plus ` · swarm`.
- `chipText` matches `Name 30% Lv 3-5`, with `+` for grass and water only.
- The tooltip shows one-decimal `describeChance` output from a top-level sibling.

**Live `--gbc` server.** Started, PID 18280, killed; port 5174 afterwards shows TIME_WAIT only, no LISTEN.
- `/api/encounters/{Route30,Route32,Route35,DarkCaveVioletEntrance}` and all 125 `levelByMap` maps pass `isGbcEncountersPayload`.
- Route30 matches the amendment facts:
  - old rod untagged;
  - good/super rod split day/nite;
  - grass morn (Caterpie/Ledyba/Pidgey…) differs from day;
  - Surf, plus Headbutt common and rare.
- `/api/coverage` passes `isGbcCoveragePayload`: withEnc 125, without 266, unused 70, levelByMap 125.
- `/api/where/{dunsparce,DUNSPARCE,SPECIES_DUNSPARCE}` all return 200, as a bare array of `GbcSpeciesHit`, with the single map `DarkCaveVioletEntrance`. The server normalises the prefix; the component sends the bare typed text.
- `/api/species` returns 251 bare names; the new matcher finds `DUNSPARCE`.
- 26 sources have more than 6 chances, so the overflow path is live.
- Fractional percents exist, e.g. fish 69.921875, and the chip rounds it to `70%`.

## Mutation table

The harness is `scratchpad/mut.cjs`. For each mutation it:
- requires exactly 1 anchor match (I7 and R4 first hit 2 anchors, because `chipTooltip` shares the line; they were re-anchored to `chipText` and re-run);
- runs 7 files (gbc Gutter/WorldCanvas/guards/useGbcCoverage, SpeciesSpotlight, LensPanel, WorldCanvas; 235 tests);
- restores with `git show HEAD:<f> > <f>` followed by `git checkout -- <f>`;
- asserts `git status --short` is empty after each. All 26 came back clean.

| ID | Mutation | Result |
|---|---|---|
| I1 | fish `day` matches day only (morn never) | KILLED: matchesTime "fish tagged 'day' matches at BOTH morn and day" |
| I2 | untagged fish filtered out | KILLED: "untagged (old-rod) fish source always matches" |
| I3 | methodTint swaps water/fish | KILLED: "water beats fish/headbutt/rock" |
| I4 | matcher prefix-only (`startsWith("SPECIES_"+q)`) | KILLED: "'chiko' shows CHIKORITA" |
| I5 | LensPanel default key `.slice(0,2)` | KILLED: "default key … Water, Fishing and Rock Smash" |
| I6 | grass matches every time | KILLED: 3 tests (matchesTime grass; gutter Morn labels; time switch) |
| I7 | chipText drops `+` | KILLED: chipText "+ … grass and water only" |
| I8 | encounters guard accepts `{methods}` without family | KILLED: "rejects a GBA-shaped … payload" |
| R1 | gutter group sort reversed | **SURVIVED** (F2a) |
| R2 | `LOW_ZOOM_THRESHOLD` 8→5 | **SURVIVED** (F2c) |
| R3 | collapse `<`→`<=` | **SURVIVED** (F2c) |
| R4 | `+` for grass only (water dropped) | KILLED: chipText "+ … grass and water only" |
| R5 | overflow `>`→`>=` CHIP_CAP | **SURVIVED** (F2d) |
| R6 | spotlight keeps lowest-% hit per map | **SURVIVED** (F8) |
| R7 | GBC level ramp low/high swapped | **SURVIVED** (F5) |
| R8 | coverage error slot disabled (`false ?`) | KILLED: "coverage fetch failure shows a visible error" |
| R9 | coverage guard drops `isRecord(e)` | **SURVIVED** (F6) |
| R10 | coverage guard drops `unusedSpecies` string check | KILLED: "rejects a non-string-array unusedSpecies" |
| R11 | encounter cache cleared on `time` change | **SURVIVED** (F3) |
| R12 | methodTint tints grass (`--encounter-land`) | KILLED: "grass alone is never tinted" |
| R13 | canvas bypasses `isGbcEncountersPayload` | **SURVIVED** (F4) |
| R14 | matcher no longer strips `SPECIES_` from query | **SURVIVED** (F7) |
| R15 | spotlight-dim class renamed | KILLED: "species spotlight dims non-matching maps" |
| R16 | empty-maps tint `--warn`→`--danger` | KILLED: "empty-maps lens tints … with --warn" |
| R17 | CHIP_CAP 6→7 | KILLED: "capped at 6, with a '+N more' overflow" |
| R18 | `levelColorMap` divisor `n-1`→`n` | **SURVIVED** (F5) |

The implementer's 8 are all KILLED, confirming their table. Of the reviewer's 18, 11 SURVIVED: R1, R2, R3, R5, R6, R7, R9, R11, R13, R14, R18. (R4, R8, R10, R12, R15, R16 and R17 were killed.)

## Gates (reviewer-run, tree at HEAD `8190970`)

- `npm test`: **1659 passed / 0 failed**, 106 files. Single pass, no flake.
- `npm run typecheck`: clean (both projects).
- `git status --short`: clean. The scratch test (`packages/ui/test/gbc/zz-review-scratch.test.tsx`) was created and removed; the scripts live in the scratchpad only.
- Port 5174 is free (no LISTEN). Live browser verification is the coordinator's job and was not run here.
