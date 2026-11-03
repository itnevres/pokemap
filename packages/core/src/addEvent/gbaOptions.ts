import { join, normalize } from "node:path";
import { parseMapGroups } from "../load/maps.js";
import { projectPaths } from "../config/paths.js";
import { cDefines, optionName, read, textFiles } from "./sources.js";
import type { EventOptions, GbaBehaviors } from "./types.js";

function unusedSlots(root: string): Record<"FLAG" | "VAR", string[]> {
  const headers = {
    FLAG: normalize(join(root, "include/constants/flags.h")),
    VAR: normalize(join(root, "include/constants/vars.h")),
  };
  const referenced = { FLAG: new Set<string>(), VAR: new Set<string>() };
  // One read and one combined token scan per text file, for both slot kinds.
  for (const dir of ["src", "include", "data"]) for (const file of textFiles(join(root, dir), [".c", ".h", ".inc", ".s", ".json"])) {
    const path = normalize(file);
    for (const match of read(file).matchAll(/\b(FLAG|VAR)_UNUSED_\w+\b/g)) {
      const kind = match[1] as "FLAG" | "VAR";
      if (path !== headers[kind]) referenced[kind].add(match[0]);
    }
  }
  const candidates = (kind: "FLAG" | "VAR") => cDefines(read(headers[kind]))
    .map(d => d.name).filter(n => n.startsWith(`${kind}_UNUSED_`) && !referenced[kind].has(n));
  return { FLAG: candidates("FLAG"), VAR: candidates("VAR") };
}

export function freeGbaSlots(root: string, kind: "FLAG" | "VAR"): string[] {
  return unusedSlots(root)[kind];
}

export function loadGbaEventOptions(root: string): EventOptions {
  const defs = textFiles(join(root, "include/constants"), [".h"]).flatMap(p => cDefines(read(p)));
  const names = (prefix: string) => [...new Set(defs.map(d => d.name).filter(n => n.startsWith(prefix) && optionName(n)))];
  const maps = parseMapGroups(read(projectPaths(root).mapGroupsJson)).allMapNames();
  const slots = unusedSlots(root);
  const cap = defs.find(d => d.name === "OBJECT_EVENT_TEMPLATES_COUNT");
  if (!cap || !/^\d+$/.test(cap.value)) throw new Error(`${root}: include/constants/global.h: missing numeric OBJECT_EVENT_TEMPLATES_COUNT`);
  // Reuse the configured event-object header path rather than a second path convention.
  const sprites = cDefines(read(projectPaths(root).eventObjectsH)).map(d => d.name)
    .filter(n => n.startsWith("OBJ_EVENT_GFX_") && optionName(n));
  // Item IDs precede ITEMS_COUNT; later defines describe use categories.
  const itemText = read(join(root, "include/constants/items.h"));
  const itemEnd = itemText.search(/^\s*#define[ \t]+ITEMS_COUNT\b/m);
  if (itemEnd < 0) throw new Error(`${root}: include/constants/items.h: missing ITEMS_COUNT`);
  const items = cDefines(itemText.slice(0, itemEnd)).map(d => d.name)
    .filter(n => n.startsWith("ITEM_") && optionName(n));
  // Base types and SECRET_BASE_GROUP(...) entries are not entrance IDs.
  const baseDefs = cDefines(read(join(root, "include/constants/secret_bases.h")))
    .filter(d => /^SECRET_BASE_\w+_\d+$/.test(d.name));
  const baseIds = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of baseDefs) if (!baseIds.has(d.name) && (/^(?:0x[\da-f]+|\d+)$/i.test(d.value) || baseIds.has(d.value))) {
      baseIds.add(d.name); changed = true;
    }
  }
  return {
    family: "gba", sprites, movements: names("MOVEMENT_TYPE_"), flags: names("FLAG_"), vars: names("VAR_"),
    items, trainers: cDefines(read(join(root, "include/constants/opponents.h")))
      .map(d => d.name).filter(n => n.startsWith("TRAINER_") && optionName(n)).map(id => ({ id, label: id })),
    bgTypes: ["sign", "hidden_item", "secret_base"], facings: names("BG_EVENT_PLAYER_FACING_"),
    secretBases: baseDefs.filter(d => baseIds.has(d.name)).map(d => d.name), palettes: [], maps, objectCap: Number(cap.value),
    freeFlagSlots: slots.FLAG.length, freeVarSlots: slots.VAR.length,
  };
}

/** field_control_avatar.c:846-946 (IsWarpMetatileBehavior and arrow direction cases).
 * metatile_behavior.c:247-320, 1191-1232, 1251-1258 resolve these predicates,
 * including custom Kanto stairs/regular warp and Union Room's reused bridge.
 * This is capability only: direction/elevation/actual warp event are checked by the engine.
 */
export function gbaWarpBehavior(behavior: number, b: GbaBehaviors): boolean {
  return ["MB_ANIMATED_DOOR", "MB_LADDER", "MB_UP_ESCALATOR", "MB_DOWN_ESCALATOR",
    "MB_NON_ANIMATED_DOOR", "MB_WATER_DOOR", "MB_DEEP_SOUTH_WARP", "MB_LAVARIDGE_GYM_B1F_WARP",
    "MB_LAVARIDGE_GYM_1F_WARP", "MB_AQUA_HIDEOUT_WARP", "MB_MT_PYRE_HOLE", "MB_MOSSDEEP_GYM_WARP",
    "MB_BRIDGE_OVER_OCEAN", "MB_UP_LEFT_STAIR_WARP", "MB_UP_RIGHT_STAIR_WARP", "MB_DOWN_LEFT_STAIR_WARP",
    "MB_DOWN_RIGHT_STAIR_WARP", "MB_REGULAR_WARP", "MB_NORTH_ARROW_WARP", "MB_SOUTH_ARROW_WARP",
    "MB_EAST_ARROW_WARP", "MB_WEST_ARROW_WARP"].some(n => b[n] !== undefined && b[n] === behavior);
}
