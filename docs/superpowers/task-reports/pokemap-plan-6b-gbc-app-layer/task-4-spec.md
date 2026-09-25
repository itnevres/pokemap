# Plan 6b Task 4: executed spec

**Scope:** the read-only GBC map view: `useGbcMap`, `GbcMapCanvas`, GBC overlays, `GbcMetatilePalette`, and the defect banner. It replaces Task 3's map-view placeholder in `GbcApp`.

**Read first:**
- the plan: Q2's reuse/sibling decision, the "two grids" and out-of-map event decisions, the collision display decision, and Task 4;
- `_archive/task-1b-*.md`, for the `/api/map`, `/api/render` and `/api/metatile` contracts;
- `task-3-*.md` (archived by the time you start), for the shell;
- `packages/ui/DESIGN.md`;
- RESUME's UI lessons.

**Ground rules:** the same as Task 3's spec, §"Ground rules". In short:
- no jest-dom;
- real tokens only;
- no `.btn`;
- guard every fetch and give it a visible error;
- `App.tsx`, `MapCanvas.tsx` and the other GBA components are **not modified**;
- the GBA gate;
- live-verify with screenshots you actually look at.

## Facts the implementation relies on (measured; re-check any you depend on)

- **Blocks are 32 px.** Block `(bx, by)` is at pixel `(originX + bx*32, originY + by*32)`.
- **The border ring.** `/api/render/:name.png?border=1&time=T` is `(w+2)*32 × (h+2)*32`, with `originX = originY = 32`.
- **Events and collision quadrants use 16-px steps.** The step grid is `2w × 2h`, and step `(sx, sy)` is at pixel `(origin + sx*16, origin + sy*16)`. NewBarkTown is 10×9 blocks, and its `warp_event 11, 13` is the proof.
- **Which block and quadrant a step falls in.** Step `(sx, sy)` is in block `(sx>>1, sy>>1)`. Its quadrant index is `(sx&1) + 2*(sy&1)`, mapping to TL/TR/BL/BR as `GetCoordTile` defines it (findings §3.3). That index selects `collision[metatileId].{tl,tr,bl,br}`.
- **Block id 0** renders as the map's border metatile, but the payload's `blocks` are raw. The hover shows the raw id, with the note `(renders as border $XX)` when the id is 0. The corpus has no id-0 blocks, but the code path must be honest.
- **Collision colours.** `payload.collisionInfo[String(value)]` gives `{ name, category, talk }`. Walls are tinted with `--overlay-collision` and water with `--encounter-water`; land is untinted.
- **Out-of-map events.** `payload.defects` already includes the out-of-bounds event defects, 3 of them on CeruleanCave2F. Such events are never drawn and never hit-tested.

## Deliverables

### 1. Core: `packages/core/src/gbc/render/overlays.ts` (new, pure, node-testable)

This mirrors `core/render/overlays.ts`, which the GBA canvas composites through. Reuse `blendRect`/`RGBA` from `../../render/raster.js`, and GBA's `drawGrid(r, step)`, which already takes a step.

- **`drawGbcGrid(r, originX, originY, wBlocks, hBlocks)`.** Draws 32-px block lines over the map area only.
- **`drawGbcCollision(r, originX, originY, payload, colors: { wall: RGBA; water: RGBA })`.** One 16×16 `blendRect` per quadrant whose category is wall or water.
- **`drawGbcEvents(r, originX, originY, events, stepW, stepH, colors)`.** Returns `GbcEventMark[]` (`{ kind, index, sx, sy, label }`) for the in-bounds events only. Each one is drawn as one 16×16 blend, in the order object, warp, coord, bg (as in GBA). Out-of-bounds events are skipped; the defect banner shows them.
- **`gbcStepInfo(payload, sx, sy)`**, a pure hover resolver. It returns `null` outside `2w × 2h`. Otherwise it returns:
  - `{ bx, by, sx, sy, metatileId, rendersAsBorder: metatileId === 0, border: map.border, quadrant: "tl"|"tr"|"bl"|"br", quadrants: {tl,tr,bl,br} }`, where each quadrant is `{ value, name, category, talk }`;
  - `events`: every event whose step is `(sx, sy)`.

**Tests** (`packages/core/test/gbc/render/overlays.test.ts`) use a synthetic raster and a hand-built payload, with distinct values in every field:
- a no-collision cell is byte-identical to the base (the Plan 0 §7 lesson);
- a wall quadrant blends exactly its 16×16 area;
- `gbcStepInfo`'s quadrant mapping is pinned for all four parities;
- a real-corpus case: the payload for NewBarkTown from `openGbcProject` plus the Task 1b builder (`buildGbcMapPayload`), where step `(11, 13)` resolves to warp index 3 → `ELMS_HOUSE`;
- CeruleanCave2F: `drawGbcEvents` marks exclude its 3 out-of-bounds warps.

### 2. UI guard and hook

- **`isGbcMapPayload`**, in `packages/ui/src/gbc/guards.ts`. Check:
  - `family === "gbc"`;
  - `map.name` is a string;
  - `layout.width` and `layout.height` are positive integers;
  - `blocks.length === width*height`;
  - `collision.length === metatileCount`;
  - `events` has four arrays;
  - `defects` is an array.

  Mutation-test each clause.
- **`useGbcMap(name)`**, in `packages/ui/src/gbc/useGbcMap.ts`. It follows `useMapLayout`'s shape (cancelled guard, null name → idle), plus the guard.

### 3. `packages/ui/src/gbc/GbcMapCanvas.tsx`

Props: `{ mapName, data: GbcMapPayload, time, hoveredMetatile?: (id | null) => void }`.

Implement it by **following `MapCanvas.tsx`'s documented mechanics**, which is where the postmortems live. Read that file in full first.

**Rendering and layout**
- `imageUrl = /api/render/${enc(mapName)}.png?border=1&time=${time}`. An `<img>` source goes into a pristine base canvas, which is recomposited on each toggle through `ImageData` + the core overlay functions. A separate stage canvas blits for pan/zoom.
- Keep `viewport` in the blit effect's deps (the Task 21 blanking postmortem, `MapCanvas.tsx:472-485`).
- Reset `imgLoaded` when the URL changes.
- Fit once per `mapName`, never on a time change, so zoom and pan survive a time switch.
- Use a native wheel listener with `{ passive: false }`.
- Zoom levels are 1×, 2× and 4×, plus Fit. The canvas uses `image-rendering: pixelated`, via the existing `.map-canvas__stage` class.

**Controls**
- Toggles: Grid, Collision and Events, using the existing `map-canvas__btn`/`map-canvas__toggles` markup.
- The legend row reuses `map-canvas__legend` and its swatches. Add `map-canvas__swatch--water` if you need it, using `--encounter-water`.
- Overlay colours come from CSS tokens at composite time (`getComputedStyle`), with the dark-mode literal as the fallback, following `MapCanvas.tsx:521`'s pattern. Parse `rgba()` or hex into RGBA.

**Status strip** (`map-canvas__status`)
- Always shown: `tileset <constName> · <metatileCount> metatiles · <w>×<h>`, with `not writable` when `!layout.writable`.
- On hover: `(bx,by) step (sx,sy) id 0x.. [renders as border $..] · TL WALL · TR FLOOR · BL … · BR …`. The hovered quadrant is marked (wrap it in `<strong>`). Use the name, or the hex value when the name is `null`. Add the category when it isn't land, and `+talk` when set. Then append the event(s) at this step, as `warp #3 → ELMS_HOUSE`, `bg #0 BGEVENT_READ`, `object #1 SPRITE_FISHER`, and so on.
- It calls `hoveredMetatile(id)` on hover and `null` on leave.

**Scope limits**
- No selection, no drag and no editing.
- Deliberately duplicate the pan/zoom/viewport mechanics, as plan Q2 accepts, and say so in a header comment that points at `MapCanvas.tsx`.

### 4. `packages/ui/src/gbc/GbcMetatilePalette.tsx`

A read-only grid of `metatileCount` thumbnails, each an `<img src="/api/metatile/${map}/${id}.png?time=${time}">` at 32 px with `loading="lazy"`.

- Each cell has an `aria-label` of `metatile 0x..`.
- The cell whose id matches `highlightId` gets `aria-current="true"` and the selected styling (`--bg-selected` + `--border-strong`), and is scrolled into view with `block: "nearest"`, **only when the highlight changes**. Scrolling on every render is not allowed.
- A header gives `<tileset name> · <count> metatiles`.
- Place it as a right-side panel, mirroring `app__map-editing-body`'s layout, or an equivalent `gbc-app__map-body` flex row. The canvas stays `flex: 1` (DESIGN.md: the canvas is owed the space).

### 5. The defect banner and `GbcApp` wiring

- `GbcApp`'s map view becomes: banner, then `[GbcMapCanvas | GbcMetatilePalette]`.
- The banner lists every `data.defects[i].message`, in a `role="alert"` box that reuses the `app__event-op-error` look. It is non-dismissible: this is data truth, not a one-shot notice. It is shown only when `defects.length > 0`.
- Loading and error states match `App.tsx:495-499`.
- `time` flows from the header, and `hoveredMetatile` drives the palette highlight.

## Tests (UI, jsdom)

- **Guard:** every clause.
- **GbcMapCanvas:**
  - the image URL is **exactly** `/api/render/NewBarkTown.png?border=1&time=day`, then `…time=nite` after the prop changes;
  - the status strip's static text, from a fixture payload;
  - hover math: fire `mouseMove` at a computed client position with a mocked `getBoundingClientRect`, at zoom 1 and pan 0. It is simplest to export the pure coordinate → step function and test it directly;
  - the hovered-quadrant marking;
  - `hoveredMetatile` is called with the right id.
- **GbcMetatilePalette:**
  - it renders `metatileCount` cells with the exact src for one id;
  - `aria-current` moves with `highlightId`;
  - `scrollIntoView` is called once per highlight change, not per render. Stub `Element.prototype.scrollIntoView`.
- **GbcApp:**
  - the banner appears for a payload with defects and is absent without them;
  - `time` reaches the canvas URL.

## Live verify (required; plan success criterion 1)

Use the global Playwright, as in Task 3. With the `--gbc` server and Vite running:
1. Open NewBarkTown.
2. Screenshot at Day.
3. Switch to Nite and screenshot. The pixels must visibly differ; say how.
4. Turn on Collision and Events and screenshot.
5. Hover a building block and screenshot. The status strip must show the id and 4 quadrants.
6. Hover warp step `(11, 13)` and read the event in the strip.
7. Open CeruleanCave2F and screenshot the banner. It must name the `.blk` defect and the 3 out-of-map warps.
8. Open a large map, such as Route 32 or Goldenrod City, and check Fit and the zoom buttons.

Then run the GBA smoke check: restart the server on the GBA subject, open one map, and screenshot it.

**Look at every screenshot.** Save them as `screens/task-4-*.png`, at 1280×800. Kill all processes and confirm ports 5173 and 5174 are free.

## Mutation checks (record them in the report)

1. Swap the quadrant parity, using `2*(sx&1) + (sy&1)`.
2. Draw out-of-bounds events.
3. Tint land quadrants.
4. Drop `time` from the image URL.
5. Re-fit on time change. For this one, a test on the effect dependency, or a documented live check, is acceptable.
6. Drop `rendersAsBorder`.
7. Make the palette scroll on every render.
8. Drop the `blocks.length` guard clause.

## Report

`task-4-implementer.md` with the usual sections, plus the live-verify narrative, and the screenshot paths with what each shows.
