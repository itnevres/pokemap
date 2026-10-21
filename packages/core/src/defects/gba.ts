import { readFileSync } from "node:fs";
import type { Project } from "../project.js";
import { parseMap, parseMapGroups } from "../load/maps.js";
import { parseLayouts } from "../load/layouts.js";
import { parseBlocks } from "../load/blocks.js";
import { sizeDefect } from "./size.js";
import type { DataDefect } from "./types.js";

import type { SymbolIndex } from "./symbols.js";

const SPECIAL_MAPS = new Set(["MAP_DYNAMIC", "MAP_UNDEFINED", "MAP_NONE"]);
const SPECIAL_WARPS = new Set(["WARP_ID_NONE", "WARP_ID_DYNAMIC", "WARP_ID_SECRET_BASE"]);

/** Read source data afresh: Project.map/layout caches can predate a successful save. */
export function gbaMapDefects(proj: Project, mapName: string, _opts?: { symbols?: SymbolIndex }): DataDefect[] {
  const names = parseMapGroups(readFileSync(proj.paths.mapGroupsJson, "utf8")).allMapNames();
  if (!names.includes(mapName)) throw new Error(`unknown map ${mapName}`);
  const map = parseMap(readFileSync(proj.paths.mapJson(mapName), "utf8"));
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
  const primary = proj.tileset(layout.primaryTileset).metatileCount;
  const ceiling = Math.min(split + proj.tileset(layout.secondaryTileset).metatileCount, proj.constants.metatilesTotal);
  const badIds = [...new Set(parseBlocks(raw, proj.profile).slice(0, layout.width * layout.height)
    .map((b) => b.metatileId).filter((id) => id < split ? id >= primary : id >= ceiling))].sort((a, b) => a - b);
  if (badIds.length) add("gameplay", `Metatile id(s) ${badIds.join(", ")} are out of range for this layout's split.`,
    `Replace these ids in ${layout.blockdataFilepath} with ids in 0..${Math.min(primary, split) - 1} or ${split}..${ceiling - 1}.`,
    layout.blockdataFilepath);

  // Resolve by the declared id, never by a guessed conversion of directory names.
  const byId = new Map(names.map((name) => {
    const m = name === mapName ? map : parseMap(readFileSync(proj.paths.mapJson(name), "utf8"));
    return [m.id, m] as const;
  }));
  map.warpEvents.forEach((warp, i) => {
    if (SPECIAL_MAPS.has(warp.destMap)) return;
    const dest = byId.get(warp.destMap);
    if (!dest) {
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
    if (!byId.has(connection.map)) add("build", `Connection ${i} destination ${connection.map} does not exist in data/maps/map_groups.json.`,
      `Set connection ${i} map in ${file} to a map id listed in data/maps/map_groups.json.`);
  });
  return out;
}
