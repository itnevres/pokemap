import { readFileSync } from "node:fs";
import { norm } from "../config/paths.js";
import type { GbcProject } from "../gbc/project.js";
import { parseConstDefs } from "../gbc/load/asm.js";
import { loadGbcSpeciesIds } from "../gbc/load/species.js";
import { loadGbcMapEvents } from "../gbc/load/events.js";
import { parseCollisionConstants } from "../gbc/load/tileset.js";
import { gbcEncounterSources } from "../gbc/analyse/atlas.js";
import { gbcSpeciesNames } from "../signs/linked.js";
import type { IndicatorSpecies } from "./gba.js";

/** Both the regular overworld and SpriteMons blocks can supply own sprites. */
export function loadGbcOwnSprites(root: string): Set<string> {
  const file = `${norm(root)}/constants/sprite_constants.asm`;
  const sprites = parseConstDefs(readFileSync(file, "utf8"));
  return new Set([...loadGbcSpeciesIds(root).keys()].filter((species) => sprites.has(`SPRITE_${species}`)));
}

export function gbcIndicatorSprite(species: string, own: Set<string>): string {
  return own.has(species) ? `SPRITE_${species}` : "SPRITE_MONSTER";
}

/** Best chance across ordinary sources, using the Sign tool's display-name tie break. */
export function rankGbcIndicatorSpecies(proj: GbcProject, mapName: string): IndicatorSpecies[] {
  const names = gbcSpeciesNames(proj.root);
  const best = new Map<string, number>();
  for (const source of gbcEncounterSources(proj, mapName)) {
    if (source.conditional === "swarm") continue;
    for (const chance of source.chances) {
      best.set(chance.species, Math.max(best.get(chance.species) ?? 0, chance.percent));
    }
  }
  return [...best].map(([species, percent]) => {
    const name = names.get(species);
    if (name === undefined) throw new Error(`${norm(proj.root)}/data/pokemon/names.asm: missing name for ${species}`);
    return { species, name, percent };
  }).sort((a, b) => b.percent - a.percent || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Scan grass STEP coordinates row-major; try up/down/left/right per grass step. */
export function suggestGbcIndicatorPlacement(proj: GbcProject, mapName: string): { x: number; y: number } | null {
  const map = proj.map(mapName);
  const file = `${norm(proj.root)}/constants/collision_constants.asm`;
  let grass: number | undefined;
  try {
    grass = parseCollisionConstants(readFileSync(file, "utf8")).get("COLL_TALL_GRASS");
  } catch (error) {
    throw new Error(`${file}: ${(error as Error).message}`);
  }
  if (grass === undefined) throw new Error(`${file}: missing COLL_TALL_GRASS`);
  const { layout } = proj.layout(map);
  const tileset = proj.tileset(map.tileset);
  const { events } = loadGbcMapEvents(proj.root, map);
  const occupied = new Set(events.objects.map(({ x, y }) => `${x},${y}`));
  const width = map.width * 2;
  const height = map.height * 2;
  const collisionAt = (x: number, y: number): number | undefined => {
    const block = layout.blocks[Math.floor(y / 2) * map.width + Math.floor(x / 2)];
    const c = block ? tileset.collision[block.metatileId] : undefined;
    // As in gbcMapHasWaterTile, out-of-range metatiles are a render concern.
    if (!c) return undefined;
    return y % 2 === 0 ? (x % 2 === 0 ? c.tl : c.tr) : (x % 2 === 0 ? c.bl : c.br);
  };
  const neighbours = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (collisionAt(x, y) !== grass) continue;
      for (const [dx, dy] of neighbours) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (collisionAt(nx, ny) === grass || occupied.has(`${nx},${ny}`)) continue;
        return { x: nx, y: ny };
      }
    }
  }
  return null;
}
