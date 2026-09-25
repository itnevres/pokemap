# Follow-up 3 re-review: zero-length shift drag test (commit fe509c5)

## Scope
Re-review of test-only fix addressing prior code-quality review's Important gap: no
jsdom coverage for shift tool's zero-length drag (mousedown+mouseup at same cell).

## Verified

1. **Test genuinely exercises same-cell mousedown/mouseup.** `MapCanvas.test.tsx:874-883`,
   both `fireEvent.mouseDown` and `fireEvent.mouseUp` use `{ clientX: 20, clientY: 20 }`
   (block (0,0)) — identical coordinates, true zero-length drag, not a near-miss.
2. **Assertion matches spec intent.** Asserts `editSession.applyPaint` called with
   `{ tool: "shift", dx: 0, dy: 0 }` — proves the client still calls applyPaint (does
   NOT skip it), consistent with the spec's "no client-side special case, server's own
   diff-check handles the no-op" requirement. Also asserts `beginStroke` and `endStroke`
   both fire, matching the shape of the two sibling drag tests (`:825`, `:844`).
3. **Test would catch a regression — empirically verified.** Temporarily added a guard
   in `MapCanvas.tsx` (`endActiveStroke`, shift branch) short-circuiting before
   `applyPaint` when `dx===0 && dy===0`:
   ```
   if (end.x - start.x === 0 && end.y - start.y === 0) { void editSession.endStroke(); return; }
   ```
   Ran `npx vitest run packages/ui/test/MapCanvas.test.tsx -t "zero-length drag"` →
   **failed** (timeout waiting for `applyPaint` toHaveBeenCalledWith). Reverted the
   guard (`git diff --stat` on the source file confirms zero net diff after revert).
   Confirms the test has real teeth against exactly the regression it's meant to catch.
4. **Full suite passes, no regressions.** `npx vitest run packages/ui/test/MapCanvas.test.tsx`
   → 32/32 passed, 3.05s test time, no skips beyond normal.
5. **Commit scope is test-file-only.** `git show --stat fe509c5`:
   `packages/ui/test/MapCanvas.test.tsx | 24 ++++++++++++++++++++++++` — single file,
   24 insertions, 0 deletions elsewhere. Matches commit message claim exactly.

## Issues
None.

## Assessment

**Ready to merge?** Yes

**Reasoning:** Test targets the exact cell pair the spec calls out (zero-length drag),
asserts the correct non-skipped call shape, empirically kills a hypothetical
client-side guard regression, passes cleanly alongside all 31 other MapCanvas tests,
and the commit is scoped to the single test file with no incidental changes. Closes
the Important gap from the prior code-quality review with no new gaps introduced.
