import { Fragment, useMemo, useState } from "react";
import type { Split } from "@pokemap/core/src/model/types.js";
import type { Stamp, StampCell } from "@pokemap/core/src/edit/paint.js";

export interface MetatilePaletteProps {
  layoutName: string;
  split: Split;
  primaryCount: number;
  secondaryCount: number;
  onSelect(stamp: Stamp): void;
  /** Overrides the rendered id set with a single contiguous `0..N-1` range
   *  -- ONLY meaningful for exercising the out-of-range gap between a
   *  tileset's REAL count and the split boundary (ids `primaryCount` up to
   *  `split.metatiles`), which the default (no `visibleCount`) never
   *  renders at all: a real palette shows exactly the metatiles that
   *  exist (`primaryCount` real primary ids, then `secondaryCount` real
   *  secondary ids starting at `split.metatiles`) -- there is nothing
   *  useful to browse in the unused split-only gap in normal use, and
   *  rendering it by default would mean a grid of hundreds of blank
   *  disabled cells on every real layout. `visibleCount` exists so a test
   *  (or a future "show me the raw split range" debug view) can force
   *  rendering into that gap on demand; production code never passes it. */
  visibleCount?: number;
  columns?: number;
}

const hex = (n: number) => `0x${n.toString(16).toUpperCase()}`;

/**
 * Renders primary then secondary metatiles for the open layout's split,
 * with the boundary drawn as a visible divider naming the actual number
 * (split.metatiles) and the layout's own layout_version. An id past the
 * owning tileset's REAL count is struck through and not selectable -- the
 * Saffron_Temp situation (a split-legal, tileset-illegal id) becomes
 * visibly impossible to repeat, matching this project's own reason to
 * exist rather than just describing it.
 */
export function MetatilePalette({
  layoutName, split, primaryCount, secondaryCount, onSelect, visibleCount, columns = 8,
}: MetatilePaletteProps) {
  const [query, setQuery] = useState("");
  const [dragStart, setDragStart] = useState<number | null>(null);

  /** Default: exactly the ids that REALLY exist -- primary 0..primaryCount-1,
   *  then secondary split.metatiles..split.metatiles+secondaryCount-1 -- so
   *  a real layout (e.g. primaryCount=512, secondaryCount=100) renders 612
   *  cells, not `split.metatiles + secondaryCount` (up to 740) worth of
   *  mostly-empty, mostly-disabled space for a gap nobody needs to browse.
   *  `visibleCount`, when given, replaces this with a single raw `0..N-1`
   *  range instead (see its own doc comment on `MetatilePaletteProps`). */
  const ids = useMemo(() => {
    if (visibleCount !== undefined) return Array.from({ length: visibleCount }, (_, i) => i);
    const primary = Array.from({ length: primaryCount }, (_, i) => i);
    const secondary = Array.from({ length: secondaryCount }, (_, i) => split.metatiles + i);
    return [...primary, ...secondary];
  }, [visibleCount, primaryCount, secondaryCount, split.metatiles]);

  const isOutOfRange = (id: number): boolean =>
    id < split.metatiles ? id >= primaryCount : id >= split.metatiles + secondaryCount;

  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? ids.filter((id) => hex(id).toLowerCase().includes(normalizedQuery))
    : ids;

  const selectSingle = (id: number) => {
    if (isOutOfRange(id)) return;
    onSelect({ width: 1, height: 1, cells: [{ metatileId: id }] });
  };

  /**
   * Review fix: this used to derive row/col straight from the raw
   * `metatileId` (`id % columns`, `Math.floor(id / columns)`), which is
   * only valid when the id space is a gapless 0..N-1 run. It never is --
   * `ids` jumps from `primaryCount-1` straight to `split.metatiles` (e.g.
   * 511 -> 640), and the same problem hits whenever a search filter is
   * active (the visible list becomes non-contiguous by value in general).
   * Confirmed live: dragging from id 511 to id 640 -- adjacent cells on
   * screen, one primary/secondary boundary apart -- produced a stamp
   * spanning ids 504-647 (144 cells), none of which the user could see or
   * intended to select.
   *
   * Fixed by deriving the drag rectangle from each cell's INDEX within the
   * currently rendered `visible` array (its actual on-screen grid
   * position), not from its raw id. Adjacent visual cells are adjacent
   * INDICES even when their raw ids jump, so a boundary-crossing drag now
   * naturally produces a small rect, and a drag under an active search
   * filter operates against what's actually on screen instead of the full
   * unfiltered id space. `visible[index]` can legitimately be missing (a
   * short trailing row) or out-of-range (still possible when `visibleCount`
   * forces the raw split-only gap into view) -- either is skipped rather
   * than producing a garbage cell, mirroring how `paintCells` (core/edit/
   * paint.ts) already tolerates a missing stamp cell by skipping it.
   */
  const selectRect = (startId: number, endId: number) => {
    const startIndex = visible.indexOf(startId);
    const endIndex = visible.indexOf(endId);
    if (startIndex === -1 || endIndex === -1) return; // stale endpoint (e.g. the filter changed mid-drag) -- nothing sane to select
    const startCol = startIndex % columns, startRow = Math.floor(startIndex / columns);
    const endCol = endIndex % columns, endRow = Math.floor(endIndex / columns);
    const x0 = Math.min(startCol, endCol), x1 = Math.max(startCol, endCol);
    const y0 = Math.min(startRow, endRow), y1 = Math.max(startRow, endRow);
    const width = x1 - x0 + 1, height = y1 - y0 + 1;
    const cells: StampCell[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const id = visible[y * columns + x];
        if (id === undefined || isOutOfRange(id)) continue;
        cells[(y - y0) * width + (x - x0)] = { metatileId: id };
      }
    }
    onSelect({ width, height, cells });
  };

  return (
    <div className="metatile-palette">
      <input
        className="metatile-palette__search"
        placeholder="Search by hex id…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="metatile-palette__grid" style={{ gridTemplateColumns: `repeat(${columns}, auto)` }}>
        {visible.map((id) => {
          const outOfRange = isOutOfRange(id);
          const atBoundary = id === split.metatiles;
          return (
            <Fragment key={id}>
              {atBoundary && (
                <div className="metatile-palette__boundary">
                  primary {split.metatiles} · secondary starts here · {split.version}
                </div>
              )}
              <button
                type="button"
                aria-label={`metatile ${hex(id)}`}
                className={`metatile-palette__cell${outOfRange ? " metatile-palette__cell--out-of-range" : ""}`}
                disabled={outOfRange}
                // Split three ways, not two: `onMouseDown`/`onMouseUp` alone
                // detect a drag-rect (down on one cell, up on another) but
                // never fire for a keyboard Enter/Space activation -- a
                // focused <button> answers keyboard activation with a lone
                // `click` event, no preceding mousedown/mouseup at all. Real
                // browsers also never fire `click` when a mousedown/mouseup
                // pair lands on two different elements (an actual drag), so
                // `onClick`'s own `selectSingle` and `onMouseUp`'s
                // `selectRect` never both fire for the same gesture: a
                // same-cell mouse press+release reaches `onClick` only
                // (mouseup's own branch below is a no-op there), a genuine
                // cross-cell drag reaches `onMouseUp` only, and a keyboard
                // press reaches `onClick` only, having triggered no mouse
                // events at all.
                onMouseDown={() => setDragStart(id)}
                onMouseUp={() => {
                  if (dragStart !== null && dragStart !== id) selectRect(dragStart, id);
                  setDragStart(null);
                }}
                onClick={() => selectSingle(id)}
              >
                <img className="metatile-palette__thumb" src={`/api/metatile/${encodeURIComponent(layoutName)}/${id}.png`} alt="" width={16} height={16} />
              </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
