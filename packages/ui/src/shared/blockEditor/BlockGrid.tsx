import type { MouseEvent } from "react";

export function BlockGrid({ tiles, width, digits, current, onSquare }: {
  tiles: number[]; width: number; digits: number; current: number;
  onSquare(index: number, event: MouseEvent<HTMLButtonElement>): void;
}) {
  return <div className="block-editor__grid" style={{ gridTemplateColumns: `repeat(${width}, 1fr)` }}>
    {tiles.map((tile, index) => <button type="button" key={index} aria-label={`Square ${index}`} aria-current={index === current ? "true" : undefined}
      onClick={event => onSquare(index, event)}>${tile.toString(16).toUpperCase().padStart(digits, "0")}</button>)}
  </div>;
}
