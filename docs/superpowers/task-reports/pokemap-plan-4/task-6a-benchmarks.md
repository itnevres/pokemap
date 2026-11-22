# Plan 4 row 6a: benchmarks and measured baseline

Tier: Low (new scripts only, no core change). Implementer: Claude Haiku subagent from a full brief (delegate skill, Haiku lane). Orchestrator ran every script through the test lock.

## Scripts

`packages/core/bench/`: `lib.mjs` (shared), `cold-open.mjs`, `world.mjs`, `render-map.mjs`, `cli-render.mjs`. Run from the repo root:

```
node_modules/.bin/tsx packages/core/bench/<script>.mjs [--family gba|gbc] [--root <path>] [--runs N]
```

Each prints a `MACHINE` line and one grep-able `BENCH <name> <family> key=value ...` line per family. They read the subjects only; the CLI test writes its PNG to the OS temp folder. No dependency added.

## Machine and commit

Intel i7-11700K, 16 threads, 63.8 GB RAM, Node v24.13.0, Windows 11. Scripts at `2324dc0`, master at `c3ff0b3` underneath. Subjects: GBA `Pokemon Game/game` `590fdf303`, PerfPlus `81ededbe3`; both clean before and after (porcelain hash identical). Runs queued behind other streams' test runs; other sessions may have used CPU between lock holds, so single-digit-ms differences are noise.

## The four plan numbers

| Plan target | GBA | GBC | Verdict |
|---|---|---|---|
| Cold open under 3 s (open + stitch the world, fresh process, 3 runs) | open 12-21 ms; world 441-782 ms; total 456-803 ms; 1,209 maps, 1,020 layouts | open 12-14 ms; world 0.9 ms; total 13-15 ms; 391 maps | met, both |
| World view first paint under 2 s (core proxy: world build + render every placed map) | world build 462 ms; cold render of 186 maps 1,571 ms; warm 804 ms | world build 0.8 ms; cold render of 391 maps 626 ms; warm 413 ms; one `renderGbcWorld` at scale 8: 398 ms | cold GBA total 2.0 s is at the edge; warm is fine. Browser paint itself NOT measured |
| Pan at 60 fps (core proxy: per-tile render, 41/44 sampled maps) | cold p50 11.6, p95 40.4, max 72.5 ms; warm p50 1.4, p95 5.4 ms | cold p50 1.9, p95 6.7 ms; warm p50 0.9, p95 3.1 ms | warm within the 16.7 ms frame budget; cold GBA p95 is 2.4x over. Browser fps NOT measured |
| `pokemap render` for one map under 300 ms incl. process start (7 runs) | LittlerootTown: first 989 ms; warm p50 537, p95 813 ms | NewBarkTown: first 557 ms; warm p50 810, p95 983 ms | **missed, both** |

## Why the CLI render misses

Startup baseline (6 runs, same machine, `tsx` through cmd): `node -e 1` p50 46 ms; `tsx -e 1` p50 347 ms (max 464); `tsx packages/cli/src/index.ts --help` p50 719 ms (max 827). The render itself is 5-20 ms in process (table above). So at least 300 ms of every CLI call is tsx start-up and transpiling the module graph, and the CLI loads every command's imports at start. The GBA render (537 ms) came out under `--help` (719 ms) only because of run-to-run noise; the spread between runs is as big as the gap.

## Candidate 6b findings (do not build tonight)

1. **CLI start-up (largest, certain).** `pokemap render` pays about 350 ms for tsx plus the eager import graph. Candidates: a prebuilt bundle (Plan H Task P3 changes core resolution first), or lazy `import()` per command so `render` loads only render code. Needs the target restated: under 300 ms is not reachable through `tsx` at all (tsx alone is 347 ms).
2. **GBA cold render tail.** First render of a map has p95 40 ms and max 78 ms against 5 ms warm: tileset decode on first use. Candidate: pre-decode shared tilesets once per open (the hub's pre-warm already does this; check the CLI path and any first-pan tile in the UI).
3. **GBA world stitch is 440-780 ms** while GBC is 1 ms: `buildWorld` loads every `map.json`. Fine under the 3 s target; a candidate only if the hub's open-to-map-list path waits on it (not measured here).
4. **Persistent render cache (plan trap 12) is not asked for by these numbers.** Warm in-process renders are 1-5 ms; the cost is start-up and first decode, which a disk cache of PNGs would not remove for the CLI. Recommend leaving the cache out of 6b unless the browser run shows otherwise.

## Not measured (needs a browser)

Real first paint of the world view and 60 fps pan including fetches. The scripts cover only the core's share. A Playwright run against the hub on a free port is the follow-up.

## Verification

`npm run typecheck` through the lock: pass, before and after merging master. Full gate not run: only new files under `packages/core/bench/` changed.
