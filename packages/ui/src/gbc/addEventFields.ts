import type { EventKind, ObjectType } from "@pokemap/core/src/addEvent/types.js";
import type { AddEventContext, FieldSpec } from "../shell/adapter.js";

export const family = "gbc" as const;
export function addEventFields(kind: EventKind, objectType: ObjectType, ctx: AddEventContext): FieldSpec[] {
  const o = ctx.options;
  const select = (key: string, label: string, options: string[]): FieldSpec => ({ key, label, kind: "select", options });
  const number = (key: string, label: string): FieldSpec => ({ key, label, kind: "number" });
  const flag: FieldSpec = { key: "flag", label: objectType === "trainer" ? "Beaten flag" : "Flag", kind: "source", options: objectType === "npc" && kind === "object" ? ["-1", ...o.flags] : o.flags, modes: ["existing", "new"] };
  const script: FieldSpec = { key: "script", label: "Script", kind: "source", options: ctx.map.entryPoints, modes: ["existing", "copy", "new"] };
  if (kind === "warp") return [select("destMap", "Destination map", o.maps), select("destWarp", "Destination warp", ctx.map.warps.map(w => String(w.n)))];
  if (kind === "coord") return [select("scene", "Scene", ["-1", ...ctx.map.scenes]), script];
  const label: FieldSpec = { key: "label", label: "Generated script label", kind: "text" };
  if (kind === "bg") return [select("bgType", "BG type", o.bgTypes.filter(t => t !== "BGEVENT_COPY")),
    { ...label, showIf: v => ["BGEVENT_ITEM", "BGEVENT_IFSET", "BGEVENT_IFNOTSET"].includes(v.bgType ?? "") },
    { ...select("item", "Item", o.items), showIf: v => v.bgType === "BGEVENT_ITEM" },
    { ...flag, showIf: v => ["BGEVENT_ITEM", "BGEVENT_IFSET", "BGEVENT_IFNOTSET"].includes(v.bgType ?? "") },
    { ...script, showIf: v => v.bgType !== "BGEVENT_ITEM" }];
  const fields: FieldSpec[] = [select("sprite", "Sprite", o.sprites), select("movement", "Movement", o.movements), number("rangeX", "Range X"), number("rangeY", "Range Y"), number("hourStart", "Hour start"), number("hourEnd", "Hour end"), select("palette", "Palette", o.palettes), { key: "objectConst", label: "Object constant (automatic if empty)", kind: "text" }];
  if (objectType === "npc") return [...fields, flag, script];
  if (objectType === "itemball") return [...fields, label, select("item", "Item", o.items), flag];
  return [...fields, label, select("trainer", "Trainer", o.trainers.map(t => t.id)), number("sightRange", "Sight range"), flag,
    ...(["seen", "beaten", "after"] as const).map((key): FieldSpec => ({ key, label: key === "after" ? "After battle" : key === "seen" ? "Seen" : "Beaten", kind: "source", options: ctx.map.localTexts, modes: ["copy", "new"] }))];
}
export function addEventDefaults(kind: EventKind, objectType: ObjectType, ctx: AddEventContext): Record<string, string> {
  const o = ctx.options, cap = kind[0]!.toUpperCase() + kind.slice(1);
  const taken = new Set([...ctx.map.entryPoints, ...ctx.map.localScripts, ...ctx.map.localTexts, ...o.flags]);
  let n = 1;
  while (taken.has(`${ctx.mapName}Pokemap${cap}${n}`) || taken.has(`${ctx.mapName}Pokemap${cap}${n}Text`) || taken.has(`${ctx.mapName}Pokemap${cap}${n}Wrapper`)) n++;
  const label = `${ctx.mapName}Pokemap${cap}${n}`;
  return { sprite: o.sprites.includes("SPRITE_YOUNGSTER") ? "SPRITE_YOUNGSTER" : o.sprites[0] ?? "", movement: o.movements.includes("SPRITEMOVEDATA_STANDING_DOWN") ? "SPRITEMOVEDATA_STANDING_DOWN" : o.movements[0] ?? "", rangeX: "0", rangeY: "0", hourStart: "-1", hourEnd: "-1", palette: "0", objectConst: "", flagMode: objectType === "npc" && kind !== "bg" ? "existing" : "new", flag: "-1", flagName: `EVENT_${ctx.mapName.toUpperCase()}_POKEMAP_${cap.toUpperCase()}${n}`, scriptMode: "new", scriptLabel: label, script: ctx.map.entryPoints[0] ?? "", scriptText: "", label: kind === "bg" ? `${label}Wrapper` : label, item: o.items[0] ?? "", trainer: o.trainers[0]?.id ?? "", sightRange: "3", seenMode: "new", beatenMode: "new", afterMode: "new", seenText: "", beatenText: "", afterText: "", bgType: o.bgTypes.includes("BGEVENT_READ") ? "BGEVENT_READ" : o.bgTypes[0] ?? "", scene: ctx.map.scenes[0] ?? "-1", destMap: o.maps[0] ?? "", destWarp: String(ctx.map.warps[0]?.n ?? "") };
}
