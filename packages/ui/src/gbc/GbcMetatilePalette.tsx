import { useEffect, useRef } from "react";
import type { GbcTimeOfDay } from "./GbcMapCanvas.js";

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
 */
export function GbcMetatilePalette({ mapName, time, tilesetName, metatileCount, highlightId = null }: GbcMetatilePaletteProps) {
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
      <div className="gbc-metatile-palette__grid">
        {ids.map((id) => {
          const selected = id === highlightId;
          return (
            <div
              key={id}
              ref={(el) => {
                if (el) cellRefs.current.set(id, el);
                else cellRefs.current.delete(id);
              }}
              className={`gbc-metatile-palette__cell${selected ? " gbc-metatile-palette__cell--selected" : ""}`}
              aria-label={`metatile ${hex(id)}`}
              aria-current={selected ? "true" : undefined}
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
