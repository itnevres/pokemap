import type { WireConflict } from "@pokemap/core/src/world/conflictAcceptance.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isWireConflict(value: unknown): value is WireConflict {
  if (!isRecord(value) || !isRecord(value.viaA) || !isRecord(value.viaB)) return false;
  return typeof value.map === "string" && typeof value.key === "string" && typeof value.accepted === "boolean"
    && typeof value.viaA.from === "string" && Number.isFinite(value.viaA.x) && Number.isFinite(value.viaA.y)
    && typeof value.viaB.from === "string" && Number.isFinite(value.viaB.x) && Number.isFinite(value.viaB.y);
}

export function isAcceptedConflictsResponse(value: unknown): value is { acceptedConflicts: string[] } {
  return isRecord(value) && Array.isArray(value.acceptedConflicts)
    && value.acceptedConflicts.every((key: unknown) => typeof key === "string");
}

/** Sorted per-map index; draw and hit testing consume the same coordinates. */
export function conflictBadgeOffsets(conflicts: readonly WireConflict[], step: number): Map<string, number> {
  const groups = new Map<string, string[]>();
  for (const conflict of conflicts) groups.set(conflict.map, [...(groups.get(conflict.map) ?? []), conflict.key]);
  const offsets = new Map<string, number>();
  for (const keys of groups.values()) keys.sort().forEach((key, index) => offsets.set(key, index * step));
  return offsets;
}
