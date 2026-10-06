# E3 spec-compliance review

Range `2314120..0d2c332` (f9fd072, a0d0806, 5e15f7b, 527d64f). Reviewer: independent; read-only on source except in-memory mutations (restored in `finally`, `Buffer.compare` identical every run, `git diff --stat` empty after).
Rulings honoured, not flagged: `keepOpen`, window-level Escape, GBC keyboard-open `mapFilter` guard (P20 survives = the accepted equivalence).
Gate re-run (spec's 6 files + `AppWorldContextMenu.test.tsx`): 7 files / 287 tests pass.

## Verdict: PASS
Every spec requirement verified in code. E3-M1..M7 all RED. 4 Low test-gap findings (non-blocking), 2 informational.

## Checklist
| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | `WorldContextMenu` props `{menu,viewport,onClose}`; `WorldMenuItem` fields | OK (+`keepOpen`, ruled) | WorldContextMenu.tsx:5-17,38 |
| 2 | `div.world-context-menu role=menu`; `button type=button role=menuitem`; disabled -> `disabled`+`aria-disabled="true"` | OK | WorldContextMenu.tsx:74-90 |
| 3 | Hint visible `<small .world-context-menu__hint>` inside item; in accessible name | OK; test pins name `"Edit here GBC editing arrives with Plan 7"` | WorldContextMenu.tsx:88; WorldContextMenu.test.tsx (renders menuitems...) |
| 4 | Clamp moved unchanged, renamed `clampMenuPosition`, inset 8 | OK; body byte-identical to deleted `clampConflictAction` (diff) | WorldContextMenu.tsx:21-28 vs `2314120:ConflictAction.tsx` |
| 5 | `ConflictAction.tsx` + test deleted; every assertion ported, identical numbers | OK: 62px/100px, rerender 195,195 -> 62px/142px, right<=192, bottom<=192 x2, `clampMenuPosition({100,100},{200,200},{130,50})` = `{62,100}`; only renames (class, fn, `action`->`menu`) | WorldContextMenu.test.tsx:7-37 vs base test |
| 6 | Focus first enabled on open | OK; P13 RED | WorldContextMenu.tsx:42-44 |
| 7 | Arrow Down/Up cyclic over enabled, skip disabled | OK; M4 RED | WorldContextMenu.tsx:62-70 |
| 8 | Enter/Space native; Escape closes + canvas refocus; select -> onSelect then onClose | OK; P7/P14/P22 RED | WorldContextMenu.tsx:47-60,84; Canvas `closeMenu` (GBA WorldCanvas.tsx closeMenu, GBC GbcWorldCanvas.tsx closeMenu) |
| 9 | Close on outside `pointerdown` and `wheel` | OK (document listeners, ignore inside); M3, P3 RED | WorldContextMenu.tsx:47-57 |
| 10 | CSS real tokens only, no `.btn`, `min-width:0`, `overflow:auto`, max-w/h, `box-sizing`, hint muted; `.world-canvas__conflict-action` + child rule deleted | OK. Tokens used (`--bg-panel-raised`,`--border-strong`,`--bg-hover`,`--text-primary`,`--text-muted`,`--text-xs`,`--space-1/2`) all defined in `:root` styles.css:7-15,120-126 (+ light overrides 136-144). `min-width:0` on menu, item, hint. No `.btn`/`map-canvas__btn` anywhere (grep). Radius literal `4px` | styles.css:950-1000 |
| 11 | Hook: `{error,setError,isAccepted,acceptedCount,acceptedKeys,toggle}`; `action/setAction/save`+Escape listener dropped | OK | useConflictAcceptance.ts:8-26 |
| 12 | D4 semantics kept: guarded POST (`fetchGuarded`+`isAcceptedConflictsResponse`), `acceptedKeys` override from response, failure keeps ack + shows error | OK; M6 RED (4), P18 RED (4) | useConflictAcceptance.ts:15-23 |
| 13 | Toast Dismiss (`aria-label="Dismiss"`, clears error) both canvases | OK; P6a/P6b RED | GBA WorldCanvas.tsx toast block; GBC GbcWorldCanvas.tsx toast block |
| 14 | Right-click: preventDefault; badge first then map body; order Open / Edit here / conflict | OK both; P2a/P2b RED | GBA `openMenuAt`+`onCanvasContextMenu`; GBC `openMenuAt`+`onContextMenu` |
| 15 | GBA "Edit here" only with `onEditHere` | OK; P17 RED | GBA `openMenuAt` |
| 16 | GBC "Edit here" always (on a map), disabled, hint exactly "GBC editing arrives with Plan 7" | OK; M1, P1, P12 RED | GBC `openMenuAt` |
| 17 | Empty space: no menu, open menu closes | OK; P9a/P9b RED | `setMenu(items.length>0 ? ... : null)` |
| 18 | Right-click never pans/selects/POSTs | OK; D4 right-button tests + new GBA test (mousedown button 2 + shift, move, up, contextmenu: no outline, 0 `/api/world/placement`) green | WorldCanvas.test.tsx "right-click never selects, pans or POSTs..." |
| 19 | Keyboard open (ContextMenu / Shift+F10): GBA only `selected.size===1`; GBC `selectedMap` in `mapFilter`; centre of map screen rect; map items only; preventDefault | OK; M5, P16, P26 RED; P20 accepted | GBA `onCanvasKeyDown`; GBC `onKeyDown` |
| 20 | GBA Shift+dblclick -> `onOpenMap`, before early return, `!dragMovedRef`; Ctrl/Meta keep early return; no placement POST | OK; M2, P4 RED (also existing "Shift+mousedown ... no real movement does not post") | GBA `onCanvasDoubleClick` |
| 21 | GBC Shift+dblclick opens map even over warp marker (bypasses preview); plain dblclick unchanged | OK; P8 RED; test also does a plain dblclick afterwards -> preview dialog, `onOpenMap` count unchanged | GBC `onDoubleClick`; GbcWorldCanvas.test.tsx D3 describe |
| 22 | GBA `onOpenMap`/`onEditHere` props; App `openMapFromWorld` via `changeSelection`; both mounts wired; no `onEditHere` passed | OK; M7 RED. World mount line 266, dungeon mount line 270 | App.tsx:113-117,266,270 |
| 23 | DESIGN.md entry (class, items per family, keyboard) | OK | DESIGN.md "World context menu (Plan 6c E3)" |
| 24 | Existing tests: only the 8 named D4 tests edited, selectors only | OK. Mapped every `button`/`conflict-action` line in base to its enclosing `it`: exactly the 8 titles in implementer report (4 GBA `WorldCanvas`, 4 GBC `conflict badge`). `git diff 2314120 0d2c332 -- packages/ui/test \| grep '^-[^-]'`: 24 removed lines in the two canvas test files, each = `ByRole("button"` -> `ByRole("menuitem"` or `world-canvas__conflict-action` -> `world-context-menu`; scripted check: every normalised removed line has an identical added line (24/24 MATCH). Remaining removed lines = deleted `ConflictAction.test.tsx` (ported, row 5). `App.test.tsx`, `GbcApp.test.tsx`, `styles.test.ts` untouched | diff |
| 25 | New tests per spec list (menu / GBA / GBC / App file) | OK; all items present (GBA 13, GBC 7+1, menu 12, App 2) | test files |

## Findings
| # | Sev | Finding | Fix |
|---|---|---|---|
| F1 | Low (test gap, P21 SURVIVED) | GBA Shift+dblclick branch's `!ctrlKey && !metaKey` is unpinned; the Ctrl test uses Ctrl alone | Add `fireEvent.doubleClick(canvas,{ctrlKey:true,shiftKey:true,clientX:70,clientY:50})` (and metaKey) to "Ctrl+double-click..." test; expect `onOpenMap` not called |
| F2 | Low (P15 SURVIVED) | Plain `F10` opening the menu is unpinned (spec: Shift+F10 only) | In the "opens nothing" GBA/GBC test, select one map and fire `{key:"F10"}`; expect no menu |
| F3 | Low (P19 SURVIVED) | App dungeon-mount `onOpenMap` wiring has no test (spec requires wiring; tests only listed World) | Optional: App-level test entering Dungeon mode with a dungeon open, or accept as code-verified (App.tsx:270) |
| F4 | Low (P23, P25 SURVIVED) | GBC `closeMenu` canvas refocus and GBC badge-map resolution (badge centre outside its map body) are unpinned; GBA has both | Port GBA tests "Escape ... returns focus to the canvas" and "badge whose map body is not under the pointer ..." to `GbcWorldCanvas.test.tsx` |
| I1 | Info | "Open in Map view" is offered only when `onOpenMap` is supplied (both families); spec text implies unconditional on hit. Needed so unchanged D4 tests (no `onOpenMap`) still pass; App/GbcApp always wire it; DESIGN.md states it. Consequence: GBA map-body right-click with neither prop shows no menu | None; recommend coordinator note it as accepted |
| I2 | Info (unverified, implementer C4) | Real browsers may fire a native `contextmenu` after the keyboard-open keydown, which `onContextMenu` would hit-test and could close/replace the menu. No browser run done here either (jsdom cannot show it) | If observed: in both `onContextMenu` handlers ignore events with `e.button !== 2` (keyboard-originated contextmenu reports button 0), or `if (e.detail === 0 && !e.clientX && !e.clientY)` |

C5 (implementer): no GBC "Shift+mousedown no movement -> no POST" pin; spec scoped that to GBA; GBC `commitMapDrag` has the same unchanged-tile guard. Not a finding.

## Mutations (scratch harness outside repo: exact-once anchor, in-memory, `finally` restore + byte-compare; run = vitest on the named files)
| id | mutation | result | killer(s) |
|---|---|---|---|
| E3-M1 | GBC Edit here `disabled:false` | RED | GBC `right-click on a map shows Open in Map view and a disabled Edit here ...` |
| E3-M2 | GBA Shift+dblclick branch -> `if (false)` | RED | GBA `Shift+double-click on a map opens it ... without ever POSTing` |
| E3-M3 | remove outside `pointerdown` listener | RED (3) | menu `a pointerdown outside closes...`; GBA `a canvas mousedown (pan start) closes...`; GBC `a canvas pointerdown closes...` |
| E3-M4 | Arrow nav over all buttons | RED | menu `ArrowDown/ArrowUp cycle ... skip disabled` |
| E3-M5 | GBA kbd open `selected.size >= 1` | RED | GBA `the keyboard opens nothing with zero or two selected maps` |
| E3-M6 | `toggle` swallows POST failure | RED (4) | D4 `shows a malformed accept response...` (GBA), D4 `shows a rejected POST response and retains...` (GBC), both new Dismiss tests |
| E3-M7 | App ignores `changeSelection` result | RED | `AppWorldContextMenu` `a dirty session with a cancelled confirm keeps World mode...` |
| P1 | GBC hint text "Plan 7" -> "Plan 8" | RED (3) | GBC disabled-Edit, badge-order, keyboard tests |
| P2a / P2b | GBA / GBC item order swapped (Edit before Open) | RED (3) / RED (2) | badge-order + keyboard tests |
| P3 | remove outside `wheel` close | RED | menu `a wheel outside closes` (canvases don't pin it; fine) |
| P4 | `commitMapDrag` POSTs unchanged placement (Shift+dblclick leak) | RED (2) | `Shift+mousedown ... no real movement does not post`; GBA Shift+dblclick |
| P5a / P5b | conflict item without `keepOpen` (GBA / GBC) | RED (2) / RED (1) | D4 rejected/malformed POST tests; GBA Dismiss test |
| P6a / P6b | Dismiss onClick no-op (GBA / GBC) | RED / RED | respective Dismiss tests |
| P7 | remove menu window Escape listener | RED (4) | menu Escape; GBA Escape+refocus; GBC D4 `closes the action with Escape`; GBC keyboard test |
| P8 | GBC Shift branch disabled | RED | GBC D3 `Shift+double-click on a warp marker opens the map under it ...` |
| P9a / P9b | empty-space right-click does not close open menu | RED / RED | `right-click on empty space shows no menu and closes an open one` |
| P10 | clamp inset 8 -> 4 | RED | ported clamp pin |
| P11 | `aria-disabled` removed | RED | menu renders-menuitems |
| P12 | hint not rendered | RED (4) | menu + 3 GBC tests |
| P13 | no focus on open | RED (2) | menu focus + arrow tests |
| P14 | close before select | RED | menu `selecting ... calls onSelect, then onClose` |
| P15 | GBA plain F10 opens | **SURVIVED** | F2 |
| P16 / P26 | kbd open without preventDefault (GBA / GBC) | RED / RED | keyboard tests |
| P17 | GBA Edit here shown without prop | RED (2) | GBA open-map + Edit-here tests |
| P18 | `acceptedKeys` override dropped (`setAcceptedKeys(null)`) | RED (4) | D4 GBA x2, GBC x2 |
| P19 | App dungeon mount without `onOpenMap` | **SURVIVED** | F3 |
| P20 | GBC kbd open ignores `mapFilter` | SURVIVED (accepted ruling; guard shadowed by effect clearing `selectedMap`) | - |
| P21 | GBA Shift+dblclick ignores Ctrl/Meta | **SURVIVED** | F1 |
| P22 | GBA `closeMenu` no refocus | RED | GBA `Escape closes the menu and returns focus to the canvas` |
| P23 | GBC `closeMenu` no refocus | **SURVIVED** | F4 |
| P24 | GBA badge's `map` ignored | RED | GBA `right-click on a badge whose map body is not under the pointer ...` |
| P25 | GBC badge's `map` ignored | **SURVIVED** | F4 |
| P27 | GBC `dragMovedRef` guard removed before Shift branch | RED | GBC D4/F6 `a double-click that ends a real drag does not open the map` |

Scratch: `.../scratchpad/mut.mjs`, `out1.txt`. `.codex/` untouched. No `git checkout/restore/stash`.
