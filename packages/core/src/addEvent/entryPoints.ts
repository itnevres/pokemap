import { join } from "node:path";
import { codeLines, scanCalls, stripComment } from "../gbc/load/asm.js";
import { read, textFiles } from "./sources.js";

function bodies(text: string, family: "gba" | "gbc"): Map<string, string> {
  const out = new Map<string, string>();
  let label: string | undefined;
  for (const l of codeLines(text)) {
    const s = (family === "gbc" ? stripComment(l.text) : l.text.replace(/@.*$/, "")).trim();
    const m = /^(\.?[A-Za-z_]\w*)::?(.*)$/.exec(s);
    if (m && !m[1]!.startsWith(".")) { label = m[1]!; out.set(label, ""); }
    const instruction = m ? m[2]!.trim() : s;
    // A bare local declaration is not an opcode; a same-line body still is.
    // Preserve data directives so executable() can reject them.
    if (label && instruction && !out.get(label)) out.set(label, instruction);
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
  for (const [macro, index] of [["object_event", 11], ["bg_event", 3], ["coord_event", 3]] as const) {
    for (const call of scanCalls(text, macro)) {
      const ref = call.args[index]?.text;
      if (ref) out.push(ref);
    }
  }
  return out;
}
function inFile<T>(path: string, parse: () => T): T {
  try { return parse(); }
  catch (error) { throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
}
export interface EntryPointIndex {
  readonly references: ReadonlyMap<string, readonly string[]>;
  readonly definitions: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

function gbaReferences(path: string): string[] {
  const map = inFile(path, () => JSON.parse(read(path)) as Record<string, unknown>);
  const refs: string[] = [];
  for (const key of ["object_events", "coord_events", "bg_events"]) {
    for (const e of (map[key] ?? []) as { script?: string }[]) if (e.script) refs.push(e.script);
  }
  return refs;
}

/** Disk-only results in source order; staged text is applied by entryPointsFor. */
export function buildEntryPointIndex(family: "gba" | "gbc", root: string): EntryPointIndex {
  const references = new Map<string, string[]>();
  const definitions = new Map<string, Map<string, string>>();
  if (family === "gbc") {
    for (const p of textFiles(join(root, "maps"), [".asm"])) {
      references.set(p, inFile(p, () => gbcReferences(read(p))));
    }
    for (const p of textFiles(join(root, "home"), [".asm"])) {
      definitions.set(p, inFile(p, () => bodies(read(p), family)));
    }
  } else {
    for (const p of textFiles(join(root, "data/maps"), [".json"])) {
      if (/[\\/]map\.json$/.test(p)) references.set(p, gbaReferences(p));
    }
    for (const p of textFiles(join(root, "data"), [".inc", ".s"])) {
      definitions.set(p, inFile(p, () => bodies(read(p), family)));
    }
  }
  return { references, definitions };
}

export function entryPointsFor(family: "gba" | "gbc", root: string, mapName: string, mapText: string, index?: EntryPointIndex): string[] {
  const refs = new Set<string>();
  const definitions = new Map<string, string>();
  if (index) {
    const ownPath = join(root, "maps", `${mapName}.asm`);
    for (const [path, references] of index.references) {
      if (family === "gbc" && path === ownPath) continue;
      for (const ref of references) refs.add(ref);
    }
    if (family === "gbc") {
      for (const ref of inFile(`${mapName} (staged maps/${mapName}.asm)`, () => gbcReferences(mapText))) refs.add(ref);
      for (const [name, body] of inFile(`${mapName} (staged maps/${mapName}.asm)`, () => bodies(mapText, family))) definitions.set(name, body);
      refs.add("ObjectEvent");
    }
    // Home definitions win over own GBC definitions, as in the uncached scan.
    for (const file of index.definitions.values()) for (const [name, body] of file) definitions.set(name, body);
    if (family === "gba") {
      for (const [name, body] of inFile(`${mapName} (staged scripts.inc)`, () => bodies(mapText, family))) definitions.set(name, body);
    }
  } else if (family === "gbc") {
    for (const p of textFiles(join(root, "maps"), [".asm"])) {
      const references = inFile(p, () => gbcReferences(p === join(root, "maps", `${mapName}.asm`) ? mapText : read(p)));
      for (const ref of references) refs.add(ref);
    }
    for (const ref of inFile(`${mapName} (staged maps/${mapName}.asm)`, () => gbcReferences(mapText))) refs.add(ref);
    // Own file or ROM0 home only. Sharing a SECTION never grants eligibility.
    const own = inFile(`${mapName} (staged maps/${mapName}.asm)`, () => bodies(mapText, family));
    for (const [name, body] of own) definitions.set(name, body);
    for (const p of textFiles(join(root, "home"), [".asm"])) {
      for (const [name, body] of inFile(p, () => bodies(read(p), family))) definitions.set(name, body);
    }
    refs.add("ObjectEvent");
  } else {
    for (const p of textFiles(join(root, "data/maps"), [".json"])) {
      if (!/[\\/]map\.json$/.test(p)) continue;
      for (const ref of gbaReferences(p)) refs.add(ref);
    }
    for (const p of textFiles(join(root, "data"), [".inc", ".s"])) {
      for (const [name, body] of inFile(p, () => bodies(read(p), family))) definitions.set(name, body);
    }
    for (const [name, body] of inFile(`${mapName} (staged scripts.inc)`, () => bodies(mapText, family))) definitions.set(name, body);
  }
  const entries = [...refs].filter(n => executable(definitions.get(n) ?? "", family));
  return [...new Set([family === "gba" ? "0x0" : "ObjectEvent", ...entries])].sort();
}
