# Task 16: final branch review (Plan 14.2 block editor)

Reviewer: Claude Opus (high-risk final review). Range `3f4a762..HEAD` (HEAD `f0ba2f0`). Read-only: no source edits,
no vitest, subject repos not touched.

**Verdict: APPROVE WITH FIXES.** Two Important items should be fixed before merge: new finding I1 (the palette
count goes stale after Save as new) and known item F5 (barrier gap). Both are small. Nothing found is Critical. Every
ownership, overlay, save and redo path I traced fails closed: a stale or unowned state ends in a 409 or a Save
refusal, never in silently corrupted bytes.

## Scope and method

- Read all 66 non-test source files in the diff. The server (`blockEditOwnership.ts`, `blockEditRoutes.ts`,
  `tilesetOverlay.ts`, the `index.ts`/`gbcEditRoutes.ts`/`gbcRoutes.ts` deltas) and core (`blockEdit/*`, loaders,
  `write/save.ts`, `gbc/write/save.ts`) got a line-by-line read. `usage.ts` got a targeted read (relations cache, GBC
  usage loop). The UI got a read of the session core, the block-editor hook and dialog, the context menu, MapSurface,
  both editing workspaces, the palettes, the tileset-version store and the adapters.
- I traced these paths by hand: stage → overlay sync → render; partial undo / release / redo reacquire (both
  families); failed commit; Save-as-new placement atomicity; a paint during another map's ownership; the request
  ordering of undo vs `/block/apply` through `useEditSessionCore` tickets and barriers; and 4xx vs 500 mapping in
  `routes().fail`.
- Mutation evidence: the brief forbids running vitest, so I ran no mutants. For each task the ledger records killed
  mutants, run by the conductor after green (e.g. 14b J1-J19, Task 8 M22-M24, Task 7 M1-M35). The new findings below
  are untested by nature. For each one I name the test that would pin it.

## Ownership and save/discard (traced; holds)

- `ownedTilesetPaths` (`blockEditOwnership.ts:81`) reads only the current `session.tilesetEdits`. Its doc (and the
  file header) say it also scans undo-side snapshots. The two readings agree: `mergeTilesetEdits` never drops a path
  (restored entries stay), every snapshot command sets `tilesetEdits` to a prefix state of the linear history, and
  Save/Discard close the session. So the paths owned now are exactly the paths touched on the undo side. The comment
  is wrong, not the code (Minor m1).
- Stage is atomic. Ownership, merge and placement bounds all throw before `stack.push` (`:117-134`), and a refused
  stage closes a session it opened (`:107-113`).
- Redo reacquires in both families: it checks ownership plus the baseline on a cloned candidate before it pops redo
  history (`commands.ts:60-70`, `index.ts:1021-1030`, `gbcEditRoutes.ts:394-405`). History and bytes stay unchanged on
  refusal.
- Commit runs `assertPreparedTilesetEdits` and `checkTilesetBaselines` before `writeFilesAtomically`. Only a
  successful write closes the session, and the overlay resyncs in `finally` (`index.ts:1092-1106`,
  `gbcEditRoutes.ts:450-457`). A failed write keeps the staged edit. The fingerprint covers the tileset entries
  because `prepareSave` includes them.
- Unsaved-addition refusal: `refuseUnsavedBlockRefs` runs before every grid write (pencil, rect, bucket) in both
  families (`index.ts:923-971`, `gbcEditRoutes.ts:201-205`). Even with no owner, an out-of-range id is still caught
  at Save by `metatile-out-of-range` (`gbc/write/guards.ts:70-79`, `write/guards.ts:16-52`).
- Async: every hub mutation is synchronous after `readBody`, so two maps applying to one file cannot interleave. The
  second gets `NOT_OWNER`. On the client, undo/redo await the session barrier, and `apply` drops an older-ticket
  reply (`useEditSessionCore.ts:128-133`). The revision covers the edited files' effective bytes plus the request
  map's effective grid, so a dialog opened across an undo or discard gets `STALE` at apply, never a wrong write.

## New findings

### Important

**I1. Save as new does not grow the block palette until the map payload is refetched (both families).**
`ui/src/gbc/GbcMapEditing.tsx:245` (`metatileCount={data.metatileCount}`), `components/MapEditingWorkspace.tsx:236-238`
(`primaryCount`/`secondaryCount` from `data`). `useGbcMap.ts:31-45` and `useMapLayout.ts:51-66` refetch only when
the map name changes. Nothing refetches after `/block/apply` or after a `tilesetVersion` bump.
- Failure scenario: GBC NewBarkTown, palette right-click block $10, Save as new. The hub appends $28 (file now 41
  blocks), and the canvas and thumbnails refresh through `tv`. The palette still shows 40 blocks, so the user cannot
  pick $28 to paint with. That is the whole point of the palette entry (Q9: "appends block id N"). The same happens
  on GBA with `secondaryCount`. Switching away and back makes the block appear.
- The reverse also happens: the user reopens the map while the append is staged (palette now 41), then undoes the
  append. The palette still offers $28, its thumbnail is out of range, and painting it is accepted, because no owner
  remains (`refuseUnsavedBlockRefs` returns early). Save then refuses with `metatile-out-of-range`. This fails
  closed, but it is confusing.
- Spec: §Rendering "every view of every map using the changed files redraws ... block palette", plus P5/Q9.
  Task 15 checked bytes and thumbnails, not the palette length.
- Fix: put the effective counts (GBA `primaryCount`/`secondaryCount`, GBC `metatileCount`) in the session body
  (`sendSession` / `sessionBody`) and prefer them over `data` in both workspaces. A simpler alternative is to refetch
  `/api/map/<name>` when `useTilesetVersion()` changes. Test: apply Save as new from the palette, then assert the
  palette renders cell N (GBC) / N+split (GBA); undo, then assert it is gone.

### Minor

**m1. Stale contract comments in `server/src/blockEditOwnership.ts:1-8,18-22,75-80`.** The header still says "every
body stubbed to `throw new Error("not implemented (Task 9)")`", and `ownedTilesetPaths` claims to read undo-side
snapshots. Failure scenario: a later maintainer "fixes" the implementation to match the doc, or trusts that a stub
throws. Fix: rewrite both comments to describe the current-edits rule and why it is equivalent (merge never drops a
path).

**m2. The dialog can be closed while Apply is in flight, and the edit then lands.** `shared/BlockEditorDialog.tsx:118`
(backdrop `onMouseDown`) and `:176` (Cancel) stay enabled in status `applying`. Only Escape is blocked (`:97`).
Failure scenario: the user presses OK on a slow apply, then Cancel. The dialog closes, and `useBlockEditor` drops the
reply (generation bump), but the hub has staged the edit and the canvas redraws with it. The user believes they
cancelled. The edit is undoable, so this is Minor. Fix: disable Cancel and ignore backdrop clicks while
`editor.status === "applying"`, matching D22's Escape rule.

**m3. The GBC block 0 edited from the palette over-confirms and over-counts.** `core/src/blockEdit/gbcOps.ts:248-250`
(`effectiveGrid(...).includes(req.blockId)`) and `usage.ts:159-163` (interior counts raw cells equal to the id). For
`blockId === 0`, every raw-0 cell on another map counts as a use, yet those cells draw the border, not block 0
(spec Q8, `gbc/render/map.ts`). Failure scenario: a palette edit of block 0 on any map opens the confirm step and
lists many maps whose drawing does not change. Fix: when `blockId === 0`, skip the interior match (those cells are
already reported through `border` / `block0AsBorder` of the border id).

**m4. `/block/check` never runs the ownership check, so a non-owner sees the confirm list and is refused only at
Apply.** `server/src/blockEditRoutes.ts:183` vs `:187`. The GET already computes `owner` (`:264`, `:347`), but
the dialog never shows it. Failure scenario: CherrygroveCity edits a johto block while NewBarkTown owns
`johto_metatiles.bin`. The user goes through the 49-map confirm, presses Apply, and only then gets `NOT_OWNER`.
Fix: in check mode, call `requireTilesetOwnership` and answer it as a `refusal`. Optionally show `info.owner` in the
dialog. This pairs with F3.

**m5. The tileset version store is max-only across a hub restart.** `ui/src/shared/tilesetVersion.ts:24-28`. If the
hub process restarts while the page stays open, the server version restarts at 0. The first k edits announce
versions at or below the stored maximum and are ignored, so every image URL keeps its old `tv` and stays stale.
Fix: have the hub send an instance id with `tilesetVersion` and reset the store when it changes. Plan H.

## Known items

| Item | Confirmed? | Severity | Recommendation |
|------|-----------|----------|----------------|
| F1 fresh page hides hub-staged edits | Yes. `useEditSessionCore` starts `isDirty/canUndo` false and reads flags only from mutation replies (`useEditSessionCore.ts:175`). Nothing fetches the hub session on mount. The mechanism predates 14.2, but 14.2 raises the cost: the hidden owner blocks other maps (`NOT_OWNER`), and its Save and Discard buttons are disabled until another edit is made | Important | Plan H, first item: on map open, fetch the session flags (e.g. reuse `/plan` or a cheap `GET /api/edit/<map>/state`) |
| F2 duplicate React key 162 (GBA Behavior) | Yes. `BlockEditorDialog.tsx:158` maps options to `String(value)`, and `SelectField` keys options by value. The second alias is also unselectable (same value), which is harmless | Minor | Fix now: dedupe values and label them `MB_A / MB_B` |
| F3 ownership refusal omits the requesting map | Yes. `requireTilesetOwnership` message (`blockEditOwnership.ts:96`), and `routes().fail` adds no prefix (`blockEditRoutes.ts:145-150`). Redo prefixes `${name}:` (`index.ts:1028`). Spec Acceptance 5 requires both maps | Minor | Fix now: prefix `${name}: ` in the apply path (or pass the requester into `requireTilesetOwnership`); see m4 |
| F4 GBC groups place run-time reserved tiles | Yes. `placeGroup` (`core/src/blockEdit/placement.ts:9-12`) has no reserved filter, while `TilePicker` blocks a single reserved pick. This matches the spec text | Minor | User decision. If skipped, add a `reserved` predicate to `placeGroup` (GBC only); else accept |
| F5 "Edit block" enabled during a pending undo | Yes. `editBlockDisabledReason` and the palette path consult only `hasPendingSessionMutations` (`MapEditingWorkspace.tsx:158,230`, `GbcMapEditing.tsx:184,200`), which tracks only `/event/create` and `/block/apply` (`useEditSessionCore.ts:116`). The workspace already counts undo/redo/discard/paint in `editRequests` (`MapEditingWorkspace.tsx:84-99`) but this check ignores it. Harm is bounded: the dialog's revision makes the later apply `STALE`, so the user loses a composed draft but no bytes go wrong. Spec 3e fails as written | Important | Fix now: use `requestBusy` (`editRequests > 0 \|\| creating \|\| hasPending...`) for the menu, the K tool and the palette. The palette callback is `useCallback([mapName])`, so read `editRequests` through a ref. Test: hold `/undo`, right-click, expect the item disabled (both families) |
| Task 6 quality Minor 3 (tile printed in decimal vs `$XX`) | Yes. `gbcOps.ts:179,183` decimal, `:191` `$XX` | Minor | Accept / Plan H |
| Task 7 spec N1 (first-layout-only structural mutant survives) | Yes. Test-side; code correct (`gbaOps.ts:207`) | Minor | Accept |
| Task 7 quality N2 (no `cause`; planner's own `mapsByGridFile` throws project-wide on one dangling layout) | Yes. `gbaOps.ts:70-80,255-260` | Minor | Plan H (reuse usage.ts relations) |
| Task 7 quality N3 (readability) | Yes | Minor | Accept |
| Task 7 quality N4 (test residuals) | Yes | Minor | Accept |
| Task 8 quality M2 (one dangling layout or broken tileset makes `planSave` throw once a tileset edit is staged) | Yes. `blockEdit/save.ts:57` (`layoutForMap` for every map), `:75` | Minor | Plan H (same fix as N2) |
| Task 8 quality M4 (near-copy assertion) | Yes | Minor | Accept |
| Task 8 quality M6 (dead/inconsistent bits) | Yes. `save.ts:51` redundant canonicalisation | Minor | Accept |
| Task 9 quality m3 (`statSync` on a missing metatiles file → 500) | Yes. `index.ts:931`, `gbcEditRoutes.ts:203`. It runs on every non-empty paint, owner or not. Such a project cannot render either | Minor | Plan H (catch → 409 `BAD_VALUE` naming the path) |
| Task 11a spec m4a (GET planner refusal → 409 untested) | Code path present (`blockEditRoutes.ts:259,291-294`). I did not find a pinning test | Minor | Plan H (one test per family) |
| Task 11a quality m2a, m2c (fixture-dependent oracles) | Test-side, not re-run | Minor | Accept |
| Task 13b long confirm list | Yes. `BlockEditorDialog.tsx:170` has no cap (the Save dialog caps at 8, `SaveDialog.tsx:211`) | Minor | Plan H (or fix with F2; it is the same few lines) |
| Task 13b / D19 GBC palette select shows the loaded tile's palette after placement | Yes. `BlockEditorDialog.tsx:146` falls back to `info.block.tilePalettes[square]`, which belongs to the loaded tile. The preview is correct | Minor | Plan H (GET returns per-tile palette names so the fallback can use the placed tile) |
| Task 14a focus restore after menu/dialog | Yes. Documented gap, `DESIGN.md:458` | Minor | Plan H |
| Task 14b tool enabled when no spec / no `blockCheck` | Yes, unreachable today (both adapters pass a spec; both sessions implement `BlockEditSession`) | Minor | Accept |
| GBC toolbar overflow at 720 (`scrollWidth` 803) | Not re-measured (no live run in this review). The cause is plausible: one more labelled tool in the GBC rail | Minor | Plan H (DESIGN.md toolbar wrap/compact rule) |
| Accepted: 11b K12, 13a post-unmount asserts, 13b K5b | No harm found | n/a | Keep accepted |

## Parity and boundaries

- One shell: both families mount `BlockEditorDialog` from their workspace, share `useBlockEditor`,
  `useMapContextMenu`, `MapSurface`'s tool branch and the version store, and differ only through `blockEditorSpec`.
  Parity holds, except that both families share I1, F5 and m2.
- Error boundaries: planner refusals → 409 `{error, code}`; malformed body/JSON/selector → 400 `BAD_VALUE`; a short
  grid → 409 `BAD_GRID`; anything else → 500 `INTERNAL_ERROR` (`blockEditRoutes.ts:145-150`). Paint and redo map
  `BlockEditRefusal` to 409 in both hubs. One remaining 500: m3 (Task 9).
- Parse edges checked: the collision patch indexes `tilecoll` calls by source order with comments stripped
  (`scanCalls`), and a wrong argument count refuses rather than re-indexing. CRLF and a missing final newline are kept
  on append. The palette map is shape-validated by the loader's strict machine before the splice. The PNG chunk
  framing check refuses truncated input, trailing bytes after IEND, a bad CRC and a non-2-bit or interlaced image;
  the copy keeps every non-IDAT chunk and collapses IDATs to one. GBA attribute masks round-trip correctly for 32-bit
  high masks (`(v << s) & mask >>> s`).
