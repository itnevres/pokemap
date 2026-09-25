# Plan 6b Task 1b: implementer report

Executed against `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/task-1b-spec.md`, on branch `plan-6b-gbc-app-layer`, working directly in the repo (no worktree). Builds on Task 1a (`_archive/task-1a-*.md`), whose `createGbcServer`, `ProjectInfo`, `groupNames()`, `collisionInfo()`, `outOfBoundsEventDefects`, `renderGbcMapMetatile` and `wire.ts` this task's routes call directly.

## What was built

**`packages/server/src/gbcRoutes.ts`** (additive to Task 1a's skeleton, ahead of the 501-refusal check and the final 404):

- A `mapNames` `Set<string>` built once from `proj.maps`, checked before every `proj.map()`/`proj.tileset()` call on a `:name`-style route -- `proj.map()` throws on a miss, and letting that throw reach the outer `try/catch` would turn "no such map" into a 500 instead of the required 404.
- Two separate `Map<string, Buffer>` PNG caches (`renderCache`, `metatileCache`), mirroring `index.ts`'s own `pngCache`/`iconCache` split -- keeps the render key (`name:border:time`) and the metatile key (`map:id:time`) from ever notionally colliding, and each cache key includes every input that changes its pixels (Plan 0 §7's "cache key dropped border" lesson).
- **`GET /api/groups`**: `groupOrder = proj.groupNames()`; `groups[name]` built by bucketing every map by its 1-based `group` field, then sorting each bucket by `number` (never by name).
- **`GET /api/map/:name`**: 404 on an unknown name, otherwise builds `GbcMapPayload` exactly as specced -- `map` verbatim from `proj.map()`, `layout`/`blocks` from `proj.layout(map)` (raw, no substitution), `tileset`/`metatileCount`/`collision` from `proj.tileset(map.tileset)`, `collisionInfo` filtered to only the values `ts.collision`'s four quadrants actually use (looked up in `proj.collisionInfo()`'s full 256-entry table), `events`+event-defects from `loadGbcMapEvents`, and `defects` = layout defects, then event defects, then `outOfBoundsEventDefects(map, events)`, in that order.
- **`GET /api/render/:name.png`**: `?border` (absent -> 0, else `parseBorder` -> 400 on throw, then capped against `proj.paddingWidth()` -> 400) and `?time` (absent -> `"day"`, else `parseTime` -> 400 on throw) are both validated **before** the map-name 404 -- mirrors the GBA render route's own order (`parseBorder` before `resolveLayoutName()`'s 404, `index.ts`). Then the cache-keyed `encodePng(renderGbcMap(proj, name, { border, time }))`.
- **`GET /api/metatile/:map/:id.png`**: unknown map -> 404 **first** (mirrors the GBA metatile route's own order, `index.ts`: `layoutByName` before `Number.isInteger(id)`), then a non-non-negative-integer id -> 400 (exact GBA wording, `metatile id must be a non-negative integer, got <raw>`), then `?time` (same as render), then `id >= metatileCount` -> 404 naming the tileset const and count, then the cache-keyed `encodePng(renderGbcMapMetatile(...))`.

A code comment on the render/metatile routes documents explicitly that the two GBC routes do **not** share one 404-vs-400 order -- each mirrors its own GBA counterpart's order, and the two GBA counterparts don't agree with each other either (see "Deviations" below).

**Tests** (`packages/server/test/gbcRoutes.test.ts`, inside the existing corpus-guarded suite): 17 new `it`s replacing the 2 now-outdated Task 1a placeholders (`/api/map/NewBarkTown` -> 404, `/api/groups` -> 404), covering groups (order/count/no-dup/CABLE_CLUB pin), map (NewBarkTown full payload, CeruleanCave2F defects, ElmsLab border, 404), render (byte-equality across border×time, IHDR dims, time-default, both cache-key proofs, 400s, 404) and metatile (byte-equality, time cache-key proof via inequality, MahoganyTown-vs-VioletCity, 400s, 404s).

## Commit SHA

- `602e77d` -- `feat(server): add GBC groups/map/render/metatile routes`

## Test counts

- Before this task: 1320 passing, 6 known baseline failures (Task 1a fix round 1's final state).
- After: **1337 passing**, same 6 known failures. Net **+17**: `gbcRoutes.test.ts` went from 22 to 39 `it`s (removed the 2 Task-1a placeholder tests that this task's spec explicitly says to replace, added 19 real ones).
- `--reporter=verbose` on the targeted file confirms all 39 tests, including every corpus-backed one, actually **ran** (no `skipped`) -- PerfPlus is present at `/root/pokemap-corpus/pokecrystal-PerfPlus`.

## Gate result

```
npm test 2>&1 | tee .../t1b-test-final.log
grep -E "^ FAIL " t1b-test-final.log | sort -u
```
`diff` against `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/baseline-fails.txt` is empty (matches exactly, the same 6 pre-existing failures):
```
 FAIL  packages/core/test/config/engine.test.ts > engineProfile > parses pokefirered's real porymap.project.cfg
 FAIL  packages/core/test/config/engine.test.ts > engineProfile > parses the subject repo's real porymap.project.cfg
 FAIL  packages/core/test/load/blocks.test.ts > parseBlocks > encodeBlocks is the exact inverse of parseBlocks, every layout, both files
 FAIL  packages/core/test/load/blocks.test.ts > parseBlocks > the three fields are independent -- a wrong shift moves them together
 FAIL  packages/core/test/render/layout.test.ts > renderLayout > supportsLayoutVersion survives a Porymap save that deletes layout_version keys
 FAIL  packages/server/test/world.test.ts > world api > manual is true iff the map name is a key in sidecar.manualPlacements, for every placement (Feature A)
```
`Tests 6 failed | 1337 passed (1343)` -- 1320 + 17 = 1337. ✓

`npm run typecheck` (`tsc --noEmit` on both `tsconfig.base.json` and `packages/ui/tsconfig.json`): clean, no output.

## Mutation table

Every mutation was applied to the real source (`packages/server/src/gbcRoutes.ts`), confirmed red against `gbcRoutes.test.ts --reporter=verbose`, then restored either via `sed` reversal or by overwriting from `git show HEAD:packages/server/src/gbcRoutes.ts` (saved once to a scratch file and re-diffed byte-identical after every restore); `git diff`/`git status --short` was empty after every single mutation.

| # | Mutation | Verdict | Killed by |
|---|---|---|---|
| 1 | Remove `time` from the render cache key | KILLED | 3 tests: the border×time byte-equality test, the time-default test, and the day/nite/day cache-key proof |
| 2 | Remove `border` from the render cache key | KILLED | the border×time byte-equality test; the border 0/1/0 cache-key proof |
| 3 | Remove `time` from the metatile cache key | KILLED | "the same id with time=day differs from time=nite" |
| 4 | Drop the `paddingWidth` cap (`if (false)`) | KILLED | the render 400s test -- `border=4` now reaches `renderGbcMap`'s own internal cap check, which throws and becomes a 500, not the expected 400 (defense in depth: the mutation is caught either way) |
| 5 | Sort `groups[name]` alphabetically | KILLED | the CABLE_CLUB pinned-order test |
| 6 | Drop the `collisionInfo` filter (send all 256) | KILLED | the NewBarkTown map-payload test (`collisionInfo` keys no longer equal the used-values set) |
| 7 | Apply block-0 -> border substitution to `blocks` | **SURVIVES** | nothing -- see below |
| 8 | Change `>=` to `>` in the metatile range check | KILLED | "404s: an id at exactly metatileCount" |
| 9 | Omit `outOfBoundsEventDefects` from `defects` | KILLED | the CeruleanCave2F defects test |
| 10 | Default `time` to `"nite"` | KILLED | the explicit time-default test |

**Mutation 7 is a genuine, honestly-reported gap, not an oversight.** I independently re-measured the whole real corpus (a one-off script against `openGbcProject(GBC_SUBJECT_ROOT)`, not committed) and confirmed **0 of 391 maps** have any block with `metatileId === 0` anywhere in their `.blk` data -- the same fact Task 1a's report already recorded ("The corpus has no id-0 map blocks, so 6b is unaffected"). No corpus-backed test can discriminate this mutation because there is no real input that exercises it.

I considered and rejected adding an artificial stub-based unit test for it: `createGbcServer`'s signature (`{ projectPath, port? }`, fixed since Task 1a) always calls `openGbcProject(opts.projectPath)` directly, with no injection point for a stub `GbcProject`. Building one would mean restructuring `createGbcServer` purely for this one test, which the spec doesn't ask for and which no other route in this file (or its GBA counterpart in `index.ts`) does -- every server route in this codebase is tested end-to-end over real HTTP against a real corpus, never against an injected stub project. Given that established pattern, and that the underlying fact (no id-0 blocks exist) was already independently established and accepted as a known gap in Task 1a, I left this mutation surviving and am reporting it plainly rather than claiming coverage that doesn't exist.

## Live check

Started `npx tsx packages/server/src/serve.ts --gbc` in the background (reads `pokemap.config.json`'s `gbc.projectPath`), curled one of each route, then killed the process and confirmed port 5174 was free.

```
$ npx tsx packages/server/src/serve.ts --gbc
pokemap server (gbc) on http://127.0.0.1:5174 for /root/pokemap-corpus/pokecrystal-PerfPlus

$ curl -s -o groups.json -w "status=%{http_code} size=%{size_download}\n" http://127.0.0.1:5174/api/groups
status=200 size=7968
  -> groupOrder[0] = "OLIVINE", len(groupOrder) = 26

$ curl -s -o map.json -w "status=%{http_code} size=%{size_download}\n" http://127.0.0.1:5174/api/map/NewBarkTown
status=200 size=9876
  -> map.width/height = 10/9, blocks.length = 90, tileset.constName = "TILESET_JOHTO", defects = []

$ curl -s -o render.png -w "status=%{http_code} size=%{size_download} content-type=%{content_type}\n" \
    "http://127.0.0.1:5174/api/render/NewBarkTown.png?border=1&time=nite"
status=200 size=11159 content-type=image/png
  -> first 8 bytes: 89 50 4e 47 0d 0a 1a 0a (valid PNG signature)

$ curl -s -o metatile.png -w "status=%{http_code} size=%{size_download} content-type=%{content_type}\n" \
    "http://127.0.0.1:5174/api/metatile/VioletCity/24.png?time=day"
status=200 size=132 content-type=image/png
  -> first 8 bytes: 89 50 4e 47 0d 0a 1a 0a (valid PNG signature)

$ pkill -f "packages/server/src/serve.ts --gbc"
$ pgrep -af "serve.ts"       # no match (only the shell wrapper itself, unrelated)
$ ss -ltn | grep 5174        # no output -- port free
```

## Deviations from the spec, and why

1. **The render and metatile routes deliberately do NOT share one 404-vs-400 order, despite the spec's Ground rules line "Decide the order of the 404 and 400 checks deliberately. Make it the same for both PNG routes."** The spec's own per-route table is more specific and directly contradicts that general line: for `/api/render`, it lists border-400 and time-400 as happening ("Parse ?border first... Parse ?time... **Then:** unknown map -> 404"), i.e. params before the name check; for `/api/metatile`, it lists "unknown map -> 404" as the very first bullet, before the id-400 and time-400 checks, i.e. the name check first. I re-checked this against the real GBA code (`index.ts`, my convention reference per this task's own brief): the GBA render route also validates `?border` before resolving the map name to a 404, but the GBA metatile route checks the layout name (404) before `Number.isInteger(id)` (400) -- so **the two GBA routes don't agree with each other either**, and the spec's per-route table is just describing that same GBA-inherited asymmetry for GBC's two new routes. I implemented exactly what the table specifies (each GBC route mirroring its own GBA counterpart's order), documented this reasoning in a code comment at the top of the render route, and I'm flagging the general "make it the same for both" line as inconsistent with the table it introduces -- the table is what's testable and what I built against, per "where the code and spec disagree, the code wins" applied here to the spec's own internal disagreement.
2. **Mutation 7 (block-0 substitution) survives**, with no stub-based test added. Covered in detail in the Mutation table above; not repeated here.
3. **Test count arithmetic looks unusual at first glance** (1320 -> 1337 is +17, not the file's own net +17 of `it`s, which happens to be the same number here) -- spelled out above only because the file's test count went from 22 to 39 (+17) by removing 2 stale placeholders and adding 19 new ones, and I wanted the arithmetic to be checkable rather than just asserted.

No part of the spec's routing table, payload shape, or test-pinning instructions was found to conflict with the real code once measured directly; every pinned value in this task's tests (NewBarkTown's 10x9/90-byte `.blk`/`TILESET_JOHTO`/4 warps, CeruleanCave2F's not-writable + 4 defects, ElmsLab's border 0, CABLE_CLUB's 6-map non-alphabetical order, VioletCity/MahoganyTown's roof metatile 24) was measured against the real corpus files in this session, not copied from the spec's prose.
