/**
 * Pure text -> text event edits on a map's `maps/<Name>.asm` (Plan 7 Task 3).
 * Every op takes the file's CURRENT text, re-locates its target in it, splices
 * only the bytes it must (G3: never regenerate a file) and returns the new
 * text together with `parseMapEvents` of it. No filesystem, no session --
 * Task 4 assigns the result onto `GbcEditSession`.
 */
import { codeLines, escapeRegExp, parseNum, stripComment, type CodeLine } from "../load/asm.js";
import { parseMapEvents } from "../load/events.js";
import type { GbcMapEvents, GbcWarpEvent } from "../model/types.js";
import { insertLineAfter, locateEventCall, locateEventCalls, removeLine, spliceArg } from "../write/asmSplice.js";

export type GbcEventKind = "warp" | "coord" | "bg" | "object";

export interface GbcEventEdit {
  text: string;
  events: GbcMapEvents;
}

const KINDS = {
  warp: { macro: "warp_event", marker: "def_warp_events", argc: 4, key: "warps" },
  coord: { macro: "coord_event", marker: "def_coord_events", argc: 4, key: "coords" },
  bg: { macro: "bg_event", marker: "def_bg_events", argc: 4, key: "bgs" },
  object: { macro: "object_event", marker: "def_object_events", argc: 13, key: "objects" },
} as const;

/** NUM_OBJECTS EQU 16; slot 0 is the player, so at most 15 object_events per map. */
const MAX_OBJECTS = 15;
const STRUCTURAL = /[,;\r\n]/;
const CONST_NAME = /^[A-Z_][A-Z0-9_]*$/;
/** Object args that `parseMapEvents` reads as numbers: radiusX, radiusY, sightRange. */
const NUMERIC_OBJECT_ARGS = [4, 5, 10];

function kindInfo(mapName: string, kind: GbcEventKind): (typeof KINDS)[GbcEventKind] {
  const info = KINDS[kind];
  if (!info) throw new Error(`${mapName}: unknown event kind "${String(kind)}"`);
  return info;
}

const fail = (mapName: string, kind: GbcEventKind, message: string, index?: number): never => {
  throw new Error(`${mapName} ${kind}${index === undefined ? "" : `[${index}]`}: ${message}`);
};

const isByte = (v: number): boolean => Number.isInteger(v) && v >= 0 && v <= 255;

/** Refuses an index outside the kind's array in the file's current events. */
function checkIndex(events: GbcMapEvents, mapName: string, kind: GbcEventKind, index: number): void {
  const n = events[KINDS[kind].key].length;
  if (!Number.isInteger(index) || index < 0 || index >= n) {
    fail(mapName, kind, `no such event (the map has ${n} ${kind}(s))`, index);
  }
}

/**
 * Moves one event: splices its `y` then `x` argument in place (the later span
 * first, so the earlier offsets stay valid). The original column padding sits
 * outside each argument's span and is kept, so `warp_event  6,  3, ...` moved
 * to x=12 reads `warp_event  12,  3, ...` -- byte-predictable, not re-aligned.
 * A move to the event's current (x, y) returns `text` unchanged.
 */
export function moveGbcEvent(text: string, mapName: string, kind: GbcEventKind, index: number, x: number, y: number): GbcEventEdit {
  const info = kindInfo(mapName, kind);
  if (!isByte(x)) fail(mapName, kind, `x must be an integer 0..255, got ${x}`, index);
  if (!isByte(y)) fail(mapName, kind, `y must be an integer 0..255, got ${y}`, index);
  const events = parseMapEvents(text, mapName);
  checkIndex(events, mapName, kind, index);
  const cur = events[info.key][index]!;
  if (cur.x === x && cur.y === y) return { text, events };

  const call = locateEventCall(text, mapName, info.macro, index);
  const out = spliceArg(spliceArg(text, call, 1, String(y)), call, 0, String(x));
  return { text: out, events: parseMapEvents(out, mapName) };
}

/** The `const NAME` lines right after the top-of-file `object_const_def`, with offsets (same rule as `parseObjectConsts` in `../load/events.ts`). */
function constBlock(text: string): { lines: CodeLine[]; names: string[] } {
  const lines: CodeLine[] = [];
  const names: string[] = [];
  let inBlock = false;
  for (const line of codeLines(text)) {
    const stripped = stripComment(line.text);
    if (!inBlock) {
      if (/^\s*object_const_def\b/.test(stripped)) inBlock = true;
      continue;
    }
    const m = stripped.match(/^\s*const\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (!m) break;
    lines.push(line);
    names.push(m[1]!);
  }
  return { lines, names };
}

/**
 * Whether object_event add/delete must also touch the const list. No consts
 * (no block, or an empty one) -> `paired: false`, the list is left alone.
 * Consts === objects -> `paired: true`. Anything else (the corpus's
 * `MoveDeletersHouse`: 1 const for 2 objects) refuses: which const belongs to
 * which object is unknowable, so any edit could re-point a script.
 */
function objectConstPlan(text: string, mapName: string, events: GbcMapEvents): { paired: boolean; lines: CodeLine[]; names: string[] } {
  const { lines, names } = constBlock(text);
  if (names.join() !== events.objectConsts.join()) {
    throw new Error(`${mapName}: internal error -- const block [${names.join()}] disagrees with parseMapEvents [${events.objectConsts.join()}]`);
  }
  if (names.length === 0) return { paired: false, lines, names };
  if (names.length !== events.objects.length) {
    fail(mapName, "object", `object_const_def has ${names.length} const(s) for ${events.objects.length} object_event(s) -- the const list is out of step and must be fixed by hand first`);
  }
  return { paired: true, lines, names };
}

/** Absolute offset the new line of `kind` goes after: the end of its last call, else of its `def_<kind>_events` marker line. Exported so the corpus identity proof anchors exactly as `addGbcEvent` does. */
export function eventInsertAnchor(text: string, mapName: string, kind: GbcEventKind): number {
  const info = kindInfo(mapName, kind);
  const calls = locateEventCalls(text, mapName, info.macro);
  if (calls.length > 0) return calls[calls.length - 1]!.lineEnd;
  const marker = locateEventCalls(text, mapName, info.marker)[0];
  if (!marker) fail(mapName, kind, `no "${info.marker}" line after ${mapName}_MapEvents:`);
  return marker!.lineEnd;
}

const pad2 = (v: number): string => String(v).padStart(2);

/** Structural + per-kind validation of a new event's argument list; refuses naming the map, kind and arg. */
function checkAddArgs(mapName: string, kind: GbcEventKind, args: string[], mapConsts: ReadonlySet<string> | undefined): void {
  const { argc } = KINDS[kind];
  if (args.length !== argc) fail(mapName, kind, `expected ${argc} argument(s), got ${args.length}`);
  args.forEach((a, i) => {
    if (a === "" || a.trim() !== a || STRUCTURAL.test(a)) {
      fail(mapName, kind, `arg ${i} "${a}" must be non-empty, trimmed, and free of ",", ";" and line breaks`);
    }
  });
  for (const i of [0, 1]) {
    if (!/^\d+$/.test(args[i]!) || !isByte(Number(args[i]))) fail(mapName, kind, `arg ${i} (${i === 0 ? "x" : "y"}) must be a decimal integer 0..255, got "${args[i]}"`);
  }
  if (kind === "warp") {
    if (mapConsts && !mapConsts.has(args[2]!)) fail(mapName, kind, `arg 2 "${args[2]}" is not a known map const`);
    if (!/^(-1|[1-9]\d*)$/.test(args[3]!)) fail(mapName, kind, `arg 3 (destWarp) must be a decimal integer >= 1 or -1, got "${args[3]}"`);
  }
  if (kind === "object") {
    for (const i of NUMERIC_OBJECT_ARGS) {
      try {
        parseNum(args[i]!);
      } catch {
        fail(mapName, kind, `arg ${i} "${args[i]}" must be a $hex or decimal number`);
      }
    }
  }
}

/**
 * Appends one event (GBA parity: add always means append) as a new line after
 * the kind's last call, or after its `def_<kind>_events` line when it has
 * none. The line is `\t<macro> <x>, <y>, <rest>` with x/y padded to width 2,
 * matching the corpus. `args` are the macro's arguments in source order.
 *
 * object_event also keeps `object_const_def` in step (see `objectConstPlan`):
 * when the file's consts pair with its objects, a `const NAME` line is added
 * after the last one -- `opts.objectConst`, else `<MAPNAME>_<SPRITE>` with a
 * 2, 3, ... suffix until unique. Refuses past 15 objects.
 */
export function addGbcEvent(
  text: string,
  mapName: string,
  kind: GbcEventKind,
  args: string[],
  opts: { mapConsts?: ReadonlySet<string>; objectConst?: string } = {},
): GbcEventEdit {
  const info = kindInfo(mapName, kind);
  checkAddArgs(mapName, kind, args, opts.mapConsts);
  const events = parseMapEvents(text, mapName);

  let constName: string | null = null;
  if (kind === "object") {
    if (events.objects.length >= MAX_OBJECTS) {
      fail(mapName, kind, `the map already has ${MAX_OBJECTS} object_event(s), the maximum (NUM_OBJECTS 16, slot 0 is the player)`);
    }
    const plan = objectConstPlan(text, mapName, events);
    if (plan.paired) {
      const taken = new Set(plan.names);
      if (opts.objectConst !== undefined) {
        constName = opts.objectConst;
      } else {
        const base = `${mapName.toUpperCase()}_${args[2]!.replace(/^SPRITE_/, "")}`;
        constName = base;
        for (let n = 2; taken.has(constName); n++) constName = `${base}${n}`;
      }
      if (!CONST_NAME.test(constName)) fail(mapName, kind, `objectConst "${constName}" must match ${CONST_NAME}`);
      if (taken.has(constName)) fail(mapName, kind, `objectConst "${constName}" already exists in object_const_def`);
    }
  }

  const line = `\t${info.macro} ${pad2(Number(args[0]))}, ${pad2(Number(args[1]))}, ${args.slice(2).join(", ")}`;
  // The const block is above the event block, so insert the event line first and re-locate the block after.
  let out = insertLineAfter(text, eventInsertAnchor(text, mapName, kind), line);
  if (constName !== null) {
    const { lines } = constBlock(out);
    out = insertLineAfter(out, lines[lines.length - 1]!.end, `\tconst ${constName}`);
  }
  return { text: out, events: parseMapEvents(out, mapName) };
}

/**
 * Removes one event's line. For object_event with paired consts it also
 * removes the matching `const` line (later consts shift with later objects, so
 * they stay paired) -- and refuses when that const's name appears anywhere
 * else in the file as a whole word, since scripts address the object by it
 * (`turnobject NEWBARKTOWN_TEACHER, LEFT`) and would stop assembling.
 * ponytail: only this file is scanned; a reference from another file is not
 * seen. Upgrade: scan the project's .asm files if that ever bites.
 *
 * A warp delete has no text-side extra: other warps' `destWarp` ids shift, and
 * telling the caller is `findGbcWarpsRetargetedByDelete`'s job (it needs other
 * maps' events).
 */
export function deleteGbcEvent(text: string, mapName: string, kind: GbcEventKind, index: number): GbcEventEdit {
  const info = kindInfo(mapName, kind);
  const events = parseMapEvents(text, mapName);
  checkIndex(events, mapName, kind, index);
  const call = locateEventCall(text, mapName, info.macro, index);

  let out: string;
  const plan = kind === "object" ? objectConstPlan(text, mapName, events) : null;
  if (plan?.paired) {
    const name = plan.names[index]!;
    const own = plan.lines[index]!;
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
    for (const m of text.matchAll(re)) {
      if (m.index < own.start || m.index >= own.end) {
        fail(mapName, kind, `const ${name} is still referenced elsewhere in the file (offset ${m.index}); remove or retarget those references first`, index);
      }
    }
    out = removeLine(text, call.lineStart, call.lineEnd);
    const { lines } = constBlock(out);
    out = removeLine(out, lines[index]!.start, lines[index]!.end);
  } else {
    out = removeLine(text, call.lineStart, call.lineEnd);
  }
  return { text: out, events: parseMapEvents(out, mapName) };
}

export interface GbcWarpRenumberWarning {
  fromMap: string;
  warpIndex: number;
  destWarp: number;
}

/**
 * Deleting warp ordinal `k` on the map with const `C` shifts the 1-based
 * `destWarp` ids `k+2..n` down by one and orphans id `k+1`. Reports every warp
 * (on any map, the deleted map included) with `mapConst === C && destWarp >=
 * k+1`: stricter than GBA's `findWarpsTargetingByIndex` (`=== index` only)
 * because every later id moves, not just the deleted one. `-1` ("return to the
 * previous map") never satisfies `>= k+1`, so it is never reported.
 * `maps` holds each map's warps as they were BEFORE the delete, the deleted
 * map included; the deleted warp itself is excluded by (mapName, index).
 * Warnings only, never refusals (GBA parity).
 */
export function findGbcWarpsRetargetedByDelete(
  maps: { name: string; warps: GbcWarpEvent[] }[],
  deleted: { mapName: string; mapConst: string; index: number },
): GbcWarpRenumberWarning[] {
  const out: GbcWarpRenumberWarning[] = [];
  for (const m of maps) {
    m.warps.forEach((w, warpIndex) => {
      if (m.name === deleted.mapName && warpIndex === deleted.index) return;
      if (w.mapConst === deleted.mapConst && w.destWarp >= deleted.index + 1) out.push({ fromMap: m.name, warpIndex, destWarp: w.destWarp });
    });
  }
  return out;
}
