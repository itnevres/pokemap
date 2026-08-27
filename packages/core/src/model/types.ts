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
