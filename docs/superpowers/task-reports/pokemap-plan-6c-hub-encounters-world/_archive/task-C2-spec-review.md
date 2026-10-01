# Task C2 spec-compliance review

Reviewed `git diff 3f1668a eed9ec9` (src + test) against `task-C2-spec.md` (binding); implementer report treated as claims. Code re-derived; all mutations re-run by me.

## Verdict: ✅ spec-compliant. Every Design item as written; all 12 spec mutations + 10 extras red except X5 (unpinned, Minor). But **P1 is real** (Important, a gap in the spec's design, both families; not implementer error). Recommend a C2 fix-round with fix (a) below before C2 closes.

| ID | Sev | Where | Finding | Fix |
|---|---|---|---|---|
| SR-F1 | Important (spec-design gap) | `App.tsx` grep `const selectMapFromWorld`; `GbcApp.tsx` same; jump effects grep `appliedJumpTokenRef` in `WorldCanvas.tsx` + `GbcWorldCanvas.tsx` | P1 confirmed by test, both families: a world-click selection never updates `jumpTarget`, so the next World-mode remount jumps to a **stale** map (and flashes its outline) while the tree shows the selected one. Also: world-click-only, then Map→World, now gives no jump at all (GBA lands on zoom-1/pan-0 origin). Before C2, GBA's World entry always centred on `selected`. | Fix (a), see P1 |
| SR-F2 | Minor (coverage) | `App.tsx` grep `key="dungeon"` | X5: passing `onSelectMap={selectMapFromWorld}` to the dungeon `WorldCanvas` survives (App.test 24/24 green). The spec's "dungeon canvas gets nothing" is implemented but no test pins it. | Optional: a dungeon-mode canvas click leaves tree `aria-current` unchanged. Low value, so it can be deferred. |
| SR-F3 | Minor (pre-existing test flake, test-only) | `WorldCanvas.test.tsx` "jump to map > pans/zooms to the given map's real placement when jumpToken changes" | P2: the `waitFor(clearRect)` gate does nothing (proved, see P2), so the synchronous highlight read races React's scheduled passive effect plus re-render. | Replace the gate+sync read with `await waitFor(() => expect(utils.container.querySelector(".world-canvas__jump-highlight")).toBeTruthy())`. Optionally also assert style `0/0/100/100`, which the test's comment promises but never checks. |

## 1. Design items (each verified in code)
- **MapTree**: `navRef` on `<nav>`, `filterRef` on filter input; effect body byte-matches the spec; deps `[selected]` only; comment explains deps + focus. No CSS. ✅
- **setup.ts**: `Element.prototype.scrollIntoView ??= () => {};` + comment, inside the existing `typeof document` guard, CRLF preserved (file is all-CRLF, 21/21). ✅
- **WorldCanvas**: `onSelectMap?` prop with doc comment; `if (hit) onSelectMap?.(hit.map);` is the last line of `const onCanvasClick =`, after the ctrl/meta/shift/`dragMovedRef` early return and after hit-test. `onCanvasDoubleClick` untouched. ✅
- **App.tsx**: `jumpTarget` state + comment pointing at GbcApp's F1 comment; `changeSelection` (guard text unchanged, returns bool, `setSelected`/`setSelectedEvent(null)`/`setCurrentStamp(null)`, original comments moved with them); `selectMap` = `changeSelection` then `setJumpTarget` + `setSelectVersion` side by side (none nested in updaters); `selectMapFromWorld` = `if (name !== selected) changeSelection(name)`; World canvas `jumpToMap={jumpTarget}`, `jumpToken={selectVersion}`, C1's `onJumpToMap={selectMap}` kept, `onSelectMap={selectMapFromWorld}`; dungeon canvas unchanged. `setSelected` has only one caller (inside `changeSelection`). ✅
- **GbcApp.tsx**: no diff. ✅
- **Tests**: MapTree 7 (all spec bullets), WorldCanvas 4 (plain/modifier/empty/drag), App 5, GbcApp 1. "Tree click in World still jumps" is named as the C1 test, not duplicated. X6/X7 prove that test pins both `setJumpTarget` and the `selectVersion` bump. ✅

### Deviations judged
- App test count is 5, not 3: **accept**. The spec's G4 claim ("the same test red") is wrong for G4a (bumping only `selectVersion` while `jumpTarget` is null never jumps), so the extra "after a tree jump" test is required; I re-ran it and it is red (G4a). The dirty cases are split into cancel, confirm and re-click, which also pins the `name !== selected` rule (G5b).
- In `selectMap`, the `selectVersion` bump now comes after the resets. **Accept**: the updates are batched in one handler, so there is no observable difference (the X10 and existing-suite runs are green at HEAD).

## 2. U1
- `git diff 3f1668a -- packages/ui/test`: the only removed line is the `MapTree.test.tsx` vitest import line (gains `beforeEach, afterEach`), as named. All other test lines are additions; `setup.ts` +2 (infrastructure, named). ✅
- GBA behaviour beyond the spec: none in the implementer's code. The World-entry behaviour change in SR-F1 comes from the spec mandating `jumpToMap={jumpTarget}`, not from a deviation.

## 3. Mutations (anchor-asserted in-memory, restored byte-compared; no git undo; `git status --porcelain` identical before and after: only the coordinator's untracked `task-C2-quality-review.md`)

| ID | change | result | red test(s) |
|---|---|---|---|
| T1 | deps `[selected, filter]` | RED | MapTree C2 "typing in the filter does not scroll" |
| T2 | `block: "start"` | RED | "a selection change scrolls … once, with block: nearest" |
| T3 | drop `group.open = true` | RED | "expands a collapsed group …" |
| T4 | no deps array | RED | "a rerender with the same selection …"; "typing in the filter …" |
| T5 | drop focus guard | RED | "a selection change while the filter has focus …" |
| G1 | WorldCanvas never calls `onSelectMap` | RED | WorldCanvas "a plain click … once with its name"; App C2 F1-mirror, after-tree-jump, dirty cancel, dirty confirm |
| G2 | call before early return | RED | WorldCanvas "shift-click and ctrl-click …"; "the trailing click of a drag …" |
| G3 | `jumpToMap={selected}` | RED | App C2 F1-mirror (jump highlight present) |
| G4a | world click bumps `selectVersion` only | RED | App C2 "a canvas click after a tree jump … does not re-jump" (F1-mirror survives, as the implementer found) |
| G4b | world click sets `jumpTarget` only | RED | App C2 F1-mirror |
| G4c | both | RED | F1-mirror; after-tree-jump |
| G5 | skip dirty guard | RED | App C2 dirty "asks to discard first …"; "confirming the discard …" |
| G5b | drop `name !== selected` | RED | App C2 dirty "re-clicking the already-selected map …" |
| G6 | App omits `onSelectMap` | RED | App C2 F1-mirror, after-tree-jump, dirty cancel/confirm |
| G7 | GbcApp omits `onSelectMap` | RED | GbcApp C2 "a canvas click on a map makes its tree row current …" |
| X1 | drop `if (!row) return` | RED | MapTree "a selected map hidden by the filter …" (TypeError) |
| X2 | query first `.map-tree__map`, not `aria-current` | RED | 4 MapTree C2 tests |
| X3 | `onSelectMap?.(hit?.map ?? "")` | RED | WorldCanvas "a click on empty space …" |
| X4 | drop `dragMovedRef` from click early return | RED | WorldCanvas "a plain drag over a map still pans …"; C2 "trailing click of a drag …" |
| X5 | dungeon canvas gets `onSelectMap` | **GREEN** | (none): SR-F2 |
| X6 | `selectMap` drops `setJumpTarget` | RED | App C1 lens list jump; C2 after-tree-jump; 3 dirty (entry readout) |
| X7 | `selectMap` drops `selectVersion` bump | RED | App C1 lens list jump |
| X8 | remove `setup.ts` stub | RED | 19 App + 8 MapTree (`scrollIntoView is not a function`) |
| X9 | deps `[selected, data]` | RED | MapTree "… new-but-equal data object …" |
| X10 | `changeSelection` drops `setSelected` | RED | 19 App tests |

Anchor misses: X8 first missed (LF anchor on a CRLF file), was reported, fixed to CRLF and re-run (row above). Every requested ID T1–T5 and G1–G7 is present.

## 4. P1: REAL (both families). Severity Important.
- **Trace** (both canvases, grep `appliedJumpTokenRef`): the ref is per-instance and starts `undefined`. `key="world"` (GBA) / the conditional `mode === "world"` (GBC) unmounts on Map mode, so on re-entry the effect sees `jumpToken=N ≠ undefined` with `jumpToMap = jumpTarget = A` and jumps to A. A world click only `setSelected(B)`, so `jumpTarget` stays A.
- **Proved by test** (temporary probes appended, then restored): tree-click A in World → world-click B → Map → World → centre click.
  - GBA HEAD: readout 63%, jump highlight present, centre click selects **Route1** (A), not Route2 → red.
  - GBC HEAD: jump highlight present, centre click selects **OlivineCity** (A) → red.
  - GBC also hits it through a natural flow (pre-existing since GBC's F1): double-click B (`openMapFromWorld`, which doesn't touch `jumpTarget`), edit, return to World → jumps to the old tree target.
- **Impact**: the view lands on, and outlines, a map other than the highlighted/edited one after an ordinary Map↔World round-trip. There is no data loss, so not Critical. It also undoes GBA's pre-C2 "World entry centres on the selected map" whenever the selection came from a world click.
- **Fix (a): recommended.** Both halves are needed:
  - App: `if (name !== selected && changeSelection(name)) setJumpTarget(name);`
  - GbcApp: `selectMapFromWorld = (name) => { setSelected(name); setJumpTarget(name); }`. Also add `setJumpTarget(name)` in `openMapFromWorld` for robustness; today the dblclick's first click already covers it.
  - Both jump effects: `if (!jumpToMap) { appliedJumpTokenRef.current = jumpToken; return; } if (!world) return;` This keeps the "retry once world loads" path for a non-null target.
  - Measured: both probes green (GBA re-entry 63% and centred on Route2; GBC centred on OlivinePort). MapTree, WorldCanvas, App, GbcApp and GbcWorldCanvas tests all green (233/233).
  - F1 kept: the first canvas click on token 0 is already recorded as applied. App-only (a) without the canvas half is RED: App C2 F1-mirror and GbcApp "a canvas click (no tree click yet) does not jump the view -- pinned exact view (spec review F1)". So the existing F1 tests pin the canvas half.
- **Fix (b): rejected.** Clearing `jumpTarget` on a world click is also green, 233/233, with no stale jump. But re-entry then doesn't jump at all: GBA lands at 6%, zoom 1, pan 0 (WorldCanvas has no load fit), and GBC at its fit (15%). So the selected map is off-view: a worse regression of GBA's entry behaviour.
- **Pin with**: my two probe tests turned into real tests (App.test + GbcApp.test, "tree jump A, world click B, Map, World: view centres on B, not A"), plus one unit test per canvas: mount `jumpToMap={null} jumpToken={0}`, rerender `jumpToMap="A" jumpToken={0}` → no `.world-canvas__jump-highlight`; rerender `jumpToken={1}` → highlight.

## 5. P2: load-only race in the test, not in the product.
- **Experiment** (one run, restored): asserted synchronously right after `render(<WorldCanvas jumpToMap="Target" jumpToken={1} />)`. "Loading world…" is still shown, clearRect has **already been called**, and there is no highlight: GREEN. The draw effect (grep `ctx.clearRect(0, 0, canvas.width, canvas.height)`) runs at mount with `world` null. So `waitFor(clearRect)` passes on its first check and only adds RTL's single `setTimeout(0)` drain.
- **Race**: the `Loading world` waitFor passes on the DOM commit that sets `world`. The highlight then needs the scheduled passive jump effect, then `setJumpHighlight`, then another render commit, which can take more than one scheduler task. Under full-suite load that can outrun the one drain, so the synchronous `querySelector` gets null.
- **Not Phase B's timer race**: the 2000 ms fade timer is held. The sibling test "re-jumps even when clicking the same map name…" already uses the robust form.
- **Fix**: SR-F3, test-only.

## 6. Gate (run alone, once)
- `npm test`: **1,980 passed / 0 failed, 118 files** (21.6 s); no flake this run.
- `npm run typecheck`: clean.
- `npx vite build` (packages/ui): OK, js 311.48 kB.
- Tree after: only the coordinator's untracked `task-C2-quality-review.md`; nothing of mine left. Ports untouched, no processes started besides vitest/tsc/vite.
