Needs changes — Critical: 0, Important: 3, Minor: 1.

1. **Important — B11: GBA preview accepts attributes exceeding their masks.**  
   `packages/server/src/blockEditRoutes.ts:188` and `:190` use bitwise comparisons that truncate numbers to 32 bits. An otherwise valid preview with `draft.behavior = 4294967296` or `draft.layerType = 4294967296` passes validation and returns 200. B11 requires 400 naming the field. Core’s `patchGbaAttribute` rejects these values by comparing the masked result against the original value. Use equivalent non-truncating validation and add both regressions.

2. **Important — B6: GBA `limits.cap` describes the selected layout, not the file’s effective cap.**  
   `packages/server/src/blockEditRoutes.ts:165` calculates the cap solely from the current layout’s split. For a primary metatile file consumed by layouts with limits 640 and 512, querying the 640 layout reports `cap: 640`, although the planner refuses an append at 512. Compute the file’s cap across its consuming layouts, consistent with the planner. The fixture selection at `packages/server/test/helpers/blockEditRoutesSuite.ts:167` deliberately excludes differing consumer limits, so the current test cannot expose this.

3. **Important — Required read-contract coverage is incomplete.**  
   `packages/server/test/helpers/blockEditRoutesSuite.ts:222`, `:264`, `:297`, and `:411` leave meaningful wrong implementations passing:
   - Case 3 appends bytes and checks only revision changes. GET could return stale block contents while hashing staged bytes correctly.
   - Cases 1/5 never exercise cap refusal; `nextId` could always return a number.
   - Case 6 checks `time=`/`tv=` presence, not their values or behavior. A GBC sheet ignoring time and palette assignments, or a constant cache version, passes.
   - Case 10 omits malformed draft structures, unknown collision names, over-mask attributes, and GET planner refusals.

   Add independent assertions for these binding contracts, including the overflow regression above.

4. **Minor — Project-derived GBA layer options are hardcoded.**  
   `packages/server/src/blockEditRoutes.ts:136` synthesizes `NORMAL=0`, `COVERED=1`, `SPLIT=2`. The binding design’s “Shell and UI” requires options parsed from project `METATILE_LAYER_TYPE_*` constants. A project changing or extending those constants receives incorrect options. No test currently inspects `options`.

Ruling-by-ruling assessment:

| Ruling | Static assessment |
|---|---|
| B1 | Implemented exactly: separate factories, required dependency shape, boolean claiming, mounts before family edit dispatch. |
| B2 | Implemented exactly for 11a’s three paths. |
| B3 | Implemented exactly where planner inputs are needed: sync precedes reads; grids come only from open entries, keyed by map name; GBA uses `profile.blockMetatileIdMask`. |
| B4 | Implemented exactly: selectors, effective cell lookup, GBC border resolution, loader-derived identity drafts, planner revision/usage, GET planner conflicts. Coverage gaps noted above. |
| B5 | Implemented exactly for read-side shapes; preview uses URL map context and ignores body `map`. |
| B6 | **Deviates:** cap and project-derived options findings above. `nextId` refusal handling and ownership lookup otherwise follow the ruling. |
| B7 | Implemented exactly on inspection: geometry, family palette parameters, palette-map lookup, reserved IDs and versioned URLs. Behavioral coverage is incomplete. |
| B7a | Implemented exactly: GBA split-plus-secondary count and null gap; GBC PNG tile count. |
| B8 | Implemented exactly on inspection: JSON base64, family renderers, map context, invalid-tile rejection. |
| B11 | **Deviates:** over-mask attribute acceptance. Common error envelopes and ordinary structural guards otherwise follow the contract. |
| B12 | Implemented exactly in both Save-plan bodies; staged and empty effects are tested. |
| B13 | Implemented exactly: no read handler calls `store.open` or invokes the session-body callback. |

Test-by-test assessment:

| Case | What it proves / remaining escape |
|---|---|
| 1/5 | Pins ID/cell resolution, basic shapes and uncapped limits. GBC tiles use disk bytes. GBA entries/attributes and GBC collision/palette names lack content assertions; secondary and capped limits are untested. |
| 2 | Pins staged raw-zero → border resolution and `viaBorder`. Oracle comes from existing map HTTP output. |
| 3 | Pins revision sensitivity to the target grid/staged bytes and independence from another grid. Does not prove staged identity content or exact usage. |
| 4/9 | Pins initial null owner, another map’s ownership, empty effects and both consuming maps in a staged effect. Extra erroneous effects/maps could pass. |
| 6 | Strong disk-PNG count oracle and full GBA index mapping; pins GBA palette-byte difference and GBC `$60 → $80`. Does not prove GBC sheet colors/time, reserved IDs, or changing `tv`. |
| 7 | Pins identity preview bytes against a context-sensitive existing hub image and rejects a missing tile. An implementation validating the draft but rendering the unchanged block could pass; changed-draft rendering is untested. |
| 8 | Pins absence of a newly opened session and preservation of existing session JSON/undo depth across all three reads. |
| 10 | Pins listed malformed-name, unknown-map, selector and null/array-body cases plus error-envelope shape. Does not assert field-first messages or exact codes. |
| Four existing GBC assertions | Correctly pin empty `tilesetEffects` in their existing lifecycle scenarios. |

No expected block-editor result is directly computed by its planner or renderer in the new suite. Disk PNG dimensions and literal mappings are independent; earlier hub responses are permitted oracles. Some assertions compare fields from the same response, but disk-derived checks supplement the sheet-count assertions.

I did not run tests, typecheck, builds, mutations, or live UI checks, and edited no files. The reported 311/311 and typecheck pass remain conductor evidence, not independently verified. I reviewed only the spec role; quality-only concerns and 11b check/apply behavior were outside this review.