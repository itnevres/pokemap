export function placeGroup(squares: readonly number[], width: number, at: { x: number; y: number }, selectedSheetIndex: number, mode: "1x1" | "2x2" | "4x4", sheetCount: number, sheetToTileId: (i: number) => number | null): number[] {
  const result = [...squares];
  const n = mode === "1x1" ? 1 : mode === "2x2" ? 2 : 4;
  const rows = squares.length / width;
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) {
    const x = at.x + dx;
    const y = at.y + dy;
    const source = selectedSheetIndex + dy * 16 + dx;
    if (x < 0 || y < 0 || x >= width || y >= rows ||
        selectedSheetIndex % 16 + dx >= 16 || source >= sheetCount) continue;
    const tile = sheetToTileId(source);
    if (tile !== null) result[y * width + x] = tile;
  }
  return result;
}
