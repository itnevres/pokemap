# Task 4 report: placement-version ledger

Tier: High (the async-ordering model itself; a wrong rule is silent in the UI). Tests: Claude wrote the oracle first (`packages/ui/test/shared/placementLedger.test.ts`). Implementer: Aider + Nemotron 3 Ultra (free, Opus-tier chain hop 1), one file, passed first try. Claude then edited inline (small): `dropAbsent` called `this.serverShows` (breaks when destructured) → a closure function; the snapshot was a `Record` keyed by map name (a map named `constructor` would read `Object.prototype`) → a `Map`; `moved`/`noop` created a phantom map entry for an unknown map → read-only lookup; repo quote/export style.

## Module

`packages/ui/src/shared/placementLedger.ts`: `createPlacementLedger()` returns `begin`, `moved`, `noop`, `resolve`, `snapshot`, `serverShows`, `dropAbsent`. Versions come from one counter shared by all maps. Per version: pending / acknowledged / failed / settled. A no-op waits on the map's latest still-pending moved version and takes its outcome; with none, it is settled at once. `snapshot()` copies each map's latest version and whether it was resolved. `serverShows(map, snap)`: true for a never-moved map; otherwise only when the map's latest version now is the one `snap` recorded and it was resolved then. `dropAbsent`: `serverShows` and the latest version failed or settled. No positions, no React.

Builder's choices within the spec: `dropAbsent` returns false for an acknowledged version (the spec names only failed and settled); a no-op inherits the latest in-flight POST when several are in flight.

## Tests (20)

Never-moved map; moved→ack→later GET; stale GET (issued before the ack); GET issued before the gesture began; gesture in progress; A→B→A with B in flight; late failure of v1 after v2 began; older success never resolves newer; no-op with nothing in flight; no-op during an in-flight POST that succeeds, and that fails (then dropped if absent); no-op inherits the latest of several in-flight POSTs; no-op after the POST landed; failure then a newer gesture before the rollback GET lands; failed rail drop leaves the world; acknowledged save never dropped; failed save drops only on a GET issued after the failure; group members with mixed outcomes and an unchanged member; distinct versions; a snapshot is a value.

Red run: module missing ("Failed to resolve import"), no tests ran. Green: 20/20.

## Mutations (each one alone, then restored; bytes compared)

| Mutation | Result |
|---|---|
| M1 no-op settles at once (plan step 3) | 3 failed |
| M2 `serverShows` ignores the snapshot, reads current state (plan step 3) | 6 failed |
| M3 ignore version identity: "resolved at issue" alone | 1 failed |
| M3c coordinates instead of versions (plan step 3, after spec review I1): mutation-only position data, `moved(map, v, pos)` records the target tile and the snapshot records each map's last acknowledged tile; `serverShows` is true when that equals the latest local tile. Run against the new test "A -> B -> A after an acknowledged move to A" with positions passed (scratch copy; harness `task-reports/pokemap-plan-11-canvas-leaf/mut4c.py`; M1-M5 harness `mut4.py`) | unmutated 1/1 pass; mutated 1 failed |
| M4 `dropAbsent` ignores state | 1 failed (survived first; the acknowledged-save test was added for it) |
| M5 no-op waits on the oldest in-flight POST | 1 failed |

## Reviews

- Spec (Codex gpt-6-astra, thread `01a16cdb-82b0-77c1-8df4-0db13cc10d99`): ❌, 0/1/0. I1: the coordinate mutation was substituted by M3. Accepted: added the A→B→A-after-ack test (21 tests) and ran M3c above. Model and interface judged correct and sufficient for Task 5.
- Quality (Codex gpt-6-astra, thread `01a16cdb-82b9-7f60-b877-e43da4a05c79`): Approved, 0/0/2. Minor 1 (records accumulate): kept, documented in the module (one record per gesture). Minor 2 (lifecycle preconditions implicit): documented in the module doc; no guards (caller bugs).

## Gate

First commit `a5a8cda`: 3,475 pass / 0 fail / 217 files. After the review fix: 3,476 pass / 0 fail / 217 files; typecheck and UI build pass.
