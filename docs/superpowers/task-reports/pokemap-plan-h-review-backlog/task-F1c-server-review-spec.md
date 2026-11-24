# Plan H F1c server half: spec-compliance review

Branch `plan-h-f1c-server`, diff `f96e7df...HEAD` (80f4236, 1e35bb1, c14126b, 5e45966). Read-only review: no vitest, typecheck or build was run (machine lock). The implementer's mutation table was taken as a claim. I checked each mechanism by reading the code paths, not by running them.

**Verdict: CHANGES NEEDED.** There are two Important findings. (1) The save refusal is correct in the code but no test proves it. (2) In the real UI the defect does not reach the banner for the broken map. The server behaviour itself matches the scope, and nothing from F1d creeps in harmfully.

Spec sources: row F1c (`plan-h-hardening.md:130`), the F ruling (`:81`), acceptance 1 (`:355`), D25 (`decisions.md:73`), row F1d (`:131`), and the core-half report and reviews (`task-F1c-core.md`, `task-F1c-review-core-spec.md` "Not in this diff" list: edit-session open, save, the render and map routes, banner over HTTP).

## Criterion by criterion

| Criterion | Code path | Test | Verdict |
|---|---|---|---|
| Render refused | `index.ts:160` `refuseBrokenLayout` in `cachedRender` (both map name and layout name resolve through it). The outer catch at `index.ts:1401-1402` maps `PathEscapeError` to 409 | `brokenPaths.test.ts` "render refuses..." (layout, secondary tileset, layout name) and "a broken PRIMARY tileset..." | Met. The live-session branch (`index.ts:510-516`) is unguarded, but it cannot be reached: no session can open for a broken map (see the edit-session row) |
| Map route refused | `index.ts:430` | "the map route refuses both", plus the primary case | Met |
| Edit-session open refused | `editSessions.ts:47` (before any `readFileSync`), plus the edit gate `index.ts:368-378` | "the session store itself refuses", "edit routes refuse to open a session...", `dirtyMaps()` empty | Met |
| **Save refused** | Two mechanisms. (a) The edit gate: `/api/edit/<map>/commit` and `/plan` are not in the `session\|undo\|redo\|discard` exemption, so the gate answers 409 before the route runs. (b) If the gate were gone, the commit route calls `signPlan` → `editEntryFor` → `open()`, which throws inside the `try` at `index.ts:1002-1003`. That gives a 400 `signFailure`, and nothing is written | **None.** No test calls `/commit` or `/plan` on a broken map. The report's own mutation row "edit gate removed → 1 fails" is the event/create test only | Behaviour met, **not proven** (Important 1) |
| Defect reaches the banner | The `/api/defects/<map>` route is unchanged and carries the core-half defect | "the defects route still reports..." | Met at the HTTP level only. **Not met in the app** (Important 2) |
| Nothing else blocked | The gate keys on the map's own layout and its two tilesets (`brokenComponents.ts:15-24`). It fires only for known map names | "a healthy control map still renders, loads and edits" (render, map, paint/begin, discard) | Met. Minor 3 covers one side effect on maps with an unparseable map.json |
| Project still opens | `createProjectHandler` on a copy with three broken components. Warm-up counts them as skipped (`index.ts:1440-1442`) | the whole suite's `beforeAll`, and "warm-up skips..." | Met. `/api/world` and `/api/hub/open` are not exercised on the broken copy, but neither one reads blockdata or tileset art |
| Both error types handled | `brokenPathOfLayout` reads `layout.brokenPaths`, then `project.tilesetPaths(sym).brokenPaths`, so it does not depend on the plain `Error` that `project.tileset` throws (core-review M4 / Minor 3) | broken secondary and broken primary tileset scenarios | Met |
| No F1d creep | Core readers are untouched. `blockEditRoutes.ts` is untouched. See Minor 1 for the gate's side effect on the block routes | n/a | Met, but the report wording is inaccurate (Minor 1) |

## Grep sweep (GBA server readers of blockdata or tileset art by map or layout name)

- `index.ts:162` render: guarded at :160. `:454` map route: guarded at :430. `:553` metatile: guarded at :546. `:292-293` sendSession and `:832` paint apply: these need a session, so the gate and `open()` cover them.
- `editSessions.ts:48-49`: guarded at :47.
- `index.ts:1166-1167` indicator suggestions (it feeds core `signs/suggest.ts`, an F1d reader): guarded. This only adds to F1d's core fix and does not replace it.
- `blockEditRoutes.ts:220-221,257,295` (`/api/edit/<map>/block*`): covered for the requested map by the edit gate (Minor 1). `/api/block-sheet/<map>.png` is not under `/api/edit/`, so it is ungated. For a broken tileset `context()` throws the plain `Error` from `project.tileset`, and `fail()` answers 500 INTERNAL_ERROR. Nothing outside the project is read. It is in F1d's scope (server `blockEditRoutes.ts`), so it is not an F1c defect.
- `addEventRoutes.ts:253-257` (`GET /api/event-options/<map>?x=&y=`): **not guarded and not listed in F1d** (Minor 2).
- `addEventRoutes.ts` other `store.open` calls: each one is behind `store.has(name)`, which is always false for a broken map.
- `gbcEditRoutes.ts` / GBC `store.open`: GBC family. F3 covers it, so it is out of scope here.

## Findings

### Important 1: no test proves that save is refused for a broken map

`packages/server/test/brokenPaths.test.ts` has no case for `POST /api/edit/<map>/commit` or `GET /api/edit/<map>/plan`. Row F1c names "save", and acceptance 1 says the map "cannot be rendered, edited or saved". Today the refusal holds only because `commit` is absent from the gate's exemption regex (`index.ts:371`) and because `signPlan` happens to open a session (`index.ts:249`).

Failing scenario: a later change adds `plan` to the exemption as a "read-only" route, or Plan H G/B4 makes `signPlan` plan from disk when no session is open. A commit or plan on VioletCity then passes the gate, `planSave`/`prepareSave` run against a layout whose `blockdataFilepath` is `../../outside.bin` (`write/binary.ts:57,76`, an F1d reader), and every test still passes. Today's fallback answer is also a 400 `signFailure` rather than the typed 409. That fallback is unproven too.

Fix: add a case that POSTs `/commit` with a fingerprint body and GETs `/plan` for the layout map and the tileset map. Expect 409 `broken-path` and byte-identical files afterwards. Then mutation-check it by adding `commit|plan` to the exemption regex, which must turn the test red.

### Important 2: in the real UI the defect does not reach the banner for the broken map

Row F1c says "the defect reaches the banner". The F ruling says "every map that uses it shows the defect in the banner". The server test proves only that `/api/defects/<map>` carries the defect. But the GBA UI renders `DefectsBanner` only inside `renderMap`, which needs `layout.data` (`packages/ui/src/gba/adapter.tsx:148-151`), and in context mode only when `contextLayout` is set (`:127`). `layout.data` comes from `GET /api/map/<map>`, and this PR turns that response into a 409 (`index.ts:430`). `useMapLayout` throws away the 409 body (`packages/ui/src/hooks/useMapLayout.ts:72`, `GET /api/map/${target} -> ${r.status}`), and `FamilyApp.tsx:278-279` then shows only the placeholder.

Failing scenario: the operator selects VioletCity in the copy used by the test. They see "Could not load VioletCity: GET /api/map/VioletCity -> 409". There is no banner, no file, no bad path and no fix text, which is exactly the "what to change" that D25 promises. The same happens in the warp popup (`FamilyApp.tsx:284-285`). Before this PR the placeholder said 500, so the PR does not make this worse, but the criterion is still unmet.

The F1c row lists no UI file. The fix is either a small UI change (show `defectsBanner` when `map.error` is set, or carry the 409 `defect` into the placeholder), with a live headless check per the project CLAUDE.md, or an explicit new row with this criterion recorded as open. In both cases the F1c row should not be marked done on the HTTP proof alone.

### Minor 1: the report says block-editor routes are out of scope, but the gate already refuses them for the broken map

The gate at `index.ts:370` matches `/api/edit/<map>/block`, `/block/preview` and `/block/check|apply`, and it runs before `blockEdits.handle` (`index.ts:379`). So the F1d item "server `blockEditRoutes.ts:257`" (the requested map's own blockdata read in `GET /block?x=&y=`) is already closed for the map's own layout. This is a reasonable result of "cannot be opened for editing" and not harmful creep. But the report's "Not in scope (F1d): Block-editor routes" is inaccurate, and no test covers it.

Fix: correct the report. Narrow the F1d row to what is left: `/api/block-sheet/<map>.png` (a broken tileset gives 500), and the "sharing" or other-layout readers in core `blockEdit/usage.ts`.

### Minor 2: `GET /api/event-options/<map>?x=&y=` reaches the session store for a broken map and answers an untyped 400

`addEventRoutes.ts:253-255`: `tileQuery` succeeds, then `store.open(name)` throws `PathEscapeError` (no read happens). `optionsHandler`'s catch (`addEventRoutes.ts:225`) turns it into a 400 `eventFailure` instead of the typed 409. This route is neither guarded nor listed in F1d. Failing scenario: the add-event dialog's tile probe on VioletCity shows a generic event failure instead of the broken-path defect. Fix: map `PathEscapeError` in `optionsHandler`, or list the route in F1d.

### Minor 3: the gate changes the error for a map whose map.json cannot be parsed

`index.ts:374` calls `project.map(gateName)` for every non-exempt `/api/edit/<map>/...` request. If that map's `map.json` fails to parse, the throw now reaches the outer catch and gives a 500 before routes that answered with their own typed 400 (for example `event/create` → `eventFailure`, `index.ts:397`). The map has nothing to do with broken paths, so this edges on "nothing else changed". Fix: wrap the gate's lookup in a try and fall through on error, so the route keeps its own answer.

### Minor 4: a test comment claims coverage that does not exist

`brokenPaths.test.ts:100`: "also the live-session branch and a named layout". No session is open at that point, so only the named-layout path runs. Change the comment to "a named layout". The live-session branch cannot be reached for a broken map anyway.

### Note (not a finding)

The row's verify line names `S test/{api,editSessions}.test.ts`. The tests went into a new `brokenPaths.test.ts` instead. That is acceptable, but the gate or verify run for this row should name the new file.

## Mutation evidence (reasoned, not run)

The per-guard rows in the report are consistent with the code:
- The cachedRender guard is the only render guard.
- The map guard is the only one on `/api/map`.
- Without the outer-catch mapping, the PathEscapeError routes fall to 500.
- The secondary-only mutant survives the first batch and is killed by the primary scenario.

The one gap is save (Important 1). No mutation of the gate's exemption list or of the commit path is covered.
