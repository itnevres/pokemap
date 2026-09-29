# Plan 6b Task 1b: spec review

Reviewed commit `602e77d` (diff vs `e3d999d`) on `plan-6b-gbc-app-layer`, against `task-1b-spec.md`, the plan's Task 1b section, and `task-1b-implementer.md`. Every corpus value was re-measured from the raw PerfPlus files. The payload and route semantics were probed live, first with a `createServer` script and then with `serve.ts --gbc`. The mutation table was re-run on HEAD, and 18 extra mutations were tried.

## Verdict: **compliant-with-fixes**

The routes do what the spec asks, and the payload is exactly right: it deep-equals the core objects for 5 maps (below). The gate is clean: the same 6 baseline failures, 1337 passing, and typecheck is clean. The implementer's mutation table reproduces exactly.

The tests are weaker than the code, though:
- Seven cheap mutations survive (R1, R2, R4, R5, R6-R10/R14, and R11/R12).
- One of the "groups" tests never touches the server.
- The spec's explicit "same order for both PNG routes" directive was not followed, and neither route's order is pinned by a test.

None of this is a behaviour bug today. Findings 1-5 must be fixed before the task closes.

## Re-measured corpus values (all match the tests)

| Value | Raw source | Measured | Test asserts |
|---|---|---|---|
| group count / order | `constants/map_constants.asm` `newgroup` lines | 26; OLIVINE (l.38) first … CHERRYGROVE (l.493) | 26, `[0]==="OLIVINE"` |
| total maps | `map_const` count | 391 | 391, no dups |
| CABLE_CLUB | l.386-392 | POKECENTER_2F, TRADE_CENTER, COLOSSEUM, TIME_CAPSULE, MOBILE_TRADE_ROOM, MOBILE_BATTLE_ROOM (group 20) | same (read from asm in test), `[19]==="CABLE_CLUB"`, non-alphabetical |
| full groups | my own asm walk → names | route `groups` deep-equals it, key order too | only CABLE_CLUB + NewBarkTown membership |
| NewBarkTown | `map_const NEW_BARK_TOWN, 10, 9`; `maps/NewBarkTown.blk` = 90 bytes; border `$05`; group 24 | 10×9, 90, raw bytes equal | same |
| NewBarkTown warps | `maps/NewBarkTown.asm:286-289` | 4; first `6, 3, ELMS_LAB, 1` | same |
| TILESET_JOHTO | `data/tilesets/johto_metatiles.bin` = 2048 B | 128 metatiles | 128 / 128 |
| CeruleanCave2F | `9, 15` → 135; `.blk` = 400 B; 6 warps, (23,7) (29,1) (19,7) outside 18×30 | not writable; `.blk` defect then 3 OOB warp defects | same |
| ElmsLab | `map_attributes ElmsLab, ELMS_LAB, $00`; `5, 6`; `.blk` 30 B | border 0, 5×6 | same |
| paddingWidth | `gfx_constants.asm:24` `MAP_CONNECTION_PADDING_WIDTH EQU 3` | 3 | `0-3`; IHDR 320×288 (b0) / 512×480 (b3) = (10+0)·32 × (9+0)·32 / (10+6)·32 × (9+6)·32 |
| roof id | `VioletCity.blk` byte 144 (x4,y7 of 20-wide) = 24; metatile 24 row 3 col 0 = tile 0x0A | 24; VioletCity and MahoganyTown both `TILESET_JOHTO` | 24 (matches 1a `render/map.test.ts:812`) |

Live sizes match the implementer's report byte for byte: groups 7968, map 9876, render b1/nite 11159, metatile 132.

## Payload check

I compared `/api/map/:name` against the core objects for NewBarkTown, CeruleanCave2F, ElmsLab, VioletCity and Route32, after a `JSON.parse(JSON.stringify(...))` round-trip:
- `map` deep-equal, with the same key set; connections are present (2, 0, 0, 3, 2);
- `events` deep-equal;
- `collision` deep-equal;
- `blocks` equal to the raw `.blk` bytes (the first w·h bytes for CeruleanCave2F), exactly w·h long;
- the top-level keys are exactly `GbcMapPayload`'s;
- `defects` order is layout → event → OOB (the CeruleanCave2F text is verbatim above).

No `GbcMap` field is lost or renamed: the type is all strings, numbers and arrays, so nothing is JSON-lossy. `collisionInfo` is filtered in both directions (mutation 6 is killed).

## Route semantics (live probes)

- **Name edge cases:**
  - `/api/map/..` and `%2E%2E` normalise to `/api/` → 404;
  - `NewBarkTown/` → 404 `no map NewBarkTown/`;
  - `NewBarkTown%2Fx` → 404;
  - `New%42arkTown` → 200 (decoded, as intended);
  - `__proto__`, `constructor` and `toString` → 404, because the `Set` lookup is not fooled;
  - `/api/render/NewBarkTown.png/` and `/api/metatile/VioletCity/0.png/` → generic 404.
- **border:**
  - `?border=`, `%20` and `0x1` → 400;
  - `1001` and `99999999999999999999` → 400 (from parseBorder);
  - `4` → 400 `border 4 out of range -- must be an integer 0-3`;
  - `01` → 200, cached under key border `1`, so no duplicate entry;
  - `border=1&border=9` → the first one wins.
- **time:** `?time=`, `DAY` and `noon` → 400.
- **metatile id:**
  - `abc`, `1.5`, `-1`, `Infinity` and `%31` → 400;
  - `128` and `1e20` → 404, naming `TILESET_JOHTO (count 128)`;
  - `0x10`, `1e1`, `1.0` and `-0` → 200, because `Number()` is lenient. This is GBA parity and harmless: the cache key uses the parsed number, and `${-0}` is `"0"`.
- **Order:**
  - `/api/render/NoSuchMap.png?border=9` → **400**;
  - `/api/metatile/NoSuchMap/abc.png` → **404**;
  - `/api/metatile/NoSuchMap/0.png?time=noon` → 404.
- **Task-2 and GBA paths:**
  - `/api/world`, `/api/world/`, `/api/encounters/NewBarkTown`, `/api/where/CHIKORITA`, `/api/coverage`, `/api/species` and `/api/species/` are all still 404;
  - `/api/warps/NewBarkTown` is still 501;
  - `/api/groups/`, `/api/groupsx` and `/api/project/` → 404.
  - No new regex swallows a GBA-only or Task-2 path. The 501 regex is only reached after the four new matchers, and none of their prefixes overlap it.
- **500 reachable:** a malformed percent-escape (`%E0%A4%A`) in the name segment of all three name routes → 500 `URI malformed` (finding 7).
- **Methods:** POST, PATCH, DELETE and HEAD on `/api/map/NewBarkTown` → 200. This is GBA parity, and harmless for a read-only route. Informational only.

## Findings

1. **Important: `groupOrder` is never checked against `groupNames()` on the route, and one "groups" test cannot fail for the route.**
   - The spec's first Groups bullet is "`groupOrder` equals `openGbcProject(root).groupNames()`". The test `"groupOrder matches openGbcProject(root).groupNames(), 26 entries, starting with OLIVINE"` (`gbcRoutes.test.ts:131-135`) never calls the server. It asserts only on `expected`, so no change to `gbcRoutes.ts` can turn it red. This is a Plan 0 §7 can't-fail test.
   - The route-facing tests check only `[0]`, the length, `[19]` and NewBarkTown's index 23. Mutation R5 swaps `groupOrder[1]` and `[2]`, which relabels MAHOGANY's 7 maps as DUNGEONS and vice versa, and it **survives**.
   - **Fix:** in the route test, `expect(body.groupOrder).toEqual(openGbcProject(GBC_SUBJECT_ROOT).groupNames())`, and drop or fold the server-free test into it. Optionally, pin `groups` whole against an asm walk like the CABLE_CLUB one; I verified that the route deep-equals such a walk.

2. **Important: two cache-key inputs are not discriminated.**
   - The plan (§Task 1b, "PNG cache keys include **every** input … the tests request two values of each input") asks for two values of each input. Every render test uses only `NewBarkTown`, and every metatile test uses only id 24. So:
     - R1, render key `${border}:${time}` (name dropped): **survives**;
     - R2, metatile key `${name}:${time}` (id dropped): **survives**.
   - These are exactly Plan 0 §7's "cache key dropped border" lesson.
   - **Fix:**
     - Render `NewBarkTown` then `ElmsLab` (same border and time). Each response must equal its own `encodePng(renderGbcMap(...))`, and the two must differ; the IHDR sizes alone would do.
     - Request `/api/metatile/VioletCity/24.png?time=day` then `/25.png?time=day` (or any id whose core render differs). Each must equal its core render, and the two must differ.

3. **Important: the metatile `?time` default is untested.**
   - Mutation 10 was checked only on render. R4 (metatile `time` default → `"nite"`) **survives**: every metatile test that reaches rendering passes `?time=` explicitly.
   - **Fix:** `/api/metatile/VioletCity/24.png` with no `?time` byte-equals `encodePng(renderGbcMapMetatile(proj, "VioletCity", 24, { time: "day" }))` and not the nite render.

4. **Important: the 404-vs-400 order ignores the spec's "Make it the same for both PNG routes", and neither order is pinned.**
   - The implementer is right that the spec's table reads as render = params first and metatile = name first. They are also right that GBA's own two routes disagree: `index.ts:259` parseBorder comes before the 404 at `:282/:293`, while `:318-320` checks `layoutByName` before `isInteger`.
   - But GBA's render "order" is incidental, not a design. Its 404 lives *inside the cache-miss branch* (`index.ts:289-293`), so GBA render has no deliberate order to mirror.
   - The spec's prose is an explicit directive: "Decide … deliberately. Make it the same for both PNG routes". Its closing sentence ("The GBA metatile route checks the name before the id") points at name-first.
   - A client with a stale map name currently gets 400 from one route and 404 from the other.
   - Whichever reading wins, no test pins either order: R11 (render name-first) and R12 (metatile param-first) both **survive**.
   - The comment itself is clear and cites the right GBA lines. It sits only above the render route, though, and the metatile route has no pointer back to it.
   - **Fix (recommended):**
     - Move `if (!mapNames.has(name)) return send(404, …)` to the top of the render handler, which costs nothing with the Set.
     - Rewrite the comment as "both PNG routes resolve the map name first (404), then validate params (400), matching the GBA metatile route; the GBA render route's order is an artefact of its cache-miss branch".
     - Add tests: `/api/render/NoSuchMap.png?border=9` → 404, `/api/render/NoSuchMap.png?time=noon` → 404, `/api/metatile/NoSuchMap/abc.png` → 404.
   - If the controller instead accepts the table reading, keep the code, but add tests pinning each route's current order (`render NoSuchMap?border=9` → 400, `metatile NoSuchMap/abc` → 404) and a one-line cross-reference comment on the metatile route.

5. **Important: the payload rules beyond the spec's pinned list have no test guarding them.**
   - The spec requires "`map`: exactly the `GbcMap`, connections included", `events` from `loadGbcMapEvents`, `collision = ts.collision`, `layout = { blkPath, … }`, and `tileset = { constName, name }`. The code is correct today, as verified by the deep-equal check above, but these mutations all **survive**:
     - R6: `map.connections: []`;
     - R7: `events.objects: []`;
     - R8: `collision` reversed, which keeps the same used-value set, so the collisionInfo check stays green;
     - R9: wrong `layout.blkPath`;
     - R10: `tileset.name = constName`;
     - R14: every collisionInfo entry except the pinned first one gets the wrong `category`.
   - **Fix:** in the NewBarkTown test, with `const rt = (x) => JSON.parse(JSON.stringify(x))`:
     - `toEqual(rt(proj.map("NewBarkTown")))` for `body.map`;
     - `toEqual(rt(loadGbcMapEvents(proj.root, map).events))` for `body.events`;
     - `toEqual(rt(ts.collision))` for `body.collision`;
     - `toEqual({ blkPath: "maps/NewBarkTown.blk", width: 10, height: 9, writable: true })` for `body.layout`;
     - `toEqual({ constName: "TILESET_JOHTO", name: "TilesetJohto" })` for `body.tileset`;
     - `body.collisionInfo` `toEqual` `Object.fromEntries([...used].map(v => [String(v), info.get(v)]))`.
   - Also assert `body.map.connections.length === 2`: `attributes.asm:100` is `WEST | EAST`.

6. **Minor: mutation 7 (block-0 substitution) survives, and a cheap discriminating test does exist.**
   - The implementer's reasoning ("no injection point, a stub would need restructuring `createGbcServer`") is correct for dependency injection, but it misses module mocking.
   - A 30-line test file using `vi.mock("@pokemap/core/src/gbc/project.js", importOriginal)` wraps the **real** `openGbcProject`. It overrides only `layout()` so that NewBarkTown's block 0 has `metatileId: 0`, and then asserts `/api/map/NewBarkTown` returns `blocks[0] == { metatileId: 0 }` while `map.border === 5`.
   - I ran it. It passes on HEAD and **kills** mutation 7 (`expected { metatileId: 5 } to deeply equal { metatileId: +0 }`). No production change was needed, and it stays corpus-guarded.
   - The proof file is saved at `/tmp/claude-0/-home-user/4cae0c11-1686-58ef-8391-8711e19c1398/scratchpad/block0-vimock.test.ts.txt`.
   - The implementer stated their reason as the spec allows, so this is not a spec violation. It is worth adding, because Plan 7's painting depends on raw id 0 reaching the UI.
   - The same wrapper could override `paddingWidth: () => 2` to kill R15 (below), which is optional.

7. **Minor: a 500 is reachable from user input.**
   - `decodeURIComponent` throws `URIError` on a malformed escape: `/api/map/%E0%A4%A`, `/api/render/%E0%A4%A.png` and `/api/metatile/%E0%A4%A/0.png` all return 500 `URI malformed`.
   - GBA's `index.ts` has the same behaviour, and the spec only forbids `proj.map()` 500s, so this is Minor.
   - **Fix:** a small `decodeName(raw)` helper that returns `undefined` on a throw, with the routes answering 400 `malformed map name <raw>`. Add one test per route.

8. **Minor: `cache-control: no-cache` and the render-404 body are never asserted.**
   - The spec names the `cache-control: no-cache` header as a convention. R13 (the header dropped from render) and R16 (the render 404 body changed) both **survive**.
   - **Fix:** assert `r.headers.get("cache-control") === "no-cache"` in one render test and one metatile test, and `toEqual({ error: "no map NoSuchMap" })` in the render and metatile 404 tests.

9. **Minor (informational, no action required): R15 (`maxBorder = 3` hardcoded) survives.**
   - The single corpus has paddingWidth 3, so this is only killable with a mock; see finding 6.
   - Numeric-id leniency (`0x10`, `1e1`, `1.0`, `-0` → 200) and any-HTTP-method answering 200 are both GBA parity. Neither is a defect.

## Gate

- `npm test` → `Tests 6 failed | 1337 passed (1343)`. `grep -E "^ FAIL " | sort -u` matches `baseline-fails.txt` exactly; `diff` is empty. The log is at `/tmp/claude-0/-home-user/4cae0c11-1686-58ef-8391-8711e19c1398/scratchpad/t1b-review.log`.
- `npm run typecheck` is clean.
- `gbcRoutes.test.ts --reporter=verbose`: 39 of 39 ran, none skipped, including every corpus test.
- Live `serve.ts --gbc` run: 200/200/200/200 for the four routes, 404 NoSuchMap, 400 border=4, 404 `/api/world`, 501 warps. The server was stopped afterwards and port 5174 refuses connections.
- `git status --short` is clean apart from this report.

## Mutation table (re-run on HEAD)

Harness: `/tmp/claude-0/-home-user/4cae0c11-1686-58ef-8391-8711e19c1398/scratchpad/mut-harness.sh <id|all>`, with the mutations defined in `mutations.mjs` in the same directory. Each anchor is asserted to occur exactly once, the harness runs `gbcRoutes.test.ts`, and it restores the file from `git show HEAD:` afterwards.

| id | Mutation | Result |
|---|---|---|
| 1-10 | Implementer's table | Reproduced exactly: 1-6 and 8-10 KILLED, 7 SURVIVES |
| R3 | Metatile key drops name | KILLED (VioletCity vs MahoganyTown) |
| R17 | Cap message drops the max | KILLED |
| R18 | Metatile range message drops the const | KILLED |

**Surviving mutations:**

| id | Mutation | Finding | Re-run |
|---|---|---|---|
| 7-block0-substitution | id-0 blocks → `map.border` in `blocks` | 6 | `mut-harness.sh 7-block0-substitution` |
| R1-render-key-no-name | render key `${border}:${time}` | 2 | `mut-harness.sh R1-render-key-no-name` |
| R2-metatile-key-no-id | metatile key `${name}:${time}` | 2 | `mut-harness.sh R2-metatile-key-no-id` |
| R4-metatile-default-nite | metatile `time` default `"nite"` | 3 | `mut-harness.sh R4-metatile-default-nite` |
| R5-groupOrder-swap-1-2 | swap `groupOrder[1]`/`[2]` | 1 | `mut-harness.sh R5-groupOrder-swap-1-2` |
| R6-map-connections-dropped | `map.connections = []` | 5 | `mut-harness.sh R6-map-connections-dropped` |
| R7-events-objects-dropped | `events.objects = []` | 5 | `mut-harness.sh R7-events-objects-dropped` |
| R8-collision-reversed | `collision` reversed | 5 | `mut-harness.sh R8-collision-reversed` |
| R9-blkPath-wrong | `layout.blkPath = map.name` | 5 | `mut-harness.sh R9-blkPath-wrong` |
| R10-tileset-name-wrong | `tileset.name = constName` | 5 | `mut-harness.sh R10-tileset-name-wrong` |
| R11-render-name-check-first | render checks name before params | 4 | `mut-harness.sh R11-render-name-check-first` |
| R12-metatile-params-before-name | metatile id-400 before name-404 | 4 | `mut-harness.sh R12-metatile-params-before-name` |
| R13-no-cache-control | render drops `cache-control` | 8 | `mut-harness.sh R13-no-cache-control` |
| R14-collisionInfo-category-wrong | non-pinned entries get the wrong category | 5 | `mut-harness.sh R14-collisionInfo-category-wrong` |
| R15-paddingWidth-hardcoded | `maxBorder = 3` | 9 (accepted) | `mut-harness.sh R15-paddingWidth-hardcoded` |
| R16-render-404-body | render 404 body `nope` | 8 | `mut-harness.sh R16-render-404-body` |

Once findings 1-5 and 8 are fixed, re-running `mut-harness.sh all` should leave only 7 and R15 surviving, or only R15 if finding 6's mock test is added. For finding 4, R11 or R12 flips depending on the chosen order: the mutation that matches the new code becomes a no-op, so re-anchor it.
