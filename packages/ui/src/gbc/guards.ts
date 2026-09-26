import type { ProjectInfo } from "@pokemap/core/src/family.js";
import type { MapGroupsData } from "../components/MapTree.js";

/**
 * Pure runtime type guards for the GBC UI's fetch responses (RESUME:
 * "validate response shapes", the `isDiffPlan` lesson -- no fetch here casts
 * a response, every one is checked against a real guard). Later tasks
 * (Task 4+) add `isGbcMapPayload` and friends to this same file.
 */

/** `GET /api/project`'s shape, shared by both engine families. `family` must
 *  be exactly `"gba"` or `"gbc"` -- never a wider `typeof x === "string"`
 *  check, since any other value (`"n64"`, `""`, `"GBA"`) is not a family this
 *  UI knows how to route. */
export function isProjectInfo(x: unknown): x is ProjectInfo {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (o.family === "gba" || o.family === "gbc") && typeof o.root === "string";
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
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;

  if (!isStringArray(o.groupOrder)) return false;

  const groups = o.groups;
  if (typeof groups !== "object" || groups === null || Array.isArray(groups)) return false;
  const g = groups as Record<string, unknown>;
  for (const key of Object.keys(g)) {
    if (!isStringArray(g[key])) return false;
  }

  for (const key of o.groupOrder) {
    if (!Object.prototype.hasOwnProperty.call(g, key)) return false;
  }

  return true;
}
