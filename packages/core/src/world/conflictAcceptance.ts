import type { Conflict } from "./connections.js";

export interface WireConflict extends Conflict {
  key: string;
  accepted: boolean;
}

/** Stable identity for the complete pair of competing placements. */
export function conflictKey(c: Conflict): string {
  return JSON.stringify([c.map, c.viaA.from, c.viaA.x, c.viaA.y, c.viaB.from, c.viaB.x, c.viaB.y]);
}

export function wireConflicts(conflicts: readonly Conflict[], acceptedKeys: readonly string[]): WireConflict[] {
  const accepted = new Set(acceptedKeys);
  return conflicts.map((conflict) => {
    const key = conflictKey(conflict);
    return { ...conflict, key, accepted: accepted.has(key) };
  });
}

export function isAcceptConflictBody(value: unknown): value is { key: string; accepted: boolean } {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).key === "string"
    && typeof (value as Record<string, unknown>).accepted === "boolean";
}

export function updatedAcceptedConflicts(current: readonly string[], key: string, accepted: boolean): string[] {
  return accepted ? [...new Set([...current, key])] : current.filter((saved) => saved !== key);
}
