# Plan 6b Task 5: implementer report

Executed against `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/task-5-spec.md`, on branch `plan-6b-gbc-app-layer`, working directly in the repo (no worktree).

## Recovery note (read first)

This report was **not** written by the same container that wrote the code. The implementation (`54fb6f8`) and its full-suite gate ran in a prior container that was restarted before it could write `task-5-implementer.md`. This session picked the work back up: it audited the already-committed code and tests, ran the spec's 7 mutation checks (which had not yet been run against the real harness -- `mutate.mjs`'s anchor list had no Task 5 entries), re-ran the live-verify narrative (viewing every screenshot, and re-driving one check live for stronger evidence), re-ran the full gate, and wrote this report.

**A second, independent finding while picking this up:** by the time this session started, `git log` already showed a second commit, `1cdc31d` ("docs: Plan 6b Task 5 live-verify screenshots"), on top of `54fb6f8`, committing the 11 `screens/task-5-*.png` files this session was told were untracked. Its message ("Captured by the Task 5 implementer before the container restart; its report follows separately.") and its use of this same session's attribution lines indicate an automated checkpoint made this commit during the restart, not a person or an agent turn. This session did not create it and did not need to `git add` the screenshots itself as a result -- `git status --short` was already clean for them before this session's own commit below. Flagged here plainly rather than silently absorbed, since it means the branch now has one more commit than the task briefing described.

## What was built (commit `54fb6f8`)

### 1. `computeFit`'s additive `zoomBounds` parameter, and `drawDiamond` exported (`packages/ui/src/components/WorldCanvas.tsx`)

`computeFit(bounds, viewport, zoomBounds?: { min, max })` -- the third argument is optional and defaults to exactly today's `MIN_ZOOM`/`MAX_ZOOM`, so every existing call site (`fitWorld`, the map-list jump, the empty-maps lens) and every existing `computeFit` test is unaffected. GBC passes `{ min: 1/64, max: 32 }`, because its zoom is screen-px-per-**block** (native 32px), not per-tile (GBA's native 16px) -- GBA's own `MAX_ZOOM` of 16 is the wrong unit for a GBC fit, not a deliberate cap. `drawDiamond` (previously an unexported local) is now exported so `GbcWorldCanvas` draws its conflict badges with the exact same helper rather than a copy; `drawTriangle` (dive/emerge, GBA-only) is deliberately left unexported. Both changes are additive only; `App.tsx`, `MapCanvas.tsx`, and every other GBA file are untouched (`git diff --stat` against pre-Task-5 `HEAD`, restricted to those paths, is empty).

### 2. `isGbcWorldPayload` and `useGbcWorld()` (`packages/ui/src/gbc/guards.ts`, `packages/ui/src/gbc/hooks/useGbcWorld.ts`)

The guard checks `family === "gbc"`, `blockPx === 32` (exact literal, not a widened `typeof`), `placements` as a record whose every value has the 5 numeric fields (`x`,`y`,`width`,`height`,`component`) plus a string `map`, and `components`/`conflicts` as arrays (their own element shapes are trusted once the array itself is confirmed, matching `isGbcMapPayload`'s existing "guard what you index by" posture). `useGbcWorld()` is the simplest possible `useGuardedFetch` caller -- a fixed URL, no per-name reset concern (there is only ever the one world) -- giving a visible error string on a 404, a network failure, or a shape that fails the guard.

### 3. `packages/ui/src/gbc/GbcWorldCanvas.tsx` (new, 631 lines)

Reproduces `WorldCanvas.tsx`'s own mechanics, cited by line in its header comment: viewport measurement kept in the draw effect's deps (Task 21's blanking postmortem); a native `wheel` listener with `{ passive: false }`; zoom around the cursor at `WHEEL_FACTOR` 1.2 (continuous, not stepped, unlike `GbcMapCanvas`); the `intersects` AABB cull; per-visible-placement image loading cached by ref with a `compositeVersion` bump on load; an LOD `small` canvas at `LOD_SCALE` 0.25, drawn below `GBC_LOD_ZOOM_THRESHOLD = BLOCK_PX * LOD_SCALE = 8` (named constant, with a comment tying it to GBA's `4 = 16 * 0.25`); conflict badges via the exported `drawDiamond` in `--danger`, with a hover tooltip.

GBC-specific behaviour, all present: image URL `/api/render/<map>.png?time=<time>`, cache keyed by map, the whole cache cleared (every reference dropped) on a `time` change; initial fit over `initialFitBounds` (union of `components.filter(c => c.maps.length > 1)`'s own bounds) with a "Fit all" button (`fitAllBounds`, every placement); the conflict badge at `Conflict.map`'s top-right corner with the CLI's exact `noteLines` wording (`conflictTooltipText`, `dx,dy = viaA - viaB`); hover tooltip showing map name, `component #i (N maps)`, and size in blocks; click selects (`onSelectMap`, `--overlay-selection` outline), double-click opens (`onOpenMap`); a map-list jump (`jumpToMap`/`jumpToken`) that centres the target at ~60% fill (`JUMP_FILL_FRACTION`, `jumpFit`) and flashes a 2s fading outline; a status strip reading `326 components · 391 maps · zoom N%`. No drag-to-place, multi-select, dungeon layout, warp markers, or sidecar writes -- confirmed absent by reading the file in full.

**Task 4's binding lessons, applied here too:** a single `{ zoom, pan }` view state updated by one pure function (`zoomWorldAboutPivot`, mirroring `GbcMapCanvas`'s own StrictMode fix but for continuous zoom instead of stepped); a dedicated StrictMode regression test (below).

### 4. `GbcApp` wiring (`packages/ui/src/gbc/GbcApp.tsx`)

World mode now renders `GbcWorldCanvas` (replacing Task 3's placeholder), with `time` from the header. A tree click still bumps `selectVersion` (now actually read, not discarded) and passes it through as `jumpToken`/`jumpToMap`, so a tree click in World mode jumps the canvas there, matching `App.tsx`'s own GBA convention. Double-clicking a map on the canvas (`onOpenMap`) selects it and switches `mode` to `"map"`; a single click (`onSelectMap`) only updates `selected`, without bumping `selectVersion` or changing mode, per the spec's "tree clicks jump, canvas clicks don't" distinction.

## Test counts

- Before this task (Task 4 fix round 1's final state): **1516 passed**, the same 6 known baseline failures.
- After: **1572 passed**, same 6 known failures. Net **+56**: `GbcWorldCanvas.test.tsx` (38, new file: pure-function tests for `zoomWorldAboutPivot`, `initialFitBounds`, `fitAllBounds`, `conflictTooltipText`, `shouldUseLod`, `jumpFit`, plus the component-level suite), `guards.test.ts` (+11, `isGbcWorldPayload`), `useGbcWorld.test.ts` (4, new file), `WorldCanvas.test.tsx` (+1, the `computeFit` zoomBounds test), `GbcApp.test.tsx` (+2, the tree-jump-into-world-mode and double-click-opens-map wiring tests).
- `1516 + 56 = 1572`. Confirmed by this session's own full run (below), matching the prior container's own pre-commit gate log exactly.

## Gate result (re-run by this session)

```
npm test 2>&1 | tee .../scratchpad/t5-final.log
grep -E "^ FAIL " t5-final.log | sort -u | diff - baseline-fails.txt
```
`diff` is empty -- exactly the same 6 pre-existing, unrelated failures as `baseline-fails.txt`:
```
 FAIL  packages/core/test/config/engine.test.ts > engineProfile > parses pokefirered's real porymap.project.cfg
 FAIL  packages/core/test/config/engine.test.ts > engineProfile > parses the subject repo's real porymap.project.cfg
 FAIL  packages/core/test/load/blocks.test.ts > parseBlocks > encodeBlocks is the exact inverse of parseBlocks, every layout, both files
 FAIL  packages/core/test/load/blocks.test.ts > parseBlocks > the three fields are independent -- a wrong shift moves them together
 FAIL  packages/core/test/render/layout.test.ts > renderLayout > supportsLayoutVersion survives a Porymap save that deletes layout_version keys
 FAIL  packages/server/test/world.test.ts > world api > manual is true iff the map name is a key in sidecar.manualPlacements, for every placement (Feature A)
```
`Tests 6 failed | 1572 passed (1578)`. This matches the prior container's own pre-commit run (`t5-test.log`, also 1572/6) exactly -- no drift since the commit.

`npm run typecheck` (`tsc --noEmit` on both `tsconfig.base.json` and `packages/ui/tsconfig.json`): clean, no output.

`git status --short` was clean before and after every step of this session's work (mutations restored from `git show HEAD:<path>`, confirmed empty `git status`/`git diff` after each).

## Mutation table

All 7 of the spec's named mutation checks, run by this session directly against the real source (`git show HEAD:<path>` used to restore after each; `git status --short` clean after every restore):

| # | Mutation | File | Verdict | Killed by |
|---|---|---|---|---|
| 1 | Fit uses all components (`c.maps.length >= 1` instead of `> 1`) | `GbcWorldCanvas.tsx` (`initialFitBounds`) | KILLED | `initialFitBounds (pure) > unions only the multi-map components' bounds, excluding a far-away 1-map interior` + 2 more pure tests + the integration "initial fit covers..." test (9 tests total, incl. 3 unrelated tests that happen to assert on the resulting zoom%) |
| 2 | Don't clear the cache on a time change (drop `imageCacheRef.current.clear()`) | `GbcWorldCanvas.tsx` | KILLED | `time change: URLs are rebuilt with the new time, and the whole image cache is dropped (mutation check #2)` -- exactly its own named test, nothing else |
| 3 | Invert `dx`/`dy` in the tooltip (`viaB - viaA` instead of `viaA - viaB`) | `GbcWorldCanvas.tsx` (`conflictTooltipText`) | KILLED | `dx/dy is viaA - viaB, not the reverse (mutation check #3)` + both real-fixture pin tests (Route17/Route18) + the conflict-badge hover test |
| 4 | Drop culling, so every placement loads (`visible` returns all placements, no `intersects` check) | `GbcWorldCanvas.tsx` | KILLED | `culling: only placements intersecting the viewport get Image objects...` + 2 others (initial-fit and time-change tests, which also assert on what gets loaded) |
| 5 | Use an LOD threshold of 4 (GBA's own value) instead of 8 | `GbcWorldCanvas.tsx` (`GBC_LOD_ZOOM_THRESHOLD`) | KILLED | `discriminates against an LOD threshold of 4 (mutation check #5): true between 4 and 8...` -- exactly its own named test, plus 2 other `shouldUseLod` pins |
| 6 | Drop the `blockPx` guard clause | `guards.ts` (`isGbcWorldPayload`) | KILLED | `rejects blockPx !== 32 (mutation check #6: dropping this clause)` -- exactly its own named test, nothing else |
| 7 | Make `computeFit`'s default bounds change (mutated the `?? MIN_ZOOM` / `?? MAX_ZOOM` fallback) | `WorldCanvas.tsx` (`computeFit`) | KILLED | The new `computeFit's zoomBounds parameter overrides the default...` test, which explicitly pins the *default* (no-third-argument) zoom against the real `MIN_ZOOM`/`MAX_ZOOM` values. Tried two different substitute values for the MAX fallback: `MAX_ZOOM / 2` (this report's own original run) additionally turned a genuinely pre-existing, unrelated `WorldCanvas` test red (`mapFilter (Feature C, dungeon mode) > auto-fits to the dungeon's real-world-positioned members only...`, which hits the `MAX_ZOOM` clamp on real dungeon-sized bounds); the literal `?? 32` the spec reviewer's own harness uses does not reden that same test (32 exceeds the original 16, so it never tightens the clamp enough to matter there). **Correction (fix round 1, F9(b)):** this report's original wording implied *any* MAX-fallback mutation reddens the dungeon test, which the spec review showed false for its own `?? 32` substitute -- both data points are genuine and not contradictory (different substitute values, different collateral), but the report should not have generalised from just one of them. The spec's own "existing tests must go red" requirement is satisfied unconditionally only by the new default-pinning assertions in the `zoomBounds` test itself, which is adequate on its own. |

0 survivors. Every mutation was applied to the real source, run against the exact test file the spec points at, confirmed red, then restored (`git show HEAD:<path>` piped back into the file); `git status --short` was empty after every one of the 7 rounds.

## Live-verify narrative

Confirmed ports 5173/5174 free (Node `net.createServer().listen()` probe) before this session started. The prior container had already generated and (per its scripts, `t5-live.mjs`/`t5-live-2.mjs`/`t5-live-3.mjs`/`t5-gba-smoke.mjs` in the scratchpad) captured all 11 screenshots via a real Chromium (Playwright, viewport 1280×800). **This session opened and looked at every one before trusting it**, then independently re-ran the narrowest, most lesson-sensitive check (the scrollWidth-while-hovering-a-badge check) live to get first-hand evidence rather than relying solely on a screenshot's appearance.

1. **`task-5-world-fit.png`** -- World view's initial fit. Two separate landmasses are visible (the Olivine/Route38/39/Mahogany/Route42/44 cluster and, below it, a second cluster), plus a thin strip of tiny individual-interior thumbnails along the bottom -- **not** the full 391-map, 255×746-block sprawl. Status strip reads `326 components · 391 maps · zoom 7%`. This matches the spec's "fit Johto and Kanto, not the interior sprawl" (the "landmasses" here are the 2 of the 3 real multi-map components large enough to be visually distinct at this zoom; the third is the 2-map one, folded into the same bounding box).
2. **`task-5-conflict-badges.png`** -- panned/zoomed to Route17 (via the sidebar tree filter + click, landing at zoom 28%). Two red diamond conflict badges are visible: one at Route17's own top-right corner (near the vertical Route17 strip's junction with Route16/18), and one further down-right near a second building cluster -- consistent with the corpus's real 2 conflicts (Route17, Route18). Route17 itself has a cyan selection/jump outline.
3. **`task-5-conflict-tooltip.png`** -- hovering the Route17 badge shows a floating tooltip reading exactly **`Route17 placed via Route16; Route18 disagrees by (0,1)`** -- the spec's own pinned wording, character-for-character. The status strip simultaneously reads `Route17 · component #2 (35 maps) · 10×45 blocks`, matching the hover-tooltip requirement (map name, `component #i (N maps)`, size in blocks) independently of the badge tooltip.
4. **`task-5-world-nite.png`** -- same two-cluster fit view, `Nite` now pressed in the header. The palette is visibly darker/more saturated-blue throughout (walls, grass, water all shift from the day view's greens/tans to a uniform dusk-blue tint), confirming a real re-render, not a stale day image under a dark overlay.
5. **`task-5-jump-olivinecity.png`** -- typed "OlivineCity" into the tree filter and clicked it. The canvas jumped to centre OlivineCity, with a cyan outline around it (the jump-highlight) and other nearby maps (unfiltered, still visible) partially in view around it -- not a 100% fit, which would show only OlivineCity itself. **Correction (fix round 1, F9(a)):** the status strip's own `zoom 60%` in this screenshot is 60% of *native* resolution (32 px/block), which this line originally, incorrectly, treated as if it were the *fill fraction* the spec's "fills about 60% of the viewport" describes. The spec reviewer measured the real fill in this exact screenshot at **0.518** (OlivineCity, 20x18 blocks, in the live 1000x668 viewport), not 0.6 -- `jumpFit` clamped the raw fit to `zoomBounds.max` *before* scaling by 0.6, so any map whose full fit exceeded 32 px/block under-filled. Fixed in fix round 1 (F2, below); this screenshot itself was captured before that fix and is superseded by the fix round's own live re-verify.
6. **`task-5-double-click-open.png`** -- double-clicking OlivineCity's jump-highlighted rect switched the app to Map mode with OlivineCity loaded: the header now shows `OlivineCity` next to the time buttons, `Map` is the pressed View button, and the real `GbcMapCanvas`/`GbcMetatilePalette` pair renders (status strip `tileset TILESET_JOHTO · 128 metatiles · 20×18`), not a placeholder.
7. **`task-5-fit-all.png`** -- clicking "Fit all" zoomed out to `zoom 3%`, now showing the two landmasses much smaller plus **all** of the individual-interior thumbnails as a dense grid below them (391 maps total, vs. the initial fit's multi-map-only bounds) -- confirming "Fit all" covers every placement, not just the connected components.
8. **`task-5-narrow-viewport-check.png`** + this session's own re-run -- Task 4's binding lesson ("flex children holding long text need `min-width: 0`... verify at 1280×800 and 1024×768 that `scrollWidth === clientWidth` while hovering, with the tooltip showing") applies to Task 5 too. This session re-drove this check live rather than trusting the screenshot alone: jumped to Route17, computed the conflict badge's exact on-screen position from the jump-highlight outline's own DOM rect, hovered it, and read `document.documentElement.scrollWidth`/`clientWidth` directly at both sizes:
   - 1280×800: tooltip visible, text `"Route17 placed via Route16; Route18 disagrees by (0,1)"`, `scrollWidth(1280) === clientWidth(1280)`.
   - 1024×768: same tooltip text, `scrollWidth(1024) === clientWidth(1024)`.
   No horizontal page overflow at either size, with the longest realistic tooltip/status text actually showing.
9. **`task-5-zoomed-route-area.png`** -- a supplementary full-resolution zoom (88%) over a Route17/18 area (grass/water/trees/a house), taken before the precise Route17 jump above, showing native-resolution art with no LOD blur or seams at the placement boundary visible in frame.
10. **`task-5-gba-world-smoke.png`** -- GBA world view (unmodified `WorldCanvas.tsx`) still renders correctly after restarting `serve.ts` with no `--gbc` flag: the full editing chrome (dungeon auto-layout toggle, spotlight/level-curve/empty-maps/unused-species/method tools, `Fit world`), conflict/dive/emerge legend, and real map art for the Johto region, status `placed 1209 · hidden 701 · unplaced 0 · conflicts 19`.
11. **`task-5-gba-map-smoke.png`** -- GBA map view (unmodified `MapCanvas.tsx`) for `PalletTown`: the full pencil/rect/bucket/dropper/shift/collision toolbar, zoom controls, Grid/Collision/Elevation/Events toggles, event inspector (`No event selected.` / `Add Event`), and real tile art, unchanged.

Ports 5173/5174 were confirmed free again after this session's own live re-check (killed the `tsx packages/server`/`vite` PIDs directly via `ps aux | grep -E "tsx packages/server|node.*vite"`, not `pkill -f vite`, then re-probed with the same Node `net.createServer()` check): **5173 FREE, 5174 FREE**.

## Deviations and concerns

1. **This report's own recovery**, described in full at the top: the implementation and its pre-commit gate were done by a container that restarted before writing this report; this session picked it up, independently re-verified everything (mutation checks, gate, typecheck, live-verify), and wrote this report.
2. **The screenshots were already committed (`1cdc31d`) by an automated checkpoint, not by this session**, before this session examined the repo -- see the recovery note above. This session did not need to `git add` them.
3. No other deviations from the spec were found. Every deliverable in "Deliverables" §1-4 and every test in "Tests" is present and passing; all 7 named mutation checks were run fresh (not previously covered by `mutate.mjs`, whose anchor list predates Task 5) and all 7 killed cleanly, with no survivors and no test-gap papering-over needed.

## Files

- `packages/ui/src/components/WorldCanvas.tsx` -- additive `computeFit` zoomBounds param + exported `drawDiamond`.
- `packages/ui/src/gbc/GbcWorldCanvas.tsx` -- new, the read-only GBC world canvas.
- `packages/ui/src/gbc/guards.ts` -- `isGbcWorldPayload`.
- `packages/ui/src/gbc/hooks/useGbcWorld.ts` -- new.
- `packages/ui/src/gbc/GbcApp.tsx` -- World-mode wiring.
- `packages/ui/test/WorldCanvas.test.tsx`, `packages/ui/test/gbc/GbcWorldCanvas.test.tsx` (new), `packages/ui/test/gbc/guards.test.ts`, `packages/ui/test/gbc/useGbcWorld.test.ts` (new), `packages/ui/test/gbc/GbcApp.test.tsx`.
- `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/screens/task-5-*.png` (11 files, committed in `1cdc31d`).

## Fix round 1

Addresses `task-5-spec-review.md` (verdict: not compliant, 4 Important findings) and `task-5-quality-review.md` (verdict: approve-with-fixes), per the coordinator's brief. This round itself survived one usage-limit interruption mid-way (after the header-comment rewrite and the `fitted`-flag plumbing had been redone once already, following an earlier, unrelated mishap where running the reviewer's own mutation harness against *uncommitted* source briefly discarded that in-progress work by restoring `git show HEAD:<file>` -- recovered by redoing the edits and, from that point on, committing every green step immediately so a further interruption would cost nothing). Both incidents are noted here for the record, not hidden.

### Commits

| SHA | Summary |
|---|---|
| `36449f9` | F1 (jump target separated from `selected`), F2 (`jumpFit` scales before clamping), F3 (StrictMode pan pinned via the selection outline, for both the wheel path and a new Fit-all-under-StrictMode test), F5 (the `fitted` flag gates culling/loading on the real fit), F7 (`jumpHighlight` keyed as `{map, token}` so a same-map re-click restarts the fade), quality #1 (every `WorldCanvas.tsx` line-number citation replaced with a grep-able anchor phrase, and the header comment's false "never over-fetches" claim corrected), quality #2 (dropped the dead `gbc-world-canvas` class) |
| `1770593` | F4: the spec reviewer's own P2 probe (a late day-time image load after a switch to nite must never be drawn or re-cached) committed as a real test |
| `ec0e3c5` | F6: one test each for the reviewer's remaining named survivors -- X5 (LOD buffer actually drawn), X6 (LOD buffer sized at 8, not 16, px/block), X7 (badge colour asks for `--danger`, not `--accent`), X13 (a viewport resize doesn't re-trigger an already-applied jump), X14 (the jump outline mounts a fresh DOM node, keyed on token), X15 (a double-click ending a real drag doesn't open the map -- first attempt's click coordinates missed every placement and had to be corrected), X17 (hover shows width×HEIGHT, not width×width), X21 (drag pans by the exact mouse delta, not inverted); plus the F7 fade-restart test itself |
| `b9a534b` | A gap this round's own live re-verify caught: `onKeyDown` (quality #3) had been defined but never attached to the `<canvas>` element (no `tabIndex`, `aria-label`, or `onKeyDown` prop), so the keyboard path was dead code until this commit wired it and added 5 tests for it |

### Test counts

Before this round: **1572 passed**, 6 baseline failures (Task 5's own commit `54fb6f8`). After: **1594 passed**, same 6 failures -- net **+22**: `GbcWorldCanvas.test.tsx` grew from 40 to 58 tests (+18: F5's own regression, 2 F2 pure pins, the StrictMode wheel test rewritten to pin the exact pan plus a new Fit-all-under-StrictMode test, F4, X5, X6, X7, X13, X14, X15, X17, X21, F7, and 5 keyboard tests), `GbcApp.test.tsx` grew from 20 to 22 (+2: the F1 regression and the X12 second-tree-click regression), `WorldCanvas.test.tsx` and `guards.test.ts` unchanged.

### Gate (re-run against the final commit `b9a534b`)

```
npm test 2>&1 | tee .../scratchpad/t5-fixround-final-gate.log
grep -E "^ FAIL " t5-fixround-final-gate.log | sort -u | diff - baseline-fails.txt
```
`diff` empty -- the same 6 pre-existing, unrelated failures as `baseline-fails.txt`. `Tests 6 failed | 1594 passed (1600)`.

`npm run typecheck`: clean on both `tsconfig.base.json` and `packages/ui/tsconfig.json`.

### Mutation re-run

Ran `node <scratchpad>/t5rev-mutate.mjs S1 S2 S3 S4 S5 S6 S7a S7b X1 X2 X4 X5 X6 X7 X12 X13 X14 X15 X17 X21` (the original 7 spec mutations plus every named survivor from the spec review, run from the repo root against the committed source). `git status --short` was clean before the run and after every mutation.

| ID | Mutation | Result | Killed by |
|---|---|---|---|
| S1 | fit uses all components | KILLED (15) | `initialFitBounds` pure tests + the initial-fit integration test |
| S2 | no cache clear on time change | KILLED (2) | its own named test + F4 |
| S3 | invert dx/dy | KILLED (4) | `conflictTooltipText` pure tests + the conflict-badge hover test |
| S4 | drop culling | KILLED (5) | initial-fit, time-change, F4, and the culling test |
| S5 | LOD threshold 4 | KILLED (4) | `shouldUseLod` pure tests + X5 |
| S6 | drop blockPx guard | KILLED (1) | its own named test |
| S7a | computeFit default max 16->32 | KILLED (1) | the `zoomBounds` default-pinning test |
| S7b | computeFit default min 1/64->1/128 | KILLED (1) | same |
| X1 | wheel: nested setView inside updater (StrictMode) | KILLED (1) | the rewritten StrictMode wheel test (now pins the exact pan) |
| X2 | Fit all: nested setView inside updater (StrictMode) | **retargeted, see below** | the new Fit-all-under-StrictMode test |
| X4 | late onload re-inserts its entry into the cache | KILLED (1) | F4 |
| X5 | LOD buffer never drawn | KILLED (1) | its own named test |
| X6 | LOD buffer sized at 16px/block | KILLED (1) | its own named test |
| X7 | badge colour `--accent` not `--danger` | KILLED (1) | its own named test |
| X12 | tree click doesn't bump selectVersion | **retargeted, see below** | the second-tree-click test |
| X13 | drop applied-token guard | KILLED (1) | its own named test |
| X14 | jump outline not keyed on token | KILLED (1) | its own named test |
| X15 | dblclick ignores drag guard | KILLED (1) | its own named test |
| X17 | hover shows w×w | KILLED (1) | its own named test |
| X21 | drag pans the wrong way | KILLED (1) | its own named test |

All 20 killed; 0 survivors.

**X2 and X12 anchor retargeting.** The harness matches each mutation by an exact source-text anchor and silently records (without printing) an `ANCHOR-ERROR` when a refactor has moved that text -- both fired here and neither appeared in the harness's own console output, so this was caught only by cross-checking every requested ID against the printed results, not by the harness itself:
- **X2**'s anchor (`setView(computeFit(bounds, viewport, GBC_ZOOM_BOUNDS));` inside `fitAll`) no longer matches because F5's fix wraps that call as `setView({ ...computeFit(...), fitted: true })`. Retargeted by hand: applied the same nested-`setView`-inside-an-updater shape to the new `fitAll` body, ran the suite, confirmed the new "Fit all under `<StrictMode>`" test kills it alone (1 failure), then restored via `git checkout --`.
- **X12**'s anchor (`setSelected(name);\n    setSelectVersion((v) => v + 1);` in `GbcApp.tsx`'s `selectMap`) no longer matches because F1's fix inserts `setJumpTarget(name);` between those two lines. Retargeted by hand: dropped just the `setSelectVersion` bump from the real (three-line) body, ran `GbcApp.test.tsx`, confirmed the new "a second tree click... still jumps" test kills it alone (1 failure), then restored via `git checkout --`.

Both retargeted checks: `git status --short` was clean immediately after each restore, confirmed before moving on.

### Live re-verify

Confirmed ports 5173/5174 free (Node `net.createServer()` probe) before starting; started `npx tsx packages/server/src/serve.ts --gbc /root/pokemap-corpus/pokecrystal-PerfPlus` and `npm run dev --workspace=@pokemap/ui` in the background; drove a real Chromium (Playwright, 1280x800 unless noted).

- **F5 (request count):** opened World view fresh, waited 4s for images to settle, counted `/api/render/*` requests: **80** (matches the AABB-visible count at the real fit; the pre-fix number was ~308). Screenshot `task-5-fix-world-fit.png` -- visually identical to the original `task-5-world-fit.png` (same two-landmass fit), confirming the fix changed only what loads, not what's shown.
- **F1 (click doesn't jump):** opened World view, read the status strip (`zoom 7%`), clicked the centre of the canvas, waited 400ms, re-read the status strip: **identical string**, and `.world-canvas__jump-highlight` count **0**. Screenshot `task-5-fix-click-no-jump.png`.
- **F2 (OlivineCity jump):** jumped to OlivineCity in the real 1000x668 viewport; measured the jump-highlight's own bounding box against the viewport: fill **0.445 (W) / 0.600 (H)** -- `max(fillW, fillH) = 0.6` exactly, matching the pure test and the spec's "fills about 60%" (the pre-fix live measurement was 0.518). **Replaced `task-5-jump-olivinecity.png`** with this corrected capture: OlivineCity now visibly leaves real margin around it (Route38/39 and a second landmass partly in frame), unlike the old screenshot's near-full-bleed fill.
- **Keyboard:** focused the canvas directly (`document.activeElement` was the `canvas.world-canvas__stage` element itself, with `tabindex="0"` and the real aria-label -- confirmed via a dedicated debug script after the first live pass caught the wiring gap described above); pressed `+`: status went from `zoom 7%` to `zoom 8%` (screenshot `task-5-fix-keyboard-zoom.png`); selected OlivineCity on the canvas, refocused it, pressed `Enter`: the app switched to Map view with OlivineCity loaded (`Map` button `aria-pressed="true"`, header status `OlivineCity`, screenshot `task-5-fix-keyboard-enter.png`).
- **Nite (unaffected by this round, re-captured for completeness):** re-captured `task-5-world-nite.png` against the fix-round code -- same darker/blue-shifted palette as before.

**Every one of the above screenshots and the debug script's own console output was read/inspected before being trusted**, not just generated -- the keyboard wiring gap above was found exactly this way (the first live pass's `KB_focused` read back `"map-canvas__btn"`, not the canvas, which is what led to checking the JSX and finding the missing `tabIndex`/`onKeyDown`).

Ports 5173/5174 confirmed free again afterward: killed the `tsx packages/server`/`node .../vite` PIDs directly (`ps aux | grep -E "tsx packages/server|node.*vite"`, never `pkill -f vite`), then re-probed with the same Node `net.createServer()` check.

### Corrections to this report (F9)

Two errors from the original write-up, both now corrected in place above (§"5. `task-5-jump-olivinecity.png`" and the mutation-7 table row), per the spec review's F9:
- (a) The original jump narrative read the status strip's `zoom 60%` (60% of *native* resolution) as if it were the *fill fraction* the spec means by "fills about 60% of the viewport" -- the real fill was 0.518 (F2's bug, now fixed; the corrected screenshot shows the real 0.6 fill).
- (b) The mutation-7 row generalised from a single substitute value (`MAX_ZOOM / 2`) to a claim about "the MAX fallback mutation" broadly; the spec reviewer's own harness uses a different substitute (`?? 32`) that does *not* additionally redden the pre-existing dungeon test. Both data points are genuine; the wording now says which substitute produces which result instead of implying one substitute's behaviour for all.
- (c) (Quality review Important #1 / spec review F5's own header-comment claim): `GbcWorldCanvas.tsx`'s header comment used to claim "the very first render never loads more than what culling already shows" -- false, and the root cause of F5 itself. Corrected in the source's own header comment (commit `36449f9`) rather than just in this report.

### Deviations and concerns (fix round 1)

1. **This round survived one usage-limit interruption**, recovered by re-reading the coordinator's own diff backup and diffing it against the live tree before continuing (identical -- no drift), then committing every subsequent green step immediately.
2. **A second, earlier mishap** (before that interruption): running the reviewer's mutation harness against files that still had uncommitted fix-round edits discarded those edits, since the harness restores from `git show HEAD:<file>` regardless of the working tree. Recovered by redoing the edits from scratch (verified byte-identical in shape to the lost version by re-deriving each one against the same anchors). No mutation was left mis-applied in the final tree -- confirmed by the clean `git status` after every subsequent mutation round and by the final gate/typecheck both passing.
3. **The keyboard-wiring gap** (quality #3's `onKeyDown` defined but never attached to the `<canvas>` JSX) shipped in commit `36449f9` with *no unit test at all* covering the keyboard path -- the coordinator's own mutation-kill list didn't name a keyboard mutation, so nothing forced one, and this round only wrote one after the gap was already found. It was caught by this round's own live re-verify (a real browser showed `tabindex` as `null` and focus landing on an unrelated toolbar button instead of the canvas), not by any test -- there was no test to catch it with yet. `b9a534b` fixes the wiring and adds 5 tests for it in the same commit, so the gap and its regression coverage arrived together; had a keyboard test existed earlier (even one using `fireEvent.keyDown` directly on the canvas, which requires no real focus and would have failed against the unwired code), it would have caught this without needing live verification at all. Documented here as a process gap worth generalising: **a new interactive affordance needs its own test the same commit it's wired, not deferred to "add tests later."**

All source changes in this fix round are additive/corrective to `GbcWorldCanvas.tsx` and `GbcApp.tsx` only; no other GBC or GBA file was touched.
