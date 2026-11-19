import { useState, type MouseEvent } from "react";

export function TilePicker({ url, tileIds, reservedTiles = [], digits, selected, onSelect, disabled = false }: {
  url: string; tileIds: (number | null)[]; reservedTiles?: number[]; digits: number;
  selected: number | null; onSelect(index: number | null): void; disabled?: boolean;
}) {
  const [size, setSize] = useState<{ width: number; height: number }>();
  const [hover, setHover] = useState("");
  const reserved = (tile: number | null) => tile !== null && reservedTiles.includes(tile);
  const indexAt = (event: MouseEvent<HTMLImageElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    if (x < 0 || x >= 256 || y < 0) return -1;
    const index = Math.floor(y / 16) * 16 + Math.floor(x / 16);
    return index < tileIds.length ? index : -1;
  };
  const overlayStyle = (index: number) => ({ left: index % 16 * 16, top: Math.floor(index / 16) * 16 });
  return <div className="block-editor__picker">
    <div className="block-editor__sheet" style={size}>
      <img alt="Tile sheet" src={url} style={size} onLoad={event => setSize({ width: event.currentTarget.naturalWidth * 2, height: event.currentTarget.naturalHeight * 2 })}
        onClick={event => {
          if (disabled) return;
          const index = indexAt(event), tile = tileIds[index];
          if (tile === undefined || tile === null || reserved(tile)) return;
          onSelect(index === selected ? null : index);
        }} onMouseMove={event => {
          const tile = tileIds[indexAt(event)];
          setHover(tile === undefined || tile === null ? "" : reserved(tile) ? "Reserved at run time" : `Tile: $${tile.toString(16).toUpperCase().padStart(digits, "0")}`);
        }} onMouseLeave={() => setHover("")} />
      {tileIds.map((tile, index) => reserved(tile) ? <div key={index} className="block-editor__reserved" title="Reserved at run time" style={overlayStyle(index)} /> : null)}
      {selected !== null && <div className="block-editor__selected" style={overlayStyle(selected)} />}
    </div>
    <div className="block-editor__hover" data-testid="block-editor-hover">{hover}</div>
  </div>;
}
