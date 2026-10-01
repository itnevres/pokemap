# Task B2 spec-compliance review

**Verdict: ✅ PASS** (0 blocking, 2 minor, 1 info). Reviewed `git diff 3ea7fbf HEAD -- packages/` (91a4558, c883f57) vs `task-B2-spec.md`.

## Findings
- **SR-F1 (minor)** `packages/ui/test/encounters/borderSide.test.ts:30-36` -- `bandRect` left/top/bottom asserted only on the square 10x10 MAP; only `right` checked on a non-square rect. Mutants M6d (left `height: w`) and M6e (top `width: h`) survive both files (corpus too: NewBarkTown 10x9 / Route30 10x27 give same overlaps). Impl (`borderSide.ts:23-26`) matches spec formulas exactly; fix = add left/top/bottom asserts on `R(3,4,5,6)`.
- **SR-F2 (minor, spec text, not impl)** Spec's mutation list says "`>=` instead of `>`" goes red, and that a closed "touching" rule changes NewBarkTown's answer. Both inaccurate:
  - M2a (`w >= 0 && h >= 0 ? w*h : 0`) is **equivalent**: guard only matters when both w,h<0 (product >0), still excluded; w=0 or h=0 -> product 0. Implementer's claim correct.
  - Closed rule, NewBarkTown: all four blocked, but least-overlap fallback still gives `top` (area totals L18/T0/R18/B0; contact-counted L18/T2/R18/B2). Side never flips; corpus pins closed semantics only via the `by` overlap numbers when `overlapArea` itself changes (M2b). M2c (closed blocking in `pickBorderSide`, area fallback) leaves corpus green. Route30 side does flip under M2b (L4/T20/R3/B20 -> `right`). Discrimination is carried by unit corner + gap=band tests (red under M2b and M2c). No action needed.
- **SR-F3 (info)** M10 (delete `if (total === 0) return side;`) equivalent: strict-`<` min over SIDE_ORDER already returns first 0-total side. Not a defect.

## Spec checks
| check | result |
|---|---|
| exports `BorderSide, Rect, SIDE_ORDER, BORDER_BAND, bandRect, overlapArea, pickBorderSide, CompassDir, borderSideFromConnections` | ✓ `borderSide.ts:11-59` |
| `SIDE_ORDER = ["left","top","right","bottom"]` | ✓ :15 |
| `BORDER_BAND = { gba: 4, gbc: 2 } as const` | ✓ :17 |
| doc cites U4 + positive-area/half-open, flush blocks, gap=band & corner free | ✓ :1-10, :30 |
| caller excludes map; rect==map blocks nothing documented | ✓ :37-41 (+ test :101) |
| all four dirs -> `left`; west/north/east/south mapping | ✓ :55-59 |
| pure (no imports, no React/fetch) | ✓ zero imports |
| corpus test line 1 `// @vitest-environment node`, `itWithGbcCorpus` from `../../../core/test/gbc/helpers/corpus.js`, neighbours = all other placements | ✓ corpus.test.ts:1,5,13 |
| no existing test changed | ✓ `git diff --name-status 3ea7fbf HEAD -- packages/ui/test packages/core/test`: 2x `A` only |
| unit coverage: U4 6 examples, all-blocked + tie (overlap asserted), gap 0/band-1/band/band+1, corner, bandRect, connections 7 cases | ✓ (+ extras: right=bottom tie, rect==map, overlapArea direct, `{south}`) |

## Re-derived numbers (by hand, MAP {0,0,10,10}, band 2, half-open)
- `bandRect`: L {-2,0,2,10}; T {0,-2,10,2}; R {10,0,2,10}; B {0,10,10,2}; `R(3,4,5,6)` right band 4 -> {8,4,4,6}. ✓
- `overlapArea` direct: (0,0,4,4)x(2,2,4,4)=2*2=4; x(4,0,4,4) w=0 ->0; x(4,4,4,4) ->0; x(9,9,1,1) w=-5 ->0. ✓
- Flush L{-5,0,5,10} vs left band w=0-(-2)=2,h=10 ->20; vs top band w=min(10,0)-max(0,-5)=0 ->0 (symmetric for T,Rt,B: each blocks only its own side, 20). U4: T+B->left, L+R->top, T+Rt->left, none->left, L->top, L+T+Rt->bottom. ✓
- All-blocked: left{-2,0,2,10}=20, top{0,-2,3,2}=3*2=6, right{10,0,2,4}=2*4=8, bottom{0,10,10,2}=20; no cross-band overlap (all edge contacts w or h=0) -> `top`. ✓
- Tie: top{0,-2,4,2}=8 = right 8, L/B 20 -> `top` (order). Extra tie: top{0,-2,10,2}=20, bot{0,10,4,2}=8 -> L20/T20/R8/B8 -> `right`. ✓
- Gap: {-5,..} gap0 w=2 ->20 blocked; {-6,0,5,10} x[-6,-1) gap1=band-1, w=min(0,-1)+2=1 ->10 blocked; {-7} x[-7,-2) w=0 free; {-8} w=-1 free. Corner {-5,-5,5,5}: vs left band h=min(0,10)-max(-5,0)=0, vs top band w=0 -> `left` (closed: L,T touched -> `right`). ✓
- `borderSideFromConnections`: {N,S}->left; {W,E}->top; {N,E}->left; {W}->top; {W,N,E}->bottom; all->left; {}->left; {S}->left. ✓

## Corpus (own tsx script, independent of impl; `buildGbcWorld(openGbcProject(PerfPlus))`, band 2)
| map | rect | half-open L/T/R/B -> side | closed contacts |
|---|---|---|---|
| NewBarkTown | {175,251,10x9} | 18/0/18/0 -> **top** ✓ spec | L Route29 2x9; T Route29 0x0 + Route27 0x0; R Route27 2x9; B Route29 0x0 + Route27 0x0 -> all blocked |
| Route30 | {130,224,10x27} | 0/20/0/20 -> **left** ✓ spec | L Cherrygrove 2x0 + Route31 2x0; T Route31 10x2; R Cherrygrove 2x0 + Route31 0x0; B Cherrygrove 10x2 -> all blocked |
Closed rule => all-four-blocked for both maps (spec's "all four would be blocked" holds); side outcome per SR-F2.

## Mutations (node script; anchor asserted to match exactly once; src restored from in-memory bytes + byte-compared each run; 18/18 IDs printed; ran both B2 files)
| ID | anchor -> mutant | result | red tests |
|---|---|---|---|
| M1 | SIDE_ORDER top before left | KILLED | unit 8/26 (constants, nothing, gap band, gap band+1, corner, rect==map, `[]`, `{south}`) |
| M2a | `w > 0 && h > 0` -> `>=` (spec literal) | SURVIVED (equivalent) | -- |
| M2b | overlapArea closed: `>=0 ? max(w,1)*max(h,1)` | KILLED | unit 6/26 (overlapArea, left only, tie top=right, flush, gap band, corner); corpus 2/2 |
| M2c | closed contact blocks in pickBorderSide, area fallback | KILLED | unit 4/26 (left only, flush, gap band, corner); corpus 0/2 |
| M3a | fallback largest (`-Infinity`, `>`) | KILLED | unit 3 (exact fixture, both ties) |
| M3b | fallback `<` -> `>` only | KILLED | unit 3 (same) |
| M4 | ties ignore order (`<=`) | KILLED | unit 2 (both ties) |
| M5a | SIDE_DIR top:south, bottom:north | KILLED | unit 1 (`{W,N,E}->bottom`) |
| M5b | bottom:"north" only | KILLED | unit 1 (same) |
| M6a | right band `x+w+band` | KILLED | unit 3 (bandRect, exact fixture, tie top=right) |
| M6b | bottom band `y+h+band` | KILLED | unit 4 (bandRect, exact, both ties) |
| M6c | left band `x-band-1` | KILLED | unit 3 (bandRect, exact, gap band) |
| M6d | left band `height: w` | **SURVIVED** | -- (SR-F1) |
| M6e | top band `width: h` | **SURVIVED** | -- (SR-F1) |
| M7 | `gbc: 3` | KILLED | unit 1 (constants); corpus 2/2 |
| M8 | all-four `?? "bottom"` | KILLED | unit 1 (all four -> left) |
| M9 | overlapArea h uses `a.width` | KILLED | unit 3; corpus 2/2 |
| M10 | delete early `return` on 0 | SURVIVED (equivalent, SR-F3) | -- |

Spec-requested mutations (order, closed, largest, tie-order, north->bottom) all killed; spec's literal `>=` is equivalent (SR-F2).

## Gate (reviewer run)
- `vitest run borderSide.test.ts borderSide.corpus.test.ts`: 2 files, 28/28 pass (corpus ran, not skipped).
- `npm run typecheck`: clean.
- Tree after mutations: byte-identical (only untracked `task-B3-spec.md`, coordinator's).
