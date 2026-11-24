# Plan H I2b report (conductor C10)

Tier: High (save/discard ownership routes; B3/B4 stamping). Implementer: Sonnet subagent (verbatim move, brief in scratchpad). Reviews: two separate Opus passes (`task-I2b-spec-review.md`, `task-I2b-quality-review.md`): both PASS, 0 Critical / 0 Important. Minors applied (stale comments, wrapper comment); route-table deferral recorded as a ruling in `plan-h-hardening.md` Task I and `decisions-h-server.md`.

Move: `gbaEditRoutes.ts` (704 lines) holds `POST /api/edit/<name>/event/create` and every paint/session/undo/redo/discard/plan/commit/event/sign/Indicator route, verbatim inside a `fellThrough` IIFE. Moved text vs master differs only in `disposed` -> `ctx.disposed` and `allMapsCache = undefined` -> `ctx.allMapsCache = undefined` (accessors on `GbaEditRouteContext`), plus the two `close()` comment re-points. `index.ts` is down ~670 lines.

Gate (merged master 4108929, through the lock): vitest 5564 passed / 2 failed (known: `engine.test` real porymap.project.cfg; `gbcAddEventRoutes` commit-rebuilds-symbols 10 s timeout), 294 files; typecheck exit 0; UI build exit 0. Gate ran before the last test-only commit (saveRoutes pin); that test passes in the M0 control (139/139).

Tests added (no existing test edited): `gbaEditRoutesDisposed.test.ts` (dispose() mid-body on event/create answers 503), and one `it` in `saveRoutes.test.ts` (undo after a successful commit answers the "nothing open" shape).

Mutation checks (`mut-i2b.py`, each run through the lock):
| Mutant | Result |
|---|---|
| M0 control | 138 passed (139 with the new saveRoutes test) |
| M1 `get disposed()` -> `disposed: false` | KILLED |
| M2 `allMapsCache` setter no-op | KILLED |
| M3 `ctx.disposed` re-check off | KILLED |
| M4 pending insert not dropped on delete (B3) | KILLED (9 failed) |
| M5 owned scripts not dropped (B4) | KILLED (10 failed) |
| M6 discard keeps the session | KILLED |
| M7 commit keeps the session | SURVIVED first, then KILLED after the saveRoutes pin test |
| M8 mount removed | KILLED |
| M9 wrapper always "unhandled" | KILLED |
| M10 sign add loses `owns` | KILLED |

Follow-ups (not done): route-table conversion (trap 23); derive `GbaEditRouteContext` types from index.ts (quality review M5); live UI check not applicable (no UI change, pure server move covered by route tests).
