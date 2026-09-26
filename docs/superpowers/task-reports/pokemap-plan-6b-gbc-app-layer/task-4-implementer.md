# Plan 6b Task 4: implementer report

Executed against `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/task-4-spec.md`, on branch `plan-6b-gbc-app-layer`, working directly in the repo (no worktree). Read the plan (`docs/superpowers/plans/2026-09-25-pokemap-plan-6b-gbc-app-layer.md`, Q2/Q3, the "two grids"/out-of-map-event/collision-display decisions, and the Task 4 row), `_archive/task-1b-implementer.md` (the `/api/map`/`/api/render`/`/api/metatile` contracts and `buildGbcMapPayload`), `_archive/task-3-implementer.md` including its fix round 1 (the shell, `useGuardedFetch`, `guards.ts`, hook placement), `packages/ui/DESIGN.md`, RESUME's UI lessons, and Plan 0 §7 before writing any code. Read `packages/ui/src/components/MapCanvas.tsx` in full, along with `core/render/overlays.ts`, `core/render/raster.ts`, the GBC `wire.ts`/`model/types.ts`, `gbcRoutes.ts`, and the existing `packages/ui/src/gbc/*` tree.

## What was built

### 1. `packages/core/src/gbc/render/overlays.ts` (new)

Mirrors `core/render/overlays.ts` but is NOT a literal reuse of `drawGrid`/`drawCollision`/`drawEvents` -- those are typed against GBA's `LayoutRaster`/`Block`, which fold `originX`/`originY`/`blockWidth`/`blockHeight` into the raster object and carry per-block collision/elevation fields this format has no bits for. Every function here takes a plain `Raster` plus explicit `originX`/`originY`, reading collision/event data off a `GbcMapPayload`-shaped object (or `GbcMapEvents` directly for `drawGbcEvents`):

- **`drawGbcGrid(r, originX, originY, wBlocks, hBlocks)`** -- 32px block-boundary lines over the map area only (never the border ring), same boundary convention as GBA's `drawGrid` (`x < extent`, so no line at the far edge).
- **`drawGbcCollision(r, originX, originY, payload, colors)`** -- one 16x16 `blendRect` per quadrant whose category is `wall`/`water`; `land` quadrants are never touched (Plan 0 §7's "byte-identical to the base" lesson).
- **`drawGbcEvents(r, originX, originY, events, stepW, stepH, colors)`** -- returns `GbcEventMark[]` for in-bounds events only, drawn object/warp/coord/bg order (mirrors GBA's `drawEvents`). An out-of-bounds event (G4's 7 real cases) is skipped entirely, never clamped.
- **`gbcStepInfo(payload, sx, sy)`** -- a pure hover resolver, `null` outside the `2w x 2h` step grid, otherwise `{ bx, by, sx, sy, metatileId, rendersAsBorder, border, quadrant, quadrants, events }`. The quadrant index is `(sx&1) + 2*(sy&1)` (`GetCoordTile`, findings §3.3) -- **not** `2*(sx&1) + (sy&1)`, the mutation the spec names explicitly. Independent of any overlay toggle: it reads the payload directly, so the status strip always shows real data on hover regardless of which overlays are on.

Both `collectGbcEventMarks` (shared by `drawGbcEvents` and `gbcStepInfo`, so the in-bounds filter and the label text exist in exactly one place) and the quadrant-offset table are internal.

**Tests** (`packages/core/test/gbc/render/overlays.test.ts`, 13 tests): a synthetic 1-block fixture with a distinct raw `COLL_*` value in every quadrant (tl=wall, tr=land, bl=water, br=a *second*, distinct wall value) so a tl/br mixup is visible via `value` and a tr/bl mixup (the named parity-swap mutation) is visible via both `value` and `category`; a grid test proving the border ring is never touched; a no-collision-cell-byte-identical test; a real-corpus test building the exact `buildGbcMapPayload` shape by hand (core cannot import `@pokemap/server`) for **NewBarkTown**, pinning step `(11,13)` -> block `(5,6)`, quadrant `br`, metatile `20`, warp index `3` -> `ELMS_HOUSE`; and a **CeruleanCave2F** test proving `drawGbcEvents` excludes its 3 out-of-bounds warps (6 real `warp_event`s, 3 drawable), independently re-measured against the real corpus (see "Re-measured facts" below).

### 2. UI guard and hook

- **`isGbcMapPayload`** added to `packages/ui/src/gbc/guards.ts`: `family === "gbc"`; `map.name` a string; `layout.width`/`height` positive integers; `blocks.length === width*height`; `collision.length === metatileCount`; `events` has four positioned arrays; `defects` is an array. Every clause independently mutation-tested (see table).
- **`useGbcMap(name)`**, `packages/ui/src/gbc/hooks/useGbcMap.ts`: follows `useMapLayout`'s "null name -> idle, no fetch" shape, built on the shared `useGuardedFetch`. This required extending `useGuardedFetch` itself to accept `url: string | null` (a null url now resets to `{data:null,error:null}` with no fetch) -- the Task 3 convention says every fetch goes through this hook, so the null-name capability was added there rather than `useGbcMap` hand-rolling a parallel fetch/guard/error block. `label` became optional (`label ?? url ?? ""`), preserving every existing call site's behaviour exactly (confirmed: all of Task 3's `useProjectInfo`/`useGbcGroups` tests, plus the original `useGuardedFetch.test.ts` suite, are unchanged and green).

### 3. `packages/ui/src/gbc/GbcMapCanvas.tsx` (new)

Follows `MapCanvas.tsx`'s documented mechanics, cited by line in the header comment:
- `imageUrl = /api/render/${enc(mapName)}.png?border=1&time=${time}`; a pristine base canvas recomposited via `ImageData` + the core overlay functions; a separate stage canvas blits for pan/zoom.
- `viewport` stays in the blit effect's dependency list (`MapCanvas.tsx:472-485`, the Task 21 blanking postmortem).
- `imgLoaded` resets on every URL change -- since `time` is folded into the URL, a time switch goes through the same real false->true cycle a map switch does.
- Fit runs once per `mapName` only (`fittedForMapRef`), never on a `time` change.
- A native `wheel` listener, `{ passive: false }`.
- Zoom levels 1x/2x/4x + Fit; `.map-canvas__stage`'s existing `image-rendering: pixelated`.
- Toggles: Grid, Collision, Events (no Elevation -- GBC has no per-block elevation). The legend row reuses `map-canvas__legend`; Collision shows **two** items, Wall (`--overlay-collision`) and Water (new `--encounter-water` swatch).
- Overlay colours are read from CSS custom properties at composite time (`getComputedStyle`, dark-mode literal fallback, `MapCanvas.tsx:521`'s pattern) via an exported `parseColorToken(value): RGBA`, parsing both `rgba()` and 6-digit hex. A hex-only token (`--encounter-water`, `--event-*`) has no alpha of its own, so it gets a fixed `140` (~0.55, matching `--overlay-collision`'s own opacity) -- documented as a judgement call in Deviations below.
- Status strip: always `tileset <constName> · <metatileCount> metatiles · <w>×<h>`, `· not writable` when applicable. On hover: `(bx,by) step (sx,sy) id 0x.. [(renders as border 0x..)] · TL <name> [<category>][+talk] · TR ... · BL ... · BR ...` with the hovered quadrant in `<strong>`, then every event at that step appended as `· <kind> #<index> <label>`. `hoveredMetatile(id|null)` fires on every hover and on leave.
- `clientToStep` (client coords -> 16px step) is exported and tested directly, as the spec asks.

**Tests** (`packages/ui/test/gbc/GbcMapCanvas.test.tsx`, 21 tests, same canvas-2d-context/`ResizeObserver` stub harness as `MapCanvas.test.tsx`): the image URL pinned exactly for `time=day` then `time=nite`; zoom/pan/wheel/drag math; Fit after zoom+pan; a **does-not-refit-on-time-change** test (zoom/pan survive a time switch); the Collision legend showing both Wall and Water; hovering an all-wall block (id, all 4 quadrants, hovered one in `<strong>`); hovering the fixture's warp step (event suffix); `not writable`; `hoveredMetatile` called with the id and with `null` on leave; and the `rendersAsBorder` note for a synthetic id-0 block (the real corpus has none, per Task 1a/1b's own finding, re-confirmed unrelated to this task's own inspection below).

### 4. `packages/ui/src/gbc/GbcMetatilePalette.tsx` (new)

A read-only grid of `metatileCount` cells (`/api/metatile/:map/:id.png?time=`, 32px, `loading="lazy"`), each `aria-label="metatile 0x.."`. The cell matching `highlightId` gets `aria-current="true"` and `--bg-selected`/`--border-strong` styling, scrolled into view (`block:"nearest"`) via an effect whose dependency array is `[highlightId]` alone -- React's own effect semantics (not a manual "did it really change" guard) are what make `scrollIntoView` fire once per real highlight change, never per render. Header: `<constName> · <count> metatiles`. Placed as a right-side panel reusing `app__map-editing-body`'s layout (pure flex-row CSS, no editing semantics, safe to reuse directly), with the canvas keeping `flex: 1`.

**Tests** (`packages/ui/test/gbc/GbcMetatilePalette.test.tsx`, 9 tests): exact cell count and one pinned thumbnail `src` (encoded map name too); the aria-label; the header text; `aria-current` moving with `highlightId`; `scrollIntoView` called once per highlight change (a same-value re-render, e.g. an unrelated time-of-day toggle, must not re-scroll); a dedicated "no cell is `aria-current` when `highlightId` is `null`" case.

### 5. Defect banner and `GbcApp` wiring

`GbcApp`'s map view is now: banner, then `[GbcMapCanvas | GbcMetatilePalette]` inside `app__map-editing`/`app__map-editing-body` (reused directly). The banner (`role="alert"`, `app__event-op-error`'s look, a new `.gbc-app__defects-list` for the bullet list) lists every `defects[i].message`, shown only when `defects.length > 0`, with **no dismiss button** -- this is data truth (G4), not a one-shot notice. Loading/error states mirror `App.tsx:495-499` exactly (`!selected` -> "Select a map"; `map.error` -> "Could not load {selected}: {error}"; `map.data` -> the real view; else -> "Loading {selected}…"). `time` flows straight into `GbcMapCanvas`'s `time` prop and `GbcMetatilePalette`'s `time` prop; `hoveredMetatile` (owned by `GbcApp`) drives the palette's `highlightId`, reset to `null` on every real map switch.

**Tests**: `GbcApp.test.tsx` grew from 10 to 15 (5 new): the banner appears for a payload with defects and is absent without them; the real canvas mounts once `/api/map/:name` resolves (status strip text, not the old placeholder); a loading placeholder between selection and payload resolution; a canvas-placeholder error on a failed fetch; and the metatile palette mounting alongside the canvas.

### `styles.css`

Additive only: `.map-canvas__swatch--water` (`--encounter-water`), `.gbc-metatile-palette*` (a fixed-260px side panel mirroring `.event-inspector`'s own shape -- read-only, vertical, unlike GBA's horizontal drag-select strip), and `.gbc-app__defects-list` (bullet-list reset for the banner).

## Commit SHAs

- `83f5125` -- `feat(core,ui): GBC overlays core module, isGbcMapPayload guard, useGbcMap`
- `2e016ad` -- `feat(ui): read-only GbcMapCanvas (Plan 6b Task 4, part 2)`
- `d603a50` -- `feat(ui): read-only GbcMetatilePalette + water/defect-list styles`
- `6b5a5ca` -- `feat(ui): wire GbcMapCanvas/GbcMetatilePalette and the defect banner into GbcApp`

`git diff --stat` against `HEAD` before this task, restricted to `packages/ui/src/App.tsx packages/ui/src/components packages/ui/test/App.test.tsx packages/ui/test/MapCanvas.test.tsx`, is empty throughout -- confirmed again just before writing this report. No GBA file was touched.

## Re-measured facts (per the spec's own instruction)

- **NewBarkTown**: `map_const NEW_BARK_TOWN, 10, 9` (width, height in blocks); `warp_event 11, 13, ELMS_HOUSE, 1` is warp index **3** (0-based, after `ELMS_LAB`/`PLAYERS_HOUSE_1F`/`PLAYERS_NEIGHBORS_HOUSE`). Step `(11,13)` -> block `(5,6)`, quadrant index `(11&1)+2*(13&1)=1+2=3` -> `br`. The real block's metatile id is **20** (`0x14`), collision `{tl:7,tr:7,bl:7,br:113}` -> `COLL_WALL`/`COLL_WALL`/`COLL_WALL`/`COLL_DOOR` (land) -- all independently re-derived via a one-off `openGbcProject` script against the live corpus, not copied from the plan's prose.
- **CeruleanCave2F**: `map_const CERULEAN_CAVE_2F, 9, 15`. Step grid `18x30`. Of 6 real `warp_event`s, exactly 3 are out of bounds: index 0 `(23,7)` (x), index 1 `(29,1)` (x), index 3 `(19,7)` (x) -- indices 2, 4, 5 are in-bounds. Matches the plan's "3 of them" and Task 1b's own pinned defect count.

## Test counts

- Before this task (Task 3 fix round 1's final state): **1424 passed**, the same 6 known baseline failures.
- After: **1488 passed**, same 6 known failures. Net **+64**: `overlays.test.ts` (13, new file), `guards.test.ts` (+9, 15->24), `useGbcMap.test.ts` (5, new file), `GbcMapCanvas.test.tsx` (21, new file), `GbcMetatilePalette.test.tsx` (9, new file), `GbcApp.test.tsx` (+5, 10->15), `useGuardedFetch.test.ts` (+2, 8->10).
- `1424 + 64 = 1488`. ✓

## Gate result

```
npm test 2>&1 | tee /tmp/.../t4-test.log
grep -E "^ FAIL " t4-test.log | sort -u | diff - baseline-fails.txt
```
`diff` is empty -- exactly the same 6 pre-existing failures:
```
 FAIL  packages/core/test/config/engine.test.ts > engineProfile > parses pokefirered's real porymap.project.cfg
 FAIL  packages/core/test/config/engine.test.ts > engineProfile > parses the subject repo's real porymap.project.cfg
 FAIL  packages/core/test/load/blocks.test.ts > parseBlocks > encodeBlocks is the exact inverse of parseBlocks, every layout, both files
 FAIL  packages/core/test/load/blocks.test.ts > parseBlocks > the three fields are independent -- a wrong shift moves them together
 FAIL  packages/core/test/render/layout.test.ts > renderLayout > supportsLayoutVersion survives a Porymap save that deletes layout_version keys
 FAIL  packages/server/test/world.test.ts > world api > manual is true iff the map name is a key in sidecar.manualPlacements, for every placement (Feature A)
```
`Tests 6 failed | 1488 passed (1494)`. One full run mid-session showed a transient 7th failure with no corresponding new `FAIL` line in the log (consistent with a one-off flake, not a real regression); two immediate reruns both landed back at exactly 6 failed / 1488 passed, and the final gate run above (used for this report) matches the baseline exactly.

`npm run typecheck` (`tsc --noEmit` on both `tsconfig.base.json` and `packages/ui/tsconfig.json`): clean, no output.

## Mutation table

Every mutation was applied to the real source, confirmed red, then restored from a saved golden copy; `diff <file> <golden>` was empty after every restore, and `git status --porcelain` showed no source changes once each mutation round finished.

| # | Mutation | File | Verdict | Killed by |
|---|---|---|---|---|
| 1 | Swap the quadrant parity: `2*(sx&1) + (sy&1)` | `overlays.ts` | KILLED | "pins the quadrant mapping for all four parities" (1 test) |
| 2 | Draw out-of-bounds events (drop the `inStepBounds` guard in `collectGbcEventMarks`) | `overlays.ts` | KILLED | "draws only in-bounds events..." + the CeruleanCave2F 3-OOB-warps test (2 tests) |
| 3 | Tint land quadrants (drop `if (category === "land") continue;`) | `overlays.ts` | KILLED | the no-collision-cell-byte-identical test + the "tinting land would blend tr" test + the wall-quadrant-exactness test (3 tests) |
| 4 | Drop `time` from the image URL | `GbcMapCanvas.tsx` | KILLED | the exact-URL test + its own dedicated mutation-check test + the does-not-refit test (3 tests) |
| 5 | Re-fit on time change (drop the `fittedForMapRef.current !== mapName` guard) | `GbcMapCanvas.tsx` | KILLED | "does not re-fit when only time changes" |
| 6 | Drop `rendersAsBorder`'s status-strip note | `GbcMapCanvas.tsx` | KILLED | "renders as border note: metatile id 0..." |
| 7 | Make the palette scroll on every render (drop the effect's dependency array) | `GbcMetatilePalette.tsx` | KILLED | the scroll-once-per-change test + its own dedicated "scrolling on every render" test (2 tests) |
| 8 | Drop the `blocks.length === width*height` guard clause | `guards.ts` | KILLED | "rejects blocks.length !== width\*height" |

All 8 named mutations killed; 0 survive. (`guards.ts`'s other clauses -- `family`, `map.name`, `layout.width`/`height` positivity, `collision.length`, the four event arrays, `defects` -- were each independently mutation-tested too, all killed; see the guard test file's own comments. One test needed strengthening mid-pass: the first "positive/integer" test used `width=0/-1/1.5`, all of which happen to make `blocks.length !== width*height` fail too, so a mutation that widened the check to plain `typeof === "number"` survived that test by accident (Plan 0 §7's "a test doesn't discriminate the path it claims to" lesson) -- fixed by adding `width=-4,height=-1` and `width=8,height=0.5` cases whose product coincidentally still equals `blocks.length`, isolating the positivity/integer check from the downstream length comparison. Re-ran: killed.)

## Live-verify narrative (required; plan success criterion 1)

Confirmed ports 5173/5174 free (Node `net.createServer().listen()` probe) before starting. Started `npx tsx packages/server/src/serve.ts --gbc` (`/root/pokemap-corpus/pokecrystal-PerfPlus`) and `npm run dev --workspace=@pokemap/ui` in the background, then drove a real Chromium via Playwright (`import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs"`, viewport 1280x800) from a script in the scratchpad. Screenshots at `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/screens/task-4-*.png`. **I opened and looked at every one of the following, not just generated them:**

1. **`task-4-newbarktown-day.png`** -- NewBarkTown opens at Fit (1x pressed). The header shows `PokeMap`/`Crystal`, `Map` pressed in the View group, `Day` pressed in Time-of-day, and `NewBarkTown` in the status span. The sidebar's `NEW_BARK` group (1 map) is expanded with `NewBarkTown` selected. The canvas renders the real daytime palette: bright green grass/trees, three buildings (Elm's Lab top-left, the player's house and Elm's house to its right), a PC-like object in the plaza, a flower patch, and the water tile (blue rectangle) on the right edge, all inside the 1-block tree border ring. The status strip reads `tileset TILESET_JOHTO · 128 metatiles · 10×9`, `Hover the map…`. The right panel shows `TILESET_JOHTO · 128 metatiles` and a 32px thumbnail grid matching the rendered tile art.
2. **`task-4-newbarktown-nite.png`** -- after clicking `Nite`: `Nite` is now pressed, and the palette shifts to a dark blue/purple night tint -- the same building outlines, but windows now show lit yellow squares that weren't visible in the day version, and the grass/trees read as deep teal/navy. Confirmed programmatically too: the canvas's own screenshot bytes at Day vs Nite are unequal (18715 vs 18473 bytes).
3. **`task-4-newbarktown-overlays.png`** -- Collision and Events both toggled on (both buttons pressed, blue background). The legend row shows all 6 items: Wall (red), Water (cyan), Object (green), Warp (yellow), Coord (magenta), Bg (blue). The map shows: red tint over every wall tile (house walls, the tree border), cyan tint over the water tile, and small coloured squares over the NPC/warp/sign positions -- exactly the object/warp/coord/bg markers, all visibly distinct hues, on top of the nite palette.
4. **`task-4-newbarktown-hover-building.png`** -- hovering block `(6,6)` (metatile `0x15`, all four quadrants wall). The status strip reads `(6, 6) step (12, 12) id 0x15 · **TL WALL wall** · TR WALL wall · BL WALL wall · BR WALL wall`, with `TL WALL wall` in bold (the hovered quadrant). (The browser window is scrolled a few px left in this shot and the next -- an artifact of Playwright auto-scrolling to bring the exact hover point into view, not an app defect; the status text itself is fully legible and correct.)
5. **`task-4-newbarktown-hover-warp.png`** -- hovering warp step `(11,13)`. The status strip reads `(5, 6) step (11, 13) id 0x14 · TL WALL wall · TR WALL wall · BL WALL wall · **BR DOOR** · warp #3 → ELMS_HOUSE`, with `BR DOOR` bold and no `land` suffix (correctly omitted -- land is the one category that never appends a suffix), and the warp event correctly appended. This matches the re-measured corpus facts above exactly.
6. **`task-4-ceruleancave2f-banner.png`** -- opening CeruleanCave2F shows a red-bordered alert box listing all 4 real defects as bullet points: the `.blk` size defect (`actual size 400 bytes, declared 9x15=135 ... not writable`) and all 3 out-of-bounds warps (`(23,7)`, `(29,1)`, `(19,7)`, each "outside the 18x30 step grid"). Below it, the real cave tile art renders (rocky texture, `TILESET_CAVE`), and the status strip shows `not writable`. This is success criterion 1's own CeruleanCave2F requirement, satisfied exactly.
7. **`task-4-route32-fit.png`** / **`task-4-route32-1x.png`** -- Route32 (10x45 blocks, tall) opens at Fit, which correctly picks 1x (`1×` pressed) since even 1x doesn't fit the route's full height in the viewport -- the view is vertically centred, showing a middle section with two buildings and a cave-adjacent path; clicking `1×` explicitly (already active) is a no-op, confirming Fit's own choice. A separate script confirmed `2×` works correctly (a visibly zoomed-in top-left corner of the route, buildings and trees enlarged as expected).
8. **GBA smoke check** (`task-4-gba-smoke-open.png`): killed the GBC server, restarted `serve.ts` with no flag (served `/home/user/pokemon-three-region`, confirmed via `/api/project` -> `{"family":"gba",...}`), opened `KantoRoute23`. The full, unmodified GBA editing chrome renders correctly: Pencil/Rect/Bucket/Dropper/Shift/Collision, Undo/Redo, Add Sign, Save/Discard, zoom/overlay controls, the real tile art (a bridge over water, berry trees, a rock formation), and the `EventInspector` panel (`No event selected.`/`Add Event`).

Killed both server and Vite processes afterward (Vite's `sh -c vite`-launched real `node .../vite` child needed a direct PID kill after `pkill -f vite` missed it, the same wrinkle Task 3's report recorded). Re-probed both ports with the same Node `net.createServer()` check: **5173 FREE, 5174 FREE**.

### A genuine finding during live-verify: 4x zoom renders a blank canvas on a very tall map, in BOTH families

While testing Route32's zoom buttons (step 8), clicking `4×` produced a solid black canvas (screenshot kept as `task-4-route32-4x.png` rather than deleted, since it is real evidence, not a mistake to hide). Before assuming a Task 4 defect, I reproduced the identical symptom against the **unmodified GBA `MapCanvas.tsx`**, on its own largest available map (`KantoRoute23`, 24x160 blocks): `1×` and `2×` render correctly (confirmed visually -- a mountain/berry-tree scene at 2x), but `4×` also renders a solid black canvas, with no console error. Both canvases use the literal same `ctx.drawImage(base, 0, 0, pixelWidth, pixelHeight, pan.x, pan.y, pixelWidth*zoom, pixelHeight*zoom)` call (Plan Q2's own accepted duplication). At 4x on a map this tall, the destination height exceeds ~6000-10000px, which is consistent with a known class of headless/software-rendered Chromium (SwiftShader) canvas/texture size ceiling -- not something a real user's GPU-accelerated browser is expected to hit, and not something introduced by this task: **it reproduces byte-for-byte on the pre-existing, untouched GBA code path**, using the exact same zoom mechanic. Since `MapCanvas.tsx` is out of scope to touch (hard rule) and the mechanism is Plan Q2's own accepted duplication, no code change was made for this. I'm flagging it here plainly rather than either hiding the black screenshot or silently "fixing" GBC's copy while leaving GBA's identical bug in place, which would create the exact kind of behavioural drift between the two canvases the plan's own risk register warns about ("Duplicated canvas logic drifts from the GBA fixes").

## GBA gate

Confirmed above: `npm test`'s 6 failures are exactly `baseline-fails.txt`, `npm run typecheck` is clean, `App.tsx`/`MapCanvas.tsx`/`MapCanvas.test.tsx`/`App.test.tsx` are byte-identical to `HEAD` before this task (`git diff --stat` empty), and the GBA smoke check above confirms the running app is visually and functionally unchanged.

## Deviations from the spec, and judgement calls

1. **Hex formatting uses `0x..` throughout, not the spec prose's `$..`.** The spec's own status-strip example writes `id 0x.. [renders as border $..]` -- mixing two different hex prefixes in one line. Every existing hex helper in this codebase (`MapCanvas.tsx`'s own `hex()`, `MetatilePalette.tsx`'s) uses `0x`, and no `$`-prefixed hex literal appears anywhere else in the UI source. I used `0x` consistently for both the metatile id and the border note, treating the spec's `$` as a typo/inconsistency rather than a deliberate second convention -- "where the code and spec disagree, the code (and its own established convention) wins."
2. **A fixed alpha (140, ~0.55) is applied to any CSS colour token parsed as plain hex** (`--encounter-water`, `--event-object/warp/coord/bg`) -- these tokens are opaque swatches everywhere else they're used (legend chips, the encounter gutter), with no alpha channel of their own, but this overlay needs one to blend rather than replace. `--overlay-collision` already carries its own alpha as an `rgba()` literal and is used as-is. 140 was chosen to roughly match `--overlay-collision`'s own ~0.55 opacity rather than inventing a second, unrelated value; this is a genuine design judgement call the spec leaves open ("Parse `rgba()` or hex into RGBA" doesn't say what alpha a bare hex value gets), documented in `GbcMapCanvas.tsx`'s own comment.
3. **`useGuardedFetch` was extended (not `useGbcMap` reimplemented) to support `url: string | null`.** The spec says `useGbcMap` should follow `useMapLayout`'s "null name -> idle" shape, and Task 3's own fix-round convention says every fetch goes through the shared hook rather than a hand-rolled one. Both instructions only reconcile by teaching the shared hook the null case; I judged this the intended reading rather than a conflict, since building a second, parallel fetch/guard/error implementation inside `useGbcMap` would violate the explicit "don't hand-roll another fetch, then guard, then error block" instruction in this task's own spec.
4. **`app__map-editing-body` (and `app__map-editing`) are reused directly for the GBC map view's own layout**, rather than inventing a `gbc-app__map-body` class the spec offers as an alternative ("mirroring `app__map-editing-body`'s layout, or an equivalent `gbc-app__map-body` flex row"). Both GBA classes are pure flex-column/flex-row layout rules with zero editing-specific styling, so reusing them verbatim means one less near-duplicate CSS block to keep in sync, and is explicitly permitted by the spec's own "or an equivalent" wording.
5. **The GbcMetatilePalette header uses `tileset.constName`** (e.g. `TILESET_JOHTO`), matching the status strip's own convention, rather than `tileset.name` (e.g. `TilesetJohto`) -- the spec's "a header gives `<tileset name>` · `<count> metatiles`" doesn't specify which of the payload's two tileset fields it means; I chose the one already visible in the same view's status strip so a user sees one consistent identifier for the same concept in two places, not two different-looking names for the same tileset.
6. **A genuine, reproducible finding (not a Task 4 defect) is documented above**: 4x zoom on a very tall map renders a blank canvas in a headless/software-rendered browser, identically on the pre-existing, unmodified GBA `MapCanvas.tsx`. No code change was made; flagged plainly per this project's own "an agent... found and fixed while mutation-testing... honestly reported" precedent (Task 3's own guard-test-gap disclosure) applied here to a live-verify finding instead.

No other part of the spec's payload shape, geometry, control list, status-strip wording, or test-pinning instructions was found to conflict with the real code once measured directly against `MapCanvas.tsx`, the corpus, and the existing GBC route/hook/guard code.

## Fix round 1

Both the spec review (`task-4-spec-review.md`, verdict "Not approved yet, fix round needed") and the quality review (`task-4-quality-review.md`, verdict "approve-with-fixes") were addressed together, per the coordinator's 11-item brief. GBA's `App.tsx`, `MapCanvas.tsx` and the shared `.map-canvas` rule were left untouched throughout, as instructed (the GBA A/B StrictMode analog is a separate follow-up task).

Commits (all `fix:`/`test:`, GBC code only):

| SHA | Item(s) | Summary |
|---|---|---|
| `5f0a7df` | 4 | `overlays.ts`: doc-comment on the known id-0 collision gap (`home/map.asm:1717-1719,1744-1746`); `overlays.test.ts`: origin-32, 2x2-block fixture with 3 distinct real collision configs, killing X1-X6 |
| `792dfea` | 8 | `guards.ts`: `isGbcMapPayload` now rejects a non-record `collisionInfo` and a missing/non-string `tileset.constName` |
| `bebb1b7` | 3 | `useGuardedFetch.ts`: resets `data`/`error` unconditionally at the top of the effect (not only on the `url === null` branch), so a URL change alone clears stale data/error before the new fetch resolves |
| `aacc70c` | 1, 2, 5, 8 | `GbcMapCanvas.tsx`: single `GbcView { zoom, pan }` state + pure `zoomAboutPivot` (StrictMode fix); `formatQuadrant` extracted and exported; `parseColorToken` handles `#rgb`/`#rrggbbaa` and a documented magenta fallback; `styles.css`: `.gbc-map-canvas` overflow fix (fixed-height wrapping status strip, `min-width: 0`, ellipsis); `GbcMetatilePalette.tsx`: `role="list"`/`role="listitem"`; large test additions in `GbcMapCanvas.test.tsx` (StrictMode regression, `formatQuadrant` table, viewport-blit-deps, wheel `passive:false`, pristine-recomposite-on-toggle, discriminating `clientToStep` pan test) |
| `11a56db` | 3, 6, 7, 9, 11 | `GbcApp.tsx`: readiness gate (`ready = data.map.name === selected ? data : null`) so a stale/failed payload for a previous selection is never rendered; `src/gbc/time.ts` new shared `GbcTimeOfDay` type, now imported by `GbcApp`/`GbcMapCanvas`/`GbcMetatilePalette` instead of three local copies; new hover-to-palette wiring tests and highlight-reset test in `GbcApp.test.tsx`; two new `useGuardedFetch.test.ts` tests for the reset behaviour |
| `4d6b505` | 7 | Rewrote the highlight-reset test to combine both assertions in one `waitFor`, and added a comment documenting the genuine redundancy behind the X17 mutation (below) |

Item 10 (id-0 collision comment) landed inside `5f0a7df`. Every `eslint-disable-next-line react-hooks/exhaustive-deps` in `GbcMapCanvas.tsx` now has an explanatory comment (item 11); `hex()` duplication between `GbcMapCanvas.tsx` and `GbcMetatilePalette.tsx` was deliberately left as-is per the brief.

### Test counts and gate

- Test count: 1488 -> 1516 (+28: 3 in `overlays.test.ts`, 2 in `guards.test.ts`, 2 in `useGuardedFetch.test.ts`, 3 in `GbcMetatilePalette.test.tsx`/`GbcApp.test.tsx` combined for wiring+ARIA, remainder in the rewritten `GbcMapCanvas.test.tsx`, which grew from 21 to 38 tests).
- `npm test`: full suite green; failures match `baseline-fails.txt` exactly (pre-existing, unrelated failures only).
- Typecheck: clean on both `tsconfig.base.json` and `packages/ui/tsconfig.json`.

### Mutation re-run

Ran the reviewer's `mutate.mjs` with the exact requested ID list plus the original S-set: `S1 S2 S3 S4 S5 S6a S6b S7 S8 X1 X2 X3 X4 X5 X6 X8 X9 X10 X11 X12 X13 X14 X15 X17 X20 X23`. `git status --short` was clean after the run (harness mutates `git show HEAD:<file>`, then restores from that golden copy).

| ID | Mutation | Result | Killing test(s) |
|---|---|---|---|
| S1 | swap quadrant parity | KILLED | `overlays.test.ts` quadrant-parity pin + `GbcMapCanvas.test.tsx` 4-quadrant hover test |
| S2 | draw out-of-bounds events | KILLED | `overlays.test.ts` mutation check + CeruleanCave2F corpus case |
| S3 | tint land quadrants | KILLED | `overlays.test.ts` land-untouched + wall-only-blend tests |
| S4 | drop time from image URL | KILLED | `GbcMapCanvas.test.tsx` image-URL test + `GbcApp.test.tsx` |
| S5 | re-fit on time change | KILLED | `GbcMapCanvas.test.tsx` "does not re-fit when only time changes" |
| S6a/S6b | drop rendersAsBorder (UI/core) | KILLED | `GbcMapCanvas.test.tsx` + `overlays.test.ts` border-note tests |
| S7 | palette scrolls every render | KILLED | `GbcMetatilePalette.test.tsx` scroll-once tests |
| S8 | drop blocks.length guard | KILLED | `guards.test.ts` |
| X1 | collision ignores origin | KILLED | new origin-32 2x2-block collision test |
| X2 | collision uses 16px blocks | KILLED | same |
| X3 | water tinted with wall colour | KILLED | same |
| X4 | collision block index transposed | KILLED | same |
| X5 | events ignore origin | KILLED | new origin-32 events test |
| X6 | grid every 16px, not per block | KILLED | new origin-32 grid test |
| X8 | hovered-quadrant mark never on BR | KILLED | 4-quadrant hover test |
| X9 | TR label shows BL's data | KILLED | same |
| X10 | drop +talk (anchor retargeted) | KILLED | `formatQuadrant` table tests + 4-quadrant hover test |
| X11 | land category suffix shown (anchor retargeted) | KILLED | `formatQuadrant` table tests |
| X12 | null name -> empty, not hex | KILLED | `formatQuadrant` table test + 4-quadrant hover test |
| X13 | palette highlight not wired in GbcApp | KILLED | `GbcApp.test.tsx` hover-to-palette wiring test |
| X14 | viewport dropped from blit deps | KILLED | ported viewport-blit-deps regression test |
| X15 | wheel listener passive:true | KILLED | wheel `passive:false` spy test |
| X17 | hover highlight not reset on map switch | **SURVIVED** (142/142 passed) | see below |
| X20 | composite not pristine on toggle | KILLED | rewritten toggle-Grid-then-Collision test |
| X23 | clientToStep ignores pan | KILLED | rewritten discriminating pan/zoom test |

X10 and X11's anchors in `mutate.mjs` were retargeted (with a comment left in the harness file explaining why) because `formatQuadrant` was extracted out of `GbcMapCanvas`'s inline `quadrantLabel` in this fix round, moving the `+talk`/category lines the original anchors pointed at; the mutation's *intent* is unchanged, only its exact source location. No other anchor needed retargeting.

**X17 (survived, investigated and reported rather than papered over):** `GbcApp`'s own `selectMap` handler calls `setHoveredMetatileId(null)` on every map switch, which is what this mutation removes. Direct instrumentation during the investigation showed that `GbcMapCanvas` has its own, pre-existing "fresh overlays/hover on a real map switch" effect (present since Task 4's original implementation, unrelated to this fix round) that *also* calls the hover-reset callback whenever its own `mapName` prop changes -- and it does so even with `GbcApp`'s line removed. The two resets are therefore genuinely redundant for any switch where the new map's canvas mounts successfully, which is the only case a black-box DOM test can observe; whether the test's `waitFor` resolves before or after `GbcMapCanvas`'s own effect fires is a scheduling race, not a function of which line is present, so the test cannot reliably attribute a pass to `GbcApp`'s own reset. `GbcApp`'s line is not dead code: it is the only thing that protects the one case `GbcMapCanvas`'s effect cannot cover (the new map's canvas never mounts at all, e.g. a failed fetch) -- but that case has no DOM-visible symptom to assert on either, because the whole map view is replaced by the error placeholder regardless of the stale highlight value underneath it. This is recorded in `GbcApp.test.tsx`'s own test as a code comment rather than silently claimed as a clean kill.

### Live re-verify

Server: `npm run dev` in `packages/ui`, Chromium via Playwright, screenshots actually viewed (Read tool) before being trusted. All processes killed and ports 5173/5174 confirmed free afterward (`net.createServer()` probe).

**Item 1 (StrictMode zoom fix):** Vite's `main.tsx` wraps the app in `<StrictMode>`, so the dev server exercises the fixed code path directly.
- `task-4-fix1-newbarktown-strictmode-2x.png` / `-4x.png`: NewBarkTown canvas at 2x and 4x, both rendered correctly centred, no blank canvas, no visible double-pan offset.
- `task-4-route32-1x.png`, `task-4-route32-2x.png` (new), `task-4-route32-4x.png`, `task-4-route32-4x-fullpage.png` (new), `task-4-route32-fit.png`: Route32 across the same zoom sequence; 1x/2x/Fit all correct. 4x reproduces the same pre-existing, GBA-shared "blank canvas in headless/software rendering on a very tall map" finding already disclosed in the Deviations section above (confirmed unrelated to the StrictMode fix: the canvas itself is sized and positioned correctly, it is a rendering-backend limit, and the identical symptom is reproducible on the unmodified GBA `MapCanvas.tsx`).

**Item 2 (hover overflow fix):** hovered the warp step at NewBarkTown (the longest realistic status line: id + 4 quadrant labels + a warp suffix) at both viewports and read `document.documentElement.scrollWidth`/`clientWidth` directly.
- 1280x800: `scrollWidth === clientWidth` (no horizontal overflow). Screenshot `task-4-fix1-hover-overflow-1280x800.png` shows the status strip wrapped to two lines, fully inside the viewport.
- 1024x768: same result, `scrollWidth === clientWidth`. Screenshot `task-4-fix1-hover-overflow-1024x768.png` shows the same two-line wrap at the narrower width, still no page scrollbar.

**General NewBarkTown day/nite/overlays/hover pass, and CeruleanCave2F banner (all screenshots replaced with freshly-verified captures):**
- `task-4-newbarktown-day.png` / `-nite.png`: day and night tints render correctly, only the tint differs.
- `task-4-newbarktown-overlays.png`: Collision + Events overlays both on simultaneously, tinted quadrants and event marks visible over the base image.
- `task-4-newbarktown-hover-building.png`: hovering a building block shows the per-quadrant collision text under the canvas with no page overflow.
- `task-4-newbarktown-hover-warp.png`: hovering the warp step shows the warp suffix appended to the status text, confirmed via the same `scrollWidth === clientWidth` check logged during the run, no page overflow.
- `task-4-ceruleancave2f-banner.png`: switching to CeruleanCave2F shows the defect banner (`role="alert"`) with its real defect text, replacing the previous, less clearly captured version of this screenshot.

### Deviations / concerns carried into this fix round

- The X17 finding above: accepted as a genuine, investigated case of two independent components performing a redundant reset, not a gap papered over with a flaky-but-passing test.
- No other deviations from the coordinator's 11-item brief; all 11 items were addressed as specified.
