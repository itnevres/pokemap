# Plan 4 row 6b: CLI start-up (lazy imports)

Tier: Medium (CLI refactor; the CLI spawn tests and a new import-list guard catch a wrong answer automatically). Implementer: `chain.py --tier sonnet --no-codex`, DeepSeek V4.1 Flash hop (`0d13539`); `context.ts` follow-up by the orchestrator (about 6 lines). Review: one combined pass (Nemotron Ultra via `ask.py`; Gemini returned 503), no real findings (it raised module-load order on error paths and `family.js` staying static; neither changes output, and `family.js` is light by measurement).

## What the 6a numbers asked for

6a finding 1: `pokemap render` pays about 350 ms for tsx plus the eager import graph of every command. Findings 2 and 3 (GBA cold tile decode, world stitch) are inside the render and the hub, already under their targets; finding 4 (persistent render cache) was not asked for by the numbers. So 6b changes only CLI start-up, and builds **no cache** (trap 12 and 13 do not apply: no cache, nothing on disk).

## Change

- `packages/cli/src/index.ts`: the only static runtime imports are `commander`, `node:fs`, `family.js`, `./context.js`, `./args.js`. Every command loads its own modules through `await import()` inside its (now async) action; GBA `render` loads `render/layout.js` and `png.js` only.
- `packages/cli/src/context.ts`: `resolveProject` is async and loads `project.js` on use, so a GBC command never loads the GBA project module.
- `packages/cli/test/lazyImports.test.ts`: guards both import lists (red on the old files, green now).

## Numbers (same machine, same session, quiet; `node packages/core/bench/cli-render.mjs --runs 7`, one fresh process per run, tsx through node)

| | before (`25fc236`) | after |
|---|---|---|
| `tsx index.ts --help` p50 | 403 ms | 223 ms |
| GBA `render` LittlerootTown, warm p50 | 486 ms | 297-318 ms (three runs) |
| GBC `render` NewBarkTown, warm p50 | 480 ms | 362-365 ms |

Floor: `tsx -e 1` alone is 230-240 ms on this machine in the quiet run (6a measured 347 ms under load), so tsx start plus the render path is the limit.

**Verdict.** GBA `pokemap render` sits at the 300 ms target (297-318 ms; noise is as big as the gap). GBC does not meet it (about 365 ms): the GBC render pulls in the whole `gbcCommands.js` graph. The only larger step is a prebuilt bundle of the CLI (no tsx), which depends on Plan H Task P3 (core resolution) and is not done here. Note for the plan's target text: under 300 ms through `tsx` is reachable for GBA only barely and not for GBC.

## Evidence

- `npx vitest run packages/cli --no-file-parallelism` through the lock: 8 files, 93 tests pass.
- Typecheck and the full gate: see the PR body.
