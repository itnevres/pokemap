### Finding Verdicts

- **Important 1: three discard-ordering tests race the GET** - ADDRESSED. `GbcAppWorldGuard.test.tsx:98` and `:117` and `GbcAppEditing.test.tsx:44` (diff) each add `await waitFor(() => expect(calls).toContain("GET /api/map/OlivinePort"))` immediately before the comparison. `calls` is the live mutable array, so `waitFor` re-polls it. The right-hand `indexOf` can no longer be -1.
- **Minor 2: restore the GBA load-window note** - ADDRESSED. `useEditSessionCore.ts` gains a 3-line comment above `const live`. It matches `useMapLayout.ts`: the effect on `[name]` never clears `data`, so the previous map's data is served until the new fetch resolves. The seed identity then changes and `live` goes null, which wipes the paint. The file in the findings is `useEditSessionCore.ts`; the `useEditSession.ts` reference in the recommendation is loose, not a defect.

### New Breakage in the Fix Diff

None (0).
- Reversed order (GET before discard): `d > indexOf(GET) >= 0`, so `toBeLessThan` still fails. A missing discard still fails `toBeGreaterThan(-1)`.
- `<` assertions are kept and no other lines changed.
- The comment-only change has no behaviour effect.
- I did not re-run tests. The implementer reports 3 files / 28 tests passing via the Node API fallback, plus a clean typecheck.

### Out-of-Scope Observations

None.

### Verdict

**Fix round:** All findings addressed, no new Critical/Important breakage.
