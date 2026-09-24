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
 *      (`roofs.pal`) overwrites colors 1-2 of palette 6 (ROOF) --
 *      this happens on top of step 1 or step 2, unconditionally.
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
 */
import { readFileSync } from "node:fs";
import { norm } from "../../config/paths.js";
import { matchCall, splitArgs, stripComment } from "./asm.js";
import { parseNum } from "./map.js";
import { parseIncludes } from "./incbin.js";
import type { RGB } from "../../model/types.js";

const MORN_F = 0;
const DAY_F = 1;
const NITE_F = 2;
const DARKNESS_F = 3;

const CLOCK_INDEX: Record<"morn" | "day" | "nite", number> = { morn: MORN_F, day: DAY_F, nite: NITE_F };

/** `data/maps/environment_colors.asm`'s `EnvironmentColorsPointers` table, but
 *  resolved by environment name instead of the numeric `wEnvironment & 7`
 *  index -- `GbcMap.environment` is already the source constant name
 *  (e.g. "TOWN"), and every mapping below is a direct transcription of that
 *  table's `dw` lines, so there is nothing left to compute by re-deriving
 *  the numeric environment constants. */
const ENV_BLOCK: Record<string, string> = {
  TOWN: "OutdoorColors",
  ROUTE: "OutdoorColors",
  INDOOR: "IndoorColors",
  GATE: "IndoorColors",
  CAVE: "DungeonColors",
  DUNGEON: "DungeonColors",
  ENVIRONMENT_5: "Env5Colors",
};

/** `TILESET_*` constant -> the label its palette is INCLUDEd under in
 *  `engine/tilesets/tileset_palettes.asm` (resolved via `parseIncludes`,
 *  never a hardcoded path -- I4). MANSION is handled separately
 *  (`mansionPalette`) since it patches from two files, not one. */
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
 * supplies the real parsed tables).
 *
 * Refuses (throws, naming the environment/block/row or the out-of-range
 * index) rather than guessing (G4) on: an unknown environment name, a block
 * absent from `envBlocks`, a row absent at `timeOfDayPal` (the "missing dark
 * row" case -- never hit by real data here, see this module's doc comment),
 * or an index beyond `bgTilesPal`'s own length.
 */
export function resolveEnvironmentPalette(
  envBlocks: Map<string, number[][]>,
  bgTilesPal: RGB[][],
  environment: string,
  timeOfDayPal: number,
): RGB[][] {
  const blockName = ENV_BLOCK[environment];
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
 * `engine/tilesets/timeofday_pals.asm` `.BrightnessLevels` / `ReplaceTimeOfDayPals`
 * (GBC format findings §3.4 step 1), collapsed to its observable behavior
 * rather than the packed-nibble table (each row's `dc` args are read out by a
 * `jumptable` keyed on the *matching* clock time, so every row reduces to
 * either "follow the clock" or a constant -- verified against the macro
 * expansion in `macros/data.asm`'s `dc`, see the corpus BrightnessLevels test
 * for the byte-level pin):
 *   - PALETTE_AUTO: `clockIndex` unchanged (identity).
 *   - PALETTE_DAY/NITE/MORN: fixed, regardless of the clock.
 *   - PALETTE_DARK: `DARKNESS_F`, or `NITE_F` if `flash` (`.UsedFlash`).
 */
export function resolveTimeOfDayPal(mapPalette: string, clockIndex: number, flash: boolean): number {
  switch (mapPalette) {
    case "PALETTE_AUTO":
      return clockIndex;
    case "PALETTE_DAY":
      return DAY_F;
    case "PALETTE_NITE":
      return NITE_F;
    case "PALETTE_MORN":
      return MORN_F;
    case "PALETTE_DARK":
      return flash ? NITE_F : DARKNESS_F;
    default:
      throw new Error(`resolveTimeOfDayPal: unknown map palette "${mapPalette}"`);
  }
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
 * YELLOW(4) <- `mansion_2.pal` (its only palette), WATER(3) <- `mansion_1`
 * palette 6, ROOF(6) <- `mansion_1` palette 8 (`mansion_1.pal` has 9
 * palettes total, 0-indexed 0-8 -- read directly from the real asm, not the
 * findings doc's summary, per the task's own instruction).
 */
function mansionPalette(root: string, includes: Map<string, string>): RGB[][] {
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
  pals[3] = m1[6]!; // WATER <- MansionPalette1 palette 6
  pals[4] = m2; // YELLOW <- MansionPalette2
  pals[6] = m1[8]!; // ROOF <- MansionPalette1 palette 8
  return pals;
}

/**
 * `LoadSpecialMapPalette` (GBC format findings §3.4 step 2). Returns `null`
 * when no special tileset applies (falls through to the environment path),
 * including the ICE_PATH-in-INDOOR (Hall of Fame) exception.
 */
function resolveSpecialPalette(root: string, includes: Map<string, string>, tilesetConst: string, environment: string): RGB[][] | null {
  if (tilesetConst === "TILESET_ICE_PATH" && environment === "INDOOR") return null;
  if (tilesetConst === "TILESET_MANSION") return mansionPalette(root, includes);

  const label = SPECIAL_TILESET_LABELS[tilesetConst];
  if (!label) return null;
  const path = includes.get(label);
  if (!path) {
    throw new Error(`resolveSpecialPalette: no INCLUDE label "${label}" found in engine/tilesets/tileset_palettes.asm`);
  }
  return chunk4(parsePalColors(readFileSync(`${root}/${path}`, "utf8"), path), path);
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

/**
 * Resolves the 8 BG palettes (4 colors each) a map would have in
 * `wBGPals1` at rest, replicating `LoadMapPals` exactly (see this module's
 * doc comment). `input` may be a `GbcMap` directly (structurally compatible
 * -- extra fields are ignored).
 *
 * Parses every shared table file (bg_tiles.pal, environment_colors.asm,
 * roofs.pal, and the two tileset_palettes.asm INCLUDE tables) at most once
 * per call. A caller resolving many maps should cache anything keyed only
 * by root on its own side, the way `loadGbcTileset`'s own doc comment asks
 * of its callers.
 */
export function resolveMapPalettes(root: string, input: ResolveMapPalettesInput, opts: ResolveMapPalettesOpts = {}): RGB[][] {
  const r = norm(root);
  const time = opts.time ?? "day";
  const flash = opts.flash ?? true;
  const timeOfDayPal = resolveTimeOfDayPal(input.palette, CLOCK_INDEX[time], flash);

  const colorAsmIncludes = includeLabelMap(readFileSync(`${r}/engine/gfx/color.asm`, "utf8"));
  const specialIncludes = includeLabelMap(readFileSync(`${r}/engine/tilesets/tileset_palettes.asm`, "utf8"));

  let palettes = resolveSpecialPalette(r, specialIncludes, input.tileset, input.environment);
  if (!palettes) {
    const bgTilesPalPath = colorAsmIncludes.get("TilesetBGPalette");
    if (!bgTilesPalPath) {
      throw new Error(`resolveMapPalettes: no INCLUDE label "TilesetBGPalette" found in engine/gfx/color.asm`);
    }
    const bgTilesPal = chunk4(parsePalColors(readFileSync(`${r}/${bgTilesPalPath}`, "utf8"), bgTilesPalPath), bgTilesPalPath);
    // Bare `INCLUDE "data/maps/environment_colors.asm"` in color.asm has no
    // preceding label (unlike TilesetBGPalette/RoofPals), so there is no
    // stacked-label alias to resolve -- this literal path is the only name
    // for this file anywhere in the engine.
    const envBlocks = parseEnvironmentColorBlocks(readFileSync(`${r}/data/maps/environment_colors.asm`, "utf8"));
    palettes = resolveEnvironmentPalette(envBlocks, bgTilesPal, input.environment, timeOfDayPal);
  }

  if (input.environment === "TOWN" || input.environment === "ROUTE") {
    // `RoofPals:` in color.asm is followed by a `table_width` directive
    // *before* its `INCLUDE` line (unlike TilesetBGPalette's immediate
    // INCLUDE), which the stacked-label scanner (`parseIncludes`) doesn't
    // tolerate -- it resets the pending label on any intervening line that
    // isn't itself a label or the directive. No aliasing risk exists for
    // this single global table (unlike per-tileset GFX/Coll/PalMap, I4's
    // actual concern), so the path is hardcoded here instead.
    const roofPalsPath = "gfx/tilesets/roofs.pal";
    const roofPals = parseRoofPals(readFileSync(`${r}/${roofPalsPath}`, "utf8"), roofPalsPath);
    const roofRow = roofPals[input.group];
    if (!roofRow) {
      throw new Error(`resolveMapPalettes: ${roofPalsPath} has no group ${input.group} (only ${roofPals.length} present)`);
    }
    const pair = timeOfDayPal < NITE_F ? roofRow.mornDay : roofRow.nite;
    const roof = palettes[6]!;
    palettes = palettes.map((pal, i) => (i === 6 ? [roof[0]!, pair[0], pair[1], roof[3]!] : pal));
  }

  return palettes;
}
