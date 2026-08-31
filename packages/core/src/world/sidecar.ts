import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const file = (root: string) => `${root.replace(/\\/g, "/")}/.pokemap/world.json`;

export function readSidecar(root: string): Sidecar {
  const path = file(root);
  if (!existsSync(path)) return structuredClone(DEFAULTS);
  return { ...structuredClone(DEFAULTS), ...(JSON.parse(readFileSync(path, "utf8")) as Partial<Sidecar>) };
}

/**
 * The only write PokeMap performs outside the decomp's own data files (I8).
 * This file never affects the ROM build.
 */
export function writeSidecar(root: string, s: Sidecar): void {
  const path = file(root);
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
