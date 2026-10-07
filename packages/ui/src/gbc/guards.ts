import type { ProjectInfo } from "@pokemap/core/src/family.js";
import type { GbcMapPayload, GbcWorldPayload, GbcEncountersPayload } from "@pokemap/core/src/gbc/wire.js";
import type { GbcCoverage } from "@pokemap/core/src/gbc/analyse/atlas.js";
import type { GbcWarpsPayload } from "./warps.js";
import type { MapGroupsData } from "../components/MapTree.js";
import { isWireConflict } from "../world/conflictAcceptance.js";

/**
 * Pure runtime type guards for the GBC UI's fetch responses (RESUME:
 * "validate response shapes", the `isDiffPlan` lesson -- no fetch here casts
 * a response, every one is checked against a real guard). Later tasks
 * (Task 4+) add `isGbcMapPayload` and friends to this same file.
 */

/** A plain, non-null, non-array object -- the "is this even a record we can
 *  read named fields off of" check every guard in this file starts with.
 *  Excludes arrays deliberately: none of this file's shapes (`ProjectInfo`,
 *  `MapGroupsData`, or its nested `groups` map) is ever legitimately an
 *  array, and later guards (`isGbcMapPayload` etc., Task 4+) get the same
 *  exclusion for free rather than each re-deriving it. */
export function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isWarpEvent(x: unknown): boolean {
  return isRecord(x) && Number.isFinite(x.x) && Number.isFinite(x.y)
    && typeof x.mapConst === "string" && Number.isInteger(x.destWarp)
    && Number.isInteger(x.lineIndex);
}

export function isGbcWarpsPayload(x: unknown): x is GbcWarpsPayload {
  return isRecord(x) && x.family === "gbc" && typeof x.mapName === "string"
    && Array.isArray(x.warps) && x.warps.every((w: unknown) =>
      isWarpEvent(w) && isRecord(w)
      && (w.destMapName === undefined || typeof w.destMapName === "string")
      && (w.destEvent === undefined || isWarpEvent(w.destEvent)));
}

/** `GET /api/project`'s shape, shared by both engine families. `family` must
 *  be exactly `"gba"` or `"gbc"` -- never a wider `typeof x === "string"`
 *  check, since any other value (`"n64"`, `""`, `"GBA"`) is not a family this
 *  UI knows how to route. */
export function isProjectInfo(x: unknown): x is ProjectInfo {
  if (!isRecord(x)) return false;
  return (x.family === "gba" || x.family === "gbc") && typeof x.root === "string";
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

/** `MapTree`'s `MapGroupsData` shape (`{ groupOrder, groups }`), returned by
 *  both the GBA and GBC `/api/groups` routes. Every clause below is
 *  independently mutation-tested (`packages/ui/test/gbc/guards.test.ts`):
 *  a plain-object `groups` whose values are all `string[]`, and every
 *  `groupOrder` entry actually present as a key of `groups` -- a payload
 *  that names a group in `groupOrder` but omits it from `groups` would crash
 *  `MapTree`'s own `data.groups[g] ?? []` fallback silently rather than
 *  surfacing as a visible error here. */
export function isMapGroupsData(x: unknown): x is MapGroupsData {
  if (!isRecord(x)) return false;

  if (!isStringArray(x.groupOrder)) return false;

  if (!isRecord(x.groups)) return false;
  const g = x.groups;
  for (const key of Object.keys(g)) {
    if (!isStringArray(g[key])) return false;
  }

  for (const key of x.groupOrder) {
    if (!Object.prototype.hasOwnProperty.call(g, key)) return false;
  }

  return true;
}

function isPositiveInteger(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x > 0;
}

/**
 * `GET /api/map/:name`'s shape (Task 4). Deliberately NOT a full structural
 * check of every field `GbcMapPayload` carries (`map`'s own dozen fields,
 * every `collisionInfo` entry's shape, `events`' scene_scripts/callbacks) --
 * this checks exactly the invariants `GbcMapCanvas`/`gbcStepInfo` actually
 * rely on to index safely (`blocks.length === width*height`,
 * `collision.length === metatileCount`), the same "trust the rest, guard
 * what you index by" posture `isMapGroupsData` above already takes with
 * `groupOrder`'s membership in `groups`. Every clause below is independently
 * mutation-tested (`packages/ui/test/gbc/guards.test.ts`).
 */
export function isGbcMapPayload(x: unknown): x is GbcMapPayload {
  if (!isRecord(x)) return false;
  if (x.family !== "gbc") return false;

  if (!isRecord(x.map) || typeof x.map.name !== "string") return false;

  if (!isRecord(x.layout)) return false;
  const { width, height } = x.layout;
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) return false;

  if (!Array.isArray(x.blocks) || x.blocks.length !== width * height) return false;

  if (typeof x.metatileCount !== "number") return false;
  if (!Array.isArray(x.collision) || x.collision.length !== x.metatileCount) return false;

  // Fix round (spec review finding 12): `GbcMapCanvas`/`GbcMetatilePalette`
  // dereference `payload.collisionInfo[...]` and `payload.tileset.constName`
  // unconditionally (the status strip, the collision overlay, the palette
  // header, the metatile thumbnail URL) -- neither was previously checked,
  // so a malformed response for either would crash the canvas instead of
  // surfacing as a visible guard error.
  if (!isRecord(x.collisionInfo)) return false;
  if (!isRecord(x.tileset) || typeof x.tileset.constName !== "string") return false;

  if (!isRecord(x.events)) return false;
  const ev = x.events;
  if (!Array.isArray(ev.warps) || !Array.isArray(ev.coords) || !Array.isArray(ev.bgs) || !Array.isArray(ev.objects)) return false;

  if (!Array.isArray(x.defects)) return false;

  return true;
}

/**
 * `GET /api/world`'s shape (Task 5). `blockPx` must be exactly `32` -- GBC's
 * fixed block size, carried on the wire so `GbcWorldCanvas` never hardcodes
 * it a second time (`wire.ts`'s own doc comment) -- not just "a number", the
 * same "exact literal, not a widened typeof" posture `isProjectInfo`'s own
 * `family` check already takes. `placements` is checked structurally (every
 * value has the 5 numeric fields plus a string `map` a `Placement` needs);
 * `components`/`conflicts` are checked only as arrays, matching
 * `isGbcMapPayload`'s own "trust the rest, guard what you index by" posture
 * -- `GbcWorldCanvas` reads `component.bounds`/`.maps` and `conflict.map`/
 * `.viaA`/`.viaB` directly off whatever the array holds, same as
 * `isMapGroupsData` trusts `groups[key]`'s own string entries once the array
 * shape itself is confirmed.
 */
export function isGbcWorldPayload(x: unknown): x is GbcWorldPayload {
  if (!isRecord(x)) return false;
  if (x.family !== "gbc") return false;
  if (x.blockPx !== 32) return false;

  if (!isRecord(x.placements)) return false;
  for (const key of Object.keys(x.placements)) {
    const p = x.placements[key];
    if (!isRecord(p)) return false;
    if (typeof p.map !== "string") return false;
    if (typeof p.x !== "number" || typeof p.y !== "number") return false;
    if (typeof p.width !== "number" || typeof p.height !== "number") return false;
    if (typeof p.component !== "number") return false;
    if (typeof p.mapType !== "string" || typeof p.manual !== "boolean") return false;
  }

  if (!Array.isArray(x.components)) return false;
  if (!Array.isArray(x.conflicts) || !x.conflicts.every(isWireConflict)) return false;

  return true;
}

/**
 * `GET /api/encounters/:map`'s shape (Task 2's own `GbcEncountersPayload`,
 * Plan 6b Task 6). `family` must be the exact literal `"gbc"` -- GBA's own
 * `/api/encounters/:map` serves the identical URL pattern with a
 * structurally different `{ mapName, mapId, methods }` shape and no
 * `family` tag at all (`wire.ts`'s own doc comment on `GbcEncountersPayload`
 * for the "same URL, two shapes" history), so this is also what rejects a
 * GBA-shaped payload reaching a GBC canvas by mistake (mutation check #8).
 * `sources` is checked only as an array -- "trust the rest, guard what you
 * index by" (this file's own established posture, `isGbcWorldPayload`'s own
 * doc comment): every reader of `sources` (`summariseGbc`,
 * `methodTint`) only ever reads `.method`/`.chances` off entries it already
 * knows came from the real `gbcEncounterSources` builder, never off
 * arbitrary user input.
 */
export function isGbcEncountersPayload(x: unknown): x is GbcEncountersPayload {
  if (!isRecord(x)) return false;
  if (x.family !== "gbc") return false;
  if (!Array.isArray(x.sources)) return false;
  return true;
}

/**
 * `GET /api/coverage`'s shape (`gbcCoverage`'s own `GbcCoverage`, Plan 6b
 * Task 6). Unlike `GbcWorldPayload`/`GbcEncountersPayload`, this route's
 * response carries no `family` tag -- GBA's own `/api/coverage` (a
 * structurally different `Coverage` shape) is never reachable from the same
 * server process a GBC one is (`gbcRoutes.ts`'s dispatch is mutually
 * exclusive with GBA's `index.ts`), so there is no "same URL, two shapes"
 * ambiguity here to disambiguate with a tag the way the other two routes
 * need to. Checks only the 3 fields `GbcWorldCanvas`'s own lenses actually
 * read (`levelByMap` for the level-curve tint, `mapsWithoutEncounters`/
 * `unusedSpecies` for `LensLegend`'s own summary counts and lists) -- the same "guard
 * what you index by" posture every other guard in this file already takes;
 * `mapsWithEncounters`/`sourcesByMethod`/`fishGroupWithoutWater`/`defects`
 * are never read by anything this task adds.
 */
export function isGbcCoveragePayload(x: unknown): x is GbcCoverage {
  if (!isRecord(x)) return false;

  if (!Array.isArray(x.mapsWithoutEncounters) || !x.mapsWithoutEncounters.every((v) => typeof v === "string")) return false;
  if (!Array.isArray(x.unusedSpecies) || !x.unusedSpecies.every((v) => typeof v === "string")) return false;

  if (!Array.isArray(x.levelByMap)) return false;
  for (const e of x.levelByMap) {
    if (!isRecord(e)) return false;
    if (typeof e.mapName !== "string" || typeof e.averageLevel !== "number") return false;
  }

  return true;
}
