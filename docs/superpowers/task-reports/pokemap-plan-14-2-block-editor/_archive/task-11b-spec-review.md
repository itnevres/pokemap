Needs changes — Critical: 0, Important: 1, Minor: 3.

Findings:

1. **Important — B11: malformed GBA placement can return 500.** `packages/server/src/blockEditRoutes.ts:284–285` forwards an unchecked `cell` into the planner. Send either check or apply a valid draft and revision with `mode: "saveAsNew"`, `from: "map"`, and `cell: null`. `packages/core/src/blockEdit/gbaOps.ts:322` checks only `undefined` before accessing `cell.x`, throwing `TypeError`; the route returns 500 `INTERNAL_ERROR` at `blockEditRoutes.ts:145`. Malformed input must return 400. Validate placement structure before invoking the planner and add both-route regression cases.

2. **Minor — planner-refusal handling is not pinned.** `packages/server/test/helpers/blockEditRoutesSuite.ts:1333` exercises synthesized `STALE`, but no 11b case exercises check’s catch at `blockEditRoutes.ts:167`. Removing that catch would make a planner refusal such as `BLOCK_CAP` return 409 rather than 200, while these cases could remain green. Add a non-`BAD_VALUE` planner refusal and assert the complete response.

3. **Minor — 11b.11 does not exercise planner-thrown `BAD_VALUE` or the full B14a range contract.** `packages/server/test/helpers/blockEditRoutesSuite.ts:1508–1516` supplies values rejected by route validation before planning. An implementation mapping planner-thrown `BAD_VALUE` to 409 could pass. Likewise, check/apply have no layer-mask or `2**32` cases. Add an input that reaches planner validation, plus both attribute boundary families.

4. **Minor — append-size expectations partly derive from the same action’s staged output.** `packages/server/test/helpers/blockEditRoutesSuite.ts:1383,1388` compares staged `after` against staged `before`. Incorrect staging that corrupts both buffers consistently could satisfy these assertions. Capture metatile bytes and collision record counts before apply and compare against those independent baselines.

Ruling assessment:

| Ruling | Assessment |
|---|---|
| **B9** | Implemented exactly: success keys, planner-refusal handling, synthesized stale refusal, and read-only return at `blockEditRoutes.ts:165–180`. Coverage gap in finding 2. |
| **B10** | Implemented exactly: revision comparison at `:174` precedes staging at `:184`; the complete plan goes through `stageTilesetPlan`; placement remains the planner’s responsibility. |
| **B10a** | Implemented exactly: `:181–186` skips staging for no edits/no placement, then obtains the session body. Session opening is permitted by the superseding ruling. |
| **B11** | **Deviates:** null GBA placement yields 500, as described above. Other inspected body/draft guards and refusal mappings match. |
| **B13** | Implemented exactly for check: grids use `store.entries()` at `:199–200,299`; check returns before staging/session-body construction. |
| **B14a** | Implemented exactly at `:225–228`: safe nonnegative integers, upper-bound comparison before bitwise checks, shifted-down layer mask, field-prefixed errors. |
| **B15d** | Implemented exactly within scope: write routes delegate usage/cap decisions to planners and introduce no symbol-scoped calculation. E1 remains excluded. |

Label construction at `blockEditRoutes.ts:182–183` is correct: edited id for `ok`, `plan.newBlockId` for `saveAsNew`, uppercase hexadecimal, minimum two digits.

Test-by-test assessment (`packages/server/test/helpers/blockEditRoutesSuite.ts`):

| Case | What it pins; remaining limitation |
|---|---|
| **11b.1**, `:1285` | Pins success shape and usage against an earlier GET. Does not independently pin warning contents. |
| **11b.2**, `:1297` | Pins true/false confirmation and save-as-new false. Fixtures inspect disk usage; GBA also reuses `gbaConsumingLayouts`, so consumer discovery is not fully independent of core. False cases could accept a refusal because they do not assert its absence. |
| **11b.3**, `:1318` | Pins a cross-half warning using independently selected input and literal prefix; rejects refusal. |
| **11b.4**, `:1333` | Pins stale status/refusal/confirmation. Does not pin retained usage, warnings, or complete key set. |
| **11b.5**, `:1343` | Pins closed-store preservation and open-session/history preservation. Ordinary check-staging mutations should fail. |
| **11b.6**, `:1361` | Pins placement, appended content, label, collision-record growth, and one-undo restoration. Pre-action GET/render oracles are valid; staged-buffer comparisons have finding 4’s weakness. |
| **11b.7**, `:1408` | Pins in-place content, label, independent pre-action source PNG, and undo restoration. |
| **11b.8**, `:1434` | Pins ownership refusal and closed-store preservation. Replacing the ownership helper with an unguarded direct write should fail. |
| **11b.9a/b**, `:1446,1467` | Pin disk-change and paint staleness. Skipping revision checks should fail; staging before refusing should also fail through session/history assertions. The open-session case checks history only, not unchanged staged bytes. |
| **11b.10**, `:1478` | Pins B10a’s clean session, no undo command, and unchanged history on an existing session. Ordinary no-op staging should fail. `changedStaged` filters unchanged entries, so it does not prove absence of all staged entries. |
| **11b.11**, `:1501` | Pins listed structural errors, route-level invalid values, malformed names, unknown maps, and null/array bodies. Misses the null-cell failure and planner-error/range coverage in findings 1 and 3. |

I inspected HEAD `4c56e75`, the scoped diff, binding rulings/briefs, relevant plan sections, and supporting source. I did not run tests, typecheck, builds, mutations, or live checks; conductor results remain supplied evidence. No files were edited. This is the spec review only, not the separate quality review.