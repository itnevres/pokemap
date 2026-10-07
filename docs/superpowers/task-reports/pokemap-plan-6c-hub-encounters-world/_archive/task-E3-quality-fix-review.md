# E3 quality fix-round re-review (read-only; scope `git diff 09a8b04 e64196a`, committed state)

Anchors: `M` = `packages/ui/src/components/WorldContextMenu.tsx`, `GBA` = `components/WorldCanvas.tsx`, `GBC` = `gbc/GbcWorldCanvas.tsx`, at `e64196a`. No tests run (coordinator is mutating the tree).

## Verdict: APPROVED
All prior findings are resolved. One new P3 doc nit, non-blocking.

## P1-1 echo guard (`useWorldContextMenu`): RESOLVED
- **Cannot swallow a real mouse right-click.**
  - The guard is only armed by the menu-key branch of `onMenuKey`, and `onPointerDown` nulls it.
  - GBA: `onPointerDown={onPointerDownCapture}` is on the canvas (GBA 1896), and `contextMenu.onPointerDown()` is the first line of that handler, before the `try`.
  - GBC: `onPointerDown={contextMenu.onPointerDown}` is on the canvas (GBC 1197).
  - A mouse, pen or touch long-press right-click is always preceded by a pointerdown on the canvas, so it disarms first. Mac ctrl+click is the same.
  - The only way to be swallowed is a contextmenu with no preceding canvas pointerdown within 1s of a keyboard open. That is exactly the echo.
- **Arming and clock.**
  - `e.timeStamp` is taken from the React synthetic keydown, and the compare uses the synthetic contextmenu `timeStamp`.
  - React copies the native `timeStamp`, falling back to `Date.now()` only when it is 0.
  - `KeyboardEvent` and `MouseEvent` `timeStamp` are both DOMHighResTimeStamp on the same time origin, so the units match.
  - Held key: auto-repeat keydowns re-arm, so the echo at keyup is still under 1s from the last repeat.
- **One-shot.** The ref is nulled when swallowing. The `null` check short-circuits, so there is no NaN path. The 1000ms cap bounds a lingering arm (a browser that never echoes).
- **Echo before React commits the menu.** Not a problem. The guard is a ref set synchronously in the keydown handler, independent of commit. The echo is a separate, later task (keyup).
- **Echo target.**
  - The menu focus effect moves focus into the menu after keydown, so keyup's echo may land on a menu item. The menu's `onContextMenu` preventDefault swallows it, and the canvas handler never sees it.
  - In that case the guard stays armed until a pointerdown or 1s. That is harmless, per the above.
  - Both targets are therefore safe.
- **Menu key with no target** (nothing selected, or filtered out): returns `true`, does not arm, does not preventDefault. The native contextmenu then takes the normal hit-test path, as before the fix.
- **Tests.**
  - `it.each` over 3 echo shapes in both canvases: empty space, over a map, `button: -1`.
  - Each asserts the same menu node, same left/top, same items, focus on a menuitem, and `fireEvent.contextMenu` still returns false (preventDefault'd).
  - Re-arm test: pointerDown then contextMenu opens a normal menu at the click position (GBA 8px/8px clamp, GBC 160/150).
  - One-shot test and 5s-late test (GBA).
  - These pin exact values, and the clamp expectation distinguishes the right-click menu from the map-centre menu.
- Gap (acceptable): GBC has no one-shot or late test, but the logic is the shared hook.

## P3-1 hook refactor: RESOLVED
- **Stale options.**
  - `latest.current = options` is assigned each render.
  - `openFor`, `close` and the item `onSelect`s read through `latest`, so `onOpenMap`, `editItem` and `toggle` are always current. `close` is a stable `useCallback`.
  - GBA `editItem` still reads `onEditHereRef`, and is `undefined` when `onEditHere` is unset (same as before: the item is only offered when wired).
- **Menu-id semantics.**
  - `close` increments the id. `openFor` increments the id (even when it produces no items).
  - A late conflict-POST success closes only when `menuId === id`.
  - A double-click double-POST: the first success closes (id++), and the second sees a mismatch and does not steal focus.
  - The late-save test covers the user closing and opening another menu before the POST resolves: the new menu stays and keeps its focus.
- **Behaviour parity.**
  - GBA: the menu key now also requires `mapFilter` (P3-7). The target is the selected map's rect centre, unchanged. Escape clears the selection, unchanged.
  - GBC: the menu key still returns `handled` (true) regardless of target, as the old early `return`. The F10 plain/Shift predicate is identical.
  - Item order and conditions are identical: Open in Map view needs a map and `onOpenMap`; Edit here is enabled in GBA only when wired, and always disabled with the Plan 7 hint in GBC; the conflict toggle is `keepOpen`.
  - `canvasRef` is declared before the hook call in both canvases (GBA 339 -> 360, GBC 442 -> 484).
- **Orphaned comment (P3-2):** fixed. `onContextMenu` now sits above the "Keyboard path" block, which directly precedes `onKeyDown`.
- The toast JSX duplication is left as is (optional).

## Remaining prior findings
- **P2-1 `width: max-content`: RESOLVED.**
  - Width no longer depends on the stale `left`.
  - `max-width: calc(100% - 2*space-2)` is kept as the cap, and the item/hint `overflow-wrap: anywhere` still wraps beyond it.
  - Height is also independent of `left`, so the layout-effect measure is correct on a null -> open transition.
  - Pinned in `styles.test.ts`. Not observable in jsdom; needs a browser check at the right edge.
- **P2-2 `onCloseRef`: RESOLVED.**
  - Listeners subscribe on `[open]` only and call `onCloseRef.current`.
  - The cleanup pairing is intact (wheel is passive on add and removed without options, which is fine).
  - The test asserts the addEventListener count is unchanged across a new `onClose`, and that the latest `onClose` is called.
  - The Tab and item `onClick` paths use the current-render `onClose`, which is fine.
- **P3-3 Tab: RESOLVED.** `preventDefault` plus `onClose`, so the canvas is refocused (Shift+Tab does the same, which is acceptable). Tested.
- **P3-4 `aria-label="Map actions"`: RESOLVED, tested.** The disabled-hint reachability note is deferred to Plan 7, as agreed.
- **P3-5 dead guard: RESOLVED.** The `item.disabled` early return is gone.
- **P3-6 late-POST close: RESOLVED** (menu-id, above).
- **P3-7 GBA `mapFilter` check: RESOLVED, tested** (keyboard opens nothing for a filtered-out map). `visible` was not added, which is fine (the filter is the scope).
- **P3-8 menu `onContextMenu` preventDefault: RESOLVED, tested.**
- **P3-9 hint contrast: RESOLVED.** `--text-secondary` exists in both themes (dark `#94a3b8`, light `#475569`). Pinned in `styles.test.ts`.
- **P3-10:** deferred to E4 as noted. No action.

## New findings
- **N-1 (P3), DESIGN.md contradiction.**
  - The new Keyboard bullet says the hint uses `--text-secondary`, but the `**Tokens:**` line two lines below still lists `--text-muted` (hint).
  - Fix: change that line to `--text-muted` (disabled label) and `--text-secondary` (hint).
  - Doc only.
- **Observation, not a finding.**
  - Shift+F10 echo timing on Windows is unverified, but the guard handles an echo at either keydown or keyup, and is harmless if there is none.
