import { readFileSync } from "node:fs";
import { maskShift, type EngineProfile } from "../config/engine.js";
import type { ProjectPaths } from "../config/paths.js";
import type { TilesetPaths } from "./tilesets.js";
import { readIndexedPng, type IndexedImage } from "./png.js";
import { parseJascPal } from "./pal.js";
import type { RGB } from "../model/types.js";

export interface TileEntry {
  tile: number;
  xFlip: boolean;
  yFlip: boolean;
  palette: number;
}

export interface Tileset {
  symbol: string;
  isSecondary: boolean;
  metatileCount: number;
  tiles: IndexedImage;
  palettes: RGB[][];
  attributes: number[];
  metatile(id: number): TileEntry[];
  layerType(id: number): number;
  behavior(id: number): number;
}

const TILES_PER_METATILE = 8;

export function loadTileset(paths: ProjectPaths, tp: TilesetPaths, profile: EngineProfile): Tileset {
  const abs = (rel: string) => `${paths.root}/${rel}`;

  const metatilesBuf = readFileSync(abs(tp.metatilesBin));
  const metatileCount = metatilesBuf.length / (TILES_PER_METATILE * 2);

  const attrBuf = readFileSync(abs(tp.attributesBin));
  const size = profile.metatileAttributesSize;
  const attributes: number[] = [];
  for (let i = 0; i + size <= attrBuf.length; i += size) {
    attributes.push(size === 2 ? attrBuf.readUInt16LE(i) : attrBuf.readUInt32LE(i));
  }

  const tiles = readIndexedPng(readFileSync(abs(tp.tilesPng)));

  // I3: read the committed .pal, not the gitignored .gbapal that graphics.h INCBINs.
  //
  // Pad to 16. A GBA palette bank is always 16 entries, but gbagfx's
  // WriteGbaPalette emits only as many as the .pal declares, and two files here
  // declare fewer: secondary/barn/palettes/09.pal has 10 colours and
  // secondary/cianwood_city/palettes/09.pal has 15. Both are reachable -- 12
  // and 126 metatile tile-entries respectively select palette index 9 -- so
  // without padding, palette[idx] is undefined for the missing indices and
  // drawTile skips the pixel, punching holes in the map rather than erroring.
  const palettes = tp.palettes.map((g) => {
    const pal = parseJascPal(readFileSync(abs(g.replace(/\.gbapal$/, ".pal")), "utf8"));
    while (pal.length < 16) pal.push({ r: 0, g: 0, b: 0 });
    return pal;
  });

  const layerShift = maskShift(profile.metatileLayerTypeMask);

  return {
    symbol: tp.symbol,
    isSecondary: tp.isSecondary,
    metatileCount,
    tiles,
    palettes,
    attributes,
    metatile(id) {
      const base = id * TILES_PER_METATILE * 2;
      const out: TileEntry[] = [];
      for (let i = 0; i < TILES_PER_METATILE; i++) {
        const e = metatilesBuf.readUInt16LE(base + i * 2);
        out.push({
          tile: e & 0x3ff,
          xFlip: !!((e >> 10) & 1),
          yFlip: !!((e >> 11) & 1),
          palette: (e >> 12) & 0x0f,
        });
      }
      return out;
    },
    layerType: (id) => ((attributes[id] ?? 0) & profile.metatileLayerTypeMask) >>> layerShift,
    behavior: (id) => (attributes[id] ?? 0) & profile.metatileBehaviorMask,
  };
}
