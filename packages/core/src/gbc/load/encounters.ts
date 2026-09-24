/**
 * Wild encounters: grass/water tables (`data/wild/{johto,kanto,swarm}_
 * {grass,water}.asm`), slot-probability odds (`data/wild/probabilities.asm`),
 * fishing (`data/wild/fish.asm`), and headbutt/rock smash
 * (`data/wild/treemon_maps.asm` + `data/wild/treemons.asm`) -- GBC format
 * findings §Extra, "Wild data" / "Fishing" / "Headbutt and Rock Smash",
 * Decision 5's grown Task 8 scope.
 */
import { readFileSync } from "node:fs";
import { codeLines, stripComment, matchCall, splitArgs, parseNum, parseConstDefs, labelTail, type LabelTail } from "./asm.js";
import { parseMapConstants } from "./map.js";
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

/** `<file>` or `<file>:<lineIndex+1>` -- the one place that formats a location, shared by `fail` and `at` so they can never drift on it. `lineIndex` is 0-based, as `codeLines`/`scanCalls` report it; `null` when no single line applies (e.g. a whole-table count mismatch, or a missing label). */
function locate(file: string, lineIndex: number | null): string {
  return lineIndex === null ? file : `${file}:${lineIndex + 1}`;
}

/**
 * `<file>[:lineIndex+1]: <message>` -- every *located* refusal in this file
 * goes through this one function or through `at` below (which reuses this
 * same `locate`), so the file+line prefix never drifts between call sites
 * (mirrors `./events.ts`'s `fail`). The only refusal in this file that does
 * NOT go through either is `evalPercent`'s own bare throw, which is
 * deliberately location-free (documented on `evalPercent` itself) until a
 * caller wraps it through `at`.
 */
function fail(file: string, lineIndex: number | null, message: string): never {
  throw new Error(`${locate(file, lineIndex)}: ${message}`);
}

/**
 * Runs a shared, location-free primitive or parsing step (`evalPercent`,
 * `parseNum`, `splitArgs`, `matchCall`, `scanCalls`) and rethrows any error
 * it throws with this call site's location prefix -- those functions know
 * only the text they were given, never which file/line it came from, so
 * every caller that has a location (or the best available anchor -- see
 * `scanCalls`'s call sites, which can throw before any per-call line is
 * known) wraps its call through here instead of letting the bare message
 * escape unlabeled. `lineIndex: null` is valid, exactly as in `fail`, for a
 * whole-scan call with no single closer line to blame.
 */
function at<T>(file: string, lineIndex: number | null, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw new Error(`${locate(file, lineIndex)}: ${(e as Error).message}`);
  }
}

/**
 * Like `asm.ts`'s `scanCalls(text, macro)`, but locates a blank-arg refusal
 * at the exact line it occurred on, not at an anchor for the whole scan.
 * `scanCalls` builds one `AsmArg[]` list per line via `splitArgsWithOffsets`,
 * which can throw (a blank comma-separated arg) partway through scanning the
 * whole `text` -- at that point no single call's line is known yet, so a
 * caller can only wrap the *entire* `scanCalls` call through `at()`, naming
 * either the scan's start line (wrong, if the bad line isn't the first) or
 * no line at all (`treemon_map`, which scans a whole file with no natural
 * anchor). This walks `codeLines(text)` one line at a time instead, so each
 * line's own `matchCall` (and the `splitArgs` inside it) is wrapped through
 * `at()` with that line's own absolute index (`base + line.lineIndex`).
 * Loses `scanCalls`'s byte-accurate per-argument `AsmArg` spans -- nothing in
 * this file reads more than `.text` from one -- but keeps `lineStart` (the
 * line's own byte offset), which `parseTreemonMaps` still needs to split
 * `TreeMonMaps` from `RockMonMaps` by position.
 */
function scanCallLines(text: string, macro: string, file: string, base: number): { lineIndex: number; lineStart: number; args: string[] }[] {
  const out: { lineIndex: number; lineStart: number; args: string[] }[] = [];
  for (const line of codeLines(text)) {
    const lineIndex = base + line.lineIndex;
    const args = at(file, lineIndex, () => matchCall(line.text, macro));
    if (args) out.push({ lineIndex, lineStart: line.start, args });
  }
  return out;
}

/**
 * The real `percent` operator (`macros/data.asm`: `DEF percent EQUS "* $ff /
 * 100"`) -- `N percent` = floor(N*255/100), RGBDS integer division. Supports
 * only the shapes that occur in the corpus: `N percent`, `N percent + k`, `N
 * percent - k`. Refuses (throws, naming the text) anything else rather than
 * guessing. Location-free (no file/line): callers with a location wrap this
 * through `at()`.
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
    readDb(context: string, endMacroRe: RegExp): { lineIndex: number; args: string[] } {
      while (i < cl.length) {
        const stripped = stripComment(cl[i]!.text).trim();
        const lineIndex = cl[i]!.lineIndex;
        i++;
        if (stripped === "" || endMacroRe.test(stripped)) continue;
        const m = stripped.match(/^db\s+(.*)$/);
        if (!m) fail(file, lineIndex, `${context}: expected a "db" line, found "${stripped}"`);
        return { lineIndex, args: at(file, lineIndex, () => splitArgs(m[1]!)) };
      }
      fail(file, null, `${context}: unexpected end of file while reading wild data`);
    },
  };
}

function readSlots(cursor: ReturnType<typeof makeWildCursor>, count: number, context: string, endMacroRe: RegExp, file: string): GbcWildSlot[] {
  return Array.from({ length: count }, () => {
    const { lineIndex, args } = cursor.readDb(context, endMacroRe);
    if (args.length !== 2) fail(file, lineIndex, `${context}: slot line has ${args.length} argument(s), expected 2`);
    const [level, species] = args;
    return { level: at(file, lineIndex, () => parseNum(level!)), species: species! };
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
export function parseGrassFile(text: string, file: string, options: { swarm?: boolean } = {}): { entries: GbcGrassEntry[]; defects: DataDefect[] } {
  const { swarm = false } = options;
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
    const call = at(file, cursor.lineIndex(), () => matchCall(stripped, "def_grass_wildmons") ?? matchCall(stripped, "map_id"));
    if (!call) fail(file, cursor.lineIndex(), `unexpected line while scanning grass wild data: "${stripped}"`);
    if (call.length !== 1) fail(file, cursor.lineIndex(), `grass block header has ${call.length} argument(s), expected 1: "${stripped}"`);
    const mapConst = call[0]!;
    const lineIndex = cursor.lineIndex();
    cursor.skip();

    const rateLine = cursor.readDb(mapConst, endRe);
    if (rateLine.args.length !== 3) fail(file, rateLine.lineIndex, `${mapConst}: rate line has ${rateLine.args.length} argument(s), expected 3`);
    const rates = {
      morn: at(file, rateLine.lineIndex, () => evalPercent(rateLine.args[0]!)),
      day: at(file, rateLine.lineIndex, () => evalPercent(rateLine.args[1]!)),
      nite: at(file, rateLine.lineIndex, () => evalPercent(rateLine.args[2]!)),
    };
    const slots = {
      morn: readSlots(cursor, NUM_GRASS_SLOTS, mapConst, endRe, file),
      day: readSlots(cursor, NUM_GRASS_SLOTS, mapConst, endRe, file),
      nite: readSlots(cursor, NUM_GRASS_SLOTS, mapConst, endRe, file),
    };
    entries.push({ mapConst, file, swarm, rates, slots, lineIndex });
  }

  const defects: DataDefect[] = terminated
    ? []
    : [{ file, message: `${file}: no "db -1" terminator found -- end of file ends the list (Decision 4)` }];
  return { entries, defects };
}

/** `data/wild/{johto,kanto,swarm}_water.asm`. Same shape as `parseGrassFile`, 1 rate + 3 slots. */
export function parseWaterFile(text: string, file: string, options: { swarm?: boolean } = {}): { entries: GbcWaterEntry[]; defects: DataDefect[] } {
  const { swarm = false } = options;
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
    const call = at(file, cursor.lineIndex(), () => matchCall(stripped, "def_water_wildmons") ?? matchCall(stripped, "map_id"));
    if (!call) fail(file, cursor.lineIndex(), `unexpected line while scanning water wild data: "${stripped}"`);
    if (call.length !== 1) fail(file, cursor.lineIndex(), `water block header has ${call.length} argument(s), expected 1: "${stripped}"`);
    const mapConst = call[0]!;
    const lineIndex = cursor.lineIndex();
    cursor.skip();

    const rateLine = cursor.readDb(mapConst, endRe);
    if (rateLine.args.length !== 1) fail(file, rateLine.lineIndex, `${mapConst}: rate line has ${rateLine.args.length} argument(s), expected 1`);
    const rate = at(file, rateLine.lineIndex, () => evalPercent(rateLine.args[0]!));
    const slots = readSlots(cursor, NUM_WATER_SLOTS, mapConst, endRe, file);
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
 * `file` defaults to the real repo-relative path; callers other than
 * `loadGbcWildData` (i.e. unit tests) may pass a fixture name instead.
 */
export function parseWildProbabilities(text: string, file = "data/wild/probabilities.asm"): GbcWildProbabilities {
  const grassTail = getLabelTail(text, "GrassMonProbTable", file);
  const waterTail = getLabelTail(text, "WaterMonProbTable", file);
  return {
    grass: cumulativeToPerSlot(grassTail, file, NUM_GRASS_SLOTS),
    water: cumulativeToPerSlot(waterTail, file, NUM_WATER_SLOTS),
  };
}

/**
 * `asm.ts`'s `labelTail`, with its own bare `no "X:" label found` throw
 * routed through `fail(file, null, ...)` -- `labelTail` deliberately leaves
 * that prefix to its callers (its own doc says so), and every sibling
 * missing-label refusal in this file (`FishGroups`, `TimeFishGroups`,
 * `TreeMons`) already does this via `fail`. There used to be a private
 * `labelTailText` here duplicating `labelTail`'s exact logic for this file's
 * plain-global-label case (no stacking, no local labels needed) -- confirmed
 * a drop-in replacement (code-quality review), so it's gone.
 */
function getLabelTail(text: string, label: string, file: string): LabelTail {
  try {
    return labelTail(text, label);
  } catch (e) {
    return fail(file, null, (e as Error).message);
  }
}

/**
 * Converts a `mon_prob cumulativePercent, index` run into per-slot
 * percentages, refusing (naming file+line) unless the table has exactly
 * `expectedCount` entries, every index in `0..expectedCount-1` appears
 * exactly once, the cumulative values are non-decreasing in index order
 * (equal consecutive values are a legal 0%-chance slot, not an error), and
 * the last one is exactly 100 -- the real corpus's own shape (both
 * `GrassMonProbTable` and `WaterMonProbTable` end at `mon_prob 100, ...`), so
 * this never fires on real data, only on a malformed/mutated table that
 * would otherwise silently produce a wrong-length or wrong-valued array.
 * `mon_prob` lines need not appear in index order in the source (none in the
 * corpus don't, but nothing requires it) -- sorted by index before the
 * cumulative-to-per-slot diff, so an out-of-order table still yields the
 * correct per-slot values.
 */
function cumulativeToPerSlot(tail: LabelTail, file: string, expectedCount: number): number[] {
  const calls = scanCallLines(tail.text, "mon_prob", file, tail.lineIndex);
  if (calls.length !== expectedCount) {
    // Anchored at the label's own line (tail.lineIndex - 1), consistent with
    // FishGroups'/TreeMons' own count-mismatch refusals, which use the
    // label's line rather than the tail's first body line.
    fail(file, tail.lineIndex - 1, `expected ${expectedCount} "mon_prob" line(s), found ${calls.length}`);
  }

  const parsed = calls.map((c) => {
    if (c.args.length !== 2) fail(file, c.lineIndex, `"mon_prob" has ${c.args.length} argument(s), expected 2`);
    return {
      lineIndex: c.lineIndex,
      index: at(file, c.lineIndex, () => parseNum(c.args[1]!)),
      cumulative: at(file, c.lineIndex, () => parseNum(c.args[0]!)),
    };
  });

  const seenIndices = new Set<number>();
  for (const e of parsed) {
    if (e.index < 0 || e.index >= expectedCount) {
      fail(file, e.lineIndex, `"mon_prob" index ${e.index} is out of range 0..${expectedCount - 1}`);
    }
    if (seenIndices.has(e.index)) {
      fail(file, e.lineIndex, `"mon_prob" index ${e.index} is a duplicate`);
    }
    seenIndices.add(e.index);
  }

  const sorted = [...parsed].sort((a, b) => a.index - b.index);
  let prev = 0;
  const perSlot = sorted.map((e) => {
    if (e.cumulative < prev) {
      fail(file, e.lineIndex, `"mon_prob" cumulative value ${e.cumulative} is less than the previous entry's ${prev} -- the table must be non-decreasing`);
    }
    const v = e.cumulative - prev;
    prev = e.cumulative;
    return v;
  });
  if (prev !== 100) {
    fail(file, sorted[sorted.length - 1]!.lineIndex, `"mon_prob" table ends at cumulative ${prev}, expected 100`);
  }
  return perSlot;
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
 * which `labelTail`'s own next-label regex does not match. `lineIndex` is
 * the label's own absolute line; `bodyLineIndex` is the body's first line --
 * for a stacked run these differ only for the earlier aliases, since the
 * body always starts right after the LAST label's own line.
 */
function labelSections(text: string): Map<string, { body: string; lineIndex: number; bodyLineIndex: number }> {
  const re = /^(\.?[A-Za-z_][A-Za-z0-9_]*)::?[ \t]*(?:;.*)?$/gm;
  const marks: { name: string; start: number; end: number; lineIndex: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lineIndex = text.slice(0, m.index).split("\n").length - 1;
    marks.push({ name: m[1]!, start: m.index, end: m.index + m[0].length, lineIndex });
  }
  const out = new Map<string, { body: string; lineIndex: number; bodyLineIndex: number }>();
  let i = 0;
  while (i < marks.length) {
    let j = i;
    while (j + 1 < marks.length && text.slice(marks[j]!.end, marks[j + 1]!.start).trim() === "") j++;
    const nl = text.indexOf("\n", marks[j]!.end);
    const bodyStart = nl === -1 ? text.length : nl + 1;
    const bodyEnd = j + 1 < marks.length ? marks[j + 1]!.start : text.length;
    const body = text.slice(bodyStart, bodyEnd);
    const bodyLineIndex = marks[j]!.lineIndex + 1;
    for (let k = i; k <= j; k++) out.set(marks[k]!.name, { body, lineIndex: marks[k]!.lineIndex, bodyLineIndex });
    i = j + 1;
  }
  return out;
}

/**
 * One `db pct, SPECIES, level` / `db pct, time_group n` rod record line,
 * parsed from its already-split `db` args. `time_group` (`DEF time_group
 * EQUS "0,"`, fish.asm:1) is a pseudo-op only valid as the entire 2nd arg of
 * an exact 2-arg record (`db 100 percent, time_group 0`) -- any arg starting
 * with `time_group` that shows up somewhere else (e.g. a 3-arg record like
 * `db 100 percent, time_group 0, 5`, which is `time_group`'s own 2-arg shape
 * plus a stray extra byte) refuses rather than being silently read as a
 * species record whose "species" is the literal text `"time_group 0"`.
 * `timeFishGroupsCount` (`parseFishGroups` parses `TimeFishGroups` first so
 * this is known here) bounds `n`: a dangling reference past the end of
 * `TimeFishGroups` refuses at this record's own line, the same treatment an
 * unknown set/fish-group const already gets elsewhere in this file, rather
 * than loading a `timeGroupIndex` a consumer can only resolve to `undefined`.
 */
function toRodRecord(args: string[], file: string, lineIndex: number, timeFishGroupsCount: number): GbcFishRodRecord {
  const chance = at(file, lineIndex, () => evalPercent(args[0]!));
  const secondArgIsTimeGroup = args.length >= 2 && /^time_group\b/.test(args[1]!);
  if (args.length === 2) {
    const tg = args[1]!.match(/^time_group\s+(\d+)$/);
    if (tg) {
      const timeGroupIndex = parseNum(tg[1]!);
      if (timeGroupIndex >= timeFishGroupsCount) {
        fail(file, lineIndex, `rod record: time_group ${timeGroupIndex} is out of range -- TimeFishGroups has ${timeFishGroupsCount} row(s)`);
      }
      return { chance, kind: "timeGroup", timeGroupIndex };
    }
  }
  if (args.length === 3 && !secondArgIsTimeGroup) {
    return { chance, kind: "species", species: args[1]!, level: at(file, lineIndex, () => parseNum(args[2]!)) };
  }
  fail(file, lineIndex, `rod record: "${args.join(", ")}" is neither a 3-arg species record nor a 2-arg time_group reference`);
}

/**
 * Every non-blank `db ...` line in a label's body, comma-split into args (no
 * terminator in rod tables -- GBC format findings §Extra, Fishing), each
 * tagged with its absolute file line index. Built on `asm.ts`'s `codeLines`
 * for the line split (it handles `\r\n` and a lone trailing `\r`), the same
 * primitive every other line-scanner in this file uses, rather than a second
 * hand `.split`.
 */
function dbLinesIn(body: string, bodyLineIndex: number, file: string): { args: string[]; lineIndex: number }[] {
  const out: { args: string[]; lineIndex: number }[] = [];
  for (const { lineIndex: relIndex, text: rawLine } of codeLines(body)) {
    const stripped = stripComment(rawLine).trim();
    if (stripped === "") continue;
    const lineIndex = bodyLineIndex + relIndex;
    const m = stripped.match(/^db\s+(.*)$/);
    if (!m) fail(file, lineIndex, `expected a "db" line, found "${stripped}"`);
    out.push({ args: at(file, lineIndex, () => splitArgs(m[1]!)), lineIndex });
  }
  return out;
}

/**
 * `data/wild/fish.asm`. `groupNamesInOrder` must already be sorted by their
 * real `FISHGROUP_*` enum value with `FISHGROUP_NONE` excluded (index 0 =
 * `FISHGROUP_SHORE`, GBC format findings §Extra, Fishing) -- callers derive
 * this from `constants/map_data_constants.asm` (`loadGbcWildData` does; unit
 * tests pass a literal array). `file` defaults to the real repo-relative
 * path; unit tests may pass a fixture name instead.
 */
export function parseFishGroups(
  text: string,
  groupNamesInOrder: string[],
  file = "data/wild/fish.asm",
): { fishGroups: GbcFishGroup[]; timeFishGroups: GbcTimeFishEntry[] } {
  const sections = labelSections(text);
  const fishGroupsSection = sections.get("FishGroups");
  if (!fishGroupsSection) fail(file, null, `no "FishGroups:" label found`);

  // Parsed before the rod tables below, so a rod record's time_group
  // reference can be bounds-checked against the real row count right where
  // it's read (toRodRecord), rather than after the fact with no line to
  // blame.
  const timeSection = sections.get("TimeFishGroups");
  if (!timeSection) fail(file, null, `no "TimeFishGroups:" label found`);
  const timeFishGroups: GbcTimeFishEntry[] = dbLinesIn(timeSection.body, timeSection.bodyLineIndex, file).map(({ args, lineIndex }, index) => {
    if (args.length !== 4) fail(file, lineIndex, `TimeFishGroups row ${index}: ${args.length} argument(s), expected 4`);
    const [daySpecies, dayLevel, niteSpecies, niteLevel] = args;
    return {
      index,
      day: { species: daySpecies!, level: at(file, lineIndex, () => parseNum(dayLevel!)) },
      nite: { species: niteSpecies!, level: at(file, lineIndex, () => parseNum(niteLevel!)) },
    };
  });

  const calls = scanCallLines(fishGroupsSection.body, "fishgroup", file, fishGroupsSection.bodyLineIndex);
  if (calls.length !== groupNamesInOrder.length) {
    fail(file, fishGroupsSection.lineIndex, `FishGroups has ${calls.length} "fishgroup" line(s), expected ${groupNamesInOrder.length}`);
  }

  const rodRecords = (label: string): GbcFishRodRecord[] => {
    const section = sections.get(label);
    if (!section) fail(file, fishGroupsSection.lineIndex, `no "${label}:" label found (referenced from FishGroups)`);
    return dbLinesIn(section.body, section.bodyLineIndex, file).map(({ args, lineIndex }) => toRodRecord(args, file, lineIndex, timeFishGroups.length));
  };

  const fishGroups: GbcFishGroup[] = calls.map((c, index) => {
    if (c.args.length !== 4) fail(file, c.lineIndex, `"fishgroup" has ${c.args.length} argument(s), expected 4`);
    const [chance, oldLabel, goodLabel, superLabel] = c.args;
    return {
      constName: groupNamesInOrder[index]!,
      index,
      biteChance: at(file, c.lineIndex, () => evalPercent(chance!)),
      oldRod: rodRecords(oldLabel!),
      goodRod: rodRecords(goodLabel!),
      superRod: rodRecords(superLabel!),
    };
  });

  return { fishGroups, timeFishGroups };
}

/** One `db pct, SPECIES, level` list, terminated by `db -1`. Returns the list and how many body lines it consumed. */
function readTreemonList(bodyLines: { args: string[]; lineIndex: number }[], file: string): { records: GbcTreemonRecord[]; consumed: number } {
  const records: GbcTreemonRecord[] = [];
  let consumed = 0;
  for (const { args, lineIndex } of bodyLines) {
    consumed++;
    if (args.length === 1 && args[0] === "-1") return { records, consumed };
    if (args.length !== 3) fail(file, lineIndex, `treemon record: "${args.join(", ")}" has ${args.length} argument(s), expected 3`);
    records.push({
      percent: at(file, lineIndex, () => parseNum(args[0]!)),
      species: args[1]!,
      level: at(file, lineIndex, () => parseNum(args[2]!)),
    });
  }
  fail(file, bodyLines.length > 0 ? bodyLines[bodyLines.length - 1]!.lineIndex : null, `treemon list: ran out of lines before a "db -1" terminator`);
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
 * quits before ever reading it. Every set's body is a common list plus an
 * optional rare list, each `db -1`-terminated (the corpus's real shape,
 * `data/wild/treemons.asm`) -- any further non-blank line after the rare
 * list refuses rather than being silently dropped. `file` defaults to the
 * real repo-relative path; unit tests may pass a fixture name instead.
 */
export function parseTreemonSets(text: string, setNamesInOrder: string[], file = "data/wild/treemons.asm"): GbcTreemonSet[] {
  const sections = labelSections(text);
  const treeMonsSection = sections.get("TreeMons");
  if (!treeMonsSection) fail(file, null, `no "TreeMons:" label found`);
  const treeMonsBody = treeMonsSection.body;

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
    fail(file, treeMonsSection.lineIndex, `TreeMons has ${pointerLabels.length} pointer(s), expected ${setNamesInOrder.length}`);
  }

  return pointerLabels.map((label, index) => {
    const section = sections.get(label);
    if (!section) fail(file, treeMonsSection.lineIndex, `no "${label}:" label found (referenced from TreeMons[${index}])`);
    const bodyLines = dbLinesIn(section.body, section.bodyLineIndex, file);
    const first = readTreemonList(bodyLines, file);
    const rest = bodyLines.slice(first.consumed);
    let rare: GbcTreemonRecord[] | null = null;
    if (rest.length > 0) {
      const second = readTreemonList(rest, file);
      rare = second.records;
      const leftover = rest.slice(second.consumed);
      if (leftover.length > 0) {
        fail(file, leftover[0]!.lineIndex, `${label}: unexpected data after the rare list ("${leftover[0]!.args.join(", ")}")`);
      }
    }
    return { constName: setNamesInOrder[index]!, index, yieldsNothing: index === 0, common: first.records, rare };
  });
}

/**
 * `data/wild/treemon_maps.asm`: `TreeMonMaps:` (headbutt) then
 * `RockMonMaps:` (rock smash), each a run of `treemon_map MAP_CONST,
 * TREEMON_SET_*` lines, `db -1`-terminated. Split by each call's own byte
 * offset against the `RockMonMaps:` label's position, not by the
 * terminator -- robust regardless of whether either terminator is present.
 * `file` defaults to the real repo-relative path; unit tests may pass a
 * fixture name instead.
 */
export function parseTreemonMaps(
  text: string,
  file = "data/wild/treemon_maps.asm",
): { treemonMaps: GbcTreemonMapEntry[]; rockMonMaps: GbcTreemonMapEntry[] } {
  const rockLabel = /^RockMonMaps:/m.exec(text);
  const splitOffset = rockLabel ? rockLabel.index : text.length;

  const treemonMaps: GbcTreemonMapEntry[] = [];
  const rockMonMaps: GbcTreemonMapEntry[] = [];
  for (const c of scanCallLines(text, "treemon_map", file, 0)) {
    if (c.args.length !== 2) fail(file, c.lineIndex, `"treemon_map" has ${c.args.length} argument(s), expected 2`);
    const entry: GbcTreemonMapEntry = { mapConst: c.args[0]!, setConst: c.args[1]!, lineIndex: c.lineIndex };
    (c.lineStart < splitOffset ? treemonMaps : rockMonMaps).push(entry);
  }
  return { treemonMaps, rockMonMaps };
}

/** `Map<name, value>` filtered to keys starting with `prefix`, sorted by value ascending, names only -- turns a raw `parseConstDefs` map into the ordered array `parseFishGroups`/`parseTreemonSets` need. */
function orderedNames(consts: Map<string, number>, prefix: string, options: { excludeZero?: boolean } = {}): string[] {
  const { excludeZero = false } = options;
  return [...consts]
    .filter(([k, v]) => k.startsWith(prefix) && !(excludeZero && v === 0))
    .sort((a, b) => a[1] - b[1])
    .map(([k]) => k);
}

/**
 * Reads and joins every `data/wild/*.asm` file into one `GbcWildData` (GBC
 * format findings §Extra, "Wild data" / "Fishing" / "Headbutt and Rock
 * Smash"; Decision 5). Never throws for a recoverable defect (the missing
 * `kanto_grass.asm` terminator) -- it's returned in `defects` instead. Does
 * throw, naming the file and 1-based line, when a grass/water entry or a
 * treemon/rock map row names a map const that isn't a real `map_const` in
 * `constants/map_constants.asm`, or when a treemon/rock row's set const
 * isn't one of the `TREEMON_SET_*` names derived from
 * `constants/pokemon_data_constants.asm` -- neither of these is a
 * recoverable defect (an unknown const is malformed source, not a known
 * corpus quirk).
 */
export function loadGbcWildData(root: string): GbcWildData {
  const r = norm(root);
  const read = (p: string): string => readFileSync(`${r}/${p}`, "utf8");

  const johtoGrass = parseGrassFile(read("data/wild/johto_grass.asm"), "data/wild/johto_grass.asm");
  const kantoGrass = parseGrassFile(read("data/wild/kanto_grass.asm"), "data/wild/kanto_grass.asm");
  const swarmGrass = parseGrassFile(read("data/wild/swarm_grass.asm"), "data/wild/swarm_grass.asm", { swarm: true });

  const johtoWater = parseWaterFile(read("data/wild/johto_water.asm"), "data/wild/johto_water.asm");
  const kantoWater = parseWaterFile(read("data/wild/kanto_water.asm"), "data/wild/kanto_water.asm");
  const swarmWater = parseWaterFile(read("data/wild/swarm_water.asm"), "data/wild/swarm_water.asm", { swarm: true });

  const probabilities = parseWildProbabilities(read("data/wild/probabilities.asm"), "data/wild/probabilities.asm");

  const mapDataConsts = parseConstDefs(read("constants/map_data_constants.asm"));
  const fishGroupNames = orderedNames(mapDataConsts, "FISHGROUP_", { excludeZero: true });
  const { fishGroups, timeFishGroups } = parseFishGroups(read("data/wild/fish.asm"), fishGroupNames, "data/wild/fish.asm");

  const pokemonDataConsts = parseConstDefs(read("constants/pokemon_data_constants.asm"));
  const treemonSetNames = orderedNames(pokemonDataConsts, "TREEMON_SET_");
  const treemonSets = parseTreemonSets(read("data/wild/treemons.asm"), treemonSetNames, "data/wild/treemons.asm");

  const treemonMapsFile = "data/wild/treemon_maps.asm";
  const { treemonMaps, rockMonMaps } = parseTreemonMaps(read(treemonMapsFile), treemonMapsFile);

  const mapConstNames = new Set(parseMapConstants(read("constants/map_constants.asm")).map((c) => c.constName));
  const treemonSetConstNames = new Set(treemonSetNames);

  const grass = [...johtoGrass.entries, ...kantoGrass.entries, ...swarmGrass.entries];
  const water = [...johtoWater.entries, ...kantoWater.entries, ...swarmWater.entries];

  for (const g of grass) {
    if (!mapConstNames.has(g.mapConst)) fail(g.file, g.lineIndex, `unknown map constant "${g.mapConst}" (not in constants/map_constants.asm)`);
  }
  for (const w of water) {
    if (!mapConstNames.has(w.mapConst)) fail(w.file, w.lineIndex, `unknown map constant "${w.mapConst}" (not in constants/map_constants.asm)`);
  }
  for (const t of [...treemonMaps, ...rockMonMaps]) {
    if (!mapConstNames.has(t.mapConst)) {
      fail(treemonMapsFile, t.lineIndex, `unknown map constant "${t.mapConst}" (not in constants/map_constants.asm)`);
    }
    if (!treemonSetConstNames.has(t.setConst)) {
      fail(treemonMapsFile, t.lineIndex, `unknown treemon set constant "${t.setConst}" (not one of the TREEMON_SET_* names derived from constants/pokemon_data_constants.asm)`);
    }
  }

  return {
    grass,
    water,
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
 * Resolves a `treemon_map`/`RockMonMaps` row's set const against
 * `data.treemonSets`, or `null` when there is no row at all. Throws, naming
 * the map and the unknown const, when a row exists but its set const does
 * not resolve -- `loadGbcWildData` already refuses an unknown set const at
 * load time, so this is defense in depth (and what a hand-built `GbcWildData`
 * in a unit test exercises directly), kept consistent with the unknown-
 * fish-group throw below rather than silently falling back to `null`.
 */
function resolveTreemonSet(data: GbcWildData, entry: GbcTreemonMapEntry | null, mapName: string): GbcTreemonSet | null {
  if (!entry) return null;
  const set = data.treemonSets.find((s) => s.constName === entry.setConst);
  if (!set) throw new Error(`wildForMap: ${mapName}: unknown treemon set "${entry.setConst}"`);
  return set;
}

/**
 * Every wild-encounter source for one map (GBC format findings §Extra, Wild
 * data / Fishing / Headbutt and Rock Smash; Decision 5). `FISHGROUP_NONE`
 * yields `fishing.group: null`; the Qwilfish/Remoraid swarm substitution is
 * tagged in `fishing.swarmVariant`, never resolved (it depends on runtime
 * daily-flag state this loader has no access to). `TREEMON_SET_CITY` maps
 * still resolve a `headbutt.set` (so callers can see which set it nominally
 * is) but `yieldsNothing` is true for them.
 *
 * `rock` returns the full resolved `GbcTreemonSet`, `rare` list included,
 * even though the engine's rock path never reads it: `RockMonEncounter`
 * (engine/events/treemons.asm) calls `GetTreeMons` then `SelectTreeMon` over
 * `common` only, with no rare-list branch. A set is shared data (the same
 * `TREEMON_SET_*` row can be pointed at by both a `TreeMonMaps` and a
 * `RockMonMaps` row), so this loader does not refuse a `rare` list on a set
 * referenced only by rock rows -- see `GbcWildForMap.rock`'s own doc.
 *
 * Grass/water lookups search `data.grass`/`data.water` as one concatenated
 * Johto+Kanto(+swarm) list and take the first match for a given `swarm`
 * flag, rather than picking one regional list the way the engine's
 * `IsInJohto` does. That is equivalent on this corpus only because no map
 * const appears in more than one non-swarm grass entry, and none in more
 * than one non-swarm water entry (pinned by a corpus test) -- it is not
 * engine-faithful by construction, and a corpus where a map const appeared
 * in both regional lists would need this to pick a side.
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
  const headbuttSet = resolveTreemonSet(data, treemonEntry, map.name);

  const rockEntry = data.rockMonMaps.find((t) => t.mapConst === map.constName) ?? null;
  const rockSet = resolveTreemonSet(data, rockEntry, map.name);

  return {
    grass: { base: findGrass(false), swarm: findGrass(true) },
    water: { base: findWater(false), swarm: findWater(true) },
    fishing: { group, swarmVariant },
    headbutt: { set: headbuttSet, yieldsNothing: headbuttSet?.yieldsNothing ?? false },
    rock: rockSet,
  };
}
