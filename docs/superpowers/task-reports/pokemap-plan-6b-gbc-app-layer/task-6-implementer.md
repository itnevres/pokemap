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
