import type { FileOverlay } from "@pokemap/core/src/blockEdit/types.js";
import type { OwnershipEntry } from "./blockEditOwnership.js";

export interface OverlayState {
  version: number;
  applied: ReadonlyMap<string, Buffer>;
  clearCaches(): void;
}

export function syncTilesetOverlay(
  entries: Iterable<[string, OwnershipEntry]>,
  project: { setTilesetOverlay(o: FileOverlay): void },
  state: OverlayState,
): number {
  const union = new Map<string, Buffer>();
  // Stable ownership fallback even if a caller supplies overlapping sessions.
  for (const [, entry] of [...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    for (const edit of entry.session.tilesetEdits ?? []) {
      if (!union.has(edit.path)) union.set(edit.path, edit.after);
    }
  }
  if (union.size === state.applied.size
    && [...union].every(([path, bytes]) => state.applied.get(path) === bytes)) return state.version;
  project.setTilesetOverlay(union);
  state.clearCaches();
  state.applied = union;
  state.version += 1;
  return state.version;
}
