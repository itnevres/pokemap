## Critical

None.

## Important

### I1 — P12-8’s “unchanged oracle” contradicts P12-4h

**Claim:** SR-I1 is only partially resolved. The trigger policy is explicit, but its protected assertion cannot remain unchanged.

**Evidence:** Spec A:28 removes `&v=0`; A:34 and A:117 require `MapCanvas.test.tsx:427–441` unchanged. That test explicitly expects `"0"` at `packages/ui/test/MapCanvas.test.tsx:441`, after waiting out the reseed debounce. Plan B:112 repeats the unchanged requirement, while B:118 permits changing `v=0` expectations.

**Fix:** Preserve the reseed guarantee, changing the initial and post-reseed URL expectations to `null` under P12-4h. Retain the delayed assertion and mutation proving that the reseed schedules no bump. Update both documents’ “unchanged” language without changing P12-8’s trigger decision.

### I2 — Pointer-event integration and its test migration are unspecified

**Claim:** Tasks 3–4 describe pointer capture but omit the existing viewport’s event boundary.

**Evidence:** B:87 omits `shared/MapCanvasViewport.tsx`, although B:92 requires using it. `packages/ui/src/shared/MapCanvasViewport.tsx:11–14` accepts only mouse handlers; lines 29–32 attach only mouse events. Existing tests dispatch mouse events explicitly—for example `packages/ui/test/MapCanvas.test.tsx:592` and `packages/ui/test/gbc/GbcMapCanvasEdit.test.tsx:76`. Replacing those handlers with pointer handlers does not make these synthetic mouse events invoke them.

**Fix:** Specify either pointer-prop migration or native pointer-listener integration, including ownership of cancellation and capture release. Add the affected files and explicitly authorize equivalent event-driver updates under P12-4a. Test that a real mouse gesture’s pointer and compatibility mouse events cannot start or commit twice.

### I3 — Moving the stroke chain omits its save/discard registration contract

**Claim:** The proposed surface can satisfy its listed interaction tests while disconnecting pending strokes from shell settlement.

**Evidence:** A:97 and B:89 move ownership of `useStrokeChain` but never specify forwarding/registering `onStrokeChain`. Current registration lives at `packages/ui/src/components/MapCanvas.tsx:258–261` and `packages/ui/src/gbc/GbcMapCanvas.tsx:311–314`. The shell consumes this registry at `packages/ui/src/shell/FamilyApp.tsx:82–86` and waits before discard at line 282. Existing registry tests register fake chains directly (`packages/ui/test/shared/useStrokeChainRegistry.test.tsx:17`); the shell test also registers its own chain (`packages/ui/test/shell/switchPrompt.test.tsx:50`). Neither proves the new surface registers its actual chain.

**Fix:** Explicitly preserve registration, cleanup, and forwarding through both wrappers and context hosts. Add a real-wrapper integration test with deferred apply/end promises showing settlement remains pending, plus a mutation removing registration.

### I4 — Acceptance 12a.1 and 12a.3 are not fully assigned to executable tests

**Claim:** Fit and time-switch preservation are incompletely covered by the plan.

**Evidence:** A:90 requires fit helpers in `canvas/view.ts`, calling existing `fitWithBand`; A:116 requires foundation fit tests. B:50–55 specify no fit implementation or fixture. B:79 tests invoking Fit, rather than its numeric output.

A:118 additionally requires a GBC time switch without refitting. B:104 relies on `packages/ui/test/gbc/GbcMapCanvas.test.tsx:613–620`, which checks dimming and fetch count but never checks view preservation or completes the replacement image’s load. B:141 likewise checks refetching, not refitting.

**Fix:** Assign the fit helper and independently derived fixtures to Task 1. Add a GBC test that changes the user’s view, switches time, completes the new image load, and asserts unchanged view/no fit invocation. Mutate the auto-fit guard to prove discrimination.

### I5 — Raster invalidation excludes changes to the ordered layer structure

**Claim:** SR-I7’s revised contract can retain stale pixels when layer identity or ordering changes.

**Evidence:** A:92 describes an ordered layer list but permits recomposition only for image readiness, size, and declared layer inputs. B:64 narrows comparison to `enabled`/`deps`; it supplies `key` without making keys, membership, or ordering invalidators. B:66 checks initial drawing order, not reordering after the first composite.

Two enabled layers with equal dependency lists can exchange positions while satisfying the stated “no recomposite” condition.

**Fix:** Include ordered layer keys and membership in semantic invalidation, or explicitly require an immutable layer sequence. Test a post-mount reorder/replacement and mutate the structural comparison.

### I6 — Task 8 is incorrectly classified Medium

**Claim:** “Checks only” does not justify the tier for the authorized live workflow.

**Evidence:** B:133–141 classifies Task 8 Medium while allowing real painting followed by reverse paints/restoration, using real subject repositories. The supplied project rules explicitly classify writes to subject repositories—and failures not automatically detected—as High. Final manifests do not make intermediate writes or incomplete restoration low risk.

**Fix:** Classify Task 8 High with the corresponding reviews, or make all modifying requests obligatorily intercepted and verify that no subject writes occur. “Prefer `page.route`” is insufficient.

## Minor

### M1 — SR-I6’s terminology correction remains inconsistent

**Claim:** The acceptance section still asks for the operation the revision rejects.

**Evidence:** A:93 explicitly requires bounded lookup and “no numeric clamp,” but A:116 still says “raw, clamped.” B:35 likewise says “raw vs clamped,” despite B:53 correctly specifying `boundedCell`.

**Fix:** Replace both remaining instances with “bounded, returning null outside.”

### M2 — Task 6 leaves the error-routing call-site inventory conditional

**Claim:** The relevant context path is already knowable and should be named.

**Evidence:** B:113 says “the in-context overlay call site if it renders `MapCanvas` with a session.” It does: `packages/ui/src/gba/adapter.tsx:99` spreads workspace props into the chromeless canvas. Those props are defined by `packages/ui/src/components/MapEditingWorkspace.tsx:19–22` and constructed at lines 79–93. GBC already includes `onEditError` in its corresponding prop type at `packages/ui/src/gbc/GbcMapEditing.tsx:27`.

**Fix:** Require adding `onEditError` to the GBA `Pick` and shared `canvasProps` object. Name `gba/adapter.tsx:99` as the verification site; its spread should require no additional handler. Require banner assertions in both Map and context modes.

### M3 — The family-branch verification command does not inspect files

**Claim:** Task 7’s prescribed command cannot establish its claimed result.

**Evidence:** B:131 uses `grep -n "gba\|gbc" packages/ui/src/canvas`, passing a directory without recursive traversal.

**Fix:** Use `rg -n -i 'gba|gbc' packages/ui/src/canvas`, inspect matches, and retain semantic review for indirect family branching.

Spec: Approved with fixes  
Plan: Needs rework