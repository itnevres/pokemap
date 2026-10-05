# E3 executed spec: `WorldContextMenu` (both families)

Branch `plan-6c-hub-encounters-world`. Base: the HEAD at dispatch, after E2. Gate baseline: the latest gate plus E1/E2's new tests, with the 2 known `world.test.ts` failures.

E3 absorbs D4's badge-only right-click action (`packages/ui/src/world/ConflictAction.tsx`, `useConflictAcceptance.ts`) into one real context menu for both world canvases. It also fixes the Phase D UI nits the review deferred here:
- the popup is screen-anchored and stays open while panning;
- a left click elsewhere doesn't close it;
- the conflict error toast has no dismiss.

The user decisions bind this task:
- **U1:** both families; existing tests change only where the behaviour changes, each one named.
- **U2:** GBC "Edit here" is disabled, with the hint "GBC editing arrives with Plan 7".
- **U3:** accepting a conflict only acknowledges it.

## Grounding (at dispatch; cite `WorldCanvas.tsx` by anchor, never by line)

- **Right-click today.** Both canvases have an `onContextMenu={(e) => { e.preventDefault(); ... conflictBadgesRef.current.find(... <= BADGE_SIZE) ...; conflictAcceptance.setAction(badge ? {...} : null) }}` handler. Each renders `<ConflictAction action=… viewport=… onSave=… />` and a `Could not update conflict:` toast with `role="alert"`, which has no dismiss.
- **`ConflictAction.tsx`** exports `clampConflictAction(pointer, viewport, popup, inset = 8)` and the measured-popup component (class `world-canvas__conflict-action`). `test/world/ConflictAction.test.tsx` pins the clamp with exact numbers.
- **`useConflictAcceptance(conflicts)`** returns `{ action, setAction, error, setError, isAccepted, acceptedCount, acceptedKeys, save }`. It registers a window Escape listener while `action` is set.
- **Double-click:**
  - GBA `onCanvasDoubleClick` returns early on `e.ctrlKey || e.metaKey || e.shiftKey || dragMovedRef.current`. Then it only acts when `warpsOn`, on a warp-marker hit, opening `setWarpPopup`.
  - GBC `onDoubleClick` checks a warp marker first (when warps are on), then calls `onOpenMap?.(hit.map)` on a map body.
- **Shift and selection.** GBA Shift+mousedown on a map starts a map drag (`const hit = e.shiftKey ? hitTest(w.x, w.y) : null`). GBA selection is `selected: Set<string>`; GBC's is `selectedMap: string | null`.
- **Keyboard.** GBA `onCanvasKeyDown` handles only Escape (clears the selection). GBC `onKeyDown` handles Enter (open) and keyboard pan/zoom. Both canvases have `tabIndex={0}`.
- **Open map.**
  - GBA `WorldCanvas` has **no** `onOpenMap` prop.
  - GBC `GbcApp` passes `onOpenMap={openMapFromWorld}` to both of its canvases.
  - GBA `App.tsx` renders `<WorldCanvas key="world" …>` and `<WorldCanvas key="dungeon" mapFilter={mapFilter} />`. App has `changeSelection(name)`, which runs the dirty confirm and returns false on cancel, plus `setMode`.
- **D4 tests that use the old surface.** In `test/WorldCanvas.test.tsx`, and in the `conflict badge` describe of `test/gbc/GbcWorldCanvas.test.tsx`, they query `getByRole("button", { name: "Accept conflict" | "Un-accept conflict" })` and mock `getBoundingClientRect` on the `.world-canvas__conflict-action` class.

## Required behaviour

1. **`packages/ui/src/components/WorldContextMenu.tsx`** (new).
   - Props: `{ menu: { x: number; y: number; items: WorldMenuItem[] } | null; viewport: { w: number; h: number }; onClose(): void }`, where `WorldMenuItem = { label: string; onSelect?: () => void; disabled?: boolean; hint?: string }`.
   - Render: `<div className="world-context-menu" role="menu">` with one `<button type="button" role="menuitem">` per item. Disabled items get `aria-disabled="true"` and `disabled`. A hint renders as visible small text inside the item (`.world-context-menu__hint`) and is included in the accessible name.
   - Position: the measured clamp from `clampConflictAction`, moved here unchanged and renamed `clampMenuPosition`, with the same 8 px inset. `ConflictAction.tsx` and its test are deleted. Port every assertion of `ConflictAction.test.tsx` into `test/WorldContextMenu.test.tsx` with identical numbers, and name them in your report.
   - Keyboard:
     - opening focuses the first enabled item;
     - ArrowDown/ArrowUp move focus cyclically over the enabled items;
     - Enter/Space activate (native button);
     - Escape closes and returns focus to the canvas. The caller passes `onClose`; the canvas refocuses itself.
   - Selecting an enabled item calls its `onSelect`, then `onClose`.
   - Close on a `pointerdown` outside the menu (a document listener while open) and on a canvas `wheel`. That fixes the D nit: a pan starts with a canvas mousedown, which is outside the menu, so the menu closes.
   - CSS (`styles.css`): `.world-context-menu`, positioned absolute inside the viewport. Real tokens: `--bg-panel-raised`, `--border-strong`, the existing radius literal, `box-sizing: border-box`, max-width/height with `overflow: auto`, `min-width: 0` on text children, and the hint in `--text-muted`. Delete `.world-canvas__conflict-action` and its child rule. No `.btn`.
2. **Hook.** Adapt `useConflictAcceptance` so the canvas owns the menu state and the hook keeps only acceptance:
   - `isAccepted`, `acceptedCount`, `acceptedKeys`, `error`/`setError`, plus `toggle(key, accepted)` doing today's guarded POST;
   - drop `action`/`setAction`/`save` and the Escape listener, which the menu now owns;
   - all of D4's semantics stay: the guarded POST, the `acceptedKeys` override from the response, and on failure the acknowledgement is kept and the error shown.
3. **Error toast.** Both canvases' `Could not update conflict:` toast gains a Dismiss button (`aria-label="Dismiss"`) that clears the error.
4. **Right-click (both canvases).**
   - `preventDefault`. Hit-test the conflict badge first (unchanged), then the map body (the existing `hitTest` on world coordinates).
   - The items are built in this order:
     - **"Open in Map view"**, when a map body or badge's map was hit → `onOpenMap(map)`;
     - **"Edit here":**
       - **GBA:** shown and enabled only when the new optional prop `onEditHere?: (name: string) => void` is supplied. E4 wires it; App doesn't pass it in E3.
       - **GBC:** always shown, disabled, with hint "GBC editing arrives with Plan 7".
     - **"Accept conflict"/"Un-accept conflict"**, when a badge was hit → `toggle(key, !accepted)`.
   - Nothing hit → no menu, and any open menu closes.
   - Right-click must never pan, select, or POST a placement. D4 already pins this with its right-button sequences; keep those tests green.
5. **Keyboard open.** The ContextMenu key (`e.key === "ContextMenu"`) or Shift+F10 on the focused canvas opens the menu for the selected map.
   - Which map:
     - **GBA:** only when `selected.size === 1`;
     - **GBC:** when `selectedMap` is set and inside any `mapFilter`.
   - It opens at the centre of that map's screen rect, clamped, with the map items only (no conflict item).
   - It calls `preventDefault`.
6. **Shift+double-click → Open in Map view** (both families).
   - **GBA:** in `onCanvasDoubleClick`, before the existing early return, if `e.shiftKey && !dragMovedRef.current` and a map body is hit, call `onOpenMap(map)` and return. Ctrl/Meta keep returning early.
   - Make sure the Shift+mousedown map-drag that precedes it never POSTs a placement when there was no movement. Verify and pin it.
   - **GBC:** Shift+double-click on a map body calls `onOpenMap`, even when warps are on and a marker is under the pointer. Shift bypasses the marker preview. A plain GBC double-click is unchanged.
7. **GBA wiring.**
   - Add the optional `onOpenMap?: (name: string) => void` prop to `WorldCanvas`.
   - In `App.tsx`, add `openMapFromWorld = (name) => { if (name === selected || changeSelection(name)) setMode("map"); }` and pass it to both `WorldCanvas` mounts (world and dungeon).
   - Do **not** pass `onEditHere` in E3.
   - Existing App tests must pass unchanged.
8. **`packages/ui/DESIGN.md`.** Add a short "World context menu" entry: class, items per family, keyboard.

## Tests (test first; record the red proofs)

- **`test/WorldContextMenu.test.tsx`:**
  - the ported clamp pins;
  - items render as `menuitem`, a disabled item has `aria-disabled`, and the hint text is present;
  - the first enabled item gets focus on open;
  - ArrowDown/ArrowUp cycle and skip disabled items;
  - Escape calls `onClose`;
  - selecting calls `onSelect`, then `onClose`;
  - an outside `pointerdown` closes.
- **GBA (`WorldCanvas.test.tsx`, additions):**
  - right-click on a map body shows "Open in Map view" and calls `onOpenMap` with that map;
  - with an `onEditHere` spy, "Edit here" is enabled and calls it; without the prop, it is absent;
  - right-click on a badge shows the map items plus the conflict item;
  - empty space shows no menu;
  - ContextMenu key and Shift+F10 open the menu with exactly one selected map, and do nothing with zero or two;
  - Shift+double-click calls `onOpenMap` and never POSTs `/api/world/placement`;
  - a canvas mousedown (pan start) closes an open menu;
  - the error toast Dismiss clears it.
- **GBC (`GbcWorldCanvas.test.tsx`, additions):**
  - right-click on a map shows "Open in Map view" (calls `onOpenMap`) and a disabled "Edit here" whose name includes "GBC editing arrives with Plan 7";
  - the ContextMenu key opens with a selected map;
  - Shift+double-click on a warp marker with warps on calls `onOpenMap` and doesn't open the preview;
  - the error toast Dismiss works.
- **App (`App.test.tsx` must stay unchanged; put new tests in a new file):** in World mode, the menu's "Open in Map view" on a map switches to Map mode with that map selected. A dirty session plus a cancelled confirm keeps World mode. Reuse App.test's fetch-mock approach.
- **Existing D4 tests:** you may change only their **selectors**, not their values or assertions: `getByRole("button", { name: X })` → `getByRole("menuitem", { name: X })`, and the `.world-canvas__conflict-action` class in rect mocks → `.world-context-menu`. List each edited test by its exact title in the report. Any other existing-test edit means you stop and report NEEDS_CONTEXT. Check with `git diff <base> -- packages/ui/test | grep '^-[^-]'` and list every removed line.

## Binding rules

- **Undoing experiments.** Never use `git checkout`/`git restore`/`git stash` to undo an experiment. Mutate in memory, restore the bytes, and byte-compare.
- **Commits.** Pathspec commits for each green step, every message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Leave `.codex/` alone.
- **UI conventions.**
  - No jest-dom, and no setter inside an updater.
  - Every fetch stays guarded (the toggle reuses `fetchGuarded`).
  - Flex children with long text get `min-width: 0`.
  - A GBC single `view` state stays single.
- **Verification.** Run `node node_modules/vitest/vitest.mjs run packages/ui/test/WorldContextMenu.test.tsx packages/ui/test/WorldCanvas.test.tsx packages/ui/test/gbc/GbcWorldCanvas.test.tsx packages/ui/test/App.test.tsx packages/ui/test/gbc/GbcApp.test.tsx packages/ui/test/styles.test.ts` plus your new App-level file. Then run `npm run typecheck` and `npm run build -w @pokemap/ui`. No full suite.

## Mutations the coordinator will rerun

- **E3-M1:** the GBC "Edit here" is enabled. The GBC disabled test must go red.
- **E3-M2:** Shift+double-click falls through to the early return (GBA). The GBA Shift+double-click test must go red.
- **E3-M3:** the outside-`pointerdown` close is removed. The menu test must go red.
- **E3-M4:** ArrowDown doesn't skip disabled items. The keyboard test must go red.
- **E3-M5:** keyboard open fires with two selected maps. The GBA keyboard test must go red.
- **E3-M6:** `toggle` swallows POST failures. The existing D4 rejected-POST tests must stay the killers.
- **E3-M7:** App's `openMapFromWorld` ignores the `changeSelection` result. The cancelled-confirm test must go red.
