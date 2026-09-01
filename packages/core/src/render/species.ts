import { existsSync, readFileSync } from "node:fs";
import type { Project } from "../project.js";
import { readIndexedPng } from "../load/png.js";
import { parseJascPal } from "../load/pal.js";
import { createRaster, type Raster } from "./raster.js";

export interface SpeciesIconOptions {
  /** "icon" is the dex icon; "overworld" is the sprite a wild sign displays. */
  source?: "icon" | "overworld";
  /** Which animation frame of the sheet to take. */
  frame?: number;
}

export const speciesToDirName = (species: string): string =>
  species.replace(/^SPECIES_/, "").toLowerCase();

/**
 * Icon sheets are indexed PNGs with their palette in the PLTE chunk; the
 * separate normal.pal is used when present, since that is the committed source.
 */
export function renderSpeciesIcon(proj: Project, species: string, opts: SpeciesIconOptions = {}): Raster | undefined {
  const dir = speciesToDirName(species);
  const path = opts.source === "overworld" ? proj.paths.monOverworldPng(dir) : proj.paths.monIconPng(dir);
  if (!existsSync(path)) return undefined;

  const img = readIndexedPng(readFileSync(path));
  const frame = opts.frame ?? 0;
  const size = opts.source === "overworld" ? Math.min(img.height, 32) : 32;

  const palPath = `${proj.paths.root}/graphics/pokemon/${dir}/normal.pal`;
  const palette = existsSync(palPath) ? parseJascPal(readFileSync(palPath, "utf8")) : img.palette;

  const dst = createRaster(size, size);
  const sx = opts.source === "overworld" ? frame * size : 0;
  const sy = opts.source === "overworld" ? 0 : frame * size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (sx + x >= img.width || sy + y >= img.height) continue;
      const idx = img.indices[(sy + y) * img.width + (sx + x)]!;
      if (idx === 0) continue;
      const c = palette[idx];
      if (!c) continue;
      const di = (y * size + x) * 4;
      dst.data[di] = c.r; dst.data[di + 1] = c.g; dst.data[di + 2] = c.b; dst.data[di + 3] = 255;
    }
  }

  return dst;
}
