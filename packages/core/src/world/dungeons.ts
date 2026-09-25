import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { projectPaths } from "../config/paths.js";

export interface Dungeon {
  id: string;
  name: string;
  maps: string[];
}

export interface DungeonsFile {
  version: 1;
  dungeons: Dungeon[];
}

const DEFAULTS: DungeonsFile = { version: 1, dungeons: [] };

/** Mirrors sidecar.ts's own assertShape exactly -- same I7 reasoning (a
 *  hand-editable JSON file needs to refuse an obviously-wrong shape rather
 *  than silently misbehave downstream), same "not a full schema validator"
 *  scope. */
function assertShape(path: string, parsed: unknown): asserts parsed is Partial<DungeonsFile> {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} must contain a JSON object, found ${JSON.stringify(parsed)}.`);
  }
  const p = parsed as Record<string, unknown>;
  if ("dungeons" in p) {
    if (!Array.isArray(p.dungeons)) {
      throw new Error(`${path} has a "dungeons" that is not an array (found ${JSON.stringify(p.dungeons)}).`);
    }
    for (const [i, d] of p.dungeons.entries()) {
      if (d === null || typeof d !== "object" || Array.isArray(d)) {
        throw new Error(`${path}: dungeons[${i}] must be an object, found ${JSON.stringify(d)}.`);
      }
      const dd = d as Record<string, unknown>;
      if (typeof dd.id !== "string" || typeof dd.name !== "string" || !Array.isArray(dd.maps)) {
        throw new Error(
          `${path}: dungeons[${i}] must be { id: string, name: string, maps: string[] }, found ${JSON.stringify(dd)}.`,
        );
      }
    }
  }
}

export function readDungeons(root: string): DungeonsFile {
  const path = projectPaths(root).dungeons;
  if (!existsSync(path)) return structuredClone(DEFAULTS);

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  assertShape(path, parsed);

  return { ...structuredClone(DEFAULTS), ...parsed };
}

/** The only write PokeMap performs outside the decomp's own data files
 *  (I8), same guarantee as sidecar.ts's own writeSidecar. */
export function writeDungeons(root: string, d: DungeonsFile): void {
  const path = projectPaths(root).dungeons;
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, `${JSON.stringify(d, null, 2)}\n`);
}
