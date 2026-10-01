# Task B2 implementer report

**Status: DONE**

## Commits
- 91a4558 feat(ui): border side selection helper (borderSide.ts + borderSide.test.ts, 26 tests)
- c883f57 test(ui): border side on real GBC corpus (borderSide.corpus.test.ts, 2 tests)

## Counts / gate
- Tests 1,821 -> 1,849 (+26 unit, +2 corpus); 116 files, 0 failures, no flakes hit.
- `npm run typecheck` clean; `npx vite build packages/ui` OK.

## Fixtures
- All spec numbers hand-derived before pinning; all matched (all-blocked 6/8/20/20; tie 8=8; gap 0/band-1 block, band/band+1 free; corner free).
- Corpus matched spec exactly: NewBarkTown L18/T0/R18/B0 -> top; Route30 L0/T20/R0/B20 -> left. No re-pin.
- Extra (beyond spec list but within its intent): tie right 8 = bottom 8 -> right; rect==map blocks nothing; overlapArea direct cases.

## TDD
- Unit: red (module missing) -> green. Corpus: implementation already existed so first run was green (not skipped: 2 passed); verified it goes red under mutation M2b.

## Mutations (src restored after each; tree clean)
| mutation | result |
|---|---|
| top before left in SIDE_ORDER | 8 red |
| closed interval `w>=0&&h>=0` only | **survives: equivalent mutant**, area is still w*h=0 on contact |
| M2b closed semantics (touching -> area>=1) | 6 unit red, 2 corpus red |
| fallback picks largest | 3 red |
| fallback ties -> last (`<=`) | 2 red |
| north<->south mapping swapped | 1 red |

## Deviations
- Spec mutation "`>=` instead of `>`" is area-equivalent in my overlapArea (returns 0 either way); reviewers should use a closed-semantics variant (touching counts nonzero) like M2b. Code is per spec.
- Imports in corpus test use `@pokemap/core/src/...` alias (as other UI tests do) plus relative path for the GBC corpus helper per spec.
