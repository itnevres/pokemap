# Task 6 re-review, fix round 2 (diff 9a72738..8740779, 3 files)

M1 ADDRESSED, M2 ADDRESSED, M3 ADDRESSED, new issues: 0

- M1 `test/shared/useVisit.test.tsx`: Host records `visit.changed` per render into `changes` (push before the render-phase setPick) and asserts `[false, true, false]`. The `forMap` masking is gone; the pick is a bare value reset by `setPick(null)`. A real `Child` records the value it receives and asserts `["picked", null]`, so a missed reset would show "picked" at key B. The `changed = false` mutant now yields `[false, false]` and fails (coordinator-proven).
- M2 `src/shared/useVisit.ts:12-13`: JSDoc now describes the hook (stable until key changes; `changed` true for exactly the changing render; `isCurrent` retires callbacks). Accurate against the code at :14-24.
- M3 `src/hooks/useMapEditing.ts:59`: one-line JSDoc on `mapName?` added.

Brittleness: the exact sequence depends on React re-invoking the function body once after a render-phase setState (A; B changed; B settled). That is documented, stable React behaviour, and the Child is only committed once, so `childValues` is clean. The test has no StrictMode (a double render would break the exact sequence, but none is used here). Ran `npx vitest run packages/ui/test/shared/useVisit.test.tsx` from the repo root 3 times: 3/3 tests passed every run. Source change is JSDoc only; no behaviour change.
