/** Plan 9 addendum R-F3: the first row of the right-hand newspaper column. A candidate cut is the row after a
 *  uniform row, or `boundaryRow` (GBA's primary/secondary boundary). Nearest the middle wins, ties to the earlier; a candidate more than `rowCount / 4` rows from the middle is ignored
 *  (a far cut leaves one column nearly empty: GBA Route29's boundary sat at row 80 of 98);
 *  no candidate cuts at the middle. Returns `rowCount` (one column) when there are fewer than two rows. */
export function pickFold(rowCount: number, uniformRows: ReadonlySet<number>, boundaryRow?: number): number {
  if (rowCount < 2) return rowCount;
  const mid = rowCount / 2;
  const candidates = [...uniformRows].map((r) => r + 1);
  if (boundaryRow !== undefined) candidates.push(boundaryRow);
  const valid = candidates
    .filter((c) => c > 0 && c < rowCount && Math.abs(c - mid) <= rowCount / 4)
    .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  return valid[0] ?? Math.ceil(mid);
}

/** Rows of `width` items in order; the last row may be short. */
export function chunkRows<T>(items: readonly T[], width: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += width) rows.push(items.slice(i, i + width));
  return rows;
}
