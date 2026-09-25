import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  gbcEncounterSources,
  gbcWhereSpecies,
  gbcCoverage,
  gbcMapHasWaterTile,
  loadGbcSpeciesConstants,
  RANDOM_RANGE,
  GRASS_WATER_LEVEL_BUFF_MAX,
  ROCK_ENCOUNTER_RATE_PERCENT,
} from "../../../src/gbc/analyse/atlas.js";
import type { GbcProject } from "../../../src/gbc/project.js";
import { openGbcProject } from "../../../src/gbc/project.js";
import type {
  Collision,
  GbcFishGroup,
  GbcGrassEntry,
  GbcMap,
  GbcPercentValue,
  GbcTileset,
  GbcTreemonMapEntry,
  GbcTreemonSet,
  GbcWaterEntry,
  GbcWildData,
  Layout,
} from "../../../src/gbc/model/types.js";
import { GBC_SUBJECT_ROOT, itWithGbcCorpus } from "../helpers/corpus.js";
import { stubGbcProject } from "../helpers/stubGbcProject.js";

// ---------------------------------------------------------------------------
// Fixture: one small, hand-derived GbcWildData + map set exercising every
// engine rule this atlas implements. No unchecked `as` casts -- every object
// below is built to its real interface shape.
// ---------------------------------------------------------------------------

const pct = (resolved: number): GbcPercentValue => ({ raw: `<${resolved}>`, resolved });

/** 0 = land, `waterColl` = the one COLL_* value the stub's `waterCollisionValues()` recognizes. Metatile 1 has it in its `br` quadrant; metatile 0 is plain land. */
const WATER_COLL = 0x29; // COLL_WATER's real value (constants/collision_constants.asm) -- arbitrary but realistic
function makeTileset(): GbcTileset {
  const land: Collision = { tl: 0, tr: 0, bl: 0, br: 0 };
  const water: Collision = { tl: 0, tr: 0, bl: 0, br: WATER_COLL };
  return {
    constName: "TILESET_TEST",
    name: "TilesetTest",
    gfxPath: "<stub>",
    metatilesPath: "<stub>",
    collisionPath: "<stub>",
    palMapPath: "<stub>",
    metatiles: [],
    palMap: [],
    tiles: [],
    collision: [land, water],
  };
}

function makeMap(overrides: Pick<GbcMap, "name" | "constName" | "blkPath" | "fishGroup">): GbcMap {
  return {
    name: overrides.name,
    constName: overrides.constName,
    group: 1,
    number: 1,
    width: 1,
    height: 1,
    blkPath: overrides.blkPath,
    tileset: "TILESET_TEST",
    environment: "ROUTE",
    landmark: "LANDMARK_NONE",
    music: "MUSIC_NONE",
    phoneFlag: "FALSE",
    palette: "PALETTE_AUTO",
    fishGroup: overrides.fishGroup,
    border: 0,
    connectionFlags: "0",
    connections: [],
  };
}

const GRASS_MAP = makeMap({ name: "GrassMap", constName: "GRASS_MAP", blkPath: "noWater.blk", fishGroup: "FISHGROUP_NONE" });
const WATER_MAP = makeMap({ name: "WaterMap", constName: "WATER_MAP", blkPath: "waterful.blk", fishGroup: "FISHGROUP_NONE" });
const SWARM_GRASS_MAP = makeMap({ name: "SwarmGrassMap", constName: "SWARM_GRASS_MAP", blkPath: "noWater.blk", fishGroup: "FISHGROUP_NONE" });
const FISH_NO_WATER_MAP = makeMap({ name: "FishNoWaterMap", constName: "FISH_NO_WATER_MAP", blkPath: "noWater.blk", fishGroup: "FISHGROUP_BASE" });
const FISH_WATER_MAP = makeMap({ name: "FishWaterMap", constName: "FISH_WATER_MAP", blkPath: "waterful.blk", fishGroup: "FISHGROUP_BASE" });
const FISH_TIME_MAP = makeMap({ name: "FishTimeMap", constName: "FISH_TIME_MAP", blkPath: "waterful.blk", fishGroup: "FISHGROUP_TIME" });
const FISH_SWARM_BASE_MAP = makeMap({ name: "FishSwarmBaseMap", constName: "FISH_SWARM_BASE_MAP", blkPath: "waterful.blk", fishGroup: "FISHGROUP_QWILFISH" });
const HEADBUTT_MAP = makeMap({ name: "HeadbuttMap", constName: "HEADBUTT_MAP", blkPath: "noWater.blk", fishGroup: "FISHGROUP_NONE" });
const CITY_MAP = makeMap({ name: "CityMap", constName: "CITY_MAP", blkPath: "noWater.blk", fishGroup: "FISHGROUP_NONE" });
const ROCK_MAP = makeMap({ name: "RockMap", constName: "ROCK_MAP", blkPath: "noWater.blk", fishGroup: "FISHGROUP_NONE" });
const EMPTY_MAP = makeMap({ name: "EmptyMap", constName: "EMPTY_MAP", blkPath: "noWater.blk", fishGroup: "FISHGROUP_NONE" });
// Fix round 1, spec review M8: a map with ONLY a swarm source (no base grass/
// water/fish/headbutt/rock entry at all) -- pins that `gbcCoverage` counts it
// as "with encounters" purely on `sources.length > 0`, never special-casing
// `conditional === "swarm"` out of that count.
const SWARM_ONLY_MAP = makeMap({ name: "SwarmOnlyMap", constName: "SWARM_ONLY_MAP", blkPath: "noWater.blk", fishGroup: "FISHGROUP_NONE" });

const ALL_MAPS: GbcMap[] = [
  GRASS_MAP, WATER_MAP, SWARM_GRASS_MAP, FISH_NO_WATER_MAP, FISH_WATER_MAP,
  FISH_TIME_MAP, FISH_SWARM_BASE_MAP, HEADBUTT_MAP, CITY_MAP, ROCK_MAP, EMPTY_MAP, SWARM_ONLY_MAP,
];

// -- grass: all 7 slots level 5, duplicate species per time bucket, so the
// merged (min+max)/2 is 7 (=5, +4 buff) for every species regardless of
// percent split -- makes the per-map level average hand-computable exactly.
const GRASS_SLOTS = [
  { level: 5, species: "RATTATA" },
  { level: 5, species: "RATTATA" },
  { level: 5, species: "PIDGEY" },
  { level: 5, species: "PIDGEY" },
  { level: 5, species: "GEODUDE" },
  { level: 5, species: "GEODUDE" },
  { level: 5, species: "GEODUDE" },
];
const GRASS_PROBS = [25, 25, 20, 10, 10, 5, 5]; // real probabilities.asm values (25,25,20,10,10,5,5 -> sum 100)
const grassEntry: GbcGrassEntry = {
  mapConst: "GRASS_MAP",
  file: "data/wild/johto_grass.asm",
  swarm: false,
  rates: { morn: pct(25), day: pct(25), nite: pct(25) }, // "10 percent" -> resolved 25 -> 25/256*100 = 9.765625%
  slots: { morn: GRASS_SLOTS, day: GRASS_SLOTS, nite: GRASS_SLOTS },
  lineIndex: 0,
};

const swarmGrassBase: GbcGrassEntry = {
  mapConst: "SWARM_GRASS_MAP",
  file: "data/wild/johto_grass.asm",
  swarm: false,
  rates: { morn: pct(10), day: pct(10), nite: pct(10) },
  slots: {
    morn: [{ level: 10, species: "GYARADOS" }, ...GRASS_SLOTS.slice(1)],
    day: [{ level: 10, species: "GYARADOS" }, ...GRASS_SLOTS.slice(1)],
    nite: [{ level: 10, species: "GYARADOS" }, ...GRASS_SLOTS.slice(1)],
  },
  lineIndex: 1,
};
const swarmGrassSwarm: GbcGrassEntry = {
  mapConst: "SWARM_GRASS_MAP",
  file: "data/wild/swarm_grass.asm",
  swarm: true,
  rates: { morn: pct(51), day: pct(51), nite: pct(51) },
  slots: {
    morn: [{ level: 20, species: "DRATINI" }, ...GRASS_SLOTS.slice(1)],
    day: [{ level: 20, species: "DRATINI" }, ...GRASS_SLOTS.slice(1)],
    nite: [{ level: 20, species: "DRATINI" }, ...GRASS_SLOTS.slice(1)],
  },
  lineIndex: 2,
};

// SWARM_ONLY_MAP's only wild data at all: one swarm-tagged grass entry, no
// base grass entry for the same mapConst.
const swarmOnlyGrass: GbcGrassEntry = {
  mapConst: "SWARM_ONLY_MAP",
  file: "data/wild/swarm_grass.asm",
  swarm: true,
  rates: { morn: pct(51), day: pct(51), nite: pct(51) },
  slots: {
    morn: [{ level: 10, species: "MAGIKARP" }, ...GRASS_SLOTS.slice(1)],
    day: [{ level: 10, species: "MAGIKARP" }, ...GRASS_SLOTS.slice(1)],
    nite: [{ level: 10, species: "MAGIKARP" }, ...GRASS_SLOTS.slice(1)],
  },
  lineIndex: 3,
};

const WATER_SLOTS = [
  { level: 10, species: "MAGIKARP" },
  { level: 20, species: "GYARADOS" },
  { level: 10, species: "MAGIKARP" },
];
const WATER_PROBS = [45, 30, 25]; // real probabilities.asm water values
const waterEntry: GbcWaterEntry = {
  mapConst: "WATER_MAP",
  file: "data/wild/johto_water.asm",
  swarm: false,
  rate: pct(51),
  slots: WATER_SLOTS,
  lineIndex: 0,
};

// -- fish: FISHGROUP_BASE (single 100%-record rods, no time_group) reachable
// only from FishWaterMap's water tile.
const oneRecordRod = (species: string, level: number) => [{ chance: pct(255), kind: "species" as const, species, level }];
const fishGroupBase: GbcFishGroup = {
  constName: "FISHGROUP_BASE",
  index: 0,
  biteChance: pct(128), // 128/256 = 50% -- a clean round bite chance
  oldRod: oneRecordRod("MAGIKARP", 10),
  goodRod: oneRecordRod("MAGIKARP", 20),
  superRod: oneRecordRod("MAGIKARP", 40),
};

// -- fish: FISHGROUP_TIME's goodRod has one plain species record (resolved
// 100, an odd boundary chosen so a `<` vs `<=` mutation shows up as a
// different, non-round percent) plus one time_group reference.
const fishGroupTime: GbcFishGroup = {
  constName: "FISHGROUP_TIME",
  index: 1,
  biteChance: pct(255), // 100% bite, so this group's bite chance is trivially distinguishable from FISHGROUP_BASE's 50%
  oldRod: oneRecordRod("POLIWAG", 5),
  goodRod: [
    { chance: pct(100), kind: "species", species: "POLIWAG", level: 20 },
    { chance: pct(255), kind: "timeGroup", timeGroupIndex: 0 },
  ],
  superRod: oneRecordRod("SEAKING", 40),
};
const timeFishGroups = [{ index: 0, day: { species: "DRATINI", level: 25 }, nite: { species: "GYARADOS", level: 30 } }];

// -- fish: FISHGROUP_QWILFISH / _SWARM, exercising `wildForMap`'s
// FISH_SWARM_OF substitution tag (encounters.ts) end to end through the atlas.
const fishGroupQwilfish: GbcFishGroup = {
  constName: "FISHGROUP_QWILFISH",
  index: 2,
  biteChance: pct(128),
  oldRod: oneRecordRod("TENTACOOL", 10),
  goodRod: oneRecordRod("TENTACOOL", 20),
  superRod: oneRecordRod("TENTACOOL", 40),
};
const fishGroupQwilfishSwarm: GbcFishGroup = {
  constName: "FISHGROUP_QWILFISH_SWARM",
  index: 3,
  biteChance: pct(128),
  oldRod: oneRecordRod("QWILFISH", 10),
  goodRod: oneRecordRod("QWILFISH", 20),
  superRod: oneRecordRod("QWILFISH", 40),
};

// -- headbutt/rock.
const treemonSetCity: GbcTreemonSet = { constName: "TREEMON_SET_CITY", index: 0, yieldsNothing: true, common: [{ percent: 100, species: "HOOTHOOT", level: 10 }], rare: null };
const treemonSetRoute: GbcTreemonSet = {
  constName: "TREEMON_SET_ROUTE",
  index: 1,
  yieldsNothing: false,
  common: [
    { percent: 60, species: "HOOTHOOT", level: 10 },
    { percent: 40, species: "HOOTHOOT", level: 12 }, // duplicate species -> must merge to 100%, Lv 10-12
  ],
  rare: [{ percent: 100, species: "PINECO", level: 10 }],
};
const treemonSetRock: GbcTreemonSet = {
  constName: "TREEMON_SET_ROCK",
  index: 2,
  yieldsNothing: false,
  common: [
    { percent: 90, species: "KRABBY", level: 15 },
    { percent: 10, species: "SHUCKLE", level: 15 },
  ],
  rare: [{ percent: 100, species: "SHOULD_NEVER_APPEAR", level: 99 }], // rock must never read this
};

const treemonMaps: GbcTreemonMapEntry[] = [{ mapConst: "HEADBUTT_MAP", setConst: "TREEMON_SET_ROUTE", lineIndex: 0 }, { mapConst: "CITY_MAP", setConst: "TREEMON_SET_CITY", lineIndex: 1 }];
const rockMonMaps: GbcTreemonMapEntry[] = [{ mapConst: "ROCK_MAP", setConst: "TREEMON_SET_ROCK", lineIndex: 0 }];

const wildData: GbcWildData = {
  grass: [grassEntry, swarmGrassBase, swarmGrassSwarm, swarmOnlyGrass],
  water: [waterEntry],
  probabilities: { grass: GRASS_PROBS, water: WATER_PROBS },
  fishGroups: [fishGroupBase, fishGroupTime, fishGroupQwilfish, fishGroupQwilfishSwarm],
  timeFishGroups,
  treemonSets: [treemonSetCity, treemonSetRoute, treemonSetRock],
  treemonMaps,
  rockMonMaps,
  defects: [],
};

/** Every real species this fixture's wild data references, plus one that
 *  appears nowhere -- for the `gbcCoverage`/`unusedSpecies` test below,
 *  written to a real tmpdir file since `loadGbcSpeciesConstants` reads
 *  `constants/pokemon_constants.asm` off `proj.root` directly. */
const FIXTURE_USED_SPECIES = ["RATTATA", "PIDGEY", "GEODUDE", "GYARADOS", "DRATINI", "MAGIKARP", "POLIWAG", "SEAKING", "TENTACOOL", "QWILFISH", "HOOTHOOT", "PINECO", "KRABBY", "SHUCKLE", "SHOULD_NEVER_APPEAR"];

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeSpeciesConstantsRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "pokemap-gbc-atlas-"));
  tmpDirs.push(dir);
  mkdirSync(join(dir, "constants"), { recursive: true });
  const lines = [
    "\tconst_def 1",
    ...FIXTURE_USED_SPECIES.map((s) => `\tconst ${s}`),
    "\tconst UNUSEDMON",
    "DEF NUM_POKEMON EQU const_value - 1",
    "\tconst_skip",
    "\tconst EGG",
    "",
    "; Unown forms",
    "\tconst_def 1",
    "\tconst UNOWN_A",
    "\tconst UNOWN_B",
    "",
  ];
  writeFileSync(join(dir, "constants/pokemon_constants.asm"), lines.join("\n"));
  return dir;
}

/** Minimal, explicit `GbcProject` stub -- no unchecked `as` casts. `root`
 *  defaults to a placeholder; only the `gbcCoverage`/`unusedSpecies` test
 *  below overrides it to a real tmpdir (`loadGbcSpeciesConstants` reads a
 *  real file off `proj.root`, everything else here is pure in-memory data). */
function stubProject(root = "<stub-root-never-read-except-by-loadGbcSpeciesConstants>"): GbcProject {
  const byName = new Map(ALL_MAPS.map((m) => [m.name, m]));
  const tileset = makeTileset();
  return stubGbcProject({
    root,
    maps: ALL_MAPS,
    map: (name: string) => {
      const m = byName.get(name);
      if (!m) throw new Error(`stub: unknown map "${name}"`);
      return m;
    },
    tileset: () => tileset,
    layout: (map): { layout: Layout; defects: [] } => ({
      layout: { blkPath: map.blkPath, width: 1, height: 1, writable: true, blocks: [{ metatileId: map.blkPath === "waterful.blk" ? 1 : 0 }] },
      defects: [],
    }),
    wild: () => wildData,
    waterCollisionValues: () => new Set([WATER_COLL]),
  });
}

describe("gbcMapHasWaterTile", () => {
  it("true for a map whose layout has the water-category collision quadrant", () => {
    expect(gbcMapHasWaterTile(stubProject(), WATER_MAP)).toBe(true);
  });
  it("false for a map whose layout has none", () => {
    expect(gbcMapHasWaterTile(stubProject(), GRASS_MAP)).toBe(false);
  });
});

describe("gbcEncounterSources: grass", () => {
  it("merges duplicate species per time bucket, sums percent, and reports minLevel=base / maxLevel=base+4", () => {
    const sources = gbcEncounterSources(stubProject(), "GrassMap");
    const grassSources = sources.filter((s) => s.method === "grass");
    expect(grassSources).toHaveLength(3);
    expect(grassSources.map((s) => s.time).sort()).toEqual(["day", "morn", "nite"]);

    const morn = grassSources.find((s) => s.time === "morn")!;
    expect(morn.conditional).toBeUndefined();
    expect(morn.encounterRate).toBeCloseTo((25 / RANDOM_RANGE) * 100, 10);
    expect(morn.chances).toEqual([
      { species: "RATTATA", percent: 50, minLevel: 5, maxLevel: 5 + GRASS_WATER_LEVEL_BUFF_MAX },
      { species: "PIDGEY", percent: 30, minLevel: 5, maxLevel: 5 + GRASS_WATER_LEVEL_BUFF_MAX },
      { species: "GEODUDE", percent: 20, minLevel: 5, maxLevel: 5 + GRASS_WATER_LEVEL_BUFF_MAX },
    ]);
    const total = morn.chances.reduce((a, c) => a + c.percent, 0);
    expect(total).toBe(100);
  });

  it("tags a swarm entry separately, never merging it into the base entry's chances", () => {
    const sources = gbcEncounterSources(stubProject(), "SwarmGrassMap").filter((s) => s.method === "grass");
    expect(sources).toHaveLength(6); // 3 base + 3 swarm
    const baseMorn = sources.find((s) => s.time === "morn" && s.conditional === undefined)!;
    const swarmMorn = sources.find((s) => s.time === "morn" && s.conditional === "swarm")!;
    expect(baseMorn.chances.some((c) => c.species === "GYARADOS")).toBe(true);
    expect(baseMorn.chances.some((c) => c.species === "DRATINI")).toBe(false);
    expect(swarmMorn.chances.some((c) => c.species === "DRATINI")).toBe(true);
    expect(swarmMorn.chances.some((c) => c.species === "GYARADOS")).toBe(false);
  });
});

describe("gbcEncounterSources: water", () => {
  it("has no time-of-day split (one source), merges duplicates, buffs the max level", () => {
    const sources = gbcEncounterSources(stubProject(), "WaterMap");
    const waterSources = sources.filter((s) => s.method === "water");
    expect(waterSources).toHaveLength(1);
    const w = waterSources[0]!;
    expect(w.time).toBeUndefined();
    expect(w.encounterRate).toBeCloseTo((51 / RANDOM_RANGE) * 100, 10);
    expect(w.chances).toEqual([
      { species: "MAGIKARP", percent: 70, minLevel: 10, maxLevel: 10 + GRASS_WATER_LEVEL_BUFF_MAX },
      { species: "GYARADOS", percent: 30, minLevel: 20, maxLevel: 20 + GRASS_WATER_LEVEL_BUFF_MAX },
    ]);
  });
});

describe("gbcEncounterSources: fish", () => {
  it("reports biteChance = resolved/256, one source per rod when no time_group is present", () => {
    const sources = gbcEncounterSources(stubProject(), "FishWaterMap").filter((s) => s.method === "fish");
    expect(sources).toHaveLength(3);
    for (const s of sources) {
      expect(s.time).toBeUndefined();
      expect(s.biteChance).toBeCloseTo(50, 10); // 128/256*100
      expect(s.chances).toEqual([{ species: "MAGIKARP", percent: 100, minLevel: expect.any(Number), maxLevel: expect.any(Number) }]);
    }
  });

  it("is suppressed entirely when the map's layout has no reachable water tile, even though FISHGROUP_BASE is set", () => {
    const sources = gbcEncounterSources(stubProject(), "FishNoWaterMap");
    expect(sources.filter((s) => s.method === "fish")).toHaveLength(0);
  });

  it("cumulative rod percent = (c_i - c_(i-1))/256*100, c_(-1)=-1 -- the exact <= boundary, not <", () => {
    const sources = gbcEncounterSources(stubProject(), "FishTimeMap").filter((s) => s.method === "fish" && s.rod === "good");
    // goodRod: [chance 100 POLIWAG, chance 255 time_group 0] -> record0 covers
    // Random() in [0,100] inclusive = 101 values; record1 covers [101,255] = 155 values.
    const day = sources.find((s) => s.time === "day")!;
    const poliwagDay = day.chances.find((c) => c.species === "POLIWAG")!;
    expect(poliwagDay.percent).toBeCloseTo((101 / RANDOM_RANGE) * 100, 10);
    const dratini = day.chances.find((c) => c.species === "DRATINI")!;
    expect(dratini.percent).toBeCloseTo((155 / RANDOM_RANGE) * 100, 10);
    expect(poliwagDay.percent + dratini.percent).toBeCloseTo(100, 8);
  });

  it("time_group expands into separate day/nite sources, substituting only that one record", () => {
    const sources = gbcEncounterSources(stubProject(), "FishTimeMap").filter((s) => s.method === "fish" && s.rod === "good");
    expect(sources.map((s) => s.time).sort()).toEqual(["day", "nite"]);
    const day = sources.find((s) => s.time === "day")!;
    const nite = sources.find((s) => s.time === "nite")!;
    expect(day.chances.map((c) => c.species).sort()).toEqual(["DRATINI", "POLIWAG"]);
    expect(nite.chances.map((c) => c.species).sort()).toEqual(["GYARADOS", "POLIWAG"]);
    // The non-time_group record (POLIWAG) is identical in both variants.
    expect(day.chances.find((c) => c.species === "POLIWAG")).toEqual(nite.chances.find((c) => c.species === "POLIWAG"));
  });

  it("a rod with no time_group at all (old/super here) yields exactly one time-less source", () => {
    const sources = gbcEncounterSources(stubProject(), "FishTimeMap").filter((s) => s.method === "fish" && (s.rod === "old" || s.rod === "super"));
    expect(sources).toHaveLength(2);
    for (const s of sources) expect(s.time).toBeUndefined();
  });

  it("swarm fish variant is tagged conditional:'swarm' and never merged into the base group's chances", () => {
    const sources = gbcEncounterSources(stubProject(), "FishSwarmBaseMap").filter((s) => s.method === "fish" && s.rod === "old");
    expect(sources).toHaveLength(2);
    const base = sources.find((s) => s.conditional === undefined)!;
    const swarm = sources.find((s) => s.conditional === "swarm")!;
    expect(base.chances).toEqual([{ species: "TENTACOOL", percent: 100, minLevel: 10, maxLevel: 10 }]);
    expect(swarm.chances).toEqual([{ species: "QWILFISH", percent: 100, minLevel: 10, maxLevel: 10 }]);
  });
});

describe("gbcEncounterSources: headbutt", () => {
  it("reports common and rare as separate sources, each with duplicate species merged, no level buff", () => {
    const sources = gbcEncounterSources(stubProject(), "HeadbuttMap").filter((s) => s.method === "headbutt");
    expect(sources).toHaveLength(2);
    const common = sources.find((s) => s.list === "common")!;
    const rare = sources.find((s) => s.list === "rare")!;
    expect(common.encounterRate).toBeUndefined();
    expect(common.chances).toEqual([{ species: "HOOTHOOT", percent: 100, minLevel: 10, maxLevel: 12 }]);
    expect(rare.chances).toEqual([{ species: "PINECO", percent: 100, minLevel: 10, maxLevel: 10 }]);
  });

  it("emits NO source at all for a yieldsNothing (TREEMON_SET_CITY) map", () => {
    const sources = gbcEncounterSources(stubProject(), "CityMap");
    expect(sources.filter((s) => s.method === "headbutt")).toHaveLength(0);
    expect(sources).toHaveLength(0); // CityMap has no other wild data either
  });
});

describe("gbcEncounterSources: rock", () => {
  it("reports encounterRate=40 flat and reads ONLY the common list, never rare", () => {
    const sources = gbcEncounterSources(stubProject(), "RockMap").filter((s) => s.method === "rock");
    expect(sources).toHaveLength(1);
    const rock = sources[0]!;
    expect(rock.encounterRate).toBe(ROCK_ENCOUNTER_RATE_PERCENT);
    expect(rock.list).toBeUndefined();
    expect(rock.chances).toEqual([
      { species: "KRABBY", percent: 90, minLevel: 15, maxLevel: 15 },
      { species: "SHUCKLE", percent: 10, minLevel: 15, maxLevel: 15 },
    ]);
    expect(rock.chances.some((c) => c.species === "SHOULD_NEVER_APPEAR")).toBe(false);
  });
});

describe("gbcWhereSpecies", () => {
  it("finds a species across every map/source and sorts by percent descending", () => {
    const hits = gbcWhereSpecies(stubProject(), "MAGIKARP");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h, i) => i === 0 || hits[i - 1]!.percent >= h.percent)).toBe(true);
    expect(hits.some((h) => h.mapName === "WaterMap" && h.method === "water")).toBe(true);
    expect(hits.some((h) => h.mapName === "FishWaterMap" && h.method === "fish")).toBe(true);
  });

  it("returns nothing for a species in no source", () => {
    expect(gbcWhereSpecies(stubProject(), "SPECIES_NOWHERE")).toEqual([]);
  });
});

describe("gbcCoverage", () => {
  it("mapsWithEncounters/mapsWithoutEncounters/sourcesByMethod/fishGroupWithoutWater/levelByMap/unusedSpecies, all hand-derived", () => {
    const root = makeSpeciesConstantsRoot();
    const c = gbcCoverage(stubProject(root));

    expect(c.mapsWithEncounters).toBe(9); // includes SwarmOnlyMap -- see the dedicated M8 test below
    expect(c.mapsWithoutEncounters.sort()).toEqual(["CityMap", "EmptyMap", "FishNoWaterMap"].sort());
    expect(c.sourcesByMethod).toEqual({ grass: 12, water: 1, fish: 13, headbutt: 2, rock: 1 });
    expect(c.fishGroupWithoutWater).toEqual(["FishNoWaterMap"]);
    expect(c.defects).toEqual([]);
    // Fix round 1, spec review Issue 1: unusedSpecies is now built from
    // generated sources, not raw table presence -- SHOULD_NEVER_APPEAR lives
    // only in the rock set's `rare` list, which `buildRockSources` never
    // reads, so it is correctly unused (it would have been wrongly counted
    // "used" under the old raw-table scan).
    expect(c.unusedSpecies).toEqual(["SHOULD_NEVER_APPEAR", "UNUSEDMON"]);

    const rockAvg = c.levelByMap.find((m) => m.mapName === "RockMap")!;
    expect(rockAvg.averageLevel).toBeCloseTo(15, 10); // one source, weighted (90*15+10*15)/100 = 15
    const grassAvg = c.levelByMap.find((m) => m.mapName === "GrassMap")!;
    expect(grassAvg.averageLevel).toBeCloseTo(7, 10); // every chance's own mid-level is 5+(5+4)/2... see fixture comment: (5+9)/2=7 for every species/source
    const waterAvg = c.levelByMap.find((m) => m.mapName === "WaterMap")!;
    expect(waterAvg.averageLevel).toBeCloseTo(15, 10); // (12*70+22*30)/100 = 15
  });

  it("M8: a map with only a swarm source counts as 'with encounters', never excluded for being conditional", () => {
    const root = makeSpeciesConstantsRoot();
    const c = gbcCoverage(stubProject(root));
    expect(c.mapsWithoutEncounters).not.toContain("SwarmOnlyMap");
    // Direct positive check, independent of the coverage loop: the map's
    // own sources are non-empty and every one is swarm-tagged.
    const sources = gbcEncounterSources(stubProject(root), "SwarmOnlyMap");
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((s) => s.conditional === "swarm")).toBe(true);
  });
});

describe("loadGbcSpeciesConstants", () => {
  it("excludes EGG and the second const_def block's UNOWN_* letter forms", () => {
    const root = makeSpeciesConstantsRoot();
    const species = loadGbcSpeciesConstants(root);
    expect(species).toContain("RATTATA");
    expect(species).not.toContain("EGG");
    expect(species).not.toContain("UNOWN_A");
    expect(species).not.toContain("UNOWN_B");
    expect(species).toEqual([...species].sort());
  });
});

describe("mergeSlots length-mismatch refusal (quality review Minor #3)", () => {
  it("throws, naming both counts, when a grass entry's slot count disagrees with probabilities.grass's length", () => {
    const badWildData: GbcWildData = { ...wildData, probabilities: { grass: GRASS_PROBS.slice(0, 6), water: WATER_PROBS } };
    const badProj: GbcProject = { ...stubProject(), wild: () => badWildData };
    expect(() => gbcEncounterSources(badProj, "GrassMap")).toThrow(/mergeSlots: 7 slot\(s\) but 6 probability entr\(y\/ies\)/);
  });

  it("does not throw on the real 7-slot/7-probability grass shape", () => {
    expect(() => gbcEncounterSources(stubProject(), "GrassMap")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Corpus (real subject, hand-derived from the raw .asm -- see this task's
// implementer report for the full derivation of each pinned number).
// ---------------------------------------------------------------------------

describe("corpus", () => {
  itWithGbcCorpus("Route29 grass: PIDGEY 45% Lv2-7 and RATTATA 10% Lv2-6 (morn), hand-derived from johto_grass.asm + probabilities.asm + the +4 buff", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const morn = gbcEncounterSources(proj, "Route29").find((s) => s.method === "grass" && s.time === "morn")!;
    // johto_grass.asm ROUTE_29 morn slots: PIDGEY(2) SENTRET(2) PIDGEY(3) SENTRET(3) RATTATA(2) HOPPIP(3) HOPPIP(3);
    // probabilities.asm slot odds 25,25,20,10,10,5,5 -> PIDGEY = slot0(25)+slot2(20) = 45%, Lv 2-(3+4)=7;
    // RATTATA = slot4(10%) only, Lv 2-(2+4)=6. Rate "10 percent" -> resolved 25 -> 25/256*100 = 9.765625%.
    expect(morn.encounterRate).toBeCloseTo((25 / RANDOM_RANGE) * 100, 10);
    expect(morn.chances.find((c) => c.species === "PIDGEY")).toEqual({ species: "PIDGEY", percent: 45, minLevel: 2, maxLevel: 7 });
    expect(morn.chances.find((c) => c.species === "RATTATA")).toEqual({ species: "RATTATA", percent: 10, minLevel: 2, maxLevel: 6 });
  });

  itWithGbcCorpus("Route32 fishing: FISHGROUP_QWILFISH's swarm variant is present, tagged conditional:'swarm', with the hand-derived bite chance and old-rod percents", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const sources = gbcEncounterSources(proj, "Route32").filter((s) => s.method === "fish" && s.rod === "old");
    expect(sources).toHaveLength(2);
    // fish.asm: every fishgroup row's bite chance is "50 percent + 1" -> resolved 128 -> 128/256*100 = 50% exactly.
    for (const s of sources) expect(s.biteChance).toBeCloseTo(50, 10);

    const swarm = sources.find((s) => s.conditional === "swarm")!;
    // .Qwilfish_Swarm_Old: db 70%+1 MAGIKARP 5 / db 85%+1 MAGIKARP 5 / db 100% QWILFISH 5
    // resolved: 179, 217, 255 -> per-record: (179-(-1))/256=180/256=70.3125%; (217-179)/256=38/256=14.84375% (x2, MAGIKARP+QWILFISH)
    expect(swarm.chances).toEqual([
      { species: "MAGIKARP", percent: (180 / RANDOM_RANGE) * 100 + (38 / RANDOM_RANGE) * 100, minLevel: 5, maxLevel: 5 },
      { species: "QWILFISH", percent: (38 / RANDOM_RANGE) * 100, minLevel: 5, maxLevel: 5 },
    ]);

    const base = sources.find((s) => s.conditional === undefined)!;
    expect(base.chances.some((c) => c.species === "QWILFISH")).toBe(false); // the base (no-swarm) group never yields QWILFISH on the old rod
  });

  itWithGbcCorpus("a headbutt map's (Route29, TREEMON_SET_ROUTE) common/rare lists, non-cumulative, merged duplicate EXEGGCUTE entries", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const sources = gbcEncounterSources(proj, "Route29").filter((s) => s.method === "headbutt");
    expect(sources).toHaveLength(2);
    const common = sources.find((s) => s.list === "common")!;
    const rare = sources.find((s) => s.list === "rare")!;
    // TreeMonSet_Route common: 50 HOOTHOOT / 15 SPINARAK / 15 LEDYBA / 10+5+5 EXEGGCUTE (merged to 20%)
    expect(common.chances).toEqual(
      expect.arrayContaining([
        { species: "HOOTHOOT", percent: 50, minLevel: 10, maxLevel: 10 },
        { species: "EXEGGCUTE", percent: 20, minLevel: 10, maxLevel: 10 },
      ]),
    );
    // rare: 50 HOOTHOOT / 15+15 PINECO (merged 30%) / 10+5+5 EXEGGCUTE (merged 20%)
    expect(rare.chances).toEqual(
      expect.arrayContaining([
        { species: "PINECO", percent: 30, minLevel: 10, maxLevel: 10 },
      ]),
    );
  });

  itWithGbcCorpus("CianwoodCity's rock source: KRABBY 90%/SHUCKLE 10%, rate 40%, common only", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const sources = gbcEncounterSources(proj, "CianwoodCity").filter((s) => s.method === "rock");
    expect(sources).toHaveLength(1);
    expect(sources[0]!.encounterRate).toBe(40);
    expect(sources[0]!.chances).toEqual([
      { species: "KRABBY", percent: 90, minLevel: 15, maxLevel: 15 },
      { species: "SHUCKLE", percent: 10, minLevel: 15, maxLevel: 15 },
    ]);
  });

  itWithGbcCorpus("gbcWhereSpecies('DUNSPARCE') includes DarkCaveVioletEntrance grass swarm at 45% Lv2-8", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const hits = gbcWhereSpecies(proj, "DUNSPARCE");
    expect(hits.some((h) => h.mapName === "DarkCaveVioletEntrance" && h.method === "grass" && h.conditional === "swarm" && h.percent === 45 && h.minLevel === 2 && h.maxLevel === 8)).toBe(true);
  });

  itWithGbcCorpus("gbcWhereSpecies for a nite-only species (HOUNDOUR) returns only nite hits, matching real Crystal locations (Route 36/37)", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const hits = gbcWhereSpecies(proj, "HOUNDOUR");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.time === "nite")).toBe(true);
    expect(hits.some((h) => h.mapName === "Route36")).toBe(true);
    expect(hits.some((h) => h.mapName === "Route37")).toBe(true);
  });

  itWithGbcCorpus("success criterion 5: where CHIKORITA reports a real Crystal location (Route31)", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const hits = gbcWhereSpecies(proj, "CHIKORITA");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.mapName === "Route31")).toBe(true);
  });

  itWithGbcCorpus("gbcCoverage over the whole corpus: pinned mapsWithEncounters/sourcesByMethod/fishGroupWithoutWater/unusedSpecies/defects", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    const c = gbcCoverage(proj);
    expect(c.mapsWithEncounters).toBe(125);
    expect(c.mapsWithoutEncounters).toHaveLength(391 - 125);
    expect(c.sourcesByMethod).toEqual({ grass: 288, water: 62, fish: 340, headbutt: 106, rock: 4 });
    expect(c.fishGroupWithoutWater).toHaveLength(319);
    // Fix round 1, spec review Issue 1/2: 69 -> 70 -- REMORAID is unused
    // because no map header in this corpus assigns FISHGROUP_REMORAID (or
    // its _SWARM substitution) at all, even though the raw fish.asm text
    // mentions it; CELEBI/CHARIZARD are ordinary fully-evolved/legendary
    // species with no wild encounter in any of the 5 in-scope methods.
    expect(c.unusedSpecies).toHaveLength(70);
    expect(c.unusedSpecies).toEqual(expect.arrayContaining(["REMORAID", "CELEBI", "CHARIZARD"]));
    expect(c.unusedSpecies).not.toContain("EGG");
    expect(c.defects).toHaveLength(1);
    expect(c.defects[0]!.file).toBe("data/wild/kanto_grass.asm");
  });

  itWithGbcCorpus("vacuous-pass guard: every corpus assertion above actually iterated something", () => {
    const proj = openGbcProject(GBC_SUBJECT_ROOT);
    expect(proj.maps.length).toBeGreaterThan(300);
    expect(gbcCoverage(proj).mapsWithEncounters).toBeGreaterThan(0);
  });
});
