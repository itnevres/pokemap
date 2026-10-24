# Task 4 spec review (Codex gpt-6-astra, a5a8cda)

Spec: ❌

Reviewed commit `a5a8cda`. **0 Critical, 1 Important, 0 Minor findings.** The ledger matches the specified model; the required coordinate-comparison mutation remains unproven.

**Important — Required coordinate mutation was substituted**

[task-4-report.md:23](/C:/Programming%20Projects/PokeMap/docs/superpowers/task-reports/pokemap-plan-11-canvas-leaf/task-4-report.md:23)

Task 4 Step 3 explicitly requires comparing positions instead of versions, adding a position field for that mutation. Reported M3 instead removes version identity and checks only whether the snapshot was resolved. That is a meaningful ownership mutation, but it does not demonstrate rejection of coordinate-based reconciliation.

The A→B→A test at [placementLedger.test.ts:52](/C:/Programming%20Projects/PokeMap/packages/ui/test/shared/placementLedger.test.ts:52) supplies no coordinates, and both retained snapshots record an unresolved latest version. Its stale-response assertions therefore do not independently distinguish coordinate equality from version identity.

**Concrete fix:** Run the specified coordinate mutation with mutation-only position data. Exercise a GET issued for an already-resolved version at position A, followed by newer gestures A→B→A while B remains in flight. The old GET must retain local ownership despite equal coordinates. Record the failing assertion, restore the implementation, and rerun the relevant checks. Deferring this evidence to Task 5 does not complete Task 4 Step 3.

**Model and interface assessment**

Independently derived rule: server ownership requires both the same latest version at issue and landing, and a resolved state at issue. A no-op inherits its in-flight POST’s outcome; otherwise it settles immediately. Failed/settled absent maps leave only when that same reconciliation condition holds.

The implementation follows these rules. Older outcomes do not settle newer moved gestures; snapshots preserve issue-time state; failure alone does not cause reconciliation. No concrete ledger/spec behavioral discrepancy found.

The interface is sufficient for Task 5:

- GBA group members can each retain their own gesture version.
- GBC can associate snapshots with request generations.
- A missing first-load snapshot can use an empty `mapStates`: untouched maps show server data; every versioned map retains local ownership.
- Callers can compute reconciliation decisions before state updaters, satisfying F4.
- Error display, reload issuance, and retaining local positions after failed reloads remain caller responsibilities.

**Hand-derived test audit**

All 20 existing tests have correct assertions for their exercised sequences.

| Test line | Independently derived result |
|---|---|
| 9 | Untouched map shows server. |
| 16 | Pending move stays local; post-ack snapshot permits server. |
| 25 | Pre-ack snapshot stays local after acknowledgement. |
| 35 | Snapshot predating the first gesture cannot reconcile it. |
| 46 | Unfinished gesture stays local. |
| 52 | Latest move stays local until its acknowledgement; earlier snapshots remain stale. |
| 68 | Older failure cannot resolve the newer gesture. |
| 81 | Older success cannot resolve the newer move. |
| 91 | No-op without an in-flight POST settles immediately. |
| 98 | Waiting no-op inherits success; old snapshot remains stale; later snapshots permit server. |
| 114 | Waiting no-op inherits failure and may leave if absent. |
| 126 | No-op follows the latest pending moved version. |
| 140 | No-op after POST completion settles immediately. |
| 150 | Newer gesture invalidates rollback ownership. |
| 163 | Failed absent rail drop leaves after an eligible GET. |
| 172 | Acknowledged version is excluded from failed/settled removal. |
| 182 | Pre-failure GET cannot remove the failed placement. |
| 191 | Group members reconcile independently, including an unchanged member. |
| 209 | Each gesture receives a distinct version. |
| 215 | Later resolution cannot change snapshot history. |

Every Task 4 Step 1 case is represented. The A→B→A title’s “both acks” describes its chosen ordering; the actual rule requires only the latest version to have resolved before GET issue.

M1 and M2 directly target required rules. M4 and M5 are useful additional checks. M3 is meaningful but insufficient for the explicitly required coordinate mutation.

Read-only review; no files changed. Tests, mutations, typecheck, and build were not rerun. The reported `3,475 / 0 / 217` gate was inspected, not independently verified.