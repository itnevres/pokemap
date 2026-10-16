# Plan 9 addendum: Porymap-style metatile palette (follow-up F)

Addendum to `2026-10-14-pokemap-plan-9-family-shell-design.md`, "Unified edit layout (D4)". User rulings 2026-10-15.
Reference: `task-reports/pokemap-plan-9-family-shell/user-porymap-metatile-picker.png` (Porymap) and
`f-gbc-blockset-4-vs-8.png` (PerfPlus Goldenrod blockset at 4 and 8 per row).

## Goal
Both palettes (GBA `components/MetatilePalette.tsx`, GBC `gbc/GbcMetatilePalette.tsx`) look and behave alike: tiles
abut so structures read as they build together, the tileset's own row order is kept, the 260 px rail is filled, and
the selection preview, search and Follow hover never scroll away (final review m2).

## Rulings
- **R-F1 Row width = the tileset's authored width.** GBA 8 per row (Porymap). GBC 4 per row (Polished Map's fixed
  `METATILES_PER_ROW 4`; at 8 per row the Radio Tower's top and bottom sit side by side). Never re-flow.
- **R-F2 Two newspaper columns at 1x, both families.** GBA: 2 x (8 x 16 px) = 256 px. GBC: 2 x (4 x 32 px) = 256 px.
  The left column holds rows `[0, cut)`, the right column rows `[cut, rowCount)`.
- **R-F3 The fold (same rule both families).** Candidate cuts:
  - after any *uniform row*: every cell in the row is pixel-identical to the row's first cell (a blank row, or one
    repeated tile). The cut is the index of the next row.
  - GBA only: the primary/secondary boundary row (secondary starts on a fresh row, see below).

  Pick the candidate nearest `rowCount / 2` (tie: the earlier one). No candidate: cut at `ceil(rowCount / 2)`.
  `rowCount < 2`: one column. Uniform rows are judged from the loaded thumbnails (drawn to a canvas once each
  thumbnail loads); until they are known the fold uses the other candidates, then settles.
- **R-F4 No zoom control.**
- **R-F5 Pinned header, scrolling grid.** A shared frame holds, top to bottom and never scrolling: the Selection box,
  the hex-id search box (now in GBC too), and the Follow hover switch (GBC keeps its `<tileset> · <count> metatiles`
  line). Only the grid area below scrolls. Follow hover keeps `scrollIntoView({ block: "nearest" })`: with the header
  outside the scroller, the scroller is fully in view, so only the grid moves (checked live: rail and page scrollTop
  stay 0).
- **R-F6 Selection box** shows the current stamp at palette scale with abutting cells (GBA: the whole drag rect at
  16 px; GBC: one block at 32 px) and a caption `0x1A`, or `3x2 from 0x1A` for a multi-cell stamp. Empty: `Nothing
  picked`.
- **R-F7 Abutting cells.** No gap, border, radius or padding on grid cells. Highlights are drawn inside the cell, so they
  read on neighbours and can coexist: picked = `box-shadow: inset 0 0 0 2px var(--accent)`; hovered =
  `outline: 2px dashed var(--accent); outline-offset: -2px`. Focus-visible keeps a visible ring. Thumbnails
  `image-rendering: pixelated`.

## Shape
- `shared/PaletteFrame.tsx`: header slots (selection, search, switch, optional caption) + `.palette__scroll`.
  The rail rule targets the frame (`flex: 1; min-height: 0`).
- `shared/paletteFold.ts`: pure `pickFold(rowCount, uniformRows: ReadonlySet<number>, boundaryRow?: number): number`.
- `shared/useUniformRows.ts`: from loaded `<img>` cells, returns the set of uniform row indices. Injectable compare for
  tests (jsdom has no canvas pixels).
- GBA rows: primary ids `0..primaryCount-1` in rows of 8, then secondary from a fresh row (the primary/secondary divider
  stays, spanning its column). Drag-rect keeps logical tileset coordinates (row, col in the unfolded order).
  While a search filter is active: one column, plain 8-wide flow (no fold).
- GBC: rows of 4, fold as above; search filters by hex id, one column while active.
- Class names that tests pin stay (`metatile-palette__cell`, `--selected`, `--hovered`, `--out-of-range`,
  `gbc-metatile-palette__cell`, `--selected` (hover), `--picked`, the `role="group" aria-label="Metatiles"` grid).

## Testing
- `pickFold` table: middle uniform row, two candidates equidistant, boundary only, none (middle), rowCount 0/1.
- Each palette: header outside the scroller; two column elements with the right rows; search collapses to one column;
  Selection box contents and caption; GBC search filters.
- CSS pins in `styles.test.ts`: grid cells have no gap/border; picked/hovered use inset box-shadow / negative-offset
  outline.
- Every existing palette test keeps passing or is retargeted with a stated reason; none dropped.
- Live: both families at 1280 and 1024: two columns, 256 px, header stays put with Follow hover on a far id, rail/page
  scrollTop 0, structures intact in the screenshot.

## Out of scope
Zoom, a Border box, drag-select for GBC, persisting the fold.
