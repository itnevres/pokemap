# Plan 7 preflight (2026-10-06)

## PokeMap

- `master` after `git pull --ff-only`: `b6141e7` (Merge PR #12, docs refresh). It contains Plan 6c's merge `a16b604` (PR #11), checked with `git merge-base --is-ancestor`. RESUME's "Git state" lists #1, #3 and #11.
- Branch `plan-7-gbc-editing` created from `b6141e7`.
- Untracked `.codex/` in the PokeMap root predates this session. It isn't ours, so leave it alone.

## Baseline at `b6141e7`

- `npm test` (one run, captured to a file): **2,202 pass / 2 fail** (130 files, 52.8 s). The 2 failures are the known local-state pair in `packages/server/test/world.test.ts`:
  - "returns placements, components, conflicts and vertical links";
  - "respects the dungeonAutoLayout flag".
  This matches RESUME's recorded baseline exactly.
- `npm run typecheck`: clean.
- `npm run build -w @pokemap/ui`: passes (index js 334.37 kB).

## External state (recorded before the baseline run, re-checked after it: unchanged)

| Repo | HEAD | `git status --porcelain` | Other |
|---|---|---|---|
| GBA subject `C:\Programming Projects\Pokemon Game\game` | `718b89f739666056655be65fad703a28a4abeb9d` | 7 lines: ` M` NavelRockZygardeChamber/map.bin, NavelRock_Fork/map.bin, layouts.json, NavelRock_Fork/map.json, NavelRock_ZygardeChamber/map.json, include/fieldmap.h; `??` docs/human-tasks-notes.md | `.pokemap/world.json` SHA-1 `b285bbf74a86b9d2fbfbeb7df6aed9624300ac3f`; `.pokemap/dungeons.json` SHA-1 `f73f9b76922330a60da53d4913790df956a86846`. Byte copies are kept in the coordinator scratchpad |
| PerfPlus `C:\Programming Projects\pokecrystal-PerfPlus` | `81ededbe311267c774b5540d8c8b381a314dc6d6` (branch `master-AS092190`) | empty (clean) | no `.pokemap` |
| pret/pokecrystal `C:\Programming Projects\Pokemon Game\refs\pokecrystal` | absent at session start | — | — |

## pret/pokecrystal (G5 second corpus)

- It was absent. With the user's go-ahead it was cloned on 2026-10-06 from `https://github.com/pret/pokecrystal`.
- HEAD `3bc8daa4173e96a7f4011dad3922eb6fa5dad5c6` (2026-10-06, Rangi, "Update hardware.inc to 6.0.0"). Status is clean.
- `.gitattributes` forces `eol=lf` on text and marks `*.blk`/`*.bin` binary, so the checkout has 0 CRLF in `maps/*.asm` despite global `core.autocrlf=true`. `maps/NewBarkTown.blk` is 90 B, both on disk and in the object store.
- It isn't yet listed in `pokemap.config.json`'s `gbc.referenceProjects`. Task 7 adds it, because the existing Plan 6 corpus tests would start iterating it and their PerfPlus-pinned counts need checking first.

## User decisions (2026-10-06)

- **U1. In-context editing:** port GBA's 6c E4 in-context editing to GBC, as a new **Task 5b** after Task 5.
- **U2. Scope:** keep Tasks 1-7 as written. Collision painting and wild signs stay excluded.
- **U3. G5 corpus:** the coordinator clones pret/pokecrystal from GitHub (done above).
