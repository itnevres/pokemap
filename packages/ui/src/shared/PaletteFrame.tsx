import type { ReactNode } from "react";
import { FollowHoverSwitch } from "./FollowHoverSwitch.js";

/** Uppercase hex, as both palettes' Selection captions show it. */
export const paletteHex = (n: number) => `0x${n.toString(16).toUpperCase()}`;

export interface PaletteFrameProps {
  /** The family's root class FIRST (`metatile-palette`, `gbc-metatile-palette`): the rail CSS and tests read it. */
  className: string;
  caption?: ReactNode;
  selection: ReactNode;
  query: string;
  onQuery(q: string): void;
  follow: boolean;
  onFollow(on: boolean): void;
  children: ReactNode;
}

/** Plan 9 addendum R-F5: the pinned header (caption, Selection, search, Follow hover) never scrolls; only
 *  `.palette__scroll` does, so Follow hover's `scrollIntoView({ block: "nearest" })` moves only the grid. */
export function PaletteFrame({ className, caption, selection, query, onQuery, follow, onFollow, children }: PaletteFrameProps) {
  return (
    <div className={`${className} palette`}>
      <div className="palette__pinned">
        {caption !== undefined && <div className="palette__caption">{caption}</div>}
        {selection}
        <input className="palette__search" placeholder="Search by hex id…" value={query} onChange={(e) => onQuery(e.target.value)} />
        <FollowHoverSwitch on={follow} onChange={onFollow} />
      </div>
      <div className="palette__scroll">{children}</div>
    </div>
  );
}

export interface PaletteSelectionProps {
  /** Row-major ids of the current stamp, `null` for a hole; empty = nothing picked. */
  cells: readonly (number | null)[];
  width: number;
  src(id: number): string;
  cellPx: number;
}

/** Plan 9 addendum R-F6: the picked stamp at palette scale, cells abutting. */
export function PaletteSelection({ cells, width, src, cellPx }: PaletteSelectionProps) {
  const first = cells.find((c): c is number => c !== null);
  const height = width > 0 ? Math.ceil(cells.length / width) : 0;
  const caption = first === undefined ? "Nothing picked" : cells.length === 1 ? paletteHex(first) : `${width}x${height} from ${paletteHex(first)}`;
  return (
    <figure className="palette__selection" aria-label="Selection">
      <figcaption className="palette__selection-caption">Selection · {caption}</figcaption>
      {first !== undefined && (
        <div className="palette__selection-grid" style={{ gridTemplateColumns: `repeat(${width}, ${cellPx}px)` }}>
          {cells.map((id, i) =>
            id === null ? (
              <span key={i} className="palette__selection-hole" style={{ width: cellPx, height: cellPx }} />
            ) : (
              <img key={i} src={src(id)} alt="" width={cellPx} height={cellPx} draggable={false} />
            ),
          )}
        </div>
      )}
    </figure>
  );
}
