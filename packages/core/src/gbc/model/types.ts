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
 * One tile's palette-map entry (GBC format findings §3.4 step 6 / §3.2):
 * `bank` is the VRAM bank bit (0 or 1, from the palette-map nibble's bit 3),
 * `pal` is a `PAL_BG_*` index (0-7). `null` means the tile id has no
 * palette-map entry at all -- the `$60-$7F` `rept 16 / db $ff` filler range,
 * which only ever appears in never-placed garbage metatiles.
 */
export interface PaletteMapEntry {
  bank: number;
  pal: number;
}

/**
 * One metatile's 4 collision quadrants, top-left/top-right/bottom-left/
 * bottom-right (GBC format findings §3.3), as the numeric `COLL_*` values
 * from `constants/collision_constants.asm` -- never the source token text.
 */
export interface Collision {
  tl: number;
  tr: number;
  bl: number;
  br: number;
}

/**
 * One tileset's data, map-agnostic (no roof handling -- that is Task 9's
 * per-map render). Resolved entirely through the `Tilesets::` table and the
 * stacked GFX/Meta/Coll/PalMap labels (I4 -- never by name-mangling), so
 * aliases resolve correctly: `Tileset0`/`TilesetJohto` share `gfxPath`,
 * `TilesetDarkCave` shares `TilesetCave`'s metatiles/collision/palette map
 * but not its GFX, and the 5 "word room" tilesets share
 * `TilesetRuinsOfAlph`'s palette map (GBC format findings, "Extra findings"
 * -> Tileset graphics / Map header and tileset assignment).
 */
export interface GbcTileset {
  /** The `TILESET_*` constant this was loaded by, e.g. "TILESET_JOHTO".
   *  When loaded by table name directly (`loadGbcTilesetByName`) with no
   *  matching constant -- Tileset0's real situation -- this is just `name`. */
  constName: string;
  /** The `Tilesets::` table entry name, e.g. "TilesetJohto". */
  name: string;
  /** Repo-relative path to the tileset's source PNG (never the gitignored
   *  `.2bpp.lz` build artifact -- I3). */
  gfxPath: string;
  metatilesPath: string;
  collisionPath: string;
  palMapPath: string;
  metatiles: Metatile[];
  /** Numeric COLL_* values, one per metatile, length === metatiles.length
   *  (extra source lines beyond the metatile count, e.g. forest's 64 lines
   *  for 40 metatiles, are trimmed, never exposed or refused). */
  collision: Collision[];
  /** Per raw tile id (0-223), `null` for the $60-$7F filler range. */
  palMap: (PaletteMapEntry | null)[];
  /** One `Uint8Array(64)` per PNG tile (row-major, 16 per PNG row), each
   *  entry a shade 0-3 (GBC format findings, "Tileset graphics"). */
  tiles: Uint8Array[];
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

/**
 * One `warp_event` line from a map's `<Name>_MapEvents:` section (GBC format
 * findings §3.1: `warp_event x, y, MAP_CONST, destWarp`). `destWarp` is
 * 1-based; `-1` means "return to the previous map's warp" (6 events across 4
 * maps in the corpus). `mapConst` is the raw `MAP_CONST` text -- resolving it
 * against a `GbcMap.constName` is the caller's job, not this loader's.
 */
export interface GbcWarpEvent {
  x: number;
  y: number;
  mapConst: string;
  destWarp: number;
  lineIndex: number;
}

/** `coord_event x, y, SCENE_*, scriptLabel` (GBC format findings §3.1). */
export interface GbcCoordEvent {
  x: number;
  y: number;
  sceneConst: string;
  script: string;
  lineIndex: number;
}

/** `bg_event x, y, BGEVENT_*, scriptLabel` (GBC format findings §3.1). */
export interface GbcBgEvent {
  x: number;
  y: number;
  bgEventType: string;
  script: string;
  lineIndex: number;
}

/**
 * One `object_event` line, 13 args (GBC format findings §3.1). `hour1`/
 * `hour2` are kept as raw expressions, never parsed as numbers: `hour1` is
 * always `-1` in the corpus, but its pair `hour2` is sometimes a `DAY`/
 * `MORN`/`NITE` flag rather than a number (11 of 1468 objects), so the pair
 * is stored together as text rather than split into a numeric field and a
 * string field. `palette` (`PAL_NPC_*` or `0`) and `eventFlag` (`EVENT_*` or
 * `-1`) are likewise mixed numeric/identifier across the corpus and kept
 * raw for the same reason.
 */
export interface GbcObjectEvent {
  x: number;
  y: number;
  sprite: string;
  moveData: string;
  radiusX: number;
  radiusY: number;
  hour1: string;
  hour2: string;
  palette: string;
  objectType: string;
  sightRange: number;
  script: string;
  eventFlag: string;
  lineIndex: number;
}

/** `scene_script scriptLabel[, SCENE_const]` -- the SCENE_const is optional (1 or 2 args in the corpus). */
export interface GbcSceneScript {
  script: string;
  sceneConst: string | null;
  lineIndex: number;
}

/** `callback MAPCALLBACK_*, scriptLabel` (GBC format findings §3.1). */
export interface GbcCallback {
  callbackConst: string;
  script: string;
  lineIndex: number;
}

/**
 * One map's full event/script set (GBC format findings §3.1). `warps`/
 * `coords`/`bgs`/`objects` come from the `<Name>_MapEvents:` section;
 * `sceneScripts`/`callbacks` come from the `<Name>_MapScripts:` section.
 * Each array's order is source order -- the same ordinal Plan 7's splicer
 * (`../write/asmSplice.ts`'s `locateEventCall`) addresses events by, so
 * callers must never resort these arrays. `objectConsts` are the
 * `const NAME` lines immediately following `object_const_def` at the top of
 * the file (absent -> `[]`); its length need not equal `objects.length` --
 * see `loadGbcMapEvents`'s defect handling in `../load/events.ts`.
 */
export interface GbcMapEvents {
  warps: GbcWarpEvent[];
  coords: GbcCoordEvent[];
  bgs: GbcBgEvent[];
  objects: GbcObjectEvent[];
  sceneScripts: GbcSceneScript[];
  callbacks: GbcCallback[];
  objectConsts: string[];
}
