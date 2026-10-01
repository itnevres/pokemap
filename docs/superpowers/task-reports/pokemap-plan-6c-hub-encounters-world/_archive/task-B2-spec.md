# Task B2 executed spec: border side selection (pure)

Plan §B2. **U4 (binding):** side order **left, top, right, bottom**; the first free side wins. A side is
blocked when any placed map touches or overlaps a band along that side in the world layout. In the map
view (no layout) a side is blocked when the map has a connection on it. All four blocked → the side whose
band overlaps neighbours the least.

## Ground truth (measured 2026-09-30)

- World units. GBA world placements are in **metatiles** (16 native px); GBC placements are in
  **blocks** (32 native px; `GbcWorldPayload.blockPx: 32`). Both use the `Placement` shape
  `{ map, x, y, width, height, component }` (`packages/core/src/world/…`, GBC built by
  `buildGbcWorld` in `packages/core/src/gbc/world/connections.ts`).
- Connection directions: GBA `ConnectionDirection = "up" | "down" | "left" | "right" | "dive" | "emerge"`
  (`packages/core/src/load/maps.ts`); GBC `"north" | "south" | "west" | "east"`
  (`packages/core/src/gbc/model/types.ts`). B2's function takes the GBC/compass names; B4 maps GBA's
  (`up→north`, `down→south`, `left→west`, `right→east`, dive/emerge ignored).
- **"Touches" made precise (coordinator decision).** The plan says both "touching counts as blocked" and
  "a gap ≥ band doesn't". Read literally with closed intervals these collide at gap = band (the neighbour
  then touches the band's *outer* edge) and at bare corners. Resolution: a neighbour blocks a side iff
  its rect and the side's band **intersect with positive area** (half-open rects). Then:
  - a neighbour flush against the map's side (gap 0, the plan's "touching") overlaps the band → blocked;
  - gap = band → zero-area contact with the band's outer edge → free; gap > band → free;
  - a neighbour meeting the map only at a corner point → zero area → free.
- **Real corpus, GBC, `buildGbcWorld(openGbcProject(PerfPlus))`, band = 2 blocks:**
  - NewBarkTown `{x:175,y:251,w:10,h:9}`. Left band overlaps Route29 `{145,251,30×9}` by **18**; right
    band overlaps Route27 `{185,251,40×9}` by **18**; top and bottom bands touch Route29/Route27 only at
    corners (area 0). → **`top`**. (Under a closed-interval "touching" rule all four would be blocked and
    the answer would differ, so this pins the rule too.)
  - Route30 `{x:130,y:224,w:10,h:27}`. Top band overlaps Route31 `{120,215,20×9}` by **20**; bottom band
    overlaps CherrygroveCity `{125,251,20×9}` by **20**; left/right only corner-touch. → **`left`**
    (criterion 2's Route30).
- Band constants (64 native px, about two sprites deep at 1×): **GBA 4 metatiles, GBC 2 blocks.**
  B3 renders sprites at `min(32, band × zoom)` screen px.
- No UI test reads the corpus today. Vitest runs `packages/ui/**` under jsdom (`vitest.config.ts`
  `environmentMatchGlobs`); a file can opt into node with `// @vitest-environment node`. The GBC corpus
  helpers are `packages/core/test/gbc/helpers/corpus.ts` (`GBC_SUBJECT_ROOT`, `itWithGbcCorpus`); they
  read `pokemap.config.json` relative to the cwd, which is the repo root under `npm test`.

## Design (binding)

`packages/ui/src/encounters/borderSide.ts` (new):
```ts
export type BorderSide = "left" | "top" | "right" | "bottom";
export interface Rect { x: number; y: number; width: number; height: number }
export const SIDE_ORDER: readonly BorderSide[] = ["left", "top", "right", "bottom"]; // U4
/** Border band thickness in world units: 64 native px. */
export const BORDER_BAND = { gba: 4, gbc: 2 } as const;
/** The band of thickness `band` just outside `rect` on `side`. */
export function bandRect(rect: Rect, side: BorderSide, band: number): Rect;
/** Positive-area intersection of two half-open rects (0 when they only touch). */
export function overlapArea(a: Rect, b: Rect): number;
export function pickBorderSide(rect: Rect, neighbours: Rect[], band: number): BorderSide;
export type CompassDir = "north" | "south" | "east" | "west";
export function borderSideFromConnections(dirs: ReadonlySet<CompassDir>): BorderSide;
```
- `bandRect`: left `{x-band, y, band, h}`, top `{x, y-band, w, band}`, right `{x+w, y, band, h}`,
  bottom `{x, y+h, w, band}`. Bands are exactly the side's length (no corner squares).
- `pickBorderSide`: for each side in `SIDE_ORDER`, `total = Σ overlapArea(band, n)` over `neighbours`.
  Return the first side with `total === 0`; else the side with the smallest `total`, ties broken by
  `SIDE_ORDER`. The caller excludes the map itself from `neighbours` (the function doesn't know names);
  document that a rect equal to `rect` in `neighbours` blocks nothing anyway (it doesn't overlap the bands).
- `borderSideFromConnections`: `left`←`west`, `top`←`north`, `right`←`east`, `bottom`←`south`; the first
  side in `SIDE_ORDER` whose direction is absent. All four present → `"left"` (no overlap data in the map
  view; U4's order decides).
- Pure, no React, no fetch. Doc comment cites U4 and the positive-area decision above.

## TDD steps (commit each green step)

1. `packages/ui/test/encounters/borderSide.test.ts` (jsdom default is fine, nothing DOM):
   - **User examples (U4), with a 10×10 map at (0,0), band 2:** neighbours on top+bottom → `left`;
     left+right → `top`; top+right → `left`; nothing → `left`; left only → `top`; left+top+right → `bottom`.
   - **All blocked → least overlap, exact fixture:** map `{0,0,10,10}`, band 2; neighbours
     left `{-2,0,2,10}` (overlap 20), top `{0,-2,3,2}` (6), right `{10,0,2,4}` (8), bottom
     `{0,10,10,2}` (20) → `top`. Then a tie case: top `{0,-2,4,2}` (8) and right `{10,0,2,4}` (8),
     left/bottom 20 → `top` (order breaks the tie). Assert `overlapArea` per band too.
   - **Touching vs gap:** a left neighbour flush at gap 0 (`{-5,0,5,10}`) blocks left; at gap exactly
     `band` (`{-7,0,5,10}`) left is free; at gap `band+1` free; at gap `band-1` (`{-6,0,5,10}`) blocked.
     A neighbour meeting only the map's top-left corner (`{-5,-5,5,5}`) blocks nothing → `left`.
   - `bandRect` exact rects for all four sides.
   - `borderSideFromConnections`: `{north,south}` → `left`; `{west,east}` → `top`; `{north,east}` →
     `left`; `{west}` → `top`; `{west,north,east}` → `bottom`; all four → `left`; empty → `left`.
   Implement. Commit.
2. `packages/ui/test/encounters/borderSide.corpus.test.ts` with `// @vitest-environment node` as the
   first line, `itWithGbcCorpus` from `../../../core/test/gbc/helpers/corpus.js`:
   - `buildGbcWorld(openGbcProject(GBC_SUBJECT_ROOT))`; neighbours = every other placement.
   - NewBarkTown → `top`; also assert the measured overlaps (left 18, right 18, top 0, bottom 0) so a
     drifted corpus fails loudly with numbers, not just a side.
   - Route30 → `left` (top 20, bottom 20, left 0).
   If either measured value differs on your run, stop and report (NEEDS_CONTEXT); don't re-pin silently.
   Commit.
3. Gate: `npm test` (baseline + B1 + new; known flake `WorldCanvas.test.tsx` "pans/zooms to the given
   map's real placement…": rerun isolated if it is the only failure), `npm run typecheck`,
   `npx vite build packages/ui`.

## Mutations the reviewers will run
- Side order swapped (e.g. `top` before `left`) → user-example tests red.
- Closed-interval overlap (`>=` instead of `>`) → corner and gap = band tests red, NewBarkTown red.
- Fallback picks the **largest** overlap, or ignores `SIDE_ORDER` on ties → the exact fixtures red.
- `borderSideFromConnections` maps `north` to `bottom` → red.

## Report
`task-B2-implementer.md` in this folder: commits, counts, gate, deviations. B2 edits no existing test.
