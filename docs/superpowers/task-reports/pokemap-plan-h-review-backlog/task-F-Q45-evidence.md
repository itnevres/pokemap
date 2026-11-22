# Plan H core tasks F1, F1b, F2, F3, Q4, Q5: evidence

Tiers: all High (parsing/write boundary, count oracle). Implementers: F1/F1b and F2 via Codex/inline earlier, F3 and Q4+Q5 via free OpenCode models (chain.py), review fixes inline. Reviews: separate spec and quality passes by Claude Opus (Codex astra was parked until ~03:20); findings and what was fixed or left are in `task-F1-review-*.md`, `task-F2-review-*.md`, `task-F3-review.md`, `task-Q4Q5-review.md`.

## Gate
**Gate at `c427abd` (PR tip, origin/master already merged): 5,191 pass / 1 fail / 276 files; typecheck pass, UI build pass; subjects unchanged** (`git status --porcelain` empty for both before and after). The one fail is the known `config/engine.test.ts` "parses the subject repo's real porymap.project.cfg" (96 vs 98, env; RESUME lists it as known). All run through the test lock with `--no-file-parallelism`.
An earlier run (before the last test-helper fix, 5,179 pass / 1 fail, `gbc/load/escapingPaths.test.ts` did not parse) is superseded by the line above.

## Mutation checks (one lock run each batch; sources restored with `git checkout -- packages/core/src`)
Batch 1 (applied together; each mutation turned its own tests red, 22 red in 6 files): `layouts.ts` never marks broken (7 parseLayouts cases + openProject layout case); `tilesets.ts` never marks (parseTilesetPaths case); `project.ts` getTileset refusal removed (openProject tileset case); `write/atomic.ts` guard removed (5 containment cases incl. the new throwing-io, parent-dir and win32 other-drive cases); GBC `tileset.ts` Meta / GFX / Coll / palette-map guards removed (4 separate cases); `palette.ts` guard removed (palette case); `roofs.ts` guard removed (roofs case). The `engine.test` red is the known fail.
Batch 2: `usage.ts` block-0 interior skip removed (`if (true)`): `usage.test.ts` Q5 block-0 case red. Q4: the three `danglingLayout.test.ts` cases were red before the implementation (F2 verify run) and green after.

## Known gaps (not mutation-covered)
`gbcOps.ts` confirm guard `req.blockId !== 0` (no direct test); `gbcTileUsage` raw-0 skip; `loadLayout` fallback guard in `gbc/load/map.ts:362` (a hand-built Pick without brokenPaths); hex tile labels at `gbcOps.ts:154,183,194`.
