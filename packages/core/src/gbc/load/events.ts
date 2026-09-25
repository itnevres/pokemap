/**
 * A map's `<Name>_MapEvents:` (warps/coords/bgs/objects) and
 * `<Name>_MapScripts:` (scene_scripts/callbacks) sections (GBC format
 * findings §3.1). Both sections are located with `labelTail` (`./asm.ts`),
 * the same section-bounding logic `../write/asmSplice.ts`'s `locateEventCall`
 * uses -- neither module re-derives "where does this label's section end".
 */
import { readFileSync } from "node:fs";
import { codeLines, scanCalls, stripComment, labelTail, parseNum, type AsmCall } from "./asm.js";
import { norm } from "../../config/paths.js";
import type {
  DataDefect,
  GbcMap,
  GbcMapEvents,
  GbcWarpEvent,
  GbcCoordEvent,
  GbcBgEvent,
  GbcObjectEvent,
  GbcSceneScript,
  GbcCallback,
} from "../model/types.js";

/** NUM_OBJECTS EQU 16; slot 0 is the player, so at most 15 object_events per map. */
const MAX_OBJECT_EVENTS = 15;

/**
 * `<mapName>[:lineIndex+1]: <message>` -- every refusal in this file goes
 * through this one function, so the map+line prefix never drifts between
 * call sites. Unlike `tileset.ts`'s `parsePaletteMap`, whose own `fail` also
 * prefixes its own function name, this one does not -- deliberately: it is
 * called from several `to*` mapping functions, not one, so no single
 * function name would be accurate.
 */
function fail(mapName: string, lineIndex: number | null, message: string): never {
  const loc = lineIndex === null ? mapName : `${mapName}:${lineIndex + 1}`;
  throw new Error(`${loc}: ${message}`);
}

function requireArgCount(call: AsmCall, expected: number, macro: string, lineOffset: number, mapName: string): number {
  const lineIndex = call.lineIndex + lineOffset;
  if (call.args.length !== expected) {
    fail(mapName, lineIndex, `"${macro}" has ${call.args.length} argument(s), expected ${expected}`);
  }
  return lineIndex;
}

function toWarp(call: AsmCall, lineOffset: number, mapName: string): GbcWarpEvent {
  const lineIndex = requireArgCount(call, 4, "warp_event", lineOffset, mapName);
  const [x, y, mapConst, destWarp] = call.args;
  return { x: parseNum(x!.text), y: parseNum(y!.text), mapConst: mapConst!.text, destWarp: parseNum(destWarp!.text), lineIndex };
}

function toCoord(call: AsmCall, lineOffset: number, mapName: string): GbcCoordEvent {
  const lineIndex = requireArgCount(call, 4, "coord_event", lineOffset, mapName);
  const [x, y, sceneConst, script] = call.args;
  return { x: parseNum(x!.text), y: parseNum(y!.text), sceneConst: sceneConst!.text, script: script!.text, lineIndex };
}

function toBg(call: AsmCall, lineOffset: number, mapName: string): GbcBgEvent {
  const lineIndex = requireArgCount(call, 4, "bg_event", lineOffset, mapName);
  const [x, y, bgEventType, script] = call.args;
  return { x: parseNum(x!.text), y: parseNum(y!.text), bgEventType: bgEventType!.text, script: script!.text, lineIndex };
}

function toObject(call: AsmCall, lineOffset: number, mapName: string): GbcObjectEvent {
  const lineIndex = requireArgCount(call, 13, "object_event", lineOffset, mapName);
  const [x, y, sprite, moveData, radiusX, radiusY, hour1, hour2, palette, objectType, sightRange, script, eventFlag] = call.args;
  return {
    x: parseNum(x!.text),
    y: parseNum(y!.text),
    sprite: sprite!.text,
    moveData: moveData!.text,
    radiusX: parseNum(radiusX!.text),
    radiusY: parseNum(radiusY!.text),
    hour1: hour1!.text,
    hour2: hour2!.text,
    palette: palette!.text,
    objectType: objectType!.text,
    sightRange: parseNum(sightRange!.text),
    script: script!.text,
    eventFlag: eventFlag!.text,
    lineIndex,
  };
}

function toSceneScript(call: AsmCall, lineOffset: number, mapName: string): GbcSceneScript {
  const lineIndex = call.lineIndex + lineOffset;
  if (call.args.length !== 1 && call.args.length !== 2) {
    fail(mapName, lineIndex, `"scene_script" has ${call.args.length} argument(s), expected 1 or 2`);
  }
  const [script, sceneConst] = call.args;
  return { script: script!.text, sceneConst: sceneConst ? sceneConst.text : null, lineIndex };
}

function toCallback(call: AsmCall, lineOffset: number, mapName: string): GbcCallback {
  const lineIndex = requireArgCount(call, 2, "callback", lineOffset, mapName);
  const [callbackConst, script] = call.args;
  return { callbackConst: callbackConst!.text, script: script!.text, lineIndex };
}

/** `def_warp_events`, `def_coord_events`, `def_bg_events`, `def_object_events`, in that mandatory order (`ReadMapEvents` reads them sequentially). */
const SECTION_MARKERS = ["def_warp_events", "def_coord_events", "def_bg_events", "def_object_events"] as const;

/**
 * Refuses (throws, naming the map and the missing/misordered section) unless
 * all 4 section markers are present, in order. `lineOffset` is the tail's
 * own absolute line index (`labelTail`'s `lineIndex`), so an out-of-order
 * marker's refusal can name the line it was actually found on, the same way
 * every other refusal in this file does -- a missing marker has no line to
 * point to (it isn't in the text at all), so that refusal names only the map.
 */
function checkSectionOrder(tailText: string, mapName: string, lineOffset: number): void {
  let prevOffset = -1;
  let prevMarker = "";
  for (const marker of SECTION_MARKERS) {
    // [ \t]*, not \s* -- \s matches \n too, so \s* would let the match
    // start creep backward across a preceding blank line onto that
    // blank line's own position, making both the offset comparison and
    // (especially) the line-number-from-offset math below point one
    // line too early whenever a marker is preceded by a blank line,
    // which is the normal case in real map files.
    const m = new RegExp(`^[ \\t]*${marker}\\b`, "m").exec(tailText);
    if (!m) {
      fail(mapName, null, `missing "${marker}" section in its MapEvents block`);
    }
    if (m.index <= prevOffset) {
      const lineIndex = lineOffset + (tailText.slice(0, m.index).match(/\n/g)?.length ?? 0);
      fail(mapName, lineIndex, `"${marker}" appears out of order (after "${prevMarker}") in its MapEvents block`);
    }
    prevOffset = m.index;
    prevMarker = marker;
  }
}

/**
 * The `const NAME` lines immediately following a top-of-file
 * `object_const_def`, stopping at the first non-`const` code line (GBC
 * format findings §3.1: the hand-maintained object index). `[]` when
 * `object_const_def` is absent (40 of 391 maps).
 */
function parseObjectConsts(text: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const line of codeLines(text)) {
    const stripped = stripComment(line.text);
    if (!inBlock) {
      if (/^\s*object_const_def\b/.test(stripped)) inBlock = true;
      continue;
    }
    const m = stripped.match(/^\s*const\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (!m) break;
    out.push(m[1]!);
  }
  return out;
}

/**
 * Parses one map's `<mapName>_MapEvents:` and `<mapName>_MapScripts:`
 * sections out of `text` (a `maps/<mapName>.asm` file's full contents).
 * Pure -- no filesystem access; `loadGbcMapEvents` below is the reading
 * wrapper. Refuses (throws, naming the map and usually the line) on a
 * missing `_MapEvents:` label, a wrong argument count on any event/script
 * macro, a `def_*` section missing or out of order, or more than 15
 * `object_event`s.
 */
export function parseMapEvents(text: string, mapName: string): GbcMapEvents {
  const eventsTail = labelTail(text, `${mapName}_MapEvents`);
  checkSectionOrder(eventsTail.text, mapName, eventsTail.lineIndex);

  const warps = scanCalls(eventsTail.text, "warp_event").map((c) => toWarp(c, eventsTail.lineIndex, mapName));
  const coords = scanCalls(eventsTail.text, "coord_event").map((c) => toCoord(c, eventsTail.lineIndex, mapName));
  const bgs = scanCalls(eventsTail.text, "bg_event").map((c) => toBg(c, eventsTail.lineIndex, mapName));
  const objects = scanCalls(eventsTail.text, "object_event").map((c) => toObject(c, eventsTail.lineIndex, mapName));

  if (objects.length > MAX_OBJECT_EVENTS) {
    fail(mapName, null, `${objects.length} object_events, more than the ${MAX_OBJECT_EVENTS} allowed (NUM_OBJECTS 16, slot 0 is the player)`);
  }

  const scriptsTail = labelTail(text, `${mapName}_MapScripts`);
  const sceneScripts = scanCalls(scriptsTail.text, "scene_script").map((c) => toSceneScript(c, scriptsTail.lineIndex, mapName));
  const callbacks = scanCalls(scriptsTail.text, "callback").map((c) => toCallback(c, scriptsTail.lineIndex, mapName));

  return { warps, coords, bgs, objects, sceneScripts, callbacks, objectConsts: parseObjectConsts(text) };
}

/**
 * Reads and parses a map's `maps/<map.name>.asm` (GBC format findings §3.1:
 * every map's file is at that fixed path). Flags a `DataDefect` -- never a
 * refusal -- when `object_const_def` has consts present but fewer than
 * `objects.length` (the real `MoveDeletersHouse` hazard: 1 const for 2
 * objects). `objectConsts.length === 0` is not a defect -- 40 maps in the
 * corpus have no `object_const_def` at all, and that's normal.
 */
/**
 * One `(kind, index)` pair alongside its event, for `outOfBoundsEventDefects`
 * below to walk all four positioned kinds identically.
 */
const POSITIONED_KINDS = ["warps", "coords", "bgs", "objects"] as const;

/**
 * Flags every warp/coord/bg/object event whose `(x,y)` falls outside the
 * map's own step grid -- 2*width x 2*height, since event coordinates are
 * 16-px half-block steps, not 32-px blocks (Plan 6b "Resolved design
 * questions", "Event coordinates are in 16-px steps"). Pure: no filesystem
 * access, so `loadGbcMapEvents`'s existing corpus-reading wrapper stays the
 * only I/O in this file.
 *
 * G4: 7 real events in the corpus (3 warps each on CeruleanCave1F/2F, 1
 * object on GoldenrodPokecenter1F) lie outside even the step grid -- Task 4's
 * `GbcMapCanvas` must surface these in its defect banner and draw nothing
 * for them, rather than silently dropping them or crashing on an
 * off-canvas coordinate. One `DataDefect` per out-of-bounds event, in source
 * order within its own kind (never resorted, matching `GbcMapEvents`'s own
 * doc comment).
 */
export function outOfBoundsEventDefects(map: Pick<GbcMap, "name" | "width" | "height">, events: GbcMapEvents): DataDefect[] {
  const file = `maps/${map.name}.asm`;
  const stepWidth = 2 * map.width;
  const stepHeight = 2 * map.height;

  const defects: DataDefect[] = [];
  for (const kind of POSITIONED_KINDS) {
    events[kind].forEach((e, index) => {
      if (e.x < 0 || e.y < 0 || e.x >= stepWidth || e.y >= stepHeight) {
        defects.push({
          file,
          message: `${file}: ${kind.slice(0, -1)}[${index}] at (${e.x},${e.y}) is outside the ${stepWidth}x${stepHeight} step grid`,
        });
      }
    });
  }
  return defects;
}

export function loadGbcMapEvents(root: string, map: Pick<GbcMap, "name">): { events: GbcMapEvents; defects: DataDefect[] } {
  const r = norm(root);
  const file = `maps/${map.name}.asm`;
  const text = readFileSync(`${r}/${file}`, "utf8");
  const events = parseMapEvents(text, map.name);

  const defects: DataDefect[] = [];
  if (events.objectConsts.length > 0 && events.objectConsts.length < events.objects.length) {
    defects.push({
      file,
      message: `${file}: object_const_def has ${events.objectConsts.length} const(s) for ${events.objects.length} object_event(s) -- later objects have no matching const; a script indexing by position may be mistargeted`,
    });
  }

  return { events, defects };
}
