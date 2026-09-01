import { readFileSync, existsSync, readdirSync } from "node:fs";
import type { Project } from "../project.js";
import {
  parseEncounters, speciesChances, FISHING_RODS,
  type Encounters, type Method, type Rod, type EncounterEntry,
} from "../load/encounters.js";

const METHODS: Method[] = ["land_mons", "water_mons", "rock_smash_mons", "fishing_mons"];

export interface SpeciesHit {
  mapId: string; mapName?: string; method: Method;
  /** Which of the map's tables this hit came from, e.g. "gRoute101_Night". */
  variant: string;
  rod?: Rod;
  percent: number; minLevel: number; maxLevel: number;
}

export interface Coverage {
  /** DISTINCT maps carrying at least one table -- not the table count, which is
   *  far higher because 125 maps have several variants each. */
  mapsWithEncounters: number;
  /** Total tables across all maps, counting every day/night variant. */
  encounterTables: number;
  mapsWithoutEncounters: string[];
  /** One entry per DISTINCT map that carries at least one table. The level
   *  curve is per MAP, averaged over every variant that map carries, so a
   *  route is not counted four times merely because it has four tables. */
  levelByMap: { mapId: string; averageLevel: number }[];
  unusedSpecies: string[];
  byMethod: Record<Method, number>;
}

function load(proj: Project): Encounters {
  return parseEncounters(readFileSync(proj.paths.wildEncountersJson, "utf8"));
}

export function whereSpecies(proj: Project, species: string): SpeciesHit[] {
  const enc = load(proj);
  const idToName = new Map(proj.mapNames().map((n) => [proj.map(n).id, n]));
  const out: SpeciesHit[] = [];

  const entries = enc.groups.get("gWildMonHeaders")?.entries ?? [];

  // Search EVERY variant, not just each map's first table. A night-only species
  // would otherwise be reported as appearing nowhere -- the search would
  // confidently return an empty list for a Pokemon the player can catch.
  const indexWithinMap = new Map<EncounterEntry, number>();
  const seenPerMap = new Map<string, number>();
  for (const e of entries) {
    const n = seenPerMap.get(e.map) ?? 0;
    indexWithinMap.set(e, n);
    seenPerMap.set(e.map, n + 1);
  }

  for (const entry of entries) {
    for (const method of METHODS) {
      const rods: (Rod | undefined)[] = method === "fishing_mons"
        ? FISHING_RODS.map((r) => r.rod)
        : [undefined];

      for (const rod of rods) {
        const chances = speciesChances(enc, entry.map, method, {
          entry: indexWithinMap.get(entry)!, rod,
        });
        const hit = chances?.find((c) => c.species === species);
        if (!hit) continue;
        out.push({
          mapId: entry.map, mapName: idToName.get(entry.map), method,
          variant: entry.baseLabel, rod,
          percent: hit.percent, minLevel: hit.minLevel, maxLevel: hit.maxLevel,
        });
      }
    }
  }

  return out.sort((a, b) => b.percent - a.percent);
}

export function coverage(proj: Project): Coverage {
  const enc = load(proj);
  const entries = enc.groups.get("gWildMonHeaders")?.entries ?? [];
  const withTable = new Set(entries.map((e) => e.map));

  const seen = new Set<string>();
  const levelByMap: Coverage["levelByMap"] = [];
  const byMethod = { land_mons: 0, water_mons: 0, rock_smash_mons: 0, fishing_mons: 0 } as Record<Method, number>;

  const perMap = new Map<string, { weighted: number; total: number }>();
  const seenPerMap = new Map<string, number>();

  for (const e of entries) {
    const entryIndex = seenPerMap.get(e.map) ?? 0;
    seenPerMap.set(e.map, entryIndex + 1);

    for (const method of METHODS) {
      const rods: (Rod | undefined)[] = method === "fishing_mons"
        ? FISHING_RODS.map((r) => r.rod)
        : [undefined];

      for (const rod of rods) {
        const chances = speciesChances(enc, e.map, method, { entry: entryIndex, rod });
        if (!chances) continue;
        // Count a method once per table, not once per rod.
        if (rod === undefined || rod === "old") byMethod[method]++;
        const acc = perMap.get(e.map) ?? { weighted: 0, total: 0 };
        for (const c of chances) {
          seen.add(c.species);
          acc.weighted += ((c.minLevel + c.maxLevel) / 2) * c.percent;
          acc.total += c.percent;
        }
        perMap.set(e.map, acc);
      }
    }
  }

  for (const [mapId, a] of perMap) {
    levelByMap.push({ mapId, averageLevel: a.total ? a.weighted / a.total : 0 });
  }

  return {
    mapsWithEncounters: withTable.size,
    encounterTables: entries.length,
    mapsWithoutEncounters: proj.mapNames().filter((n) => !withTable.has(proj.map(n).id)),
    levelByMap,
    unusedSpecies: allSpecies(proj).filter((s) => !seen.has(s)),
    byMethod,
  };
}

/** Species the project actually has art for -- the honest denominator. */
function allSpecies(proj: Project): string[] {
  const dir = `${proj.paths.root}/graphics/pokemon`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `SPECIES_${d.name.toUpperCase()}`);
}
