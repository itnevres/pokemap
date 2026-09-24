/**
 * Wild encounters: grass/water tables (`data/wild/{johto,kanto,swarm}_
 * {grass,water}.asm`), slot-probability odds (`data/wild/probabilities.asm`),
 * fishing (`data/wild/fish.asm`), and headbutt/rock smash
 * (`data/wild/treemon_maps.asm` + `data/wild/treemons.asm`) -- GBC format
 * findings §Extra, "Wild data" / "Fishing" / "Headbutt and Rock Smash",
 * Decision 5's grown Task 8 scope.
 */
import { readFileSync } from "node:fs";
import { codeLines, stripComment, matchCall, scanCalls, splitArgs, parseNum, parseConstDefs } from "./asm.js";
import { norm } from "../../config/paths.js";
import type {
  DataDefect,
  GbcFishGroup,
  GbcFishRodRecord,
  GbcGrassEntry,
  GbcMap,
  GbcPercentValue,
  GbcTimeFishEntry,
  GbcTreemonMapEntry,
  GbcTreemonRecord,
  GbcTreemonSet,
  GbcWaterEntry,
  GbcWildData,
  GbcWildForMap,
  GbcWildProbabilities,
  GbcWildSlot,
} from "../model/types.js";

const NUM_GRASS_SLOTS = 7;
const NUM_WATER_SLOTS = 3;

/** A bare `Label:`/`Label::` line with no data of its own -- the file's own top-of-table label (`JohtoGrassWildMons:`, `SwarmGrassWildMons:`, ...), skipped like blank/comment lines while scanning for block headers. */
const TOP_LABEL_RE = /^[A-Za-z_][A-Za-z0-9_]*::?$/;

/** FISHGROUP_QWILFISH/REMORAID swap to the *_SWARM group only when the daily flag is set and wFishingSwarmFlag matches (engine/events/fish.asm `GetFishGroupIndex`) -- tagged here, never resolved (Decision 5). */
const FISH_SWARM_OF = new Map<string, string>([
  ["FISHGROUP_QWILFISH", "FISHGROUP_QWILFISH_SWARM"],
  ["FISHGROUP_REMORAID", "FISHGROUP_REMORAID_SWARM"],
]);

/**
 * The real `percent` operator (`macros/data.asm`: `DEF percent EQUS "* $ff /
 * 100"`) -- `N percent` = floor(N*255/100), RGBDS integer division. Supports
 * only the shapes that occur in the corpus: `N percent`, `N percent + k`, `N
 * percent - k`. Refuses (throws, naming the text) anything else rather than
 * guessing.
 */
export function evalPercent(expr: string): GbcPercentValue {
  const raw = expr.trim();
  const m = raw.match(/^(\d+)\s*percent(?:\s*([+-])\s*(\d+))?$/);
  if (!m) throw new Error(`evalPercent: "${raw}" is not a recognized "N percent[ +/- k]" expression`);
  const base = Math.floor((parseNum(m[1]!) * 255) / 100);
  const delta = m[2] ? (m[2] === "+" ? 1 : -1) * parseNum(m[3]!) : 0;
  return { raw, resolved: base + delta };
}

/**
 * A cursor over a file's non-macro-body lines (`codeLines`) that reads the
 * next `db <args>` line, skipping blank lines, comment-only lines, and an
 * optional end-of-block assert line (`end_grass_wildmons`/
 * `end_water_wildmons`) -- both wrapper macros are pure asserts with no
 * byte emission (GBC format findings §Extra, Wild data), so skipping them
 * unconditionally is safe and lets a block's fixed slot count alone decide
 * where it ends, with no dependency on whether the outer table terminator
 * (`db -1`) is present (Decision 4).
 */
function makeWildCursor(text: string, file: string) {
  const cl = codeLines(text);
  let i = 0;
  return {
    atEnd: () => i >= cl.length,
    peekStripped: () => (i < cl.length ? stripComment(cl[i]!.text).trim() : null),
    lineIndex: () => cl[i]!.lineIndex,
    skip: () => {
      i++;
    },
    readDb(context: string, endMacroRe: RegExp): string[] {
      while (i < cl.length) {
        const stripped = stripComment(cl[i]!.text).trim();
        i++;
        if (stripped === "" || endMacroRe.test(stripped)) continue;
        const m = stripped.match(/^db\s+(.*)$/);
        if (!m) throw new Error(`${file}: ${context}: expected a "db" line, found "${stripped}"`);
        return splitArgs(m[1]!);
      }
      throw new Error(`${file}: ${context}: unexpected end of file while reading wild data`);
    },
  };
}

function readSlots(cursor: ReturnType<typeof makeWildCursor>, count: number, context: string, endMacroRe: RegExp): GbcWildSlot[] {
  return Array.from({ length: count }, () => {
    const [level, species] = cursor.readDb(context, endMacroRe);
    if (level === undefined || species === undefined) {
      throw new Error(`${context}: slot line has fewer than 2 arguments`);
    }
    return { level: parseNum(level), species };
  });
}

/**
 * `data/wild/{johto,kanto,swarm}_grass.asm`. Block headers are either
 * `def_grass_wildmons MAP` (johto_grass.asm, kanto_grass.asm) or a bare
 * `map_id MAP` (swarm_grass.asm's real shape -- it never uses the
 * def_/end_grass_wildmons wrapper). Tolerates a missing outer `db -1`
 * terminator (kanto_grass.asm's real defect, Decision 4): EOF ends the
 * list, and a `DataDefect` naming `file` is returned instead of thrown.
 */
export function parseGrassFile(text: string, file: string, swarm = false): { entries: GbcGrassEntry[]; defects: DataDefect[] } {
  const cursor = makeWildCursor(text, file);
  const endRe = /^end_grass_wildmons\b/;
  const entries: GbcGrassEntry[] = [];
  let terminated = false;

  while (!cursor.atEnd()) {
    const stripped = cursor.peekStripped()!;
    if (stripped === "" || endRe.test(stripped) || TOP_LABEL_RE.test(stripped)) {
      cursor.skip();
      continue;
    }
    if (/^db\s+-1\b/.test(stripped)) {
      cursor.skip();
      terminated = true;
      break;
    }
    const call = matchCall(stripped, "def_grass_wildmons") ?? matchCall(stripped, "map_id");
    if (!call) throw new Error(`${file}: unexpected line while scanning grass wild data: "${stripped}"`);
    if (call.length !== 1) throw new Error(`${file}: grass block header has ${call.length} argument(s), expected 1: "${stripped}"`);
    const mapConst = call[0]!;
    const lineIndex = cursor.lineIndex();
    cursor.skip();

    const rateArgs = cursor.readDb(mapConst, endRe);
    if (rateArgs.length !== 3) throw new Error(`${file}: ${mapConst}: rate line has ${rateArgs.length} argument(s), expected 3`);
    const rates = { morn: evalPercent(rateArgs[0]!), day: evalPercent(rateArgs[1]!), nite: evalPercent(rateArgs[2]!) };
    const slots = {
      morn: readSlots(cursor, NUM_GRASS_SLOTS, mapConst, endRe),
      day: readSlots(cursor, NUM_GRASS_SLOTS, mapConst, endRe),
      nite: readSlots(cursor, NUM_GRASS_SLOTS, mapConst, endRe),
    };
    entries.push({ mapConst, file, swarm, rates, slots, lineIndex });
  }

  const defects: DataDefect[] = terminated
    ? []
    : [{ file, message: `${file}: no "db -1" terminator found -- end of file ends the list (Decision 4)` }];
  return { entries, defects };
}

/** `data/wild/{johto,kanto,swarm}_water.asm`. Same shape as `parseGrassFile`, 1 rate + 3 slots. */
export function parseWaterFile(text: string, file: string, swarm = false): { entries: GbcWaterEntry[]; defects: DataDefect[] } {
  const cursor = makeWildCursor(text, file);
  const endRe = /^end_water_wildmons\b/;
  const entries: GbcWaterEntry[] = [];
  let terminated = false;

  while (!cursor.atEnd()) {
    const stripped = cursor.peekStripped()!;
    if (stripped === "" || endRe.test(stripped) || TOP_LABEL_RE.test(stripped)) {
      cursor.skip();
      continue;
    }
    if (/^db\s+-1\b/.test(stripped)) {
      cursor.skip();
      terminated = true;
      break;
    }
    const call = matchCall(stripped, "def_water_wildmons") ?? matchCall(stripped, "map_id");
    if (!call) throw new Error(`${file}: unexpected line while scanning water wild data: "${stripped}"`);
    if (call.length !== 1) throw new Error(`${file}: water block header has ${call.length} argument(s), expected 1: "${stripped}"`);
    const mapConst = call[0]!;
    const lineIndex = cursor.lineIndex();
    cursor.skip();

    const rateArgs = cursor.readDb(mapConst, endRe);
    if (rateArgs.length !== 1) throw new Error(`${file}: ${mapConst}: rate line has ${rateArgs.length} argument(s), expected 1`);
    const rate = evalPercent(rateArgs[0]!);
    const slots = readSlots(cursor, NUM_WATER_SLOTS, mapConst, endRe);
    entries.push({ mapConst, file, swarm, rate, slots, lineIndex });
  }

  const defects: DataDefect[] = terminated
    ? []
    : [{ file, message: `${file}: no "db -1" terminator found -- end of file ends the list (Decision 4)` }];
  return { entries, defects };
}

/**
 * `data/wild/probabilities.asm`: `GrassMonProbTable`/`WaterMonProbTable`,
 * each a run of `mon_prob cumulativePercent, index` calls. Never hardcoded
 * -- PerfPlus changed both from vanilla (GBC format findings, top matter).
 */
export function parseWildProbabilities(text: string): GbcWildProbabilities {
  const grassTail = labelTailText(text, "GrassMonProbTable");
  const waterTail = labelTailText(text, "WaterMonProbTable");
  return { grass: cumulativeToPerSlot(grassTail), water: cumulativeToPerSlot(waterTail) };
}

/** Bounds `text` from right after `${label}:`'s own line to the next `Label:` line (or EOF) -- a plain global-label tail, no stacking needed for this file. */
function labelTailText(text: string, label: string): string {
  const m = new RegExp(`^${label}:[^\\n]*$`, "m").exec(text);
  if (!m) throw new Error(`no "${label}:" label found`);
  const lineStart = m.index + m[0].length;
  const nl = text.indexOf("\n", lineStart);
  const bodyStart = nl === -1 ? text.length : nl + 1;
  const nextLabel = /^[A-Za-z_][A-Za-z0-9_]*:/m.exec(text.slice(bodyStart));
  return nextLabel ? text.slice(bodyStart, bodyStart + nextLabel.index) : text.slice(bodyStart);
}

function cumulativeToPerSlot(text: string): number[] {
  const entries = scanCalls(text, "mon_prob")
    .map((c) => ({ index: parseNum(c.args[1]!.text), cumulative: parseNum(c.args[0]!.text) }))
    .sort((a, b) => a.index - b.index);
  let prev = 0;
  return entries.map((e) => {
    const v = e.cumulative - prev;
    prev = e.cumulative;
    return v;
  });
}

/**
 * Finds every `Label:` or `.Label:` line (optionally `::`, optional trailing
 * comment) and the body text between its own line and the next label line
 * (or EOF). Stacked labels with nothing between them (`TreeMonSet_City:` /
 * `TreeMonSet_Canyon:` back to back) share the body that starts after the
 * LAST label in the run -- both aliases resolve to the identical bytes, as
 * the real corpus data does (GBC format findings §Extra, "Headbutt and Rock
 * Smash": City/Canyon are byte-identical). This is a data-body variant of
 * `./asm.ts`'s `labelTail` (built for one *global* label with a directive
 * tail); it also accepts local (`.dot`) labels for `fish.asm`'s rod tables,
 * which `labelTail`'s own next-label regex does not match.
 */
function labelSections(text: string): Map<string, { body: string; lineIndex: number }> {
  const re = /^(\.?[A-Za-z_][A-Za-z0-9_]*)::?[ \t]*(?:;.*)?$/gm;
  const marks: { name: string; start: number; end: number; lineIndex: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lineIndex = text.slice(0, m.index).split("\n").length - 1;
    marks.push({ name: m[1]!, start: m.index, end: m.index + m[0].length, lineIndex });
  }
  const out = new Map<string, { body: string; lineIndex: number }>();
  let i = 0;
  while (i < marks.length) {
    let j = i;
    while (j + 1 < marks.length && text.slice(marks[j]!.end, marks[j + 1]!.start).trim() === "") j++;
    const nl = text.indexOf("\n", marks[j]!.end);
    const bodyStart = nl === -1 ? text.length : nl + 1;
    const bodyEnd = j + 1 < marks.length ? marks[j + 1]!.start : text.length;
    const body = text.slice(bodyStart, bodyEnd);
    for (let k = i; k <= j; k++) out.set(marks[k]!.name, { body, lineIndex: marks[k]!.lineIndex });
    i = j + 1;
  }
  return out;
}

/** One `db pct, SPECIES, level` / `db pct, time_group n` rod record line, parsed from its already-split `db` args. */
function toRodRecord(args: string[]): GbcFishRodRecord {
  const chance = evalPercent(args[0]!);
  if (args.length === 2) {
    const tg = args[1]!.match(/^time_group\s+(\d+)$/);
    if (tg) return { chance, kind: "timeGroup", timeGroupIndex: parseNum(tg[1]!) };
  }
  if (args.length === 3) return { chance, kind: "species", species: args[1]!, level: parseNum(args[2]!) };
  throw new Error(`rod record: "${args.join(", ")}" is neither a 3-arg species record nor a 2-arg time_group reference`);
}

/** Every non-blank `db ...` line in a label's body, comma-split into args (no terminator in rod tables -- GBC format findings §Extra, Fishing). */
function dbLinesIn(body: string): string[][] {
  const out: string[][] = [];
  for (const rawLine of body.split(/\r\n|\n/)) {
    const stripped = stripComment(rawLine).trim();
    if (stripped === "") continue;
    const m = stripped.match(/^db\s+(.*)$/);
    if (!m) throw new Error(`expected a "db" line, found "${stripped}"`);
    out.push(splitArgs(m[1]!));
  }
  return out;
}

/**
 * `data/wild/fish.asm`. `groupNamesInOrder` must already be sorted by their
 * real `FISHGROUP_*` enum value with `FISHGROUP_NONE` excluded (index 0 =
 * `FISHGROUP_SHORE`, GBC format findings §Extra, Fishing) -- callers derive
 * this from `constants/map_data_constants.asm` (`loadGbcWildData` does; unit
 * tests pass a literal array).
 */
export function parseFishGroups(
  text: string,
  groupNamesInOrder: string[],
): { fishGroups: GbcFishGroup[]; timeFishGroups: GbcTimeFishEntry[] } {
  const sections = labelSections(text);
  const fishGroupsBody = sections.get("FishGroups")?.body;
  if (fishGroupsBody === undefined) throw new Error(`no "FishGroups:" label found`);
  const calls = scanCalls(fishGroupsBody, "fishgroup");
  if (calls.length !== groupNamesInOrder.length) {
    throw new Error(`fish.asm: FishGroups has ${calls.length} "fishgroup" line(s), expected ${groupNamesInOrder.length}`);
  }

  const rodRecords = (label: string): GbcFishRodRecord[] => {
    const section = sections.get(label);
    if (!section) throw new Error(`fish.asm: no "${label}:" label found (referenced from FishGroups)`);
    return dbLinesIn(section.body).map(toRodRecord);
  };

  const fishGroups: GbcFishGroup[] = calls.map((c, index) => {
    if (c.args.length !== 4) throw new Error(`fish.asm: "fishgroup" has ${c.args.length} argument(s), expected 4`);
    const [chance, oldLabel, goodLabel, superLabel] = c.args.map((a) => a.text);
    return {
      constName: groupNamesInOrder[index]!,
      index,
      biteChance: evalPercent(chance!),
      oldRod: rodRecords(oldLabel!),
      goodRod: rodRecords(goodLabel!),
      superRod: rodRecords(superLabel!),
    };
  });

  const timeSection = sections.get("TimeFishGroups");
  if (!timeSection) throw new Error(`no "TimeFishGroups:" label found`);
  const timeFishGroups: GbcTimeFishEntry[] = dbLinesIn(timeSection.body).map((args, index) => {
    if (args.length !== 4) throw new Error(`TimeFishGroups row ${index}: ${args.length} argument(s), expected 4`);
    const [daySpecies, dayLevel, niteSpecies, niteLevel] = args;
    return {
      index,
      day: { species: daySpecies!, level: parseNum(dayLevel!) },
      nite: { species: niteSpecies!, level: parseNum(niteLevel!) },
    };
  });

  return { fishGroups, timeFishGroups };
}

/** One `db pct, SPECIES, level` list, terminated by `db -1`. Returns the list and how many body lines it consumed. */
function readTreemonList(bodyLines: string[][]): { records: GbcTreemonRecord[]; consumed: number } {
  const records: GbcTreemonRecord[] = [];
  let consumed = 0;
  for (const args of bodyLines) {
    consumed++;
    if (args.length === 1 && args[0] === "-1") return { records, consumed };
    if (args.length !== 3) throw new Error(`treemon record: "${args.join(", ")}" has ${args.length} argument(s), expected 3`);
    records.push({ percent: parseNum(args[0]!), species: args[1]!, level: parseNum(args[2]!) });
  }
  throw new Error(`treemon list: ran out of lines before a "db -1" terminator`);
}

/**
 * `data/wild/treemons.asm`. `setNamesInOrder` must already be sorted by
 * `TREEMON_SET_*` enum value (index 0 = `TREEMON_SET_CITY`, GBC format
 * findings §Extra, "Headbutt and Rock Smash") -- callers derive this from
 * `constants/pokemon_data_constants.asm`. Resolves each set by its position
 * in the `TreeMons` pointer table, never by file label order, which differs
 * (KCity/KRoute/KTown in the file vs KCITY/KTOWN/KROUTE in the table).
 * `TREEMON_SET_CITY` (index 0) is flagged `yieldsNothing` even though its
 * data is real (shared with Canyon via stacked labels) -- `GetTreeMons`
 * quits before ever reading it.
 */
export function parseTreemonSets(text: string, setNamesInOrder: string[]): GbcTreemonSet[] {
  const sections = labelSections(text);
  const treeMonsBody = sections.get("TreeMons")?.body;
  if (treeMonsBody === undefined) throw new Error(`no "TreeMons:" label found`);

  const pointerLabels: string[] = [];
  let started = false;
  for (const rawLine of treeMonsBody.split(/\r\n|\n/)) {
    const stripped = stripComment(rawLine).trim();
    if (stripped === "") continue;
    const dw = stripped.match(/^dw\s+(\S+)/);
    if (dw) {
      pointerLabels.push(dw[1]!);
      started = true;
      continue;
    }
    if (started) break; // first non-"dw" line after the table started (assert_table_length) ends it -- excludes the trailing "; unused" duplicate entry
  }

  if (pointerLabels.length !== setNamesInOrder.length) {
    throw new Error(`treemons.asm: TreeMons has ${pointerLabels.length} pointer(s), expected ${setNamesInOrder.length}`);
  }

  return pointerLabels.map((label, index) => {
    const section = sections.get(label);
    if (!section) throw new Error(`treemons.asm: no "${label}:" label found (referenced from TreeMons[${index}])`);
    const bodyLines = dbLinesIn(section.body);
    const first = readTreemonList(bodyLines);
    const rest = bodyLines.slice(first.consumed);
    const rare = rest.length > 0 ? readTreemonList(rest).records : null;
    return { constName: setNamesInOrder[index]!, index, yieldsNothing: index === 0, common: first.records, rare };
  });
}

/**
 * `data/wild/treemon_maps.asm`: `TreeMonMaps:` (headbutt) then
 * `RockMonMaps:` (rock smash), each a run of `treemon_map MAP_CONST,
 * TREEMON_SET_*` lines, `db -1`-terminated. Split by each call's own byte
 * offset against the `RockMonMaps:` label's position, not by the
 * terminator -- robust regardless of whether either terminator is present.
 */
export function parseTreemonMaps(text: string): { treemonMaps: GbcTreemonMapEntry[]; rockMonMaps: GbcTreemonMapEntry[] } {
  const rockLabel = /^RockMonMaps:/m.exec(text);
  const splitOffset = rockLabel ? rockLabel.index : text.length;

  const treemonMaps: GbcTreemonMapEntry[] = [];
  const rockMonMaps: GbcTreemonMapEntry[] = [];
  for (const c of scanCalls(text, "treemon_map")) {
    if (c.args.length !== 2) throw new Error(`treemon_maps.asm:${c.lineIndex + 1}: "treemon_map" has ${c.args.length} argument(s), expected 2`);
    const entry: GbcTreemonMapEntry = { mapConst: c.args[0]!.text, setConst: c.args[1]!.text, lineIndex: c.lineIndex };
    (c.lineStart < splitOffset ? treemonMaps : rockMonMaps).push(entry);
  }
  return { treemonMaps, rockMonMaps };
}

/** `Map<name, value>` filtered to keys starting with `prefix`, sorted by value ascending, names only -- turns a raw `parseConstDefs` map into the ordered array `parseFishGroups`/`parseTreemonSets` need. */
function orderedNames(consts: Map<string, number>, prefix: string, excludeZero: boolean): string[] {
  return [...consts]
    .filter(([k, v]) => k.startsWith(prefix) && !(excludeZero && v === 0))
    .sort((a, b) => a[1] - b[1])
    .map(([k]) => k);
}

/**
 * Reads and joins every `data/wild/*.asm` file into one `GbcWildData` (GBC
 * format findings §Extra, "Wild data" / "Fishing" / "Headbutt and Rock
 * Smash"; Decision 5). Never throws for a recoverable defect (the missing
 * `kanto_grass.asm` terminator) -- it's returned in `defects` instead.
 */
export function loadGbcWildData(root: string): GbcWildData {
  const r = norm(root);
  const read = (p: string): string => readFileSync(`${r}/${p}`, "utf8");

  const johtoGrass = parseGrassFile(read("data/wild/johto_grass.asm"), "data/wild/johto_grass.asm");
  const kantoGrass = parseGrassFile(read("data/wild/kanto_grass.asm"), "data/wild/kanto_grass.asm");
  const swarmGrass = parseGrassFile(read("data/wild/swarm_grass.asm"), "data/wild/swarm_grass.asm", true);

  const johtoWater = parseWaterFile(read("data/wild/johto_water.asm"), "data/wild/johto_water.asm");
  const kantoWater = parseWaterFile(read("data/wild/kanto_water.asm"), "data/wild/kanto_water.asm");
  const swarmWater = parseWaterFile(read("data/wild/swarm_water.asm"), "data/wild/swarm_water.asm", true);

  const probabilities = parseWildProbabilities(read("data/wild/probabilities.asm"));

  const mapDataConsts = parseConstDefs(read("constants/map_data_constants.asm"));
  const fishGroupNames = orderedNames(mapDataConsts, "FISHGROUP_", true);
  const { fishGroups, timeFishGroups } = parseFishGroups(read("data/wild/fish.asm"), fishGroupNames);

  const pokemonDataConsts = parseConstDefs(read("constants/pokemon_data_constants.asm"));
  const treemonSetNames = orderedNames(pokemonDataConsts, "TREEMON_SET_", false);
  const treemonSets = parseTreemonSets(read("data/wild/treemons.asm"), treemonSetNames);

  const { treemonMaps, rockMonMaps } = parseTreemonMaps(read("data/wild/treemon_maps.asm"));

  return {
    grass: [...johtoGrass.entries, ...kantoGrass.entries, ...swarmGrass.entries],
    water: [...johtoWater.entries, ...kantoWater.entries, ...swarmWater.entries],
    probabilities,
    fishGroups,
    timeFishGroups,
    treemonSets,
    treemonMaps,
    rockMonMaps,
    defects: [...johtoGrass.defects, ...kantoGrass.defects, ...swarmGrass.defects, ...johtoWater.defects, ...kantoWater.defects, ...swarmWater.defects],
  };
}

/**
 * Every wild-encounter source for one map (GBC format findings §Extra, Wild
 * data / Fishing / Headbutt and Rock Smash; Decision 5). `FISHGROUP_NONE`
 * yields `fishing.group: null`; the Qwilfish/Remoraid swarm substitution is
 * tagged in `fishing.swarmVariant`, never resolved (it depends on runtime
 * daily-flag state this loader has no access to). `TREEMON_SET_CITY` maps
 * still resolve a `headbutt.set` (so callers can see which set it nominally
 * is) but `yieldsNothing` is true for them.
 */
export function wildForMap(data: GbcWildData, map: Pick<GbcMap, "constName" | "fishGroup" | "name">): GbcWildForMap {
  const findGrass = (swarm: boolean) => data.grass.find((e) => e.swarm === swarm && e.mapConst === map.constName) ?? null;
  const findWater = (swarm: boolean) => data.water.find((e) => e.swarm === swarm && e.mapConst === map.constName) ?? null;

  let group: GbcFishGroup | null = null;
  let swarmVariant: GbcFishGroup | null = null;
  if (map.fishGroup !== "FISHGROUP_NONE") {
    group = data.fishGroups.find((g) => g.constName === map.fishGroup) ?? null;
    if (!group) throw new Error(`wildForMap: ${map.name}: unknown fish group "${map.fishGroup}"`);
    const swarmConst = FISH_SWARM_OF.get(group.constName);
    swarmVariant = swarmConst ? data.fishGroups.find((g) => g.constName === swarmConst) ?? null : null;
  }

  const treemonEntry = data.treemonMaps.find((t) => t.mapConst === map.constName) ?? null;
  const headbuttSet = treemonEntry ? data.treemonSets.find((s) => s.constName === treemonEntry.setConst) ?? null : null;

  const rockEntry = data.rockMonMaps.find((t) => t.mapConst === map.constName) ?? null;
  const rockSet = rockEntry ? data.treemonSets.find((s) => s.constName === rockEntry.setConst) ?? null : null;

  return {
    grass: { base: findGrass(false), swarm: findGrass(true) },
    water: { base: findWater(false), swarm: findWater(true) },
    fishing: { group, swarmVariant },
    headbutt: { set: headbuttSet, yieldsNothing: headbuttSet?.yieldsNothing ?? false },
    rock: rockSet,
  };
}
