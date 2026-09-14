import { Fragment, useMemo, useState } from "react";
import type { Split } from "@pokemap/core/src/model/types.js";
import type { Stamp } from "@pokemap/core/src/edit/paint.js";

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

  const visible = query.trim()
    ? ids.filter((id) => hex(id).toLowerCase().includes(query.trim().toLowerCase()))
    : ids;

  const selectSingle = (id: number) => {
    if (isOutOfRange(id)) return;
    onSelect({ width: 1, height: 1, cells: [{ metatileId: id }] });
  };

  const selectRect = (startId: number, endId: number) => {
    const startCol = startId % columns, startRow = Math.floor(startId / columns);
    const endCol = endId % columns, endRow = Math.floor(endId / columns);
    const x0 = Math.min(startCol, endCol), x1 = Math.max(startCol, endCol);
    const y0 = Math.min(startRow, endRow), y1 = Math.max(startRow, endRow);
    const width = x1 - x0 + 1, height = y1 - y0 + 1;
    const cells = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push({ metatileId: y * columns + x });
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
                <div className="metatile-palette__boundary" style={{ gridColumn: `1 / -1` }}>
                  primary {split.metatiles} · secondary starts here · {split.version}
                </div>
              )}
              <button
                type="button"
                role="button"
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
