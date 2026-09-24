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

/**
 * Shared warning shape for a recoverable data defect found while loading GBC
 * data (e.g. a `.blk` whose byte length disagrees with its declared
 * width x height). Loaders return these alongside their data -- they never
 * throw for a defect and never silently drop it. The CLI is responsible for
 * surfacing them to the user.
 */
export interface DataDefect {
  file: string;
  message: string;
}

/**
 * One `connection` line from `data/maps/attributes.asm`. The axis is the
 * reverse of the macro's own source comment (GBC format findings, "Extra
 * findings" -> Connections, engine-verified against `LoadMapConnections`):
 * a north/south connection's offset shifts the target along **x**; a
 * west/east connection's offset shifts it along **y**. Units are blocks.
 * `offset` is stored raw, exactly as written in source -- axis conversion to
 * world coordinates is Task 11's job, not this loader's.
 */
export interface Connection {
  direction: "north" | "south" | "west" | "east";
  targetName: string;
  targetConst: string;
  offset: number;
}

/**
 * One map's header + attributes + constants record (GBC format findings
 * §3.6). Deliberately excludes blockdata -- see `Layout`, which many maps
 * share (`maps/House1.blk` alone backs 50 maps). Fields documented in the
 * findings as "expressions, not bare words" (tileset/environment/landmark/
 * music/phoneFlag/palette/fishGroup) are kept as trimmed source text, never
 * bare-word matched, because real headers use compound expressions (e.g.
 * `RADIO_TOWER_MUSIC | MUSIC_GOLDENROD_CITY`).
 */
export interface GbcMap {
  name: string;
  constName: string;
  group: number;
  number: number;
  width: number;
  height: number;
  /** Repo-relative, e.g. "maps/House1.blk". */
  blkPath: string;
  tileset: string;
  environment: string;
  landmark: string;
  music: string;
  phoneFlag: string;
  palette: string;
  fishGroup: string;
  /** One metatile id (GBC format findings, "Extra findings" -> Border). */
  border: number;
  connectionFlags: string;
  connections: Connection[];
}

/**
 * A `.blk` file's decoded blockdata, keyed by its own repo-relative path
 * rather than by map -- `.blk` <-> map is NOT 1:1 (GBC format findings
 * §3.6). `writable` is false when, at load time, the file's byte length
 * disagreed with its declared width x height; Plan 7 must refuse writes to
 * such a layout.
 */
export interface Layout {
  blkPath: string;
  width: number;
  height: number;
  blocks: Block[];
  writable: boolean;
}
