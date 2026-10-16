import type { ReactNode } from "react";

export interface FoldedGridProps {
  /** Rows of ids in tileset order (`chunkRows`). */
  rows: readonly (readonly number[])[];
  /** First row of the right column (`pickFold`); `>= rows.length` renders one column. */
  fold: number;
  columns: number;
  cellPx: number;
  /** The family's grid class (`metatile-palette__grid`, `gbc-metatile-palette__grid`). */
  className: string;
  groupLabel?: string;
  /** Returns one keyed element per id. */
  renderCell(id: number): ReactNode;
}

/** Plan 9 addendum R-F2: two newspaper columns of whole rows; never re-flows a row. */
export function FoldedGrid({ rows, fold, columns, cellPx, className, groupLabel, renderCell }: FoldedGridProps) {
  const column = (part: readonly (readonly number[])[], side: "left" | "right") => (
    <div className={`palette__column palette__column--${side}`} style={{ gridTemplateColumns: `repeat(${columns}, ${cellPx}px)` }}>
      {part.flat().map((id) => renderCell(id))}
    </div>
  );
  const right = rows.slice(fold);
  return (
    <div className={`${className} palette__grid`} {...(groupLabel ? { role: "group", "aria-label": groupLabel } : {})}>
      {column(rows.slice(0, fold), "left")}
      {right.length > 0 && column(right, "right")}
    </div>
  );
}
