# Task 5 spec-compliance review (Opus, adversarial)

Range `2810a96..cc319e9`, `packages/ui` only (+ hook `useGbcEditSession.ts` from e327aee, in base, read for context). Live browser check not done (coordinator's).

**Verdict: ISSUES** — 0 blocker / 2 important / 6 minor. Prod code is a faithful port; both importants are test gaps on I6/error-surface wiring the spec requires. One real (minor) behaviour bug: F7.

## Verified compliant (re-derived)

| Item | Evidence |
|---|---|
| Paint chain port | `GbcMapCanvas.tsx:603-612` apply only inside `beginStroke().then` (rect/shift set `dragStartRef`, else `paintAt`); `:647-669` `endActiveStroke` awaits `pendingPaintRef.catch().then` before reading `dragStartRef`; rect/shift use `start` from drag, `end` from mouseup `rawBlockAt` (unclamped, server clamps `gbcEditRoutes.ts:149-150`); `:689-699` mouseleave ends only when `strokeOpenRef`. Line-for-line vs `MapCanvas.tsx:712-906`. Only delta: `.catch(fail)` → banner instead of GBA's silent swallow (improvement). Pencil trail `:624` identical to GBA `:777-787` (incl. no `strokeOpenRef` check — parity). |
| `&v=` only with session | `:344` `editSession && paintVersion > 0`; U4 red. |
| Units | paint `rawBlockAt` /32 (`:550-556`); events `clientToStep` /16 (`:563-566`). U5 red 7. |
| Dropper | `:597-602` reads `data.blocks` (session-merged, `:279-282`) → 1×1 stamp, no stroke; mouseup skips dropper `:682`. |
| Precedence | `button!==0` return; `onSelectEvent && !activeTool` hit-test/drag, miss → deselect + pan; dropper; tool → stroke; else pan = GBA `:712-761`. pencil/rect/bucket w/o stamp → `activeTool=null` = GBA `useMapEditing.ts:257-265`. |
| Hook at GbcApp level | `GbcApp.tsx:100`, ungated on mode. **Literal U6 done** (hook called inside `GbcMapEditing`): 5 red (guard, failed-discard, beforeunload, World↔Map, Save). |
| Guard text / order | exact GBA string `GbcApp.tsx:125`; discard before switch `:126` (R11 red). Tree `:154`, world click `:164`, world dbl-click/Dungeon open `:185`, jump `onJumpToMap=selectMap`. |
| beforeunload | `:107-115` only while `isDirty`, cleanup present (but see F3). |
| Non-writable | `GbcMapEditing.tsx:58-66,100-101,138`: all 5 tools disabled, title `this map's .blk is flagged non-writable: <defect>` (core defect text ends `not writable`, `load/map.ts:360`, match works), `activeTool` null, palette inert; events/undo/save live. U10 red. |
| Duplicate macro order | `GbcEventInspector.tsx:31-39` = `load/events.ts:67` destructure = `object_event` 13 args. PerfPlus `maps/NewBarkTown.asm:302` (read-only) `object_event 6, 8, SPRITE_TEACHER, SPRITEMOVEDATA_SPINRANDOM_SLOW, 1, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, NewBarkTownTeacherScript, -1` → pin `["7","8",…,"-1"]` correct. warp/coord/bg 4-arg order matches `KINDS`. Clamp x/y to step grid (R9 red). |
| Toolbar | default `tools = TOOLS` (6) `Toolbar.tsx:54`; sign button only when `onOpenSignComposer` given; GBC passes 5, no collision, no sign. U8 red 4 (3 in GBA `Toolbar.test`). GBA call sites untouched. |
| SaveDialog `text` | type-only widening `SaveDialog.tsx:4`; dialog renders `summary`, never `kind`; test shows text change. |
| Shape validation | hook `isSessionBody` (blocks ids, 7 event lists, flags, warnings) on every POST; `reload` via `fetchGuarded(isGbcMapPayload)`; `discard` checks `r.ok` only, body unused (acceptable). Server `{error}` surfaced verbatim. |
| Shared-layout note | DROPPED, justified: session body `gbcEditRoutes.ts:82-85` has no `layoutSharedBy`; `/api/groups` = names only; count needs a new route (spec forbids). SaveDialog plan summary already says `(shared by N maps)` (`core/gbc/write/save.ts:127`). |
| GBA test diff | `git diff 2810a96..cc319e9 -- packages/ui/test \| grep -c '^-[^-]'` = **0** (also 0 from c4ecff2). Only 5 new files. No absence assertions on new labels in GbcApp/Root tests. |

## Findings

1. **Important — World-path dirty guards untested; session-gated-on-mode regression undetected.** `GbcApp.tsx:164` (world click), `:185` (world dbl-click / dungeon open). Evidence: R1 (world click bypasses `leave`) and R2 (`openMapFromWorld` bypasses `leave`) survive all 51 GbcApp/Editing/Root tests. R16 (`useGbcEditSession(mode==="map" ? selected : null, …)` — the realistic "gate on mode" bug: in World `isDirty`=false so world clicks skip confirm, orphaning the dirty server session, and beforeunload unregisters) also survives; only tree-click guard is tested. Fix: in `GbcAppEditing.test.tsx`, paint → World → fire `GbcWorldCanvas`'s `onSelectMap`/`onOpenMap` (vi.mock `GbcWorldCanvas` to expose buttons calling its props) → assert GBA confirm, cancel keeps selection, confirm POSTs `/discard` before `GET /api/map/<new>`; plus assert dirty indicator/beforeunload still held while in World (kills R16).
2. **Important — `GbcMapEditing` wiring has zero tests; spec test 9 "a delete refusal shows the error" absent.** Survivors: R6 (`ok` no-op → banner never cleared on success, spec 7), R7 (delete `.catch(()=>{})` → refusal swallowed), R8 (`setWarn(null)` → warp warnings never shown; inspector test only feeds `warnings` as a prop), R12 (Discard confirm removed → one click discards everything, no GBA prompt). Fix: mount `GbcMapEditing` with a stub session: deleteEvent rejects `Error("object const X is referenced…")` → `role=alert` text; resolves with warnings → `role=status` list; subsequent success clears alert; Discard with `confirm=false` → no `discard()` call, and asserts GBA text `"Discard all unsaved changes on this map? This cannot be undone."`.
3. **Minor — beforeunload removal untested.** `GbcApp.tsx:114`. R3 (cleanup → no-op) survives; the test counts `addEventListener` only. Fix: spy `removeEventListener`, commit or discard, assert `beforeunload` removed.
4. **Minor — U9 pin can't see swaps among equal-valued fields.** `GbcEventInspector.test.tsx` uses only the real teacher (`hour1=hour2="-1"`, `palette=sightRange=radiusY="0"`). My U9 (hour1↔hour2) **survives**; implementer's radiusX↔radiusY happens to differ (1/0). A swapped hour pair silently changes NPC time-of-day visibility. Fix: add a synthetic object with all 13 fields distinct; keep the real pin.
5. **Minor — per-map stamp keying untested.** `GbcMapEditing.tsx:49`. R14 (`stamp = pick.stamp`, ignoring `forMap`) survives; spec Facts require forMap keying; a stale stamp is another tileset's metatile id. Fix: pick stamp + pencil on A, switch to B, assert no `--picked` cell and a canvas click sends no `beginStroke`.
6. **Minor — "Duplicate selects the new copy" untested.** `GbcMapEditing.tsx:85`. R15 survives (2 clean reruns; a first run failed an unrelated GbcApp test, see flake note). Fix: assert inspector title becomes `… event #<len>` after Duplicate.
7. **Minor (behaviour) — failed discard-before-switch is invisible outside Map mode.** `switchError` set at `GbcApp.tsx:126` but rendered only inside the `ready` map branch (`:262-269`). From World (`selectMapFromWorld`) or Dungeon/World `openMapFromWorld`, a 500 on `/discard` leaves the user in World with nothing shown — the click just does nothing. Violates spec Facts "every `.catch` has a visible error surface". Fix: render the `switchError` banner at `<main>`/body level regardless of mode (or `role=alert` in the header).
8. **Minor (deviation) — palette always shown.** Spec 7: "metatile strip shown for pencil/rect/bucket" (GBA `MapEditingWorkspace.tsx:101` gates it). GBC renders `GbcMetatilePalette` unconditionally (`GbcMapEditing.tsx:132`). Defensible (6b's read-only browse palette pre-existed; hiding it regresses read-only browsing); accept and record, or gate. Not counted as a defect if coordinator accepts.

Info (not findings):
- `&v=` omitted while `paintVersion==0` (deliberate; GBC always passes a session so GBA's `v=0` would change legacy URLs). Side effect: `GbcMapEditing` remounts on World↔Map, `paintVersion` resets, URL reverts to the pristine pre-paint URL. GBA has the same reset (`v=0`). **Live-check item**: paint → World → Map must show painted pixels (relies on `no-cache` + no validator, as GBA).
- R10 (drop `forMap` from `live`) survives = equivalent mutant: seed identity changes on every map switch (`ready` → null/new array), so seed keying subsumes it. Not a gap in behaviour.
- Flake: `GbcApp.test` "palette highlight resets when switching… (X17)" failed once (1079 ms) in a 4-file run, green on 2 reruns + baseline.
- Pencil trail (`e.buttons===1`) and multi-request reorder (server applies in arrival order, `gbcEditRoutes.ts:17-22`) are jsdom-invisible; live-check.

## Mutation table (bytes backed up to scratchpad, edit, narrowest files, `cp` restore, `git diff --quiet -- packages/ui` clean after every one)

| ID | Mutation | Files run | Result |
|---|---|---|---|
| U1 | pencil/bucket `paintAt` before `beginStroke`, outside `.then` | CanvasEdit+Canvas | red 2 |
| U2 | `endActiveStroke` awaits `Promise.resolve()` not `pendingPaintRef` | same | red 3 |
| U3 | debounce timer body no-op | same | red 2 |
| U4 | `&v=` emitted without a session | same | red 2 (1 per file) |
| U5 | block math /16 | same | red 7 |
| U6 | **literal**: hook called inside `GbcMapEditing` (map branch) | AppEditing+App | red 5 |
| U7 | `leave` ignores `isDirty` | AppEditing | red 2 |
| U8 | Toolbar default `TOOLS.slice(0,5)` | ToolbarGbc+Toolbar | red 4 |
| U9 | Duplicate `hour1`↔`hour2` | Inspector | **SURVIVED** (F4) |
| U10 | `availableTools={GBC_TOOLS}` ignoring writable | AppEditing | red 1 |
| R1 | world click skips `leave` | AppEditing+App+Root | **SURVIVED** (F1) |
| R2 | `openMapFromWorld` skips `leave` | same | **SURVIVED** (F1) |
| R3 | beforeunload cleanup no-op | same | **SURVIVED** (F3) |
| R4 | commit without `markClean` | same | red 1 |
| R5 | commit without `map.reload()` | same | red 1 |
| R6 | banner not cleared on success (`ok` no-op) | AppEditing+App+Inspector+CanvasEdit | **SURVIVED** (F2) |
| R7 | delete refusal swallowed | same | **SURVIVED** (F2) |
| R8 | warp warnings never set | same | **SURVIVED** (F2) |
| R9 | Duplicate x unclamped | Inspector | red 1 |
| R10 | `live` ignores `forMap` | hook+AppEditing | survived (equivalent, info) |
| R11 | switch before discard | AppEditing+App+Root | red 1 |
| R12 | Discard confirm removed | 4 files | **SURVIVED** (F2) |
| R13 | mouseleave does not end stroke | CanvasEdit+Canvas | red 1 |
| R14 | stamp not keyed by map | 4 files | **SURVIVED** (F5) |
| R15 | Duplicate doesn't select copy | 4 files | **SURVIVED** (F6) |
| R16 | hook gets `null` outside Map mode | AppEditing+App+Root | **SURVIVED** (F1) |
| R17 | dropper branch disabled | CanvasEdit+Canvas | red 1 |

Baseline: 9 files (gbc edit/app/canvas/inspector/toolbar/palette/hook + GBA `Toolbar.test`) 154/154 green.

## Implementer concerns — verdicts

- **U6 emulated, not literal**: literal now done → 5 red; U6 has teeth. But the implementer's emulation (null outside map mode) is R16, which **survives** without their extra hook reset — exposes F1.
- **Same-map re-click skips confirm**: AGREE, correct. GBA `App.tsx:94-101` prompts but confirming there does nothing (no discard, same `selected`); GBC confirming would call `discard()` and destroy edits for a no-op click. Only the text must match GBA, and it does.
- **Map-tab entry from World needs no guard**: AGREE. In World, `selected` changes only via `selectMapFromWorld`/`selectMap`/`openMapFromWorld`, all through `leave`; the Map button changes no selection. (Those paths are untested — F1.)
- **Delete-refusal only unit-covered**: understated — it has no coverage at all (R7 survives) → F2.
- **Unclamped event drags rely on server refusal → banner**: OK (move route 400 → `onMove` `.catch` → banner); untested at banner level (F2 family).
- **No live run**: coordinator's job; live-check items listed under Info.

## Spec facts found wrong

- Test 4: client (40,40) at zoom 1 is block **(0,0)**/step (0,0), not (1,1) — border ring puts origin at (32,32). (72,72) → block (1,1)/step (2,2) is the correct pin (implementer right).
- Design 7: `layoutSharedBy` is not in the Task 4 session response and `/api/groups` has no `blkPath`; the note cannot be built without a new route → drop correct.
- Design 8: "Map-tab entry from World" needs no separate guard (see above).
- Design 2: `eventsOverride?` redundant — `editSession.events` already carries the live events.
- Teeth table: U6 "must go red 10" — literal U6 reds 5 tests in test 10; U2/U3 counts differ from the table's (3/2), immaterial.
