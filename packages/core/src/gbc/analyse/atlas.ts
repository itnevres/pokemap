/**
 * The GBC (pokecrystal-family) encounter atlas -- `gbcEncounterSources`,
 * `gbcWhereSpecies`, `gbcCoverage` (Plan 6 Task 12, re-granularised spec
 * `docs/superpowers/task-reports/pokemap-plan-6-gbc-foundation/task-12-spec.md`).
 * Pure over `GbcProject`: every rule below is cited against the real subject
 * (`/home/user/pokecrystal-PerfPlus`) engine source, file:line, never guessed.
 *
 * Scope (Decision 5, findings §Extra "Wild data"/"Fishing"/"Headbutt and Rock
 * Smash"): grass, water, fishing, headbutt, rock smash. Runtime-state
 * resolution (which swarm is active, a tree's per-coordinate score, the exact
 * clock tick) is out of scope -- every conditional source is tagged, never
 * resolved, exactly as `wildForMap` (Task 8) already does.
 */
import { readFileSync } from "node:fs";
import { norm } from "../../config/paths.js";
import { parseConstDefs } from "../load/asm.js";
import { wildForMap } from "../load/encounters.js";
import type { GbcProject } from "../project.js";
import type {
  DataDefect,
  GbcFishGroup,
  GbcFishRodRecord,
  GbcGrassEntry,
  GbcMap,
  GbcTimeFishEntry,
  GbcTreemonRecord,
  GbcTreemonSet,
  GbcWaterEntry,
  GbcWildData,
  GbcWildSlot,
} from "../model/types.js";

export type GbcEncounterMethod = "grass" | "water" | "fish" | "headbutt" | "rock";
export type GbcEncounterTime = "morn" | "day" | "nite";
export type GbcFishRod = "old" | "good" | "super";
export type GbcTreemonList = "common" | "rare";

/**
 * The 5 tag fields every `GbcEncounterSource` and `GbcSpeciesHit` carry,
 * factored out once (quality review Minor #5) so the two shapes can never
 * independently drift as a future method adds a 6th tag -- `GbcEncounterSource`
 * and `GbcSpeciesHit` each `extends` this instead of re-declaring the 5
 * fields by hand.
 */
export interface GbcSourceTags {
  method: GbcEncounterMethod;
  time?: GbcEncounterTime;
  rod?: GbcFishRod;
  list?: GbcTreemonList;
  conditional?: "swarm";
}

export interface GbcEncounterChance {
  species: string;
  percent: number;
  minLevel: number;
  maxLevel: number;
}

export interface GbcEncounterSource extends GbcSourceTags {
  /** % chance of the encounter roll succeeding at all (grass/water/rock).
   *  NOT multiplied into `chances[].percent`, which is already conditional
   *  on the roll succeeding -- see this file's own "Encounter rate" doc. */
  encounterRate?: number;
  /** % chance of a fishing bite (fish only), independent of `encounterRate`. */
  biteChance?: number;
  /** Merged per species within this one source, sorted by percent descending. */
  chances: GbcEncounterChance[];
}

// --- Engine semantics, derived from /home/user/pokecrystal-PerfPlus -------
//
// 1. Random() (home/random.asm) returns one hardware-seeded byte, uniform
//    over the full 0-255 range -- every "roll vs. threshold" comparison
//    below is therefore a fraction of 256 possible outcomes, NOT of 255 (the
//    "percent" macro's own N*255/100 scale is a BYTE VALUE, not a
//    probability -- converting it to a probability divides by 256, the
//    number of values Random() can produce).
//
// 2. Encounter rate (TryWildEncounter, engine/overworld/wildmons.asm:176-201):
//      call .EncounterRate / jr nc, .no_battle
//      .EncounterRate: call GetMapEncounterRate / call ApplyMusicEffect... /
//        call ApplyCleanseTagEffect... / call Random / cp b / ret
//    `cp b` sets carry iff Random() < b (b = the resolved rate byte, read by
//    GetMapEncounterRate from wMornEncounterRate+offset, i.e. exactly the
//    `evalPercent`-resolved GbcPercentValue this loader already parsed).
//    `jr nc` means the attempt proceeds iff carry is SET, i.e. iff
//    Random() < rate. P(attempt) = rate / 256. Music/Cleanse Tag modifiers
//    are runtime party/map state -- out of scope (this atlas reports the
//    base rate only, never multiplied by those).
//
// 3. Level buff (ChooseWildEncounter, engine/overworld/wildmons.asm:252-320):
//    the SAME code path (falls through the `.watermon` label) handles both
//    grass and water/surf -- there is no separate water branch for the buff,
//    confirming PerfPlus's surf-buff claim directly in the shared code, not
//    just in a comment. Lines 301-315:
//      call Random / cp 35 percent / jr c, .ok / inc b
//                   / cp 65 percent / jr c, .ok / inc b
//                   / cp 85 percent / jr c, .ok / inc b
//                   / cp 95 percent / jr c, .ok / inc b
//    b (the base level) is bumped +1 per threshold cleared. "35/65/85/95
//    percent" are BYTE thresholds (the "percent" macro's N*255/100 scale,
//    floored): 89/165/216/242 of 256, not literal 35/65/85/95% cut points --
//    fix round 1, spec review Minor #1 caught an earlier version of this
//    comment quoting the approximate "35/30/20/10/5%" as if it were exact,
//    contradicting this very file's own item 1 ("a fraction of 256, NOT a
//    percent"). The EXACT distribution, `Random()` uniform on 0-255:
//      P(+0) = 89/256        = 34.765625%
//      P(+1) = (165-89)/256  = 29.6875%
//      P(+2) = (216-165)/256 = 19.921875%
//      P(+3) = (242-216)/256 = 10.15625%
//      P(+4) = (256-242)/256 = 5.46875%
//    (sums to 256/256). Max buff = +4 -- the only part of this distribution
//    the atlas actually reports (`GRASS_WATER_LEVEL_BUFF_MAX`); a static
//    atlas has no way to say which buff a given real-time roll will land on,
//    so `GRASS_WATER_LEVEL_BUFF_DISTRIBUTION` below is exposed purely for
//    documentation/citation, not consumed by any builder. This buff is
//    reached ONLY from ChooseWildEncounter -- fish.asm's `.Fish`/
//    `.TimeEncounter` and treemons.asm's `SelectTreeMon` each set
//    wCurPartyLevel directly from their own record's level byte, with no
//    Random call in between, so fishing/headbutt/rock never get it.
export const RANDOM_RANGE = 256;
export const GRASS_WATER_LEVEL_BUFF_MAX = 4;
/** Exact `Random()`-uniform probability (%) of +0/+1/+2/+3/+4, in order,
 *  derived above from `engine/overworld/wildmons.asm:301-315`'s real byte
 *  thresholds (89/165/216/242 of 256) -- documentation only (see this file's
 *  item 3 comment); no builder in this file consumes it. */
export const GRASS_WATER_LEVEL_BUFF_DISTRIBUTION = [34.765625, 29.6875, 19.921875, 10.15625, 5.46875] as const;

function rateOf256Percent(resolved: number): number {
  return (resolved / RANDOM_RANGE) * 100;
}

// 4. Fishing bite (engine/events/fish.asm:24-30, `.Fish`):
//      call Random / cp [hl] / jr nc, .no_bite
//    [hl] is the fish group's own `biteChance` byte. Same `cp`/`jr nc` shape
//    as the encounter-rate check above -- a bite happens iff Random() <
//    biteChance. P(bite) = biteChance / 256.
//
// 5. Fishing rod record selection (engine/events/fish.asm:46-53, `.loop`):
//      call Random / .loop: cp [hl] / jr z, .ok / jr c, .ok / inc hl x3 / jr .loop
//    [hl] is each record's own cumulative `chance` byte, walked in file
//    order. `cp [hl]` sets Z iff Random()==chance, C iff Random()<chance;
//    `jr z,.ok` OR `jr c,.ok` together mean "stop at the first record whose
//    chance is >= Random()", i.e. the engine picks the first record with
//    Random() <= chance (confirms the `<=` doc already on
//    `GbcFishRodRecord`/`GbcFishGroup` in model/types.ts -- re-verified here,
//    not just trusted). For an ascending cumulative array c_0 < c_1 < ... <
//    c_n = 255 (c_-1 := -1), record i covers c_i - c_-1(prev) integer values
//    of Random() out of 256, so:
//      percent_i (%) = (c_i - c_(i-1)) / 256 * 100,  c_(-1) := -1
//
// 6. time_group resolution (engine/events/fish.asm:71-86, `.TimeEncounter`;
//    findings §Extra Fishing): `ld a, [wTimeOfDay] / maskbits NUM_DAYTIMES /
//    cp NITE_F / jr c, .time_species / inc hl / inc hl` -- the DAY pair is
//    used when wTimeOfDay < NITE_F (morn counts as day), the NITE pair only
//    when wTimeOfDay >= NITE_F. A `time_group` record therefore expands into
//    two atlas sources per rod (`time: "day"` and `time: "nite"`), each
//    keeping every OTHER (non-time_group) species record in that rod's list
//    unchanged, and substituting that one record's day/nite species+level.
//
// 7. Qwilfish/Remoraid swarm substitution is runtime daily-flag state
//    (`wDailyFlags1`/`wFishingSwarmFlag`, engine/events/fish.asm:92-123,
//    `GetFishGroupIndex`) -- out of scope to resolve; `wildForMap` already
//    tags it as `fishing.swarmVariant`, and this file reports it as a
//    SEPARATE, `conditional: "swarm"` source, never merged into the base
//    group's chances (Decision 5).
function fishRecordPercents(records: readonly GbcFishRodRecord[]): number[] {
  let prev = -1;
  return records.map((r) => {
    const pct = ((r.chance.resolved - prev) / RANDOM_RANGE) * 100;
    prev = r.chance.resolved;
    return pct;
  });
}

function resolveFishChances(
  records: readonly GbcFishRodRecord[],
  percents: readonly number[],
  time: "day" | "nite",
  timeFishGroups: readonly GbcTimeFishEntry[],
): GbcEncounterChance[] {
  const by = new Map<string, GbcEncounterChance>();
  records.forEach((r, i) => {
    const percent = percents[i]!;
    let species: string;
    let level: number;
    if (r.kind === "species") {
      species = r.species;
      level = r.level;
    } else {
      // Bounds-checked at load time (encounters.ts's toRodRecord) -- a
      // dangling time_group reference already refused before this ever runs.
      const row = timeFishGroups[r.timeGroupIndex]!;
      const pair = time === "nite" ? row.nite : row.day;
      species = pair.species;
      level = pair.level;
    }
    const found = by.get(species);
    if (found) {
      found.percent += percent;
      found.minLevel = Math.min(found.minLevel, level);
      found.maxLevel = Math.max(found.maxLevel, level);
    } else {
      by.set(species, { species, percent, minLevel: level, maxLevel: level });
    }
  });
  return [...by.values()].sort((a, b) => b.percent - a.percent);
}

function buildFishSources(group: GbcFishGroup, data: GbcWildData, conditional?: "swarm"): GbcEncounterSource[] {
  const biteChance = rateOf256Percent(group.biteChance.resolved);
  const rods: { rod: GbcFishRod; records: GbcFishRodRecord[] }[] = [
    { rod: "old", records: group.oldRod },
    { rod: "good", records: group.goodRod },
    { rod: "super", records: group.superRod },
  ];
  const out: GbcEncounterSource[] = [];
  for (const { rod, records } of rods) {
    const percents = fishRecordPercents(records);
    if (records.some((r) => r.kind === "timeGroup")) {
      out.push({ method: "fish", rod, time: "day", conditional, biteChance, chances: resolveFishChances(records, percents, "day", data.timeFishGroups) });
      out.push({ method: "fish", rod, time: "nite", conditional, biteChance, chances: resolveFishChances(records, percents, "nite", data.timeFishGroups) });
    } else {
      // No time_group record in this rod's list: "day" vs "nite" resolve
      // identically (there is nothing time-dependent to pick between), so
      // this is a single, time-less source.
      out.push({ method: "fish", rod, conditional, biteChance, chances: resolveFishChances(records, percents, "day", data.timeFishGroups) });
    }
  }
  return out;
}

// 8. Grass/water slot odds (data/wild/probabilities.asm, already parsed as
//    `GbcWildProbabilities`) are plain 0-100 percents conditional on the
//    encounter roll succeeding (`ChooseWildEncounter`'s `.prob_bracket_loop`,
//    engine/overworld/wildmons.asm:263-289: `call Random / cp 100 / jr nc,
//    .randomloop / inc a` rerolls until 1<=a<=100, then walks the cumulative
//    table for the first entry >= a) -- never multiplied by `encounterRate`
//    here (mirrors the GBA model, `packages/core/src/load/encounters.ts`'s
//    own `speciesChances` doc).
function mergeSlots(slots: readonly GbcWildSlot[], slotPercents: readonly number[], levelBuffMax: number): GbcEncounterChance[] {
  // Quality review Minor #3: refuse loudly on a length mismatch rather than
  // defaulting a missing weight to 0% (silently dropping probability mass)
  // -- every other GBC loader in this codebase (parseCollision,
  // parsePaletteMap, parseTileCollisionCategoryTable, parseConstDefs, ...)
  // already refuses on an unexpected shape instead of guessing; this dormant
  // case (grass is always 7 slots, water always 3, matching
  // GbcWildProbabilities.grass/.water) should too, for a future format
  // change or corpus edit.
  if (slots.length !== slotPercents.length) {
    throw new Error(`mergeSlots: ${slots.length} slot(s) but ${slotPercents.length} probability entr(y/ies) -- refusing to treat a missing weight as 0%`);
  }
  const by = new Map<string, GbcEncounterChance>();
  slots.forEach((slot, i) => {
    const percent = slotPercents[i]!;
    const found = by.get(slot.species);
    if (found) {
      found.percent += percent;
      found.minLevel = Math.min(found.minLevel, slot.level);
      found.maxLevel = Math.max(found.maxLevel, slot.level + levelBuffMax);
    } else {
      by.set(slot.species, { species: slot.species, percent, minLevel: slot.level, maxLevel: slot.level + levelBuffMax });
    }
  });
  return [...by.values()].sort((a, b) => b.percent - a.percent);
}

function buildGrassSources(entry: GbcGrassEntry, grassProbs: readonly number[], conditional?: "swarm"): GbcEncounterSource[] {
  return (["morn", "day", "nite"] as const).map((time) => ({
    method: "grass" as const,
    time,
    conditional,
    encounterRate: rateOf256Percent(entry.rates[time].resolved),
    chances: mergeSlots(entry.slots[time], grassProbs, GRASS_WATER_LEVEL_BUFF_MAX),
  }));
}

function buildWaterSource(entry: GbcWaterEntry, waterProbs: readonly number[], conditional?: "swarm"): GbcEncounterSource {
  return {
    method: "water",
    conditional,
    encounterRate: rateOf256Percent(entry.rate.resolved),
    chances: mergeSlots(entry.slots, waterProbs, GRASS_WATER_LEVEL_BUFF_MAX),
  };
}

// 9. Headbutt (`SelectTreeMon`, engine/events/treemons.asm:167-183):
//      ld a, 100 / call RandomRange / .loop: sub [hl] / jr c, .ok / inc hl x3 / jr .loop
//    Each record's percent is subtracted from the running roll in sequence
//    (non-cumulative -- `GbcTreemonRecord.percent` is already the real
//    per-record percent, no cumulative-to-per-slot conversion needed, unlike
//    grass/water probabilities.asm). Which list (common/rare) is read
//    depends on `GetTreeScore` (tree coordinates x player trainer ID) --
//    runtime-unknowable statically, so both lists are reported as separate
//    sources (`list: "common" | "rare"`), never resolved to one (Decision 5,
//    findings §Extra Headbutt/Rock Smash).
//    `GetTreeScore`'s tree score ALSO gates a separate, distinct attempt roll
//    before `SelectTreeMon` is ever reached at all (`GetTreeMon`,
//    engine/events/treemons.asm:125-165): a bad score gets `RandomRange 10 /
//    and a` (10% attempt chance, common list only if it hits), a good score
//    gets `cp 5` (50%, common), a rare score gets `cp 8` (80%, then skips
//    past the common list's `$ff` terminator to read the rare list). This is
//    a real third axis (whether an encounter is attempted at all) this file
//    does not model -- like the common/rare list choice itself, it depends
//    on the same runtime-unknowable tree score, so it is out of scope
//    (task-12-spec.md's "Out of scope"), and unlike rock (which has one flat
//    `encounterRate`), headbutt sources never carry an `encounterRate` field
//    at all, since there is no single number to report.
// 10. TREEMON_SET_CITY yields nothing (`GetTreeMons`, engine/events/
//    treemons.asm:96-99: `cp NUM_TREEMON_SETS / jr nc, .quit / and a / jr z,
//    .quit` -- index 0 is TREEMON_SET_CITY, `and a` on 0 sets Z, so it quits
//    before ever reading the table) -- `wildForMap.headbutt.yieldsNothing`
//    already flags this; this file honours it by emitting NO headbutt
//    source at all for such a map, never the City/Canyon table contents.
function mergeTreemonRecords(records: readonly GbcTreemonRecord[]): GbcEncounterChance[] {
  const by = new Map<string, GbcEncounterChance>();
  for (const r of records) {
    const found = by.get(r.species);
    if (found) {
      found.percent += r.percent;
      found.minLevel = Math.min(found.minLevel, r.level);
      found.maxLevel = Math.max(found.maxLevel, r.level);
    } else {
      by.set(r.species, { species: r.species, percent: r.percent, minLevel: r.level, maxLevel: r.level });
    }
  }
  return [...by.values()].sort((a, b) => b.percent - a.percent);
}

function buildHeadbuttSources(set: GbcTreemonSet | null, yieldsNothing: boolean): GbcEncounterSource[] {
  if (!set || yieldsNothing) return [];
  const out: GbcEncounterSource[] = [{ method: "headbutt", list: "common", chances: mergeTreemonRecords(set.common) }];
  if (set.rare) out.push({ method: "headbutt", list: "rare", chances: mergeTreemonRecords(set.rare) });
  return out;
}

// 11. Rock Smash (`RockMonEncounter`, engine/events/treemons.asm:29-45):
//       ld a, 10 / call RandomRange / cp 4 / jr nc, .no_battle
//     RandomRange 10 returns a uniform 0-9; the attempt proceeds iff that
//     roll < 4, i.e. P = 4/10 = 40% flat (matches findings' "rock = 40%",
//     re-derived here from the actual comparison, not merely trusted).
//     RockMonEncounter then calls `SelectTreeMon` over `common` ONLY -- there
//     is no rare-list branch anywhere in this function (confirmed by
//     reading the whole function body) -- so this NEVER reads `set.rare`,
//     matching `GbcWildForMap.rock`'s own doc comment.
export const ROCK_ENCOUNTER_RATE_PERCENT = 40;

function buildRockSources(set: GbcTreemonSet | null): GbcEncounterSource[] {
  if (!set) return [];
  return [{ method: "rock", encounterRate: ROCK_ENCOUNTER_RATE_PERCENT, chances: mergeTreemonRecords(set.common) }];
}

// 12. Fishing reachability (engine/events/overworld.asm:1663-1664,
//    `FishFunction.TryFish`): `call GetFacingTileCoord / call GetTileCollision
//    / cp WATER_TILE / jr nz, .fail` -- fishing is only ever attempted when
//    the faced tile's collision CATEGORY is `WATER_TILE`. `GetTileCollision`
//    (home/map_objects.asm:88-112) indexes `TileCollisionTable`
//    (data/collision/collision_permissions.asm) by the tile's raw `COLL_*`
//    byte, then masks `and $f` (line 108, "lo nybble only") before returning
//    -- so a category tagged `WATER_TILE | TALK` (e.g. `COLL_WHIRLPOOL`)
//    still reads as water. `loadGbcWaterCollisionValues`
//    (`../load/tileset.ts`) derives the exact set of `COLL_*` values this
//    resolves to, straight from that table -- never hand-listed.
//
// KNOWN OVER-APPROXIMATION (spec-compliant, not a bug -- fix round 1, spec
// review Minor #6). The real engine's `TryFish` also requires the player to
// NOT be surfing (`ld a,[wPlayerState] / cp PLAYER_SURF / jr z,.fail`, right
// before the `GetTileCollision` check above) and to be FACING a water tile
// from an adjacent land tile, not standing IN the water itself. This
// function only checks "does the map's layout contain any water-category
// quadrant at all" -- the spec's own rule (task-12-spec.md item 5), a
// coarser and much cheaper approximation than tracing reachable
// stand-and-face positions. Measured on the real corpus: this over-reports
// fishing as reachable on Route16 and Route18, whose water is fully walled
// in-map (WALL/HEADBUTT_TREE quadrants on every side) with no
// orthogonally-adjacent LAND quadrant to stand on and face it from -- though
// Route18's water might still be genuinely reachable by facing it across the
// Route17 map connection, which this function (a single map's own layout)
// cannot see. No pathfinding or adjacency/connection tracing is implemented
// to close this gap; `gbcCoverage`'s `fishGroupWithoutWater` inherits the
// same coarse rule.
export function gbcMapHasWaterTile(proj: GbcProject, map: Pick<GbcMap, "blkPath" | "width" | "height" | "tileset">): boolean {
  const water = proj.waterCollisionValues();
  const { layout } = proj.layout(map);
  const tileset = proj.tileset(map.tileset);
  for (const block of layout.blocks) {
    const c = tileset.collision[block.metatileId];
    if (!c) continue; // an out-of-range metatile id is a render-time concern, not this check's job
    if (water.has(c.tl) || water.has(c.tr) || water.has(c.bl) || water.has(c.br)) return true;
  }
  return false;
}

/**
 * Every wild-encounter source for one map, pure over `proj` (GBC format
 * findings §Extra "Wild data"/"Fishing"/"Headbutt and Rock Smash"; Decision
 * 5). Grass/water each contribute up to 2×3 sources (base/swarm × morn/day/
 * nite) or 2×1 (water has no time-of-day split -- `ChooseWildEncounter`
 * jumps straight to `.watermon` on water with no `AddNTimes` offset,
 * engine/overworld/wildmons.asm:261-263). Fishing is entirely suppressed
 * (both the base group and any swarm variant) when the map has no reachable
 * water tile (`gbcMapHasWaterTile`) -- a `FISHGROUP_*` on the map header
 * alone is not enough (see this file's item 12 and `gbcCoverage`'s own
 * `fishGroupWithoutWater`). Headbutt is entirely absent for a
 * `yieldsNothing` set. Rock never reads a set's `rare` list.
 *
 * `hasWaterOverride` is an internal perf hook, not part of this function's
 * spec-named 2-argument contract (task-12-spec.md deliverable 2): every
 * ordinary caller omits it and this function computes `gbcMapHasWaterTile`
 * itself, exactly as before. `gbcCoverage` is the one caller that passes it
 * -- quality review Important #1 found `gbcCoverage` computing
 * `gbcMapHasWaterTile` twice per map (once via this function, once again for
 * its own `fishGroupWithoutWater`), each a fresh `.blk` read plus a
 * collision-quadrant scan (`GbcProject.layout` is deliberately uncached).
 * `gbcCoverage` now computes it once per map and threads it through here.
 */
export function gbcEncounterSources(proj: GbcProject, mapName: string, hasWaterOverride?: boolean): GbcEncounterSource[] {
  const map = proj.map(mapName);
  const data = proj.wild();
  const w = wildForMap(data, map);
  const out: GbcEncounterSource[] = [];

  if (w.grass.base) out.push(...buildGrassSources(w.grass.base, data.probabilities.grass));
  if (w.grass.swarm) out.push(...buildGrassSources(w.grass.swarm, data.probabilities.grass, "swarm"));
  if (w.water.base) out.push(buildWaterSource(w.water.base, data.probabilities.water));
  if (w.water.swarm) out.push(buildWaterSource(w.water.swarm, data.probabilities.water, "swarm"));

  const hasWater = hasWaterOverride ?? gbcMapHasWaterTile(proj, map);
  if (hasWater) {
    if (w.fishing.group) out.push(...buildFishSources(w.fishing.group, data));
    if (w.fishing.swarmVariant) out.push(...buildFishSources(w.fishing.swarmVariant, data, "swarm"));
  }

  out.push(...buildHeadbuttSources(w.headbutt.set, w.headbutt.yieldsNothing));
  out.push(...buildRockSources(w.rock));

  return out;
}

/**
 * Uppercases the user's input and strips a leading "SPECIES_" prefix
 * (case-insensitively -- the input is uppercased FIRST, so any casing of the
 * prefix itself, e.g. "species_dunsparce", is stripped too). GBC wild data
 * NEVER carries a "SPECIES_" prefix (unlike the GBA JSON's "SPECIES_x"
 * convention), so both a plain species name and a GBA-style prefixed one
 * resolve to the same bare constant `gbcWhereSpecies` matches on.
 *
 * Moved here from `cli/src/gbcCommands.ts` (Plan 6b Task 2, spec deliverable
 * 1) so the server's `/api/where/:species` route and the CLI's `where`
 * command share one implementation instead of each normalising the same way
 * independently -- `gbcCommands.ts` now imports this rather than declaring
 * its own copy, with its own behaviour and tests unchanged.
 */
export function normalizeGbcSpecies(input: string): string {
  const upper = input.toUpperCase();
  return upper.startsWith("SPECIES_") ? upper.slice("SPECIES_".length) : upper;
}

export interface GbcSpeciesHit extends GbcSourceTags {
  mapName: string;
  mapConst: string;
  percent: number;
  minLevel: number;
  maxLevel: number;
}

/**
 * Every map a species can be encountered on, across every source (grass/
 * water/fish/headbutt/rock, every time/rod/list/conditional variant), sorted
 * by percent descending. `species` is matched on the bare constant name
 * (e.g. "CHIKORITA", "UNOWN") -- GBC wild data never uses a "SPECIES_"
 * prefix (unlike the GBA JSON's "SPECIES_x" convention); the CLI uppercases
 * the user's input before calling this.
 */
export function gbcWhereSpecies(proj: GbcProject, species: string): GbcSpeciesHit[] {
  const out: GbcSpeciesHit[] = [];
  for (const map of proj.maps) {
    for (const s of gbcEncounterSources(proj, map.name)) {
      for (const c of s.chances) {
        if (c.species !== species) continue;
        out.push({
          mapName: map.name,
          mapConst: map.constName,
          method: s.method,
          time: s.time,
          rod: s.rod,
          list: s.list,
          conditional: s.conditional,
          percent: c.percent,
          minLevel: c.minLevel,
          maxLevel: c.maxLevel,
        });
      }
    }
  }
  return out.sort((a, b) => b.percent - a.percent);
}

/**
 * `constants/pokemon_constants.asm`'s real species constants -- BULBASAUR
 * (1) through CELEBI (251), excluding `EGG` and, defensively, `NO_MON`
 * (never actually named in this file's `const_def 1` -- the enum starts its
 * counter at 1, so value 0 has no name at all here). The file has a SECOND,
 * unrelated `const_def 1` block for the `UNOWN_A`..`UNOWN_Z` letter-form
 * enum (its own doc comment: "indexes for UnownWords/UnownPicPointers/...",
 * never a wild-encounter species) -- found by locating the SECOND
 * `const_def` line by regex (never a hand-copied line number) and slicing
 * the text there before handing it to the shared `parseConstDefs`, so those
 * 26 names are never even seen, let alone mistaken for species with tiny
 * (1-26) "unused" pokedex numbers.
 *
 * Every OTHER non-species line in the first block is excluded automatically
 * by `parseConstDefs`'s own shape, never by a special case here (spec
 * review Minor #4 asked this be spelled out): `DEF NUM_POKEMON EQU
 * const_value - 1` (line ~274) and, from the file's very top, `DEF
 * JOHTO_POKEMON EQU ...` are `DEF ... EQU` lines, not `const NAME` lines, so
 * `parseConstDefs`'s `CONST_RE` never matches them at all. `const_skip`
 * (line ~275, the unnamed slot at value 0xfc between CELEBI and EGG) is a
 * bare `const_skip` token with no name to capture -- `parseConstDefs` only
 * ever records a name from a `const NAME` line, so a skip silently advances
 * the counter and emits nothing, exactly as intended.
 */
export function loadGbcSpeciesConstants(root: string): string[] {
  const r = norm(root);
  const file = "constants/pokemon_constants.asm";
  const text = readFileSync(`${r}/${file}`, "utf8");

  const constDefRe = /^\s*const_def\b.*$/gm;
  const first = constDefRe.exec(text);
  if (!first) throw new Error(`loadGbcSpeciesConstants: ${file}: no "const_def" line found`);
  const second = constDefRe.exec(text);
  const speciesText = second ? text.slice(0, second.index) : text;

  const NON_SPECIES = new Set(["NO_MON", "EGG"]);
  return [...parseConstDefs(speciesText).keys()].filter((k) => !NON_SPECIES.has(k)).sort();
}

export interface GbcCoverage {
  /** Distinct maps carrying at least one encounter source, after the
   *  fishing-reachability filter is applied (a FISHGROUP alone doesn't
   *  count if the map has no water tile -- see `fishGroupWithoutWater`). */
  mapsWithEncounters: number;
  mapsWithoutEncounters: string[];
  /** Count of generated `GbcEncounterSource` objects, grouped by method,
   *  across every map -- one grass entry contributes 3 (morn/day/nite),
   *  6 with a swarm variant; one fish group contributes 3-6 (per rod, ×2 for
   *  a time_group split); headbutt 0-2 (common/rare, 0 if yieldsNothing);
   *  rock 0-1. */
  sourcesByMethod: Record<GbcEncounterMethod, number>;
  /** Per map: the simple mean, over every source that map carries, of that
   *  source's own percent-weighted average level ((minLevel+maxLevel)/2,
   *  weighted by percent, within the source). Each SOURCE counts equally
   *  toward the map's average regardless of its own encounterRate/biteChance
   *  or how many species it lists -- e.g. a map with one grass-morn source
   *  (however many species) and one rock source (2 species) averages those
   *  two source-level-curves 50/50, not weighted by species count. This is
   *  a DIFFERENT statistic from GBA's own `coverage()`
   *  (`packages/core/src/analyse/coverage.ts:79-118`), not merely "the same
   *  idea one level up" (fix round 1, spec review Minor #6 flagged an
   *  earlier version of this doc overstating that): GBA pools every chance
   *  from every method/rod/table for a map into ONE flat percent-weighted
   *  average, with no per-table averaging step at all. GBC instead
   *  percent-weight-averages WITHIN each source first, then takes an
   *  UNWEIGHTED arithmetic mean ACROSS those per-source averages -- the
   *  spec's own explicit choice ("weighted equally per source",
   *  task-12-spec.md deliverable 2). */
  levelByMap: { mapName: string; averageLevel: number }[];
  /** `constants/pokemon_constants.asm` species (`loadGbcSpeciesConstants`)
   *  with no chance in ANY generated `GbcEncounterSource`, anywhere in the
   *  corpus (fix round 1, spec review Issue 1) -- built from the same
   *  per-map `gbcEncounterSources` output `gbcWhereSpecies` walks, NOT from
   *  raw presence in `GbcWildData`'s tables. Those two views can disagree: a
   *  species that appears only inside a fish group no map header ever
   *  references at all (e.g. REMORAID -- neither `FISHGROUP_REMORAID` nor
   *  its `FISHGROUP_REMORAID_SWARM` substitution is used by any
   *  `data/maps/maps.asm` entry in this corpus) is present in the raw
   *  `data/wild/fish.asm` text but yields no source on any map, so it is
   *  correctly "unused" here even though a naive raw-table scan would call
   *  it used. */
  unusedSpecies: string[];
  /** Maps whose header names a `FISHGROUP_*` other than `FISHGROUP_NONE`,
   *  but whose layout has no metatile with a WATER_TILE-category collision
   *  quadrant -- fishing is dead data on these maps (item 12/5 above). */
  fishGroupWithoutWater: string[];
  /** `wild().defects` (the kanto_grass.asm missing-terminator warning). */
  defects: DataDefect[];
}

/**
 * Whole-corpus wild-encounter coverage (GBA's `coverage()`,
 * `packages/core/src/analyse/coverage.ts`, is the sibling this mirrors in
 * spirit -- shape differs because the GBC source format does). Iterates
 * `proj.maps` once, calling `gbcMapHasWaterTile` and `gbcEncounterSources`
 * per map -- `wildForMap`'s own linear finds over grass/water/fishGroups/
 * treemonMaps/rockMonMaps (a few hundred entries each) run 391 times, ~10^5
 * comparisons total, which the Task 8 quality review already accepted as
 * fine; this file does not do worse. `gbcMapHasWaterTile` itself is computed
 * exactly ONCE per map (fix round 1, quality review Important #1: an earlier
 * version called it a second time to compute `fishGroupWithoutWater`, each
 * call re-reading the map's `.blk` -- `GbcProject.layout` is deliberately
 * uncached) and threaded into `gbcEncounterSources`'s `hasWaterOverride`.
 *
 * `unusedSpecies` is built from the species that actually show up in the
 * generated sources below (`usedSpecies`), never from raw presence in
 * `GbcWildData` -- see `GbcCoverage.unusedSpecies`'s own doc for why that
 * distinction matters (REMORAID).
 */
export function gbcCoverage(proj: GbcProject): GbcCoverage {
  const allSpecies = loadGbcSpeciesConstants(proj.root);
  const usedSpecies = new Set<string>();

  const mapsWithoutEncounters: string[] = [];
  const sourcesByMethod: Record<GbcEncounterMethod, number> = { grass: 0, water: 0, fish: 0, headbutt: 0, rock: 0 };
  const levelByMap: { mapName: string; averageLevel: number }[] = [];
  const fishGroupWithoutWater: string[] = [];
  let mapsWithEncounters = 0;

  for (const map of proj.maps) {
    const hasWater = gbcMapHasWaterTile(proj, map);
    const sources = gbcEncounterSources(proj, map.name, hasWater);
    if (sources.length === 0) {
      mapsWithoutEncounters.push(map.name);
    } else {
      // A map with only a swarm source (e.g. no base grass/water entry at
      // all, only a `data/wild/swarm_grass.asm` one) still counts as "with
      // encounters" -- `sources.length > 0` is the only test, with no
      // special-casing of `conditional === "swarm"` (fix round 1, spec
      // review M8: pinned by a dedicated fixture map + test in atlas.test.ts).
      mapsWithEncounters++;
      const sourceAverages: number[] = [];
      for (const s of sources) {
        sourcesByMethod[s.method]++;
        let weighted = 0;
        let total = 0;
        for (const c of s.chances) {
          usedSpecies.add(c.species);
          weighted += ((c.minLevel + c.maxLevel) / 2) * c.percent;
          total += c.percent;
        }
        if (total > 0) sourceAverages.push(weighted / total);
      }
      if (sourceAverages.length > 0) {
        levelByMap.push({ mapName: map.name, averageLevel: sourceAverages.reduce((a, b) => a + b, 0) / sourceAverages.length });
      }
    }

    if (map.fishGroup !== "FISHGROUP_NONE" && !hasWater) {
      fishGroupWithoutWater.push(map.name);
    }
  }

  const unusedSpecies = allSpecies.filter((s) => !usedSpecies.has(s));
  return { mapsWithEncounters, mapsWithoutEncounters, sourcesByMethod, levelByMap, unusedSpecies, fishGroupWithoutWater, defects: proj.wild().defects };
}
