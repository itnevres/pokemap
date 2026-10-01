# Task C2 executed spec: tree auto-scroll on world selection (both families)

Plan §C2, criterion 5. **U1:** both families; `MapTree` is shared. GBA behaviour changes only where this
spec says so. Expected existing-test edits: **none** (the jsdom `scrollIntoView` stub goes in
`test/setup.ts`, which is infrastructure; name it in the report). Cite `WorldCanvas.tsx` by grep
anchor. Base: the branch HEAD after C1 closed.

## Ground truth (measured 2026-10-01 at `b4e08d3`; C1 does not touch these parts)

- `components/MapTree.tsx` (98 lines), used by both `App.tsx` and `GbcApp.tsx`:
  - a filter `<input className="map-tree__filter">` (`useState` `filter`, case-insensitive substring);
  - one **uncontrolled** `<details className="map-tree__group" open>` per group (the user collapses it
    natively; React never re-sets `open` because the prop never changes);
  - each map is `<button className="map-tree__map" aria-current={selected === m ? "true" : undefined}>`;
  - no ref, no effect, no scrolling today.
- GBC is already wired: `GbcWorldCanvas` calls `onSelectMap(hit.map)` on a single click that hits a map
  (only on a hit), and `GbcApp` passes `onSelectMap={selectMapFromWorld}` (`setSelected` only). `GbcApp`
  keeps a separate `jumpTarget` state, set only by tree clicks, because passing `selected` as
  `jumpToMap` made the first canvas click jump the view (spec review F1; pinned by `GbcApp.test.tsx`
  "a canvas click (no tree click yet) does not jump the view -- pinned exact view (spec review F1)").
- **GBA is not wired.** `WorldCanvas` has no `onSelectMap` prop; its single click (grep
  `const onCanvasClick =`) returns early on ctrl/meta/shift or `dragMovedRef.current`, hit-tests, and
  only sets its own internal `selected` Set. `App.tsx` passes `jumpToMap={selected} jumpToken={selectVersion}`,
  i.e. the exact shape GBC's F1 fixed: the jump effect (grep `appliedJumpTokenRef`) records a token as
  applied only once `jumpToMap` is non-null, so wiring a canvas click to `setSelected` alone would make
  the first canvas click jump.
- `App.tsx` `selectMap(name)` (tree click): `editSession.isDirty && !window.confirm(...)` guard, then
  `setSelected`, bump `selectVersion`, `setSelectedEvent(null)`, `setCurrentStamp(null)`. The edit
  session follows `selected` in every mode, so changing `selected` from the world view needs the same
  dirty guard. `App.test.tsx` "in Map mode with a dirty session, attempting to switch maps shows a
  confirm() guard…" shows how to get a real dirty session in a test.
- jsdom has no `Element.prototype.scrollIntoView`. `GbcApp.test.tsx` and `GbcMetatilePalette.test.tsx`
  stub it per file (save/restore in `beforeAll`/`afterAll`); `GbcMetatilePalette.tsx` calls it as
  `ref?.scrollIntoView({ block: "nearest" })`. `test/setup.ts` runs for every test (cleanup only today).

## Design (binding)

### 1. `MapTree`
- A `ref` on the filter input and one on the `<nav>`. One effect, deps `[selected]` only:
  ```ts
  useEffect(() => {
    if (!selected || document.activeElement === filterRef.current) return;
    const row = navRef.current?.querySelector<HTMLElement>('.map-tree__map[aria-current="true"]');
    if (!row) return; // filtered out: nothing to show
    const group = row.closest("details");
    if (group && !group.open) group.open = true;
    row.scrollIntoView({ block: "nearest" });
  }, [selected]);
  ```
  So: only when `selected` changes (mount with a non-null `selected` counts as a change); never when the
  filter text, `data`, `worldMode` or `visibility` change; never while the filter has focus (the user is
  typing there; `scrollIntoView` never moves focus anyway). Short comment saying why the deps are only
  `[selected]`.
- No new CSS.

### 2. `test/setup.ts`
Inside the existing `typeof document !== "undefined"` guard: if `Element.prototype.scrollIntoView` is
missing, install a no-op (one line, comment: jsdom lacks it; `MapTree` calls it on every selection).
Tests that spy on it use `vi.spyOn(Element.prototype, "scrollIntoView")` and restore it.

### 3. `WorldCanvas` (GBA)
- New optional prop `onSelectMap?: (name: string) => void`, documented like `GbcWorldCanvasProps`'s.
- In `onCanvasClick`, after the hit test: `if (hit) onSelectMap?.(hit.map);` (after the existing early
  returns, so modifier clicks, marquee/drag ends and empty-space clicks never fire it). Nothing else
  changes.

### 4. `App.tsx` (GBA)
- Add `jumpTarget` state (mirror `GbcApp`'s, with a one-line comment pointing at its F1 comment). The
  World-mode `WorldCanvas` gets `jumpToMap={jumpTarget}` instead of `selected`.
- Split `selectMap` without changing its behaviour:
  ```ts
  // The dirty guard and the per-map resets shared by a tree click and a world click.
  const changeSelection = (name: string): boolean => {
    if (editSession.isDirty && !window.confirm(...unchanged text...)) return false;
    setSelected(name);
    setSelectedEvent(null);   // existing comments move with these lines
    setCurrentStamp(null);
    return true;
  };
  const selectMap = (name: string) => {
    if (!changeSelection(name)) return;
    setJumpTarget(name);
    setSelectVersion((v) => v + 1);
  };
  // A world-view click selects (tree highlight + scroll) but is not a jump request.
  const selectMapFromWorld = (name: string) => {
    if (name !== selected) changeSelection(name);
  };
  ```
  (`name !== selected`: re-clicking the already-selected map in the world must not raise the "discard
  and switch" confirm.)
- World-mode `WorldCanvas` gets `onSelectMap={selectMapFromWorld}`. The dungeon `WorldCanvas` gets
  nothing (its sidebar is `DungeonSidebar`, not the tree).
- If C1 already passes `onJumpToMap={selectMap}`, keep it: a list jump is a tree-click-style jump.

### 5. `GbcApp.tsx`
No code change expected (already wired). Only tests.

## TDD steps (commit each green step)
1. `setup.ts` stub. `MapTree.test.tsx` new tests (red first), then `MapTree.tsx`:
   - rerender `selected` null → `"B"`: `scrollIntoView` called **once**, with `{ block: "nearest" }`,
     on B's button (`spy.mock.contexts[0]` is the `.map-tree__map` whose text is `"B"`);
   - rerender with the same `selected` and a new-but-equal `data` object: still one call;
   - mount with `selected="A"`: one call, on A;
   - typing in the filter (`fireEvent.change`): no new call;
   - focus the filter, then rerender with a new `selected`: no call, and `document.activeElement` is
     still the filter;
   - a collapsed group: set its `details.open = false`, rerender with a map in that group selected →
     `details.open === true` and the call is on that map's button;
   - a selected map hidden by the filter: no call, no throw.
   Commit.
2. `WorldCanvas.test.tsx` new tests, then the prop: a plain click on a map calls `onSelectMap` once with
   its name; shift-click, ctrl-click and a click on empty space don't call it; the end of a drag doesn't
   either (reuse the file's existing click/drag helpers). Commit.
3. `App.test.tsx` new tests, then `App.tsx`:
   - World mode, a canvas click on a map → its tree row `aria-current="true"`, `scrollIntoView` called on
     that row, **and** no `.world-canvas__jump-highlight` and the zoom readout unchanged (the GBA mirror of
     GbcApp's F1 test; give jsdom a real viewport the way that test does);
   - with a dirty session (the existing confirm test's recipe), a world click on another map calls
     `confirm`; `confirm → false` leaves the tree's `aria-current` on the original map;
   - a tree click in World mode still jumps (if an existing test already pins it, name it instead).
   Commit.
4. `GbcApp.test.tsx`: a World-mode canvas click → that map's tree row `aria-current="true"` and
   `scrollIntoView` called on that row. Commit.
5. Gate: `npm test` captured to a file (flakes as in C1's spec; rerun alone first), `npm run typecheck`,
   `npx vite build` in `packages/ui`. Report `git diff <C2 base> --stat -- packages/ui/test` and confirm
   no existing test body changed (`git diff <C2 base> -- packages/ui/test` shows additions only, apart
   from `setup.ts`).

## Mutations the reviewers will run
- T1 effect deps `[selected, filter]` → the typing test red.
- T2 `block: "start"` → the exact-args test red.
- T3 no `group.open = true` → the collapsed-group test red.
- T4 no deps array (runs every render) → the same-`selected` rerender test red.
- T5 focus guard removed → the filter-focus test red.
- G1 `WorldCanvas` never calls `onSelectMap` → WorldCanvas test and App test red.
- G2 `onSelectMap` called before the modifier/drag early return → the shift-click test red.
- G3 `App` passes `jumpToMap={selected}` again → the GBA F1-mirror test red.
- G4 `selectMapFromWorld` bumps `selectVersion`/`jumpTarget` → the same test red.
- G5 `selectMapFromWorld` skips the dirty guard → the dirty-confirm test red.
- G6 `App` doesn't pass `onSelectMap` → the App tree-highlight test red.
- G7 `GbcApp` doesn't pass `onSelectMap` → the GbcApp test red.

## Live verify (coordinator): criterion 5, both families
Scroll the tree to the top, single-click a map far down the world view (its tree row off-screen): the
tree scrolls so the row is visible and it is `aria-current`; the view does not jump. A collapsed group
expands. GBA and GBC.

## Report
`task-C2-implementer.md`: commits; test counts; gate; existing tests touched (expected: none, plus the
`setup.ts` stub); deviations.
