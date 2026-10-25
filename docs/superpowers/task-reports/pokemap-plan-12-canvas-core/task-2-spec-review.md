No Critical, Important, or Minor spec-compliance findings.

- Every Task 2 Step 1 case has a meaningful assertion, including stale loads, cached StrictMode readiness, errors, layer ordering, invalidation, exact blit arguments, and decoration order.
- Dependency entries use `Object.is`; fresh arrays and closures do not invalidate the composite. Pan, zoom, and decoration changes only reblit.
- No missing base-canvas access is required by the existing selection-ring or drag-preview code. Event marks can remain adapter-owned through closures; disabling events must clear or suppress those marks.
- Task 4 must forward the returned `onImgError` through `MapCanvasViewport`, which currently exposes only `onImgLoad`. This is integration work, not a Task 2 API omission.

Verification limit: the focused Vitest run failed before collection with `EPERM` while writing Vite’s temporary config. This verdict is based on source/test inspection; coordinator mutation results were supplied, not independently rerun. No files edited.

Spec compliance: PASS