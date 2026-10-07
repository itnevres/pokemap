# Task 4 executed spec: GBC server session store + edit routes

Plan 7 Task 4, re-granularised against the real code. Risk class: **medium-high**: request-body parsing at an error boundary, async interleaving, cache invalidation, and the hub's dirty guard. Reviews: Opus spec review, Sonnet quality review.

Builds on Task 1 (`gbc/write/save.ts`, `guards.ts`), Task 2 (`gbc/edit/paint.ts`) and Task 3 (`gbc/edit/events.ts`). Read their final code, not their specs: exact names may have moved in fix rounds.

## Shape (binding)

- **Same paths as GBA:** `/api/edit/:map/...`. The hub already dispatches to the open project's handler (Plan 7 grounding).
- **New file `packages/server/src/gbcEditRoutes.ts`.** `gbcRoutes.ts` is already 681 lines, and its header asks for thin dispatch. It exports:

  ```ts
  export function createGbcEditRoutes(proj: GbcProject, hooks: { onCommit(): void }): {
    /** Returns true if it handled (or is asynchronously handling) the request. */
    handle(req: IncomingMessage, url: URL, send: (code: number, body: unknown) => void): boolean;
    /** Current blocks of an open session for `name`, else undefined (render override). */
    openBlocks(name: string): Block[] | undefined;
    dirtyMaps(): string[];
    closeAll(): void;
  }
  ```

  `gbcRoutes.ts` changes:
  - construct it once with `onCommit` clearing `renderCache`, `warpCache` and `coverageCache` (set them to `undefined`/`.clear()`). `worldCache` and `metatileCache` don't depend on blocks or events, so leave them;
  - call `edit.handle(...)` before the 501 fallback;
  - drop `edit\/` from `GBA_ONLY_ROUTE_RE` (keep `world\/dungeons$|sign\/`) and fix the comment above it;
  - render route: if `edit.openBlocks(name)` is defined, render with `blocksOverride` (`renderGbcMap` already supports it) and **don't read or write `renderCache`**;
  - `dirtyMaps: () => edit.dirtyMaps()`; `dispose` also calls `edit.closeAll()`.
- **New file `packages/server/src/gbcEditSessions.ts`** (store). Entry: `{ session: GbcEditSession; stack: EditCommandStack<GbcEditSession>; strokeStartBlocks: Block[] | null }`. Store: `open(name)` (lazily `openGbcEditSession`), `has`, `close`, `dirty()` (sorted names with `session.isDirty`), `closeAll()`. Mirror `editSessions.ts`'s doc comments in substance.
- **Generic reuse (type-only edits to GBA files; GBA behaviour unchanged):**
  - `packages/core/src/edit/commands.ts`: `EditCommand<S = EditSession>`, and `EditCommandStack<S extends { isDirty: boolean } = EditSession>`.
  - `packages/server/src/editSessions.ts`: `snapshotCommand<S extends object = EditSession>(label, prev: Partial<S>, next: Partial<S>): EditCommand<S>`. If the default-typed GBA call sites need any change beyond that, stop and report it.
  - The GBC snapshot is `{ blocks, eventsText, events }`.

## Routes (all under `/api/edit/:map/`)

The name goes through `decodeMapName`: malformed → 400, unknown → 404 (check `mapNames` first, as every GBC route does). Unknown sub-route under `/api/edit/` → 404.

**Session response** (`sendSession`): `{ blocks, events, isDirty, canUndo, canRedo }`. **Nothing-open response:** `{ blocks: [], events: null, isDirty: false, canUndo: false, canRedo: false }`.

| Method + path | Behaviour |
|---|---|
| POST `paint/begin` | open (implicit); set `strokeStartBlocks` (a copy) only if null (GBA's re-begin rule); sendSession |
| POST `paint/apply` | body `{ tool, … }`. `pencil`: `{ targets: {x,y}[], stamp, origin }`. `rect`: `{ x0,y0,x1,y1, stamp, origin }`, expanded server-side like GBA. `bucket`: `{ x, y, replacement: { metatileId } }`. `shift`: `{ dx, dy }`. Apply the Task 2 functions to `session.blocks` with `layout.width/height`; sendSession |
| POST `paint/end` | if `strokeStartBlocks` and `changedBlockIndices(start, blocks).length > 0`, push `snapshotCommand("paint", {...snap, blocks: start}, snap)`; clear `strokeStartBlocks`; sendSession |
| POST `undo` / `redo` | nothing-open shape if no session; else stack op; sendSession |
| POST `discard` | close; nothing-open shape (idempotent) |
| GET `plan` | `formatDiffJson(planGbcSave(...))` |
| POST `commit` | plan; refusals → 400 `formatDiffJson(plan)`; `commitGbcSave` in try → 500 `{ error }` on throw; then `hooks.onCommit()`, close the session, 200 `formatDiffJson(plan)` |
| POST `event/move` | `{ kind, index, x, y }` → `moveGbcEvent` |
| POST `event/add` | `{ kind, args: string[], objectConst?: string }` → `addGbcEvent(..., { mapConsts: Set(proj.maps constNames), objectConst })` |
| POST `event/delete` | `{ kind, index }` → `deleteGbcEvent`. For `kind:"warp"`, also `warpRenumberWarnings` = `findGbcWarpsRetargetedByDelete(...)` over every map's warps (see below). The response is sendSession + `warpRenumberWarnings` (always present for delete; `[]` for non-warp kinds) |

**Event op wiring:** take `prev` snapshot → call the core op on `session.eventsText` → on success assign `eventsText`/`events` and push `snapshotCommand(label, prev, next)`. **A core op throw is a user-input refusal → 400 `{ error: message }`**, and the session is unchanged. Bad body shapes → 400 naming the field. Bad JSON → 400.

**Paint body validation (stricter than GBA's `validateStampAndOrigin`):**
- `stamp.width`/`height` positive integers;
- `cells.length === width*height`, each `{ metatileId: integer }`;
- `origin` `{x,y}` integers;
- `targets` an array of integer `{x,y}`;
- bucket `replacement.metatileId` an integer;
- `dx`/`dy` integers;
- rect corners integers.

Range is *not* checked here (that's the save guard's job), but non-integers are 400.

**Warp renumber scan:** no cache. Build `maps` per delete: for every `proj.maps` entry use the open session's `events.warps` if one is open (for the deleting map, the **pre-delete** warps), else `loadGbcMapEvents(proj.root, map).events.warps`. A `ponytail:` comment notes the cost (391 small file reads per warp delete) and the upgrade path (cache invalidated on commit). Measure and record the time in the report.

**Concurrency:** same accepted gap as GBA (a `readBody` await between a read and a write of the session). Copy the substance of GBA's comment. Don't build locking.

## Tests: `packages/server/test/gbcEditRoutes.test.ts` (new) + edits

**Hermetic:** `beforeAll` copies PerfPlus to a `mkdtemp` dir with `cpSync(GBC_SUBJECT_ROOT, tmp, { recursive: true, filter: (src) => !/[\\/]\.git([\\/]|$)/.test(src) })`, and `afterAll` does `rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })`. Gate with `describe.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT))`, hooks inside the describe (see `gbcRoutes.test.ts`'s comment on why). Build `const h = createGbcProjectHandler(tmp)` and serve it with `node:http`'s `createServer(h.handle)` on port 0, so tests can call `h.dirtyMaps()`/`h.dispose()` directly. **Nothing writes to the real PerfPlus**; assert PerfPlus `git status --porcelain` is empty in `afterAll`, through `spawnSync("git", [...])`. If the copy takes > 15 s, report it; don't silently raise timeouts.

1. `GET /api/edit/NewBarkTown/plan` gives 200 `{changes:[],refusals:[]}`.
2. Paint: `begin`, then pencil 1×1 at (0,0) to a different valid id, then `end`.
   - Response: `blocks[0]` changed, `isDirty` and `canUndo` true; `plan` has 1 binary change.
   - `h.dirtyMaps()` is `["NewBarkTown"]`.
   - Render: GET the render PNG before painting (populates the cache) and during the session; the bytes differ. After `discard`, the render equals the pre-paint bytes again, and `dirtyMaps()` is `[]`.
3. `rect`, `bucket`, `shift` each change the expected cells (spot-check against the Task 2 functions run in-test on the same input).
4. Each gives 400: an unknown tool; `cells.length` mismatch; `metatileId: 1.5`; a non-integer target; malformed JSON; an unknown map (404); a malformed name (400).
5. `paint/end` with no change pushes no undo step (`canUndo` false). A double `begin` keeps the first snapshot: paint, then `begin` again, then `end`, then `undo` restores the pre-first-paint blocks.
6. `undo`/`redo` round-trip blocks and events. `undo` on a never-opened map gives the nothing-open shape.
7. Event move/add/delete update `events`. Then `plan` shows 1 `text` change. `undo` reverts `events` and plan returns to `[]`. A core refusal (move `x: 999`; delete NewBarkTown object 0, whose const is referenced) gives 400, and the session is unchanged (compare with a `plan` before and after).
8. Delete NewBarkTown warp 0: `warpRenumberWarnings` includes every map whose warps target `NEW_BARK_TOWN` with `destWarp >= 1`. Pin the exact list by measuring, cross-check it with an in-test independent scan, and record it in the report.
9. Commit (paint 1 block and move 1 event):
   - 200; the copy's `.blk` differs from its pre-commit bytes in exactly 1 byte, and the copy's `.asm` equals the expected spliced text;
   - `dirtyMaps()` is `[]`;
   - the next render equals `encodePng(renderGbcMap(openGbcProject(tmp), "NewBarkTown"))` and differs from the cached pre-commit PNG;
   - `GET /api/world` reflects the moved warp, if it's a warp. Move a warp so `warpCache` invalidation is observable, and assert the moved warp's `source` coordinates in the world payload.
10. Refused commit: paint id 200 gives commit 400 with a `metatile-out-of-range` refusal; the copy's files are byte-unchanged.
11. CeruleanCave2F: paint, then `plan` shows `layout-not-writable`; commit 400; `.blk` unchanged (still 400 bytes).
12. A shared layout (a `maps/House1.blk` user): the plan summary ends ` (shared by 50 maps)`.
13. `h.dispose()` empties `dirtyMaps()`, and later requests 503.

**Edits to existing tests (each named in the report, U1 rule):**
- `gbcRoutes.test.ts`'s 501 table: remove the `/api/edit/:name/undo` row only (that path is now served). The `sign/` and `world/dungeons` rows stay.
- If GBA tests need any change for the generics, **stop and report**. They shouldn't.

Run the narrowest files plus `packages/server/test/gbcRoutes.test.ts`, `packages/server/test/hub*.test.ts`, and the GBA `packages/server/test/{api,saveRoutes,editRoutes}*.test.ts` that exist (to prove GBA unchanged), one at a time.

## Teeth-proof

| ID | Mutation | Must go red |
|---|---|---|
| S1 | render route ignores `openBlocks` | 2 |
| S2 | session render writes into `renderCache` | 2 (post-discard equality) |
| S3 | `onCommit` doesn't clear `renderCache` | 9 |
| S4 | `onCommit` doesn't clear `warpCache` | 9 (world) |
| S5 | `dirtyMaps` returns `[]` | 2 |
| S6 | `paint/begin` overwrites `strokeStartBlocks` | 5 |
| S7 | event op mutates the session before the core op succeeds | 7 (refusal leaves the session unchanged) |
| S8 | commit doesn't close the session | 9 |
| S9 | warp scan uses disk warps for the deleting map instead of the session's pre-delete warps, after an earlier unsaved warp edit on the same map | 8b: add a sub-test that first moves another warp unsaved, then deletes |
| S10 | `dispose` doesn't `closeAll` | 13 |

## Rules

Same as earlier tasks: TDD, a commit per green step, pathspec commits, no git checkout/restore/stash, `npm run typecheck` before each commit, and never write the real PerfPlus or the GBA subject. Don't run the full suite.

## Coordinator amendment (pre-dispatch)

- Put the hermetic copy in a **shared helper** that Task 6 reuses:
  - `copyGbcSubjectToTemp(): string`, in `packages/core/test/gbc/helpers/corpus.ts`;
  - it does a `cpSync` recursive copy of `GBC_SUBJECT_ROOT` to an `mkdtemp` dir, filtering out `.git`;
  - companion `removeTemp(dir)`: `rmSync(dir, { recursive: true, force: true, maxRetries: 3 })`.
  Measure and record the copy time.
- Task 3's final API is `moveGbcEvent`/`addGbcEvent`/`deleteGbcEvent`/`findGbcWarpsRetargetedByDelete(maps, { mapName, mapConst, index })` in `gbc/edit/events.ts`. Re-check the final code after Task 3's fix round.
