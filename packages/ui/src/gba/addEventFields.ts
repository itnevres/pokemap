import type { EventKind, ObjectType } from "@pokemap/core/src/addEvent/types.js";
import type { AddEventContext, FieldSpec } from "../shell/adapter.js";

export const family = "gba" as const;
export function addEventFields(kind: EventKind, objectType: ObjectType, ctx: AddEventContext): FieldSpec[] {
  const o = ctx.options;
  const select = (key: string, label: string, options: string[]): FieldSpec => ({ key, label, kind: "select", options });
  const number = (key: string, label: string): FieldSpec => ({ key, label, kind: "number" });
  const flag: FieldSpec = { key: "flag", label: objectType === "trainer" ? "Beaten flag" : "Flag", kind: "source", options: ["0", ...o.flags], modes: ["existing", "new"] };
  const script: FieldSpec = { key: "script", label: "Script", kind: "source", options: ctx.map.entryPoints.filter(p => kind === "object" || p !== "0x0"), modes: ["existing", "copy", "new"] };
  const elevation = number("elevation", "Elevation");
  if (kind === "warp") return [select("destMap", "Destination map", o.maps), select("destWarp", "Destination warp", ctx.map.warps.map(w => String(w.n))), elevation];
  if (kind === "coord") return [{ key: "varName", label: "Var", kind: "source", options: o.vars, modes: ["existing", "new"] }, number("varValue", "Var value"), elevation, script];
  if (kind === "bg") return [select("bgType", "BG type", o.bgTypes), elevation,
    { ...select("facing", "Facing", o.facings), showIf: v => v.bgType === "sign" },
    { ...select("item", "Item", o.items), showIf: v => v.bgType === "hidden_item" },
    { ...flag, options: o.flags, showIf: v => v.bgType === "hidden_item" },
    { ...select("secretBase", "Secret base", o.secretBases), showIf: v => v.bgType === "secret_base" },
    { ...script, showIf: v => v.bgType === "sign" }];
  const fields: FieldSpec[] = [
    ...(objectType === "itemball" ? [] : [select("sprite", "Sprite", o.sprites)]),
    select("movement", "Movement", o.movements), number("rangeX", "Range X"), number("rangeY", "Range Y"), elevation,
  ];
  if (objectType === "npc") return [...fields, flag, script];
  const generated: FieldSpec = { key: "label", label: "Generated script label", kind: "text" };
  if (objectType === "itemball") return [...fields, generated, select("item", "Item", o.items), { ...flag, options: o.flags }];
  return [...fields, generated, select("trainer", "Trainer", o.trainers.map(t => t.id)), number("sightRange", "Sight range"), { ...flag, options: o.flags },
    ...(["seen", "beaten", "after"] as const).map((key): FieldSpec => ({ key, label: key === "after" ? "After battle" : key === "seen" ? "Seen" : "Beaten", kind: "source", options: ctx.map.localTexts, modes: ["copy", "new"] }))];
}
export function addEventDefaults(kind: EventKind, objectType: ObjectType, ctx: AddEventContext): Record<string, string> {
  const o = ctx.options, cap = kind[0]!.toUpperCase() + kind.slice(1);
  const taken = new Set([...ctx.map.entryPoints, ...ctx.map.localScripts, ...ctx.map.localTexts, ...o.flags, ...o.vars]);
  let n = 1;
  while (taken.has(`${ctx.mapName}_EventScript_Pokemap${cap}${n}`) || taken.has(`${ctx.mapName}_Text_Pokemap${cap}${n}`)) n++;
  const label = `${ctx.mapName}_EventScript_Pokemap${cap}${n}`;
  return { sprite: o.sprites.includes("OBJ_EVENT_GFX_YOUNGSTER") ? "OBJ_EVENT_GFX_YOUNGSTER" : o.sprites[0] ?? "", movement: o.movements.includes("MOVEMENT_TYPE_FACE_DOWN") ? "MOVEMENT_TYPE_FACE_DOWN" : o.movements[0] ?? "", rangeX: "0", rangeY: "0", elevation: "", flagMode: objectType === "npc" && kind !== "bg" ? "existing" : "new", flag: "0", flagName: `FLAG_${ctx.mapName.toUpperCase()}_POKEMAP_${cap.toUpperCase()}${n}`, varNameMode: "existing", varName: o.vars[0] ?? "", varNameName: `VAR_${ctx.mapName.toUpperCase()}_POKEMAP${n}`, varValue: "0", scriptMode: "new", scriptLabel: label, script: ctx.map.entryPoints[0] ?? "", scriptText: "", label, item: o.items[0] ?? "", trainer: o.trainers[0]?.id ?? "", sightRange: "3", seenMode: "new", beatenMode: "new", afterMode: "new", seenText: "", beatenText: "", afterText: "", bgType: o.bgTypes.includes("sign") ? "sign" : o.bgTypes[0] ?? "", facing: o.facings[0] ?? "", secretBase: o.secretBases[0] ?? "", destMap: o.maps[0] ?? "", destWarp: String(ctx.map.warps[0]?.n ?? "") };
}
