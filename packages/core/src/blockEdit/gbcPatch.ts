/**
 * Plan 14.2 Task 2: lossless GBC tileset file patchers. Every function here is
 * a pure function over bytes/text -- no disk, no project object -- and each
 * one edits ONLY its own target span, so an unchanged input returns identical
 * bytes and a real edit leaves every other byte (comments, blank lines, CRLF,
 * surplus records) exactly as it was. Nothing here re-serializes a parsed
 * model: the text patchers scan the original string's own spans through the
 * shared RGBDS line primitives (`scanCalls`, `spliceArg`), and the metatile
 * patcher copies one 16-byte record into a copy of the original buffer.
 *
 * Refusals are the one core shape, `BlockEditRefusal`; every message starts
 * with the subject (the file path, or the collision record whose shape is
 * wrong when no path was supplied).
 */
import { parseNum, scanCalls } from "../gbc/load/asm.js";
import { encodeMetatiles, parseMetatiles, parsePaletteMap } from "../gbc/load/tileset.js";
import { insertLineAfter, spliceArg } from "../gbc/write/asmSplice.js";
import { BlockEditRefusal } from "./types.js";

/** One GBC metatile record: a 4x4 grid of tile ids, row-major (GBC format findings §3.2). */
const METATILE_TILES = 16;
/** A GBC blockset id is one byte, so a tileset holds at most 256 blocks. */
const BLOCK_CAP = 256;
/** Metatile ids 0x00-0x5F are the first palette-map block; 0x60-0x7F is the `rept 16` filler. */
const PALETTE_BANK1_START = 0x80;
/** Metatile ids 0xE0 and up have no palette-map entry (only 224 tile entries exist). */
const PALETTE_MAP_END = 0xe0;
/** One `tilecoll` record's four quadrant names, TL/TR/BL/BR. */
const COLLISION_NAMES = 4;
const TILE_NAME_RE = /^[A-Za-z0-9_]+$/;
const PALETTE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
/**
 * The eight background palettes `tilepal` lines name (design, "GBC palette
 * edits": GRAY, RED, GREEN, WATER, YELLOW, BROWN, ROOF, TEXT). This patcher
 * has no tileset-constants map to consult, so a name outside this fixed set
 * cannot be verified as a real `PAL_BG_*` and is refused instead of writing an
 * undefined constant into the build.
 */
const PALETTE_NAMES: ReadonlySet<string> = new Set(["GRAY", "RED", "GREEN", "WATER", "YELLOW", "BROWN", "ROOF", "TEXT"]);

const tileLabel = (tileId: number): string => (tileId >= 0 ? `$${tileId.toString(16).padStart(2, "0")}` : String(tileId));

/**
 * Replaces block `id`'s 16 tile ids, or appends a block when `id` is the
 * current count. `id > count` is a bad value (a caller must not silently
 * create gaps), and appending past 256 blocks is the blockset cap. The input
 * buffer is never mutated; an unchanged record returns an identical buffer.
 */
export function patchGbcMetatiles(buf: Buffer, id: number, tiles: readonly number[], path: string): Buffer {
  let count: number;
  try {
    count = parseMetatiles(buf, path).length;
  } catch (e) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: ${(e as Error).message}`);
  }
  if (!Number.isInteger(id) || id < 0 || id > count) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: block id ${id} is outside the editable range 0-${count}`);
  }
  let record: Buffer;
  try {
    record = encodeMetatiles([{ tiles: [...tiles] }]);
  } catch (e) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: ${(e as Error).message}`);
  }
  if (id === count) {
    if (count >= BLOCK_CAP) throw new BlockEditRefusal("BLOCK_CAP", `${path}: block cap ${BLOCK_CAP} reached`);
    return Buffer.concat([buf, record]);
  }
  const out = Buffer.from(buf);
  record.copy(out, id * METATILE_TILES);
  return out;
}

/**
 * Every `tilecoll` record's four argument names, in source order, surplus
 * records included (`forest_collision.asm` has 64 records for 40 metatiles).
 * A line without exactly four names has no well-defined block index, so it is
 * refused rather than silently re-indexing every record after it.
 */
export function readGbcCollisionRecords(text: string): string[][] {
  return scanCalls(text, "tilecoll").map((call, id) => {
    if (call.args.length !== COLLISION_NAMES) {
      throw new BlockEditRefusal(
        "BAD_VALUE",
        `tilecoll record ${id}: has ${call.args.length} argument(s), expected ${COLLISION_NAMES}`,
      );
    }
    return call.args.map((arg) => arg.text);
  });
}

/**
 * Replaces record `id`'s four collision names in place, or appends a record
 * when `id === records.length`. Only the four argument spans change: the
 * `tilecoll` keyword, the indentation, the separators and any trailing
 * comment stay byte-identical. An appended line copies the file's own
 * indentation, comma spacing and EOL (`insertLineAfter` keeps a missing final
 * newline missing).
 */
export function patchGbcCollision(
  text: string,
  id: number,
  names: readonly [string, string, string, string],
  path: string,
): string {
  if (names.length !== COLLISION_NAMES) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: ${names.length} collision name(s) given, expected ${COLLISION_NAMES}`);
  }
  for (const name of names) {
    if (!TILE_NAME_RE.test(name)) {
      throw new BlockEditRefusal("BAD_VALUE", `${path}: "${name}" is not a single collision name`);
    }
  }

  const calls = scanCalls(text, "tilecoll");
  if (!Number.isInteger(id) || id < 0 || id > calls.length) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: collision record ${id} is outside the editable range 0-${calls.length}`);
  }

  if (id < calls.length) {
    const call = calls[id]!;
    if (call.args.length !== COLLISION_NAMES) {
      throw new BlockEditRefusal(
        "BAD_VALUE",
        `${path}: collision record ${id} has ${call.args.length} argument(s), expected ${COLLISION_NAMES}`,
      );
    }
    // Right to left: every later splice only shortens/lengthens text after the
    // earlier args, whose own offsets (checked by `spliceArg`) stay valid.
    let out = text;
    try {
      for (let i = names.length - 1; i >= 0; i--) out = spliceArg(out, call, i, names[i]!);
    } catch (e) {
      throw new BlockEditRefusal("BAD_VALUE", `${path}: ${(e as Error).message}`);
    }
    return out;
  }

  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const last = calls[calls.length - 1];
  if (!last) {
    const line = `\ttilecoll ${names.join(", ")}`;
    return text === "" ? `${line}${eol}` : text.endsWith("\n") ? `${text}${line}${eol}` : `${text}${eol}${line}`;
  }
  // The file's own style: the last record's indentation and comma spacing.
  const indent = /^[ \t]*/.exec(text.slice(last.lineStart, last.lineEnd))![0];
  const spacing = last.args.length >= 2 ? text.slice(last.args[0]!.end, last.args[1]!.start) : ", ";
  const sep = /^,[ \t]*$/.test(spacing) ? spacing : ", ";
  return insertLineAfter(text, last.lineEnd, `${indent}tilecoll ${names.join(sep)}`);
}

/**
 * Rewrites one tile id's palette name on its `tilepal` line (scope "All").
 * Only that one name span changes; the bank argument, the other seven names
 * and every other line stay byte-identical. The whole file is first validated
 * by `parsePaletteMap` (the loader's own strict phase machine), so a file
 * whose 12/rept-16/12 shape is off cannot be patched at the wrong tile.
 *
 * `palName` must be one of the palette names this file already uses: without
 * the tileset constants a new name cannot be verified, and silently writing
 * an undefined `PAL_BG_*` would break the build. Tiles 0x60-0x7F (the filler
 * gap) and 0xE0+ have no palette-map entry at all.
 */
export function patchGbcPaletteMap(text: string, tileId: number, palName: string, path: string): string {
  if (!Number.isInteger(tileId) || tileId < 0 || (tileId >= 0x60 && tileId < PALETTE_BANK1_START) || tileId >= PALETTE_MAP_END) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: tile ${tileLabel(tileId)} has no palette-map entry`);
  }
  if (!PALETTE_NAME_RE.test(palName)) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: "${palName}" is not a palette name`);
  }

  const calls = scanCalls(text, "tilepal");
  if (!PALETTE_NAMES.has(palName)) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: unknown palette name "${palName}"`);
  }
  const known = new Set<string>();
  for (const call of calls) for (const arg of call.args.slice(1)) known.add(arg.text);
  for (const name of known) {
    if (!PALETTE_NAMES.has(name)) {
      throw new BlockEditRefusal("BAD_VALUE", `${path}: unknown palette name "${name}"`);
    }
  }

  // Reuse the loader's strict phase machine for shape (bank sequence, 12
  // lines per half, the rept-16 filler, no trailing content). The synthesized
  // `palBg` accepts the names this file actually uses; any name it lacks would
  // already have been refused above.
  const palBg = new Map<string, number>();
  for (const name of known) palBg.set(`PAL_BG_${name}`, palBg.size);
  try {
    parsePaletteMap(text, palBg, path);
  } catch (e) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: ${(e as Error).message}`);
  }

  const bank = tileId < 0x60 ? 0 : 1;
  const index = tileId < 0x60 ? tileId : tileId - PALETTE_BANK1_START;
  const bankCalls = calls.filter((call) => {
    try {
      return parseNum(call.args[0]!.text) === bank;
    } catch {
      return false;
    }
  });
  const call = bankCalls[index >> 3];
  const argIndex = 1 + (index & 7);
  if (!call || argIndex >= call.args.length) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: no tilepal line for tile ${tileLabel(tileId)}`);
  }
  try {
    return spliceArg(text, call, argIndex, palName);
  } catch (e) {
    throw new BlockEditRefusal("BAD_VALUE", `${path}: ${(e as Error).message}`);
  }
}
