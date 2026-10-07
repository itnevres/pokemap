# E3 quality review (read-only; scope `git diff 2314120 0d2c332`)

Anchors: `M` = `packages/ui/src/components/WorldContextMenu.tsx`, `GBA` = `components/WorldCanvas.tsx`, `GBC` = `gbc/GbcWorldCanvas.tsx`, at `0d2c332`. No tests run (working tree is being mutated by another reviewer).

## Verdict: CHANGES_REQUIRED
One P1 (keyboard open vs the native `contextmenu` event), two P2. Everything else is P3. Spec behaviour is otherwise implemented cleanly, and the `keepOpen` / window-Escape deviations (C1/C2) are acceptable (see "Concern rulings").

## P1

### P1-1 Native `contextmenu` after a keyboard open replaces or closes the menu
- Where: `GBA` onCanvasKeyDown (1761-1769) / `onCanvasContextMenu` (1752-1759); `GBC` onKeyDown (1061-1067) / onContextMenu (~1046). The tests never fire a `contextmenu` after the key, so it is unpinned. This is implementer concern C4, unverified in a browser.
- Chromium path: the ContextMenu key and Shift+F10 make the browser dispatch a `contextmenu` event on the focused element (canvas), keyboard-origin, `button` 0. Coordinates are at/near the focused element's box, not our map centre. Timing varies by OS: Windows ContextMenu key fires around keyup, Shift+F10 around keydown. Whether keydown `preventDefault` suppresses it is browser/OS-dependent. Do not rely on it.
- What the current code does when it arrives after our keyboard open:
  - It hit-tests those coordinates and calls `openMenuAt` with whatever is there.
  - Map under the canvas box point: the menu is replaced by one for a different map (not the selected one), at the wrong position. Focus re-runs to its first item.
  - Nothing there: `openMenuAt(..., null, null)` -> `setMenu(null)`. This is NOT `closeMenu`, so there is no refocus. The focused menu button unmounts and focus drops to `<body>`. The user sees the menu flash open and vanish, and the keyboard is dead.
  - Either way the keyboard path is broken in real Chromium. jsdom cannot show it.
- Fix (guard, same in both canvases; best done once, see P3-1):
  - `const kbOpenedAtRef = useRef(0);` set `kbOpenedAtRef.current = e.timeStamp` in the key-open branch (next to `preventDefault`).
  - In the contextmenu handler, right after `e.preventDefault()`: `if (e.timeStamp - kbOpenedAtRef.current < 1000) { kbOpenedAtRef.current = 0; return; }`. A one-shot with a time cap, so a browser that never fires the event cannot make the next real right-click vanish.
  - Also reset `kbOpenedAtRef.current = 0` in the canvas `onPointerDown` (or `onMouseDown`). A real mouse right-click always has a pointerdown first, so the guard can never swallow a mouse right-click.
  - A bare boolean flag would work but can linger, so prefer the timestamp plus the pointerdown reset.
- Test to add (both canvases): select one map, `fireEvent.keyDown(canvas,{key:"ContextMenu"})`, then `fireEvent.contextMenu(canvas,{clientX:<empty space>})`. Assert the menu is still present, with the same items and the same left/top, and that `document.activeElement` is a menuitem. Then `fireEvent.pointerDown(canvas)` followed by `fireEvent.contextMenu(...)` on a map must still open a normal menu (the guard resets).

## P2

### P2-1 Stale-position measurement can lock a wider menu into a wrapped narrow box
- Where: `M` 38-43 (useLayoutEffect) with `position` state persisting across opens; CSS `.world-context-menu` has no width rule.
- The component stays mounted when `menu` is null, so `position` keeps the last clamped value. A newly opened menu renders at that stale `left` first, and the layout effect measures it there.
- An abs-positioned box is shrink-to-fit against `containing block - left`. With `overflow-wrap: anywhere` the min-content is tiny, so the content wraps.
- Scenario (GBA, real app): the first menu is the narrow "Open in Map view" only, opened near the right edge, clamped to `left = W - w - 8`. The next menu has "Un-accept conflict" (wider). It is measured at that `left`, wrapped to roughly `w+8` wide and taller. The clamp then computes from the wrapped size, and the result keeps the same `left`, so the box stays wrapped. It is self-consistent and never recovers.
- The same applies to GBC (the hint line is wider than the bare "Open in Map view" label).
- Not provable in jsdom. The existing clamp test rerenders non-null -> non-null, so it can't see this.
- Fix (either; the first is preferred):
  - CSS: `.world-context-menu { width: max-content; }` (keep `max-width: calc(100% - 2*var(--space-2))`). Width then no longer depends on `left`.
  - Or in the layout effect, before measuring: `menuRef.current.style.left = "0px"; menuRef.current.style.top = "0px";`.
- Verify in a browser: open a narrow menu at the right edge, then a badge menu at the same edge.

### P2-2 `onClose` identity churn re-subscribes the document/window listeners on every canvas render
- Where: `M` 47-61 (`[menu, onClose]`) and `closeMenu` in `GBA` 1730 / `GBC` 1029, a fresh closure each render.
- The canvases re-render on every hover/tooltip/pan frame while a menu is open, so 3 listeners are removed and re-added each time. It is correct (add and remove are synchronous in one commit) but wasteful and fragile: a future early return that breaks the cleanup pairing would leak.
- Fix: in `M`, `const onCloseRef = useRef(onClose); onCloseRef.current = onClose;` and make the effect depend on `[menu !== null]` only. It is also then stale-closure-proof for `onClose`.
- Same ref idiom the canvases already use for `onOpenMap`. P2 only because it is also the cheap way to get a stable listener lifecycle.

## P3

### P3-1 Duplication between the canvases
- `closeMenu`, `openMenuAt`, the `onContextMenu` hit-test body, the key predicate `e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)`, and the conflict toast JSX are copy-pasted (`GBA` 1730-1759/1763/2029-2034, `GBC` 1029-1056/1061/1306-1311). The two `openMenuAt`s differ only in the Edit-here item.
- Minimal, not over-abstracted: export from `M` a small hook `useWorldContextMenu({ onOpenMap, edit /* WorldMenuItem | undefined */, toggle, canvasRef })` returning `{ menu, close, openFor(x, y, map, badge), onContextMenu(hitMapAt), isMenuKey(e) }`. The P1 guard then lives in one place. Canvases keep their own hit-test and centre computation.
- Optionally a `ConflictToast` component for the duplicated toast. Not required for approval.

### P3-2 Orphaned doc comment in GBC
- `GBC` 1018-1028: the "Keyboard path (fix round...)" block comment, which documents `onKeyDown` (Enter / +/- zoom), now sits above `closeMenu`, so the new helpers separate it from its function.
- Fix: move `closeMenu`/`openMenuAt`/`onContextMenu` above that comment, or below `onKeyDown`.

### P3-3 Tab leaves the menu open
- `M` 63-71: items are plain buttons, all tab stops, and no `focusout`/Tab handling. Tab moves focus out of the menu to the next control while the menu stays open until Escape/wheel/pointerdown.
- ARIA menu pattern: Tab closes the menu. Fix: in `onMenuKeyDown`, `if (event.key === "Tab") { event.preventDefault(); onClose(); }` (canvas refocus comes free from `closeMenu`). Optionally Home/End focus the first/last enabled item.
- Also use roving tabindex (`tabIndex={-1}` on every item, focus programmatic), which makes Tab a non-issue.

### P3-4 Menu lacks an accessible name; hint unreachable by keyboard
- `M` 72: `role="menu"` has no `aria-label` (e.g. "Map actions"); axe/ARIA APG want one.
- A `disabled` button is not focusable, so a keyboard/SR user skipping it never hears "GBC editing arrives with Plan 7" (it only appears in the name when browsing). Spec mandated `disabled` + `aria-disabled` together and ArrowDown skipping disabled, so leave as is. Note it for Plan 7: the APG-preferred pattern is focusable `aria-disabled` only.
- `disabled` + `aria-disabled` together is redundant but harmless (and tested).

### P3-5 Dead guard
- `M` 82 `if (item.disabled) return;`: React never fires `onClick` on a `disabled` button. The test "clicking a disabled item does nothing" passes regardless of this line, so it pins the DOM attribute, not the guard. Delete the line (keep the test) or keep it as defence-in-depth with a comment.

### P3-6 Late POST success closes whatever menu is open now
- `GBA` 1744 / `GBC` 1043: `toggle(...).then((ok) => { if (ok) closeMenu(); })`. The menu is `keepOpen` during the POST. If the user closes it and opens another before the POST resolves (or clicks the item twice, which fires two idempotent POSTs), the late resolve closes the new menu and steals focus.
- Fix: capture the `menu` identity (or a `menuIdRef` counter) at open and only close if it is still current. Optionally disable double-submit while pending.

### P3-7 GBA keyboard open ignores the visible set
- `GBA` 1764: `selected.size === 1 ? world?.placements.get(...)` with no `mapFilter` check, while GBC guards `mapFilter.has(selectedMap)`. A selection that survives a `mapFilter` change in the same mount could open a menu for an undrawn map.
- Fix: `&& (!mapFilter || mapFilter.has(name))`. Also consider `visible`.
- The GBC filter guard is itself unobservable (X-d, C3). Acceptable.

### P3-8 Right-click on the menu opens the native browser menu
- `M` 72 has no `onContextMenu={(e) => e.preventDefault()}`. Right-clicking an item shows the browser's own menu over ours (the pointerdown is inside, so ours stays open). Add the one-liner.

### P3-9 Hint contrast
- `.world-context-menu__hint` is `--text-muted` (#64748b) on `--bg-panel-raised` (#1e293b) in the dark theme: about 3:1 at 12px, below the 4.5:1 for informational (non-disabled-exempt) text. The hint is the only explanation of why Edit is off. Use `--text-secondary` for the hint (keep muted for the disabled label). The light theme is fine.

### P3-10 Focus after selecting a map action
- `closeMenu` focuses the canvas right after `onOpenMap` runs. When App then switches to Map view the canvas unmounts and focus falls to `<body>`. Harmless, but for keyboard users a focus target in the new view would be nicer. Out of E3 scope; note for E4.

## Verified OK (no action)
- **Ordering.**
  - Right-click: pointerdown (outside) -> `closeMenu` + canvas focus -> mousedown (D4: button 2 never pans/selects) -> contextmenu -> `setMenu(new)` -> focus effect moves focus to the first item. The pointerdown listener is added in an effect after the opening event, so the opening contextmenu cannot self-close it.
  - Browsers that fire contextmenu on mousedown (macOS/Linux) have already passed pointerdown.
- **Listener lifecycle.**
  - `document` pointerdown/wheel and `window` keydown are added only while `menu` is non-null and removed in cleanup.
  - Unmounting the canvas unmounts the menu, so cleanup runs. `wheel` is added `{passive:true}` and removed without options (fine, capture is unchanged).
  - A wheel on the menu is ignored via `contains`.
  - There is no leak path.
- **Stale closures.**
  - `onOpenMap`/`onEditHere` go through refs updated every render.
  - `toggle`'s closed-over setters are stable.
  - `badge.accepted` is snapshotted at open, which is fine because the menu is closed on any outside interaction.
  - `closeMenu` uses `setMenu` and `canvasRef.current?.`, both safe after unmount (React 18, no warning).
- **Menu surviving a reload / project switch / unmount.**
  - `menu` is local state and the canvas is not re-keyed for a project switch, and `/api/world` refetch (`GBA` 492-) does not clear it.
  - A menu open during a reload can carry a map name that no longer exists, but any pointerdown/wheel/Escape closes it and `onOpenMap` is guarded by App `changeSelection`.
  - A world refetch only fires after a user action (dungeon toggle POST), which already implies a pointerdown. No action needed.
- **Escape double-handling.**
  - Escape keydown originates in the focused menu button, not the canvas, so GBA's canvas `Escape clears selection` does not also run. Only the window listener fires (tested `toHaveBeenCalledTimes(1)`).
  - Modals (`WarpDestinationModal`, `GbcWarpDestinationModal`, SaveDialog) `stopPropagation` at React's root. That also stops the native event reaching `window`, so those Escapes never reach the menu listener. A modal can't be open with the menu open, since opening it needs a pointerdown that closed the menu.
  - Escape then refocuses the canvas, and no stray key event follows.
- **Shift+double-click.** GBA early-return ordering is right (Ctrl/Meta still return early). Shift+mousedown without movement commits nothing (`commitMapDrag` only posts on a changed tile), and the test pins zero `/api/world/placement` calls with the full real event sequence.
- **GBC.** Shift branch comes after the `dragMovedRef` guard and before the warp-marker check, as specified.
- **CSS.**
  - Tokens all exist in `:root` (`--bg-panel-raised`, `--border-strong`, `--bg-hover`, `--text-muted`, `--text-primary`, `--space-1/2`, `--text-xs`).
  - No `.btn`. `min-width: 0` and `overflow-wrap: anywhere` are on the item and hint. `box-sizing`, max-width/height and `overflow: auto` are set. `:hover:not(:disabled)`, `:focus-visible` and the disabled/muted state are covered.
  - The old `.world-canvas__conflict-action` rules are gone (no stale refs).
- **DESIGN.md.** The entry matches the behaviour (class, items per family, keyboard, tokens).
- **Dead code.** None left from `ConflictAction`: no references to `ConflictAction`/`clampConflictAction`/`conflictAcceptance.action|setAction|save`. `ConflictActionState` is removed. The hook is clean (`toggle` never rejects; failure keeps the acknowledgement).
- **Tests, quality.**
  - Menu tests pin exact values (order of select/close, accessible name string, wrap-around focus sequence, left/top 75px/55px, once-only Escape).
  - GBA Shift+dblclick test uses the real event sequence, and the stale-badge-map test (X-e) is a good kill.
  - Gaps: P1 native contextmenu after key; null -> open stale measure (P2-1); Tab; late-POST close (P3-6).

## Concern rulings (from the implementer report)
- **C1 `keepOpen` extra field:** acceptable. It is minimal, documented in the type, and forced by unchanged D4 tests. Prefer renaming to `closeOnSelect?: false` only if the field proliferates; not needed.
- **C2 window Escape listener:** acceptable (needed for the unchanged GBC D4 test; menu-focused Escape bubbles to it once). See P2-2 for the subscription churn.
- **C3 X-d survives:** accept; it is equivalent today (shadowed by the existing `selectedMap` clearing effect).
- **C4:** upgraded to P1-1 above.
- **C5:** fine (same guard in GBC `commitMapDrag`). A one-line GBC pin would be cheap but is not required.
