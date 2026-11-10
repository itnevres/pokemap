import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { parseMapGroups } from "../load/maps.js";
import { projectPaths } from "../config/paths.js";
import { cDefines, optionName, read, textFiles } from "./sources.js";
import type { EventOptions, GbaBehaviors } from "./types.js";

/** Integer `+ - * %` with parentheses and unary signs; undefined for anything else. */
function arithmetic(expr: string): number | undefined {
  const tokens = expr.match(/\d+|[()+\-*%]/g) ?? [];
  if (tokens.join("") !== expr.replace(/\s+/g, "")) return undefined;
  let i = 0;
  const atom = (): number => {
    const t = tokens[i++];
    if (t === "(") { const v = sum(); if (tokens[i++] !== ")") throw new Error("unbalanced"); return v; }
    if (t === "-") return -atom();
    if (t === "+") return atom();
    if (t !== undefined && /^\d+$/.test(t)) return Number(t);
    throw new Error("unexpected token");
  };
  const product = (): number => {
    let v = atom();
    while (tokens[i] === "*" || tokens[i] === "%") { const op = tokens[i++]; const r = atom(); v = op === "*" ? v * r : v % r; }
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (tokens[i] === "+" || tokens[i] === "-") { const op = tokens[i++]; const r = product(); v = op === "+" ? v + r : v - r; }
    return v;
  };
  try { const v = sum(); return i === tokens.length ? v : undefined; } catch { return undefined; }
}

/** Integer value of every define in `header` and in the `constants/` headers it includes (one level, from `root`);
 * undefined unless the value is decimal/hex literals, other evaluable defines and `+ - * %` (exact in JS as in C). */
export function gbaDefineValues(root: string, header: string): Map<string, number | undefined> {
  const raw = new Map<string, string>();
  const included = [...header.matchAll(/^\s*#\s*include\s+"(constants\/[\w./]+)"/gm)].map(m => join(root, "include", m[1]!));
  for (const text of [...included.filter(p => existsSync(p)).map(read), header]) for (const d of cDefines(text)) raw.set(d.name, d.value);
  const values = new Map<string, number | undefined>();
  const evaluating = new Set<string>();
  const value = (name: string): number | undefined => {
    if (values.has(name)) return values.get(name);
    const text = raw.get(name);
    if (text === undefined || evaluating.has(name)) return undefined;
    evaluating.add(name);
    let ok = true;
    const expr = text.replace(/\b0x[\da-f]+\b|\b\d+\b|[A-Za-z_]\w*/gi, token => {
      // A leading-zero literal is octal in C; refuse it rather than misread it.
      const v = /^\d/.test(token) ? (/^0\d/.test(token) ? undefined : Number(token)) : value(token);
      if (v === undefined) ok = false;
      return `(${v})`;
    });
    const result = ok ? arithmetic(expr) : undefined;
    evaluating.delete(name);
    values.set(name, Number.isSafeInteger(result) ? result : undefined);
    return values.get(name);
  };
  for (const name of raw.keys()) value(name);
  return values;
}

/** Engine ranges a new persistent flag or var must avoid: temp, daily (cleared each day) and special (unsaved). */
const RESERVED = { FLAG: ["TEMP_FLAGS", "DAILY_FLAGS", "SPECIAL_FLAGS"], VAR: ["TEMP_VARS", "SPECIAL_VARS"] } as const;

function unusedSlots(root: string): Record<"FLAG" | "VAR", string[]> {
  const headers = {
    FLAG: normalize(join(root, "include/constants/flags.h")),
    VAR: normalize(join(root, "include/constants/vars.h")),
  };
  // Every occurrence anywhere, the header included; a free slot's only occurrence is its own #define.
  const uses = { FLAG: new Map<string, number>(), VAR: new Map<string, number>() };
  // One read and one combined token scan per text file, for both slot kinds.
  for (const dir of ["src", "include", "data"]) for (const file of textFiles(join(root, dir), [".c", ".h", ".inc", ".s", ".json"])) {
    for (const match of read(file).matchAll(/\b(FLAG|VAR)_UNUSED_\w+\b/g)) {
      const count = uses[match[1] as "FLAG" | "VAR"];
      count.set(match[0], (count.get(match[0]) ?? 0) + 1);
    }
  }
  const candidates = (kind: "FLAG" | "VAR") => {
    const text = read(headers[kind]);
    const defs = cDefines(text);
    const values = gbaDefineValues(root, text);
    const owners = new Map<number, number>();
    for (const d of defs) { const v = values.get(d.name); if (v !== undefined) owners.set(v, (owners.get(v) ?? 0) + 1); }
    const ranges = RESERVED[kind].filter(r => values.has(`${r}_START`)).map(r => [values.get(`${r}_START`), values.get(`${r}_END`)]);
    return defs.map(d => d.name).filter(n => {
      const v = values.get(n);
      return n.startsWith(`${kind}_UNUSED_`) && uses[kind].get(n) === 1 && v !== undefined && owners.get(v) === 1 &&
        ranges.every(([start, end]) => start !== undefined && end !== undefined && (v < start || v > end));
    });
  };
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
    family: "gba", sprites, movements: names("MOVEMENT_TYPE_"), flags: names("FLAG_").filter(n => !n.includes("_UNUSED_")), vars: names("VAR_").filter(n => !n.includes("_UNUSED_")),
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
