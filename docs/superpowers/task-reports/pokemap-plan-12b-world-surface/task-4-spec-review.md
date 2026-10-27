Spec: FAIL

- **Important — `packages/ui/test/canvas/useWorldDrag.test.tsx:150`, `:202`: nearest-unit rounding is not pinned.** Every asserted map/group destination uses positive fractional coordinates below `.5` or exact integers. Replacing `Math.round` with `Math.floor` at `useWorldDrag.ts:168` would therefore preserve those expectations while violating the brief and both existing canvases. Add hand-derived map/group cases that round upward, including negative coordinates; assert optimistic positions and committed positions.

- **Important — `packages/ui/test/canvas/useWorldDrag.test.tsx:237`: marquee direction is not independently pinned.** Both fixtures move diagonally with matching horizontal and vertical directions. Choosing containment using `y1 > y0` instead of the required `x1 > x0` would pass. Add right-and-up and left-and-down gestures, retaining contained and partially intersecting candidates.

Otherwise, the implementation matches the conductor’s API and specified dispatch, ledger ordering, cancellation, and leave fallback. It supports both families without family branches and preserves the moved rationale comments.

Read-only inspection only; no tests or npm commands run. Mutation results are conductor-reported, not independently verified.