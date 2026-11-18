# PokeMap: follow-ups and review backlog (roadmap Plan H)

> **Status (2026-11-13).** Task D is done. Task A is open. Task B starts with a repro: its reported symptom was fixed another way in Plan 10a2, but the ordering it names is unchanged. Task C is open and re-scoped. Tasks E-P were added on 2026-11-13 from the 2026-11-12 code review; none has started. Roadmap decisions D21-D23 (`2026-10-14-pokemap-roadmap-unified-ui.md`) place this document in the plan order as **Plan H**.
>
> **History.** Tasks A-C were found live during Plan 2's own follow-ups (2026-09-22/23), and Task D during Plan 6b (2026-09-28). Plan 2 and its follow-ups merged via [itnevres/pokemap#1](https://github.com/itnevres/pokemap/pull/1) on 2026-09-25. The file names inside Tasks A-C are the 2026-09 ones; the dated note under each heading gives the current location.

## How to run this plan

- **Tiers follow the project `CLAUDE.md`.** Each task states its tier and the trigger. A High task gets a spec and a step-level plan (`superpowers:writing-plans`) when its batch starts, then subagent-driven development with separate spec and quality reviews; this document is its scope and acceptance source. A Medium task gets one combined review. A Low task gets its checks only. This replaces the older instruction to run every task here with the full workflow.
- **Implementers and bulk reads go through the `delegate` skill.** Log hops and skips in the batch ledger under `docs/superpowers/task-reports/pokemap-plan-h-review-backlog/`.
- **One branch per batch from `master`, merged with a merge commit.** No push, PR or merge to `master` without the user.
- **Gate once per batch** for Low and Medium batches (`gate` skill: full suite, typecheck, UI build, subjects unchanged). A High task gates at its own merge. Never run two vitest processes at once.
- **Re-confirm every file:line before writing step code.** The references in Tasks E-P were checked on 2026-11-13 against `plan-14-2-block-editor` at `b0b697e`.
- **Every brief carries one verify line and real test paths** (added 2026-11-15). Server: `npm run typecheck && npx vitest run packages/server`; UI and core the same with their package. Paths the tasks below name loosely: `packages/server/test/api.test.ts`, `packages/core/test/write/corpus.test.ts`, `packages/ui/test/styles.test.ts`, `packages/ui/test/MapCanvas.test.tsx`; the scratch-root test setup from Plan 14.2 Task 0 is found from the root `vitest.config.ts`. Counts to compare against are the latest gate line in RESUME. Never two vitest processes at once.
- **Do not start a batch whose files Plan 14.2 has in flight.** Until Plan 14.2 merges to `master`, leave these alone:
  - server: `packages/server/src/{index,gbcRoutes,gbcEditRoutes,editSessions,gbcEditSessions,addEventRoutes}.ts` (`addEventRoutes` added 2026-11-17 by Plan 14.2 Task 10a's fix round);
  - core: `packages/core/src/{index,project}.ts`, `gbc/project.ts`, `config/engine.ts`, `write/save.ts`, `gbc/write/save.ts`, `load/tilesetData.ts`, `gbc/load/tileset.ts`, everything under `blockEdit/`;
  - UI: `packages/ui/src/styles.css`, `shared/{useEditSessionCore.ts,MapCanvasViewport.tsx}`, `shell/{FamilyApp.tsx,adapter.ts}`, `canvas/MapSurface.tsx`, `components/{SaveDialog,MetatilePalette,Toolbar,toolIcons,MapEditingWorkspace}.tsx`, `hooks/{useMapEditing,useEditSession,useMapLayout}.ts`, `gba/{adapter,mapSurface,worldSurface}.tsx`, `gbc/{adapter,mapSurface,worldSurface,GbcMetatilePalette,GbcMapEditing}.tsx`, `gbc/hooks/{useGbcEditSession,useGbcMap}.ts` (`MapEditingWorkspace`, `useEditSession`, `useMapLayout` and the two GBC hooks were added 2026-11-15 from the Plan 14.2 rulings addendum and the Task 10b brief).

## Batches and order

| Batch | Tasks | Tier | Earliest start | Why this grouping |
|---|---|---|---|---|
| Now | L1, M2, K5 | Low | now, beside Plan 14.2 | none of their files is in Plan 14.2; one branch, one gate |
| H1 | E, A, F | High (A Medium) | after Plan 14.2 merges | E and A share `server/src/index.ts`: one branch, separate commits. F is core-only: its own worktree, built at the same time, test runs serial |
| H2 | G, B, C | High | after H1 | G and B open with a repro that may close them. C builds on the barrier from Plan 14.2 Task 12 |
| H3 | K, H, I1, I2 | Low, Medium, Medium, High | after H2 | K first, with no other branch open (it touches about 90 sites). H and I use `http.ts` from Task E |
| H4 | J | Medium | after H3 | it edits the route files that Task I moves |
| Between plans | L2, M1, M3, O, P | Low to Medium | any time after Plan 14.2 merges, one at a time | L2 and P3 each need an otherwise idle repository |
| Before Plan 15 | N, with O | High | after a brainstorming session | Plan 15 adds a whole new view; build it on the finished layout rules |

**Batches H1-H3 finish before roadmap Plan 14A starts** (roadmap D21; order confirmed by the user 2026-11-13): Plans 14A, 14C, 15 and 17 each add hub routes and file writers in both families, and they are cheaper to build on one route shape, one session store and a contained write path. H4 and the "between plans" tasks may slip behind later plans.

## Traps and pitfalls (2026-11-15)

From the plan review of 2026-11-15, checked against `plan-14-2-block-editor` at `21bf0b9`. Line numbers move when Plan 14.2 merges; the facts do not. Each brief for a task below carries that task's traps.

**Task A**
1. **GBC has the same permanent bypass, so "check GBC" means "fix GBC".** `gbcRoutes.ts:447-455` renders live whenever `edit.openBlocks(name)` returns blocks, and `openBlocks` (`gbcEditRoutes.ts:504`) returns them for any open session, dirty or not. A2 below repeats the three tests on `packages/server/test/gbcRoutes.test.ts`.
2. **The pre-warm uses the same "session exists" test** (`index.ts:1424`, `gbcRoutes.ts:778`). Leave it: a skipped warm-up costs one late tile, and changing it widens the task.

**Task B**
3. **Step 1 passes at the hub and fails in core.** Plan 10a2 made the move route rewrite a pending insert in place (`server/src/index.ts:1114-1116`; the Indicator route does the same at `:1360-1362`), so no hub request sends a `jsonEdit` against a pending index; `applyJsonOps` (`core/src/write/save.ts:346-349`) still applies edits first and its comment (`:339-345`) calls that order intended. B1 writes the repro at both levels and the ruling is made from the core result.
3b. **A neighbouring case is reachable from the app and writes the wrong event (added 2026-11-16, from reading; not yet run).** The move route appends a `jsonEdit` with the index the UI sent (`server/src/index.ts:1111-1118`), which is an index into the session's current event list, while `applyJsonOps` applies edits to the original file text before the removals. After a pending delete of an earlier event the two index spaces differ by one, so "delete event 2, move the event now shown as 4, save" changes original event 4, not the one the user dragged. The Indicator update route refuses exactly this (`index.ts:1343`); the plain move route has no such guard. RESUME lists it as a known limit ("GBA moves after a pending deletion target the wrong original index"). B1 adds this repro as a third test at the hub; B3 fixes it (roadmap D30). GBA only: the GBC routes edit the current text (`gbcEditRoutes.ts:398-401`), so GBC has one index space.
4. **A second copy replays insert ops.** `server/src/addEventRoutes.ts:293-298` applies `insertOps` itself for the add-event preview. If B2 reorders `applyJsonOps`, that copy is checked in the same commit (the architecture audit `docs/HANDOFF.md`, finding 3, found the same duplication for script edits at `signRefresh.ts:55-60` against `save.ts:288-302`; that one is not scheduled).

**Task C**
5. **"Inside its existing loop" skips the common case.** The barrier loops `while (hasPendingEventCreates(map))` (`shared/useEditSessionCore.ts:17-21`), so a source awaited inside the loop is never awaited when no event create is pending, which is every paint-only session. The barrier awaits the registered sources unconditionally, then re-checks creates and sources until both are quiet.
6. **One registry serves every mounted surface.** `useStrokeChainRegistry` lives in `FamilyApp` (`shell/FamilyApp.tsx:102`) and GBA mounts a context workspace and a plain one on it (`gba/adapter.tsx:113-136`). Registering it under `selected` is right only because in-context editing selects the map first (`shared/useContextEditing.ts:57`); C1 adds a test for a stroke made in World-view context editing.
7. **`settled()` never rejects** (`shared/useStrokeChain.ts:70-75,113`), so acceptance 6 is a pin, not new code. The three callers that already await `strokeSettled()` (`useContextEditing.ts:62`, `shell/useWarpPopup.ts:80,88`, `FamilyApp.tsx:319`) stay as they are.

**Task E**
8. **`sendJson(res, status, body)` must not change the `send` the route modules receive.** There are three `send` closures (`index.ts:322`, `gbcRoutes.ts:387`, `hub.ts:185`) and three modules that take the caller's `(code, body)` (`addEventRoutes.ts`, `gbcEditRoutes.ts`, Plan 14.2's `blockEditRoutes.ts`). Each handler keeps a `send` closure over `sendJson`; the `Send` type does not change.
9. **A 413 needs one place to be answered.** `readBody` is called at about 25 sites whose `.catch` answers 400 or 500 (the commit route answers 400 for any error, `index.ts:1087`), so a rejected `BodyTooLarge` becomes the wrong status. Refuse by `content-length` at the top of both `handle` functions and of the hub; the streaming cap in `readBody` is the backstop for a chunked body and closes the socket.
10. **`event-options` is not in `index.ts`.** It is `addEventRoutes.ts:214-226`, shared by both families, and it already answers 400 through its own catch (`:226`). Acceptance 2's event-options case pins that; the E2 grep of `index.ts` will not list it and E2 does not edit it.
11. **`readBody` moves out of `index.ts:94`,** which `hub.ts:7`, `gbcRoutes.ts:63` and `gbcEditRoutes.ts:56` import. E1 updates those three imports; `decodeMapName` is imported by `gbcEditRoutes.ts:55` and, after Plan 14.2 Task 11, by `blockEditRoutes.ts`.

**Task F**
12. **Layout paths are not the only decomp-sourced write targets.** Tileset file paths come from the C tileset headers on GBA (`core/src/project.ts:131-135,180-181`) and from `INCBIN`/`INCLUDE` lines on GBC (`gbc/load/tileset.ts:495-520`), and Plan 14.2 writes to both. The finding's "GBC has the same gap for reads" is out of date. F2's root check covers the writes; F1b and F3 add the load-time guards.
13. **Plan 14.2 left a hole for F2 by name.** `mergeTilesetEdits` lets an absolute or `../` `TilesetFileEdit` path through (Plan 14.2 ledger, Task 8 quality re-review N1; plan Review addendum 3). F2's acceptance gains that case for both families.
14. **`insideRoot` inside `parseLayouts` fails the whole GBA project,** because the layouts are parsed once at open (`project.ts:115`). That is what acceptance 1 said. **Ruled out by the user 2026-11-16 (roadmap D25):** the project opens and the layout is marked broken. The code snippet under "Change" that makes `insideRoot` throw from `layouts.ts` is no longer the design; a brief must not quote it.
15. **D23c is not true for sidecars.** `.pokemap/world.json` and `dungeons.json` are written by plain `writeFileSync` (`core/src/world/sidecar.ts:90-93`, `world/dungeons.ts:61-64`), outside `writeFilesAtomically`. Their paths are a constant under the root, so they need no containment; F2's report must not claim every write is covered.

**Task G**
16. **This is confirmed by reading, not a suspicion.** `GET /api/map/<name>` serves `project.map(name)` (`index.ts:360`), `mapCache` has no invalidation (`core/src/project.ts:138,147-160`), the code says so itself (`index.ts:194-207`, `:1075-1083`), and LESSONS records it live ("Restart the hub before a reload check after writing to disk", Plan 10a Task 8). Expect step 1 red; budget the fix.
17. **`forgetMap` alone is not the fix.** The commit route clears `symbols`, `addEvents` and `pngCache` and nothing else (`index.ts:1069-1084`): `allMapsCache` (`:208`), `worldCache`, `encountersCache`, `coverageCache`, `speciesCache` and the project's own `encountersCache` (`project.ts:139`) keep pre-save data. G2 starts with a written inventory of which cache depends on which file (also asked for by `docs/HANDOFF.md`, finding 1) and clears only those.
18. **GBC is safe today and stops being safe later.** `loadGbcMaps` reads `constants/map_constants.asm`, `data/maps/attributes.asm`, `maps.asm` and `blocks.asm` once at open (`core/src/gbc/load/map.ts:254-257`), and `onCommit` clears render, warp and coverage caches only (`gbcRoutes.ts:352-359`). No GBC save writes those four files yet; roadmap Plan 14C and Plan 3 Tasks 2 and 8 will. G3 pins today's behaviour and records the limit.

**Task H**
19. **Two of the seven routes are not family-free.** `POST /api/dungeons` checks the seed against the project and expands it with a family function (`index.ts:784-787` `warpConnectedMapsFrom`; `gbcRoutes.ts:620` `gbcWarpConnectedMapsFrom` over the cached warps), and conflict acceptance reads `getWorld()` (`index.ts:685`). The module takes `{ root, getWorld, knownMap, expandSeed }`; the "bare temp root" test injects stubs.
20. **`GET /api/world` stays out.** GBA returns the whole sidecar (`index.ts:675`) and GBC only `{ dungeonAutoLayout }` (`gbcRoutes.ts:246`).
21. **"No test edited" can fail on wording.** The two families' 400 texts were never compared, and Task E changes the GBA placement guard first. The step plan diffs the two bodies' error strings and names any test that pins one.

**Task I**
22. **Both route lists miss routes.** I1 omits `/api/project` (`index.ts:341`), `/api/groups` (`:345`), `/api/warps/<name>` (`:576`), `/api/coverage` (`:598`), `/api/species` (`:612`) and `/api/where/<species>` (`:623`). I2 omits the three Indicator routes (`:1173`, `:1193`, `:1318`). `index.ts` is 1,467 lines now.
23. **GBC already has the target shape.** `gbcEditRoutes.ts:255-445` is a route table dispatched at `:473`. `gbaEditRoutes.ts` copies that shape; it does not invent a third.
24. **The store hides one behaviour in its construction.** The GBA store gets a project whose `map` re-parses from disk (`index.ts:213-216`), so a reopened session sees the last commit. `createSessionStore` keeps it, and I2's mutation list adds "use the cached map".
25. **Files outside the list.** `blockEditOwnership.ts:55` types `BlockEditStore` as a union of both stores and reads `entries()` (`index.ts:902,993`; `gbcEditRoutes.ts:193,388`); `gbcEditRoutes.ts:54` imports `snapshotCommand` from `editSessions.ts`. Both follow the store in I2a.
26. **A move loses comments and gains wrappers when a cheaper model does it** (LESSONS, Delegation: "Codex drops rationale comments when it moves code", "Codex invents pass-through wrappers"). The route bodies carry rulings in comments (`index.ts:194-207`); each move commit is checked with `git diff -M --stat` and a comment-line count before and after.

**Task J**
27. **The 415 breaks the server suite, not the UI suite.** Node `fetch` sends a string body as `text/plain`, and the 21 server test files post that way. J2 changes the test helpers before J3 turns the check on; the acceptance line "mocks changed only for the header" covers the UI only.
28. **`post` is the main body sender and sets no header** (`shared/useEditSessionCore.ts:74-85`; `gbc/hooks/useGbcEditSession.ts:100` wraps it). Three other sites already set one, in two spellings (`components/PokemonIndicatorDialog.tsx:121`, `components/SaveDialog.tsx:142`, `hub/guards.ts:79`).
29. **`isCrossOriginRequest` is private to `hub.ts:161`.** Step 4 needs it exported; move it to `http.ts` in E1 so J does not reopen `hub.ts`.

**Task K**
30. **`errorMessage` cannot be exported from `write/atomic.ts`.** That file imports `node:fs` and `node:crypto` (`atomic.ts:1-2`) and the UI imports core by deep path (87 import lines in 47 files), so a UI import of it breaks the Vite build. K1a creates `packages/core/src/errorMessage.ts` with no imports.
31. **`globalSetup` cannot call `setImmutableRoot`.** Vitest runs `globalSetup` (`vitest.config.ts:5`) in another process than the tests, which is why `addEvent/sources.ts:4-16` reads an environment variable. K3 calls it from a `setupFiles` entry (today the list holds only `packages/ui/test/setup.ts`).
32. **K2 covers the four named `hex` copies only.** Plan 14.2 shows GBC tile ids as `$XX` (spec, "Shell and UI"); those strings are not `0x` ids and stay.

**Tasks L, O, P**
33. **`vite` is declared nowhere** (root `package.json` has `vitest ^2.1.0`; `packages/ui/vite.config.ts:1` imports `vite` as a transitive dependency). L2 declares it in `packages/ui/package.json`, and checks `environmentMatchGlobs` (`vitest.config.ts:8`), `globalSetup` and the worker flags against the migration notes of each major version it crosses.
34. **Task O's counts are unverified.** A grep finds 25 `z-index:` matches in `styles.css`, comments included, against the 34 the task states; recount on the day. The split changes what `packages/ui/test/styles.test.ts` parses, so that test changes with it.
35. **CI without the corpora passes by skipping.** Most server suites are `describe.skipIf(!hasProject(...))` (for example `api.test.ts`, `hub.test.ts`), and LESSONS records a skipped corpus test read as a pass. P2 fetches the public corpora the way `.claude/hooks/session-start.sh` does and pins the skipped count.
36. **No import goes through the core package root on purpose.** `packages/core/src/index.ts` re-exports node-only modules. P3's `exports` map needs subpaths the UI can bundle; a single root entry breaks the UI build.

**Task N**
37. **The keyboard model is designed against keys already taken.** Tools use P R B I S C G (`components/Toolbar.tsx:15`) and K (Plan 14.2 ruling N7); F fits (`shared/useFitShortcut.ts:17`); Ctrl+Z/Y undo and redo (`Toolbar.tsx:76-81`); `+ = - _`, Enter and Escape belong to the world canvas (`canvas/WorldSurface.tsx:659-677`); Escape has capture-phase listeners (`shared/AddEventBar.tsx:50`, `shared/useWorldContext.ts:123`; LESSONS, Live Browser Verification). There is no Ctrl+S and no map-canvas selection today.

**Not scheduled, for the user:** `docs/HANDOFF.md` (architecture audit, 2026-11-15, untracked) proposes moving the module-level registries in `useEditSessionCore.ts` and `AddEventDialog.tsx` to a shell-owned instance (finding 2) and one script-edit function for preview and save (finding 3). Task C adds a third module-level registry in the same style. Recommendation: do Task C as designed, and take findings 2 and 3 only if the user asks; neither fixes a reproduced defect.

## Subtasks (2026-11-15)

One row is one implementer dispatch: one verify target, one subsystem, about five files. Run every verify command from the repo root (LESSONS, Testing: "Run `vitest` from the repo root"), after `npm run typecheck`. Tiers follow `CLAUDE.md`; the trigger is in brackets. "S" means `packages/server`, "C" `packages/core`, "U" `packages/ui`.

| Id | What | Files | Tier | Verify (`npx vitest run …`) | After |
|---|---|---|---|---|---|
| L1 | `npm audit fix`, no `--force` | `package-lock.json` | Low | the `gate` skill | - |
| M2 | Palette search label | U `src/shared/PaletteFrame.tsx`; the test that renders it (`git grep -l PaletteFrame packages/ui/test`) | Low | that test file | - |
| K5 | One instruction body | `AGENTS.md`, `CLAUDE.md` | Low | a new session shows the rules | - |
| E1 | `http.ts` and its users on the hub and GBC side | create S `src/http.ts`, S `test/http.test.ts`; modify S `src/{hub,gbcRoutes,gbcEditRoutes,blockEditRoutes}.ts` | High (hub I/O) | S `test/{http,hub,gbcRoutes,gbcEditRoutes}.test.ts` | Plan 14.2 merged |
| E2 | GBA handler: 27 decode sites, species check, placement guard, 413 | S `src/index.ts`; S `test/{api,world}.test.ts` | High (hub I/O) | S `test/{api,world,eventRoutes,paintRoutes,saveRoutes}.test.ts` | E1 |
| A1 | GBA render bypass keyed on `isDirty`, four tests | S `src/index.ts`; S `test/api.test.ts` | Medium | S `test/api.test.ts` | E2 (same file, own commit) |
| A2 | GBC twin of A1 | S `src/{gbcRoutes,gbcEditRoutes}.ts`; S `test/gbcRoutes.test.ts` | Medium | S `test/{gbcRoutes,gbcEditRoutes}.test.ts` | A1 |
| F1 | `insideRoot` as a check that reports, and `parseLayouts` marking a layout with an escaping path as broken instead of throwing (D25) | C `src/config/paths.ts`, C `src/load/layouts.ts`, the `Layout` type; C `test/config/paths.test.ts`, a layouts test under C `test/load/` | High (parsing boundary) | C `test/config` C `test/load` | - |
| F1b | GBA tileset header paths: the same mark on a tileset | C `src/project.ts`, C `src/load/tilesetData.ts`; C `test/load/` | High (parsing boundary) | C `test/load` | F1; Plan 14.2 merged |
| F1c | GBA consumers refuse a broken layout or tileset and the defect reaches the banner: render, edit-session open, save, the defects check | C `src/defects/gba.ts`, C `src/render/layout.ts`, S `src/editSessions.ts`, S `src/index.ts` (render and map routes); tests in C `test/defects/` and S `test/api.test.ts` | High (parsing boundary, save ownership) | C `test/defects` S `test/{api,editSessions}.test.ts` | F1b; E2 |
| F2 | Root check in `writeFilesAtomically`, both callers, the tileset-edit case | C `src/write/{atomic,save}.ts`, C `src/gbc/write/save.ts`; C `test/write/{atomic,preparedSave}.test.ts`, one case under C `test/blockEdit/` | High (subject writes) | C `test/write` C `test/blockEdit` | Plan 14.2 merged |
| F3 | GBC `INCBIN` paths, per the ruling | C `src/gbc/load/{map,tileset,palette,roofs,sprites}.ts`; tests under C `test/gbc/load/` | High (parsing boundary) | C `test/gbc` | F1 (ruled 2026-11-16: a defect, roadmap D25) |
| G1 | Pin test: commit, then read through every cached consumer (expect red) | new S `test/mapCacheAfterSave.test.ts` on a temp copy | High (save ownership) | that file | H1 merged |
| G2 | Cache inventory, `forgetMap`, post-commit invalidation | C `src/project.ts`, S `src/{index,signRefresh}.ts`; G1's test | High (save ownership) | S `test/{mapCacheAfterSave,saveRoutes,api}.test.ts` | G1 |
| G3 | GBC pin and recorded limit | S `test/gbcRoutes.test.ts` (one case) | High | S `test/gbcRoutes.test.ts` | G1 |
| B1 | Add-then-move repro in core and at the hub, and delete-then-move at the hub (trap 3b) | C `test/write/save.test.ts`, S `test/eventRoutes.test.ts` | High (core write path) | those two files | H1 merged |
| B2 | The reorder (roadmap D30), its comment, and the copy in the add-event preview; the full corpus gate | C `src/write/save.ts`, S `src/addEventRoutes.ts`; C `test/write/save.test.ts` | High (core write path) | C `test/write`, then the `gate` skill | B1 |
| B3 | GBA delete-then-move: translate the current index to the original one in the move route, and in the Indicator update route in place of its refusal (`index.ts:1343`); GBC needs nothing, its routes edit the current text (`gbcEditRoutes.ts:398-401`) | S `src/index.ts` (or the route module Plan H Task I leaves); S `test/{eventRoutes,indicatorRoutes}.test.ts` | High (save correctness) | S `test/{eventRoutes,indicatorRoutes,saveRoutes}.test.ts` | B1 |
| C1 | Barrier awaits stroke sources; registration in the shell | U `src/shared/useEditSessionCore.ts`, U `src/shell/FamilyApp.tsx`; U `test/shared/` and U `test/shell/` cases | High (async ordering) | U `test/shared` U `test/shell` | Plan 14.2 merged |
| C2 | Live check on scratch clones, both families, with the hub's session list read after Discard | report only | High | live report | C1 |
| K1a | `errorMessage.ts`, core and CLI call sites (17) | create C `src/errorMessage.ts`; C and CLI sources | Low | `packages/core packages/cli` | H2 merged, no other branch open |
| K1b | Server call sites (36) | S sources | Low | `packages/server` | K1a |
| K1c | UI call sites (33) | U sources | Low | `packages/ui`, UI build | K1a |
| K2 | One `hex`, one `isRecord` | create U `src/shared/format.ts`; the seven named files | Low | `packages/ui` | K1c |
| K3 | `setImmutableRoot` from a `setupFiles` entry | C `src/addEvent/sources.ts`, new C `test/helpers/immutableRootSetup.ts`, `vitest.config.ts` | Low | full suite, wall time before and after | K1a |
| K4 | Delete `VERSION` | C `src/index.ts` | Low | typecheck | - |
| H-a | `jsonBody` in `http.ts` | S `src/http.ts`, S `test/http.test.ts` | Medium | S `test/http.test.ts` | E1 |
| H-b | `sidecarRoutes.ts`, mounted by both handlers (seven routes: conflict accept, placement, auto-layout switch, dungeons list, create, patch, delete) | create S `src/sidecarRoutes.ts`, S `test/sidecarRoutes.test.ts`; modify S `src/{index,gbcRoutes}.ts` | Medium | S `test/{sidecarRoutes,world,dungeons,gbcRoutes}.test.ts` | H-a |
| I1 | `GbaRouteContext` and the read routes (the list in the task plus trap 22) | create S `src/{gbaRouteContext,gbaReadRoutes}.ts`; modify S `src/index.ts` | Medium | `packages/server` | H-b |
| I2a | `createSessionStore` in place of both stores | create S `src/sessionStore.ts`; modify S `src/{editSessions,gbcEditSessions,blockEditOwnership,gbcEditRoutes}.ts` | High (save and discard ownership) | S `test/{editSessions,blockEditOwnership,gbcEditRoutes,saveRoutes}.test.ts` | I1 |
| I2b | Edit, Indicator and sign routes to `gbaEditRoutes.ts`, as a route table | create S `src/gbaEditRoutes.ts`; modify S `src/index.ts` | High | `packages/server` | I2a |
| J1a | `postJson`; session `post`, Save, Sign and Indicator dialogs | U `src/hooks/useGuardedFetch.ts`, `shared/{useEditSessionCore,SignEditor}.ts(x)`, `components/{SaveDialog,PokemonIndicatorDialog}.tsx` | Medium | `packages/ui` | H3 merged |
| J1b | World and dungeon posts in both families; one dungeons hook | U `src/gba/worldSurface.tsx`, `gbc/worldSurface.tsx`, `hooks/useDungeons.ts`, `gbc/hooks/useGbcDungeons.ts`, `hub/guards.ts` | Medium | `packages/ui` | J1a |
| J2 | Server test helpers send `application/json` | S `test/*.test.ts` (mechanical) | Low | `packages/server` | - |
| J3 | 415 in the hub and both handlers; `createServer` runs the cross-origin check | S `src/{http,hub,index}.ts`; S `test/{hub,api}.test.ts` | Medium | `packages/server` | J1b, J2 |
| J4 | Live check, both families | report only | - | live report | J3 |
| L2 | `vitest` and `vite` upgrade | root `package.json`, `package-lock.json`, `vitest.config.ts`, U `package.json`; the `gate` skill text if the flags change | Medium | the `gate` skill, counts equal to RESUME's | nothing else in flight |
| M1 | Reduced-motion rule | U `src/styles.css`, U `test/styles.test.ts` | Low | U `test/styles.test.ts`, live | Plan 14.2 merged |
| M3 | Self-hosted fonts | U `public/fonts/*`, U `src/styles.css`, U `test/styles.test.ts` | Low | UI build, live with the network blocked | Plan 14.2 merged |
| O1 | Shadow token and z-index scale | U `src/styles.css`, U `test/styles.test.ts` | Low | U `test/styles.test.ts`, live | with Task N |
| O2 | Split the sheet by area | U `src/styles/*.css`, the import site, U `test/styles.test.ts` | Medium | U `test/styles.test.ts`, UI build, live | O1 |
| P1 | ESLint, current code passing | `eslint.config.js`, root `package.json`, lockfile | Medium | `npx eslint .` clean | idle repository |
| P2 | CI: typecheck, UI build, tests with the public corpora | `.github/workflows/ci.yml` | Medium | a green run with the skipped count printed | P1 |
| P3a | `exports` map with bundle-safe subpaths | C `package.json`, the tsconfig and Vite or vitest resolution files | Medium | typecheck, UI build, the `gate` skill | idle repository |
| P3b | Import rewrite, one package per dispatch (ui, server, cli) | sources of that package (mechanical) | Low | typecheck, that package's tests | P3a |
| P3c | GBA-only folders under `gba/` | C and U folders (moves only) | Medium | typecheck, the `gate` skill | P3b |

**Handoff points for a conductor (delegate skill, section 7):** after H1 merges; after H2 merges; after I1; after I2b.

**Decisions that are the user's.**
- **F, escaping paths. RULED by the user 2026-11-16 (roadmap D25): the project always opens, in both families.** "I don't want to ship a tool that will refuse to open a project. Let's give the operator a chance to change the breaking bug. GBA should open, but force a fix to the broken component first." So: a layout, tileset or `INCBIN` whose path leaves the project is a `DataDefect` that names the file, the key or line, the bad path and what to change. That component cannot be rendered, opened for editing or saved until it is fixed, and every map that uses it shows the defect in the banner (`core/src/defects/gba.ts`, the Plan 10b model). Nothing else in the project is blocked. This replaces acceptance 1's "refused at load" and the 2026-11-15 recommendation to accept a GBA refusal. Rows F1, F1b and F1c in the table carry it; `writeFilesAtomically`'s root check (F2) stays a hard refusal of the write.
- **B. RULED by the user 2026-11-16 (roadmap D30): fix both.** B1 still writes the three repros first, so each fix is shown red before it is green. B2 always runs: reorder `applyJsonOps` to inserts, then edits, then removals (and update its comment at `save.ts:339-345` and the copy at `addEventRoutes.ts:293-298`). B3 fixes the delete-then-move index (trap 3b) by translating the index the UI sends into the original file's index; it does not refuse the move. The Task B text below that says Step 1 may close the task without the reorder no longer applies.
- **J3, tier.** The task says Medium; a content-type refusal sits on the request boundary, which is a High trigger. Recommendation: keep Medium, because every wrong answer fails a route test once J2 is in.

**Task N cannot be broken down before its brainstorming session.** Questions that session must settle:
1. The smallest supported window width, and what gives way first below it (tree, rail, or canvas minimum). Recommendation: 1,024 px; the tree collapses to a toggle first.
2. Whether `DESIGN.md` (260 px tree, resizable 240-420) or the CSS (280 px, fixed) is right. Recommendation: the CSS; delete the resize claim unless the user wants it built.
3. The map-canvas keyboard model: a cell cursor on the arrow keys, which key applies the tool, how Rect and Shift take a second point, how pan works. Decide it with roadmap Plan 14A's capture gesture, in one interview (trap 37; roadmap "Order and overlap review").
4. Whether events can be selected and moved from the keyboard in this task. Recommendation: no; canvas painting only.
5. Whether the world canvas gains arrow-key panning to match.
6. Light theme: a toggle or deletion. Recommendation: delete the block and the `DESIGN.md:33` claim.
7. Whether the dialogs opened from the canvas (Add Event placement, Plan 14.2 Edit block) need the same cell cursor to be reachable without a mouse.

**Answered by the user 2026-11-16:** question 1, 1,024 px, the tree collapses to a toggle first; question 2, the CSS is right, delete the resize claim from `DESIGN.md`; question 6, delete the light theme block and the `DESIGN.md:33` claim. Question 3 is decided in one interview with roadmap Plan 14A and the map-canvas keyboard work is built with or just before Plan 14A (roadmap D24a); the layout and theme parts stay before Plan 15. Questions 4, 5 and 7 go to that interview.

**`docs/HANDOFF.md` (user, 2026-11-16):** its findings stay in that document and are not scheduled.

## Review findings and where each one went

Ids match the 2026-11-12 review report (S security, R refactor, U UI, P plans). The number is the report's checklist item.

| # | Finding | Task |
|---|---|---|
| 1 | S1 species icon route path traversal | E |
| 2 | S3 unbounded request body; `nosniff` | E |
| 3 | S4 GBA routes laxer than GBC | E |
| 4 | S6 `npm audit fix` (non-breaking) | L1 |
| 5 | U2 reduced motion; U6 palette search label | M1, M2 |
| 6 | R5 `errorMessage`; R7 `hex`, `isRecord` | K1, K2 |
| 7 | Stale status lines in RESUME and the roadmap | done 2026-11-13 |
| 8 | P7 `CLAUDE.md` and `AGENTS.md` duplicate each other | K5 |
| 9 | R11 dead code | K4 |
| 10 | S2 decomp-sourced paths not contained | F |
| 11 | R10 GBA map cache after a save (suspected) | G |
| 12 | R1 routes written twice | H |
| 13 | S5 POSTs sent as `text/plain`; R6 two fetch styles | J |
| 14 | P1-P5 Plan 3 and Plan 5 overlap the roadmap | done 2026-11-13 (roadmap D22) |
| 15 | S7 Google Fonts request on every launch | M3 |
| 16 | R3 two session stores; R4 paint written twice | I2; roadmap Plan 14A |
| 17 | R2 one 1,065-line request handler | I1, I2 |
| 18 | S6 `vitest` 2 → 5 | L2 |
| 19 | U1 no responsive layout; U3 map canvas is mouse-only | N |
| 20 | R8 no `gba/` folders, no public core surface | P3 |
| 21 | U4 unreachable light theme; U5 one global stylesheet | N; O |
| 22 | No lint, no CI | P1, P2 |
| - | P6 discard waits for strokes (Task C and RESUME's Plan 8 item) | C |
| - | R9 test-only cache in production code | K3 |
| - | U7 `WorldSurface.tsx` 934 lines | roadmap Plan 16 |
| - | U8 no request cancellation | not planned (see the end of this document) |

---

## Task A: `GET /plan` permanently disabling the PNG render cache

**Re-checked 2026-11-13: still open. Tier Medium** (the three tests below catch a wrong answer). The bypass is `if (editSessions.has(name))` at `packages/server/src/index.ts:429`. Run it in batch H1 on Task E's branch (same file) as its own commit. Check the GBC render route (`gbcRoutes.ts`, `renderCache`) for the same condition, and fix both or record why GBC differs. **Note 2026-11-15:** on `plan-14-2-block-editor` the bypass is at `index.ts:434`, and Plan 14.2 Task 10a changes this route: it syncs the staged tileset overlay before both the bypass and the cached path, and a change in that sync clears `pngCache`. Re-derive the snippet below after Plan 14.2 merges. Add a fourth test: a session whose only change is a staged block edit (tileset bytes, grid untouched) still renders the staged pixels. Check first whether such a session reports `isDirty`; if it does not, the fix sends it down the cached path, which is right only because the overlay sync cleared the cache.

**Root cause:** `packages/server/src/index.ts`'s `/api/edit/:name/plan` route (`planMatch`, hit by `SaveDialog.tsx`'s own `useEffect` fetch on mount) unconditionally calls `editEntryFor(name)`, opening an edit session as a side effect of a read. Sessions close only on a successful commit (`commitMatch`'s own `editSessions.close(name)`). The live-render follow-up (2026-09-22, commit `2359ecb`) made `/api/render/:name.png` bypass its own `pngCache` entirely whenever `editSessions.has(name)` is true — correct for an actually-dirty session, but the two conditions aren't the same: once a player has EVER opened the Save dialog for a map (even cancelling immediately, never editing, or undoing back to clean), that map's render cache stays bypassed for the rest of the server process's life. Measured on a real large map (Route110): 2.8ms cached vs. 40-77ms bypassed, permanently, with zero edits ever made.

**Fix:** key the render route's cache-bypass on `entry.session.isDirty`, not merely `editSessions.has(name)`.

```ts
// packages/server/src/index.ts, inside the renderMatch handler
const liveEntry = editSessions.has(name) ? editEntryFor(name) : undefined;
if (liveEntry && liveEntry.session.isDirty) {
  const layoutName = resolveLayoutName(name); // reuse the existing helper both branches already share
  if (!layoutName) return send(404, { error: `no layout or map ${name}` });
  const png = encodePng(renderLayout(project, layoutName, { border, blocksOverride: liveEntry.session.blocks }));
  res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" });
  return res.end(png);
}
// ...existing pngCache path, unchanged, for the isDirty:false and no-session cases
```

This is correct, not just a perf hack: nothing is ever written to disk until a real commit (I6), so an `isDirty:false` session's in-memory blocks are BY DEFINITION identical to what's already on disk — falling back to the cached/disk path for that case can never serve stale pixels. Only a genuinely dirty session (real pending edits) needs the live-render bypass, which is exactly when it's needed.

**Test:** open a session via a real `/plan` fetch with no edits, confirm the render route still hits `pngCache` (mirror `api.test.ts`'s existing "keys the PNG cache on border" test's own observability technique — same-instance identity or an equivalent signal, whatever that established test already uses, don't invent a new one). Then: paint a real edit (`isDirty:true`), confirm the render now bypasses cache and reflects the live blocks (mirror the live-render follow-up's own existing test in `api.test.ts` for this). Then: undo back to clean (`isDirty:false` again), confirm the render falls back to the cache/disk path again, not stuck bypassing forever. All three cases, not just the fix's own headline case.

**Risk:** low-medium. Single conditional change, one file, well-precedented test patterns to mirror already exist in `api.test.ts` from the live-render follow-up itself.

---

## Task B: `jsonEdits`-before-`insertOps` ordering bug in `applyJsonOps`

**Re-checked 2026-11-13: starts with a repro. Tier High** (core write path; every mutating route funnels through it). `applyJsonOps` (`packages/core/src/write/save.ts:332-346`) still applies `jsonEdits` (line 334) before `insertOps` (line 335). RESUME records that Plan 10a2 Task 6 fixed "moving an unsaved (pending-insert) event broke the GBA save plan" another way. Step 1 of the test list below therefore decides the task. If add-then-move in one session now passes at plan and at commit, keep the test as a pin, record why the order no longer matters, and close the task without the reorder. If it fails, continue as written.

**Root cause:** `packages/core/src/write/save.ts`'s `applyJsonOps` applies `session.jsonEdits` (scalar field edits — `moveEvent`'s x/y/elevation) BEFORE `session.insertOps` (array insertions — `addEvent`'s new element). Adding an event (insertOp targeting index N, appended, doesn't exist in the original array text yet) and then moving it in the SAME session (jsonEdit targeting `[arrayKey, N, "x"]`) throws `index N is not present` — the jsonEdit is applied first, against text where index N genuinely doesn't exist yet. Found live during the event-elevation follow-up's own live-verify (2026-09-22), reproduced against the real subject decomp, confirmed NOT elevation-specific (any move — x/y alone included — on a same-session freshly-added event hits this).

**Fix:** reorder `applyJsonOps` to apply `insertOps` before `jsonEdits`.

```ts
// packages/core/src/write/save.ts, applyJsonOps
function applyJsonOps(session: EditSession): string {
  let text = session.originalMapJson;
  for (const op of session.insertOps) text = insertArrayElement(text, op.path, op.index, op.value);
  if (session.jsonEdits.length > 0) text = editJson(text, session.jsonEdits);
  const removesByPath = new Map<string, number[]>();
  for (const op of session.removeOps) {
    const key = JSON.stringify(op.path);
    removesByPath.set(key, [...(removesByPath.get(key) ?? []), op.index]);
  }
  for (const [key, indices] of removesByPath) {
    const path = JSON.parse(key) as JsonPath;
    for (const index of [...indices].sort((a, b) => b - a)) text = removeArrayElement(text, path, index);
  }
  return text;
}
```

**Why this is safe in general, not just for the one repro case:** `addEvent`'s own doc comment already states insertOps always APPEND ("there is no established meaning" for inserting mid-array for this format) — an append never shifts any EXISTING element's index. So reordering insertOps before jsonEdits cannot break a jsonEdit targeting a PRE-EXISTING index (its target index is unaffected by an append happening first or last), and it FIXES a jsonEdit targeting a freshly-inserted index (now present when the jsonEdit runs). `removeOps` staying last, highest-index-first, is unaffected by this reordering — verify this reasoning holds by re-reading `insertArrayElement`'s and `editJson`'s own implementations before treating it as settled, this is exactly the kind of "sounds right, verify by tracing" claim this project's own Plan 0 §7 test-design rules warn against accepting on reasoning alone.

**Test, TDD, both directions:**
1. Reproduce the exact bug first (add an event, move it, same session, confirm it currently throws) — watch it fail red against the CURRENT ordering.
2. Apply the fix, confirm it now succeeds and the resulting JSON reflects both the insert and the move correctly.
3. Confirm both `/plan` (dry preview) and `/commit` (real write, restore after) work for this sequence, not just the pure `core` function in isolation.
4. **Re-run the FULL I5 corpus gate** (`packages/core/test/write/corpus.test.ts`) — this changes the shared `applyJsonOps` function every write path (paint, event, sign) funnels through; the existing corpus tests use single-op scenarios that may not exercise the mixed insert+edit-same-session path this fix targets, but full regression coverage across all 6 engine roots is non-negotiable for a change to this function, matching the exact rigor Task 19 already established for any change here.

**Risk:** medium — small diff, but it's a core write-path ordering change touching the function every mutating route depends on. **Recommend Opus for review** (both spec-compliance and code-quality), matching this project's own established policy for hand-derived-numeric-fixture/core-write-correctness changes (CLAUDE.md's own cost-discipline notes, Task 19's own precedent).

---

## Task C: discard/save vs. in-flight-paint race

**Re-scoped 2026-11-13: still open. Tier High** (async ordering; save and discard ownership). The files named below no longer exist in that form. Today `discard` in `packages/ui/src/shared/useEditSessionCore.ts` (line 131) awaits only `eventCreateBarrier`. Paint strokes are tracked apart from it by `shared/useStrokeChain.ts` (`strokeSettled`): the map-switch path awaits it (`shell/FamilyApp.tsx:319`); the toolbar Discard and the Save dialog do not. The server side is unchanged, so a late paint POST still reopens a fresh session. Plan 14.2 Task 12 turns the barrier into `sessionMutationBarrier(mapName)` for undo, redo, Discard, Save and map switch. **Run Task C after Plan 14.2 merges, on top of that barrier. Design (ruled 2026-11-15): the barrier awaits the stroke chains.** `shared/useEditSessionCore.ts` exports `registerSettledSource(map, settled: () => Promise<void>): () => void` (it returns the unregister function), and `sessionMutationBarrier(map)` awaits every registered source for that map inside its existing loop. `shell/FamilyApp.tsx` registers `strokeSettled` (`shared/useStrokeChain.ts:28`) for the selected map in an effect and unregisters on change. Discard, the Save plan, both Save commits, undo, redo and the map switch already await the barrier, so no call site changes and both families are covered. Awaiting `strokeSettled()` at each site was the other option; it needs new plumbing into `SaveDialog` and both toolbars and was not chosen. The older `pendingRef` design has been removed from this document: it named files that no longer hold this code. The accepted ceiling and the controlled-delay test technique still apply. This task also closes RESUME's Plan 8 deferred item (a discard does not wait for queued stroke links).

**Root cause:** `editSessions.ts`'s `close()` (`sessions.delete(mapName)`, used by both the discard follow-up's new route and the pre-existing commit route) has no generation/version tag, and `open()` silently creates a fresh session from disk if none exists. `MapCanvas.tsx`'s paint-stroke lifecycle has at least one fire-and-forget chain (`onMouseLeave`'s own cleanup, `void pendingPaintRef.current.catch(() => {}).then(...)`, not awaited before the handler returns) — if a player's cursor leaves the canvas mid-stroke and they then click Discard (or Save) before that in-flight `/paint/apply`/`/paint/end` actually lands server-side, the session-closing call can beat it there. The late-arriving paint request then finds no session, silently reopens a FRESH one from disk, and applies the stroke to it — a new dirty server-side session the just-cleaned client UI has no idea exists. Self-recoverable (discard again) but a real data-integrity footgun. Pre-existing (Save had the identical gap already; the discard follow-up, 2026-09-22, just inherited it, didn't introduce it).

**Acceptance (2026-11-15; the older `pendingRef` code was removed from this document, see the design ruling above).** With a stroke link held open by a deferred fetch: (1) the toolbar Discard sends no `/discard` until the link settles; (2) the Save dialog sends neither `/plan` nor `/commit` until it settles; (3) undo and redo wait the same way; (4) after a Discard that waited, the server holds no session for the map (no late paint reopened one); (5) all of it in both families; (6) a stroke link that fails does not block the barrier forever. Mutation check: drop the source registration in `FamilyApp` and cases 1-3 turn red.

**Explicitly accepted, not fixed by this design:** this closes the race for a SINGLE client tab's own out-of-order fire-and-forget chains. It does NOT close a much rarer network-reordering case (a slower FIRST request arriving after a faster SECOND one, independent of any client-side fire-and-forget gap). Name this as an accepted ceiling in the final code's own doc comment, matching this project's own established `ponytail`-style "name the ceiling" convention — do not silently pretend the fix is airtight, and do not scope-creep into the much larger server-side generation-counter alternative (every paint/event route would need to check a generation tag) unless live-verify or a future incident shows the client-side fix is insufficient in practice.

**Test:** the deterministic, controlled-delayed-promise repro technique this file's own `MapCanvas.test.tsx` already established for its rect-tool async-race regression test (search for it — same pattern: a mock that resolves on a controlled delay, not an instant-resolving one, since instant resolution doesn't expose ordering bugs, exactly the lesson this project's RESUME.md already documents about this specific file's own race-testing history). Confirm `discard()` genuinely waits for a controlled, artificially-delayed prior call before its own request fires. Confirm the SAME for whichever `SaveDialog` fix direction is chosen.

**Risk:** medium-large — the trickiest of these 3, real design judgment already spent above, but still needs the implementer's own verification against current real source (this design was worked out against `useEditSession.ts`/`SaveDialog.tsx`/`MapCanvas.tsx` as they stood 2026-09-22, re-confirm no drift).

---

## Task D: GBA `MapCanvas` StrictMode zoom, hover overflow, and `vite build` CSS comment (DONE: D1/D2 in Plan 6c E1, D3 in Plan 6b)

**Origin:** Plan 6b Task 4's spec review (`docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/_archive/task-4-spec-review.md`, sections A and B plus its "Side note"; branch `plan-6b-gbc-app-layer` until it merges). The review found the first two bugs in `GbcMapCanvas.tsx`, which was copied from GBA `MapCanvas.tsx`, and reproduced both on GBA live. Task 4 fixed only the GBC copy and deliberately left GBA's `MapCanvas.tsx`, `App.tsx` and the shared `.map-canvas` rule untouched, deferring GBA to this follow-up. The fixed `packages/ui/src/gbc/GbcMapCanvas.tsx` is the reference implementation for D1 and D2.

**D1: DONE in Plan 6c E1 (`a13a308`, 2026-10-05).** `MapCanvas` now holds one `view` state with a shared pure `zoomAboutPivot` (`components/mapView.ts`), pinned by a `<StrictMode>` test. The original text follows for the record.

**D1. StrictMode zoom bug.** `packages/ui/src/components/MapCanvas.tsx`, `applyZoom` (lines 532-542 on `master`), calls `setPan(...)` inside the `setZoom` updater. `packages/ui/src/main.tsx` renders under `<StrictMode>`, which runs updaters twice in development, so the pan is applied twice. In `npm run dev --workspace=@pokemap/ui`, clicking 2× or 4× moves the map off-canvas, and 4× looks blank. A production build is correct (measured: prod pan (−78, −59) vs. a double-applied pan in dev on PalletTown / KantoRoute23).
- **Fix:** a single `{ zoom, pan }` view state with a pure updater. Extract the zoom-about-pivot math into an exported, unit-tested pure function (mirror `GbcMapCanvas`'s `GbcView` + `zoomAboutPivot`).
- **Test:** render `<StrictMode><MapCanvas …/></StrictMode>`, click 2× from Fit, then 4×, and pin the exact pan `pivot − (pivot − pan0)·k` from the last draw call. It must fail on the old code (show the red run in the report). jsdom tests do not use StrictMode by default, which is why nothing caught this.
- **Also:** confirm `WorldCanvas.tsx` has no nested-updater pattern (the review's `grep "setZoom(("` matched only `MapCanvas`; re-run it).

**D2: DONE in Plan 6c E1 (`dd50d43`, 2026-10-05).** `min-width: 0` and an ellipsising hover now sit on the shared `.map-canvas` rules. GBA keeps its 28 px single-row status strip, and the 44 px two-row strip stays GBC-only (E1 fix round `a1a59e0`). All three are pinned in `styles.test.ts`. The original text follows for the record.

**D2. Hover overflow.** `.map-canvas` (`packages/ui/src/styles.css`, about line 501) is a flex item of `.app__map-editing-body` with the default `min-width: auto`, which resolves to its min-content width. The `white-space: nowrap` hover text in `.map-canvas__status` therefore widens the row, pushes `EventInspector` past the viewport, and the page scrolls horizontally on hover. Measured: PalletTown at a 1280-px window, `document.documentElement.scrollWidth` 1280 → 1384. `overflow: hidden` on the status bar does not help, because the status bar is not the row flex item whose minimum is being resolved.
- **Fix:** `min-width: 0` on the shared `.map-canvas` rule. That alone clips the end of the hover text, so also keep it legible: truncate with an ellipsis or wrap into a fixed-height strip (mirror the `.gbc-map-canvas` status-strip rules Task 4 added).
- **Check:** with Playwright, hover the longest realistic status line and assert `document.documentElement.scrollWidth === clientWidth` at 1280×800 and 1024×768. Read the numbers from a script, not from a screenshot.

**D3: DONE in Plan 6b (`5629602`, 2026-09-28).** It was worse than described below. Browsers silently dropped the next rule, `.species-spotlight { position: relative }`, so the spotlight dropdown rendered off-screen in both families. The fix rewords the comment. `packages/ui/test/styles.test.ts` parses the sheet strictly with lightningcss and pins the rule, and `vite build` passes. The original text follows for the record.

**D3. `vite build` fails.** lightningcss (default minify) rejects the `*/` inside a CSS comment in `packages/ui/src/styles.css` (line 1272 on `master`, about 1296 on `plan-6b-gbc-app-layer`: `world-canvas__spotlight-*/world-canvas__lens-tint`), which ends the comment early. Reword it (for example `world-canvas__spotlight-* and world-canvas__lens-tint`) so `npm run build --workspace=@pokemap/ui` succeeds.

**Constraints:** GBA behaviour must otherwise stay identical. `npm test` must keep RESUME's "Git state" baseline, with only new tests added. `npm run typecheck` must be clean. Live-verify in the Vite dev server (StrictMode on) against a GBA project (`npx tsx packages/server/src/serve.ts`, with `pokemap.config.json` pointing at a GBA decomp), and take screenshots of Fit/2×/4× and of the hover. Never commit `pokemap.config.json`. If `plan-6b-gbc-app-layer` has merged by then, branch from `master` and reuse the merged `GbcMapCanvas.tsx`. Otherwise read it from that branch.

**Risk:** low. Three small, independent diffs in two files (`MapCanvas.tsx`, `styles.css`), each with a fix already proven on the GBC sibling.

---

# Review backlog (added 2026-11-13)

Source: the code review of 2026-11-12 on `plan-14-2-block-editor` at `b0b697e`. Every finding below was checked against the code, except Task G, which is a suspicion with a repro step. The hub's design holds and is not a finding: it binds `127.0.0.1`, and `isCrossOriginRequest` (`packages/server/src/hub.ts:161-169`) rejects a foreign `Origin` or `Host`; browsing and opening any folder is by design behind that guard.

---

## Task E: server request boundary (S1, S3, S4)

**Tier: High** (hub I/O error boundary).

**Findings.**
- **S1.** `GET /api/species/<name>/icon.png` (`packages/server/src/index.ts:483-518`) decodes the name after the route regex has matched, so `%2F` passes the `[^/]+` test. `speciesToDirName` (`packages/core/src/render/species.ts:14-23`) puts the result into `graphics/pokemon/<dir>/icon.png`. `SPECIES_..%2F..%2F..%2FWindows%2FTemp` resolves outside the project root (reproduced with `node`, 2026-11-12). The read is of a file that must parse as an indexed PNG, and the Origin guard limits callers to the app's own page, so the severity is low.
- **S3.** `readBody` (`index.ts:89-96`) buffers a body of any size.
- **S4.** `index.ts` calls `decodeURIComponent` unguarded at 27 sites (346, 353, 399, 458, 485, 528, 1000 and others); a malformed `%` becomes a 500 from the outer catch (1359-1362). The GBC routes use `decodeMapName` (`gbcRoutes.ts:92-98`). GBA `POST /api/world/placement` (`index.ts:693-719`) lacks the guard its GBC twin has (`gbcRoutes.ts:553-579`): a `null` body answers 500, and `__proto__` is accepted as a map key.

**Change.** Create `packages/server/src/http.ts` and use it from both handlers and the hub:

```ts
export const MAX_BODY_BYTES = 16 * 1024 * 1024;
/** Reads a request body. Stops buffering and rejects with BodyTooLarge past MAX_BODY_BYTES; the caller answers 413 and closes the connection. */
export function readBody(req: IncomingMessage): Promise<string>;
/** decodeURIComponent that returns undefined on a malformed escape. Replaces gbcRoutes' decodeMapName. */
export function decodeSegment(raw: string): string | undefined;
/** JSON response with `x-content-type-options: nosniff`. Replaces each handler's own `send`. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void;
```

```ts
// before  packages/server/src/index.ts:485
const species = decodeURIComponent(speciesIconMatch[1]!);
// after
const species = decodeSegment(speciesIconMatch[1]!);
if (species === undefined || !/^\w+$/.test(species)) return send(400, { error: "malformed species" });

// before  packages/server/src/index.ts:702
if (typeof parsed.map !== "string" || typeof parsed.x !== "number" || typeof parsed.y !== "number") {
// after: the GBC guard (gbcRoutes.ts:563) plus a known-map check
if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)
  || typeof parsed.map !== "string" || !project.mapNames().includes(parsed.map)
  || !Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) {
```

**Acceptance (tests first; each fails on the current code).**
1. `GET /api/species/SPECIES_..%2F..%2Fx/icon.png` answers 400. A name outside `^\w+$` answers 400. A real species still answers 200.
2. One malformed-`%` request per GBA route family (map, render, metatile, species, edit, defects, event-options, world) answers 400, never 500.
3. A body of `MAX_BODY_BYTES + 1` bytes answers 413 and the route body does not run.
4. GBA placement with the bodies `null`, `[]`, `{"map":"__proto__","x":0,"y":0}`, an unknown map, and `{"map":"<real>","x":1e999,"y":0}` answers 400 each time, and `.pokemap/world.json` is byte-identical afterwards.
5. Every JSON response carries `x-content-type-options: nosniff`.
6. Mutation checks: remove the `^\w+$` test; remove the size cap; drop the known-map check. Each turns its test red.

**Files:** create `packages/server/src/http.ts`, `packages/server/test/http.test.ts`; modify `index.ts`, `gbcRoutes.ts`, `gbcEditRoutes.ts`, `hub.ts`; new cases in the existing route tests.

**Split and additions (2026-11-15).** Two dispatches. **E1:** `http.ts` with its unit tests, and the hub and the GBC handlers switched to it. `decodeSegment` replaces `decodeMapName`; `blockEditRoutes.ts` (Plan 14.2 Task 11) imports `decodeMapName` and follows. **E2:** the GBA handler: the decode sites, the species check, the placement guard, and acceptance 1-5. The E2 brief lists the decode sites from `git grep -n decodeURIComponent packages/server/src/index.ts` on the day; the line numbers above predate Plan 14.2 Tasks 9-11.

---

## Task F: path containment for decomp-sourced paths (S2)

**Tier: High** (writes to subject repos; parsing boundary).

**Finding.** `packages/core/src/load/layouts.ts:20-21` copies `border_filepath` and `blockdata_filepath` from `layouts.json` unchecked. They are joined to the root for reads and for **writes**: `write/binary.ts:57,76`, `server/src/editSessions.ts:44-45`, `server/src/index.ts:381`, `render/layout.ts:62,108`, `defects/gba.ts:63`, `signs/suggest.ts:79`, `cli/src/writeCommands.ts:25-26`. A project whose `layouts.json` holds `"../../x"` makes Save write outside the project. GBC paths taken from `INCBIN` lines have the same gap for reads: `gbc/load/map.ts:346`, `gbc/load/tileset.ts:506-509`, `gbc/load/palette.ts:470-471,591,598`, `gbc/load/roofs.ts:218`, `gbc/load/sprites.ts:76`. This matters for a project cloned from someone else.

**Change.**

```ts
// before  packages/core/src/load/layouts.ts:20
borderFilepath: String(l.border_filepath),
blockdataFilepath: String(l.blockdata_filepath),
// after
borderFilepath: insideRoot(String(l.border_filepath)),
blockdataFilepath: insideRoot(String(l.blockdata_filepath)),

// packages/core/src/config/paths.ts
/** Refuses a project-relative path that is absolute or climbs out of the root. Returns it unchanged. */
export function insideRoot(rel: string): string {
  const n = posix.normalize(rel.replace(/\\/g, "/"));
  if (n === ".." || n.startsWith("../") || n.startsWith("/") || /^[A-Za-z]:/.test(n)) throw new Error(`path leaves the project: ${rel}`);
  return rel;
}
```

A second guard sits at the one write choke point: `writeFilesAtomically` (`packages/core/src/write/atomic.ts:26`) takes the project root and refuses any entry outside it before it writes a temp file. That covers every writer, including Plan 14.2's tileset entries. `addEvent/sources.ts` already has the containment idiom (`relative(resolve(root), resolve(path))` must not start with `..`).

**Spec question to settle first:** GBC data defects never throw (GBC roadmap invariants). Decide whether an escaping `INCBIN` path is a refusal at project open or a `DataDefect` that marks the map unreadable.

**Recommendation and split (2026-11-15).** Recommended answer, for the user to confirm before the spec is written: a `DataDefect` that marks the map unreadable, never a throw at project open. It keeps the GBC rule that data defects never throw, and one bad `INCBIN` in a cloned project then costs one map, not the whole project. Three dispatches. **F1:** `insideRoot` and the GBA `layouts.json` guard (acceptance 1 and 4). **F2:** the root check in `writeFilesAtomically`, which gains a root parameter at its two call sites (`write/save.ts:336`, `gbc/write/save.ts:261`) (acceptance 3 and 5). **F3:** the GBC `INCBIN` paths, after the ruling (acceptance 2). F1 and F2 do not wait on the spec question.

**Acceptance (temp projects only).**
1. `blockdata_filepath` of `../../outside.bin`, an absolute path, a drive-letter path and a backslash variant are each refused at load, naming the layout id and the path.
2. A GBC `INCBIN` path with `..` is handled as the spec question rules, with file and line context.
3. `writeFilesAtomically` with one entry outside the root throws before any write; every file is byte-identical afterwards.
4. Every real root still loads and the corpus counts are unchanged, which shows that no real project uses such a path.
5. Mutation checks: remove the guard in `atomic.ts` (test 3 red); remove `insideRoot` in `layouts.ts` (test 1 red).

---

## Task G: GBA map cache after a save (R10, suspected)

**Tier: High** (save ownership; nothing catches a wrong answer today).

**Suspicion, not yet run.** `mapCache` (`packages/core/src/project.ts:136-160`) has no invalidation API. The event operations return new objects (`edit/events.ts:35,60,70`) and do not change the cached `MapData`. After a commit that changes events, `project` consumers may see the data from before the save. `packages/server/src/signRefresh.ts:77` re-opens the whole project to get fresh data, which looks like a workaround for this.

- **Step 1 decides the task.** Hub test on a temp copy: move an event, commit, then read the map through `GET /api/map/<name>` and through the consumers that use the cached project (defects, sign refresh, world warps). Expect the saved coordinates everywhere.
- **Green:** keep the test as a pin, record which code refreshes the data, close the task.
- **Red:** add `forgetMap(name)` to `Project`, call it in the commit route's `finally` beside `symbols.invalidate()` (`index.ts`, about line 1039), then check whether `signRefresh.ts:77` still needs the full re-open. Check the GBC project for the same shape.

---

## Task H: one sidecar route module for both families (R1)

**Tier: Medium** (behaviour-preserving; the existing route tests of both families are the oracle).

**Finding.** 14 route paths exist in both handlers, and `index.ts` and `gbcRoutes.ts` share 75 identical long lines. `/api/world/conflicts/accept` at `index.ts:674-691` equals `gbcRoutes.ts:510-527` except for the root variable. The JSON-body preamble (read, parse, 400 on bad JSON, shape check, 500 on a throw) is written out about 25 times.

**Change.** Add `jsonBody(req, send, guard, shapeText, handler)` to `http.ts`. Create `packages/server/src/sidecarRoutes.ts`, which exports a route of the shape `addEvents.handleOptions` already has (`index.ts:323`): `(req, url, send) => boolean`, true when handled. Mount it from both handlers for the routes that only read and write `.pokemap/` files: world placement, conflict acceptance, dungeons and the dungeon auto-layout switch. List the exact routes in the step plan.

```ts
// before, in both files
return readBody(req).then((body) => {
  let parsed: unknown;
  try { parsed = JSON.parse(body); }
  catch (e) { return send(400, { error: `invalid JSON body: ${(e as Error).message}` }); }
  if (!isAcceptConflictBody(parsed)) return send(400, { error: `expected { key: string, accepted: boolean }, got ${body}` });
  // ...
}).catch((e: unknown) => { console.error(e); send(500, { error: e instanceof Error ? e.message : String(e) }); });
// after, once
if (url.pathname === "/api/world/conflicts/accept" && req.method === "POST")
  return jsonBody(req, send, isAcceptConflictBody, "{ key: string, accepted: boolean }", (body) => { /* ... */ });
```

**Acceptance.** Both families' sidecar tests pass with no test edited. A new test mounts `sidecarRoutes` on a bare temp root, which pins that it has no family dependency. The report gives the line count removed from each handler.

---

## Task I: route modules and one session store (R2, R3)

**Finding.** `createProjectHandler` spans `index.ts:119-1420`, and its `handle` function is one if-chain of 1,065 lines (300-1365). `editSessions.ts:31-100` and `gbcEditSessions.ts:41-71` expose the same store shape, `{ open, close, has, dirty, closeAll, entries, root }`, and differ only in how an entry is opened.

- **I1, Tier Medium** (verbatim move; route tests are the oracle): move the read-only GBA routes (map, render, metatile, species, encounters, world, defects, event-options) to `packages/server/src/gbaReadRoutes.ts`.
- **I2, Tier High** (save and discard ownership): move the edit-session routes (paint, event, sign, plan, commit, discard, undo, redo) to `packages/server/src/gbaEditRoutes.ts`, and replace both stores with `createSessionStore<E>(root, openEntry)` in `packages/server/src/sessionStore.ts`. The move commit changes no route body. A behaviour change is a separate commit with its own test.

```ts
// after  packages/server/src/index.ts
const routes = [addEvents.handleOptions, gbaReadRoutes(ctx), gbaEditRoutes(ctx), sidecarRoutes(root, getWorld), blockEditRoutes(ctx)];
for (const route of routes) if (route(req, url, send)) return;
return send(404, { error: "not found" });
```

**`ctx` (2026-11-15).** The snippet's `ctx` is not defined anywhere yet. Define it once, in the I1 move commit, as `GbaRouteContext` in `packages/server/src/gbaRouteContext.ts`: the values the route bodies close over today (the project, the root, the caches, `editSessions`, `symbols`, `addEvents`, the overlay sync). List the fields from the closure; do not design new ones, and leave out a field no moved route reads.

**Acceptance.** The test count is unchanged and no test is edited. `git diff --stat -M` shows moves. `index.ts` holds context construction and the loop. For I2, a mutation spot check: make the store's `has` always false, and the existing session tests fail in both families.

---

## Task J: JSON content type and one guarded fetch (S5, R6)

**Tier: Medium.**

**Finding.** UI POSTs send JSON with no `content-type` header (`gba/worldSurface.tsx:172,177`, `shared/useEditSessionCore.ts:82` and others). The browser labels them `text/plain`, which a cross-site page may send without a preflight, so the Origin/Host guard is the only cross-site defence. 14 UI files call `fetch` directly and 16 use `fetchGuarded` or `useGuardedFetch`; `if (!r.ok) throw new Error` appears 13 times. `hooks/useDungeons.ts` (97 lines, raw `fetch`, unchecked cast) and `gbc/hooks/useGbcDungeons.ts` (53 lines, guarded) serve one endpoint and return one type. The test-only `createServer` (`index.ts:1426-1430`) has no Origin guard.

**Change, in this order on one branch.**
1. `postJson(path, body, guard?)` beside `fetchGuarded` (`packages/ui/src/hooks/useGuardedFetch.ts:39`); it sets `content-type: application/json`. Move every request that has a body to it.
2. Both families use the guarded dungeons hook; delete the fetch code in `useDungeons.ts` and keep its types.
3. Hub: a non-GET request with a body and a content type other than `application/json` answers 415.
4. `createServer` runs the hub's cross-origin check.

```ts
// before  packages/ui/src/gba/worldSurface.tsx:172
await fetch("/api/world/placement", { method: "POST", body: JSON.stringify({ map, x, y }) });
// after
await postJson("/api/world/placement", { map, x, y });
```

**Acceptance.** The UI suite passes with mocks changed only for the header (list them). Hub test: a `text/plain` body answers 415; a bodyless POST (discard) still answers 200. The report lists every remaining direct `fetch(` in `packages/ui/src` and why it stays. Live check in both families: paint, save, discard, drag a placement.

---

## Task K: small dedupes and dead code (R5, R7, R9, R11, P7)

**Tier: Low** (mechanical). Run K1 and K2 with no other branch open.

- **K1.** Export `errorMessage(e: unknown): string` from core (a private copy is at `write/atomic.ts:20`). Replace the 86 inline copies of `x instanceof Error ? x.message : String(x)` (server 36, ui 33, core 14, cli 3).
- **K2.** One `hex` in `packages/ui/src/shared/format.ts`, upper case, in place of four copies: `components/MetatilePalette.tsx:46` (upper case), `gba/mapSurface.tsx:32`, `gbc/GbcMetatilePalette.tsx:30` and `gbc/mapSurface.tsx:27` (lower case). The same id shows today as `0x1AF` in the GBA palette and `0x1af` in the status strip; after this it is upper case everywhere. Name the tests that pinned lower case in the report. One `isRecord` in place of the three in `packages/ui/src`: `gbc/guards.ts:21`, `world/conflictAcceptance.ts:3` and `hooks/useEditSession.ts:273`.
- **K3.** `addEvent/sources.ts:4-16` reads `process.env.POKEMAP_SUBJECT_SNAPSHOT` on every call to drive a cache that only tests use. Export `setImmutableRoot(root)` and call it once from the vitest setup. Compare the suite's wall time before and after; a slower suite is a finding.
- **K4.** Delete `VERSION` (`packages/core/src/index.ts:1`; no reference anywhere). `TilesetFileEdit` (`blockEdit/types.ts:36`) is not dead: Plan 14.2 Task 8 consumes it.
- **K5.** `CLAUDE.md` and `AGENTS.md` are 37 lines each and differ only on line 5 (the path of the global rules file). Keep one body in `AGENTS.md` with a line 5 that names both paths, and make `CLAUDE.md` the single line `@AGENTS.md`. This one can run now.

---

## Task L: dependency advisories (S6)

`npm audit` on 2026-11-12: 8 advisories (2 critical, 3 high, 3 moderate). All are in the development toolchain; nothing ships to users.

- **L1, Tier Low, can run now.** `npm audit fix` without `--force`. It updates `undici` (through `jsdom`) and `source-map-js`. Lockfile only; gate.
- **L2, Tier Medium, own branch, nothing else in flight.** `vitest` 2.1.9 → 5.x with the matching `vite` and `esbuild`, which clears the rest (`vitest`, `tinypool`, `vite` 5.4.21, `esbuild` 0.21.5, `@vitest/mocker`, `vite-node`). Acceptance: the same test and file counts as RESUME's baseline; the gate's `--maxWorkers=4 --minWorkers=1` flags still work, or their replacement is recorded in the `gate` skill and LESSONS; the `globalSetup` that redirects every test root to a scratch copy (Plan 14.2 Task 0) still does; the UI build passes.

---

## Task M: UI quick fixes (U2, U6, S7)

**Tier: Low.** Live check in both families.

- **M1, reduced motion.** `packages/ui/DESIGN.md:302` says to respect `prefers-reduced-motion`. `styles.css` has 10 transitions, one keyframe animation and no such rule. Add this after the global `:focus-visible` rule (`styles.css:195-198`) and pin it in `styles.test.ts`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }
}
```

- **M2, palette search label. Can run now.** `packages/ui/src/shared/PaletteFrame.tsx:27`: add `aria-label="Search by hex id"` to the input. This is also the Plan 9F deferred minor "search input has no aria-label" in RESUME.
- **M3, self-hosted fonts.** `styles.css:1` imports IBM Plex Sans and JetBrains Mono from Google Fonts on every launch: a request to a third party, and a blocked first paint when offline. Put the woff2 files and their OFL licence texts in `packages/ui/public/fonts` and declare them with `@font-face` and `font-display: swap`. Live check with the network blocked.

---

## Task N: layout and keyboard access (U1, U3, U4)

**Tier: High** (canvas-core pointer and keyboard behaviour). Run `superpowers:brainstorming` first; these are open design decisions.

- **U1.** `styles.css` has no `@media` rule. The sidebar (280 px, lines 229-230), the rail (272 px, line 2831) and the canvas minimum (`min-width: 480px`, line 239) overflow below 1,032 px. `DESIGN.md:226-236` specifies a 260 px tree that resizes between 240 and 420 px; neither exists. Decide the smallest supported width, how the tree and rail collapse, and whether DESIGN.md or the CSS is right about 260 and 280.
- **U3.** The map editor canvas (`shared/MapCanvasViewport.tsx:28`) has no `tabIndex`, accessible name or key handler. The world canvas has all three (`canvas/WorldSurface.tsx:871-897`). Decide the keyboard model (cell cursor, paint key, pan keys) together with Plan 14A's rectangular selection.
- **U4.** `[data-theme="light"]` (`styles.css:132-169`) cannot be reached; no code sets `data-theme`. Either add a toggle (stored like `shared/useFollowHover.ts` stores its setting) or delete the block and the claim at `DESIGN.md:33`.

---

## Task O: stylesheet tokens and split (U5)

**Tier: Low** for the tokens (mechanical; `styles.test.ts` and a live check), **Medium** for the split. Run it with Task N; both rewrite layout rules.

`styles.css` is one global sheet of 3,231 lines. It has 34 raw `z-index` values (1-12 and 1000) and no scale. The shadow `0 4px 16px rgba(0, 0, 0, 0.4)` is written out at lines 922, 951, 1025, 1063, 1265, 1438 and 1526.

```css
/* before */
box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
/* after */
box-shadow: var(--shadow-popover);
```

Add `--shadow-popover` and a named z-index scale (`--z-overlay`, `--z-popover`, `--z-dialog`, `--z-toast`). Then split the sheet by area (shell, canvas, palette, dialogs, world) and import the parts in the current order.

---

## Task P: tooling and module layout (R8, lint, CI)

**Tier: Medium.**

- **P1.** ESLint with `typescript-eslint` and `react-hooks`, configured so the current code passes. No formatter churn.
- **P2.** A CI job for typecheck, the UI build and the tests that need no subject corpus (the subjects are private or local; see RESUME "Environments").
- **P3.** An `exports` map in `packages/core/package.json`, so imports stop reaching into `@pokemap/core/src/...` (234 imports through 68 deep paths, none through the package root). Then move the GBA-only core and UI folders under `gba/` to mirror `gbc/`. Typecheck is the oracle. Run it between plans with no other branch open.

```ts
// before
import { textFiles } from "@pokemap/core/src/addEvent/sources.js";
// after
import { textFiles } from "@pokemap/core/shared/sources";
```

---

## Folded into other plans, or not planned

- **R4, `paintCells` and `floodFill` written twice** (`packages/core/src/edit/paint.ts:36-87`, `packages/core/src/gbc/edit/paint.ts:23-72`): the first task of roadmap Plan 14A, which builds stamps on painting in both families. One generic version copies only the keys the existing block already has; the GBC file re-exports it, as it already does for `readBlock` and `shiftGrid`.
- **U7, `canvas/WorldSurface.tsx` is 934 lines:** the first task of roadmap Plan 16, which adds the minimap to that surface. Extract the warp fetch, the encounter fetch and the lens overlays as hooks.
- **U8, no `AbortController`:** not planned. The hooks already drop late results and the server is local.
- **P1-P5, Plan 3 and Plan 5 overlap the roadmap:** resolved by roadmap D22; the moved tasks are marked in those plans.
