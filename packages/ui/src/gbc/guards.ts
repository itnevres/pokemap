import type { ProjectInfo } from "@pokemap/core/src/family.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import type { MapGroupsData } from "../components/MapTree.js";

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

  if (!isRecord(x.events)) return false;
  const ev = x.events;
  if (!Array.isArray(ev.warps) || !Array.isArray(ev.coords) || !Array.isArray(ev.bgs) || !Array.isArray(ev.objects)) return false;

  if (!Array.isArray(x.defects)) return false;

  return true;
}
