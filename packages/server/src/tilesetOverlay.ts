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
  throw new Error("not implemented (Task 10)");
}
