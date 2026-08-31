import { readFileSync } from "node:fs";
import type { Project } from "../project.js";
import { parseBlocks } from "../load/blocks.js";
import type { Split } from "../model/types.js";

export interface RangeFinding {
  kind: "metatile-range";
  layout: string;
  split: Split;
  /** Distinct offending metatile ids, with how often each appears. */
  ids: { id: number; count: number }[];
  source: "map" | "border";
}

export interface PaletteFinding {
  kind: "palette-range";
  tileset: string;
  /** Palette indices named by tile entries that this tileset has no .pal for. */
  indices: number[];
  /** How many tile entries name one of them. */
  entries: number;
}

export type Finding = RangeFinding | PaletteFinding;

/**
 * Port of tools/verify/check_metatile_range.py.
 *
 *   id <  split.metatiles   must be < the primary tileset's own count
 *   id >= split.metatiles   must be < split.metatiles + secondary count,
 *                           and inside NUM_METATILES_TOTAL -- the id field is
 *                           10 bits, so a 512-metatile secondary above a 640
 *                           split only ever exposes its first 384 entries.
 */
export function validateMetatileRange(proj: Project): RangeFinding[] {
  const out: RangeFinding[] = [];

  for (const layout of proj.layouts) {
    const split = proj.splitFor(layout);
    const primaryCount = proj.tileset(layout.primaryTileset).metatileCount;
    const secondaryCount = proj.tileset(layout.secondaryTileset).metatileCount;
    const ceiling = Math.min(split.metatiles + secondaryCount, proj.constants.metatilesTotal);

    const bad = (id: number) => (id < split.metatiles ? id >= primaryCount : id >= ceiling);

    for (const [source, file] of [["map", layout.blockdataFilepath], ["border", layout.borderFilepath]] as const) {
      const counts = new Map<number, number>();
      for (const b of parseBlocks(readFileSync(`${proj.paths.root}/${file}`), proj.profile)) {
        if (bad(b.metatileId)) counts.set(b.metatileId, (counts.get(b.metatileId) ?? 0) + 1);
      }
      if (counts.size) {
        out.push({
          kind: "metatile-range",
          layout: layout.name, split, source,
          ids: [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
        });
      }
    }
  }

  return out;
}

/**
 * The palette half of the same question, promised in this task's preamble and
 * previously not implemented anywhere.
 *
 * A tile entry's palette field is 4 bits, so it can name 0-15, but
 * NUM_PALS_TOTAL is 13 and most secondary tilesets INCBIN only 00-12 into their
 * gTilesetPalettes_ array. `renderMetatile`'s MISSING_PALETTE then resolves to
 * an empty list and `drawTile` skips every pixel, so those tiles come out as
 * transparent holes. On hardware they draw with whatever non-tileset palette is
 * resident in VRAM slots 13-15, which is not a colour this tool can know.
 *
 * So: report, do not repaint. Deciding what to draw instead is a parity
 * question that needs a Porymap build to compare against.
 *
 * This walks tilesets rather than blockdata, so it is cheap, and it is
 * split-independent: a secondary tileset's palettes are indexed absolutely, so
 * "does this tileset have a .pal at the index its own metatiles name" is the
 * whole question. Note `Tileset.palettes` comes from the INCBIN list, not from
 * the directory listing -- gTileset_DepartmentStore and gTileset_ShopRooftop
 * both ship 16 .pal files on disk while INCBINing only 00-12.
 */
export function validatePaletteRange(proj: Project): PaletteFinding[] {
  const out: PaletteFinding[] = [];

  for (const symbol of proj.tilesetSymbols()) {
    const ts = proj.tileset(symbol);
    const counts = new Map<number, number>();
    for (let m = 0; m < ts.metatileCount; m++) {
      for (const e of ts.metatile(m)) {
        if (ts.palettes[e.palette] === undefined) counts.set(e.palette, (counts.get(e.palette) ?? 0) + 1);
      }
    }
    if (counts.size) {
      out.push({
        kind: "palette-range",
        tileset: symbol,
        indices: [...counts.keys()].sort((a, b) => a - b),
        entries: [...counts.values()].reduce((a, b) => a + b, 0),
      });
    }
  }

  return out.sort((a, b) => b.entries - a.entries);
}
