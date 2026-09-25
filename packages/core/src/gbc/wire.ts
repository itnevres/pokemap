/**
 * The GBC server/UI wire payload shapes -- a types-only module, no runtime
 * code (Plan 6b's Resolved design question Q1). The server (`packages/server/
 * src/gbcRoutes.ts`) annotates each JSON response with `satisfies` against
 * these; the UI imports the same interfaces and still validates the shape at
 * runtime with its own guards (RESUME: "validate response shapes"). Kept
 * separate from the GBA wire types (declared UI-side, `useMapLayout.ts`)
 * rather than unioned with them -- no GBA component ever narrows a GBC
 * payload, and a shared union would force GBA-only narrowing everywhere for
 * no GBC benefit (Q1's own reasoning).
 *
 * `ProjectInfo` -- the one shape BOTH families' servers produce -- lives in
 * `../family.ts` next to `EngineFamily`, not here (finding 10).
 *
 * Task 1a defines only `GbcMapPayload`/`GbcCollisionInfoEntry`, the shapes
 * Task 1b's `/api/map/:name` route needs. Task 2 adds `GbcWorldPayload` and
 * `GbcEncountersPayload` for the world/atlas routes. `/api/groups` reuses the
 * UI's existing `MapGroupsData` shape (`{ groupOrder, groups }`) rather than
 * a new `GbcGroupsPayload` type here -- it's already family-agnostic.
 */
import type { Block, Collision, DataDefect, GbcMap, GbcMapEvents } from "./model/types.js";
import type { Placement, Component, Conflict } from "./world/connections.js";
import type { GbcEncounterSource } from "./analyse/atlas.js";

/** One of `Collision`'s three coarse buckets (`TileCollisionTable`'s low nybble, `load/tileset.ts`'s `loadGbcCollisionInfo`). */
export type GbcCollisionCategory = "land" | "water" | "wall";

/**
 * One raw `COLL_*` byte value's display info, keyed by that value in
 * `GbcMapPayload.collisionInfo` (`String(value)`, since JSON object keys are
 * always strings). `name` is the `COLL_*` constant with that value, or
 * `null` when no name resolves to it (`load/tileset.ts`'s
 * `loadGbcCollisionInfo` is the one place this shape is built, so its return
 * type IS this interface -- declared once, not duplicated).
 */
export interface GbcCollisionInfoEntry {
  name: string | null;
  category: GbcCollisionCategory;
  talk: boolean;
}

/**
 * `GET /api/map/:name`'s response (Task 1b). Raw, unresolved map data --
 * `blocks` carries block id 0 exactly as stored (no border substitution;
 * that is `renderGbcMap`'s own per-pixel concern, not this payload's), and
 * `collisionInfo` carries only the values this map's `collision` array
 * actually uses, not the full 256-entry table.
 */
export interface GbcMapPayload {
  family: "gbc";
  map: GbcMap;
  layout: { blkPath: string; width: number; height: number; writable: boolean };
  /** Exactly `layout.width * layout.height` entries, raw ids (0 NOT substituted). */
  blocks: Block[];
  metatileCount: number;
  tileset: { constName: string; name: string };
  /** Per metatile, length === `metatileCount`. */
  collision: Collision[];
  /** Keyed by `String(value)`; only the values `collision` actually uses. */
  collisionInfo: Record<string, GbcCollisionInfoEntry>;
  events: GbcMapEvents;
  /** Layout defects, then event defects, then out-of-bounds-event defects, in that order. */
  defects: DataDefect[];
  paddingWidth: number;
}

/**
 * `GET /api/world`'s response (Task 2) -- `buildGbcWorld`'s own `GbcWorld`
 * (`gbc/world/connections.ts`), wire-shaped: `placements` is a plain object
 * keyed by map name (JSON has no `Map`; `Object.fromEntries` on the server
 * side, never a raw `Map` serialised, which would silently give `{}`).
 * `blockPx` is always `32` -- GBC's fixed block size (`GbcMap.width`/
 * `height`'s own unit) -- carried on the wire rather than left implicit, so
 * the UI never hardcodes it a second time.
 */
export interface GbcWorldPayload {
  family: "gbc";
  blockPx: 32;
  /** Keyed by map name; units are BLOCKS (1 block = 32 px), same as `GbcWorld.placements`. */
  placements: Record<string, Placement>;
  components: Component[];
  conflicts: Conflict[];
}

/**
 * `GET /api/encounters/:map`'s response (Task 2). `sources` is
 * `gbcEncounterSources`'s own output verbatim -- an empty array is real data
 * (a map with no wild encounters at all), not an error. `defects` is
 * `proj.wild().defects`, the corpus-wide wild-data defect list (currently
 * just the `kanto_grass.asm` missing-terminator warning), not per-map --
 * every map's `/api/encounters` response carries the same `defects` array.
 */
export interface GbcEncountersPayload {
  mapName: string;
  sources: GbcEncounterSource[];
  defects: DataDefect[];
}
