**Needs rework**

1. **PR12b-I1 — The changed-test allowlist is incomplete.**  
   **Evidence:** `2026-10-26-pokemap-plan-12b-world-surface.md:20,146,160`; `WorldCanvas.test.tsx:401-420,574-601`; `WorldCanvasContext.test.tsx:112-119,464-481`; `gbc/GbcWorldCanvas.test.tsx:2001-2009`.  
   **Problem:** P12-4e changes Solo’s initial zoom from 1 to 10, breaking the unlisted LOD and placement-drag expectations. Context fixtures’ old coordinates miss after fitting. GBC’s F-shortcut test still expects all-placement Fit, contrary to P12-4m. The plan prohibits these necessary edits. Additional affected cases include marquee, warp projection and border fixtures at `WorldCanvas.test.tsx:1299,1664,2264,2301`.  
   **Fix:** Complete the authorized test-rebase inventory under P12-4e/m, preserving each behavioral assertion rather than weakening it.

2. **PR12b-I2 — The warp contract omits essential family differences.**  
   **Evidence:** Plan `:114-116,130`; `gbc/GbcWorldCanvas.tsx:638-656,673-680`; `components/WorldCanvas.tsx:1257-1283`.  
   **Problem:** “Fetch per visible map” loses GBC’s offscreen dungeon connection sources. GBC validates payload/map identity, permits retry, and resolves destinations through `destEvent`; GBA requires destination-cache lookup by `destWarpId`. A coordinate-offset adapter alone cannot preserve these behaviors.  
   **Fix:** Assign fetching scope, validation, retry and endpoint resolution explicitly. Preserve existing differences unless the user rules otherwise. Add offscreen-connection and malformed/retry tests with mutations.

3. **PR12b-I3 — Reusing `useStage` introduces an unaddressed wheel-ordering regression.**  
   **Evidence:** Plan `:114,118`; `canvas/useStage.ts:47-52`; `gbc/GbcWorldCanvas.tsx:951-952`.  
   **Problem:** The foundation calculates continuous zoom from render-captured `zoom`; GBC currently multiplies the latest updater state. Two wheel events before a commit can collapse from `z × 1.44` to `z × 1.2`.  
   **Fix:** Assign continuous stepping and cap calculation from the latest view to a task. Pin same-batch repeated and inverse wheel events through the real wrapper, with a mutation.

4. **PR12b-I4 — Placement ownership is underspecified across the dispatcher/data boundary.**  
   **Evidence:** Plan `:101,130`; `components/WorldCanvas.tsx:1637,1655,1709,1721`; `shared/placementLedger.ts:5-6,19-26`.  
   **Problem:** The proposed interface names `commit(moves)` and ledger `moved/resolve`, but omits `begin` before optimistic updates and `noop` for returned-to-start gestures. Cancellation additionally needs a defined preview/ledger outcome; “no POST” alone can leave unresolved ownership.  
   **Fix:** Define version ownership and propagation across Tasks 4–6, including no-op and cancellation settlement. Name the existing reconciliation oracles and add cancel→reload coverage and mutations.

5. **PR12b-I5 — Group settlement coverage misses early rejection.**  
   **Evidence:** Plan `:132-134`; `components/WorldCanvas.tsx:1471-1500`; `test/world/placementResync.test.tsx:152-165`.  
   **Problem:** The proposed deferred test resolves every POST. It cannot reject a shared `Promise.all` implementation that reloads early when one member fails. Current GBA catches each member separately and reports only successful names.  
   **Fix:** Reject one member while others remain pending: assert no reload/callback, then settle the remainder and assert one reload, successful-name notification and failed-member reconciliation. Mutate premature rejection handling.

6. **PR12b-I6 — Task 1’s Medium classification bypasses required High reviews.**  
   **Evidence:** Plan `:47-60`; `CLAUDE.md:24`; `canvas/useRasterComposite.ts:64-79`.  
   **Problem:** Task 1 changes image readiness/error handling and shared capture state, not merely imports and deletions. These meet the project’s High triggers.  
   **Fix:** Classify Task 1 High or split mechanical cleanup from the behavioral changes. Apply separate spec and quality reviews to the latter.

7. **PR12b-I7 — The proposed zoom-helper re-export is not API-compatible.**  
   **Evidence:** Plan `:72,78`; `gbc/GbcWorldCanvas.tsx:198-209`; `canvas/view.ts:36-46`.  
   **Problem:** `zoomWorldAboutPivot` accepts a multiplicative factor and preserves `fitted`; foundation `zoomAboutPivot` accepts an absolute zoom and returns only zoom/pan. Aliasing the old name breaks both semantics and the fit gate.  
   **Fix:** Specify a compatibility wrapper that converts the factor, supplies policy/bounds, preserves extra view fields and retains no-op identity.

8. **PR12b-I8 — The requested ruling-to-mutation coverage is incomplete.**  
   **Evidence:** Plan `:120,134,147,161`; spec `:24,39,43`.  
   **Problem:** Tests are assigned, but no explicit mutations target P12-4d’s alert, P12-4q’s reveal operation or P12-5’s placeholder. Ignoring `drawnByDefault` does not specifically test removing reveal-on-jump.  
   **Fix:** Add a ruling→test→mutation matrix and explicit mutations removing the alert, reveal insertion and loading/error placeholder distinction.

9. **PR12b-M1 — Dungeon-fit wording omits the anchored-member rule.**  
   **Evidence:** Plan `:73`; `components/WorldCanvas.tsx:701-705`; `WorldCanvas.test.tsx:1870`.  
   **Problem:** “The dungeon filter’s maps” does not specify preferring members with resolvable components before falling back to all scoped placements. Fitting everything can reproduce the distant-shelf regression.  
   **Fix:** State this algorithm explicitly and assign its fixture/mutation to Task 2.

10. **PR12b-M2 — Several allowed test changes are unsupported by their citations.**  
    **Evidence:** Plan `:20`; `gbc/GbcWorldCanvas.test.tsx:251-258`; `WorldCanvas.test.tsx:1488-1523`; `components/WorldCanvas.tsx:795-799`.  
    **Problem:** GBC’s unified bounds remain exactly `1/64..32`. The same-map jump test already requires a fresh highlight DOM node; P12-4p fixes the timer lifetime, not that existing assertion.  
    **Fix:** Keep these guarantees unchanged. Add a delayed re-jump test crossing the original timer expiry while remaining inside the restarted two-second window.

11. **PR12b-M3 — Some task instructions cannot be followed literally.**  
    **Evidence:** Plan `:53,59,68,143,147,155`; `test/canvas/useStage.test.tsx:315`; `canvas/useStage.ts:32`; `gbc/GbcWorldCanvas.tsx:5,152`.  
    **Problem:** The hook migration needs a policy-argument change, not imports only. Task 2 moves imports whose visual helpers move only in Task 8. Task 7 requires baseline failure for a radius-8 guarantee GBC already implements.  
    **Fix:** Authorize the assertion-preserving signature adaptation, sequence math versus visual-helper imports explicitly, and distinguish baseline-red feature tests from mutation-red preservation tests.

12. **PR12b-M4 — The plan repeats a false ledger claim about GBA status content.**  
    **Evidence:** Plan `:154`; ledger `:23`; `components/WorldCanvas.tsx:2029-2043`.  
    **Problem:** GBA has counts, component/manual-placement text and the Shift-drag hint—not “tile-dimension status items.” Adding dimensions would violate DOM preservation.  
    **Fix:** Replace that description with the actual existing status content.