# Plan 6b Task 6: code-quality review

Reviewed at `8190970` (range `135414e..8190970`), read-only via `git show`. Scope: React correctness, CSS/DESIGN.md, duplication/reuse, naming, test quality.

## Verdict: APPROVED_WITH_MINORS

## Strengths

- `LensPanel`/`SpeciesSpotlight`/`WorldCanvas` changes are genuinely additive: optional props default to the pre-existing constants/behaviour, `levelColorMap` is a pure extraction with unchanged algorithm, `SpeciesSpotlight<H>` defaults to `SpeciesHit` so every no-type-arg GBA call site is untouched. No existing GBA test file (`EncounterGutter.test.tsx`, `WorldCanvas.test.tsx`) was touched.
- `GbcEncounterGutter` mirrors `EncounterGutter.tsx`'s structure/CSS-class-family/tooltip mechanics precisely (top-level-sibling tooltip, `useLayoutEffect` invalidation, `pointer-events` posture, LOD collapse), while correctly diverging where the domain differs (text chips vs. icons, 5 methods, client-side time filter).
- Encounter cache is correctly time-independent: fetch effect keyed only on `visible` (not `time`), `matchesTime` filtering happens at render in `GbcEncounterGutter`/`methodTint`. Verified by test "does NOT refetch when time changes".
- Guards: `isGbcEncountersPayload` checks `family === "gbc"` (rejects GBA's untagged `{mapName,mapId,methods}` shape, mutation #8 killed); `isGbcCoveragePayload` checks only the 3 fields actually read, per the file's own "guard what you index by" posture. Full clause coverage in `guards.test.ts`.
- `--encounter-headbutt: #a855f7` (271° hue) — independently recomputed: land 85°, water 189°, rock-smash 32°, fishing 239°, headbutt 271°, nearest neighbours `--connection-8` (255°, 16° gap) and `--event-coord` (285°, 14° gap). The "never co-occurs on screen" claim checks out: `--event-coord` is used only by `.map-canvas__swatch--event-coord`/`.event-inspector__kind-dot--coord` (Map view), `--connection-*` only by GBA dungeon-mode connection lines — neither renders alongside GBC's World-view gutter/lens swatches. Not overridden in light mode, consistent with every sibling `--encounter-*`/event-kind token and documented with the same reasoning in both `styles.css` and `DESIGN.md`.
- Test quality: exact string/value pins throughout (`rowLabel`, `chipText`, `methodTint`, tooltip `.textContent`), no jest-dom matchers (`.toBeTruthy()`/`.toBeNull()`/`.toBe()` only), mutation-table coverage 8/8 matches the spec's own list.
- `useGbcCoverage` is a correct, minimal `useGuardedFetch` caller (fixed URL); real, visible error surfaced via `world-canvas__toolbar-error` — same class/`role="alert"` as GBA's own.

## Issues

**Q1 (minor).** `packages/ui/src/gbc/GbcWorldCanvas.tsx`, `gutterEntries` memo (search `const gutterEntries = useMemo<GbcEncounterGutterMapEntry[]>`):
```
sources: encounterCacheRef.current.get(p.map)?.loaded ? encounterCacheRef.current.get(p.map)!.sources : undefined,
```
Calls `.get(p.map)` twice. The memo's own comment says it "mirrors WorldCanvas.tsx's own encounterEntries memo exactly" — but that sibling (search `const encounterEntries = useMemo<EncounterGutterMapEntry[]>` in `WorldCanvas.tsx`) hoists the lookup once: `const cache = encounterCacheRef.current.get(p.map); ... cache?.loaded ? (cache.methods ?? []) : undefined`. Harmless (Map.get is O(1), runs once per visible placement per pan/zoom frame), but it's a real divergence from the pattern the comment claims to mirror.
Fix: `const cache = encounterCacheRef.current.get(p.map); sources: cache?.loaded ? cache.sources : undefined,`.

**Q2 (minor, informational — already flagged by implementer).** `--encounter-headbutt`'s nearest neighbours (`--connection-8` 255°, `--event-coord` 285°) are only 14-16° away in hue, closer than any other pair in the existing palette (next-closest gap elsewhere is ~20°+). The "never co-occurs on screen" argument holds structurally today (verified above), but it's a view-based exemption rather than a hue-based one — if a future task ever surfaces `--event-coord` or a connection line in the same World-view surface as this token, the two would be hard to tell apart at swatch size. Not a fix-now item; worth eyeballing in the implementer's own flagged live-verify step (4 GBC method swatches together) as planned.

**Q3 (minor, cosmetic).** `packages/ui/src/gbc/GbcEncounterGutter.tsx`, `chipText`/`chipTooltip`: both independently compute `const buff = method === "grass" || method === "water" ? "+" : ""`. Two call sites, one boolean — no bug, but a 1-line shared `isBuffedMethod(method)` helper would remove the duplication if this file gets a third caller later. Not worth a change for two call sites today.

No critical or important findings. GBA-additivity, cache correctness, guard correctness, CSS token hygiene, and test rigor all hold.

## Not reviewed (out of scope / deferred per task instructions)

- Live-verify (screenshots, in-app browser) — explicitly the coordinator's per the spec's amendment.
- `npm test`/`npm run typecheck` were not re-run by this reviewer (would race the concurrent Opus spec-review mutations in this checkout); implementer report states 1659/0 and clean typecheck.
