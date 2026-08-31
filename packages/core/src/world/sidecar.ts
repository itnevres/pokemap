import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { projectPaths } from "../config/paths.js";
import type { Placement } from "./connections.js";

export interface Sidecar {
  version: 1;
  dungeonAutoLayout: boolean;
  manualPlacements: Record<string, { x: number; y: number }>;
  view: { x: number; y: number; zoom: number };
}

const DEFAULTS: Sidecar = {
  version: 1,
  dungeonAutoLayout: true,
  manualPlacements: {},
  view: { x: 0, y: 0, zoom: 1 },
};

/**
 * Confirms parsed JSON is shaped enough to trust before merging it onto
 * DEFAULTS, rather than casting it unchecked (I7). This is the one
 * hand-editable state file in the whole plan: a `"manualPlacements": "oops"`
 * typo is syntactically valid JSON, and without this check it would sail
 * through as a Sidecar whose manualPlacements is the string "oops" --
 * Object.entries on a string iterates its characters, so applySidecar would
 * silently fabricate bogus single-character-named placements with no x/y at
 * all. No crash, no refusal, just quietly wrong data downstream. Not a full
 * schema validator -- just enough to refuse the obviously-wrong shapes a
 * human hand-editing this file can actually produce.
 */
function assertShape(path: string, parsed: unknown): asserts parsed is Partial<Sidecar> {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} must contain a JSON object, found ${JSON.stringify(parsed)}.`);
  }
  const p = parsed as Record<string, unknown>;

  if ("manualPlacements" in p) {
    const mp = p.manualPlacements;
    if (mp === null || typeof mp !== "object" || Array.isArray(mp)) {
      throw new Error(
        `${path} has a "manualPlacements" that is not an object (found ${JSON.stringify(mp)}). ` +
          `Expected e.g. { "MapName": { "x": 0, "y": 0 } }.`,
      );
    }
  }

  if ("view" in p) {
    const view = p.view;
    if (view === null || typeof view !== "object" || Array.isArray(view)) {
      throw new Error(
        `${path} has a "view" that is not an object (found ${JSON.stringify(view)}). ` +
          `Expected { "x": number, "y": number, "zoom": number }.`,
      );
    }
    const v = view as Record<string, unknown>;
    for (const key of ["x", "y", "zoom"] as const) {
      if (key in v && typeof v[key] !== "number") {
        throw new Error(`${path} has a "view.${key}" that is not a number (found ${JSON.stringify(v[key])}).`);
      }
    }
  }
}

export function readSidecar(root: string): Sidecar {
  const path = projectPaths(root).sidecar;
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

/**
 * The only write PokeMap performs outside the decomp's own data files (I8).
 * This file never affects the ROM build.
 */
export function writeSidecar(root: string, s: Sidecar): void {
  const path = projectPaths(root).sidecar;
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, `${JSON.stringify(s, null, 2)}\n`);
}

export function applySidecar(auto: Map<string, Placement>, s: Sidecar): Map<string, Placement> {
  const out = new Map(auto);
  for (const [name, pos] of Object.entries(s.manualPlacements)) {
    const existing = out.get(name);
    out.set(name, existing ? { ...existing, ...pos } : { map: name, ...pos, width: 0, height: 0, component: -1 });
  }
  return out;
}
