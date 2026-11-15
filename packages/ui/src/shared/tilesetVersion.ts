/** Typed stub (Task 10b tests hop). The implementation fills in the three bodies; every URL builder that
 *  renders tiles reads `useTilesetVersion()` so a staged tileset edit refetches an already-open canvas. */

/** Records a tileset version announced by a session or map reply. Lower values never lower the store. */
export function noteTilesetVersion(v: unknown): void {
  throw new Error("not implemented (Task 10b)");
}

/** Drops the recorded version back to 0 (test isolation). */
export function resetTilesetVersion(): void {
  throw new Error("not implemented (Task 10b)");
}

/** The current tileset version; components that call this re-render when it changes. */
export function useTilesetVersion(): number {
  throw new Error("not implemented (Task 10b)");
}
