# Task B2 code-quality review

Scope: `git diff 3ea7fbf HEAD -- packages/` (91a4558, c883f57): borderSide.ts (60 ln), borderSide.test.ts (121), borderSide.corpus.test.ts (34). Read-only; no tests run (read from git objects).

**Verdict: APPROVED** (0 Important, 4 Minor, 3 Nit). None block B3/B4; QR-1 and QR-2 cheapest to fold into B3's first touch.

## Edge analysis (all traced, no defect)
| case | behaviour | ok |
|---|---|---|
| band 0 | bands zero-area -> always `left` | yes (undocumented, QR-7) |
| band < 0 | band w/h negative -> overlap w<=0 -> 0 -> `left` | yes |
| NaN band | comparisons false -> 0 -> `left` | yes |
| zero-size `rect` | zero-length bands -> `left` | yes |
| zero-size neighbour | area 0 | yes |
| neighbour == self | doesn't touch outer bands (spec'd, tested) | yes |
| many neighbours | O(4n) per map, O(4n^2) per world; corpus ~hundreds of maps = ~10^5 ops | fine |
| cross-component | `buildGbcWorld` placements are post-shelf-pack in ONE frame, so "all other placements" is a valid neighbour set | yes |
| fractional coords | see QR-1 | minor |

## Findings
| id | sev | where | issue / scenario | fix |
|---|---|---|---|---|
| QR-1 | Minor | borderSide.ts:31-35 `overlapArea` | Exact gap==band relies on exact float arithmetic: `min(a.x+a.w, b.x+b.w) - max(a.x,b.x)` with non-dyadic fractions (e.g. x=0.1+0.2) can give +1e-17 > 0, blocking a free side. Today placements are integers (blocks/metatiles) so unreachable; breaks if B3 ever passes zoomed/screen-space or sidecar fractional offsets. Not documented. | One doc line on `pickBorderSide`: "integer (or exactly representable) world units", or `w > 1e-9`. Doc suffices. |
| QR-2 | Minor | borderSide.ts:42 | `neighbours: Rect[]` rejects `readonly Rect[]` / `ReadonlyArray<Placement>` under strict TS; B3 will derive it from `[...placements.values()].filter(...)` (mutable, ok) but a memoised/readonly list won't compile. Function never mutates. | `neighbours: readonly Rect[]`. |
| QR-3 | Minor | borderSide.ts:13,58 | B4 fit: `CompassDir` is the GBC literal union; GBA `ConnectionDirection` is `up/down/left/right/dive/emerge`, so B4 must write `up->north..., drop dive/emerge` itself, and a wrong map there is exactly the north<->south class of bug the B2 mutation list targets, yet untested at the seam. `CompassDir` is also a 3rd copy of the GBC direction union (inline in core `Connection.direction`, not a named export, so no import possible). | Either export a tested `gbaDirToCompass(d: ConnectionDirection): CompassDir \| undefined` here (4-line map, +1 test) or flag in B4's spec that B4 owns/tests it. Don't add if B4 inlines and tests. |
| QR-4 | Minor | borderSide.corpus.test.ts:3, :16 | (a) First UI test to import `packages/core/test/**` (`WorldCanvas.test.tsx` only mentions a core test path in a comment). Fragile on helper move/rename. (b) `corpus.ts` does `readFileSync("pokemap.config.json")` at module load: running vitest with cwd != repo root throws at import and fails the file instead of skipping (other UI tests unaffected). Spec-binding and works under `npm test`, so acceptable, but know it. (c) Skips silently when no GBC checkout: gate must show "2 passed" not "2 skipped" (implementer reports 2 passed, OK). | Acceptable as is. If more UI corpus tests follow (B3/B5), re-export the helper from a shared test-support location or add a one-line note in the file header. |
| QR-5 | Nit | corpus.test.ts:9-18 | `buildGbcWorld(openGbcProject(...))` runs per test (twice); no shared setup. | Hoist to a lazy `let world` / `beforeAll`; or leave (2 tests, cheap). |
| QR-6 | Nit | corpus.test.ts:10-17 vs borderSide.ts:44-53 | Per-side overlap sum is reimplemented in the test beside `pickBorderSide`'s identical loop. Defensible (independent re-derivation, not circular with SUT), but if B3 wants the per-side totals (e.g. tooltip/debug), extract `sideOverlaps(rect, nbs, band): Record<BorderSide, number>` and have both use it. `bandRect`/`overlapArea` exports are justified today (unit tests + corpus test); nothing else needs them. | None required. Don't export more. |
| QR-7 | Nit | borderSide.ts:41-42; test.ts:21-25 | Doc comment omits band<=0 => `left`. Test file: `Rt` alias is the odd one out among L/T/B; `constants` test only mirrors literals (still the sole pin of U4 values, keep). | One doc clause; rename `Rt` -> `Rr`/`RIGHT` optional. |

## API fit
- B3 (world): `pickBorderSide(placement, others, BORDER_BAND.gbc|gba)`; `Placement` is structurally a `Rect` (extra fields ok), no adapter. Caller must exclude self by name (documented; corpus test models it). Fits.
- B4 (map view): `borderSideFromConnections(ReadonlySet<CompassDir>)`; ReadonlySet is right. Needs the GBA mapping (QR-3).
- `all four -> "left"` fallback in map view is spec'd and tested (4-set and empty).

## Docs/style vs `encounters/summary.ts`
Header block cites plan task + U4 + the positive-area decision, matches summary.ts's "Plan 6c Task B1 ... Pure, no React" tone. `/** */` on exports, `.js` import suffixes, `import type` style consistent. No over-building: 4 functions, 2 constants, 3 types.

## Test quality (Plan 0 §7)
- Each test can fail; values exact. Verified by reasoning: swapped SIDE_ORDER fails U4 examples + constants test; `<=` tie mutant fails both tie tests (top-vs-right, right-vs-bottom: the second has top=20 so it isolates "first-min" vs "last-min"); largest-overlap fails all-blocked fixture; closed semantics fails corner/gap=band/corpus. Implementer's closed-interval `>=` equivalent-mutant note is correct (area w*h = 0 either way).
- Corpus test pins numbers (L18/T0/R18/B0, L0/T20/R0/B20) and side, via `toEqual` before side; failure shows numbers. Self-guard `expect(self).toBeDefined()` good.
- Gaps (not worth blocking): gap-vs-band pick tests only exercise `left`; right/top/bottom band geometry is covered only by the `bandRect` exact test plus flush U4 cases. A bug confined to e.g. bottom-band at gap==band is caught by `bandRect` exact rects, so the mutation surface is closed. No test for band<=0 / zero-size (QR-7, behaviour is benign).
