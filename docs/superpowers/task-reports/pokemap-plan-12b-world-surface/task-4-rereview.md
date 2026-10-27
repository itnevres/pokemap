- **ADDRESSED — Spec I1, nearest-unit rounding.** `packages/ui/test/canvas/useWorldDrag.test.tsx:235–294` asserts optimistic and committed map/group positions. Independently checked: `(50,40)/10 − (.5,.5) = (4.5,3.5) → (5,4)`; group delta `(3,1)` puts B at `(11,5)`. Negative target `(-19,-14)/10 − (.5,.5) = (-2.4,-1.9) → (-2,-2)`; delta `(0,1)` puts B at `(2,0)`. These distinguish rounding from flooring.

- **ADDRESSED — Spec I2, marquee direction.** `packages/ui/test/canvas/useWorldDrag.test.tsx:297–312` exercises right-and-up and left-and-down over world rectangle `[0,10] × [0,10]`. A is contained; B extends to `x=11` but intersects; C is outside. Expected selections `{A}` and `{A,B}` correctly distinguish horizontal from vertical direction.

- **ADDRESSED — Quality I1, unmount settlement.** `packages/ui/src/canvas/useWorldDrag.ts:274–277` invokes the latest cancellation callback on cleanup; `:261–271` restores starts, noops begun versions, and clears the gesture. Tests at `packages/ui/test/canvas/useWorldDrag.test.tsx:511–546` retain the external ledger and assert rollback and settlement for map/group unmounts plus idle cleanup.

**NEW Critical/Important breakage:** None found. Initial StrictMode effect replay encounters a null gesture; cleanup clears `dragRef` at `useWorldDrag.ts:195`, so a subsequent cancel cannot repeat rollback or settlement. Both conclusions are by inspection; dedicated replay/post-unmount-cancel tests are absent.

Read-only review; no tests or npm commands run. Fix-round mutation results are conductor-reported, not independently verified.

Re-review: all addressed