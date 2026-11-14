Needs changes — 0 Critical, 3 Important, 1 Minor.

1. **Important — Local’s requested palette can be overwritten by a later All entry.** `packages/core/src/blockEdit/gbcOps.ts:159–182,215`  
   Concrete scenario: distinct non-reserved tiles A and B have identical pixels; A is GRAY, B is RED. The draft requests **Local A → RED**, followed by **All B → GREEN**. Local reuses B and repoints A’s squares to it; the subsequent All operation changes B to GREEN. Those Local squares now display GREEN instead of the requested RED. R13 does not reject this because the source tiles differ. This violates the Local result required by spec lines 68–70 and mixed-draft acceptance. Resolve reuse against the final palette state, and test both entry orders. The existing mixed test always puts All first and deliberately chooses different source pixels.

2. **Important — The mixed-draft oracle does not meet the required independence.** `packages/core/test/blockEdit/gbcOps.test.ts:306–309`  
   Expected PNG output comes from `copySheetTile`, and expected palette text comes from `patchGbcPaletteMap`—the same production operations used by the planner. Although these units were previously reviewed, Task 6 explicitly requires independently computed mixed expectations. A shared wrong destination/palette-span behavior could satisfy both actual and expected results. Derive expected pixels by replacing the selected tile in the test’s decoded pixel array, and derive expected palette changes from the test’s own text parsing. Metatiles already have an independent byte expectation.

3. **Important — Collision assertions do not prove “only record N” text preservation.** `packages/core/test/blockEdit/gbcOps.test.ts:164–177`  
   Both the OK and forest-surplus tests compare parsed collision records only. A planner that normalizes CRLF, strips comments, or corrupts non-ASCII comment bytes would still pass. This leaves the Global Constraints’ losslessness requirement and the named Step-1 case incompletely asserted. Add independently constructed full-buffer expectations with CRLF and latin1 sentinel text, verifying that only record N’s arguments change and surplus text remains identical.

4. **Minor — Save-as-new refusal omits the required alternatives.** `packages/core/src/blockEdit/gbcOps.ts:145`  
   For an All palette change with Save as new, the message says only that it cannot be saved as new. Spec line 86 explicitly requires offering **Local or OK**. Include those alternatives and assert them in the test at `gbcOps.test.ts:294`.

Coverage assessment: placement’s four named Step-1 cases are present with concrete expected arrays. Most planner cases are present, but there is no explicit block-0-as-border confirmation case. Additional ruling coverage gaps include two Local allocations in one draft (`taken`), reuse ahead of a lower free slot, Local during Save as new, and a palette entry targeting an untouched tile without a palette-map entry. These are coverage gaps, not independently established implementation failures.

The four plan-listed mutations have relevant assertions: reserved-source refusal, Cave sheet mismatch, staged alias allocation, and same-map-only confirmation. Static inspection supports their ability to catch the intended changes; mutation execution is **not verified** because `mut_t6.out` remained empty.

Reviewed HEAD `c4600c7` against `e2dfa27`. `git diff --check` passed. No files written or Vitest run. The reported 43/43 tests and passing typecheck are conductor evidence, not independently rerun results.