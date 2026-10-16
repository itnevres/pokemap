import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { GbcStamp } from "@pokemap/core/src/gbc/edit/paint.js";
import type { GbcTimeOfDay } from "./time.js";
import { useFollowHover } from "../shared/useFollowHover.js";
import { chunkRows, pickFold } from "../shared/paletteFold.js";
import { useUniformRows, type ThumbSignature } from "../shared/useUniformRows.js";
import { PaletteFrame, PaletteSelection } from "../shared/PaletteFrame.js";
import { FoldedGrid } from "../shared/FoldedGrid.js";

export interface GbcMetatilePaletteProps {
  mapName: string;
  time: GbcTimeOfDay;
  tilesetName: string;
  metatileCount: number;
  /** The hovered block's metatile id (`GbcMapCanvas`'s own `hoveredMetatile`
   *  callback) -- `null` when nothing is hovered. Purely a visual echo, same
   *  controlled-prop shape as GBA's `MetatilePalette.selected`: this
   *  component never writes anything back. */
  highlightId?: number | null;
  /** Plan 7 Task 5: click (or Enter/Space) picks a cell as a 1x1 stamp. Absent: cells stay inert, as in 6b.
   *  No drag-select (YAGNI; GBA's is a later nicety). */
  onSelect?: (stamp: GbcStamp) => void;
  /** The picked metatile id. Visually distinct from the hover `highlightId`: the picked cell gets
   *  `--picked` (accent border) while the hover keeps its legacy `--selected` class, which existing tests pin. */
  selected?: number | null;
  /** Test seam for the fold's uniform-row check (Plan 9F); production uses the canvas pixel signature. */
  thumbSignature?: ThumbSignature;
}

const hex = (n: number) => `0x${n.toString(16)}`;

/**
 * A read-only grid of every metatile in the open map's tileset (Plan 6b Task
 * 4) -- `/api/metatile/:map/:id.png?time=` thumbnails at 32px, one per id
 * `0..metatileCount-1`. Unlike GBA's `MetatilePalette` (drag-select, search,
 * primary/secondary split), this never selects or writes anything: it only
 * highlights whichever id `GbcMapCanvas`'s hover already resolved, and
 * scrolls it into view.
 *
 * Scrolling is gated on `highlightId` alone in the effect's own dependency
 * list -- React only re-runs an effect when a listed dependency's value
 * actually changes, so `scrollIntoView` fires once per real highlight
 * change, never on an unrelated re-render (e.g. the app's time-of-day
 * toggle) that leaves `highlightId` the same primitive value.
 *
 * Cells are real `<button type="button" aria-pressed>` (Plan 7 Task 5 fix round; they were `role="listitem"`
 * with a tabindex, an interactive element under a non-interactive role). `aria-current` marks the PICKED cell
 * only; the hover echo is visual (`--selected`) so assistive tech does not announce a transient pointer position
 * as "current". Disabled when there is no `onSelect` (read-only), which also takes them out of the Tab order.
 * Deliberately always shown, unlike GBA's strip, which only mounts for pencil/rect/bucket: browsing the tileset
 * while read-only predates editing (6b) and hiding it would regress that.
 *
 * Plan 9F: on the shared PaletteFrame, rows of 4 (Polished Map's METATILES_PER_ROW) folded into two columns, with the hex search.
 */
/** Polished Map's fixed sidebar width (`main-window.h` METATILES_PER_ROW): the view Crystal blocksets are authored for. */
const GBC_ROW = 4;

// Memoised like MapTree (Plan 9 follow-up O2); GbcMapEditing passes a stable onSelect.
export const GbcMetatilePalette = memo(function GbcMetatilePalette({ mapName, time, tilesetName, metatileCount, highlightId = null, onSelect, selected = null, thumbSignature }: GbcMetatilePaletteProps) {
  const cellRefs = useRef(new Map<number, HTMLButtonElement>());
  const [follow, setFollow] = useFollowHover();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!follow || highlightId === null) return;
    cellRefs.current.get(highlightId)?.scrollIntoView({ block: "nearest" });
  }, [highlightId, follow]);

  const q = query.trim().toLowerCase();
  const searching = q !== "";
  const visible = useMemo(() => {
    const all = Array.from({ length: metatileCount }, (_, i) => i);
    return searching ? all.filter((id) => hex(id).includes(q)) : all;
  }, [metatileCount, searching, q]);
  const rows = useMemo(() => chunkRows(visible, GBC_ROW), [visible]);
  const src = (id: number) => `/api/metatile/${encodeURIComponent(mapName)}/${id}.png?time=${time}`;
  const { uniformRows, onThumbLoad, onThumbError } = useUniformRows(searching ? [] : rows, `${mapName}:${time}`, thumbSignature);
  const fold = searching ? rows.length : pickFold(rows.length, uniformRows);

  // One handler for all cells (the id rides on `data-id`), not 500+ closures rebuilt on every hover re-render.
  const pick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onSelect?.({ width: 1, height: 1, cells: [{ metatileId: Number(e.currentTarget.dataset.id) }] });
  };

  return (
    <PaletteFrame
      className="gbc-metatile-palette"
      caption={<span className="gbc-metatile-palette__header">{tilesetName} · {metatileCount} metatiles</span>}
      selection={<PaletteSelection cells={selected === null ? [] : [selected]} width={selected === null ? 0 : 1} src={src} cellPx={32} />}
      query={query}
      onQuery={setQuery}
      follow={follow}
      onFollow={setFollow}
    >
      <FoldedGrid
        rows={rows}
        fold={fold}
        columns={GBC_ROW}
        cellPx={32}
        className="gbc-metatile-palette__grid"
        groupLabel="Metatiles"
        renderCell={(id) => {
          const hovered = id === highlightId;
          const picked = id === selected;
          return (
            <button
              key={id}
              type="button"
              data-id={id}
              ref={(el) => {
                if (el) cellRefs.current.set(id, el);
                else cellRefs.current.delete(id);
              }}
              className={`gbc-metatile-palette__cell${hovered ? " gbc-metatile-palette__cell--selected" : ""}${picked ? " gbc-metatile-palette__cell--picked" : ""}`}
              aria-label={`metatile ${hex(id)}`}
              aria-pressed={picked}
              aria-current={picked ? "true" : undefined}
              disabled={!onSelect}
              onClick={pick}
            >
              <img
                className="gbc-metatile-palette__thumb"
                src={src(id)}
                alt=""
                width={32}
                height={32}
                draggable={false}
                onLoad={(e) => onThumbLoad(id, e.currentTarget)}
                onError={() => onThumbError(id)}
              />
            </button>
          );
        }}
      />
    </PaletteFrame>
  );
});
