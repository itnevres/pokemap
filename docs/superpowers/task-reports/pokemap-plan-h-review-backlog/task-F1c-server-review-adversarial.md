# Plan H F1c server half: adversarial review (Opus)

Range `f96e7df...5e45966` on `plan-h-f1c-server`. Read-only review: I ran no tests, typecheck or build, as the brief required. The regex edges were checked with a `node -e` snippet. I read every changed line, every route in `index.ts`, `blockEditRoutes.ts`, `addEventRoutes.ts` (the options handler and `create`), the sidecar route list, `editSessions.open`, `project.ts` (`getTileset`/`getTilesetPaths`), `load/layouts.ts`, `load/tilesets.ts` and the UI's 409 consumers.

**Verdict: CHANGES NEEDED.** One Important finding, a test gap on the only barrier in front of a real outside read. It is cheap to close. The rest are Minor. The guard logic itself is correct: I found no request that reads outside the project or writes a broken map through a route F1c owns.

## Key facts re-derived

- **Brokenness is static for the life of a handler.** `layouts` and `tsPaths` are parsed once in `openProject` (project.ts:118,134). `brokenPaths` never changes in-process, and a hub open makes a new handler with new caches. So no session, pngCache entry or warm-up render can exist for a map that later becomes refusable. Cache poisoning is not possible, and the exempt routes (session/undo/redo/discard) only ever find `editSessions.has(broken) === false`.
- **`editSessions.open` refuses before any read and before `sessions.set`** (editSessions.ts:47 comes before :48-50 and :74), so a refusal never leaves a half-open session.
- **`brokenPathOfLayout`'s `catch { continue }`** (brokenComponents.ts:20) can only swallow `getTilesetPaths`'s unknown-symbol throw (project.ts:180-182). `canonicalTilesetPath` is a pure `posix.normalize` and does not throw. A broken tileset always has a known symbol (its `brokenPaths` lives on the `tsPaths` entry), so nothing broken is hidden. With an unknown symbol plus a broken other slot, the loop goes on to the other slot and still refuses. An unknown symbol on its own behaves as before: the later `project.tileset` throws a plain Error, giving a 500.
- **Gate regex vs route regexes.** The gate takes the first raw segment, `[^/]+`. The routes take a greedy `(.+)`. Both decode with `decodeSegment` on the same `url.pathname`, so they get the same decoded name whenever the raw name has no literal `/`. If the raw name has a `/` (`//B/...`, `B/x/...`), the route's decoded name contains `/` and fails `mapNames().includes`, giving a 404. Checked cases:
  - `%42` gates as `B`.
  - `%2e` and `.` segments are normalised by WHATWG URL before either sees them.
  - A trailing slash (`/undo/`), uppercase (`/SESSION`) and `paint%2Fbegin` all hit the gate, then no route matches, so the answer is 409 instead of 404. That is harmless.
  - The query string is not part of `pathname`.
  - The exemption needs `rest` to be exactly one of four words, and only those four routes match such a path.

  I found no bypass.
- **UI 409 handling.** No UI consumer branches on an unknown `code`:
  - `SaveDialog.tsx:145` needs `isDiffPlan(body)`. A `broken-path` body is not one, so it falls to `errorMessageFrom` and shows `defect.message`.
  - `useEditSessionCore.ts:146` wraps it in `EditSessionError` with code `"broken-path"`.
  - `useBlockEditor.ts:25` only special-cases `STALE`.
  - `useMapLayout.ts:72` throws a generic error.
  - `hub/guards.ts:87` is `/api/hub/open` only.

  Nothing mis-handles it.
- **Catch ordering.** `BodyTooLarge` comes first, then `brokenPathBody`, then `BlockEditRefusal` (index.ts:886-888). The types are disjoint. Each `const broken` sits in its own arrow-callback or catch block, so nothing is shadowed (`broken` has no outer binding in `handle`). `refuseOversize` runs before the gate, so a declared-oversize body still gets 413. A chunked oversize body to a broken map gets 409 without draining. Other early returns (404) already behave that way.

## Route inventory (GBA handler)

Legend: **G** = guarded; **G-gate** = guarded only by the `/api/edit` gate; **safe** = reachable but reads nothing outside and opens nothing; **F1d** = unguarded, listed in Plan H row F1d; **GAP** = unguarded and not in F1d.

| Route | Class | Note |
|---|---|---|
| `GET /api/edit/<map>/block` (blockEditRoutes.ts:139) | **G-gate** | Without the gate, `?x=&y=` reads `layout.blockdataFilepath` (blockEditRoutes.ts:257) **outside the project**. The gate is the only barrier, and it is untested (I1). |
| `POST /api/edit/<map>/block/preview`, `/block/check`, `/block/apply` | G-gate | They read tilesets through `project.tileset` (refuses a broken tileset). The planner is F1d. |
| `GET /api/block-sheet/<map>.png` (blockEditRoutes.ts:140) | F1d (Minor M1) | Not under `/api/edit`. Broken layout: 200 with the tileset sheet, no outside read. Broken tileset: `project.tileset` throws a plain Error, giving 500 `INTERNAL_ERROR`, not a typed 409. |
| `GET /api/event-options[/<map>[/copy|text]]` (addEventRoutes.ts:214) | safe; GAP in status only (M2) | With `?x=0&y=0`, `store.open` refuses and the error is caught as 400 `eventFailure`, not 409. Without x/y it reads map.json and scripts.inc only. |
| `POST /api/edit/<map>/event/create` | G-gate (+open) | Its inner try turns any open refusal into a 400, so the gate is what gives the 409. |
| `/api/project`, `/api/groups`, `/api/coverage`, `/api/species`, `/api/where/*`, `/api/species/*/icon.png`, `/api/encounters/*`, `/api/warps/*` | safe | No layout data, no tileset data. |
| `/api/defects/<map>` | G (core) | Reports the defect by design. |
| `/api/map/<map>` | G | index.ts:430 |
| `/api/render/<name>.png` | G | cachedRender index.ts:161. The dirty-session branch (:510-517) is unreachable for a broken map because no session can exist. |
| `/api/metatile/<layout>/<id>.png` | G | index.ts:546, before the cache. |
| `/api/world`, warm-up world list | safe | Layout dimensions and connections only. Warm-up skips a refused map (index.ts:1442). |
| sidecar: `/api/world/conflicts/accept`, `/api/world/placement`, `/api/world/dungeons`, `/api/dungeons[/<id>]` | safe | Sidecar JSON only. |
| `POST /api/edit/<map>/paint/begin|apply|end` | G-gate + open | |
| `GET /api/edit/<map>/session`; `POST …/undo`, `…/redo`, `…/discard` | exempt; safe | `has()` is false for a broken map, so each is a no-op shape. `close()` on a missing key is a no-op. |
| `GET /api/edit/<map>/plan`, `POST …/commit` | G-gate + open | Their inner try/catch would turn an open refusal into 200 / 400 `signFailure`. Only the gate gives the 409. |
| `POST /api/edit/<map>/event/move|add|delete` | G-gate + open | |
| `GET /api/indicator/<map>/suggestions` | G | index.ts:1167 (`suggestIndicatorPlacement` reads blockdata, signs/suggest.ts:79) |
| `GET /api/edit/<map>/indicator/at`, `GET …/sign/at`, `POST …/sign/put|resolve`, `POST …/indicator/add|update` | G-gate + open | The inner try gives 400 without the gate. |
| `/api/hub*` (hub.ts) | n/a | Project-level only. |

Still live through **healthy** maps, all in F1d and noted here so they are not lost:
- `GET /api/edit/<healthy map sharing a tileset with VioletCity's layout>/block?block=N`. `planGbaBlockEdit` walks every consuming layout (usage.ts:309, gbaOps.ts:91). That includes the broken layout, whose blockdata it reads at `../../outside.bin`. The gate cannot stop this, because the URL names a healthy map.
- A healthy-map save with a staged tileset edit (`blockEdit/save.ts` consumer walk).

Both are in row F1d (`blockEdit/{gbaOps,usage,save}.ts`), so they are not new gaps. They are, though, real outside reads on master today.

## Findings

### Important

**I1. The edit gate is the only barrier in front of an outside read on `GET /api/edit/<map>/block`, and no test reaches it.** index.ts:370-378 and blockEditRoutes.ts:257. Only one test reaches the gate at all (event/create, test:131). Every other edit-route test also passes without the gate, through `editSessions.open` plus the outer catch. `blockEdits.handle` does not call `editSessions.open` on GET. It calls `context()` and then `readFileSync(${root}/${blockdataFilepath})` directly. For VioletCity (broken blockdata, healthy tilesets), `GET /api/edit/VioletCity/block?x=0&y=0` reaches that read unless the gate stops it.

Surviving mutants I constructed. Each passes all 10 tests in `brokenPaths.test.ts` by inspection:
1. Move the `blockEdits.handle(...)` call (index.ts:379-384) above the gate.
2. Add `block` to the exemption: `/^(session|undo|redo|discard|block)$/`.
3. Narrow the gate to `/^\/api\/edit\/([^/]+)\/event\/create$/`. The paint tests still get 409 through the outer catch and the `.catch` mapping.

Under mutant 1 or 2, the request above performs the read, giving a 500 ENOENT, or the bytes if `%LOCALAPPDATA%\outside.bin` exists (the temp root is `%TEMP%\pokemap-gba-tileset-*`). Under mutant 3, `GET /api/edit/VioletCity/plan` also returns 200 with a `sign` refusal instead of the typed 409.

Fix: add assertions for `GET /api/edit/${LAYOUT_MAP}/block?x=0&y=0` (expect 409 `broken-path`) and `GET /api/edit/${LAYOUT_MAP}/plan` (expect 409). Optionally plant a file at the resolved outside path, so a regression shows as a wrong 200 rather than an ENOENT. Re-run mutants 1 to 3.

### Minor

**M1. `GET /api/block-sheet/<map>.png` is not gated** (blockEditRoutes.ts:140, 206; not under `/api/edit`).
- `GET /api/block-sheet/NewBarkTown_Lab.png` gives 500 `{code:"INTERNAL_ERROR"}` carrying the tileset message, not 409 `broken-path`.
- `GET /api/block-sheet/VioletCity.png` gives 200 with the tileset sheet for a map that "cannot be opened for editing".
- There is no outside read in either case.

`blockEditRoutes.ts` is in F1d. Add this route to that row explicitly, since the row names only line 257.

**M2. `/api/event-options/<map>?x=&y=` maps a refusal to 400, not 409** (addEventRoutes.ts:226, 255). `GET /api/event-options/VioletCity?x=0&y=0` gives 400 `eventFailure` with the PathEscapeError text. There is no read, but the status is untyped, and the route is not in the F1d list. Either add it to F1d or map `brokenPathBody` in `optionsHandler`'s catch.

**M3. Of the 8 new `.catch` mappings, 4 are dead and 4 are unreachable while the gate stands, so none can be killed by a test.**
- Dead: event/create (index.ts:401) and sign put/resolve (:1320); indicator add/update (:1395) and commit (:1040) are dead too. Each has an inner try that turns `editEntryFor`'s `PathEscapeError` into 400/`signFailure` before the promise rejects.
- Behind the gate: paint/apply (:887) and event move/add/delete (:1088, :1116, :1155). These would map only if the gate were bypassed.

The report's mutation table does not mention them. Either note them as defence-in-depth that tests cannot reach, or drop the four dead ones.

**M4. The gate changes the error boundary for a corrupt map.json** (index.ts:374). The gate calls `project.map(gateName)`, and its throw goes to the outer catch as a 500. Before this change, those routes caught the same failure inside their own handlers. Concrete case: `data/maps/M/map.json` holds invalid JSON. `GET /api/edit/M/plan` used to give 200 `{changes:[], refusals:[{code:"sign", message:"Unexpected token…"}], fingerprint:null}` (index.ts:981). It now gives 500 `{error}`. `POST …/sign/put` and `…/event/create` go from 400 to 500 in the same way. The UI still shows the message, so this is Minor. Fix: wrap the gate's lookup in `try { … } catch { /* let the route answer as before */ }`.

**M5. The test comment is misleading** (brokenPaths.test.ts:101). It says "also the live-session branch", but no session can exist for a broken map. The assertion hits `cachedRender` through a layout name. Reword it.

**M6. Not a defect; noting only that the outside path is never planted.** The temp root is `%TEMP%\pokemap-gba-tileset-*`, so `../../outside.bin` resolves to `%LOCALAPPDATA%\outside.bin`. Nothing is planted there, so the tests prove "refused" rather than "never read". A read regression would still fail as a 500/ENOENT, unless a file happens to exist at that path. Planting a sentinel there (and removing it) would make I1's new test say "never read" directly. Cleanup: the tests write only inside the temp copy, the control map's session is discarded, and `removeGbaTemp` removes the whole directory. That is clean.

## Mutation evidence check

I accept the 12 mutants in the report as stated. They match what the tests can reach: the outer catch is reached by render, map, metatile and suggestions; `open` by the two direct store tests; warm-up by the skipped count. Survivors not in the report: I1 mutants 1 to 3, and every M3 catch mapping.
