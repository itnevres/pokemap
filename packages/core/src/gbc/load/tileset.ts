import { readFileSync } from "node:fs";
import type { Collision, GbcTileset, Metatile, PaletteMapEntry } from "../model/types.js";
import { norm } from "../../config/paths.js";
import { codeLines, stripMacroDefs, stripComment, matchCall, parseConstDefs } from "./asm.js";
import { parseIncbins, parseIncludes } from "./incbin.js";
import { parseNum } from "./map.js";
import { readShadesPng } from "./png.js";

/**
 * `_metatiles.bin` is headerless: 16-byte records, each a 4x4 grid of tile
 * ids, row-major, no attribute bits (GBC format findings §3.2). The
 * per-tileset metatile count is `buf.length / 16` and is NOT a constant --
 * measured 40 (forest), 64 (most) or 128 (johto/johto_modern/kanto/
 * battle_tower_outside/unused_johto). Never derive the count from collision
 * data; `forest_collision.asm` has 64 lines for only 40 metatiles.
 *
 * Task 5 extends this file with palette-map and collision loading.
 */
export function parseMetatiles(buf: Buffer, source: string = "<metatiles>"): Metatile[] {
  if (buf.length % 16 !== 0) {
    throw new Error(`parseMetatiles: ${source}: buffer length ${buf.length} is not a multiple of 16`);
  }
  const out: Metatile[] = new Array(buf.length / 16);
  for (let i = 0; i < out.length; i++) {
    out[i] = { tiles: [...buf.subarray(i * 16, i * 16 + 16)] };
  }
  return out;
}

/**
 * The exact inverse of `parseMetatiles`. Refuses (throws, naming the
 * metatile index) a record whose `tiles` is not exactly 16 entries, and
 * refuses (throws, naming the metatile and tile index and value) any tile id
 * that is not an integer 0-255, rather than masking or truncating it.
 */
export function encodeMetatiles(ms: Metatile[]): Buffer {
  const buf = Buffer.alloc(ms.length * 16);
  ms.forEach((m, i) => {
    if (m.tiles.length !== 16) {
      throw new Error(`metatile ${i}: tiles.length ${m.tiles.length} !== 16`);
    }
    m.tiles.forEach((t, j) => {
      if (!Number.isInteger(t) || t < 0 || t > 255) {
        throw new Error(`metatile ${i} tile ${j}: ${t} is not an integer 0-255`);
      }
      buf[i * 16 + j] = t;
    });
  });
  return buf;
}

// `parseConstDefs` moved to `asm.ts` (code-quality review, Task 6 fix round
// 2) -- it grew from a `TILESET_*`/`PAL_BG_*`-only parser into a generic
// RGBDS-enum primitive `palette.ts` also uses for unrelated domains
// (environment/palette/clock-time enums), so it now lives alongside the
// other shared RGBDS-line primitives in `asm.ts`. Imported above.

/**
 * `data/tilesets.asm`'s `Tilesets::` table: each `tileset <Name>` call, in
 * source order. Table index i is `TILESET_*` value i (index 0, "Tileset0",
 * has no matching constant since `const_def 1` starts at 1 -- Tileset0 is
 * reached only by table index / by name, mirroring the real corpus where it
 * aliases Johto). The `MACRO tileset ... ENDM` definition itself is skipped
 * by `stripMacroDefs`, so its own `\1GFX` etc. never look like a real call.
 */
export function parseTilesetsTable(text: string): string[] {
  const out: string[] = [];
  for (const line of stripMacroDefs(text)) {
    const t = matchCall(line, "tileset");
    if (t) out.push(t[0]!);
  }
  return out;
}

const TILEPAL_NAMES = 8;
/** Tile ids 0x00-0x5F (96), then the 0x60-0x7F (32) filler, then 0x80-0xDF (96) -- 224 total (GBC format findings §3.4 step 6). */
const PALETTE_MAP_TILE_COUNT = 224;

type PalMapPhase = "low" | "reptStart" | "reptDb" | "reptEnd" | "high" | "done";

/**
 * `gfx/tilesets/<name>_palette_map.asm`: 12 `tilepal 0, <8 names>` lines
 * (tiles $00-$5F), then `rept 16 / db $ff / endr` (tiles $60-$7F, no
 * palette entry), then 12 `tilepal 1, <8 names>` lines (tiles $80-$DF) --
 * every one of the 37 real files has exactly this shape, and Task 5 spec
 * review Issue 1 found that a merely-224-total check silently accepts real
 * deviations (extra/missing tilepal lines, swapped blocks, filler in the
 * wrong place, an out-of-range bank) and produces wrong `pngTileIndex`
 * results. This is therefore a strict phase machine, not a bag of counts:
 * exactly 12 bank-0 `tilepal` lines, then exactly `rept 16` / `db $ff` /
 * `endr`, then exactly 12 bank-1 `tilepal` lines, then nothing else.
 *
 * Each `tilepal` line's 8 names map 1:1, in source order, to its 8 tile ids
 * (verified against the `dn`/`shift` macro expansion: pair (\2,\3) ->
 * low/high nibble of one byte -> tiles 2k/2k+1, so listing the names in
 * order already gives the right tile assignment without redoing the nibble
 * packing).
 *
 * Refuses (throws, naming `source` -- the palette-map file's repo-relative
 * path, or "<palette map>" for a caller with no file -- and the 1-based
 * line number) on any deviation: a `tilepal` line without exactly 8 names,
 * a `tilepal` bank other than the one its block requires (0 in the first
 * block, 1 in the second -- never merely "truthy"), an unknown
 * `PAL_BG_<name>`, a mis-shaped/missing `rept 16`/`db $ff`/`endr`, any
 * other unrecognized line, or a shape that doesn't end exactly on the 12th
 * bank-1 `tilepal` line.
 */
export function parsePaletteMap(
  text: string,
  palBg: Map<string, number>,
  source: string = "<palette map>",
): (PaletteMapEntry | null)[] {
  const entries: (PaletteMapEntry | null)[] = [];
  let phase: PalMapPhase = "low";
  let lowCount = 0;
  let highCount = 0;

  const fail = (lineIndex: number, msg: string): never => {
    throw new Error(`parsePaletteMap: ${source}:${lineIndex + 1}: ${msg}`);
  };

  for (const { lineIndex, text: rawLine } of codeLines(text)) {
    const stripped = stripComment(rawLine);
    if (stripped.trim() === "") continue;

    if (phase === "low" || phase === "high") {
      const tp = matchCall(rawLine, "tilepal");
      if (!tp) {
        throw fail(lineIndex, `expected a "tilepal" line (in the ${phase === "low" ? "first" : "second"} 12-line block), got "${stripped.trim()}"`);
      }
      const [bankStr, ...names] = tp;
      if (names.length !== TILEPAL_NAMES) {
        throw fail(lineIndex, `"tilepal" line has ${names.length} palette names, expected ${TILEPAL_NAMES}: "${stripped.trim()}"`);
      }
      const bank = parseNum(bankStr!);
      const expectedBank = phase === "low" ? 0 : 1;
      if (bank !== expectedBank) {
        throw fail(
          lineIndex,
          `"tilepal" bank is ${bank}, expected ${expectedBank} in the ${phase === "low" ? "first" : "second"} 12-line block: "${stripped.trim()}"`,
        );
      }
      for (const name of names) {
        const key = `PAL_BG_${name}`;
        const pal = palBg.get(key);
        if (pal === undefined) throw fail(lineIndex, `unknown palette name "${key}"`);
        entries.push({ bank, pal });
      }
      if (phase === "low") {
        lowCount++;
        if (lowCount === 12) phase = "reptStart";
      } else {
        highCount++;
        if (highCount === 12) phase = "done";
      }
      continue;
    }

    if (phase === "reptStart") {
      const rept = stripped.match(/^\s*rept\s+(\S+)/);
      if (!rept) throw fail(lineIndex, `expected "rept 16" (the $60-$7F filler), got "${stripped.trim()}"`);
      const n = parseNum(rept[1]!);
      if (n !== 16) throw fail(lineIndex, `"rept ${n}", expected "rept 16"`);
      phase = "reptDb";
      continue;
    }
    if (phase === "reptEnd") {
      if (!/^\s*endr\b/.test(stripped)) throw fail(lineIndex, `expected "endr", got "${stripped.trim()}"`);
      phase = "high";
      continue;
    }
    if (phase === "reptDb") {
      if (!/^\s*db\s+\$ff\s*$/i.test(stripped)) throw fail(lineIndex, `expected "db $ff", got "${stripped.trim()}"`);
      for (let i = 0; i < 32; i++) entries.push(null);
      phase = "reptEnd";
      continue;
    }
    // phase === "done"
    throw fail(lineIndex, `unexpected trailing content after the 12/rept-16/12 shape: "${stripped.trim()}"`);
  }

  if (phase !== "done") {
    throw new Error(
      `parsePaletteMap: ${source}: incomplete -- ended after ${entries.length} of ${PALETTE_MAP_TILE_COUNT} tile entries (in phase "${phase}")`,
    );
  }
  return entries;
}

/**
 * `constants/collision_constants.asm`: `DEF COLL_<NAME> EQU $xx [; comment]`.
 * `<NAME>` may itself look numeric (`COLL_01`, `COLL_FF`) -- it's a name,
 * not a value. Runs through `stripMacroDefs` like its sibling
 * `parseConstDefs`, even though the real file has no `MACRO`/`ENDM` block
 * (code-quality review Minor #4) -- one "iterate this file's code lines"
 * implementation, not two, so a future macro block in this file wouldn't
 * silently mis-parse.
 */
export function parseCollisionConstants(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of stripMacroDefs(text)) {
    const stripped = stripComment(line);
    const m = stripped.match(/^\s*DEF\s+(COLL_[A-Za-z0-9_]+)\s+EQU\s+(\S+)/);
    if (m) out.set(m[1]!, parseNum(m[2]!));
  }
  return out;
}

/**
 * `data/tilesets/<name>_collision.asm`: one `tilecoll TL, TR, BL, BR` line
 * per metatile (GBC format findings §3.3 -- quadrant order confirmed against
 * `GetCoordTile`). Each token is looked up as `COLL_<token>`, exactly as
 * written (a token that looks numeric, e.g. "01", is still a name suffix,
 * never a literal value). Refuses (throws, naming `source` -- the
 * collision file's repo-relative path, or "<collision>" for a caller with
 * no file -- and the token) on an unknown one, and (naming `source` and the
 * count) on a `tilecoll` line without exactly 4 tokens.
 */
export function parseCollision(text: string, collConsts: Map<string, number>, source: string = "<collision>"): Collision[] {
  const out: Collision[] = [];
  for (const line of stripMacroDefs(text)) {
    const tc = matchCall(line, "tilecoll");
    if (!tc) continue;
    if (tc.length !== 4) {
      throw new Error(`parseCollision: ${source}: "tilecoll" line has ${tc.length} args, expected 4: "${stripComment(line).trim()}"`);
    }
    const vals = tc.map((tok) => {
      const key = `COLL_${tok.trim()}`;
      const v = collConsts.get(key);
      if (v === undefined) throw new Error(`parseCollision: ${source}: unknown collision token "${tok}" (looked up as "${key}")`);
      return v;
    });
    out.push({ tl: vals[0]!, tr: vals[1]!, bl: vals[2]!, br: vals[3]! });
  }
  return out;
}

/**
 * Chunks a decoded PNG's shade data into 8x8 tiles, row-major, 16 per PNG
 * row (GBC format findings, "Tileset graphics"). Refuses (throws, naming
 * `source` and the actual width/height) a PNG whose dimensions aren't a
 * multiple of 8 -- code-quality review Issue I1: an off dimension would
 * otherwise make the `ty < rows`/`tx < cols` loop run a fractional extra
 * iteration that reads past `shades`, and `Uint8Array` silently coerces
 * that `undefined` read to `0` rather than throwing.
 */
function sliceTiles(png: { width: number; height: number; shades: Uint8Array }, source: string): Uint8Array[] {
  if (png.width % 8 !== 0 || png.height % 8 !== 0) {
    throw new Error(`sliceTiles: ${source}: ${png.width}x${png.height} isn't a multiple of 8x8`);
  }
  const cols = png.width / 8;
  const rows = png.height / 8;
  const out: Uint8Array[] = [];
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const tile = new Uint8Array(64);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          tile[y * 8 + x] = png.shades[(ty * 8 + y) * png.width + (tx * 8 + x)]!;
        }
      }
      out.push(tile);
    }
  }
  return out;
}

/** The GFX INCBIN path (`gfx/tilesets/<name>.2bpp.lz`, a gitignored build artifact) always has a sibling source `.png` (I3) -- this never touches the `.2bpp.lz` file itself. */
function pngPathFor(gfxIncbinPath: string): string {
  const m = gfxIncbinPath.match(/^(.*)\.2bpp\.lz$/);
  if (!m) throw new Error(`loadGbcTileset: GFX path "${gfxIncbinPath}" doesn't end in ".2bpp.lz"`);
  return `${m[1]}.png`;
}

function labelMap(entries: { labels: string[]; path: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of entries) for (const label of e.labels) out.set(label, e.path);
  return out;
}

/**
 * Loads one tileset by its `Tilesets::` table entry name (e.g. "TilesetJohto"),
 * resolving GFX/Meta/Coll/PalMap purely through the stacked labels in
 * `gfx/tilesets.asm` and `gfx/tileset_palette_maps.asm` (I4 -- never by
 * name-mangling), so real aliases resolve correctly: `TilesetBattleTowerOutsideGFX`
 * shares johto_modern's INCBIN, `TilesetDarkCaveMeta`/`Coll`/`PalMap` share
 * cave's (but not its GFX), and the 5 "word room" `PalMap` labels share
 * `TilesetRuinsOfAlph`'s (GBC format findings, "Extra findings"). `constName`
 * is stored as given (or `name` when omitted) -- Tileset0 has no matching
 * `TILESET_*` constant, since `const_def 1` starts at 1.
 */
export function loadGbcTilesetByName(root: string, name: string, constName: string = name): GbcTileset {
  const r = norm(root);

  // Code-quality review Issue I3: read+scan gfx/tilesets.asm once, not
  // twice -- cheap to avoid, and this function is called per-map by Task 9/10.
  const tilesetsAsmText = readFileSync(`${r}/gfx/tilesets.asm`, "utf8");
  const gfxIncbins = parseIncbins(tilesetsAsmText);
  const collIncludes = parseIncludes(tilesetsAsmText);
  const palMapIncludes = parseIncludes(readFileSync(`${r}/gfx/tileset_palette_maps.asm`, "utf8"));

  const gfxByLabel = labelMap(gfxIncbins);
  const collByLabel = labelMap(collIncludes);
  const palMapByLabel = labelMap(palMapIncludes);

  const gfxLabel = `${name}GFX`;
  const metaLabel = `${name}Meta`;
  const collLabel = `${name}Coll`;
  const palMapLabel = `${name}PalMap`;

  const gfxIncbinPath = gfxByLabel.get(gfxLabel);
  if (!gfxIncbinPath) throw new Error(`loadGbcTilesetByName: no INCBIN label "${gfxLabel}" found in gfx/tilesets.asm`);
  const metatilesPath = gfxByLabel.get(metaLabel);
  if (!metatilesPath) throw new Error(`loadGbcTilesetByName: no INCBIN label "${metaLabel}" found in gfx/tilesets.asm`);
  const collisionPath = collByLabel.get(collLabel);
  if (!collisionPath) throw new Error(`loadGbcTilesetByName: no INCLUDE label "${collLabel}" found in gfx/tilesets.asm`);
  const palMapPath = palMapByLabel.get(palMapLabel);
  if (!palMapPath) {
    throw new Error(`loadGbcTilesetByName: no INCLUDE label "${palMapLabel}" found in gfx/tileset_palette_maps.asm`);
  }

  const tilesetConstants = parseConstDefs(readFileSync(`${r}/constants/tileset_constants.asm`, "utf8"));
  const collisionConstants = parseCollisionConstants(readFileSync(`${r}/constants/collision_constants.asm`, "utf8"));

  const metatiles = parseMetatiles(readFileSync(`${r}/${metatilesPath}`), metatilesPath);
  const palMap = parsePaletteMap(readFileSync(`${r}/${palMapPath}`, "utf8"), tilesetConstants, palMapPath);
  const collisionAll = parseCollision(readFileSync(`${r}/${collisionPath}`, "utf8"), collisionConstants, collisionPath);

  if (collisionAll.length < metatiles.length) {
    throw new Error(
      `loadGbcTilesetByName: ${name}: collision (${collisionPath}) has ${collisionAll.length} entries, fewer than its ${metatiles.length} metatiles`,
    );
  }
  // Extra lines beyond the metatile count (forest: 64 lines for 40
  // metatiles) are trimmed, never exposed or refused (GBC format findings §3.2).
  const collision = collisionAll.slice(0, metatiles.length);

  const gfxPath = pngPathFor(gfxIncbinPath);
  let png;
  try {
    png = readShadesPng(readFileSync(`${r}/${gfxPath}`));
  } catch (e) {
    // Spec review note: readShadesPng's own errors name the pixel but not
    // the file, so a corpus-level failure among 36+ PNGs wouldn't say which
    // one. Wrap with gfxPath here, the one place that knows it.
    throw new Error(`loadGbcTilesetByName: ${gfxPath}: ${(e as Error).message}`);
  }
  const tiles = sliceTiles(png, gfxPath);

  return { constName, name, gfxPath, metatilesPath, collisionPath, palMapPath, metatiles, collision, palMap, tiles };
}

/**
 * Loads one tileset by its `TILESET_*` constant (e.g. "TILESET_JOHTO", as
 * found in a map header's tileset field). Resolves the constant to a
 * `Tilesets::` table index via `constants/tileset_constants.asm`, then the
 * table index to a table entry name via `data/tilesets.asm`, then defers to
 * `loadGbcTilesetByName` for the rest. Refuses (throws, naming the
 * constant) on an unknown constant or one beyond the table's length.
 *
 * This function stays a pure, side-effect-free read on every call, with no
 * internal cache -- deliberately (code-quality review Minor #5). A caller
 * loading many maps (391 maps share 37 tilesets) should cache by
 * `tilesetConst` on its own side, e.g. a `Map<string, GbcTileset>`, the way
 * this module's own placed-tile corpus test already does, rather than this
 * module re-reading/re-parsing the shared table files per map.
 */
export function loadGbcTileset(root: string, tilesetConst: string): GbcTileset {
  // Spec review Issue 2: constants/tileset_constants.asm also defines the
  // unrelated PAL_BG_* enum, and parseConstDefs deliberately merges both
  // (see its own doc comment) since a real caller only ever passes a
  // TILESET_* value. A non-TILESET_* name can still collide with a real
  // table index (e.g. PAL_BG_RED -- index 1 -- silently resolving to
  // TilesetJohto), so refuse it here before ever doing the index lookup.
  if (!tilesetConst.startsWith("TILESET_")) {
    throw new Error(`loadGbcTileset: "${tilesetConst}" is not a TILESET_* constant`);
  }

  const r = norm(root);
  const tilesetConstants = parseConstDefs(readFileSync(`${r}/constants/tileset_constants.asm`, "utf8"));
  const index = tilesetConstants.get(tilesetConst);
  if (index === undefined) throw new Error(`loadGbcTileset: unknown tileset constant "${tilesetConst}"`);

  const table = parseTilesetsTable(readFileSync(`${r}/data/tilesets.asm`, "utf8"));
  const name = table[index];
  if (name === undefined) {
    throw new Error(`loadGbcTileset: ${tilesetConst} resolves to table index ${index}, but Tilesets:: has only ${table.length} entries`);
  }

  return loadGbcTilesetByName(r, name, tilesetConst);
}

/**
 * Tile id -> PNG tile index, deriving the VRAM bank from the palette map's
 * own bit rather than from the tile id's high bit (GBC format findings §3.2):
 * `(bank ? 0x60 : 0) + (t & 0x7F)`, valid only when `t & 0x7F < 0x60` (the
 * findings' own caveat). Returns `null` (never guesses) for a tile id with
 * no palette-map entry (the $60-$7F/beyond-224 filler range, which only
 * ever appears in never-placed garbage metatiles), one whose `t & 0x7F` is
 * already >= 0x60 (spec review Issue 1 -- defense in depth: with
 * `parsePaletteMap` now enforcing the fixed shape this can't arise from a
 * real palette map, but this function takes `palMap` as plain data, not
 * necessarily one `parsePaletteMap` produced), or one whose resolved index
 * is beyond this tileset's own PNG tile count.
 */
export function pngTileIndex(ts: Pick<GbcTileset, "palMap" | "tiles">, tileId: number): number | null {
  const entry = tileId >= 0 && tileId < ts.palMap.length ? ts.palMap[tileId] : undefined;
  if (!entry) return null;
  const low7 = tileId & 0x7f;
  if (low7 >= 0x60) return null;
  const idx = (entry.bank ? 0x60 : 0) + low7;
  return idx < ts.tiles.length ? idx : null;
}
