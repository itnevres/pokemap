import type { GbaEncounterRow } from "./summary.js";
import { isRecord } from "../gbc/guards.js";

const METHODS = new Set(["land_mons", "water_mons", "rock_smash_mons", "fishing_mons"]);

/**
 * GBA `GET /api/encounters/:map`: `{ methods: GbaEncounterRow[] }` (plus
 * mapName/mapId, unread). GBC serves the same URL as `{ family: "gbc",
 * sources }` with no `methods`, which this rejects by requiring the array.
 * Guards what `summariseGba` indexes by -- `method` must be a known key of its
 * table, or it would throw inside a memo -- and the numbers `EncounterBorder`
 * prints; `slots` is never read.
 */
export function isGbaEncountersPayload(x: unknown): x is { methods: GbaEncounterRow[] } {
  if (!isRecord(x) || !Array.isArray(x.methods)) return false;
  return x.methods.every(
    (m) =>
      isRecord(m) &&
      typeof m.method === "string" &&
      METHODS.has(m.method) &&
      (m.rod === undefined || typeof m.rod === "string") &&
      Array.isArray(m.chances) &&
      m.chances.every(
        (c) =>
          isRecord(c) &&
          typeof c.species === "string" &&
          typeof c.percent === "number" &&
          typeof c.minLevel === "number" &&
          typeof c.maxLevel === "number",
      ),
  );
}
