# Plan 6b Task 5: spec review

Reviewer: spec reviewer (independent). Commit under review: `54fb6f8` (diff vs `5dbab43`). Branch `plan-6b-gbc-app-layer`.

**Verdict: NOT COMPLIANT. Needs a fix round.** There are 4 Important findings. Two are live behaviour defects: F5, where the first World load fetches 308 of 391 renders, and F1, where a single canvas click performs a jump. One is a spec-geometry defect: F2, where the jump fills about 52%, not 60%. The fourth, F3, is that the binding StrictMode test does not pin the pan and a nested-updater mutation survives. The rest is sound: the 7 spec mutations are all killed; the gate matches the baseline (1572 passed, same 6 fails); typecheck is clean; `WorldCanvas.tsx` changes are strictly additive; there is no overflow at 1280 or 1024; and the late-onload race is handled correctly.

## Findings (appended as confirmed)

### Static checks (confirmed)

- `WorldCanvas.tsx` diff is additive only: `computeFit` gains an optional third param (`zoomBounds?.min ?? MIN_ZOOM`, `?? MAX_ZOOM`, so the default path is identical) and `drawDiamond` gains `export`. `git diff 5dbab43..54fb6f8 -- packages/ui/test/WorldCanvas.test.tsx` is +25/-0 (one new test, no existing line touched).
- `useGbcWorld` is a one-line `useGuardedFetch("/api/world", isGbcWorldPayload)`; the guard checks every clause the spec lists.
- Zoom and pan live in one `view` state; wheel (`setView(v => zoomWorldAboutPivot(...))`), drag (`setView(v => ({...v, pan}))`), Fit, initial fit and jump all call `setView` once, with no setter inside an updater.
- Tooltip text matches `cli/src/gbcCommands.ts` `noteLines` (minus its `note: ` prefix and newline): `${map} placed via ${viaB.from}; ${viaA.from} disagrees by (${viaA.x-viaB.x},${viaA.y-viaB.y})`.
- Late-onload race (static reading): each `onload` closes over its own `entry` object. A time switch calls `imageCacheRef.current.clear()`, and the load effect then `set`s a fresh entry per map. So an old image that loads late mutates an orphaned entry that is no longer in the cache and is never drawn. The code is safe, but no test pins it (see the mutation table).

### Gate (re-run by the reviewer)

- `npm test`: `Tests 6 failed | 1572 passed (1578)`. `grep -E "^ FAIL " | sort -u` diffs empty against `baseline-fails.txt`. Log: `<scratchpad>/t5-review.log`.
- `npm run typecheck`: exit 0, no diagnostics.

### Confirmed findings (probe: `<scratchpad>/t5rev-probe.test.tsx`, copied temporarily to `packages/ui/test/gbc/zz-t5rev-probe.test.tsx`, then removed)

**F1 (Important): the first single click on the canvas jumps and zooms, as if it were a tree click.**
`GbcApp` passes `jumpToMap={selected}` and `jumpToken={selectVersion}`, and a canvas click calls `setSelected(name)` through `onSelectMap`. Start with a fresh app (`selectVersion === 0`, `selected === null`) and open World view. The jump effect returns early on `!jumpToMap` *without* recording token 0 as applied. The first canvas click then changes `jumpToMap`, the effect re-runs, and it sees `0 !== appliedJumpTokenRef.current (undefined)`, so it performs a full jump: a 60% re-zoom, a re-centre and the flash outline.
The same happens after returning from Map view: the remounted canvas re-applies whatever `selected` is.
GBA never hits this because its `WorldCanvas` never writes back to `App`'s `selected`.
Probe P3 (real `GbcApp`, 2-map world, 200×200): the status goes from `zoom 31%` to `zoom 38%` and `.world-canvas__jump-highlight` appears after one click. This contradicts the spec ("Click selects"), and the implementer's own comment in `GbcApp.tsx` ("a canvas click is not a 'jump' request").
**Fix:** either record the token as applied whenever the effect reaches the `!jumpToMap` branch with a defined token, or have `GbcApp` pass `jumpToMap` only for tree-driven selections (e.g. a separate `jumpTarget` state set in the tree handler). Add a `GbcApp` test that a canvas click leaves the zoom% unchanged and renders no jump highlight.

**F2 (Important): the jump does not fill ~60% for most real maps, because `jumpFit` clamps *before* scaling.**
`jumpFit` does `computeFit(...)` (clamped to max 32) and then `× 0.6`. So any map whose full fit exceeds 32 px/block lands at 19.2 px/block, never 60% fill. Most towns, routes and interiors are in that group: at the live 1000×668 viewport, that is any map under about 31×20 blocks.
Probe P4: OlivineCity (20×18) gives zoom 19.2 and a **fill of 0.517**, not 0.6. The implementer's screenshot `task-5-jump-olivinecity.png` shows exactly this (a 383×345 px outline in a 1000×668 viewport; its "zoom 60%" is 60% of *native*, which the report conflated with the fill fraction).
The pure test only uses a case where the fit is unclamped (zoom 10).
**Fix:** `zoom = clamp(min(vw/bw, vh/bh) * fraction, min, max)`. Add a pin with a small map (e.g. 20×18 in 1000×668 → zoom 22.27 → fill 0.6).

**F3 (Important): the binding StrictMode test pins only zoom%, not the pan, and there is no Fit-under-StrictMode test. A nested-updater version survives.**
The spec says: "Add a test that renders under `<StrictMode>` and pins the exact pan after a wheel zoom and after Fit."
The only StrictMode test (`GbcWorldCanvas.test.tsx`, "under <StrictMode>, a wheel zoom lands on the single-application pan") asserts `zoom 38%` and nothing else. The Task 4 bug class doubles the *pan*, not the zoom: a pure zoom updater run twice returns the same zoom. The test's own comment concedes this ("would ... double the pan at the SAME 12 zoom (still 38%, but off screen)").
- Mutation **X1** (wheel: `setView(v => { ...; setView(w => ({...w, pan: w.pan + delta})); return {...v, zoom} })`) **SURVIVES** the committed suite (225/225 green).
- **X2** (the same shape in Fit all) **SURVIVES**.

The current code is correct (single `setView`), so this is a missing regression pin, not a live bug. Reviewer probe P1 (StrictMode, select MapA, wheel at (100,100), assert the outline at `left:-20px; top:40px; width:120px`) kills X1.
**Fix:** extend the StrictMode test to assert the exact pan through the selection outline's `left`/`top`, and add a StrictMode Fit-all case (e.g. pan to a non-fit view first, then assert the outline at the computeFit pan).

**F4 (Minor): the late-onload race is handled correctly but is not pinned.** Mutation **X4** (the `onload` re-inserts its entry: `imageCacheRef.current.set(p.map, entry)`) makes a late day image replace the nite entry. The new-time image is then never drawn, and the old time is held in the cache. X4 **SURVIVES** the committed suite. Probe P2 (fire the day `onload`s after `rerender(time="nite")`, then assert that no stage `drawImage` receives a day image and that no new day `Image` is constructed) passes on HEAD and kills X4. **Fix:** add P2 as a committed test.

**F5 (Important, the most consequential finding): opening World view fetches and decodes 308 of the 391 map renders. The culling does not hold on the first load.**
The mount state is `view = { zoom: 1, pan: {0,0} }`. When `/api/world` resolves, the render that has `world` set still has the zoom-1 view. At zoom 1 (1 px per block), a 1000×667 viewport covers blocks 0..1000 × 0..667, which is nearly the whole 255×746 world. The load effect (`[visible, time]`) runs in the same commit as the initial-fit effect's `setView`, so it uses that stale `visible` and constructs an `Image` for every placement in it. The fit lands one render later.
- **Live, 1280×800, no interaction:** after the fit, the AABB-visible set is **80** placements, but **308** distinct `/api/render/*.png?time=day` requests were issued (`t5rev-live.mjs`, "culling" / "F1 singleClick.initialRenderReqs").
- By the spec's own 153 MB-per-time figure, that is about 120 MB decoded and held in the ref cache on every World mount, exactly what the plan's "current time only / culling" rules exist to prevent.
- The header comment's claim ("the very first render never loads more than what that bounding box's own culling already shows") is false.
- The unit culling test misses it only because its fixture interior sits at x=1000, outside even the zoom-1 200 px viewport. Probe P5 moves the interior to (100,150), which is off-screen after the fit but on-screen at zoom 1, and fails on HEAD: `Interior.png` is requested.

**Fix:** don't cull or load until the initial fit has been applied. For example, add a `fitted` state set together with the fitted view (one `setView` of `{zoom, pan, fitted: true}`, or return `[]` from `visible` while `!fitted`). Or compute the initial view synchronously from `world` + `viewport` before the first loaded render. Pin it with P5 (an interior inside the zoom-1 window but outside the fitted window must get no `Image`).

**F6 (Minor): test gaps beyond F3/F4 (surviving mutations; the current code is correct for each, verified live or by reading):**
- X5 / X6: the LOD draw path and the small-canvas size are untested at component level. Only the pure `shouldUseLod` is pinned, which the spec accepts. Live check: at 7% zoom every stage draw used the `small` buffer with `sw === width*8`; at 100% OlivineCity was drawn from the `<img>` with `naturalWidth 640 = 20×32` and `dw 640` (32 px/block).
- X7: `--danger` is not asserted. jsdom has no custom properties, so both colours fall back to `#ef4444`.
- X12 / X13: nothing pins that a tree click bumps `selectVersion`, or the applied-token guard. Dropping the guard would re-jump on every viewport resize. Both share a root cause with F1: token 0 is "unapplied" on mount.
- X14 (the jump outline's `key={jumpToken}`), X15 (the drag guard on dblclick), X21 (drag direction).
- X17 (hover `w×h` vs `w×w`): every fixture placement is square.

**F7 (Minor, inherited from GBA): re-clicking the same map within 2 s re-jumps correctly, but the fade timer is not re-armed.** Live check: pan away, re-click OlivineCity, and the view returns to the identical rect. `setJumpHighlight(sameName)` bails, so the first click's timer clears the outline early. `WorldCanvas.tsx:696-705` documents the same behaviour, and `key={jumpToken}` restarts the CSS animation. Acceptable as parity; noted only because the brief asked about re-clicks.

**F8 (Minor, noted only): the map hover info is shown in the status strip, not as a floating tooltip.** This matches GBA's `WorldCanvas` (the `.world-canvas__hover` status item) and the reused CSS. The content is right: `Route17 · component #2 (35 maps) · 10×45 blocks`. The plan says "hover tooltip (map name, component)". No change is needed unless the controller wants a literal tooltip.

**F9 (Minor): inaccuracies in the implementer report.**
(a) Its jump narrative reads "zoom 60%" as "fills about 60% of the viewport … exactly". That 60% is relative to native 32 px/block; the actual fill is 0.518 (F2).
(b) Its S7 row says the MAX fallback mutation also turns a pre-existing dungeon test red. With `?? 32` (the natural "default changed to GBC's value" mutation) only the new test fails, and likewise for `?? 1/128` on MIN. The spec's "existing tests must go red" is therefore satisfied only by the new default-pinning assertions, which is adequate but not what the report claims.
(c) The claim that the first render never over-fetches (F5).

## Live verification by the reviewer (`<scratchpad>/t5rev-live.mjs`, shots in `<scratchpad>/t5rev-shots/`)
`/api/world` (live) has 391 placements, 326 components, and multi-map bounds `{0,143,235,135}`, `{0,286,40,18}` and `{0,0,140,135}`, whose union is **{0,0,235,304}**. All 391 placements together are {0,0,255,746}. The 2 conflicts are as the spec states.

| Check | Result |
|---|---|
| Initial fit | Viewport 1000×667 gives expected z=2.194, which shows as **7%**, and the status matches. Hovering the computed centres of Route17, OlivineCity, Route18, NewBarkTown and PalletTown names each correct map, with `component #i (N maps)` and `w×h blocks`. Geometry is blocks×zoom as expected. |
| LOD | At 7%, all 80 stage draws come from `small`, sized `width*8 × height*8`, with `dw = width*z`. At ≥8 px/block they come from the `<img>`. At 100%, the drawn size is 32 px/block. |
| Culling (after the fit) | 80 placements are drawn, which is correct for the AABB. The loads are 308 (F5). |
| Fit all | 3%. Per-frame draw time for 391 draws is **1.0–2.3 ms** (clearRect to last drawImage, 5 pan frames). |
| Tree jump | OlivineCity is re-centred at 19.2 px/block, with a fill of 0.384 W / 0.518 H (F2). A re-click after panning away restores the same rect. |
| Single canvas click (fresh load) | **7% → 28%, jump highlight shown**. This is F1, confirmed live. |
| Double-click | Map view with Route17 selected (`Map` pressed, status `Route17`). |
| Late-onload race | Every `time=day` render was delayed 2.5 s and Nite was clicked immediately. 308 day responses arrived after the switch. **No day image was ever drawn**, and the last frame drew 80 nite images. |
| Overflow at 1280×800 and 1024×768 | Hovering the Route17 badge (the tooltip text matches exactly), hovering the map, and hovering the badge panned to the viewport's right edge all give `scrollWidth === clientWidth`. |
| Implementer screenshots | All 11 opened. They are consistent with the above. `task-5-jump-olivinecity.png` itself shows the F2 under-fill. |

After the run, ports 5173 and 5174 were confirmed FREE with a Node listen probe. Processes were stopped by PID.

## Mutation table
Harness: `node <scratchpad>/t5rev-mutate.mjs [ids…]` (run from the repo root). It applies each mutation to the real source, runs `packages/ui/test/gbc` plus `packages/ui/test/WorldCanvas.test.tsx`, and restores the file from `git show HEAD:<file>`. To run it against the reviewer probes instead, prefix `T5_TESTS=packages/ui/test/gbc/zz-t5rev-probe.test.tsx`, after copying `<scratchpad>/t5rev-probe.test.tsx` there, and delete the copy afterwards. Log: `<scratchpad>/t5rev-mut.log`. `git status --short` was clean after the run.

| id | mutation | committed suite | reviewer probe |
|---|---|---|---|
| S1 | fit uses all components | KILLED (9) | |
| S2 | no cache clear on time change | KILLED (1) | |
| S3 | invert dx/dy | KILLED (5) | |
| S4 | drop culling | KILLED (3) | |
| S5 | LOD threshold 4 | KILLED (3) | |
| S6 | drop blockPx guard | KILLED (1) | |
| S7a / S7b | computeFit default max→32 / min→1/128 | KILLED (1 each; only the new test) | |
| **X1** | wheel: nested setView in updater (StrictMode) | **SURVIVED** | killed by P1 |
| **X2** | Fit all: nested setView in updater (StrictMode) | **SURVIVED** | (needs a Fit-under-StrictMode pin) |
| X3 | wheel ignores cursor pivot | KILLED | |
| **X4** | late onload re-inserts entry into cache | **SURVIVED** | killed by P2 |
| **X5** | LOD buffer never drawn | **SURVIVED** | |
| **X6** | LOD buffer sized at 16 px/block | **SURVIVED** | |
| **X7** | badge colour `--accent` | **SURVIVED** | |
| X8 / X9 | badge top-left / bottom-right | KILLED | |
| X10 | jump fraction 1.0 | KILLED | |
| X11 | GbcApp jumpToken constant 0 | KILLED | |
| **X12** | tree click doesn't bump selectVersion | **SURVIVED** | |
| **X13** | drop applied-token guard | **SURVIVED** | |
| **X14** | jump outline not keyed on token | **SURVIVED** | |
| **X15** | dblclick ignores drag guard | **SURVIVED** | |
| X16 | dblclick doesn't switch to Map | KILLED | |
| **X17** | hover shows `w×w` | **SURVIVED** | |
| X18 | no Fit-all fallback for initial fit | KILLED | |
| X19 | cull far edge halved | KILLED | |
| X20 | time dropped from URL | KILLED | |
| **X21** | drag pans the wrong way | **SURVIVED** | |
| X22–X25 | guard clauses (component, conflicts, family, map) | KILLED | |
| X26 | click on empty space doesn't clear selection | KILLED | |
| X27 | useGbcWorld without guard | KILLED | |

Probes P3 (F1), P4 (F2) and P5 (F5) fail on HEAD. They are bug detectors, not mutation killers.
