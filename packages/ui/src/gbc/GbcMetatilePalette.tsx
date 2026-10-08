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
 * `role="list"`/`role="listitem"` (fix round, quality review finding 5): an
 * `aria-label` on a plain, role-less `<div>` is not reliably announced by a
 * screen reader as part of a collection -- with these roles, a reader can
 * announce "list, N items" and treat each cell's `aria-label` as a real list
 * item's accessible name, not N unrelated labelled images in sequence.
 */
export function GbcMetatilePalette({ mapName, time, tilesetName, metatileCount, highlightId = null, onSelect, selected = null }: GbcMetatilePaletteProps) {
  const cellRefs = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    if (highlightId === null) return;
    cellRefs.current.get(highlightId)?.scrollIntoView({ block: "nearest" });
  }, [highlightId]);

  const ids = Array.from({ length: metatileCount }, (_, i) => i);

  return (
    <aside className="gbc-metatile-palette">
      <div className="gbc-metatile-palette__header">
        {tilesetName} · {metatileCount} metatiles
      </div>
      <div className="gbc-metatile-palette__grid" role="list">
        {ids.map((id) => {
          const hovered = id === highlightId;
          const picked = id === selected;
          const pick = () => onSelect?.({ width: 1, height: 1, cells: [{ metatileId: id }] });
          return (
            <div
              key={id}
              ref={(el) => {
                if (el) cellRefs.current.set(id, el);
                else cellRefs.current.delete(id);
              }}
              role="listitem"
              className={`gbc-metatile-palette__cell${hovered ? " gbc-metatile-palette__cell--selected" : ""}${picked ? " gbc-metatile-palette__cell--picked" : ""}`}
              aria-label={`metatile ${hex(id)}`}
              aria-current={hovered || picked ? "true" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onClick={onSelect ? pick : undefined}
              onKeyDown={onSelect ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } } : undefined}
            >
              <img
                className="gbc-metatile-palette__thumb"
                src={`/api/metatile/${encodeURIComponent(mapName)}/${id}.png?time=${time}`}
                alt=""
                width={32}
                height={32}
                loading="lazy"
              />
            </div>
          );
        })}
      </div>
    </aside>
  );
}
