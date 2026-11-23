# Plan H L1 + L2 (deps): report

Tier: Medium (shared tooling; failures are caught by the gate). Branch `claude/plan-h-deps-l1l2`, cut from `master` `3f166b4`.

## What changed

- **L1** (`bc5ee41`): `npm audit fix`, no `--force`. Lockfile only (`undici` 7.30.2, `source-map-js` 1.2.4 and transitive bumps).
- **L2** (`04262b6` and follow-ups): `vitest` 2.1.9 -> 5.1.1, `vite` declared (`^8.3.8`) in the root and in `packages/ui/package.json` (one vite 8 is hoisted; vitest 5 refuses the old root vite 5.4.21). The old `vite-node`, `tinypool` and `esbuild` 0.21.5 are gone from the lockfile. One advisory remains: `zod` 3.25.76 (via `@modelcontextprotocol/sdk` in `packages/mcp`), out of scope.
- `vitest.config.ts`: vitest 5 removed `environmentMatchGlobs`. Two inline `projects` (`node`, `ui`/jsdom) select exactly the 283 old test files (143 + 140, none twice). `globalSetup` stays at the root and runs once; `setupFiles` is inherited.
- `testTimeout: 60_000` (and `gbaCorpus.test.ts` own limit 1_800_000 ms). Measured on master with vitest 2: `nearWarp` 6.8 s, `contracts` 6.5 s, `testRoots` 4.7 s, `gbaCorpus` 724 s, all passing there. vitest 2 never failed a synchronous test for overrunning its timeout; vitest 5 does. The tests are unchanged; only the limit moved.
- `WorldSurfaceInteraction.test.tsx`: `ReturnType<typeof vi.fn>` -> `Mock<(...args: any[]) => any>` (7 typecheck errors under vitest 5's mock types).
- `LAUNCH.md`: Node floor line (app 20.19+/22.12+; tests need 22.12+ for vitest 5).
- The `gate` skill needs no change: `--no-file-parallelism` still works.

## Gate

`Gate at 749206c: 5,455 pass / 2 fail / 284 files; typecheck pass, UI build pass; subjects unchanged.`
(run through the test lock, in a worktree with its own `npm ci` node_modules; includes `origin/master` `e32c1e6`.)

Failures, both known:
- `core/test/config/engine.test.ts` "parses the subject repo's real porymap.project.cfg": the known env fail (RESUME).
- `server/test/gbcAddEventRoutes.test.ts` "saving the header owner lets another map allocate a new flag": explicit 8 s limit, takes 10-11 s here. It fails the same way alone on master with vitest 2 (checked in a second worktree), and is listed in RESUME (14.2 gate: "8 s timeouts, also on the base alone"). Not caused by L2.

Earlier gate at `26310b9` (before merging master): 5,403 pass / 3 fail / 283 files, the third fail being a second `gbcAddEventRoutes` 8 s timeout (same flake); typecheck pass, UI build pass.

## Review

Combined spec + quality review, Sonnet `quality-reviewer` (DeepSeek free pool was capped): APPROVED, 2 Minor, both fixed. Report: `L1-L2-review.md`. Judgment calls: `decisions-plan-h-deps.md` in the overnight notes folder.

## Follow-up: lockfile fix (`plan-h-deps-lockfile`)

After #58 merged, `npm ci` failed on `master`: "Missing: @emnapi/wasi-threads@2.2.0 from lock file". The lockfile written by `npm install -D vitest vite` on this platform lacked that optional wasm-platform entry. Fix: `npm install --package-lock-only`; the diff adds only the `node_modules/@emnapi/wasi-threads` entry (11 lines, no version drift). Evidence: `npm ci --dry-run` and a real `npm ci` both pass in the worktree (through the lock). The `gate` skill text needed no flag change: `npm test -- --no-file-parallelism` is unchanged and still valid on vitest 5.
