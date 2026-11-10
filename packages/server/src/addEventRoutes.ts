import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Project } from "@pokemap/core/src/project.js";
import type { GbcProject } from "@pokemap/core/src/gbc/project.js";
import type { EditSession } from "@pokemap/core/src/write/save.js";
import type { GbcEditSession } from "@pokemap/core/src/gbc/write/save.js";
import type { SymbolIndex } from "@pokemap/core/src/defects/symbols.js";
import { buildGbaSymbolIndex, buildGbcSymbolIndex } from "@pokemap/core/src/defects/symbols.js";
import { definedNames } from "@pokemap/core/src/addEvent/names.js";
import { AddEventRefusal, type AddEventForm, type EventOptions, type MapEventOptions, type NameCheck } from "@pokemap/core/src/addEvent/types.js";
import { loadGbaEventOptions, freeGbaSlots, gbaDefineValues, gbaWarpBehavior } from "@pokemap/core/src/addEvent/gbaOptions.js";
import { loadGbcEventOptions, gbcTileWarpCapable } from "@pokemap/core/src/addEvent/gbcOptions.js";
import { buildEntryPointIndex, entryPointsFor, type EntryPointIndex } from "@pokemap/core/src/addEvent/entryPoints.js";
import { buildGbaAddEvent } from "@pokemap/core/src/addEvent/gbaBuild.js";
import { buildGbcAddEvent } from "@pokemap/core/src/addEvent/gbcBuild.js";
import { copyGbaScriptBody } from "@pokemap/core/src/addEvent/gbaCopy.js";
import { copyGbcScriptBody } from "@pokemap/core/src/addEvent/gbcCopy.js";
import { textFiles } from "@pokemap/core/src/addEvent/sources.js";
import { parseGbaCharmap, parseGbcCharmap } from "@pokemap/core/src/signs/charmap.js";
import { parseMap } from "@pokemap/core/src/load/maps.js";
import { parseMapEvents } from "@pokemap/core/src/gbc/load/events.js";
import { scanCalls, codeLines, stripComment } from "@pokemap/core/src/gbc/load/asm.js";
import { addEvent } from "@pokemap/core/src/edit/events.js";
import { editJson, insertArrayElement, removeArrayElement } from "@pokemap/core/src/write/jsonEdit.js";
import { createSymbolIndexCache } from "./projectSymbols.js";
import { effectiveGbaScripts } from "./signRefresh.js";
import { snapshotOf, snapshotCommand, type createEditSessionStore } from "./editSessions.js";
import { gbcSnapshotOf, type createGbcEditSessionStore } from "./gbcEditSessions.js";

type GbaStore = ReturnType<typeof createEditSessionStore>;
type GbcStore = ReturnType<typeof createGbcEditSessionStore>;
type Store = GbaStore | GbcStore;
export type AddEventHooks = { verifyCandidate?: (candidate: EditSession | GbcEditSession) => void };
const read = (path: string) => readFileSync(path, "utf8");
const sourcePath = (family: "gba" | "gbc", map: string) => family === "gba" ? `data/maps/${map}/scripts.inc` : `maps/${map}.asm`;

/** Own staged definitions are intentionally excluded; disk definitions still count.
 * Macro-generated symbols outside the index remain subject to the build backstop. */
export function nameCheckFor(store: Store, family: "gba" | "gbc", mapName: string, symbolIndex: SymbolIndex): NameCheck {
  return name => {
    if (symbolIndex.labels.has(name) || symbolIndex.constants.has(name)) {
      const files = family === "gbc" ? textFiles(store.root, [".asm"]) : [
        ...textFiles(join(store.root, "data"), [".inc", ".s"]), ...textFiles(join(store.root, "include/constants"), [".h"]),
      ];
      const file = files.find(path => {
        const text = read(path);
        if (definedNames(text, family).has(name)) return true;
        if (family !== "gbc") return false;
        let scope = "";
        for (const line of codeLines(text)) {
          const code = stripComment(line.text);
          const label = /^([A-Za-z_][\w.]*|\.[A-Za-z_]\w*)::?/.exec(code)?.[1];
          if (label) {
            if (!label.startsWith(".") && !label.includes(".")) scope = label;
            if ((label.startsWith(".") ? scope + label : label) === name) return true;
          }
          const macro = /^\s*(?:const_skip_name|map_const)\s+([A-Za-z_]\w*)\b/.exec(code);
          const equate = /^\s*([A-Za-z_]\w*)\s+(?:SET|=)\s/.exec(code);
          if ((macro?.[1] ?? equate?.[1]) === name) return true;
        }
        return false;
      });
      return { taken: true, where: file ? relative(store.root, file).replace(/\\/g, "/") : sourcePath(family, mapName) };
    }
    for (const [other, entry] of store.entries()) {
      if (other === mapName) continue;
      const s = entry.session;
      const texts = "eventsText" in s ? [s.eventsText, ...(s.constEdits ?? []).map(e => e.after)]
        : [...(s.scriptAppends ?? []).map(e => e.text), ...(s.scriptReplaces ?? []).map(e => e.after)];
      if (s.newNames?.includes(name) || texts.some(text => definedNames(text, family).has(name))) return { taken: true, where: `${other} (unsaved)` };
    }
    return { taken: false };
  };
}

/** Whole-file constants edits have one owner. A second map must wait rather
 * than stage an edit whose baseline or numeric slots will become stale. */
function requireHeaderOwnership(store: Store, mapName: string, path: string, code: "NO_FLAG_SLOT" | "NO_VAR_SLOT") {
  const target = resolve(store.root, path);
  for (const [other, entry] of store.entries()) {
    if (other === mapName) continue;
    const s = entry.session;
    const edits = "eventsText" in s ? s.constEdits ?? [] : s.scriptReplaces ?? [];
    if (edits.some(edit => resolve(store.root, edit.path) === target)) {
      throw new AddEventRefusal(code, `${other} has an unsaved new constant in this file; save or undo it there first`, path);
    }
  }
}

/** Save paths without new names never need a project scan. Each save plan
 * owns a lazy index; a commit shares its fresh re-plan check with the write. */
function projectNameCheck(store: Store, family: "gba" | "gbc", mapName: string, index: () => SymbolIndex): NameCheck {
  let check: NameCheck | undefined;
  return name => (check ??= nameCheckFor(store, family, mapName, index()))(name);
}

export function eventFailure(family: "gba" | "gbc", map: string, error: unknown) {
  return { error: `${map}: ${error instanceof AddEventRefusal ? error.path ?? sourcePath(family, map) : sourcePath(family, map)}: ${error instanceof Error ? error.message : String(error)}`,
    code: error instanceof AddEventRefusal ? error.code : "BAD_OPTION" };
}

function formOf(value: unknown, width: number, height: number): AddEventForm {
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const fail = (): never => { throw new Error("invalid add-event form"); };
  if (!obj(value) || !["object", "warp", "coord", "bg"].includes(value.kind as string) || !Number.isInteger(value.x) || !Number.isInteger(value.y)
    || (value.x as number) < 0 || (value.y as number) < 0 || (value.x as number) >= width || (value.y as number) >= height
    || !obj(value.fields) || !Object.values(value.fields).every(v => typeof v === "string")) return fail();
  if (value.objectType !== undefined && !["npc", "itemball", "trainer"].includes(value.objectType as string)) return fail();
  for (const key of ["flag", "varName"]) {
    const v = value[key];
    if (v !== undefined && (!obj(v) || !["existing", "new"].includes(v.mode as string) || typeof v.name !== "string")) return fail();
  }
  const s = value.script;
  if (s !== undefined && (!obj(s) || !["existing", "new", "copy"].includes(s.mode as string) || typeof s.label !== "string"
    || (s.mode === "new" && typeof s.text !== "string")
    || (s.mode === "copy" && (typeof s.from !== "string" || typeof s.body !== "string" || !obj(s.texts) || !Object.values(s.texts).every(v => typeof v === "string"))))) return fail();
  if (value.texts !== undefined) {
    if (!obj(value.texts)) return fail();
    for (const key of ["seen", "beaten", "after"]) {
      const t = value.texts[key];
      if (!obj(t) || !["new", "copy"].includes(t.mode as string) || typeof t.text !== "string" || (t.mode === "copy" && typeof t.from !== "string")) return fail();
    }
  }
  return value as unknown as AddEventForm;
}

function ownNewNames(store: Store, mapName?: string): string[] {
  return mapName && store.has(mapName) ? store.open(mapName).session.newNames ?? [] : [];
}

/** Cache belongs to one handler/project; callers invalidate beside the symbol index. */
function optionsCache(root: string, family: "gba" | "gbc", store: Store) {
  let cached: EventOptions | undefined;
  let entryPoints: EntryPointIndex | undefined;
  const slots: Partial<Record<"FLAG" | "VAR", string[]>> = {};
  return {
    invalidate: () => { cached = undefined; entryPoints = undefined; delete slots.FLAG; delete slots.VAR; },
    entryPoints: () => entryPoints ??= buildEntryPointIndex(family, root),
    slots: (kind: "FLAG" | "VAR") => slots[kind] ??= freeGbaSlots(root, kind),
    get: (mapName?: string): EventOptions => {
      cached ??= family === "gba" ? loadGbaEventOptions(root) : loadGbcEventOptions(root);
      const names = new Set(ownNewNames(store, mapName));
      return { ...cached, flags: [...new Set([...cached.flags, ...[...names].filter(n => n.startsWith(family === "gba" ? "FLAG_" : "EVENT_"))])],
        vars: [...new Set([...cached.vars, ...[...names].filter(n => n.startsWith("VAR_"))])] };
    },
  };
}

function locals(text: string, family: "gba" | "gbc") {
  const copy = family === "gba" ? copyGbaScriptBody : copyGbcScriptBody;
  const scripts: string[] = [], texts: string[] = [];
  for (const label of definedNames(text, family)) {
    try { copy(text, label); scripts.push(label); } catch { /* not a bounded script */ }
    try { textPreview(text, family, label); texts.push(label); } catch { /* not dialogue */ }
  }
  return { scripts, texts };
}
function textPreview(text: string, family: "gba" | "gbc", label: string) {
  if (!/^[A-Za-z_]\w*$/.test(label)) throw new AddEventRefusal("COPY_NOT_SCRIPT", "invalid text label");
  const copy = family === "gba" ? copyGbaScriptBody : copyGbcScriptBody;
  const names = definedNames(text, family);
  let probeName = "PokemapTextPreviewProbe";
  while (names.has(probeName)) probeName += "_";
  const probe = family === "gba" ? `\n${probeName}::\n\tmsgbox ${label}, MSGBOX_DEFAULT\n\tend\n` : `\n${probeName}:\n\tjumptext ${label}\n`;
  const raw = copy(text + probe, probeName).texts[label];
  if (raw === undefined) throw new AddEventRefusal("COPY_NOT_SCRIPT", `${label} is not dialogue in this map`);
  if (family === "gba") {
    // .string fragments are consecutive bytes; only engine controls add breaks.
    const fragments = [...raw.matchAll(/^\s*\.string\s+"((?:[^"\\\r\n]|\\.)*)"/gm)].map(m => m[1]!);
    const text = fragments.join("").replace(/\$$/, "").replace(/\\([nlp"\\])/g, (_, control: string) =>
      control === "p" ? "\n\n" : control === "n" || control === "l" ? "\n" : control);
    return { label, text };
  }
  let decoded = "", first = true;
  for (const command of raw.matchAll(/^\s*(text|line|cont|para)\s+"([^"\r\n]*)"/gm)) {
    if (!first) decoded += command[1] === "para" ? "\n\n" : "\n";
    decoded += command[2]!; first = false;
  }
  return { label, text: decoded };
}
/** Staged references protect cached disk-free slots, including edits in other maps. */
function stagedGbaTexts(store: GbaStore): string[] {
  const headers = new Set(["flags.h", "vars.h"].map(file => resolve(store.root, "include/constants", file)));
  return store.entries().flatMap(([, { session: s }]) => [
    JSON.stringify([s.map, s.jsonEdits, s.insertOps]),
    ...(s.scriptAppends ?? []).map(edit => edit.text),
    ...(s.scriptReplaces ?? []).map(edit => headers.has(resolve(store.root, edit.path))
      // A slot's own definition is not a reference; RHS/header references still reserve it.
      ? edit.after.replace(/^([ \t]*#[ \t]*define[ \t]+)[A-Za-z_]\w*/gm, "$1") : edit.after),
  ]);
}

function requireStagedHeaderOwnership(store: Store, mapName: string, candidate: EditSession | GbcEditSession) {
  const headers: [string, "NO_FLAG_SLOT" | "NO_VAR_SLOT"][] = "eventsText" in candidate
    ? [["constants/event_flags.asm", "NO_FLAG_SLOT"]]
    : [["include/constants/flags.h", "NO_FLAG_SLOT"], ["include/constants/vars.h", "NO_VAR_SLOT"]];
  const edits = "eventsText" in candidate ? candidate.constEdits ?? [] : candidate.scriptReplaces ?? [];
  for (const [path, code] of headers) if (edits.some(edit => resolve(store.root, edit.path) === resolve(store.root, path))) {
    requireHeaderOwnership(store, mapName, path, code);
  }
}

function checkCandidateNames(candidate: EditSession | GbcEditSession, check: NameCheck) {
  for (const name of candidate.newNames ?? []) {
    const hit = check(name);
    if (hit.taken) throw new AddEventRefusal("LABEL_TAKEN", `${name} is already defined in ${hit.where}`, hit.where);
  }
}

type Send = (code: number, body: unknown) => void;
function optionsHandler(family: "gba" | "gbc", known: (name: string) => boolean, projectOptions: () => EventOptions,
  mapOptions: (name: string, query: URLSearchParams) => MapEventOptions, stagedText: (name: string) => string) {
  return (url: URL, send: Send): boolean => {
    const m = /^\/api\/event-options(?:\/([^/]+)(?:\/(copy|text))?)?$/.exec(url.pathname);
    if (!m) return false;
    let name = "project";
    try {
      if (!m[1]) { send(200, projectOptions()); return true; }
      name = decodeURIComponent(m[1]);
      if (!known(name)) { send(404, { error: `no map ${name}` }); return true; }
      if (m[2]) {
        const label = url.searchParams.get("label") ?? "";
        const text = stagedText(name);
        send(200, m[2] === "text" ? textPreview(text, family, label) : (family === "gba" ? copyGbaScriptBody : copyGbcScriptBody)(text, label));
      } else send(200, mapOptions(name, url.searchParams));
    } catch (error) { send(400, eventFailure(family, name, error)); }
    return true;
  };
}
function tileQuery(query: URLSearchParams, width: number, height: number) {
  if (!query.has("x") && !query.has("y")) return undefined;
  const x = Number(query.get("x")), y = Number(query.get("y"));
  if (!query.has("x") || !query.has("y") || !/^\d+$/.test(query.get("x")!) || !/^\d+$/.test(query.get("y")!) || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x >= width || y >= height) throw new Error("tile coordinates outside map");
  return { x, y };
}

export function createGbaAddEventRoutes(project: Project, store: GbaStore, hooks: AddEventHooks = {},
  symbols = createSymbolIndexCache(project.paths.root, "gba")) {
  const root = project.paths.root, cache = optionsCache(root, "gba", store);
  const stagedText = (name: string) => {
    if (store.has(name) && existsSync(project.paths.mapScriptsInc(name))) return effectiveGbaScripts(project, store.open(name).session);
    const path = project.paths.mapScriptsInc(name); return existsSync(path) ? read(path) : "";
  };
  const mapFor = (name: string) => store.has(name) ? store.open(name).session.map : parseMap(read(project.paths.mapJson(name)));
  const mapOptions = (name: string, query = new URLSearchParams()): MapEventOptions => {
    const text = stagedText(name), local = locals(text, "gba"), map = mapFor(name);
    const result: MapEventOptions = { entryPoints: [...new Set([...entryPointsFor("gba", root, name, text, cache.entryPoints()), ...local.scripts.filter(label => [...map.objectEvents, ...map.bgEvents, ...map.coordEvents].some(e => e.script === label))])],
      localScripts: local.scripts, localTexts: local.texts, scenes: [], warps: map.warpEvents.map((w, n) => ({ n, x: w.x, y: w.y })) };
    const names = ownNewNames(store, name);
    result.stagedFlags = names.filter(name => name.startsWith("FLAG_"));
    result.stagedVars = names.filter(name => name.startsWith("VAR_"));
    result.localScripts = result.entryPoints.filter(label => local.scripts.includes(label));
    const layout = project.layoutForMap(name), tile = tileQuery(query, layout.width, layout.height);
    if (tile) {
      const s = store.open(name).session, block = s.blocks[tile.y * layout.width + tile.x]!;
      const split = project.splitFor(layout), secondary = block.metatileId >= split.metatiles;
      const ts = project.tileset(secondary ? layout.secondaryTileset : layout.primaryTileset);
      const b = Object.fromEntries([...gbaDefineValues(root, read(`${root}/include/constants/metatile_behaviors.h`))].filter((e): e is [string, number] => e[1] !== undefined));
      result.tileInfo = { ...tile, warpCapable: gbaWarpBehavior(ts.behavior(block.metatileId - (secondary ? split.metatiles : 0)), b) };
    }
    const dest = query.get("dest");
    if (dest) {
      const destName = project.mapNames().includes(dest) ? dest : project.mapNames().find(n => existsSync(project.paths.mapJson(n)) && mapFor(n).id === dest);
      if (!destName) throw new Error(`unknown destination ${dest}`);
      const target = mapFor(destName);
      result.warps = target.warpEvents.map((w, n) => ({ n, x: w.x, y: w.y }));
      result.returnsTo = target.warpEvents.some(w => w.destMap === map.id);
    }
    return result;
  };
  const check = (name: string) => projectNameCheck(store, "gba", name, symbols.get);
  const freshCheck = (name: string) => projectNameCheck(store, "gba", name, () => buildGbaSymbolIndex(root));
  return {
    invalidate: () => { cache.invalidate(); symbols.invalidate(); }, check, freshCheck,
    checkHeaderOwnership: (name: string, candidate: EditSession) => requireStagedHeaderOwnership(store, name, candidate),
    handleOptions: optionsHandler("gba", name => project.mapNames().includes(name), cache.get, mapOptions, stagedText),
    create(name: string, value: unknown) {
      const entry = store.open(name), prev = snapshotOf(entry.session), candidate = structuredClone(entry.session);
      const form = formOf(value, candidate.layout.width, candidate.layout.height), checkNames = check(name);
      if (form.flag?.mode === "new" && (form.kind === "object" || form.kind === "bg" && form.fields.bgType === "hidden_item")) {
        requireHeaderOwnership(store, name, "include/constants/flags.h", "NO_FLAG_SLOT");
      }
      if (form.varName?.mode === "new" && form.kind === "coord") requireHeaderOwnership(store, name, "include/constants/vars.h", "NO_VAR_SLOT");
      const path = project.paths.mapScriptsInc(name);
      const built = buildGbaAddEvent(candidate.map, existsSync(path) ? stagedText(name) : null, form, {
        options: cache.get(name), mapOptions: mapOptions(name), root, mapName: name, stagedTexts: stagedGbaTexts(store),
        tileElevation: candidate.blocks[form.y * candidate.layout.width + form.x]!.elevation,
        freeFlags: form.flag?.mode === "new" ? cache.slots("FLAG") : [],
        freeVars: form.varName?.mode === "new" ? cache.slots("VAR") : [], scriptReplaces: candidate.scriptReplaces ?? [], check: checkNames,
        charmap: parseGbaCharmap(read(`${root}/charmap.txt`)),
      });
      const added = addEvent(candidate.map, form.kind, built.value);
      candidate.map = added.map; candidate.insertOps = [...candidate.insertOps, added.insertOp];
      candidate.scriptAppends = [...(candidate.scriptAppends ?? []), ...built.scriptAppends];
      candidate.scriptReplaces = built.scriptReplaces; candidate.newNames = [...(candidate.newNames ?? []), ...built.newNames];
      // Re-parse the actual save candidate, rather than trusting the builder's parsed view.
      let json = editJson(candidate.originalMapJson, candidate.jsonEdits);
      for (const op of candidate.insertOps) json = insertArrayElement(json, op.path, op.index, op.value);
      const removes = new Map<string, number[]>();
      for (const op of candidate.removeOps) {
        const key = JSON.stringify(op.path); removes.set(key, [...(removes.get(key) ?? []), op.index]);
      }
      for (const [key, indices] of removes) for (const index of indices.sort((a, b) => b - a)) json = removeArrayElement(json, JSON.parse(key), index);
      parseMap(json);
      checkCandidateNames(candidate, check(name)); hooks.verifyCandidate?.(candidate);
      entry.stack.push(entry.session, snapshotCommand(`add ${form.kind}`, prev, snapshotOf(candidate)));
      return { map: entry.session.map, isDirty: entry.session.isDirty, canUndo: entry.stack.canUndo(), canRedo: entry.stack.canRedo(), created: built.created };
    },
  };
}

export function createGbcAddEventRoutes(proj: GbcProject, store: GbcStore, hooks: AddEventHooks = {},
  symbols = createSymbolIndexCache(proj.root, "gbc")) {
  const root = proj.root, cache = optionsCache(root, "gbc", store);
  const stagedText = (name: string) => store.has(name) ? store.open(name).session.eventsText : read(`${root}/maps/${name}.asm`);
  const mapOptions = (name: string, query = new URLSearchParams()): MapEventOptions => {
    const text = stagedText(name), events = parseMapEvents(text, name), local = locals(text, "gbc");
    const result: MapEventOptions = { entryPoints: entryPointsFor("gbc", root, name, text, cache.entryPoints()), localScripts: local.scripts, localTexts: local.texts,
      scenes: scanCalls(text, "scene_script").map(c => c.args[1]?.text).filter((s): s is string => !!s),
      warps: events.warps.map((w, i) => ({ n: i + 1, x: w.x, y: w.y })) };
    const names = ownNewNames(store, name);
    result.stagedFlags = names.filter(name => name.startsWith("EVENT_"));
    result.stagedVars = names.filter(name => name.startsWith("VAR_"));
    result.localScripts = result.entryPoints.filter(label => local.scripts.includes(label));
    const map = proj.map(name), tile = tileQuery(query, map.width * 2, map.height * 2);
    if (tile) {
      const s = store.open(name).session, block = s.blocks[Math.floor(tile.y / 2) * s.layout.width + Math.floor(tile.x / 2)]!;
      const coll = proj.tileset(map.tileset).collision[block.metatileId]!;
      result.tileInfo = { ...tile, warpCapable: gbcTileWarpCapable([coll.tl, coll.tr, coll.bl, coll.br], tile.x, tile.y,
        new Map([...proj.collisionInfo()].map(([n, info]) => [n, info.name ?? ""]))) };
    }
    const dest = query.get("dest");
    if (dest) {
      const target = proj.maps.find(m => m.name === dest || m.constName === dest);
      if (!target) throw new Error(`unknown destination ${dest}`);
      const warps = parseMapEvents(stagedText(target.name), target.name).warps;
      result.warps = warps.map((w, i) => ({ n: i + 1, x: w.x, y: w.y })); result.returnsTo = warps.some(w => w.mapConst === map.constName);
    }
    return result;
  };
  const check = (name: string) => projectNameCheck(store, "gbc", name, symbols.get);
  const freshCheck = (name: string) => projectNameCheck(store, "gbc", name, () => buildGbcSymbolIndex(root));
  return {
    invalidate: () => { cache.invalidate(); symbols.invalidate(); }, check, freshCheck,
    checkHeaderOwnership: (name: string, candidate: GbcEditSession) => requireStagedHeaderOwnership(store, name, candidate),
    handleOptions: optionsHandler("gbc", name => proj.maps.some(m => m.name === name), cache.get, mapOptions, stagedText),
    create(name: string, value: unknown) {
      const entry = store.open(name), prev = gbcSnapshotOf(entry.session), candidate = structuredClone(entry.session);
      const form = formOf(value, candidate.map.width * 2, candidate.map.height * 2);
      if (form.flag?.mode === "new" && (form.kind === "object" || form.kind === "bg" && ["BGEVENT_ITEM", "BGEVENT_IFSET", "BGEVENT_IFNOTSET"].includes(form.fields.bgType!))) {
        requireHeaderOwnership(store, name, "constants/event_flags.asm", "NO_FLAG_SLOT");
      }
      const built = buildGbcAddEvent(candidate.eventsText, name, form, { options: cache.get(name), mapOptions: mapOptions(name),
        destinationWarpCount: mapConst => {
          const target = proj.maps.find(map => map.constName === mapConst);
          if (!target) throw new AddEventRefusal("BAD_OPTION", `unknown destination ${mapConst}`);
          return parseMapEvents(stagedText(target.name), target.name).warps.length;
        },
        mapConsts: new Set(proj.maps.map(m => m.constName)), eventFlagsDisk: read(`${root}/constants/event_flags.asm`),
        constEdits: candidate.constEdits ?? [], check: check(name), charmap: parseGbcCharmap(read(`${root}/constants/charmap.asm`)) });
      candidate.eventsText = built.text; candidate.events = parseMapEvents(built.text, name);
      candidate.constEdits = built.constEdits; candidate.newNames = [...(candidate.newNames ?? []), ...built.newNames];
      checkCandidateNames(candidate, check(name)); hooks.verifyCandidate?.(candidate);
      entry.stack.push(entry.session, snapshotCommand<GbcEditSession>(`add ${form.kind}`, prev, gbcSnapshotOf(candidate)));
      return { blocks: entry.session.blocks, events: entry.session.events, isDirty: entry.session.isDirty,
        canUndo: entry.stack.canUndo(), canRedo: entry.stack.canRedo(), created: built.created };
    },
  };
}
