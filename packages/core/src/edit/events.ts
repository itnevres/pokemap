import type { MapData, ObjectEvent, WarpEvent, CoordEvent, BgEvent } from "../load/maps.js";
import type { JsonEdit } from "../write/jsonEdit.js";
import type { InsertOp, RemoveOp } from "../write/save.js";

export type EventKind = "object" | "warp" | "coord" | "bg";

/** The raw JSON array key for each event kind -- matches load/maps.ts's own
 *  parseMap field names exactly, since these paths splice the RAW file. */
export const EVENT_ARRAY_KEY: Record<EventKind, string> = {
  object: "object_events", warp: "warp_events", coord: "coord_events", bg: "bg_events",
};

const CAMEL_ARRAY_KEY: Record<EventKind, "objectEvents" | "warpEvents" | "coordEvents" | "bgEvents"> = {
  object: "objectEvents", warp: "warpEvents", coord: "coordEvents", bg: "bgEvents",
};

/** What the event routes need from a session to translate indices (Plan H Task B3).
 *
 *  Two index spaces meet here. The UI (and `session.map`) speak CURRENT
 *  indices: the original array minus the removed originals, in order, then
 *  the pending adds appended. The staged ops (`jsonEdits`, `removeOps`,
 *  `insertOps`) are applied to the ORIGINAL file text by `applyJsonOps`, so
 *  they must all live in original space: `removeOps` hold original indices,
 *  and a pending add holds `originalLength + k`. */
export interface IndexSpaceSession { originalMap: MapData; insertOps: InsertOp[]; removeOps: RemoveOp[]; }

export type EventSlot = { pending: false; original: number } | { pending: true; insert: InsertOp };

const sameArray = (path: readonly (string | number)[], key: string) => path.length === 1 && path[0] === key;

function originalLength(session: IndexSpaceSession, kind: EventKind): number {
  return (session.originalMap[CAMEL_ARRAY_KEY[kind]] as unknown[]).length;
}

/** Current index -> the original index of a surviving original event, or the pending add it names. */
export function eventSlot(session: IndexSpaceSession, kind: EventKind, current: number): EventSlot {
  const key = EVENT_ARRAY_KEY[kind];
  const removed = new Set(session.removeOps.filter((op) => sameArray(op.path, key)).map((op) => op.index));
  const survivors: number[] = [];
  for (let i = 0; i < originalLength(session, kind); i++) if (!removed.has(i)) survivors.push(i);
  if (Number.isInteger(current) && current >= 0 && current < survivors.length) return { pending: false, original: survivors[current]! };
  const adds = session.insertOps.filter((op) => sameArray(op.path, key));
  const insert = Number.isInteger(current) ? adds[current - survivors.length] : undefined;
  if (current < survivors.length || insert === undefined) throw new Error(`index ${current} is not present in ${key}`);
  return { pending: true, insert };
}

/** The index a new `addEvent` insertOp must carry so it stays in original space. */
export function appendIndex(session: IndexSpaceSession, kind: EventKind): number {
  const key = EVENT_ARRAY_KEY[kind];
  return originalLength(session, kind) + session.insertOps.filter((op) => sameArray(op.path, key)).length;
}

/** `insertOps` without `insert`; later pending adds of the same array move down by one. */
export function dropPendingInsert(session: IndexSpaceSession, kind: EventKind, insert: InsertOp): InsertOp[] {
  const key = EVENT_ARRAY_KEY[kind];
  return session.insertOps
    .filter((op) => op !== insert)
    .map((op) => (sameArray(op.path, key) && op.index > insert.index ? { ...op, index: op.index - 1 } : op));
}

/** Writes x/y (always) and elevation (only when passed) via jsonEdits --
 *  I2's own "surgical splice, never reserialise" applies at the field level
 *  too: a drag never touches any other key on the moved event. `elevation`
 *  omitted (`undefined`, e.g. a canvas drag, which has no elevation concept)
 *  behaves exactly as before this field existed: no elevation jsonEdit, no
 *  elevation change on the returned map's own event. Every real event kind's
 *  raw JSON already carries an `elevation` field under that exact name. */
export function moveEvent(map: MapData, kind: EventKind, index: number, x: number, y: number, elevation?: number): { map: MapData; jsonEdits: JsonEdit[] } {
  const arrayKey = EVENT_ARRAY_KEY[kind];
  const jsonEdits: JsonEdit[] = [
    { path: [arrayKey, index, "x"], value: x },
    { path: [arrayKey, index, "y"], value: y },
  ];
  if (elevation !== undefined) jsonEdits.push({ path: [arrayKey, index, "elevation"], value: elevation });
  const camelKey = CAMEL_ARRAY_KEY[kind];
  const list = (map[camelKey] as Array<{ x: number; y: number; elevation: number }>).map((e, i) =>
    i === index ? { ...e, x, y, ...(elevation !== undefined ? { elevation } : {}) } : e,
  );
  return { map: { ...map, [camelKey]: list }, jsonEdits };
}

export function setObjectGraphics(map: MapData, index: number, graphicsId: string): { map: MapData; jsonEdits: JsonEdit[] } {
  const objectEvents = map.objectEvents.map((event, i) => i === index ? { ...event, graphicsId } : event);
  return {
    map: { ...map, objectEvents },
    jsonEdits: [{ path: ["object_events", index, "graphics_id"], value: graphicsId }],
  };
}

/** `value` is a RAW object literal (snake_case field names) -- it is
 *  spliced verbatim into map.json by insertArrayElement, so it must match
 *  the file's own field names, not MapData's camelCase ones. Appends at
 *  the array's own current end; the caller decides the target array via
 *  `kind`, never a caller-supplied index -- an explicit insertion point in
 *  the middle of an events array has no established meaning in this
 *  format (unlike connections, where order can matter), so "add" always
 *  means "append". The returned `insertOp.index` is a CURRENT-list index; a
 *  caller staging it on an EditSession must restamp it with `appendIndex`
 *  (original-file index space, see `IndexSpaceSession`). */
export function addEvent(map: MapData, kind: EventKind, value: Record<string, unknown>): { map: MapData; insertOp: InsertOp } {
  const arrayKey = EVENT_ARRAY_KEY[kind];
  const camelKey = CAMEL_ARRAY_KEY[kind];
  const currentList = map[camelKey] as unknown[];
  const insertOp: InsertOp = { path: [arrayKey], index: currentList.length, value };
  const parsed = rawToCamel(kind, value);
  return { map: { ...map, [camelKey]: [...currentList, parsed] }, insertOp };
}

export function deleteEvent(map: MapData, kind: EventKind, index: number): { map: MapData; removeOp: RemoveOp } {
  const arrayKey = EVENT_ARRAY_KEY[kind];
  const camelKey = CAMEL_ARRAY_KEY[kind];
  const currentList = map[camelKey] as unknown[];
  if (index < 0 || index >= currentList.length) throw new Error(`index ${index} is not present in ${arrayKey}`);
  const removeOp: RemoveOp = { path: [arrayKey], index };
  const list = currentList.filter((_, i) => i !== index);
  return { map: { ...map, [camelKey]: list }, removeOp };
}

export interface WarpRenumberWarning { fromMapId: string; warpIndex: number; }

/**
 * Warp ids are positional (`dest_warp_id` names an INDEX into the
 * destination map's own warp_events array, not a stable identifier), so
 * deleting warp `deletedIndex` on `deletedMapId` silently renumbers every
 * later warp on that same map -- and any OTHER map's warp whose
 * `dest_warp_id` pointed at exactly that index now points at whatever
 * shifted into its place. This scans every OTHER map's own warps for one
 * naming (`deletedMapId`, `deletedIndex`) and reports it as a warning, not
 * a refusal -- the decomp has no protection against this footgun today
 * (docs/human-porymap.md), and the delete is not inherently wrong, the
 * user just needs to know to go fix the other map's warp afterward.
 *
 * `destWarpId` is a raw string field and is not always numeric (a symbolic
 * constant like WARP_ID_NONE appears in real data) -- `Number(...)` on one
 * of those is NaN, and NaN never triggers the `=== deletedIndex` check, so
 * those are correctly never reported rather than coerced into a false
 * match.
 */
export function findWarpsTargetingByIndex(
  otherMaps: { mapId: string; map: MapData }[], deletedMapId: string, deletedIndex: number,
): WarpRenumberWarning[] {
  const out: WarpRenumberWarning[] = [];
  for (const { mapId, map } of otherMaps) {
    map.warpEvents.forEach((w, warpIndex) => {
      if (w.destMap === deletedMapId && Number(w.destWarpId) === deletedIndex) {
        out.push({ fromMapId: mapId, warpIndex });
      }
    });
  }
  return out;
}

/** Mirrors load/maps.ts's own parseMap field-by-field for exactly the one
 *  event kind being added -- kept local rather than importing a shared
 *  per-event parser out of maps.ts (that file's own parseMap is a single
 *  pass over a whole map.json, not four independently reusable per-kind
 *  parsers; splitting it for this one caller is not worth the churn on a
 *  Plan-1 file every later plan also depends on). */
function rawToCamel(kind: EventKind, raw: Record<string, unknown>): ObjectEvent | WarpEvent | CoordEvent | BgEvent {
  if (kind === "object") {
    return {
      graphicsId: raw.graphics_id as string, x: Number(raw.x), y: Number(raw.y), elevation: Number(raw.elevation),
      movementType: raw.movement_type as string, movementRangeX: Number(raw.movement_range_x), movementRangeY: Number(raw.movement_range_y),
      trainerType: raw.trainer_type as string, trainerSightOrBerryTreeId: String(raw.trainer_sight_or_berry_tree_id),
      script: raw.script as string, flag: String(raw.flag),
    };
  }
  if (kind === "warp") {
    return { x: Number(raw.x), y: Number(raw.y), elevation: Number(raw.elevation), destMap: raw.dest_map as string, destWarpId: String(raw.dest_warp_id) };
  }
  // coord/bg events carry an open-ended, engine-varying field set (see
  // load/maps.ts's own CoordEvent/BgEvent: `[k: string]: unknown` beyond a
  // small common base) -- passed through structurally rather than
  // enumerated field by field, the same posture maps.ts's own parser takes
  // for these two kinds.
  return { ...raw, x: Number(raw.x), y: Number(raw.y), elevation: Number(raw.elevation) } as CoordEvent | BgEvent;
}
