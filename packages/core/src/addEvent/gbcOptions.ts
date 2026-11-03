import { join } from "node:path";
import { codeLines, parseConstDefs, stripComment } from "../gbc/load/asm.js";
import { constCounter, gbcEventGap } from "../gbc/load/constCounter.js";
import { optionName, read, textFiles } from "./sources.js";
import type { EventOptions, TrainerRef } from "./types.js";

export function loadGbcEventOptions(root: string): EventOptions {
  const source = (name: string) => read(join(root, "constants", name));
  const all = textFiles(join(root, "constants"), [".asm"]).map(read).join("\n");
  // For names alone no numeric interpretation is required (some enums use expressions).
  const names = [...new Set(codeLines(all).flatMap(l => {
    const m = /^\s*(?:const\s+|DEF\s+)([A-Za-z_]\w*)\b/.exec(stripComment(l.text));
    return m && optionName(m[1]!) ? [m[1]!] : [];
  }))];
  const withPrefix = (prefix: string) => names.filter(n => n.startsWith(prefix));
  const trainers: TrainerRef[] = [];
  let trainerClass = "";
  for (const l of codeLines(source("trainer_constants.asm"))) {
    const s = stripComment(l.text);
    const c = /^\s*trainerclass\s+(\w+)/.exec(s);
    if (c) trainerClass = c[1]!;
    const t = /^\s*const\s+(\w+)/.exec(s);
    if (t && trainerClass && trainerClass !== "TRAINER_NONE") {
      const id = `${trainerClass},${t[1]!}`; trainers.push({ id, label: id });
    }
  }
  const items = [...parseConstDefs(source("item_constants.asm")).keys()].filter(optionName);
  const flags = constCounter(source("event_flags.asm")).map(c => c.name).filter(n => n.startsWith("EVENT_"));
  const maps = codeLines(source("map_constants.asm")).flatMap(l => {
    const m = /^\s*map_const\s+(\w+)/.exec(stripComment(l.text)); return m ? [m[1]!] : [];
  });
  return { family: "gbc", sprites: constCounter(source("sprite_constants.asm")).map(c => c.name).filter(n => n.startsWith("SPRITE_") && optionName(n)), movements: withPrefix("SPRITEMOVEDATA_"), flags,
    vars: withPrefix("VAR_"), items, trainers, bgTypes: withPrefix("BGEVENT_").filter(n => n !== "BGEVENT_COPY"),
    facings: [], secretBases: [], palettes: ["0", ...withPrefix("PAL_NPC_")], maps, objectCap: 15,
    freeFlagSlots: gbcEventGap(source("event_flags.asm"))?.remaining ?? 0, freeVarSlots: 0 };
}

/** home/map.asm:234-235 calls CheckWarpCollision; engine/overworld/tile_events.asm:1-16
 * accepts COLL_PIT, COLL_PIT_68, or high nibble HI_NYBBLE_WARPS ($70).
 * constants/collision_constants.asm:66-81 names the full warp collision family.
 */
export function gbcWarpCapable(coll: number, names: Map<number, string>): boolean {
  if (!Number.isInteger(coll) || coll < 0 || coll > 255) return false;
  return (coll & 0xf0) === 0x70 || names.get(coll) === "COLL_PIT" || names.get(coll) === "COLL_PIT_68";
}

/** home/map.asm:1714-1741 GetCoordTile: rr d adds 1 for odd x;
 * rr e adds 2 for odd y. Collision quarters are TL, TR, BL, BR.
 */
export function gbcEventQuarter(x: number, y: number): number {
  return (x & 1) + 2 * (y & 1);
}
export function gbcTileWarpCapable(blockCollisions: readonly number[], x: number, y: number, names: Map<number, string>): boolean {
  const coll = blockCollisions[gbcEventQuarter(x, y)];
  return coll !== undefined && gbcWarpCapable(coll, names);
}
