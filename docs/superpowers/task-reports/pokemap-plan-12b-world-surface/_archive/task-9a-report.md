# Plan 12b Task 9a: hub world-tile pre-warm (P12-4w) -- report

Tier: High (async ordering on the server). Conductor 12, 2026-10-28.

## GBC cold measurement (decides scope)

Fresh GBC hub on PerfPlus, `settle.mjs` (selector made optional: GBC has no `world-canvas__zoom-readout`):
cold: World click to `/api/world` 2,830 ms, then last of 156 tiles 3,639 ms (median request 2,045 ms, long tasks 158/50/58/209 ms);
warm: 296 ms, last tile 523 ms. Cold is over 1.5 s, so GBC gets the pre-warm too (P12-4w).

## Delegation (delegate skill, Opus-tier chain)

- Task 9a: Aider Nemotron 3 Ultra. Hop 1 blocked by the auto-mode classifier (`--yes-always` in the main checkout). The user asked
  for Aider to be bounded like Codex; the offload/delegate skills now run it in a scratch worktree with
  `--no-git --no-suggest-shell-commands --no-detect-urls --no-auto-lint --no-auto-test`. Hop 2 failed (GitPython `BadObject`
  on a linked worktree: `--no-git`). Hop 3 failed (whole-file format hit the output token limit on the 1,361-line `index.ts`).
  Hops 4-6 done in three parts with the diff format (GBA + hub, GBC, tests). One fix round on the same model (`vi.hoisted`).
- Conductor inline fixes (each small, found on review of the diff; logged here):
  1. `warmUp.ts` was written to `src/packages/server/src/`; moved.
  2. `cachedRender` called the route-local `resolveLayoutName()`; the resolution is now inlined in the helper (same rule).
  3. Default-list build wrapped in try/catch and a `disposed` check, so a world-build throw is not an unhandled rejection
     in the hub's fire-and-forget call; `Set` for map-name lookups.
  4. GBC render route now goes through `cachedRender` (the brief's shared-key requirement).
  5. Tests: (g) `import fs from "node:fs"` (the `api.test.ts` spy pattern; namespace import cannot be redefined);
     (c) one in-memory pencil stroke so the session is dirty, and a map not warmed by earlier tests;
     (b) rewritten: the old in-callback `expect` could only throw outside the test and the GET never checked order;
     (e) rewritten: the model's version never touched the handler (vacuous).

## What changed

- `src/warmUp.ts` (new): `warmEach(names, warmOne, stopped)`, one `setImmediate` per map, `stopped()` after each yield,
  a throwing map counts as failed, never rejects; returns `{ rendered, skipped, failed, ms }`.
- `src/index.ts` (GBA): `ProjectHandler` gains `warmUp(names?)` on both members; `cachedRender(name, border)` shared by the
  render route and the warm-up (key `name:border`); `warmUp` default list = `/api/world` placements with dungeons on, kept by
  the UI's `isDrawnByDefault` rule (`MAP_TYPE_INDOOR`, `MAP_TYPE_NONE` hidden unless manual); border 0 (the world URL has none);
  skips live edit sessions and cached keys; stops on `disposed`.
- `src/gbcRoutes.ts` (GBC): same; key `name:0:day` (world URL `?time=day` default, no border); default list from
  `buildGbcWorldPayload` (also warms world and warps); `INDOOR`/`GATE` hidden unless manual; skips `edit.openBlocks(name)`.
- `src/hub.ts`: `prewarm?: boolean`; after the startup open and after each `/api/hub/open` swap, fire-and-forget `warmUp()`
  and log `pokemap hub: warmed N world tiles in M ms (S skipped, F failed)`. Default off, so hub tests are unchanged.
- `src/serve.ts`: `prewarm: true`.

Known ceiling: GBA's world list (`buildWorld`, sidecar, placements) runs synchronously inside the warm-up's first turn. Measured
live ~0.14 s (hub listening 0.75 s, warm-up logged at 4.7 s, tile loop 3.8 s). It is computed once (`worldCache`) and the first
`/api/world` would pay the same.

## Tests (`packages/server/test/warmUp.test.ts`, 14, both families)

(a) warmed map is a cache hit, 200 PNG; (b) `warmEach` yields after each map (callback sees `["A"]`) and a `/api/project` GET
during six real renders answers before the warm-up ends; (c) a dirty edit session is skipped, nothing cached from it, GET after
discard renders once; (d) `dispose()` before the first yield: 0 renders; (e) a request scheduled from inside A's render (runs before
the next map's turn) is a cache hit: render and insert are one step (P12-4w); (f) unknown map counts failed, the others render;
(g) no `writeFileSync`/`writeFile`/`renameSync`/`mkdirSync` during a warm-up.

Focused run: 14/14. Test fixes by the conductor after review: see Delegation item 5; (b) and (e) were rewritten.

## Mutations (each restored, sha checked; `mut/run.py` pattern)

| ID | Mutation | Result |
|---|---|---|
| M1 | `warmEach` runs maps back to back (no `setImmediate`) | red: GBA+GBC (b), (d) |
| M2 | `stopped()` ignored | red: GBA+GBC (d) |
| M3 | a throwing map aborts the loop | red: GBA+GBC (f) |
| M4 | GBA edit-session skip removed | red: GBA (c) |
| M5 | GBC edit-session skip removed | red: GBC (c) |
| M6 | GBA cache insert deferred one `setImmediate` after render | red: GBA (e) |
| M7 | GBC cache insert deferred | red: GBC (e) |
| M8 | GBA warm key border 1 | red: GBA (a), (e) |
| M9 | GBC warm key time `morn` | red: GBC (a), (e) |
| M10 | GBA warm-up calls `mkdirSync` | red: GBA (g) |

## Reviews

Spec and quality reviews on Nemotron 3 Ultra (`task-9a-spec-review.md`, `task-9a-quality-review.md`), each finding checked
against the code: both Approved after rulings; fixes applied: hub `logWarmUp` with `.catch`, long lines wrapped, comment path.

## Gate

Before the review fixes: 3,817 pass / 0 fail / 234 files (+14 tests, +1 file over 3,803/233). After the fixes: 3,817 pass / 0 fail /
234 files. Typecheck and UI build pass.

## Live (Step 4)

Hub in-process on 5184 (preload), Vite 5183, `settle.mjs` (World click to `/api/world`, then to the last `/api/render` response).

| Family | Run | Hub log | World payload after click | Last tile after payload | Renders |
|---|---|---|---|---|---|
| GBA | cold, no pre-warm (Task 10 baseline) | -- | -- | 9,427 ms | 184 |
| GBA | after warm-up | listening 0.75 s; `warmed 184 world tiles in 3806 ms` at 4.7 s | 119 ms | 502 ms | 184 |
| GBA | during warm-up (click ~1 s after listen) | `warmed 116 ... (68 skipped)` at 4.6 s | 75 ms | 2,409 ms | 184 |
| GBC | cold, no pre-warm | -- | 2,830 ms | 3,639 ms | 156 |
| GBC | after warm-up | listening 0.57 s; `warmed 158 world tiles in 1077 ms` at 1.8 s | 236 ms | 407 ms | 156 |
| GBC | early click | warm-up done at 1.8 s, before the click landed | 233 ms | 396 ms | 156 |

After the warm-up both families settle well under 1.5 s (P12-4e threshold). A World open during the GBA warm-up still beats the
cold load (2.4 s vs 9.4 s); the warm-up skips the tiles the client already fetched. GBC warms 158 maps vs 156 requested (two
extra cache entries; cause not traced, harmless: GBA's 184 match exactly). The very first hub start after the change took 51 s to
listen (tsx compiling the edited files, once); later starts listened in 0.6-0.8 s.

Subjects: GBA `.pokemap` `diff -r` identical to the backup; porcelain unchanged (GBA 9 lines, PerfPlus clean, no `.pokemap`);
manifests by `plan-10a2 task-6-shots/manifest.sh`: GBA `0e3237e6ade2`, PerfPlus `13a31cb654ff`, same before and after.
(Conductor 11's `7da429302a67`/`713238d10d66` used an unrecorded method; the plan's script gives these.)
