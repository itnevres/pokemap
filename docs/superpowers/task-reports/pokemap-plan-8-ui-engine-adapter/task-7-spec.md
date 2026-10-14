# Task 7 executed spec (reduced per user decision 2026-10-13)

BASE = `beeeb7d`. The plan's Task 7 text is `task-7-brief.md`; this spec overrides it.

## User decision (binding)
Step 2's stop rule fired: `App.tsx` and `gbc/GbcApp.tsx` differ for real (below). Do ONLY this:
lift the identical sections into shared hooks. **Skip** Step 1 (`family/types.ts`, `family/gba.ts`,
`family/gbc.ts`, the EngineAdapter test) and `shared/FamilyApp.tsx`.

## Real differences between the shells (recorded, NOT to be merged)
- `leave()`: GBC discards the server session BEFORE switching (`session.discard().then(go)`) and shows
  `switchError` on failure; GBA only confirms, then switches.
- GBC only: `switchError` banner, time of day, hovered metatile (`setHoveredMetatileId(null)` in `select`),
  manual placements, defects banner, dungeon `filterCache`, `map.reload` after save.
- GBA only: `SignComposer` + `applyExternalMapUpdate`, `useMapEditing` (tool/stamp/event state at App level so it
  survives Map↔World), `MapEditingWorkspace` host wiring.
- The session hooks differ in shape (`UseEditSessionResult` vs `UseGbcEditSessionResult`); Task 5 kept both.

## Anchors (BASE line numbers)
- beforeunload effect: `packages/ui/src/App.tsx:78-86`, `packages/ui/src/gbc/GbcApp.tsx:110-118`. Byte-identical
  apart from the session variable name.
- Stroke-chain registry: `App.tsx:97-100` + `:104`, `GbcApp.tsx:131-134` + `:139` (`chains` ref Set,
  `onStrokeChain`, `strokeSettled` arrow passed to `useContextEditing`).
- Repeated type `{ settled(): Promise<void> }`: `App.tsx:97-98`, `GbcApp.tsx:131-132`,
  `components/MapCanvas.tsx:67`, `gbc/GbcMapCanvas.tsx:134`. `StrokeChain` in `shared/useStrokeChain.ts:9-19`
  already declares `settled(): Promise<void>`.
- `useMapEditing.resetForMapChange`: `hooks/useMapEditing.ts:302-318` (def), `:345` (returned);
  caller `App.tsx:93-96`. The render-phase reset at `useMapEditing.ts:236-240` (`if (visit.changed)`) already
  clears `selectedEvent`, `currentStamp` and `eventOpError` on every map change.
- Core discard: `shared/useEditSessionCore.ts:64-70`; line 69 `setStored(null)` runs unconditionally after the await.

## Rulings
- **R1** New file `packages/ui/src/shared/useBeforeUnloadGuard.ts` exporting
  `useBeforeUnloadGuard(isDirty: boolean): void` — the effect body moved verbatim (handler registered only while
  dirty; `e.preventDefault(); e.returnValue = "";`). Keep GBA's I6 rationale comment (App.tsx:70-77) as the
  hook's doc comment, condensed; both shells call it in place of their effect and keep a one-line pointer comment.
- **R2** In `shared/useStrokeChain.ts` add
  `export type SettledChain = Pick<StrokeChain<unknown>, "settled">;` and
  `export function useStrokeChainRegistry(): { onStrokeChain(chain: SettledChain, mounted: boolean): void; strokeSettled(): Promise<void> }`.
  Both returned functions are referentially stable (useCallback with `[]`). `strokeSettled` =
  `Promise.all([...set].map((c) => c.settled())).then(() => {})` over the chains registered at call time.
  Both shells use it; `MapCanvas.tsx:67` and `GbcMapCanvas.tsx:134` type the prop with `SettledChain`.
  No other `{ settled(): Promise<void> }` literal remains in `packages/ui/src` outside `useStrokeChain.ts`.
- **R3** Fold-in (Task 6 deferred minor): delete `resetForMapChange` from `useMapEditing` (def + return member)
  and its call in `App.select` (select becomes `setSelected(name)`; keep `select` as a named function since
  `useContextEditing` and `changeSelection` take it). Move the two "why" comments (selected event belongs to its
  map; stamp is tileset-specific) onto the `if (visit.changed)` block. Existing-test edits authorised for R3 ONLY:
  (a) `packages/ui/test/useMapEditing.test.tsx`: the `resetForMapChange` test becomes the same test driven by a
  map change — `renderHook((p) => useMapEditing({ editSession, layoutData: null, mapName: p.mapName }), { initialProps: { mapName: "A" } })`,
  same setup and same four final assertions, with `rerender({ mapName: "B" })` replacing the reset call; retitle it
  "a map change clears selectedEvent and currentStamp but keeps activeToolKind and collisionValue".
  (b) remove the `resetForMapChange: vi.fn(),` line from `test/MapEditingWorkspace.test.tsx:63` and
  `test/MapEditingWorkspaceActive.test.tsx:29`. (c) `test/AppContextVisit.test.tsx:2` comment may say the pin now
  guards the visit reset (wording only). Nothing else in an existing test changes.
- **R4** Fold-in (Task 5 Q2): `useEditSessionCore.ts:69` becomes
  `setStored((prev) => (prev?.forMap === mapName ? null : prev)); // a switch during the await keeps the new map's record`.
  Line 68 (`seq.current.applied = seq.current.issued`) stays as is (residual: a reply for the NEW map issued
  during the await is dropped; recorded as a deferred minor, not fixed here).
- **R5** No behaviour change except R4 (a discard that resolves after a map switch no longer wipes the new map's
  record). No live check beyond the plan's Step 3 smoke, which the coordinator runs.

## Tests (write first; items 1-2 and 4 must be RED at BASE)
1. `packages/ui/test/shared/useBeforeUnloadGuard.test.tsx` (new): (a) dirty → a dispatched
   `new Event("beforeunload", { cancelable: true })` on `window` has `defaultPrevented === true`; (b) clean → not
   prevented; (c) rerender dirty→clean → not prevented; (d) unmount while dirty → not prevented.
2. `packages/ui/test/shared/useStrokeChainRegistry.test.tsx` (new): (a) `strokeSettled` waits for every registered
   chain (two deferred chains; it stays pending until both resolve — check with a flag after a microtask flush);
   (b) a chain unregistered with `mounted=false` no longer blocks (a never-settling chain registered then
   unregistered → `strokeSettled()` resolves); (c) `onStrokeChain` and `strokeSettled` are the same references
   after a rerender; (d) with no chains it resolves.
3. `useMapEditing.test.tsx` rewrite per R3(a) (green at BASE too — it is a pin of the remaining reset).
4. `packages/ui/test/shared/useEditSessionCore.test.tsx`: ADD (new `it`, existing ones byte-unchanged)
   "a discard that settles after a map switch keeps the new map's record": discard on A held by a deferred fetch;
   `rerender({ map: "B", seed })`; `act(() => apply({ state: () => ({ n: 9 }), ...flags }))` (no ticket); resolve
   the discard with `response()`; await it inside `act`; expect `state` `{ n: 9 }` and `isDirty` true.

## Oracle (existing behaviour must hold)
`App.test.tsx`, `gbc/GbcAppEditing.test.tsx`, `gbc/GbcAppWorldGuard.test.tsx` (beforeunload witnesses),
`AppContextStroke.test.tsx`, `gbc/GbcAppContextStroke.test.tsx`, `AppContextEdit.test.tsx`,
`gbc/GbcAppContext.test.tsx`, `AppContextVisit.test.tsx`, `AppVisitGuard.test.tsx`, `shared/useStrokeChain.test.tsx`,
`shared/useEditSessionCore.test.tsx`, `useEditSession*.test.tsx`, `gbc/useGbcEditSession*.test.tsx` pass unchanged.

## Coordinator mutations (after green)
M1 guard drops `if (!isDirty) return` → kill in shared + both families. M2 `strokeSettled` returns
`Promise.resolve()` → kill in shared + both family context-stroke suites. M3 registry ignores `mounted=false`
→ kill in shared. M4 R4 reverted to `setStored(null)` → kill in core. M5 `if (visit.changed)` block removed
→ kill in `useMapEditing.test.tsx` and `AppContextVisit.test.tsx`.
