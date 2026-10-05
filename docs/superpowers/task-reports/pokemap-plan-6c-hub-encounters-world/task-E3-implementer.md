# E3 implementer report

**Status: DONE_WITH_CONCERNS** (concerns: C1-C4 below; no spec deviation needing a ruling beyond C1/C2).
Base `2314120`. Gate set (spec's 6 files + `AppWorldContextMenu.test.tsx`): 7 files / 287 tests pass. `npm run typecheck` clean (exit 0). `npm run build -w @pokemap/ui` OK (69 modules, built). No full suite run. `.codex/` untouched.

## Commits (base 2314120)
| sha | what |
|---|---|
| f9fd072 | `WorldContextMenu.tsx` + `WorldContextMenu.test.tsx` + `.world-context-menu*` CSS |
| a0d0806 | hook slimmed; both canvases rewired; `ConflictAction.tsx`/test/CSS deleted; D4 selector edits; new GBA/GBC tests |
| 5e15f7b | `App.tsx` `openMapFromWorld` + `AppWorldContextMenu.test.tsx` |
| 527d64f | DESIGN.md "World context menu" entry |
(report commit follows; last sha is the report's.)

## Files changed
- new: `src/components/WorldContextMenu.tsx`, `test/WorldContextMenu.test.tsx`, `test/AppWorldContextMenu.test.tsx`
- modified: `src/components/WorldCanvas.tsx`, `src/gbc/GbcWorldCanvas.tsx` (CRLF in working tree; edits kept CRLF), `src/world/useConflictAcceptance.ts`, `src/App.tsx`, `src/styles.css`, `DESIGN.md`, `test/WorldCanvas.test.tsx`, `test/gbc/GbcWorldCanvas.test.tsx`
- deleted: `src/world/ConflictAction.tsx`, `test/world/ConflictAction.test.tsx`; CSS `.world-canvas__conflict-action` + child rule

## Hook API change (`useConflictAcceptance`)
- Before: `{ action, setAction, error, setError, isAccepted, acceptedCount, acceptedKeys, save }` + window Escape listener; exported `ConflictActionState`.
- After: `{ error, setError, isAccepted, acceptedCount, acceptedKeys, toggle }`; `ConflictActionState`, Escape listener removed.
- `toggle(key, accepted): Promise<boolean>`: clears error, guarded POST via `fetchGuarded` + `isAcceptedConflictsResponse`; success -> `setAcceptedKeys(response.acceptedConflicts)`, resolves true; failure -> `setError(msg)`, acknowledgement untouched, resolves false (never rejects).

## Ported clamp pins (`test/world/ConflictAction.test.tsx` -> `test/WorldContextMenu.test.tsx`)
| old | new |
|---|---|
| `conflict action viewport bounds > uses the measured popup width and height at the midpoint and far corner` | `world context menu viewport bounds > uses the measured popup width and height at the midpoint and far corner` |
Assertions all ported, identical numbers: pointer (100,100) viewport 200x200 popup 130x50 -> left `62px`, top `100px`, right <=192, bottom <=192; rerender pointer (195,195) -> `62px`/`142px`, right <=192, bottom <=192; `clampMenuPosition({100,100},{200,200},{130,50})` toEqual `{x:62,y:100}`. Only renames: `clampConflictAction`->`clampMenuPosition`, class `world-canvas__conflict-action`->`world-context-menu`, component props `action`->`menu` ({x,y,items}). Clamp body unchanged, inset 8.

## Red proofs
Mutation harness (scratchpad `mut.mjs`): read bytes, mutate in memory, write, run vitest, write original bytes back in `finally`, `Buffer.compare` -> every run printed `BYTE-COMPARE restored: true`; `git status` clean after.
- Test-first (before impl):
  - `WorldContextMenu.test.tsx`: red = unresolvable import `../src/components/WorldContextMenu.js` (0 tests collected).
  - Selector edits + new tests with old canvases: `WorldCanvas.test.tsx` 15 failed/77 passed (4 edited D4 + 11 new); `GbcWorldCanvas.test.tsx` 10 failed/104 passed (4 edited D4 + new Shift+dblclick-on-marker + 5 new); `AppWorldContextMenu.test.tsx` 2 failed (no `Open in Map view` menuitem) before the App edit.
  - Passed vacuously pre-impl (absence behaviours; mutation-checked after): GBA keyboard zero/two selected, GBA right-click never selects/pans/POSTs, GBA Ctrl/plain double-click, GBC `a canvas pointerdown closes an open menu` (killed by E3-M3 after), GBC keyboard-outside-mapFilter (see C3).
- Extra post-green mutations (all killed except X-d):
| id | mutation | killers |
|---|---|---|
| X-a | GBC `if (e.shiftKey) {` -> `if (false) {` | GBC `Shift+double-click on a warp marker opens the map under it instead of the preview (Plan 6c E3)` |
| X-b | GBA drop `keepOpen: true` | D4 `shows a malformed accept response without acknowledging the GBA badge`; E3 GBA `the conflict error toast can be dismissed` |
| X-c | GBA `closeMenu` no refocus | GBA `Escape closes the menu and returns focus to the canvas` |
| X-d | GBC keyboard open ignores `mapFilter` | SURVIVES (equivalent; C3) |
| X-e | GBA badge's `map` ignored in right-click | GBA `right-click on a badge whose map body is not under the pointer still targets the badge's map` |
| X-f | GBA Dismiss onClick no-op | GBA `the conflict error toast can be dismissed` |

## Self-run E3-M1..M7 (full 4 new/changed test files each)
| M | mutation | result |
|---|---|---|
| M1 | GBC `Edit here` `disabled: false` | RED: GBC `right-click on a map shows Open in Map view and a disabled Edit here carrying the Plan 7 hint` (1 fail) |
| M2 | GBA Shift+dblclick branch -> `if (false)` (falls to early return) | RED: GBA `Shift+double-click on a map opens it in Map view without ever POSTing a placement` (1) |
| M3 | remove `document.addEventListener("pointerdown", outside)` | RED: menu `a pointerdown outside closes; one inside does not`; GBA `a canvas mousedown (pan start) closes an open menu`; GBC `a canvas pointerdown closes an open menu` (3) |
| M4 | ArrowDown/Up over all buttons not enabled-only | RED: menu `ArrowDown/ArrowUp cycle over the enabled items and skip disabled ones` (1) |
| M5 | GBA keyboard `selected.size === 1` -> `>= 1` | RED: GBA `the keyboard opens nothing with zero or two selected maps` (1) |
| M6 | `toggle` failure branch swallows (`void cause`, no `setError`) | RED, killers = D4 `shows a malformed accept response without acknowledging the GBA badge`, D4 `shows a rejected POST response and retains the unaccepted badge` (+ both new Dismiss tests) (4) |
| M7 | App `openMapFromWorld` ignores `changeSelection` result | RED: `AppWorldContextMenu` `a dirty session with a cancelled confirm keeps World mode and the selection` (1) |

## Existing-test edits (selectors only; no value/assertion changes)
Mechanical sed: `getByRole/queryByRole("button", { name: "Accept conflict"|"Un-accept conflict" })` -> `("menuitem", ...)`; `world-canvas__conflict-action` -> `world-context-menu`.
- `test/WorldCanvas.test.tsx` (describe `WorldCanvas`):
  1. `independently acknowledges two same-map badges by right-click, keeps placement, and survives remount`
  2. `shows a malformed accept response without acknowledging the GBA badge`
  3. `redraws and updates hit actions when the accepted key changes but the count stays one`
  4. `keeps a near-edge badge action inside the viewport`
- `test/gbc/GbcWorldCanvas.test.tsx` (describe `GbcWorldCanvas > conflict badge`):
  5. `accepts a Route17 badge, persists on remount, and closes the action with Escape`
  6. `clamps the measured Route17 action at the right edge of the viewport`
  7. `shows a rejected POST response and retains the unaccepted badge`
  8. `redraws the GBC badges when the accepted key swaps with the same count`
- Deleted wholesale (spec-mandated, ported): `test/world/ConflictAction.test.tsx`.
- `App.test.tsx`, `GbcApp.test.tsx`, `styles.test.ts`: untouched.
- Everything else in those two files is purely additive (new `describe`s appended; one new `it` inserted in `GBC dungeon warps (Plan 6c D3)` before `renders the exact raw-half marker...`).

`git diff 2314120 -- packages/ui/test | grep '^-[^-]'` (every removed line, 26 selector lines + the deleted file):
```
-    expect(screen.queryByRole("button", { name: "Accept conflict" })).toBeNull();
-    fireEvent.click(screen.getByRole("button", { name: "Accept conflict" }));
-    expect(screen.getByRole("button", { name: "Accept conflict" })).toBeTruthy();
-    fireEvent.click(screen.getByRole("button", { name: "Accept conflict" }));
-    fireEvent.click(screen.getByRole("button", { name: "Un-accept conflict" }));
-    fireEvent.click(screen.getByRole("button", { name: "Accept conflict" }));
-    fireEvent.click(screen.getByRole("button", { name: "Accept conflict" }));
-    fireEvent.click(screen.getByRole("button", { name: "Un-accept conflict" }));
-    expect(screen.getByRole("button", { name: "Accept conflict" })).toBeTruthy();
-    expect(screen.getByRole("button", { name: "Un-accept conflict" })).toBeTruthy();
-      if (this.classList.contains("world-canvas__conflict-action")) return { width: 80, height: 30 } as DOMRect;
-      const action = mounted.container.querySelector(".world-canvas__conflict-action") as HTMLElement;
-      expect(screen.queryByRole("button", { name: "Accept conflict" })).toBeNull();
-      expect(screen.getByRole("button", { name: "Accept conflict" })).toBeTruthy();
-      expect(screen.queryByRole("button", { name: "Accept conflict" })).toBeNull();
-      fireEvent.click(screen.getByRole("button", { name: "Accept conflict" }));
-      fireEvent.click(screen.getByRole("button", { name: "Un-accept conflict" }));
-        if (this.classList.contains("world-canvas__conflict-action")) return { width: 80, height: 30 } as DOMRect;
-        const action = mounted.container.querySelector(".world-canvas__conflict-action") as HTMLElement;
-      fireEvent.click(screen.getByRole("button", { name: "Accept conflict" }));
-      expect(screen.getByRole("button", { name: "Accept conflict" })).toBeTruthy();
-      fireEvent.click(screen.getByRole("button", { name: "Accept conflict" }));
-      fireEvent.click(screen.getByRole("button", { name: "Un-accept conflict" }));
-      expect(screen.getByRole("button", { name: "Accept conflict" })).toBeTruthy();
-      expect(screen.getByRole("button", { name: "Un-accept conflict" })).toBeTruthy();
-import { describe, expect, it, vi } from "vitest";
-import { render } from "@testing-library/react";
-import { ConflictAction, clampConflictAction } from "../../src/world/ConflictAction.js";
-
-describe("conflict action viewport bounds", () => {
-  it("uses the measured popup width and height at the midpoint and far corner", () => {
-    const originalRect = HTMLElement.prototype.getBoundingClientRect;
-    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
-      if (this.classList.contains("world-canvas__conflict-action")) {
-        const left = Number.parseFloat(this.style.left) || 0;
-        const top = Number.parseFloat(this.style.top) || 0;
-        return { x: left, y: top, left, top, right: left + 130, bottom: top + 50, width: 130, height: 50, toJSON() {} } as DOMRect;
-      }
-      return originalRect.call(this);
-    });
-    try {
-      const viewport = { w: 200, h: 200 };
-      const action = { key: "k", accepted: false, x: 100, y: 100 };
-      const mounted = render(<ConflictAction action={action} viewport={viewport} onSave={() => {}} />);
-      const popup = mounted.container.querySelector(".world-canvas__conflict-action") as HTMLElement;
-      expect(popup.style.left).toBe("62px");
-      expect(popup.style.top).toBe("100px");
-      expect(popup.getBoundingClientRect().right).toBeLessThanOrEqual(192);
-      expect(popup.getBoundingClientRect().bottom).toBeLessThanOrEqual(192);
-
-      mounted.rerender(<ConflictAction action={{ ...action, x: 195, y: 195 }} viewport={viewport} onSave={() => {}} />);
-      expect(popup.style.left).toBe("62px");
-      expect(popup.style.top).toBe("142px");
-      expect(popup.getBoundingClientRect().right).toBeLessThanOrEqual(192);
-      expect(popup.getBoundingClientRect().bottom).toBeLessThanOrEqual(192);
-      expect(clampConflictAction({ x: 100, y: 100 }, viewport, { w: 130, h: 50 })).toEqual({ x: 62, y: 100 });
-    } finally { spy.mockRestore(); }
-  });
-});
```
(Last 34 `-` lines = the deleted `ConflictAction.test.tsx`, verbatim; the 26 above are the selector edits.)

## New tests
- `WorldContextMenu.test.tsx` (12): clamp port; null renders nothing; menuitem roles + aria-disabled + hint in accessible name; first-enabled focus; Arrow cycle/skip; Escape; select->onSelect then onClose (order); `keepOpen` leaves closing to caller; disabled click inert; outside pointerdown closes/inside doesn't; outside wheel closes; no listeners once closed.
- GBA (`WorldCanvas: context menu (Plan 6c E3)`, 13 incl. 2 it.each): open-map; Edit here present+enabled / absent; badge items+order; badge on tiny map targets badge's map; empty space closes; right-click never selects/pans/POSTs; ContextMenu + Shift+F10 open at map centre (75,55) with preventDefault; zero/two selected -> nothing; Shift+dblclick opens + zero `/api/world/placement` calls (full real sequence mousedown/up/click x2 + dblclick); Ctrl/plain dblclick don't; pointerdown+mousedown closes; Escape refocuses canvas; Dismiss clears toast and failed save keeps menu open.
- GBC (`GbcWorldCanvas: context menu (Plan 6c E3)`, 7 + 1 in D3 describe): disabled Edit here w/ hint; badge item order; empty closes; ContextMenu/Shift+F10 at centre (100,100); outside-mapFilter -> nothing; pointerdown closes; Dismiss; D3-describe `Shift+double-click on a warp marker opens the map under it instead of the preview (Plan 6c E3)` (plain dblclick afterwards still previews).
- `AppWorldContextMenu.test.tsx` (2): menu Open in Map view -> Map mode, `.app__status` "Route1", tree row current; dirty + cancelled confirm -> stays World, selection stays PalletTown, confirm called once.

## Decisions / notes
- `WorldMenuItem` gained optional `keepOpen?: boolean` (spec type had 4 fields). Needed: D4's rejected-POST tests (selector-only edits allowed) click `Accept conflict` again without re-right-clicking after a failure, so the menu must stay open on a failed save. Conflict items use `keepOpen`; the canvas closes the menu itself only when `toggle` resolves true. Other items: select -> onSelect, then onClose, as spec.
- Escape: menu registers a `window` keydown Escape listener while open (not only a menu-div handler) so the unchanged D4 GBC test (`fireEvent.keyDown(window, {key:"Escape"})`) stays green; menu-focused Escape reaches it by bubbling. `onClose` in both canvases = `setMenu(null)` + refocus canvas.
- Outside close: document `pointerdown` + `wheel` listeners (ignore targets inside the menu). jsdom `mouseDown` fires no pointerdown, so the "pan start" tests fire pointerDown then mouseDown (the real browser sequence).
- Items are built at open time but call `onOpenMap`/`onEditHere` via refs updated each render (a menu can outlive App renders; `openMapFromWorld` closes over `selected`/dirty state).
- "Open in Map view" is offered only when `onOpenMap` is supplied (both families; GbcApp/GBA App always supply). Existing D4 tests mount without it, so their menus show only the conflict item (and GBC's disabled Edit here).
- Badge entries gained `map`; right-click resolves map as badge's map first, else `hitTest`. (Badge centre can sit outside its map body on tiny maps.)
- GBA Shift+dblclick also requires `!ctrlKey && !metaKey` (spec: Ctrl/Meta keep the early return). Shift+mousedown without movement never POSTs (`commitMapDrag` only posts on changed tile); pinned in the GBA Shift+dblclick test via zero `/api/world/placement` calls.
- GBC Shift+dblclick returns after the Shift branch regardless of hit (never reaches the marker preview).
- `onEditHere` prop added to `WorldCanvasProps`; App does not pass it (E4).
- Conflict toast now `<span class="world-canvas__toast-text">` + `×` button `aria-label="Dismiss"` (same shape as `saveError` toast; its label stays "Dismiss error").

## Concerns
- C1: `keepOpen` addition (above) deviates from the spec's 4-field `WorldMenuItem`; forced by unchanged D4 tests. Needs coordinator OK.
- C2: Escape via window listener (above) instead of menu-local only; also forced by an unchanged D4 test.
- C3: X-d survives: GBC keyboard-open `mapFilter` guard is shadowed by the existing effect that clears `selectedMap` when it leaves `mapFilter`, so the guard is unobservable in tests (kept per spec; D3's `does not keyboard-open a selected map removed from the current scope...` covers Enter likewise).
- C4: not verified in a real browser: whether a keyboard ContextMenu keypress also fires a native `contextmenu` event after our `preventDefault`ed keydown (if so, `onContextMenu` would hit-test the event's coordinates and could close/replace the keyboard-opened menu). No Browser/dev-server check done (no preview server run). Right-click `pointerdown` ordering (pointerdown closes, then contextmenu reopens) is the designed behaviour.
- C5: GBC has no explicit "Shift+mousedown, no movement, no POST" pin (spec listed it for GBA only); GBC `commitMapDrag` has the same unchanged-position guard.
