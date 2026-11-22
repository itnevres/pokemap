/**
 * Plan 14.2's block-editor contracts. Nothing here owns state: an overlay is a
 * value a caller stages on a project object, and a refusal is a thrown value.
 */

/**
 * Why a block edit was refused. Routes answer 409 with the matching
 * `{ error, code }` body; core callers catch `BlockEditRefusal` itself.
 */
export type BlockEditCode =
  | "BLOCK_CAP"
  | "SHARED_GRID"
  | "NO_FREE_TILE"
  | "RESERVED_TILE"
  | "LOCAL_SHEET_MISMATCH"
  | "ALL_WITH_SAVE_AS_NEW"
  | "NOT_OWNER"
  | "FILE_CHANGED"
  | "STALE"
  | "UNSAVED_BLOCK"
  | "TRIPLE_LAYER"
  | "SPLIT_LIMIT"
  | "BAD_VALUE"
  | "RESERVATIONS_UNREADABLE";

/**
 * One tileset file staged by a block edit, identified by its resolved
 * repo-relative path (forward slashes) -- never by tileset name, because
 * tilesets alias files (PerfPlus' Cave and DarkCave share `cave_metatiles.bin`).
 *
 * `before` is the baseline the owner first staged this path at and is kept
 * across that owner's later edits of the same path; `after` is the current
 * staged bytes. Undo/redo and the Save-time fingerprint check compare against
 * `before`.
 */
export interface TilesetFileEdit {
  path: string;
  before: Buffer;
  after: Buffer;
}

/**
 * Core's one refusal shape. Routes map it to `{ error: message, code }` with
 * status 409; `message` starts with the subject (file, map or tile), e.g.
 * "forest_metatiles.bin: block cap 256 reached".
 */
export class BlockEditRefusal extends Error {
  readonly code: BlockEditCode;

  constructor(code: BlockEditCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BlockEditRefusal";
    this.code = code;
  }
}

/**
 * Staged bytes by resolved repo-relative file path. The project objects hold
 * one of these; tileset loaders consult it before touching disk. Replacing it
 * with an empty map restores what is on disk.
 */
export type FileOverlay = ReadonlyMap<string, Buffer>;

/**
 * The row-major metatile ids of one map's grid, as the session's block
 * objects carry them. A staged grid is keyed by map name (not by layout or
 * `.blk` path) -- that is what `Project.mapNames()` / `GbcProject.map()`
 * already answer, and one `.blk` may back several maps.
 */
export type GridIds = readonly number[];

export type StagedGrids = ReadonlyMap<string, GridIds>;

/** One grid file's use of the queried block (one entry per file, not per map). */
export interface MapUse {
  /** The alphabetically first consuming map backed by this grid file. */
  map: string;
  /** Cells of the file's effective grid whose raw id equals the queried id
   *  (GBA: summed over each distinct target id of the layouts on the file). */
  interior: number;
  /** GBC: number of consuming maps on the file whose header border is the
   *  queried id. GBA: border-bin cells matching it, per distinct border file. */
  border: number;
  /**
   * GBC only: for each consuming map whose border is the queried id (and the id
   * is not 0), the raw-0 cells of the grid (the engine draws a raw 0 as the
   * border), summed. Always 0 for GBA.
   */
  block0AsBorder: number;
}

export interface BlockUsage {
  /** Resolved files the block lives in / is described by (metatiles + collision, or metatiles + attributes). */
  files: string[];
  /** Tileset consts (GBC) or the one symbol (GBA) that consume the queried file. */
  tilesets: string[];
  maps: MapUse[];
  /** Grid files backing two or more maps, with every map name they back. */
  sharedGrids: { file: string; maps: string[] }[];
}

export interface BlockEditPlan {
  edits: TilesetFileEdit[];
  newBlockId?: number;
  placement?: { x: number; y: number; blockId: number };
  warnings: string[];
  usage: BlockUsage;
  confirm: boolean;
  revision: string;
}
