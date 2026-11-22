export type LayoutVersion = "emerald" | "frlg" | "hns";

export interface Split {
  version: LayoutVersion;
  /** First tile index belonging to the secondary tileset. */
  tiles: number;
  /** First metatile id belonging to the secondary tileset. */
  metatiles: number;
  /** First palette index belonging to the secondary tileset. */
  pals: number;
}

/** A decomp-sourced path that leaves the project (D25). The owning layout or tileset cannot be rendered, edited or saved until it is fixed. */
export interface BrokenPath {
  file: string;
  /** 1-based line of the directive in `file`, when the loader knows it. */
  line?: number;
  key: string;
  path: string;
  message: string;
  fix: string;
}

export interface Layout {
  id: string;
  name: string;
  width: number;
  height: number;
  borderWidth: number;
  borderHeight: number;
  primaryTileset: string;
  secondaryTileset: string;
  borderFilepath: string;
  blockdataFilepath: string;
  layoutVersion?: LayoutVersion;
  brokenPaths?: BrokenPath[];
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface Block {
  metatileId: number;
  collision: number;
  elevation: number;
}
