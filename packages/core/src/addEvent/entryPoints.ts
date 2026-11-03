import { join } from "node:path";
import { codeLines, scanCalls, stripComment } from "../gbc/load/asm.js";
import { read, textFiles } from "./sources.js";

function bodies(text: string, family: "gba" | "gbc"): Map<string, string> {
  const out = new Map<string, string>();
  let label: string | undefined;
  for (const l of codeLines(text)) {
    const s = (family === "gbc" ? stripComment(l.text) : l.text.replace(/@.*$/, "")).trim();
    const m = /^([A-Za-z_]\w*)::?(.*)$/.exec(s);
    if (m) { label = m[1]!; out.set(label, ""); }
    const instruction = m ? m[2]!.trim() : s;
    if (label && instruction && !instruction.startsWith(".") && !out.get(label)) out.set(label, instruction);
    // Preserve data directives so they cannot look like executable labels.
    else if (label && instruction && !out.get(label)) out.set(label, instruction);
  }
  return out;
}
function executable(body: string, family: "gba" | "gbc"): boolean {
  if (!body) return false;
  if (family === "gbc") return !/^(?:itemball|hiddenitem|trainer|conditional_event|def_|db\b|dw\b|text\b|line\b|para\b|done\b|prompt\b)/.test(body);
  return !/^(?:\.|map_script\b|map_script_2\b|step_|walk_|run_|face_|delay_|movement_|end_movement\b)/.test(body);
}
function gbcReferences(text: string): string[] {
  const out: string[] = [];
  for (const [macro, index] of [["object_event", 11], ["bg_event", 3], ["coord_event", 3], ["scene_script", 0], ["callback", 1]] as const) {
    for (const call of scanCalls(text, macro)) {
      const ref = call.args[index]?.text;
      if (ref) out.push(ref);
    }
  }
  return out;
}
export function entryPointsFor(family: "gba" | "gbc", root: string, mapName: string, mapText: string): string[] {
  const refs = new Set<string>();
  const definitions = new Map<string, string>();
  if (family === "gbc") {
    for (const p of textFiles(join(root, "maps"), [".asm"])) {
      const text = p === join(root, "maps", `${mapName}.asm`) ? mapText : read(p);
      for (const ref of gbcReferences(text)) refs.add(ref);
    }
    for (const ref of gbcReferences(mapText)) refs.add(ref);
    // Own file or ROM0 home only. Sharing a SECTION never grants eligibility.
    for (const text of [mapText, ...textFiles(join(root, "home"), [".asm"]).map(read)]) {
      for (const [name, body] of bodies(text, family)) definitions.set(name, body);
    }
    refs.add("ObjectEvent");
  } else {
    for (const p of textFiles(join(root, "data/maps"), [".json"])) {
      if (!/[\\/]map\.json$/.test(p)) continue;
      const map = JSON.parse(read(p)) as Record<string, unknown>;
      for (const key of ["object_events", "coord_events", "bg_events"]) {
        for (const e of (map[key] ?? []) as { script?: string }[]) if (e.script) refs.add(e.script);
      }
    }
    for (const text of [...textFiles(join(root, "data"), [".inc", ".s"]).map(read), mapText]) {
      for (const [name, body] of bodies(text, family)) definitions.set(name, body);
    }
  }
  const entries = [...refs].filter(n => executable(definitions.get(n) ?? "", family));
  return [...new Set([family === "gba" ? "0x0" : "ObjectEvent", ...entries])].sort();
}
