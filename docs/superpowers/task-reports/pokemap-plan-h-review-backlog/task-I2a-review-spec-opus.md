# Plan H task I2a: spec-compliance review (Opus)

Range `origin/master..7a8bfef` (2 commits: `34828ee` sidecarRoutes test, `7a8bfef` I2a). I read the diff, the pre-change `editSessions.ts`/`gbcEditSessions.ts` from `origin/master`, the new `sessionStore.ts`, every consumer of the two factories, and Plan H Task I (row I2a, traps 24-26, acceptance). I ran no vitest/typecheck, as the brief asked. The orchestrator's gate is the oracle for compile and test results.

**Verdict: PASS (spec). No Critical or Important findings. 4 Minor.**

## Behaviour re-derived from the pre-change code

| Behaviour | Before (GBA / GBC) | After (`sessionStore.ts`) | Same? |
|---|---|---|---|
| `open` cache hit | `sessions.get` then early return / `if (!entry)` | `sessions.get`, `if (!entry)` (:268-269) | yes |
| `open` insert order | `sessions.set` only after the whole entry is built, sign baselines included (GBA: after the scripts.inc loop; GBC: after the `gbcSignLabels` loop) | `sessions.set` after `openEntry` returns (:270-271). Both openers build baselines before returning (`editSessions.ts` openGbaEntry, `gbcEditSessions.ts:47-52`) | yes |
| opener throws | nothing stored. A partial entry is never visible, and the next open retries | same: the throw comes before `set` | yes |
| `close` | `sessions.delete` | `:48` | yes |
| `has` | `sessions.has` | `:49` | yes |
| `dirty` | filter `session.isDirty`, map name, `.sort()` (default string sort). GBA iterates `sessions.entries()` and GBC iterates `[...sessions]`, which are identical | `:50` | yes |
| `closeAll` | `sessions.clear()` | `:51` | yes |
| `entries` | a fresh array `[...sessions.entries()]` in insertion order. The entries inside are shared references | `:52` | yes |
| `root` | captured once at store creation (`project.paths.root` / `proj.root`), a plain mutable property | passed as an argument at creation (`editSessions.ts` `createEditSessionStore`, `gbcEditSessions.ts:55`), stored as a property | yes |
| trap 24 | `project.map(mapName)` called inside `open` on every cache miss, never memoized | the first statement of `openGbaEntry`, called through the closure on every miss. The store never sees the map | yes |

The openers are verbatim moves. The only change is `entry` becoming a `const` with an explicit type, and the `originalMap` aliasing comment is kept whole. The interface's `E extends { session: { isDirty: boolean } }` constraint is the only new type surface. I found no behaviour change.

## Trap 25 (consumers "follow the store")

`blockEditOwnership.ts:74` `BlockEditStore`, `blockEditRoutes.ts:214,312`, `addEventRoutes.ts:30-31`, `index.ts:214`, `gbcEditRoutes.ts:97` all derive the type from `ReturnType<typeof createXStore>`, which is now the explicit `SessionStore<SessionEntry>` / `SessionStore<GbcSessionEntry>`. That is structurally the same as the old inferred object type: `open` still returns the concrete family entry, and `entries()` still returns `[string, Entry][]`. So the union is no looser than before. `store.open()` on the union still returns `SessionEntry | GbcSessionEntry`. `snapshotCommand` is still exported from `editSessions.ts`, so `gbcEditRoutes.ts:55` and `blockEditOwnership.ts:43` resolve unchanged. The factory names survive, so nothing moved that these files would have to follow. Leaving them untouched satisfies the trap (see m2 for the bookkeeping).

## Acceptance

- No existing test edited: the only modified test file is `sidecarRoutes.test.ts`, and that change is pure additions (an `it.each` of 6 cases from `34828ee`, not I2a; see m3). The 3 new files are additions.
- The `has` always false mutation does reach both families' existing tests, by reading:
  - GBA: `editSessions.test.ts:55` and `saveFingerprint.test.ts:105`, plus the `has` gates at `index.ts:494,898,906,916,1146,1409`.
  - GBC: `gbcSaveFingerprint.test.ts:91,125,140,154` (`expect(store.has(map)).toBe(true)`), plus the `has` gates at `gbcEditRoutes.ts:402,408,422,502,550`.
  - Shared helper: `blockEditRoutesSuite.ts:1693,1742` (`toBe(hadSession)` after a session exists).

  I did not re-run it (forbidden by the brief).
- The trap 24 guard test (`editSessionsReopenMap.test.ts:11-29`) kills "cache the map in the store" because it requires `calls` to have length 2 after close plus reopen, and `second.session.map` to be `calls[1]`. The end-to-end wiring is still covered by the existing `mapCacheAfterSave.test.ts:136`.

## Findings

### Minor

**m1. Rationale lost in the move, and two comments in `index.ts` now point at code that is gone.**
- Comment lines: 53+24 = 77 before, 37+15+20 = 72 after. Some of that is the expected dedupe of the twin GBC block.
- Unique GBA rationale was dropped, not moved:
  - "`close()` is what actually enforces I6 in spirit", the old GBA doc block.
  - The "`worldCache`/`coverageCache` shape, except a session is genuinely mutable, not memoizing" contrast.
  - The `(Plan 6c A1)` and `/api/hub/open` provenance on `dirty`/`closeAll`.
  - `closeAll`'s "called on a handler that is about to be replaced or torn down".
- Dangling pointers:
  - `packages/server/src/index.ts:932-934` reads "editSessions.ts's own close() already does exactly this (sessions.delete(mapName))".
  - `index.ts:949-950` reads "matching close()'s own 'always safe to drop' doc comment".

  `editSessions.ts` no longer has a `close()`, and `sessionStore.ts` has no doc comment on `close` (the reasoning sits in the file header, `sessionStore.ts:8-12`).
- Failure scenario: a maintainer following `index.ts:932` to `editSessions.ts` finds no `close`, and nothing ties discard to I6 any more.
- Fix: put the I6 sentence and the Plan 6c A1 / `/api/hub/open` provenance back into `sessionStore.ts`, either in the header or as a one-line doc on `close`. Re-point the two `index.ts` comments when I2b moves those routes (`index.ts` is held for F4, so leaving it now is reasonable). Trap 26 asks for exactly this check.

**m2. The spec row lists `blockEditOwnership.ts` and `gbcEditRoutes.ts` as "modify", but both are untouched.** This is justified above (structurally identical types, factory names kept), and `task-I2a-report.md:15` records it. Optional tightening: write `BlockEditStore` as `SessionStore<SessionEntry> | SessionStore<GbcSessionEntry>` (`blockEditOwnership.ts:74`) so the dependency names the store, not the factories. There is no behaviour or type-safety failure today.

**m3. Out-of-scope commit on the branch.** `34828ee` adds 6 `sidecarRoutes.test.ts` cases (an H-b Opus quality review fix) under the I2a branch. That does not breach "no test edited", but the ledger's test-count delta must attribute these 6 cases to H-b, or the "count unchanged except additions" check gets muddied.

**m4. The report's evidence is incomplete.**
- The `## Gate` section of `task-I2a-report.md:21-22` is still a placeholder.
- M1 reports "9 failures across both families" with no per-family file list. That number looks low given that `has` gates about 11 GBA and GBC route paths and roughly 15 existing assertions, which suggests a subset run.
- Record which files were run and at least one failing GBC test name, so the "both families" acceptance clause is evidenced, not asserted.

## Not checked / left

- Compile (the `E` constraint against `GbcEditSession.isDirty`, which is `boolean` at `core/src/gbc/write/save.ts:109`) and the test pass/fail results: deferred to the orchestrator's gate.
- I did not re-run any mutation myself, per the brief.
