import { useEffect, useRef } from "react";
import type { GbcStamp } from "@pokemap/core/src/gbc/edit/paint.js";
import type { GbcTimeOfDay } from "./time.js";

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
 */
export function GbcMetatilePalette({ mapName, time, tilesetName, metatileCount, highlightId = null, onSelect, selected = null }: GbcMetatilePaletteProps) {
  const cellRefs = useRef(new Map<number, HTMLButtonElement>());

  useEffect(() => {
    if (highlightId === null) return;
    cellRefs.current.get(highlightId)?.scrollIntoView({ block: "nearest" });
  }, [highlightId]);

  const ids = Array.from({ length: metatileCount }, (_, i) => i);
  // One handler for all cells (the id rides on `data-id`), not 500+ closures rebuilt on every hover re-render.
  const pick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onSelect?.({ width: 1, height: 1, cells: [{ metatileId: Number(e.currentTarget.dataset.id) }] });
  };

  return (
    <aside className="gbc-metatile-palette">
      <div className="gbc-metatile-palette__header">
        {tilesetName} · {metatileCount} metatiles
      </div>
      <div className="gbc-metatile-palette__grid" role="group" aria-label="Metatiles">
        {ids.map((id) => {
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
                src={`/api/metatile/${encodeURIComponent(mapName)}/${id}.png?time=${time}`}
                alt=""
                width={32}
                height={32}
                loading="lazy"
              />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
