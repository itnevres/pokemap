# Task 7 review

### Spec Compliance

- ✅ Spec compliant (R1-R5, user-decision scope, test list, oracle edits).
  - R1: `shared/useBeforeUnloadGuard.ts:1-15` body verbatim, `[isDirty]` dep; doc comment condensed as permitted; both shells keep a one-line pointer (App.tsx diff +80, GbcApp.tsx diff +214).
  - R2: `useStrokeChain.ts:470-479` matches the signature; both callbacks `useCallback(..., [])`; `strokeSettled` snapshots the set at call time. Grep of `packages/ui/src` finds the `settled(): Promise<void>` literal only at `useStrokeChain.ts:18`. `MapCanvas.tsx:67` and `GbcMapCanvas.tsx:134` use `SettledChain`.
  - R3: `resetForMapChange` is gone everywhere (grep of `packages/ui` is empty). `select` is still a named function. Both "why" comments moved onto the `if (visit.changed)` block. Test edits are exactly (a), (b), (c); the old-title/call removals match the oracle.
  - R4: `useEditSessionCore.ts:68-69` as specified; line 68 untouched.
  - No FamilyApp, family/*.ts or EngineAdapter was added.
- ⚠️ Not verifiable from the diff: RED-at-BASE (coordinator evidence is accepted), mutations M1-M5, and the plan's Step 3 live smoke (coordinator-owned).

### Strengths
- Minimal, faithful lift. The shells shrink with no semantic drift. `useRef` stays imported where still needed (typecheck is green).
- The core test is a real witness: the A-discard is held, then a switch to B, an apply with no ticket, and a resolve. It asserts both `state` and `isDirty`.
- Registry test (a) checks pending-after-first-resolve, so it kills the "resolves on first chain" mutation.
- The `SettledChain = Pick<StrokeChain<unknown>, "settled">` type de-duplicates the literal without any new interface.

### Issues

#### Critical
None.

#### Important
None.

#### Minor
1. `hooks/useMapEditing.ts` (diff -355..-357): the deleted `resetForMapChange` doc comment ("Deliberately does NOT touch `activeToolKind`/`collisionValue`: the chosen tool persists across map switches") was dropped, not moved. The global rule is to move comments, and R3 named only two comments to move. Fix: add one line to the `visit.changed` block, or to the `activeToolKind` doc, saying that tool and collision value persist across map changes.
2. `test/shared/useBeforeUnloadGuard.test.tsx:6-23`: spec cases (a)-(d) are folded into a single `it`. A failure will not say which case broke. Coverage is complete, so this is only diagnosability. Splitting the cases would be better.
3. `test/shared/useStrokeChainRegistry.test.tsx:678`: the `({ value })` renderHook param is unused. This is harmless, but it is lint-fragile.
4. Behaviour note under R3 (spec-sanctioned): a same-name re-select in GBA no longer clears `selectedEvent` or `currentStamp`, because the reset now keys on `mapName` changing. This is not a defect given R3. It is recorded in case a smoke check expects the old behaviour.

### Assessment

**Task quality:** Approved

**Reasoning:** The change is a small, faithful hoist with the R4 race fix correctly scoped. The tests are real witnesses with only cosmetic gaps, and nothing blocks the task.
