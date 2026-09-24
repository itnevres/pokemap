import { readFileSync } from "node:fs";
import { norm } from "../../config/paths.js";
import { codeLines, stripComment, parseConstDefs } from "./asm.js";
import { readShadesPng } from "./png.js";
import { pngPathFor, sliceTiles } from "./tileset.js";

/**
 * `data/maps/roofs.asm` (GBC format findings §3.4 step 5 / §Extra Border;
 * Decision 6): two tables.
 *
 *  - `MapGroupRoofs:` -- one `db` per map group (index = `map.group`, entry 0
 *    unused, `assert_table_length NUM_MAP_GROUPS + 1`): `-1` (no roof swap)
 *    or a `ROOF_*` name, resolved through this same file's own leading
 *    `const_def`/`const ROOF_*` block (`ROOF_NEW_BARK`=0 .. `ROOF_GOLDENROD`=4).
 *  - `Roofs:` -- exactly `NUM_ROOFS` bare `INCBIN "…/<name>.2bpp"` lines (no
 *    per-line label, unlike the stacked-label INCBINs `incbin.ts` parses),
 *    in `ROOF_*` index order (0 = New Bark .. 4 = Goldenrod), each the roof
 *    graphic `LoadMapGroupRoof` copies over PNG tile ids `$0A-$12`.
 *
 * A strict phase machine, not a bag of counts (mirrors `parsePaletteMap`'s
 * reasoning): refuses (throws, naming `source` -- the file's repo-relative
 * path, or "<roofs>" for a caller with no file -- and the 1-based line
 * number) on an unknown `ROOF_*` name, any line inside either table that
 * isn't the shape that table expects, or a `table_width`/`assert_table_length`
 * line that doesn't match what's found in the real corpus.
 */
export interface ParsedRoofsAsm {
  /** Indexed by `map.group` directly (1-based `newgroup` order, entry 0
   *  unused/`null`). `null` is `db -1` -- no roof swap for that group. */
  mapGroupRoofs: (number | null)[];
  /** `ROOF_*` index -> the roof PNG's repo-relative path (resolved from the
   *  `.2bpp` INCBIN via `pngPathFor`, never the `.2bpp` build artifact -- I3). */
  roofPngPaths: string[];
}

type Phase = "preMapGroupRoofs" | "mgrTableWidth" | "mgrDb" | "preRoofs" | "roofsTableWidth" | "roofsIncbin" | "done";

const MGR_TABLE_WIDTH_RE = /^\s*table_width\s+1\s*,\s*MapGroupRoofs\s*$/;
const MGR_ASSERT_RE = /^\s*assert_table_length\s+NUM_MAP_GROUPS\s*\+\s*1\s*$/;
const ROOFS_TABLE_WIDTH_RE = /^\s*table_width\s+ROOF_LENGTH\s*\*\s*LEN_2BPP_TILE\s*,\s*Roofs\s*$/;
const ROOFS_ASSERT_RE = /^\s*assert_table_length\s+NUM_ROOFS\s*$/;
const INCBIN_RE = /^\s*INCBIN\s+"([^"]+)"\s*$/;

export function parseRoofsAsm(text: string, source: string = "<roofs>"): ParsedRoofsAsm {
  const roofConsts = parseConstDefs(text);

  const mapGroupRoofs: (number | null)[] = [];
  const roofPngPaths: string[] = [];
  let phase: Phase = "preMapGroupRoofs";

  const fail = (lineIndex: number, msg: string): never => {
    throw new Error(`parseRoofsAsm: ${source}:${lineIndex + 1}: ${msg}`);
  };

  for (const { lineIndex, text: rawLine } of codeLines(text)) {
    const stripped = stripComment(rawLine);
    if (stripped.trim() === "") continue;

    if (phase === "preMapGroupRoofs") {
      if (/^MapGroupRoofs:\s*$/.test(stripped)) phase = "mgrTableWidth";
      continue;
    }

    if (phase === "mgrTableWidth") {
      if (!MGR_TABLE_WIDTH_RE.test(stripped)) {
        throw fail(lineIndex, `expected "table_width 1, MapGroupRoofs", got "${stripped.trim()}"`);
      }
      phase = "mgrDb";
      continue;
    }

    if (phase === "mgrDb") {
      if (MGR_ASSERT_RE.test(stripped)) {
        phase = "preRoofs";
        continue;
      }
      const dbMatch = stripped.match(/^\s*db\s+(.+)$/);
      if (!dbMatch) {
        throw fail(lineIndex, `expected a "db" line (in the MapGroupRoofs table) or its closing "assert_table_length", got "${stripped.trim()}"`);
      }
      const token = dbMatch[1]!.trim();
      if (token === "-1") {
        mapGroupRoofs.push(null);
      } else {
        const idx = roofConsts.get(token);
        if (idx === undefined) {
          throw fail(lineIndex, `unknown ROOF_* constant "${token}" (MapGroupRoofs entry ${mapGroupRoofs.length})`);
        }
        mapGroupRoofs.push(idx);
      }
      continue;
    }

    if (phase === "preRoofs") {
      if (/^Roofs:\s*$/.test(stripped)) phase = "roofsTableWidth";
      continue;
    }

    if (phase === "roofsTableWidth") {
      if (!ROOFS_TABLE_WIDTH_RE.test(stripped)) {
        throw fail(lineIndex, `expected "table_width ROOF_LENGTH * LEN_2BPP_TILE, Roofs", got "${stripped.trim()}"`);
      }
      phase = "roofsIncbin";
      continue;
    }

    if (phase === "roofsIncbin") {
      if (ROOFS_ASSERT_RE.test(stripped)) {
        phase = "done";
        continue;
      }
      const inc = stripped.match(INCBIN_RE);
      if (!inc) {
        throw fail(lineIndex, `expected an "INCBIN" line (in the Roofs table) or its closing "assert_table_length", got "${stripped.trim()}"`);
      }
      roofPngPaths.push(pngPathFor(inc[1]!));
      continue;
    }

    // phase === "done": trailing content after both tables is inert (real
    // file has none, but nothing downstream depends on that).
  }

  if (phase !== "done") {
    throw new Error(`parseRoofsAsm: ${source}: incomplete -- ended in phase "${phase}" before both tables were fully parsed`);
  }

  for (let group = 0; group < mapGroupRoofs.length; group++) {
    const roofIdx = mapGroupRoofs[group];
    if (roofIdx !== null && roofIdx !== undefined && roofIdx >= roofPngPaths.length) {
      throw new Error(
        `parseRoofsAsm: ${source}: MapGroupRoofs[${group}] = roof index ${roofIdx}, but Roofs: only has ${roofPngPaths.length} entries`,
      );
    }
  }

  return { mapGroupRoofs, roofPngPaths };
}

/** `NUM_ROOFS` real roof PNGs, e.g. `gfx/tilesets/roofs/new_bark.png` --
 *  24x24 grayscale depth 2, 9 tiles in row-major 3x3 order (GBC format
 *  findings §3.4 step 5). Refuses (throws, naming the path and the actual
 *  dimensions) any PNG that isn't exactly 24x24 -- stricter than
 *  `sliceTiles`'s own multiple-of-8 check, since a roof PNG that decoded to
 *  e.g. 16x16 would silently yield 4 tiles instead of 9 and desync every
 *  index past it. */
export interface GbcRoofs {
  mapGroupRoofs: (number | null)[];
  /** `ROOF_*` index -> its 9 tiles, row-major 3x3, each a `Uint8Array(64)` of shades 0-3 (same shape as `GbcTileset.tiles`). */
  roofTiles: Uint8Array[][];
}

export function loadGbcRoofs(root: string): GbcRoofs {
  const r = norm(root);
  const path = "data/maps/roofs.asm";
  const { mapGroupRoofs, roofPngPaths } = parseRoofsAsm(readFileSync(`${r}/${path}`, "utf8"), path);

  const roofTiles = roofPngPaths.map((pngPath) => {
    const png = readShadesPng(readFileSync(`${r}/${pngPath}`));
    if (png.width !== 24 || png.height !== 24) {
      throw new Error(`loadGbcRoofs: ${pngPath}: ${png.width}x${png.height}, expected exactly 24x24`);
    }
    return sliceTiles(png, pngPath);
  });

  return { mapGroupRoofs, roofTiles };
}

