# Task 10a tests report

Risk: **High**: independently constructed PNG/version oracles cross hub I/O,
shared caches and save/discard ownership. Scope: tests and typed throwing stub only.
Clean starting revision: `ebdb375b4f49a1ea14c80e946a8746f91fb29ed2`, branch `p14-2-t10`.
Delegate preflight (conductor): Gemini/OpenRouter credentials absent; Codex CLI absent;
native explicit `gpt-6.1-sol` implementation route selected. Budget: 30 minutes,
one implementation and at most one repair round, followed by conductor-owned separate
spec and quality reviews. Opus is unavailable; conductor uses `gpt-6-astra` for the
high-risk reviews. Report remains here as explicitly requested; no archival move.

## Cases

1. Both families: discover two maps whose grid-used ids belong to distinct metatiles
   files; render both before staging, stage both on the spied store, assert both
   renders differ, discard both through HTTP, assert both original renders return.
   Also check each edited id's metatile PNG independently: maps may share their other
   tileset half, so whole-map changes alone would not prove both owners were applied.
2. GBC: discover a metatiles file for which `gbcTilesetsForFile` returns at least two
   consts used by maps. Stage on one const; render the other map for the first time
   after staging. Discard the owner through HTTP and use the resulting render as the
   original-byte oracle. Assert staged and original differ. No alias means a loud error.
3. Both families: fetch the edited id's original PNG before staging; obtain a staged
   session payload over HTTP; assert staged PNG differs. Undo, redo and discard return
   strictly increasing numeric versions and the PNG sequence original/staged/original
   as appropriate. Also compare whole-map pre-stage/staged/post-discard render bytes.
4. Both families: fetch a save plan and fingerprint through HTTP. Successful commit
   returns 200; the next render equals the staged render and next map GET version is
   greater. Failed save appends sixteen literal `0x11` bytes to the temp metatiles file
   after the plan; commit is non-200, staged render survives, map GET version is unchanged.
   Snapshots of the metatiles and grid files are restored in `finally`.
5. Both families: map GET version equals the last session payload's numeric version
   after stage, undo, redo and discard. Also check nothing-open undo and redo payloads
   preserve that version and agree with map GET.
6. Unit: fake `[["A", { session: { tilesetEdits } }]]` entries, recording project and
   cache spy. Same Buffer identities applied twice mean one project call/cache clear
   total and unchanged version. A byte-equal but distinct Buffer increments once and
   clears again. Absent `tilesetEdits` empties the union, then another empty input is
   idempotent. Assertions also check that the applied map holds the original Buffers.

## Interpretations and boundaries

- V1's exact exported type contract is used. Stub body is exactly
  `throw new Error("not implemented (Task 10)");`; there is no real overlay logic.
- V7 says "Stage with stageTilesetPlan ... then drive HTTP". The stage return is
  ignored: V4 explicitly says it "returns no tilesetVersion". Existing `paint/begin`
  supplies the post-stage session payload without applying a second tileset edit.
  Every subsequent lifecycle operation and byte/version observation uses HTTP.
- The brief permits "edit an existing metatile that the map's grid uses" for GBA
  and a grid-used GBC block. This option avoids an appended id with no original PNG.
  Replace only that block's sixteen tile-entry bytes with another saved metatile's
  bytes, selected because its PNG in the same HTTP context differs. Expected PNGs
  are HTTP responses, never renderer/planner/overlay implementation calculations.
- The original ownership fixtures, store-factory spy pattern, HTTP request helpers,
  `buildPlan`, `appendPlan`, `NEW_METATILE` and `restoreBytes` patterns are reused.
  Shared-file finders are adapted to discover distinct files and cross-const aliases
  rather than Task 9's same-file ownership pair. `appendPlan`/literal bytes exercise
  the identity unit fixture; integration cases deliberately edit existing ids.
- V7 alias wording allows the baseline "from the hub after A discards" (also explicit
  in the task brief). Discovery may read map JSON and metatile PNGs but does not render
  map C; its first render request occurs after stage. No fresh second project is needed.
- V7 save-success permits "commit/next payload"; assert the next map GET version,
  because existing commits answer save-plan bodies rather than session bodies.
  Save failure accepts any non-200 as specified; it does not pin an unrelated error code.
- V1 unit initial version is the literal zero specified by the ruling; HTTP versions
  are compared only against earlier response numbers. Unit increment checks use +1.
- Rulings are silent on absent-corpus scheduling; preserve the ownership suite's
  `describe.skipIf` convention. If the corpus exists, every required discovery fails
  loudly when absent. No optional/fallback scan may silently skip a required case.
- Rulings are silent on fixture lifetime and discovery order: fresh temp copy/server
  per test prevents saves and cached disk state leaking into later cases; map names
  are sorted for deterministic discovery. No real subject is written.
- V8 red checks and mutations, all vitest invocations, the full gate and UI build
  are intentionally conductor-owned under the user's explicit verification restriction.
  No new dependencies, routes, fixtures, existing tests or other source files changed.

## Verification

PowerShell's `npm` resolves to a blocked `npm.ps1`; invoke the same npm script via
`npm.cmd run typecheck` instead. No test process was started.

```text
> typecheck
> tsc --noEmit -p tsconfig.base.json && tsc --noEmit -p packages/ui/tsconfig.json

Result: PASS, exit code 0.
```
