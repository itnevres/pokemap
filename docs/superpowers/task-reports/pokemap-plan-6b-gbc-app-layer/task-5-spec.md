# Plan 6b Task 5: executed spec

The read-only GBC world view: `useGbcWorld` and `GbcWorldCanvas`, wired into `GbcApp`'s World mode in place of Task 3's placeholder.

**Read first:**
- the plan: Q2, Q3, and Task 5;
- `_archive/task-2-*.md`, for the `/api/world` contract;
- Task 3's and Task 4's reports, for the shell and the conventions established in the map view;
- `packages/ui/DESIGN.md`;
- RESUME's UI lessons.

**Ground rules:** the same as Task 3's spec, §"Ground rules". In particular, `WorldCanvas.tsx` is **not modified**, except for the one additive change in §1.

**Conventions established in Task 3's fix round:** GBC-specific hooks live in `packages/ui/src/gbc/hooks/`, and family-agnostic ones in `src/hooks/`. Every fetch goes through Task 3's shared guarded-fetch helper (read `_archive/task-3-implementer.md` for its name and location). `guards.ts` has `isRecord` for building new guards. Don't hand-roll another fetch, then guard, then error block.

## Facts (measured; re-check any you depend on)

`GET /api/world` returns `{ family: "gbc", blockPx: 32, placements: Record<name, Placement>, components, conflicts }`.
- Units are **blocks**. A placement's image is `/api/render/<map>.png?time=T` at border 0, which is `width*32 × height*32` px.
- There are 326 components. Exactly 3 have more than one map: sizes 35, 31 and 2. The other 323 are single-map interiors, and they make up most of the 255×746-block canvas.
- There are 2 conflicts. `Conflict.map` is Route17 and Route18. Each conflict names `viaA.from` and `viaB.from` with their disagreeing positions; the Route17 one is via Route18 at (30,50) versus via Route16 at (30,49).
- Decoded images take about 153 MB per time of day at native size, so keep only the current time's images.

## Deliverables

### 1. The one additive change to `WorldCanvas.tsx`

`computeFit(bounds, viewport, zoomBounds?: { min: number; max: number })`. The default stays exactly today's `MIN_ZOOM`/`MAX_ZOOM`, so existing calls and tests are unchanged.

GBC passes `{ min: 1/64, max: 32 }`, because its zoom is screen px per block and 32 is native. Add a unit test for the new parameter. The existing `computeFit` tests must stay green **unchanged**.

### 2. `isGbcWorldPayload` and `useGbcWorld()`

- The guard goes in `gbc/guards.ts`, alongside the existing ones.
- Check:
  - `family === "gbc"`;
  - `blockPx === 32`;
  - `placements` is an object of `{ map, x, y, width, height, component }` with numeric fields;
  - `components` and `conflicts` are arrays.
- `useGbcWorld()` fetches once and uses the guard. Give it a visible error state.

### 3. `packages/ui/src/gbc/GbcWorldCanvas.tsx`

**Props:** `{ time, jumpToMap?, jumpToken?, onSelectMap?(name), onOpenMap?(name) }`.

**Read `WorldCanvas.tsx` first.** Reproduce these mechanics:
- measure the viewport, and keep `viewport` in the draw deps;
- use a native wheel listener with `{ passive: false }` (WorldCanvas's comment near l. 1361 explains why);
- zoom around the cursor with `WHEEL_FACTOR` 1.2;
- cull with the `intersects` AABB test;
- load images per visible placement only, cached by ref, with a version bump when each arrives (l. 845-878);
- use an LOD `small` canvas at `LOD_SCALE` 0.25, drawn when zoom is below the threshold. For GBC the threshold is **8** px/block, i.e. `32 * 0.25`. Put that in a named constant, with a comment tying it to GBA's 4 = `16 * 0.25`;
- draw conflict badges with `drawDiamond` in `--danger`, plus a hover tooltip. Copy the two small draw helpers, or export them from `WorldCanvas.tsx` as an additive change.

**GBC-specific behaviour:**
- **Image URL** is `/api/render/${enc(map)}.png?time=${time}`. The cache is keyed by map. **When `time` changes, clear the whole image cache** (drop all references) so it refetches. Never hold two times at once.
- **Initial fit** covers the bounding box of the multi-map components only: `components.filter(c => c.maps.length > 1)` → union of `bounds`. A **Fit all** button fits every placement.
- **Conflict badge** sits on `Conflict.map`'s top-right corner. The tooltip uses the CLI's `noteLines` wording: `Route17 placed via Route16; Route18 disagrees by (0,1)`, with `dx,dy = viaA - viaB`. Test this string exactly for the Route17 fixture.
- **Hover tooltip** shows the map name, `component #i (N maps)`, and the size in blocks.
- **Click** selects: `onSelectMap(name)`, with an outline in `--overlay-selection`. **Double-click** calls `onOpenMap(name)`. `GbcApp` then switches to Map view with that map selected.
- **Jump:** when `jumpToken` changes and `jumpToMap` is placed, centre it at a zoom where it fills about 60% of the viewport, then flash an outline (the `jumpHighlight` pattern).
- **No editing:** no drag-to-place, no multi-select, no dungeons, no warps, no sidecar.
- **Status strip:** `326 components · 391 maps · zoom N%`, where N% is relative to native 32 px/block.

### 4. `GbcApp` wiring

- World mode renders `GbcWorldCanvas`, with `time` from the header.
- Tree clicks in World mode jump (bump `selectVersion`), as `App.tsx` does.
- Double-clicking a map opens it in Map mode.

## Tests (jsdom)

- **Guard:** every clause.
- **Fit to multi-map components:** a pure function, `initialFitBounds(world)`. Pin it for a fixture with one 2-map component and one far-away 1-map interior. The interior must be excluded.
- **Conflict tooltip text:** exact.
- **Culling:** only placements that intersect the viewport get `Image` objects. Stub `Image`.
- **Time change:** the URLs are rebuilt with the new time, and the old cache entries are dropped. Assert on the exact URL strings.
- **LOD threshold:** below 8 px/block, `small` is drawn. Test the pure chooser.
- **`computeFit` zoom-bounds test.**

## Live verify (required; plan success criterion 2)

With the `--gbc` server and Vite running:
1. Open World view and take a screenshot. It should fit Johto and Kanto, not the interior sprawl.
2. Pan and zoom to Route 16/17/18 and screenshot the conflict badges. Hover a badge and capture its tooltip.
3. Switch to Nite and screenshot; the tiles should re-render darker.
4. Click a map name in the tree; the view should jump there.
5. Double-click a map; it should open in Map view.
6. Take "Fit all".

Then the GBA smoke check: the GBA world view still loads. Take a screenshot.

**Look at every screenshot.** Save them as `screens/task-5-*.png`. Kill all processes, and check that ports 5173 and 5174 are free.

## Mutation checks (record them in the report)

1. Fit uses all components.
2. Don't clear the cache on a time change.
3. Invert `dx`/`dy` in the tooltip.
4. Drop culling, so every placement loads.
5. Use an LOD threshold of 4.
6. Drop the `blockPx` guard clause.
7. Make `computeFit`'s default bounds change. The existing tests must go red.

## Report

`task-5-implementer.md`, with the usual sections plus the live-verify narrative and the screenshot paths.
