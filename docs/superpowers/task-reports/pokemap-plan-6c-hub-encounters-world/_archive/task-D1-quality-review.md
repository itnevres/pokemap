# D1 quality review — commit `15b8368`

**Verdict: changes requested.** Reviewed the committed diff only (`git show`/`git diff`), including the D1 execution spec and the changed tests. No implementation files were edited and tests were not run.

## Findings

### P1 — `POST /api/world/placement` turns valid JSON `null` into a 500 and accepts non-finite coordinates

`packages/server/src/gbcRoutes.ts:432-444` casts the result of `JSON.parse` to an object-shaped TypeScript type, then dereferences `parsed.map` without a runtime object/null check. A request body of `null` parses successfully, throws at `parsed.map`, and reaches the outer catch as a 500 instead of the route's documented malformed-body 400 response.

The number check also accepts `1e400`: `JSON.parse` yields `Infinity`, which passes `typeof === "number"`. `writeSidecar` serializes that as `null`, so the endpoint returns 200 while persisting a placement whose next `/api/world` payload fails the GBC runtime guard (`x` is `null`).

Validate that the parsed value is a non-null, non-array object before reading its fields, and require `Number.isFinite(x)` and `Number.isFinite(y)`. Add route tests for `null` and `1e400` that assert 400 and verify no sidecar write occurs.

### P1 — a successful manual placement does not update the GBC tree's visibility state

`GbcApp` obtains a private `/api/world` snapshot for `worldVisibility` (`packages/ui/src/gbc/GbcApp.tsx:75-79`) while `GbcWorldCanvas` independently fetches the world and holds its optimistic manual overrides locally (`packages/ui/src/gbc/GbcWorldCanvas.tsx:436-444`). On a hidden-map drop, the canvas changes only its local override (`1040-1046`); it does not notify the app or refetch the app-level snapshot.

Consequently an automatic `INDOOR`/`GATE` map becomes visible on the canvas but remains greyed in the MapTree until a reload, contradicting D1's requirement that manual placements override hidden kinds consistently in the tree and canvas. The same divergence occurs after Shift-dragging a shown map insofar as the tree does not observe the new manual status.

Lift the world payload/placement override state to a common owner, or have a successful placement callback update/refetch the app visibility data. Add an integration test that enters World mode, drops an automatic indoor map, then asserts both that it draws and that its tree row loses `map-tree__map--greyed`.

### P2 — the new Shift-drag persistence path has no behavioral test

The new map-drag branch (`packages/ui/src/gbc/GbcWorldCanvas.tsx:811-862`) is distinct from the tested HTML drop branch. The only D1 canvas test exercises `fireEvent.drop` (`packages/ui/test/gbc/GbcWorldCanvas.test.tsx:705-725`); it never starts a Shift drag, moves it, releases it, or asserts the POST coordinates. A regression that stops `hitTest` from being selected under Shift, loses the grab offset, or omits `commitMapDrag` still passes the D1 addition.

Add a canvas test using Shift+mouseDown, mouseMove, and mouseUp on a visible map. Assert the map is redrawn at the rounded location and that exactly one placement POST carries those coordinates. A leave-before-mouseup case would also cover the new `onMouseLeave` commit path.

## Checks that passed by inspection

- The wire contract adds required `mapType` and `manual` fields, and the guarded-fetch validator requires both.
- The GBC hidden set is scoped through `MapTree`; GBA retains its default hidden set and no GBA test file changed in this commit.
- The route removes only GBC's placement endpoint from the GBA-only refusal expression; the other listed refusals remain.
- Manual placements are applied before payload serialization, and a manual `INDOOR`/`GATE` passes the canvas visibility filter.
- The PerfPlus test snapshots the absent sidecar, read-guards restoration, and removes the newly-created file only when its bytes still match the test write.

## Minor maintenance note

`packages/ui/src/gbc/GbcWorldCanvas.tsx`'s introductory scope comment still says GBC has “no drag-to-place” and “no sidecar POSTs.” Update it with the new D1 behavior to keep the file's stated constraints reliable.
