# D3 server/core quality review — `90aff21`

Scope: read-only review of the checkpoint diff and `task-D3-server-spec.md`. No tests were run and no live source tree was inspected.

## Finding

### P1 — The corpus-writing tests can leave `.pokemap/dungeons.json` changed when they fail

`packages/server/test/gbcRoutes.test.ts` lines 883–921: the roundtrip test snapshots the file before entering `try`, but its `finally` restores it only when `written` has been assigned and the file still exists. `written` is assigned after the first POST and after its status assertion. If that POST writes the sidecar and then returns an unexpected status (or the assertion fails for any other reason before `written = readFileSync(path)`), cleanup skips restoration. If the file existed before but disappears during the test, the `existsSync(path)` guard likewise prevents restoration. Lines 924–938: the invalid-body test takes a snapshot but has no `finally`; a regression that accepts one of those bodies writes to the same real corpus sidecar, then fails an assertion and leaves the write behind. This defeats the checkpoint's exact-byte restoration requirement precisely on failure paths, where cleanup matters most.

Keep a single unconditional snapshot-based `finally` around every test that can reach a write: restore the original bytes whenever they differ or the file is missing; if it was absent, remove only the created dungeons file; then remove the newly created `.pokemap` directory only when empty. Do not gate restoration on a successful response or intermediate `written` assignment.

## Other quality observations

- The four dungeon operations and warp GET are grouped in the GBC handler with explicit method checks and name/body validation before project lookup or writes. They use the existing `readDungeons`/`writeDungeons` functions, so the sidecar path and response shapes stay aligned with the GBA implementation.
- The synthetic traversal case independently exercises direction, a hidden intermediate map, a cycle, and seed inclusion. The warp route test has literal corpus anchors for a positive 1-based destination and an unresolved `-1` destination, in addition to comparing the route with its payload builder.
- The diff changes only `nearWarpAdapters.ts`, `gbcRoutes.ts`, and `gbcRoutes.test.ts`. No GBA route or test file is changed. The only shared-core addition is a new GBC traversal export; the existing GBA adapter is untouched.
- The dungeon CRUD code substantially repeats the GBA route code. That is a maintenance cost if validation or response conventions change, but extracting a shared route layer would enlarge this checkpoint and is not needed to resolve the finding above.

Verdict: **changes requested** for test cleanup. Runtime route shape and GBA surface show no separate quality blocker in this diff.
