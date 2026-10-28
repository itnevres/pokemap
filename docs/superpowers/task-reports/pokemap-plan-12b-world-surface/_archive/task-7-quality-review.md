**Verdict: Approved with fixes.**

Critical: None found.

Important:
- `packages/ui/src/canvas/WorldSurface.tsx:215`: The pending jump fits a captured placement without rechecking the current target, filter, or world. Queue a jump with a zero-sized viewport, then exclude that map before measurement: the pending fit overrides the filter fit and centres an undrawn map. A placement update likewise leaves stale coordinates. Store the pending map/token, resolve its current placement, and revalidate scope before fitting. Add regression coverage for these transitions.

Minor:
- `packages/ui/test/gbc/GbcWorldCanvas.test.tsx:1994`: The rebased F-shortcut test starts already fitted at 31%. Removing the F handler now leaves every assertion passing. Perturb zoom/pan before pressing F and assert restoration.

The ledger keep rule and pre-updater snapshot ownership are preserved. Adapter recreation does not remount the world hook or unnecessarily refetch cached data. Compatibility exports have test consumers. No new family branching was found.

Read-only review; no tests, typecheck, or builds run. Conductor results remain supplied evidence.