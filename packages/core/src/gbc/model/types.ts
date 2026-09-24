/**
 * A GBC block is a single metatile placement: one byte, the metatile id.
 * Unlike GBA's `Block` (packages/core/src/model/types.ts), there is no
 * per-block collision or elevation bit -- collision in Crystal is a
 * per-tileset property, 4 quadrants (TL/TR/BL/BR) per metatile, defined in
 * `data/tilesets/<name>_collision.asm` (GBC format findings §3.2/§3.3). Do
 * not reuse GBA's `Block` shape here; it would silently invent fields this
 * format has no bits for.
 */
export interface Block {
  metatileId: number;
}

/**
 * A metatile is a 4x4 grid of tile ids, row-major, 16 entries, with no
 * attribute bits (GBC format findings §3.2). Palette and VRAM bank come from
 * the tileset's palette map, not from here.
 */
export interface Metatile {
  tiles: number[];
}
