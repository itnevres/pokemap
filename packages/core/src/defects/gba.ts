import { readFileSync } from "node:fs";
import type { Project } from "../project.js";
import { parseMap, parseMapGroups, type MapData } from "../load/maps.js";
import { parseLayouts } from "../load/layouts.js";
import { parseTilesetPaths } from "../load/tilesets.js";
import { parseBlocks } from "../load/blocks.js";
import { sizeDefect } from "./size.js";
import type { DataDefect, MapDefectsCheck } from "./types.js";

import { resolvesAll, type SymbolIndex } from "./symbols.js";

export function gbaEventSymbolDefects(map: MapData, symbols: SymbolIndex): DataDefect[] {
  const file = `data/maps/${map.name}/map.json`;
  const out: DataDefect[] = [];
  const check = (code: string, subject: string, expr: unknown, labels = false) => {
    if (typeof expr !== "string") return;
    if (labels && ["NULL", "0x0", "0"].includes(expr)) return;
    if (code === "C8" && /^OBJ_EVENT_GFX_VAR_[0-9A-F]$/.test(expr)) return;
    // SR2: expressions are only checked when all their identifiers resolve.
    // ponytail: token-pasting macros such as OBJ_EVENT_GFX_SPECIES(ZYGARDE) are not evaluated; a macro-generated label or constant is outside the text-scan index, so such expressions stay unchecked.
    if (/[+(]/.test(expr) && !resolvesAll(expr, symbols)) return;
    if (!resolvesAll(expr, { labels: labels ? symbols.labels : new Set(), constants: labels ? new Set() : symbols.constants })) {
      out.push({ file, kind: "build", message: `${code}: ${subject} references undefined ${expr}.`,
        fix: `Define ${expr} in ${labels ? "data/**/*.inc or data/*.s" : "include/constants/*.h"}, or correct ${subject} in ${file}.` });
    }
  };
  map.objectEvents.forEach((event, i) => {
    check("C7", `object ${i} script`, event.script, true);
    check("C8", `object ${i} graphics`, event.graphicsId);
    check("C9", `object ${i} flag`, event.flag);
  });
  map.coordEvents.forEach((event, i) => check("C7", `coord ${i} script`, event.script, true));
  map.bgEvents.forEach((event, i) => {
    check("C7", `bg ${i} script`, event.script, true);
    check("C9", `bg ${i} flag`, event.flag);
  });
  return out;
}

const SPECIAL_MAPS = new Set(["MAP_DYNAMIC", "MAP_UNDEFINED"]);
const SPECIAL_WARPS = new Set(["WARP_ID_NONE", "WARP_ID_DYNAMIC", "WARP_ID_SECRET_BASE"]);

/** Read source data afresh: Project.map/layout caches can predate a successful save. */
export function gbaMapDefects(proj: Project, mapName: string, opts?: { symbols?: SymbolIndex }): DataDefect[] {
  return checkGbaMapDefects(proj, mapName, opts).defects;
}

export function checkGbaMapDefects(proj: Project, mapName: string, opts?: { symbols?: SymbolIndex }): MapDefectsCheck {
  const names = parseMapGroups(readFileSync(proj.paths.mapGroupsJson, "utf8")).allMapNames();
  if (!names.includes(mapName)) throw new Error(`unknown map ${mapName}`);
  const readMap = (name: string) => {
    const path = proj.paths.mapJson(name);
    try { return parseMap(readFileSync(path, "utf8")); }
    catch (error) { throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const map = readMap(mapName);
  const layout = parseLayouts(readFileSync(proj.paths.layoutsJson, "utf8")).layouts.find((l) => l.id === map.layout);
  if (!layout) throw new Error(`no layout ${map.layout} for ${mapName}`);
  const file = `data/maps/${mapName}/map.json`;
  const out: DataDefect[] = [];
  const add = (kind: DataDefect["kind"], message: string, fix: string, target = file) =>
    out.push({ file: target, kind, message, fix });
  const raw = readFileSync(`${proj.paths.root}/${layout.blockdataFilepath}`);
  const expectedBytes = layout.width * layout.height * 2;
  if (raw.length !== expectedBytes) out.push(sizeDefect(layout.blockdataFilepath, raw.length, expectedBytes,
    `width/height for ${layout.id} in data/layouts/layouts.json`));

  // C2 dropped from v1 (spec: a check that cannot reach zero false positives is removed). The GBA subject has 71 off-map
  // events (60 objects, 9 warps, 2 bg) that are scripted staging, edge-adjacent (x == width) or vanilla leftovers;
  // bounds alone cannot tell them from errors. See the Task 3 report.

  const split = proj.splitFor(layout).metatiles;
  const tilesets = parseTilesetPaths(
    readFileSync(proj.paths.tilesetHeadersH, "utf8"),
    readFileSync(proj.paths.tilesetMetatilesH, "utf8"),
    [readFileSync(proj.paths.tilesetGraphicsH, "utf8"), readFileSync(proj.paths.tilesetGraphicsC, "utf8")],
  );
  const count = (symbol: string) => {
    const paths = tilesets.get(symbol);
    if (!paths) throw new Error(`Unknown tileset ${symbol} in ${proj.paths.tilesetHeadersH}`);
    // Eight u16 tile entries per metatile, as in loadTileset; no art or cached tileset is needed.
    return readFileSync(`${proj.paths.root}/${paths.metatilesBin}`).length / 16;
  };
  const primary = count(layout.primaryTileset);
  const ceiling = Math.min(split + count(layout.secondaryTileset), proj.constants.metatilesTotal);
  const badIds = [...new Set(parseBlocks(raw, proj.profile).slice(0, layout.width * layout.height)
    .map((b) => b.metatileId).filter((id) => id < split ? id >= primary : id >= ceiling))].sort((a, b) => a - b);
  if (badIds.length) add("gameplay", `Metatile id(s) ${badIds.join(", ")} are out of range for this layout's split.`,
    `Replace these ids in ${layout.blockdataFilepath} with ids in 0..${Math.min(primary, split) - 1} or ${split}..${ceiling - 1}.`,
    layout.blockdataFilepath);

  // Resolve by the declared id, never by a guessed conversion of directory names.
  const byId = new Map([[map.id, map]]);
  const incomplete: MapDefectsCheck["incomplete"] = [];
  for (const name of names) {
    if (name === mapName) continue;
    try {
      const other = readMap(name);
      byId.set(other.id, other);
    } catch (error) {
      incomplete.push({ file: `data/maps/${name}/map.json`, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  // With unreadable maps, an unresolved target may belong to one of them.
  // Keep known-destination/local checks, but never guess an identity or absence.
  map.warpEvents.forEach((warp, i) => {
    if (SPECIAL_MAPS.has(warp.destMap)) return;
    const dest = byId.get(warp.destMap);
    if (!dest) {
      if (incomplete.length > 0) return;
      add("build", `Warp ${i} destination ${warp.destMap} does not exist in data/maps/map_groups.json.`,
        `Set warp ${i} dest_map in ${file} to a map id listed in data/maps/map_groups.json.`);
      return;
    }
    // include/constants/maps.h: NONE=-1, SECRET_BASE=0x7e, DYNAMIC=0x7f.
    const id = Number(warp.destWarpId);
    if (SPECIAL_WARPS.has(warp.destWarpId) || [-1, 126, 127].includes(id)) return;
    if (Number.isInteger(id) && (id < 0 || id >= dest.warpEvents.length)) {
      add("gameplay", `Warp ${i} destination index ${warp.destWarpId} is outside ${warp.destMap}'s ${dest.warpEvents.length} warps (0-based).`,
        `Set warp ${i} dest_warp_id in ${file} to an existing 0-based warp index in data/maps/${dest.name}/map.json.`);
    }
  });
  if (map.objectEvents.length > 64) add("gameplay", `${map.objectEvents.length} object events exceed OBJECT_EVENT_TEMPLATES_COUNT (64).`,
    `Reduce object_events in ${file} to at most 64 (include/constants/global.h: OBJECT_EVENT_TEMPLATES_COUNT).`);
  map.connections.forEach((connection, i) => {
    if (incomplete.length === 0 && !byId.has(connection.map)) add("build", `Connection ${i} destination ${connection.map} does not exist in data/maps/map_groups.json.`,
      `Set connection ${i} map in ${file} to a map id listed in data/maps/map_groups.json.`);
  });
  if (opts?.symbols) out.push(...gbaEventSymbolDefects(map, opts.symbols));
  return { defects: out, incomplete };
}
