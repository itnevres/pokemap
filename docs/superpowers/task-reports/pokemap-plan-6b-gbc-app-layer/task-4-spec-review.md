# Plan 6b Task 4: spec review

Reviewed: commits `83f5125..6b5a5ca` (diff vs `9405e1e`), against `task-4-spec.md`, plan Q2, "Other decisions", Task 4 and success criterion 1. I re-derived everything below rather than taking the implementer's word for it. Scratchpad: `/tmp/claude-0/-home-user/4cae0c11-1686-58ef-8391-8711e19c1398/scratchpad` (`SP` below).

## Verdict

**Not approved yet. Fix round needed.**

The core geometry is right. Quadrant parity matches `GetCoordTile`, the step/block math is correct, out-of-bounds events are handled, and all 8 spec mutations are killed.

Five things block approval:
- **Zoom is broken in the app as it actually runs.** The Vite dev server wraps the app in StrictMode, and there 2× lands off-centre and 4× is blank on every map. The implementer blamed a canvas size limit, which is wrong.
- **Hovering pushes the page sideways**, so it scrolls horizontally.
- **The map payload goes stale or stays stuck on an error.** This comes from the task's own `useGuardedFetch` extension. The implementer's own Route32 "Fit" screenshot shows the effect.
- **Several spec-required behaviours have no test.** 16 of my 24 extra mutations survive.

## Gate

- **`npm test`** (`SP/t4-review.log`): 6 failed, 1488 passed. `grep -E "^ FAIL " | sort -u` is identical to `baseline-fails.txt`.
- **Typecheck:** `npm run typecheck` is clean.
- **Corpus tests:** both corpus tests ran and passed in verbose mode (NewBarkTown step (11,13), CeruleanCave2F's 3 out-of-bounds warps). They show `✓`, not `↓`.
- **Cleanup:** `git status --short` was clean after every harness and probe run. The only new file is this report. Ports 5173 and 5174 are free (Node listen probe), and every server, Vite and preview process has been killed.

## A and B: root causes (the coordinator's two observations)

### A. The page scrolls horizontally on hover. Confirmed live, and GBA has the same latent bug.

Live numbers at 1280×800, hovering with `page.mouse.move` (which never auto-scrolls), script `SP/t4rev-live.mjs`:

| | before hover | after hover |
|---|---|---|
| GBC NewBarkTown, `.map-canvas` width | 740 | **795** |
| GBC, `documentElement.scrollWidth` | 1280 | **1335** |
| GBC, palette `x` | 1020 | **1075** (55 px off-screen) |
| GBA PalletTown, `.map-canvas` width | 740 | **844** |
| GBA, `documentElement.scrollWidth` | 1280 | **1384** |

The GBC case above used a short hover text, `… · TL FLOOR · TR FLOOR · BL FLOOR · BR FLOOR`. The implementer's "Playwright auto-scroll artifact" explanation is wrong: the overflow is real, and the scroll is only its symptom.

**Cause:**
- `.map-canvas` is a flex item in the row `.app__map-editing-body`. It has `flex: 1 1 auto` and the default `min-width: auto`.
- For a flex item, `min-width: auto` resolves to its min-content width. That width includes the `white-space: nowrap` status line: `.map-canvas__status-item` plus `.map-canvas__hover`, neither of which can shrink.
- The `overflow: hidden` on `.map-canvas__status` does not help. The status bar is not the row flex item whose minimum is being resolved. In its own column container, its `min-width: auto` applies to height, not width.
- So `.map-canvas` grows to fit the hover text and pushes the palette (or GBA's `EventInspector`) past the viewport. `.app__canvas`'s explicit `min-width: 480px` does not clip its overflowing children.

**Checked:** injecting `.app__map-editing-body > .map-canvas { min-width: 0 }` live brings `scrollWidth` back to 1280 and the palette back to `x` 1020, with the canvas still `flex: 1`. But the hover span (at `x` 599, width 464) then ends at 1063, so its last ~43 px are clipped. On NewBarkTown's warp step, that clipped part is exactly the `· warp #3 → ELMS_HOUSE` suffix the spec asks the strip to show.

**Proposed GBC fix** (additive, GBC-scoped, no GBA files touched):

```tsx
<section className="map-canvas gbc-map-canvas" …>
```

```css
/* the actual fix: let the canvas column shrink below its nowrap status text */
.gbc-map-canvas { min-width: 0; }
/* fixed two-line strip, so the hover text never has to be clipped and hovering never changes the viewport height (no resize/re-blit jitter) */
.gbc-map-canvas .map-canvas__status { height: 44px; flex-wrap: wrap; align-content: center; row-gap: 2px; }
.gbc-map-canvas .map-canvas__hover { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
```

Also see finding 7 for shortening the text. Don't use a status height that grows on hover. That resizes the viewport under the cursor, which fires the ResizeObserver and a re-blit, and can oscillate near the bottom edge.

**GBA follow-up:** GBA has the same bug, reproduced live (`scrollWidth` 1384). Log it as a separate follow-up: `min-width: 0` on the shared `.map-canvas` rule fixes both families. Don't do it in this task.

### B. 4× is blank, and 2× lands off-centre. The cause is StrictMode, not a canvas size limit.

**Cause:** `applyZoom` calls `setPan(...)` inside the `setZoom` updater (`GbcMapCanvas.tsx`, `applyZoom`, copied verbatim from `MapCanvas.tsx:532-542`):
- `main.tsx` renders `<StrictMode>`.
- React double-invokes state updater functions in StrictMode dev builds.
- So the nested `setPan` is queued twice, and the pan transform is applied twice.

**Proof** (stage `drawImage` arguments captured with an init-script hook, viewport 740×691, button pivot (370, 345.5)):

| run | 1×→2× pan: single (expected) / actual | Fit→4× dest rect (actual) |
|---|---|---|
| GBC NewBarkTown, dev | (−14, −6) / **(−398, −355)** = the transform applied twice | **(−2702, −2455, 1536, 1408)**: entirely off-canvas, so blank on a *small* map too |
| GBC Route32, dev | – | (−2702, **−11676**, 1536, 6016): blank |
| GBA PalletTown, dev | (−78, −59) / **(−526, −443)** | (−3214, −2747, 1792, 1536): blank |
| GBA PalletTown / KantoRoute23, **production build** (`vite build --minify false` + `vite preview`, so no StrictMode double-invoke) | **(−78, −59) / (−78, −59)** | KantoRoute23 (−526, −4923, 1792, **10496**): **renders correctly**. Screenshot: `SP/t4rev-shots/gba-B-KantoRoute23-4x.png` |

**Control:** this headless Chromium draws a 384×1504 source into a 1536×6016 destination rect fine (it returns a red pixel), so there is no size ceiling.

The GBA reproduction the implementer reported is real, but the diagnosis ("SwiftShader texture ceiling, not expected on a real GPU") is wrong. It hits every user of `launch.sh` / `.claude/launch.json`, which run the Vite dev server, in both families, on any map size. It also means success-criterion step 8 ("check Fit and the zoom buttons") was not met. jsdom tests render without StrictMode, which is why no test catches it.

**Fix GBC now.** Make the updater pure, with one combined state:

```ts
const [view, setView] = useState<{ zoom: Zoom; pan: { x: number; y: number } }>({ zoom: 1, pan: { x: 0, y: 0 } });
const applyZoom = (next: Zoom, px: number, py: number) =>
  setView((v) => {
    if (v.zoom === next) return v;
    const cx = (px - v.pan.x) / v.zoom, cy = (py - v.pan.y) / v.zoom;
    return { zoom: next, pan: { x: Math.round(px - cx * next), y: Math.round(py - cy * next) } };
  });
```

Pan-only updates become `setView(v => ({ ...v, pan }))`. `fit` sets both.

Add a regression test that renders `<StrictMode><GbcMapCanvas …/></StrictMode>`, clicks 2× from Fit, and pins the exact pan `pivot − (pivot − pan0)·2` from `lastDraw().slice(4,6)`. This is not "drift" from GBA in the sense the plan's risk register warns about: it fixes a bug the copy inherited.

**GBA follow-up:** report a separate follow-up for `MapCanvas.tsx:532-542` (the same fix and the same StrictMode test). No other component nests state updates like this: `grep "setZoom(("` matches only `MapCanvas`.

**Side note (pre-existing, not Task 4):** `vite build` with the default minify fails. lightningcss chokes on a `*/` inside a CSS comment near `styles.css:1296` (`world-canvas__spotlight-*/world-canvas__lens-tint`). Worth its own one-line follow-up.

## Findings

### Important

**1. Zoom is broken under StrictMode, and the implementer's diagnosis was wrong** (section B).
- **Evidence:** the table above.
- **Fix:** the pure combined `view` updater, plus a StrictMode regression test. File the GBA follow-up.

**2. Hover overflow scrolls the whole page** (section A).
- **Evidence:** the table above. The implementer's own `task-4-newbarktown-hover-*.png` shows the sidebar and palette cut off.
- **Fix:** `.gbc-map-canvas { min-width: 0 }`, plus a fixed two-line status bar with an ellipsised hover span. File the GBA follow-up.

**3. `useGuardedFetch`'s new changing-URL use leaves a stuck error and a stale payload.**

Task 3's hook was built for a fixed URL. When the URL changes it never resets `error` or `data`. Temporary jsdom probe (`SP/t4rev-probe.test.tsx`, copied into the repo only while it ran, then deleted):
- **Stuck error.** Open a map whose `/api/map` fails, then open a good map. The canvas area reads `Could not load Good: GET /api/map/Bad -> 500` permanently: `map.error` is checked first and is never cleared.
- **Stale payload.** Open Good, then open a map whose payload is still loading. The UI renders `img /api/render/Slow.png`, the status bar reads `tileset TS_Good · … 3×1`, the banner shows **Good's defects under Slow's name**, and the palette requests `/api/metatile/Slow/*` using Good's `metatileCount`.

The live effects are real:
- **Wrong Fit.** NewBarkTown → CeruleanCave2F fits with NewBarkTown's dimensions: pan (178, 170). A fresh open fits correctly at (194, 24). `fittedForMapRef` then stops any re-fit.
- **The implementer's own Route32 Fit screenshot shows this.** Its pan is exactly (194, 24), CeruleanCave2F's fit. It shows the *top* of Route32 (the Ruins of Alph gate building), not a vertically centred view as the report says.
- **64 × 404s.** NewBarkTown → CeruleanCave2F requests `/api/metatile/CeruleanCave2F/64..127.png`, from the stale count of 128. Script: `SP/t4rev-404.mjs`.

GBA's `useMapLayout` at least resets `error` on a name change, so the stuck error is new in this task.

**Fix:**
- In `useGuardedFetch`'s effect, call `setData(null); setError(null);` before every fetch, not only when `url === null`. For Task 3's fixed-URL hooks this is a no-op on mount.
- In `GbcApp`, treat the payload as ready only when `map.data && map.data.map.name === selected`, and show "Loading …" otherwise.
- Add tests for both scenarios: fail → good clears the error, and while A → B is pending, A's banner and dimensions are not shown.

**4. Missing tests for the geometry the spec and plan require, so the origin and colour mutations survive** (X1–X6).
- Every `drawGbcCollision` and `drawGbcEvents` test uses origin 0 and a 1×1-block map. Dropping the 32-px origin, using 16-px blocks, transposing the block index, or tinting water with the wall colour all pass.
- The plan requires "geometry/origin math for a known payload". The spec requires the 1-block ring with origin 32, and wall = `--overlay-collision` vs water = `--encounter-water`.
- **Fix:** add a 2×2-block test at origin (32, 32) with a distinct metatile per block. Pin the tinted pixel positions (for example block (1,0)'s BL quadrant at (64..79, 48..63)) and assert that the blended **RGB** of a water pixel is not the wall colour. Pin that `drawGbcGrid` draws nothing at `x = origin + 16`, which kills X6.

**5. The status-bar tests can't tell the four quadrants apart** (X8–X12).
- The UI fixture's hovered block has all 4 quadrants = `COLL_WALL`. Marking the wrong quadrant (never BR), showing BL's data under the TR label, dropping `+talk`, adding ` land` to land quadrants, or dropping the hex fallback for a `null` name all pass.
- The spec lists "the hovered-quadrant marking" and these formatting rules explicitly.
- **Fix:** give the UI fixture a block with 4 distinct values (wall, land with `talk`, water, `null` name). Hover each parity and assert the full strip text, and that `<strong>` is exactly the hovered quadrant.

**6. The Task 21 blank-canvas bug (`viewport` in the blit deps) has no regression test** (X14 survives).
- The GBC test copied `FakeResizeObserver` without the `fire()` hook or the test from `MapCanvas.test.tsx:317-360`.
- **Fix:** port that test: shrink the viewport, fire the observer, and assert a fresh `drawImage`.

### Minor

**7. The hover text repeats itself: `TL WALL wall`.**
- It follows the spec's rule literally ("add the category when it isn't land"). But the spec's own example reads `TL WALL · TR FLOOR`, so the rule and the example disagree. For NewBarkTown's tileset the suffix is informative only where the name doesn't already say it: `BUOY wall`, `CUT_TREE wall`, `HEADBUTT_TREE wall`, `WHIRLPOOL water`.
- **Fix:** drop the category when `shortName.toLowerCase() === category`, and bracket it otherwise (`TL BUOY (wall)`, `TL CUT_TREE (wall, talk)`). This also helps finding 2's width problem.

**8. An id-0 block's collision is not what the engine does.**
- `GetCoordTile` returns `-1` ($FF) for block id 0 (`home/map.asm:1717-1719,1744-1746`; plan "Other decisions": "$FF (wall)"). `gbcStepInfo` and `drawGbcCollision` use `collision[0]` instead. For Johto that is `COLL_01` land, but the engine treats the step as $FF.
- The corpus has no id-0 map blocks, so nothing renders wrong today. But the spec's "the code path must be honest" applies to this one too.
- **Fix:** when `metatileId === 0`, report the quadrants as value `0xff` (the `collisionInfo` lookup) and tint them the same way, or at minimum say "(engine: $FF)" in the note.

**9. `GbcApp`'s hover → palette wiring is untested** (X13 and X17 survive: `highlightId={null}`; no reset on a map switch).
- **Fix:** add one `GbcApp` test that mouse-moves over the canvas (with a mocked rect) and asserts the palette cell's `aria-current`.

**10. The `clientToStep` "pan and zoom" test passes by coincidence** (X23: ignoring pan gives the same `(-1, -2)`, a Plan 0 §7 case).
- **Fix:** use a pan large enough to cross a step boundary, for example pan (40, 40) at zoom 2 with client (136, 136) → step (1, 1). Without pan that gives step (2, 2).

**11. Unpinned mechanics.**
- `passive: false` (X15). Assert `defaultPrevented` on a dispatched cancelable `WheelEvent`.
- Pristine recomposite (X20). Toggle Collision on then off and assert the base is redrawn from the `<img>` (`drawImage(img, 0, 0)` on the base context) before any `putImageData`.
- These are cheap to add, and they are postmortem items the spec lists.

**12. Guard and parse edges.**
- `isGbcMapPayload` doesn't check `collisionInfo` is a record or `tileset.constName` is a string, and the canvas dereferences both unconditionally. That meets the spec's clause list, but a record check is one line each.
- `parseColorToken` returns transparent for `#rgb` and `#rrggbbaa`, which is a silent no-tint if a token is ever written that way. Consider accepting 8-digit hex.

**13. Accessibility.** An `aria-label` on a role-less `div` (a palette cell) is not reliably announced. Give the cell `role="img"` and keep the label, or move the label to the `<img alt>`.

### Implementer deviations: all acceptable
- **`0x` vs `$`:** the spec itself mixed the two. Acceptable.
- **Fixed alpha 140 on hex tokens:** a reasonable judgement call, and documented. Acceptable.
- **Reusing `app__map-editing(-body)`:** the spec explicitly allowed it. Acceptable.
- **`constName` in the palette header:** consistent with the status bar. Acceptable.
- **Not reusing GBA `drawGrid`:** justified. GBA's version spans the whole raster, including the ring. Acceptable.
- **`useGuardedFetch` null-URL extension:** the right place for it, and Task 3's hook tests are unchanged and green. It is incomplete, though: see finding 3.

### Verified correct (re-derived)
- **Quadrant parity.**
  - `GetCoordTile` passes `d`/`e` = event coords + 4 (`CheckFacingBGEvent` subtracts 4), and 4 is even, so parity is unchanged.
  - `rr d` adds +1 when x is odd, and `rr e` adds +2 when y is odd. So index = `(sx&1) + 2(sy&1)` → TL/TR/BL/BR.
  - `gbcStepInfo` and `QUADRANT_OFFSET` agree with this.
- **Geometry.** Block = (`sx>>1`, `sy>>1`); the step grid is `2w×2h`; the render is `(w+2)·32` wide with origin 32; `clientToStep` subtracts the origin.
- **NewBarkTown step (11,13)** → block (5,6), `br`, metatile 20, warp #3 → `ELMS_HOUSE`. It runs against the real corpus.
- **Out-of-bounds events.** They are filtered in the one shared `collectGbcEventMarks`, so they are never drawn and never returned by hover. CeruleanCave2F: 6 warps, 3 drawn, and the banner lists 4 defects.
- **Collision tint.** Wall and water only; land is byte-identical to the base.
- **Postmortem patterns present in code:**
  - `viewport` in the blit deps;
  - `imgLoaded` reset per URL (X16 is killed);
  - fit once per `mapName` (S5 is killed);
  - a native wheel listener with `passive: false`;
  - a pristine base recomposite.
- **Palette.** `aria-current`; scrolling only on a highlight change (S7 is killed); lazy images; exact encoded URLs.
- **Banner and states.** The banner is non-dismissible, `role="alert"`, and shown only when there are defects. Loading and error states match `App.tsx:495-499`.

## Mutation table

Re-run all of them: `cd /home/user/pokemap && node SP/mutate.mjs`. For a subset, pass ids: `node SP/mutate.mjs X1 X14`.

The harness applies one exact-string mutation at a time and runs the core overlays test, `packages/ui/test/gbc` and `useGuardedFetch.test.ts` in verbose mode. It restores each file from `git show HEAD:<path>` and prints `git status --short` at the end (clean). The full table is in `SP/mutations.md`.

| id | mutation | result |
|---|---|---|
| S1 | parity `2*(sx&1)+(sy&1)` | killed |
| S2 | draw out-of-bounds events | killed |
| S3 | tint land | killed |
| S4 | drop `time` from the URL | killed |
| S5 | re-fit on time change | killed |
| S6a/b | drop `rendersAsBorder` (UI / core) | killed / killed |
| S7 | palette scrolls on every render | killed |
| S8 | drop the `blocks.length` clause | killed |
| X1 | collision ignores origin | **survived** |
| X2 | collision 16-px blocks | **survived** |
| X3 | water tinted with the wall colour | **survived** |
| X4 | collision block index transposed | **survived** |
| X5 | events ignore origin | **survived** |
| X6 | grid every 16 px | **survived** |
| X7 | hover events match `sx` only | killed (corpus test) |
| X8 | BR never marked `<strong>` | **survived** |
| X9 | TR label shows BL's data | **survived** |
| X10 | drop `+talk` | **survived** |
| X11 | ` land` suffix shown | **survived** |
| X12 | `null` name → empty instead of hex | **survived** |
| X13 | palette highlight not wired in `GbcApp` | **survived** |
| X14 | `viewport` dropped from the blit deps | **survived** |
| X15 | wheel `passive: true` | **survived** |
| X16 | no `imgLoaded` reset per URL | killed |
| X17 | highlight not reset on map switch | **survived** |
| X18 | banner always rendered | killed |
| X20 | base not recomposited from the pristine image on toggle | **survived** |
| X21 | drop the `defects` guard clause | killed |
| X22 | drop `not writable` | killed |
| X23 | `clientToStep` ignores pan | **survived** (coincidental test values) |

Survivors map to findings 4 (X1–X6), 5 (X8–X12), 6 (X14), 9 (X13, X17), 10 (X23) and 11 (X15, X20).

## Live-check artifacts (scratchpad, not the repo)

- **Scripts:**
  - `SP/t4rev-live.mjs` (`gbc` | `gba`), which runs the A, B and C probes;
  - `SP/t4rev-live-prod.mjs`, the same probes against `vite preview` on port 5175;
  - `SP/t4rev-404.mjs`;
  - `SP/t4rev-probe.test.tsx`;
  - `SP/t4rev-ports.mjs`.
- **Screenshots:** in `SP/t4rev-shots/`.
