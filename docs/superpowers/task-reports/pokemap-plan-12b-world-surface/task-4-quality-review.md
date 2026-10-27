Quality: Needs rework

- **Important — [useWorldDrag.ts:261](</C:/Programming Projects/PokeMap/packages/ui/src/canvas/useWorldDrag.ts:261>): Unmount abandons begun ledger versions.** Start a map/group drag, move once, then unmount before release. Cleanup never invokes `cancel`, so optimistic positions remain in caller-owned state and begun versions remain pending in a surviving ledger. `useStage.ts:184–187` only releases capture; it deliberately clears capture ownership without notifying `onCancel`. Consequently, subsequent world snapshots cannot reconcile those maps. Add unmount cleanup that rolls back and settles the gesture exactly once, with map/group tests retaining the external ledger across unmount. This closes P12-4a’s unmount termination contract.

Otherwise, ordinary release/leave/cancel ordering is sound by inspection. Ref-backed positions avoid stale-render release reads; group deltas do not require the anchor to exist in `starts`. Numeric fixtures are correct, and retained rationale comments satisfy the move requirement.

Read-only review; no tests or npm commands run. Mutation and typecheck results remain conductor-reported, not independently verified.