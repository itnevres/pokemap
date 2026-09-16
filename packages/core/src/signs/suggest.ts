import { readFileSync } from "node:fs";
import type { Project } from "../project.js";
import { parseBlocks } from "../load/blocks.js";
import { speciesChances, FISHING_RODS, type Method } from "../load/encounters.js";

const METHODS: Method[] = ["land_mons", "water_mons", "rock_smash_mons", "fishing_mons"];

// include/constants/metatile_behaviors.h in the subject decomp: MB_TALL_GRASS
// is 0x02, stable across every engine fork this project targets (I1's own
// per-version boundaries govern the metatile SPLIT, not behavior codes --
// behavior values are a tileset-attribute convention, not a layout_version
// one, and this project has found no fork that renumbers them).
const MB_TALL_GRASS = 0x02;

export interface SignSpeciesSuggestion {
  species: string;
  percent: number;
  method: Method;
  minLevel: number;
  maxLevel: number;
}

/**
 * The forward direction of analyse/coverage.ts's whereSpecies: given a map
 * ALREADY chosen (by the player, in SignComposer), rank what's actually
 * catchable there. One row per species -- its single best (method, variant,
 * rod) chance -- because a sign proposes ONE species to stand as, not a
 * table.
 */
export function rankSpeciesForSign(proj: Project, mapName: string): SignSpeciesSuggestion[] {
  const mapId = proj.map(mapName).id;
  const enc = proj.encounters();
  const entries = enc.forMap(mapId);
  const best = new Map<string, SignSpeciesSuggestion>();

  entries.forEach((_entry, entryIndex) => {
    for (const method of METHODS) {
      const rods = method === "fishing_mons" ? FISHING_RODS.map((r) => r.rod) : [undefined];
      for (const rod of rods) {
        const chances = speciesChances(enc, mapId, method, { entry: entryIndex, rod });
        if (!chances) continue;
        for (const c of chances) {
          const prior = best.get(c.species);
          if (!prior || c.percent > prior.percent) {
            best.set(c.species, { species: c.species, percent: c.percent, method, minLevel: c.minLevel, maxLevel: c.maxLevel });
          }
        }
      }
    }
  });

  return [...best.values()].sort((a, b) => b.percent - a.percent);
}

export interface SignPlacement {
  x: number;
  y: number;
}

/**
 * Finds one walkable, non-grass tile orthogonally adjacent to a tall-grass
 * tile, with no existing object event on it -- a reasonable default spot for
 * a wild-sign NPC to "stand next to the grass" the way CeladonCity's own
 * Poliwrath does (see this task's own header comment). Returns null rather
 * than guessing when the map has no tall grass at all (I7).
 */
export function suggestSignPlacement(proj: Project, mapName: string): SignPlacement | null {
  const layout = proj.layoutForMap(mapName);
  const split = proj.splitFor(layout);
  const primary = proj.tileset(layout.primaryTileset);
  const secondary = proj.tileset(layout.secondaryTileset);
  const behaviorOf = (id: number): number => {
    const inSecondary = id >= split.metatiles;
    const owner = inSecondary ? secondary : primary;
    const local = inSecondary ? id - split.metatiles : id;
    return owner.behavior(local);
  };

  const blockdataPath = `${proj.paths.root}/${layout.blockdataFilepath}`;
  const blocks = parseBlocks(readFileSync(blockdataPath), proj.profile);
  const { width, height } = layout;
  const occupied = new Set(proj.map(mapName).objectEvents.map((e) => `${e.x},${e.y}`));

  const isGrass = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return behaviorOf(blocks[y * width + x]!.metatileId) === MB_TALL_GRASS;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isGrass(x, y)) continue;
      const neighbors: SignPlacement[] = [
        { x, y: y - 1 },
        { x, y: y + 1 },
        { x: x - 1, y },
        { x: x + 1, y },
      ];
      for (const n of neighbors) {
        if (n.x < 0 || n.y < 0 || n.x >= width || n.y >= height) continue;
        if (isGrass(n.x, n.y)) continue;
        if (occupied.has(`${n.x},${n.y}`)) continue;
        return n;
      }
    }
  }
  return null;
}
