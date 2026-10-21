import type { EventKind } from "@pokemap/core/src/edit/events.js";

/** Cap on object events per map: pokeemerald's OBJECT_EVENT_TEMPLATES_COUNT. */
export const MAX_OBJECT_EVENTS = 64;

/**
 * The insertion value (raw snake_case, as `addEvent` splices it into map.json) for a copy of the full current
 * event `raw` (a `MapData` event: object/warp are camelCase-normalized, coord/bg are already raw). Every field is
 * copied except `local_id` (GBA object ids come from array position, so a copy must not claim the original's). The
 * copy sits one tile right, or one left at the right edge, y clamped to the map -- as GBC's `duplicateArgs` does.
 */
export function duplicateEventValue(kind: EventKind, raw: Record<string, unknown>, mapW: number, mapH: number): Record<string, unknown> {
  const x0 = Number(raw.x);
  const x = Math.max(0, x0 + 1 >= mapW ? x0 - 1 : x0 + 1);
  const y = Math.max(0, Math.min(mapH - 1, Number(raw.y)));
  const elevation = raw.elevation;
  if (kind === "object") {
    return {
      graphics_id: raw.graphicsId, x, y, elevation, movement_type: raw.movementType,
      movement_range_x: raw.movementRangeX, movement_range_y: raw.movementRangeY, trainer_type: raw.trainerType,
      trainer_sight_or_berry_tree_id: raw.trainerSightOrBerryTreeId, script: raw.script, flag: raw.flag,
    };
  }
  if (kind === "warp") return { x, y, elevation, dest_map: raw.destMap, dest_warp_id: raw.destWarpId };
  // coord/bg carry an open-ended, subtype-varying field set (weather, secret base, hidden item...): copy it all.
  const { local_id: _dropped, ...rest } = raw;
  return { ...rest, x, y };
}
