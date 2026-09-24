import { existsSync, readFileSync } from "node:fs";
import { parseBlk } from "./blocks.js";
import { parseIncbins } from "./incbin.js";
import { stripComment, stripMacroDefs, matchCall, parseNum } from "./asm.js";
import { norm } from "../../config/paths.js";
import type { Connection, DataDefect, GbcMap, Layout } from "../model/types.js";

const DIRECTIONS = ["north", "south", "west", "east"] as const;

// `parseNum` moved to `asm.ts` (code-quality review, Task 6 fix round 2) --
// it's a generic RGBDS-numeric-literal primitive, not map-specific.
// Re-exported here so this module's existing importers (`tileset.ts`,
// `palette.ts`, and this file's own test) don't need to change.
export { parseNum };

export interface MapConstEntry {
  constName: string;
  group: number;
  number: number;
  width: number;
  height: number;
}

/**
 * `constants/map_constants.asm`: `newgroup` starts a group (index = order
 * from 1), `map_const NAME, w, h` adds a map (number = order within the
 * group, from 1), `endgroup` closes it.
 */
export function parseMapConstants(text: string): MapConstEntry[] {
  const out: MapConstEntry[] = [];
  let group = 0;
  let number = 0;
  for (const line of stripMacroDefs(text)) {
    if (matchCall(line, "newgroup")) {
      group++;
      number = 0;
      continue;
    }
    const mc = matchCall(line, "map_const");
    if (mc) {
      number++;
      const [constName, w, h] = mc;
      out.push({ constName: constName!, group, number, width: parseNum(w!), height: parseNum(h!) });
    }
  }
  return out;
}

export interface MapAttributesEntry {
  name: string;
  constName: string;
  border: number;
  connectionFlags: string;
  connections: Connection[];
}

/**
 * `data/maps/attributes.asm`: `map_attributes Name, CONST, border, flags`
 * followed by 0+ `connection dir, TargetName, TARGET_CONST, offset` lines.
 */
export function parseMapAttributes(text: string): MapAttributesEntry[] {
  const out: MapAttributesEntry[] = [];
  let current: MapAttributesEntry | null = null;
  for (const line of stripMacroDefs(text)) {
    const ma = matchCall(line, "map_attributes");
    if (ma) {
      const [name, constName, border, flags] = ma;
      current = { name: name!, constName: constName!, border: parseNum(border!), connectionFlags: flags!, connections: [] };
      out.push(current);
      continue;
    }
    const c = matchCall(line, "connection");
    if (c) {
      const [dir, targetName, targetConst, offset] = c;
      const direction = dir!.trim().toLowerCase();
      if (!(DIRECTIONS as readonly string[]).includes(direction)) {
        throw new Error(`connection: unknown direction "${dir}" (target ${targetName})`);
      }
      if (!current) {
        throw new Error(`connection ${dir} ${targetName}: appears before any map_attributes`);
      }
      current.connections.push({
        direction: direction as Connection["direction"],
        targetName: targetName!,
        targetConst: targetConst!,
        offset: parseNum(offset!),
      });
    }
  }
  return out;
}

export interface MapHeaderEntry {
  name: string;
  group: number;
  number: number;
  tileset: string;
  environment: string;
  landmark: string;
  music: string;
  phoneFlag: string;
  palette: string;
  fishGroup: string;
}

/**
 * `data/maps/maps.asm`: `MapGroupPointers::` gives each `MapGroup_<X>` label
 * its group index (order of the `dw` lines, from 1); each label's `map`
 * lines number from 1 within that group.
 */
export function parseMapHeaders(text: string): MapHeaderEntry[] {
  const lines = stripMacroDefs(text);

  const groupIndexByLabel = new Map<string, number>();
  let inPointerTable = false;
  let pointerIndex = 0;
  for (const line of lines) {
    const stripped = stripComment(line);
    if (/^\s*MapGroupPointers::\s*$/.test(stripped)) {
      inPointerTable = true;
      continue;
    }
    if (!inPointerTable) continue;
    const dw = stripped.match(/^\s*dw\s+(\S+)/);
    if (dw) {
      pointerIndex++;
      groupIndexByLabel.set(dw[1]!, pointerIndex);
      continue;
    }
    // The table has directives before its dw lines (`table_width`) and
    // after them (`assert_table_length`), both inert. Only the next real
    // label (the first MapGroup_* section) ends the table.
    if (/^\s*([A-Za-z_][A-Za-z0-9_]*)::?\s*$/.test(stripped)) inPointerTable = false;
  }

  const out: MapHeaderEntry[] = [];
  let group = 0;
  let number = 0;
  for (const line of lines) {
    const label = stripComment(line).match(/^\s*([A-Za-z_][A-Za-z0-9_]*)::?\s*$/);
    if (label && label[1]!.startsWith("MapGroup_")) {
      group = groupIndexByLabel.get(label[1]!) ?? 0;
      number = 0;
      continue;
    }
    const m = matchCall(line, "map");
    if (m) {
      number++;
      const [name, tileset, environment, landmark, music, phoneFlag, palette, fishGroup] = m;
      out.push({
        name: name!,
        group,
        number,
        tileset: tileset!,
        environment: environment!,
        landmark: landmark!,
        music: music!,
        phoneFlag: phoneFlag!,
        palette: palette!,
        fishGroup: fishGroup!,
      });
    }
  }
  return out;
}

/** Refuses (throws, naming the duplicate key and its source) rather than letting a later entry silently overwrite an earlier one. */
function assertNoDuplicates<T>(entries: T[], keyFn: (e: T) => string, sourceFile: string): void {
  const seen = new Set<string>();
  for (const e of entries) {
    const key = keyFn(e);
    if (seen.has(key)) {
      throw new Error(`${sourceFile}: duplicate entry "${key}" -- refusing to silently overwrite`);
    }
    seen.add(key);
  }
}

/**
 * Refuses (throws, naming the count and the orphaned keys) when an entry's
 * key is absent from `present` -- the other direction of the join-miss
 * refusal from the attributes-driven loop in `loadGbcMaps`, so a map_const
 * or header with no `map_attributes` counterpart isn't silently dropped.
 */
function assertNoOrphans<T>(entries: T[], keyFn: (e: T) => string, present: Set<string>, sourceFile: string, label: string): void {
  const orphans = entries.filter((e) => !present.has(keyFn(e)));
  if (orphans.length > 0) {
    throw new Error(`${sourceFile}: ${orphans.length} ${label}(s) have no map_attributes entry: ${orphans.map(keyFn).join(", ")}`);
  }
}

export interface LoadedGbcMaps {
  maps: GbcMap[];
  /** Refuses (throws, naming the map) on a miss -- matches `project.ts`'s GBA refusal style. */
  map(name: string): GbcMap;
}

/**
 * Joins `constants/map_constants.asm`, `data/maps/attributes.asm`,
 * `data/maps/maps.asm` and `data/maps/blocks.asm` into one `GbcMap` per map
 * (GBC format findings §3.6). Refuses (throws, naming the map and the
 * mismatched values) on any join miss or group/number disagreement, rather
 * than guessing (G4).
 */
export function loadGbcMaps(root: string): LoadedGbcMaps {
  const r = norm(root);
  const attributesAsm = `${r}/data/maps/attributes.asm`;

  // Task 10 passes --project straight through from user input, so this is
  // the first error most users will ever see from this tool for a GBC root.
  // Every other read below would otherwise fail as a bare ENOENT naming
  // neither the root nor what was expected to be there (mirrors project.ts's
  // openProject guard for the GBA loader).
  if (!existsSync(attributesAsm)) {
    throw new Error(`${root} does not look like a pokecrystal-family project root: missing ${attributesAsm}`);
  }

  const mapConsts = parseMapConstants(readFileSync(`${r}/constants/map_constants.asm`, "utf8"));
  const attributes = parseMapAttributes(readFileSync(attributesAsm, "utf8"));
  const headers = parseMapHeaders(readFileSync(`${r}/data/maps/maps.asm`, "utf8"));
  const incbins = parseIncbins(readFileSync(`${r}/data/maps/blocks.asm`, "utf8"));

  // Refuse (G4) rather than let a duplicate key silently overwrite an
  // earlier entry when building the by-name/by-const lookup Maps below.
  assertNoDuplicates(mapConsts, (c) => c.constName, "constants/map_constants.asm");
  assertNoDuplicates(headers, (h) => h.name, "data/maps/maps.asm");
  assertNoDuplicates(attributes, (a) => a.name, "data/maps/attributes.asm");

  const mapConstByConst = new Map(mapConsts.map((c) => [c.constName, c]));
  const headerByName = new Map(headers.map((h) => [h.name, h]));
  const blkPathByLabel = new Map<string, string>();
  for (const entry of incbins) {
    for (const label of entry.labels) blkPathByLabel.set(label, entry.path);
  }

  // The join below is attributes-driven; also refuse (G4) the other
  // direction -- a map_const or header with no map_attributes counterpart
  // must not be silently dropped.
  const attrConstNames = new Set(attributes.map((a) => a.constName));
  assertNoOrphans(mapConsts, (c) => c.constName, attrConstNames, "constants/map_constants.asm", "constant");
  const attrNames = new Set(attributes.map((a) => a.name));
  assertNoOrphans(headers, (h) => h.name, attrNames, "data/maps/maps.asm", "header");

  const maps: GbcMap[] = attributes.map((attr) => {
    const header = headerByName.get(attr.name);
    if (!header) {
      throw new Error(`map ${attr.name}: no header found in data/maps/maps.asm (join miss on name)`);
    }
    const mc = mapConstByConst.get(attr.constName);
    if (!mc) {
      throw new Error(
        `map ${attr.name}: constant ${attr.constName} not found in constants/map_constants.asm (join miss on constName)`,
      );
    }
    const blkPath = blkPathByLabel.get(`${attr.name}_Blocks`);
    if (!blkPath) {
      throw new Error(`map ${attr.name}: no "${attr.name}_Blocks" label found in data/maps/blocks.asm (join miss on blocks)`);
    }
    if (header.group !== mc.group || header.number !== mc.number) {
      throw new Error(
        `map ${attr.name}: group/number mismatch -- data/maps/maps.asm says group ${header.group} number ${header.number}, ` +
          `constants/map_constants.asm says group ${mc.group} number ${mc.number}`,
      );
    }
    return {
      name: attr.name,
      constName: attr.constName,
      group: mc.group,
      number: mc.number,
      width: mc.width,
      height: mc.height,
      blkPath,
      tileset: header.tileset,
      environment: header.environment,
      landmark: header.landmark,
      music: header.music,
      phoneFlag: header.phoneFlag,
      palette: header.palette,
      fishGroup: header.fishGroup,
      border: attr.border,
      connectionFlags: attr.connectionFlags,
      connections: attr.connections,
    };
  });

  const byName = new Map(maps.map((m) => [m.name, m]));
  return {
    maps,
    map(name: string): GbcMap {
      const m = byName.get(name);
      if (!m) throw new Error(`unknown map ${name}; not listed in ${attributesAsm}`);
      return m;
    },
  };
}

/**
 * Reads a map's `.blk` and decodes it against its declared width x height.
 * Mimics the engine's `ChangeMap`, which copies exactly w*h bytes: an
 * oversize file (2 real hits in the corpus, both PerfPlus-added) loads its
 * first w*h bytes with a flagged, non-writable `Layout` (Decision 3) rather
 * than the whole buffer. An undersize file has nothing sensible to copy, so
 * it refuses (throws) instead of guessing (G4).
 */
export function loadLayout(root: string, map: Pick<GbcMap, "blkPath" | "width" | "height">): {
  layout: Layout;
  defects: DataDefect[];
} {
  const r = norm(root);
  const buf = readFileSync(`${r}/${map.blkPath}`);
  const expected = map.width * map.height;

  if (buf.length < expected) {
    throw new Error(
      `${map.blkPath}: buffer is ${buf.length} bytes, smaller than declared ${map.width}x${map.height}=${expected} -- refusing to guess`,
    );
  }

  if (buf.length !== expected) {
    return {
      layout: { blkPath: map.blkPath, width: map.width, height: map.height, blocks: parseBlk(buf.subarray(0, expected)), writable: false },
      defects: [
        {
          file: map.blkPath,
          message: `${map.blkPath}: actual size ${buf.length} bytes, declared ${map.width}x${map.height}=${expected} -- loaded first ${expected} bytes, not writable`,
        },
      ],
    };
  }

  return {
    layout: { blkPath: map.blkPath, width: map.width, height: map.height, blocks: parseBlk(buf), writable: true },
    defects: [],
  };
}
