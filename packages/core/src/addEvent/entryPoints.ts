import { statSync } from "node:fs";
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
type FileResult<T> = T | Error;
function fileResult<T>(parse: () => T): FileResult<T> {
  try { return parse(); }
  catch (error) { return error instanceof Error ? error : new Error(String(error)); }
}
function useFile<T>(result: FileResult<T>): T {
  if (result instanceof Error) throw result;
  return result;
}
export interface EntryPointIndex {
  references: ReadonlyMap<string, FileResult<readonly string[]>>;
  definitions: ReadonlyMap<string, FileResult<ReadonlyMap<string, string>>>;
  signatures: ReadonlyMap<string, { mtimeMs: number; size: number }>;
}

function gbaReferences(path: string): string[] {
  return inFile(path, () => {
    const map = JSON.parse(read(path)) as Record<string, unknown>;
    const refs: string[] = [];
    for (const key of ["object_events", "coord_events", "bg_events"]) {
      for (const e of (map[key] ?? []) as { script?: string }[]) if (e.script) refs.push(e.script);
    }
    return refs;
  });
}

function entryPointFiles(family: "gba" | "gbc", root: string) {
  return family === "gbc" ? {
    references: textFiles(join(root, "maps"), [".asm"]),
    definitions: textFiles(join(root, "home"), [".asm"]),
  } : {
    references: textFiles(join(root, "data/maps"), [".json"]).filter(p => /[\\/]map\.json$/.test(p)),
    definitions: textFiles(join(root, "data"), [".inc", ".s"]),
  };
}

/** Keep failures per file; staged GBC text can replace an invalid disk result. */
function refreshEntryPointIndex(family: "gba" | "gbc", root: string, index: EntryPointIndex): EntryPointIndex {
  const files = entryPointFiles(family, root);
  const signatures = new Map<string, { mtimeMs: number; size: number }>();
  const references = new Map<string, FileResult<readonly string[]>>();
  const definitions = new Map<string, FileResult<ReadonlyMap<string, string>>>();
  const unchanged = (path: string): boolean => {
    const { mtimeMs, size } = inFile(path, () => statSync(path));
    signatures.set(path, { mtimeMs, size });
    const previous = index.signatures.get(path);
    return previous?.mtimeMs === mtimeMs && previous.size === size;
  };
  for (const path of files.references) {
    const previous = index.references.get(path);
    // Errors are never reused: a failed read may be transient, so the file is retried on the next use.
    references.set(path, fileResult(() => unchanged(path) && previous && !(previous instanceof Error) ? previous : family === "gbc"
      ? inFile(path, () => gbcReferences(read(path))) : gbaReferences(path)));
  }
  for (const path of files.definitions) {
    const previous = index.definitions.get(path);
    definitions.set(path, fileResult(() => unchanged(path) && previous && !(previous instanceof Error) ? previous : inFile(path, () => bodies(read(path), family))));
  }
  // Re-listing supplies fresh source order, including insertions and removals.
  return { references, definitions, signatures };
}

/** Disk-only results; each use checks signatures before applying staged text. */
export function buildEntryPointIndex(family: "gba" | "gbc", root: string): EntryPointIndex {
  const index: EntryPointIndex = { references: new Map(), definitions: new Map(), signatures: new Map() };
  return refreshEntryPointIndex(family, root, index);
}

export function entryPointsFor(family: "gba" | "gbc", root: string, mapName: string, mapText: string, index?: EntryPointIndex): string[] {
  const cachedIndex = index;
  const refs = new Set<string>();
  const definitions = new Map<string, string>();
  if (index) {
    index = refreshEntryPointIndex(family, root, index);
    const ownPath = join(root, "maps", `${mapName}.asm`);
    for (const [path, references] of index.references) {
      const used = family === "gbc" && path === ownPath
        ? inFile(path, () => gbcReferences(mapText)) : useFile(references);
      for (const ref of used) refs.add(ref);
    }
    if (family === "gbc") {
      for (const ref of inFile(`${mapName} (staged maps/${mapName}.asm)`, () => gbcReferences(mapText))) refs.add(ref);
      for (const [name, body] of inFile(`${mapName} (staged maps/${mapName}.asm)`, () => bodies(mapText, family))) definitions.set(name, body);
      refs.add("ObjectEvent");
    }
    // Home definitions win over own GBC definitions, as in the uncached scan.
    for (const file of index.definitions.values()) for (const [name, body] of useFile(file)) definitions.set(name, body);
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
  // A used parse failure leaves all three published maps untouched for retry.
  if (cachedIndex && index) {
    cachedIndex.references = index.references; cachedIndex.definitions = index.definitions; cachedIndex.signatures = index.signatures;
  }
  return [...new Set([family === "gba" ? "0x0" : "ObjectEvent", ...entries])].sort();
}
