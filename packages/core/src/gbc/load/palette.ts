/**
 * Per-map BG palette resolution (GBC format findings §3.4). Replicates
 * `engine/gfx/color.asm` `LoadMapPals` exactly:
 *
 *   1. `LoadSpecialMapPalette` (6 tilesets) overrides all 8 BG palettes,
 *      unless it's ICE_PATH in the INDOOR environment (Hall of Fame).
 *   2. Otherwise, `EnvironmentColorsPointers[environment]` picks a table
 *      (`data/maps/environment_colors.asm`), whose row for the resolved
 *      time-of-day gives 8 indices into `TilesetBGPalette` (`bg_tiles.pal`,
 *      42 palettes of 4 colors).
 *   3. For TOWN/ROUTE environments only, `RoofPals[mapGroup]`
 *      (`roofs.pal`) overwrites colors 1-2 of palette PAL_BG_ROOF --
 *      this happens on top of step 1 or step 2, unconditionally.
 *
 * Fix round 1 (spec review): every enum/table this module used to hardcode
 * (environment values, `PALETTE_*`/clock values, the `EnvironmentColorsPointers`
 * `dw` order, `.BrightnessLevels`, the `PAL_BG_*` slot indices) is now parsed
 * from the real constant/asm files instead -- the subject is a fork, and a
 * fork can and does edit these tables (see the PerfPlus vs vanilla diff in
 * the format-findings doc). What is still referenced by literal name (the
 * `SPECIAL_TILESET_LABELS`/`TilesetBGPalette`/`RoofPals`/`MansionPalette1`
 * INCLUDE label strings, and the "TOWN"/"ROUTE"/"INDOOR" environment-name
 * comparisons) is a symbol/identifier lookup, not a hardcoded numeric value
 * or table order -- the same class of by-name lookup the rest of the gbc
 * loader already uses throughout (e.g. `loadGbcTilesetByName`'s `${name}GFX`
 * labels), and was confirmed acceptable by the spec review (I4).
 *
 * Deliberate deviation from the findings doc: it claims IndoorColors (and
 * "maybe others") have only 3 rows (no dark row), and cites this as the
 * reason a missing-row refusal is needed. Reading the real
 * `data/maps/environment_colors.asm` in this repo (HEAD 81ededbe3, the same
 * commit the findings were measured against) shows all 4 blocks
 * (Outdoor/Indoor/Dungeon/Env5Colors) have the full 4 rows (morn/day/nite/
 * dark) -- no real block is short. The refusal is kept anyway (G4: refuse
 * rather than guess) and is pinned by a synthetic unit test instead of a
 * corpus one, since no real file exercises it.
 *
 * Fix round 2 (code-quality review): split into `loadPaletteTables(root)`
 * (every root-keyed file read/parse, once) and pure `resolveFromTables`
 * (the per-map logic), with `resolveMapPalettes` kept as a thin wrapper of
 * both, for I1 -- see `PaletteTables`'s doc comment. `parseConstDefs` moved
 * to `asm.ts` (M1, alongside `parseNum`, to avoid a circular import) since
 * it's no longer tileset-specific. `findClockConstIn` documents its
 * first-match-wins behavior (M2).
 */
import { readFileSync } from "node:fs";
import { norm } from "../../config/paths.js";
import { matchCall, splitArgs, stripComment, stripMacroDefs, parseConstDefs, findDefEquLine } from "./asm.js";
import { parseNum } from "./map.js";
import { parseIncludes } from "./incbin.js";
import type { RGB } from "../../model/types.js";

/** `TILESET_*` constant -> the label its palette is INCLUDEd under in
 *  `engine/tilesets/tileset_palettes.asm` (resolved via `parseIncludes`,
 *  never a hardcoded path -- I4). MANSION is handled separately
 *  (`mansionPalette`) since it patches from two files, not one. This is a
 *  by-name symbol lookup, not a hardcoded value -- confirmed acceptable by
 *  spec review. */
const SPECIAL_TILESET_LABELS: Record<string, string> = {
  TILESET_POKECOM_CENTER: "PokeComPalette",
  TILESET_BATTLE_TOWER_INSIDE: "BattleTowerInsidePalette",
  TILESET_ICE_PATH: "IcePathPalette",
  TILESET_HOUSE: "HousePalette",
  TILESET_RADIO_TOWER: "RadioTowerPalette",
};

/** 5-bit (0-31) GBC color component -> 8-bit (0-0xFF): `(c<<3)|(c>>2)`
 *  (GBC format findings §3.4 step 7 -- a convention choice, pinned here). */
export function rgb5to8(c: number): number {
  return (c << 3) | (c >> 2);
}

/**
 * Parses every `RGB <r,g,b>[, r,g,b, ...]` line in `text` into a flat,
 * source-ordered list of 8-bit `RGB` colors. The `RGB` macro (`macros/gfx.asm`)
 * takes any multiple-of-3 argument count -- `bg_tiles.pal` packs 4 colors
 * (one full palette) per line, the special `.pal` files (house.pal,
 * mansion_1.pal, ...) pack 1. Non-`RGB` lines (blank lines, section-header
 * comments like "; morn") are skipped, never mistaken for data.
 */
export function parsePalColors(text: string, source: string = "<pal>"): RGB[] {
  const out: RGB[] = [];
  for (const line of text.split(/\r\n|\n/)) {
    const args = matchCall(line, "RGB");
    if (!args) continue;
    if (args.length === 0 || args.length % 3 !== 0) {
      throw new Error(`parsePalColors: ${source}: "RGB" line has ${args.length} args, not a positive multiple of 3: "${stripComment(line).trim()}"`);
    }
    for (let i = 0; i < args.length; i += 3) {
      out.push({
        r: rgb5to8(parseNum(args[i]!)),
        g: rgb5to8(parseNum(args[i + 1]!)),
        b: rgb5to8(parseNum(args[i + 2]!)),
      });
    }
  }
  return out;
}

/** Chunks a flat color list into palettes of 4 (one `wBGPals1` slot each). Refuses (throws, naming `source`) a count that isn't a multiple of 4. */
function chunk4(colors: RGB[], source: string): RGB[][] {
  if (colors.length === 0 || colors.length % 4 !== 0) {
    throw new Error(`chunk4: ${source}: ${colors.length} colors is not a positive multiple of 4`);
  }
  const out: RGB[][] = [];
  for (let i = 0; i < colors.length; i += 4) out.push(colors.slice(i, i + 4));
  return out;
}

/**
 * Walks backward from the first line matching `endMarker` to the nearest
 * preceding `const_def` line, and returns that slice (inclusive of both
 * ends) as its own text. Isolates one `const_def`/`const NAME`... enum block
 * out of a large constants file (which may hold many unrelated enums) so it
 * can be handed to `parseConstDefs` without cross-contaminating names from
 * neighboring blocks -- e.g. `constants/map_data_constants.asm` defines the
 * `TOWN..DUNGEON` environment enum immediately followed by the
 * `PALETTE_AUTO..PALETTE_DARK` enum immediately followed by `FISHGROUP_*`;
 * isolating by an enum's own trailing `DEF NUM_<X> EQU const_value` marker
 * keeps each parse scoped to exactly the block it names.
 */
function extractConstDefBlockEndingAt(text: string, endMarker: RegExp, source: string): string {
  const lines = text.split(/\r\n|\n/);
  const endIdx = lines.findIndex((l) => endMarker.test(stripComment(l)));
  if (endIdx === -1) {
    throw new Error(`extractConstDefBlockEndingAt: ${source}: end marker ${endMarker} not found`);
  }
  let startIdx = -1;
  for (let i = endIdx; i >= 0; i--) {
    if (/^\s*const_def\b/.test(stripComment(lines[i]!))) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) {
    throw new Error(`extractConstDefBlockEndingAt: ${source}: no preceding "const_def" line found before the end marker`);
  }
  return lines.slice(startIdx, endIdx + 1).join("\n");
}

/** `constants/map_data_constants.asm`'s `TOWN..DUNGEON` environment enum
 *  (`const_def 1` ... `DEF NUM_ENVIRONMENTS EQU const_value - 1`), parsed by
 *  name -> numeric value, isolated from the neighboring `PALETTE_*`/
 *  `FISHGROUP_*` enums in the same file. */
export function parseEnvironmentConsts(mapDataConstantsText: string): Map<string, number> {
  return parseConstDefs(extractConstDefBlockEndingAt(mapDataConstantsText, /^DEF NUM_ENVIRONMENTS EQU/, "constants/map_data_constants.asm"));
}

/** `constants/map_data_constants.asm`'s `PALETTE_AUTO..PALETTE_DARK` enum
 *  (bare `const_def` ... `DEF NUM_MAP_PALETTES EQU const_value`), isolated
 *  the same way. */
export function parseMapPaletteConsts(mapDataConstantsText: string): Map<string, number> {
  return parseConstDefs(extractConstDefBlockEndingAt(mapDataConstantsText, /^DEF NUM_MAP_PALETTES EQU/, "constants/map_data_constants.asm"));
}

/** `constants/wram_constants.asm`'s `MORN_F..DARKNESS_F` clock-time enum
 *  (bare `const_def` ... `DEF NUM_DAYTIMES EQU const_value`), isolated the
 *  same way from the rest of that (very large) file. */
export function parseClockConsts(wramConstantsText: string): Map<string, number> {
  return parseConstDefs(extractConstDefBlockEndingAt(wramConstantsText, /^DEF NUM_DAYTIMES EQU/, "constants/wram_constants.asm"));
}

/**
 * `data/maps/environment_colors.asm`'s `EnvironmentColorsPointers` table:
 * every `dw .Name` line, in source (= numeric index) order. Index 0 is the
 * table's own "unused" padding entry; real environment values start at 1
 * (`const_def 1`), so it is never queried by `buildEnvironmentBlockMap`.
 * Nothing else in this file uses a bare `dw .Name` line, so no label/bound
 * is needed to isolate the table.
 */
export function parseEnvironmentColorPointers(text: string): string[] {
  const out: string[] = [];
  for (const line of stripMacroDefs(text)) {
    const stripped = stripComment(line);
    const m = stripped.match(/^\s*dw\s+\.([A-Za-z0-9_]+)\s*$/);
    if (m) out.push(m[1]!);
  }
  return out;
}

/**
 * Combines `parseEnvironmentColorPointers`'s table with the parsed
 * environment enum into environment-name -> block-name (e.g.
 * "TOWN" -> "OutdoorColors"), so `resolveEnvironmentPalette` never has to
 * hardcode which environments share a block.
 */
export function buildEnvironmentBlockMap(pointerList: string[], envConsts: Map<string, number>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, value] of envConsts) {
    const label = pointerList[value];
    if (!label) {
      throw new Error(`buildEnvironmentBlockMap: environment "${name}" (value ${value}) has no EnvironmentColorsPointers entry (table has ${pointerList.length})`);
    }
    out.set(name, label);
  }
  return out;
}

const ENV_LABEL_RE = /^\s*\.([A-Za-z0-9_]+):\s*$/;
const DB_RE = /^\s*db\s+(.*)$/;

/**
 * `data/maps/environment_colors.asm`: each `.<Name>Colors:` label is
 * followed by 1+ `db <8 indices>` rows (morn/day/nite/dark, in that source
 * order -- row index = time-of-day index 0-3). The leading
 * `EnvironmentColorsPointers` pointer table (`table_width`/`dw`/
 * `assert_table_length` lines, no leading dot) is inert here and simply
 * never matches either line shape.
 */
export function parseEnvironmentColorBlocks(text: string): Map<string, number[][]> {
  const out = new Map<string, number[][]>();
  let current: number[][] | null = null;
  for (const rawLine of text.split(/\r\n|\n/)) {
    const stripped = stripComment(rawLine);
    if (stripped.trim() === "") continue;

    const label = stripped.match(ENV_LABEL_RE);
    if (label) {
      current = [];
      out.set(label[1]!, current);
      continue;
    }
    const db = stripped.match(DB_RE);
    if (db && current) {
      current.push(splitArgs(db[1]!).map(parseNum));
      continue;
    }
    // Anything else (the pointer table's own lines) is inert.
  }
  return out;
}

/**
 * Resolves one environment's row (at `timeOfDayPal`) to 8 full BG palettes,
 * by looking each of its 8 raw indices up in `bgTilesPal`
 * (`gfx/tilesets/bg_tiles.pal`, 42 entries). Pure and file-I/O-free, so it's
 * unit-testable directly on inline data (used by `resolveMapPalettes`, which
 * supplies the real parsed tables). `envBlockMap` is `buildEnvironmentBlockMap`'s
 * output -- environment name -> block name -- never a hardcoded table.
 *
 * Refuses (throws, naming the environment/block/row or the out-of-range
 * index) rather than guessing (G4) on: an unknown environment name, a block
 * absent from `envBlocks`, a row absent at `timeOfDayPal` (the "missing dark
 * row" case -- never hit by real data here, see this module's doc comment),
 * or an index beyond `bgTilesPal`'s own length.
 */
export function resolveEnvironmentPalette(
  envBlockMap: Map<string, string>,
  envBlocks: Map<string, number[][]>,
  bgTilesPal: RGB[][],
  environment: string,
  timeOfDayPal: number,
): RGB[][] {
  const blockName = envBlockMap.get(environment);
  if (!blockName) {
    throw new Error(`resolveEnvironmentPalette: unknown environment "${environment}"`);
  }
  const rows = envBlocks.get(blockName);
  if (!rows) {
    throw new Error(`resolveEnvironmentPalette: block ".${blockName}:" not found in data/maps/environment_colors.asm`);
  }
  const row = rows[timeOfDayPal];
  if (!row) {
    throw new Error(
      `resolveEnvironmentPalette: environment "${environment}" (.${blockName}) has no row for time-of-day index ${timeOfDayPal} -- only ${rows.length} row(s) defined -- refusing to guess`,
    );
  }
  return row.map((idx) => {
    const pal = bgTilesPal[idx];
    if (!pal) {
      throw new Error(`resolveEnvironmentPalette: bg_tiles.pal has no palette index ${idx} (only ${bgTilesPal.length} present)`);
    }
    return pal;
  });
}

/**
 * `engine/tilesets/timeofday_pals.asm`'s `.BrightnessLevels` table: 8 `dc`
 * rows (one per `PALETTE_*` value, plus 3 dead padding rows -- see
 * `parseBrightnessLevels`'s doc comment), each 4 clock-constant names in
 * source column order. Nothing else in this file uses `dc`, so no label
 * bound is needed.
 */
function parseDcRows(text: string): string[][] {
  const out: string[][] = [];
  for (const line of stripMacroDefs(text)) {
    const args = matchCall(line, "dc");
    if (args) out.push(args);
  }
  return out;
}

function resolveDcRow(row: string[], clockConsts: Map<string, number>, source: string): number[] {
  if (row.length !== 4) {
    throw new Error(`resolveDcRow: ${source}: "dc" row has ${row.length} args, expected 4: "${row.join(", ")}"`);
  }
  return row.map((name) => {
    const v = clockConsts.get(name.trim());
    if (v === undefined) throw new Error(`resolveDcRow: ${source}: unknown clock constant "${name}"`);
    return v;
  });
}

/**
 * `.BrightnessLevels`'s `dc` rows, with each arg resolved from its clock
 * constant name to a number via `clockConsts` (`parseClockConsts`'s output),
 * rather than assuming `MORN_F..DARKNESS_F` are 0-3 -- a fork could renumber
 * them. Exported for the corpus test that pins the parsed+packed bytes
 * against the hand-verified `e4,55,aa,00,ff,e4,e4,e4`.
 */
export function parseBrightnessRows(text: string, clockConsts: Map<string, number>, source: string = "<timeofday_pals.asm>"): number[][] {
  return parseDcRows(text).map((row) => resolveDcRow(row, clockConsts, source));
}

/** Returns the lines strictly between the first line matching `labelRe` and
 *  the next label line (or EOF) -- used to isolate `.UsedFlash`'s own 3-line
 *  body from the rest of `timeofday_pals.asm`. */
function extractLabelSection(text: string, labelRe: RegExp, source: string): string {
  const lines = text.split(/\r\n|\n/);
  const start = lines.findIndex((l) => labelRe.test(stripComment(l).trim()));
  if (start === -1) throw new Error(`extractLabelSection: ${source}: label ${labelRe} not found`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^[A-Za-z_.][\w.]*:/.test(stripComment(l)));
  return rest.slice(0, end === -1 ? rest.length : end).join("\n");
}

/**
 * Finds whichever of `clockConsts`' names appears (as a whole word) in
 * `text`, and returns its numeric value. Used to resolve `.UsedFlash`'s
 * inline `NITE_F` broadcast and `DARKNESS_PALSET`'s `DARKNESS_F` broadcast
 * by reading the constant name each one actually uses, rather than
 * assuming which one it is.
 *
 * First-match-wins (code-quality review M2): it returns the first of
 * `clockConsts`' names (Map iteration = source order) found in `text`, not
 * the specific operand each call site means to read. Both current call
 * sites bound `text` to a narrow, single-purpose section first (a 3-line
 * `.UsedFlash` body; one `EQU` line), so in practice exactly one clock
 * constant ever appears and this is unambiguous -- corpus- and
 * unit-pinned. A future third call site with a *less* tightly bounded
 * `text` (e.g. one that could legitimately mention two different clock
 * constants in the same section, such as a comment naming another `_F`
 * value) would silently pick whichever comes first in `clockConsts`'
 * insertion order rather than refusing -- worth revisiting if that happens.
 */
function findClockConstIn(text: string, clockConsts: Map<string, number>, source: string): number {
  for (const [name, value] of clockConsts) {
    if (new RegExp(`\\b${name}\\b`).test(text)) return value;
  }
  throw new Error(`findClockConstIn: ${source}: none of the known clock constants (${[...clockConsts.keys()].join("/")}) appear in "${text.trim()}"`);
}

/** One `PALETTE_*` value's resolved `.BrightnessLevels` behavior, plus the
 *  `PALETTE_DARK`-only flash/no-flash branch (`ReplaceTimeOfDayPals`
 *  special-cases `PALETTE_DARK` *before* indexing the table, per
 *  `cp PALETTE_DARK / jr z, .NeedsFlash` -- the table's own row 4, all
 *  `DARKNESS_F`, is dead for that value and is never read). */
export interface BrightnessLevels {
  /** Indexed by `PALETTE_*` numeric value; each row is 4 numeric clock
   *  values in source column order (see `resolveTimeOfDayPal`'s doc
   *  comment for the position <-> clock-index relationship). */
  rows: number[][];
  /** Resolved from `.UsedFlash`'s inline broadcast. */
  flashPalette: number;
  /** Resolved from `DARKNESS_PALSET`'s `EQU` expression. */
  noFlashPalette: number;
}

/**
 * Parses `.BrightnessLevels` (`timeofdayPalsText`) plus the
 * `PALETTE_DARK`/flash special case (`.UsedFlash` in the same file,
 * `DARKNESS_PALSET`'s `EQU` in `wramConstantsText`) into a `BrightnessLevels`
 * that `resolveTimeOfDayPal` can use without any hardcoded clock/palette
 * values. Corpus-pinned (`palette.test.ts`) against the packed bytes
 * `e4,55,aa,00,ff,e4,e4,e4`, hand-verified from the real `dc` lines.
 */
export function parseBrightnessLevels(timeofdayPalsText: string, wramConstantsText: string, clockConsts: Map<string, number>): BrightnessLevels {
  // Bounded to the `.BrightnessLevels:` section alone: the same file's fade
  // tables (`.morn`/`.day`/`.nite`/`.darkness`/`.cgbfade`) also use `dc`,
  // with 12 args per line (`rept _NARG/4` packs any multiple of 4) -- an
  // unbounded scan would misparse those as extra BrightnessLevels rows.
  const brightnessSection = extractLabelSection(timeofdayPalsText, /^\.BrightnessLevels:?$/, "engine/tilesets/timeofday_pals.asm");
  const rows = parseBrightnessRows(brightnessSection, clockConsts, "engine/tilesets/timeofday_pals.asm .BrightnessLevels");

  const usedFlashSection = extractLabelSection(timeofdayPalsText, /^\.UsedFlash:?$/, "engine/tilesets/timeofday_pals.asm");
  const flashPalette = findClockConstIn(usedFlashSection, clockConsts, "engine/tilesets/timeofday_pals.asm .UsedFlash");

  // `findDefEquLine` (`asm.ts`, fix round 2 quality review minor #1), not the
  // numeric-parsing `findDefEqu`: DARKNESS_PALSET's value is a compound
  // RGBDS expression naming other constants (`(DARKNESS_F << 6) | ...`), not
  // a plain literal `parseNum` could parse -- `findClockConstIn` below reads
  // the line's own text by name, not by value.
  const darknessPalsetLine = findDefEquLine(wramConstantsText, "DARKNESS_PALSET", "constants/wram_constants.asm");
  const noFlashPalette = findClockConstIn(darknessPalsetLine, clockConsts, "constants/wram_constants.asm DARKNESS_PALSET");

  return { rows, flashPalette, noFlashPalette };
}

/**
 * `ReplaceTimeOfDayPals`/`GetTimePalette` (GBC format findings §3.4 step 1),
 * collapsed to its observable behavior: `PALETTE_DARK` (`darkPaletteIndex`)
 * special-cases to `flashPalette`/`noFlashPalette` before ever touching the
 * table (`cp PALETTE_DARK / jr z, .NeedsFlash`); every other palette indexes
 * `levels.rows[paletteIndex]` and reads column `3 - clockIndex`.
 *
 * That `3 - clockIndex` position is the one piece of this module encoded as
 * fixed logic rather than parsed data: it comes from two immutable engine
 * mechanisms, not a data table -- the `dc` macro's own bit-packing
 * (`macros/data.asm`: `(\1<<6)|(\2<<4)|(\3<<2)|\4`, so the first-listed arg
 * occupies the highest 2 bits) composed with `GetTimePalette`'s fixed
 * `jumptable`/AND-mask dispatch (`.MorningPalette` reads bits 0-1 when
 * `wTimeOfDay` is `MORN_F`=0, `.DarknessPalette` reads bits 6-7 when it's
 * `DARKNESS_F`=3, and so on) -- reproducing it at runtime would mean
 * interpreting the dispatch routine's Z80 opcodes, not parsing a table a
 * fork edits by changing data.
 */
export function resolveTimeOfDayPal(levels: BrightnessLevels, paletteIndex: number, darkPaletteIndex: number, clockIndex: number, flash: boolean): number {
  if (paletteIndex === darkPaletteIndex) {
    return flash ? levels.flashPalette : levels.noFlashPalette;
  }
  const row = levels.rows[paletteIndex];
  if (!row) {
    throw new Error(`resolveTimeOfDayPal: no .BrightnessLevels row for palette index ${paletteIndex}`);
  }
  const col = row[3 - clockIndex];
  if (col === undefined) {
    throw new Error(`resolveTimeOfDayPal: .BrightnessLevels row for palette index ${paletteIndex} has no column for clock index ${clockIndex}`);
  }
  return col;
}

/** `text`'s stacked `INCLUDE`d labels (`gfx/tilesets.asm`-style), as a plain label -> path map. */
function includeLabelMap(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of parseIncludes(text)) {
    for (const label of entry.labels) out.set(label, entry.path);
  }
  return out;
}

/** `roofs.pal`: 27 groups (0-26, index 0 unused), each 2 `RGB` lines --
 *  morn/day (2 colors), then nite (2 colors) -- overwriting colors 1-2 of
 *  the ROOF palette (GBC format findings §3.4 step 4). */
function parseRoofPals(text: string, source: string): { mornDay: [RGB, RGB]; nite: [RGB, RGB] }[] {
  const colors = parsePalColors(text, source);
  if (colors.length === 0 || colors.length % 4 !== 0) {
    throw new Error(`parseRoofPals: ${source}: ${colors.length} colors is not a positive multiple of 4 (2 lines x 2 colors per group)`);
  }
  const out: { mornDay: [RGB, RGB]; nite: [RGB, RGB] }[] = [];
  for (let i = 0; i < colors.length; i += 4) {
    out.push({ mornDay: [colors[i]!, colors[i + 1]!], nite: [colors[i + 2]!, colors[i + 3]!] });
  }
  return out;
}

/**
 * `LoadMansionPalette` (`engine/tilesets/tileset_palettes.asm`): copies
 * `mansion_1.pal`'s first 8 palettes (0-indexed 0-7) verbatim, then patches
 * `palBg.YELLOW` <- `mansion_2.pal` (its only palette), `palBg.WATER` <-
 * `mansion_1` palette 6, `palBg.ROOF` <- `mansion_1` palette 8 (`mansion_1.pal`
 * has 9 palettes total, 0-indexed 0-8 -- read directly from the real asm, not
 * the findings doc's summary, per the task's own instruction).
 */
function mansionPalette(root: string, includes: Map<string, string>, palBg: { water: number; yellow: number; roof: number }): RGB[][] {
  const p1 = includes.get("MansionPalette1");
  const p2 = includes.get("MansionPalette2");
  if (!p1 || !p2) {
    throw new Error(`mansionPalette: "MansionPalette1"/"MansionPalette2" INCLUDE labels not found in engine/tilesets/tileset_palettes.asm`);
  }
  const m1 = chunk4(parsePalColors(readFileSync(`${root}/${p1}`, "utf8"), p1), p1);
  const m2 = parsePalColors(readFileSync(`${root}/${p2}`, "utf8"), p2);
  if (m1.length < 9) {
    throw new Error(`mansionPalette: ${p1}: only ${m1.length} palette(s), mansion needs at least 9 (0-8)`);
  }
  if (m2.length !== 4) {
    throw new Error(`mansionPalette: ${p2}: ${m2.length} color(s), the mansion YELLOW patch needs exactly 4`);
  }
  const pals = m1.slice(0, 8).map((p) => p.slice());
  pals[palBg.water] = m1[6]!; // WATER <- MansionPalette1 palette 6
  pals[palBg.yellow] = m2; // YELLOW <- MansionPalette2
  pals[palBg.roof] = m1[8]!; // ROOF <- MansionPalette1 palette 8
  return pals;
}

/**
 * `LoadSpecialMapPalette` (GBC format findings §3.4 step 2), as a pure
 * lookup against `tables.specialPalettesByTileset`/`tables.mansionPalette`
 * (both preloaded once by `loadPaletteTables`). Returns `null` when no
 * special tileset applies (falls through to the environment path),
 * including the ICE_PATH-in-INDOOR (Hall of Fame) exception.
 */
function resolveSpecialFromTables(tables: PaletteTables, tilesetConst: string, environment: string): RGB[][] | null {
  if (tilesetConst === "TILESET_ICE_PATH" && environment === "INDOOR") return null;
  if (tilesetConst === "TILESET_MANSION") return tables.mansionPalette;
  return tables.specialPalettesByTileset.get(tilesetConst) ?? null;
}

export interface ResolveMapPalettesInput {
  /** e.g. "TILESET_JOHTO" -- the source expression, as `GbcMap.tileset` stores it. */
  tileset: string;
  /** e.g. "TOWN" -- as `GbcMap.environment` stores it. */
  environment: string;
  /** e.g. "PALETTE_AUTO" -- as `GbcMap.palette` stores it. */
  palette: string;
  /** As `GbcMap.group` stores it (1-based `newgroup` order) -- indexes `roofs.pal` directly, no off-by-one (verified: NewBarkTown is `newgroup NEW_BARK ; 24` and `roofs.pal`'s "group 24 (New Bark)" comment agrees). */
  group: number;
}

export interface ResolveMapPalettesOpts {
  /** Clock time to resolve PALETTE_AUTO against. Default "day" (findings' recommended default). */
  time?: "morn" | "day" | "nite";
  /** Whether Flash was used, affecting only PALETTE_DARK maps. Default true (findings' recommended default -- without it PALETTE_DARK is near-black). */
  flash?: boolean;
}

/** Maps this module's own `{time}` option name to the real clock constant's
 *  name -- relates our API surface to a constant *name*, never a value. */
const CLOCK_OPTION_CONST_NAME: Record<"morn" | "day" | "nite", string> = {
  morn: "MORN_F",
  day: "DAY_F",
  nite: "NITE_F",
};

/**
 * Everything `resolveFromTables` needs, parsed from one project root exactly
 * once (code-quality review I1). Every field here is root-keyed, never
 * map-keyed -- the previous single `resolveMapPalettes` function reparsed
 * all of it (constants, `bg_tiles.pal`, `environment_colors.asm`,
 * `roofs.pal`, `timeofday_pals.asm`, the two `tileset_palettes.asm` INCLUDE
 * tables, and every special-tileset `.pal` file) on *every call*, which its
 * own doc comment asked callers to work around by "caching anything keyed
 * only by root" -- advice a caller had no way to act on, since none of
 * these intermediate structures were exposed. `loadPaletteTables` is that
 * cache, made real and exported: a caller resolving many maps (Task 9's
 * per-map render, ~391 maps) calls it once, then calls `resolveFromTables`
 * per map.
 */
export interface PaletteTables {
  palBg: { water: number; yellow: number; roof: number };
  paletteIndexByName: Map<string, number>;
  darkPaletteIndex: number;
  clockIndexByOption: Record<"morn" | "day" | "nite", number>;
  brightness: BrightnessLevels;
  bgTilesPal: RGB[][];
  envBlockMap: Map<string, string>;
  envBlocks: Map<string, number[][]>;
  roofPals: { mornDay: [RGB, RGB]; nite: [RGB, RGB] }[];
  /** `TILESET_*` -> its 8 resolved BG palettes, one entry per `SPECIAL_TILESET_LABELS` key. */
  specialPalettesByTileset: Map<string, RGB[][]>;
  mansionPalette: RGB[][];
}

/**
 * Reads and parses every shared table file this module needs from `root`,
 * exactly once (see `PaletteTables`'s doc comment). Pure I/O + parsing, no
 * per-map logic -- that's `resolveFromTables`.
 */
export function loadPaletteTables(root: string): PaletteTables {
  const r = norm(root);

  const mapDataConstantsText = readFileSync(`${r}/constants/map_data_constants.asm`, "utf8");
  const envConsts = parseEnvironmentConsts(mapDataConstantsText);
  const paletteIndexByName = parseMapPaletteConsts(mapDataConstantsText);

  const wramConstantsText = readFileSync(`${r}/constants/wram_constants.asm`, "utf8");
  const clockConsts = parseClockConsts(wramConstantsText);

  const palBgConsts = parseConstDefs(readFileSync(`${r}/constants/tileset_constants.asm`, "utf8"));
  const palBg = {
    water: requireConst(palBgConsts, "PAL_BG_WATER", "constants/tileset_constants.asm"),
    yellow: requireConst(palBgConsts, "PAL_BG_YELLOW", "constants/tileset_constants.asm"),
    roof: requireConst(palBgConsts, "PAL_BG_ROOF", "constants/tileset_constants.asm"),
  };

  const darkPaletteIndex = requireConst(paletteIndexByName, "PALETTE_DARK", "constants/map_data_constants.asm");
  const clockIndexByOption: Record<"morn" | "day" | "nite", number> = {
    morn: requireConst(clockConsts, CLOCK_OPTION_CONST_NAME.morn, "constants/wram_constants.asm"),
    day: requireConst(clockConsts, CLOCK_OPTION_CONST_NAME.day, "constants/wram_constants.asm"),
    nite: requireConst(clockConsts, CLOCK_OPTION_CONST_NAME.nite, "constants/wram_constants.asm"),
  };

  const timeofdayPalsText = readFileSync(`${r}/engine/tilesets/timeofday_pals.asm`, "utf8");
  const brightness = parseBrightnessLevels(timeofdayPalsText, wramConstantsText, clockConsts);

  const colorAsmIncludes = includeLabelMap(readFileSync(`${r}/engine/gfx/color.asm`, "utf8"));
  const specialIncludes = includeLabelMap(readFileSync(`${r}/engine/tilesets/tileset_palettes.asm`, "utf8"));

  const bgTilesPalPath = colorAsmIncludes.get("TilesetBGPalette");
  if (!bgTilesPalPath) {
    throw new Error(`loadPaletteTables: no INCLUDE label "TilesetBGPalette" found in engine/gfx/color.asm`);
  }
  const bgTilesPal = chunk4(parsePalColors(readFileSync(`${r}/${bgTilesPalPath}`, "utf8"), bgTilesPalPath), bgTilesPalPath);

  // Bare `INCLUDE "data/maps/environment_colors.asm"` in color.asm has no
  // preceding label (unlike TilesetBGPalette/RoofPals), so there is no
  // stacked-label alias to resolve -- this literal path is the only name
  // for this file anywhere in the engine.
  const environmentColorsText = readFileSync(`${r}/data/maps/environment_colors.asm`, "utf8");
  const envBlockMap = buildEnvironmentBlockMap(parseEnvironmentColorPointers(environmentColorsText), envConsts);
  const envBlocks = parseEnvironmentColorBlocks(environmentColorsText);

  // `RoofPals:` in color.asm is followed by a `table_width` directive
  // *before* its `INCLUDE` line (unlike TilesetBGPalette's immediate
  // INCLUDE), which the stacked-label scanner (`parseIncludes`) doesn't
  // tolerate -- it resets the pending label on any intervening line that
  // isn't itself a label or the directive. No aliasing risk exists for this
  // single global table (unlike per-tileset GFX/Coll/PalMap, I4's actual
  // concern), so the path is hardcoded here instead.
  const roofPalsPath = "gfx/tilesets/roofs.pal";
  const roofPals = parseRoofPals(readFileSync(`${r}/${roofPalsPath}`, "utf8"), roofPalsPath);

  const specialPalettesByTileset = new Map<string, RGB[][]>();
  for (const [tilesetConst, label] of Object.entries(SPECIAL_TILESET_LABELS)) {
    const path = specialIncludes.get(label);
    if (!path) {
      throw new Error(`loadPaletteTables: no INCLUDE label "${label}" found in engine/tilesets/tileset_palettes.asm`);
    }
    specialPalettesByTileset.set(tilesetConst, chunk4(parsePalColors(readFileSync(`${r}/${path}`, "utf8"), path), path));
  }

  return {
    palBg,
    paletteIndexByName,
    darkPaletteIndex,
    clockIndexByOption,
    brightness,
    bgTilesPal,
    envBlockMap,
    envBlocks,
    roofPals,
    specialPalettesByTileset,
    mansionPalette: mansionPalette(r, specialIncludes, palBg),
  };
}

/**
 * Resolves one map's 8 BG palettes (4 colors each) from an already-loaded
 * `PaletteTables`, replicating `LoadMapPals` exactly (see this module's top
 * doc comment). Pure -- no file I/O, so a caller resolving many maps pays
 * `loadPaletteTables`'s cost once, not per map (code-quality review I1).
 * `input` may be a `GbcMap` directly (structurally compatible -- extra
 * fields are ignored).
 */
export function resolveFromTables(tables: PaletteTables, input: ResolveMapPalettesInput, opts: ResolveMapPalettesOpts = {}): RGB[][] {
  const time = opts.time ?? "day";
  const flash = opts.flash ?? true;

  const paletteIndex = requireConst(tables.paletteIndexByName, input.palette, "constants/map_data_constants.asm (map palette)");
  const clockIndex = tables.clockIndexByOption[time];
  const timeOfDayPal = resolveTimeOfDayPal(tables.brightness, paletteIndex, tables.darkPaletteIndex, clockIndex, flash);

  let palettes = resolveSpecialFromTables(tables, input.tileset, input.environment);
  if (!palettes) {
    palettes = resolveEnvironmentPalette(tables.envBlockMap, tables.envBlocks, tables.bgTilesPal, input.environment, timeOfDayPal);
  }

  if (input.environment === "TOWN" || input.environment === "ROUTE") {
    const roofRow = tables.roofPals[input.group];
    if (!roofRow) {
      throw new Error(`resolveFromTables: roofs.pal has no group ${input.group} (only ${tables.roofPals.length} present)`);
    }
    const pair = timeOfDayPal < tables.clockIndexByOption.nite ? roofRow.mornDay : roofRow.nite;
    const roof = palettes[tables.palBg.roof]!;
    palettes = palettes.map((pal, i) => (i === tables.palBg.roof ? [roof[0]!, pair[0], pair[1], roof[3]!] : pal));
  }

  return palettes;
}

/**
 * Thin `loadPaletteTables` + `resolveFromTables` wrapper for a single-map
 * call (existing callers/tests). A caller resolving many maps should call
 * `loadPaletteTables` once and `resolveFromTables` per map instead --
 * calling this function per map re-reads and re-parses every shared table
 * file every time (code-quality review I1).
 */
export function resolveMapPalettes(root: string, input: ResolveMapPalettesInput, opts: ResolveMapPalettesOpts = {}): RGB[][] {
  return resolveFromTables(loadPaletteTables(root), input, opts);
}

/** Looks up `name` in a parsed const map, refusing (throwing, naming
 *  `source`) rather than silently resolving to `undefined`. */
function requireConst(consts: Map<string, number>, name: string, source: string): number {
  const v = consts.get(name);
  if (v === undefined) throw new Error(`requireConst: "${name}" not found in ${source}`);
  return v;
}
