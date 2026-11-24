/**
 * The one store both families' edit sessions live in (Plan H task I2a). It
 * replaces the two near-identical `Map<mapName, entry>` stores that
 * `editSessions.ts` (GBA) and `gbcEditSessions.ts` (GBC) each hand-wrote; the
 * only thing that differs between them is how ONE entry is opened, so that is
 * the one injected function.
 *
 * An open session is not a write -- nothing has touched disk -- so dropping
 * one (after a successful commit, or on an explicit discard) is always safe:
 * the NEXT `open()` re-reads the real files, which are the only durable
 * truth. The store is unbounded, like the per-process caches in `index.ts`: a
 * session opened and never closed sits here for the life of the handler.
 */
export interface SessionStore<E extends { session: { isDirty: boolean } }> {
  /** Opens lazily on first use and returns the same entry until `close`. If
   *  `openEntry` throws (an unknown map), nothing is stored. */
  open(mapName: string): E;
  close(mapName: string): void;
  has(mapName: string): boolean;
  /** Names (sorted) of every open session whose `session.isDirty` is true --
   *  the hub's `ProjectHandler.dirtyMaps()`, which its unsaved-edits 409
   *  guard reads before swapping a handler out. `EditCommandStack` keeps
   *  `isDirty` current on every push/undo/redo, so this is a plain filter. */
  dirty(): string[];
  /** Drops every open session -- the handler's `dispose()`. */
  closeAll(): void;
  entries(): [string, E][];
  root: string;
}

export function createSessionStore<E extends { session: { isDirty: boolean } }>(
  root: string,
  openEntry: (mapName: string) => E,
): SessionStore<E> {
  const sessions = new Map<string, E>();

  function open(mapName: string): E {
    let entry = sessions.get(mapName);
    if (!entry) {
      entry = openEntry(mapName);
      sessions.set(mapName, entry);
    }
    return entry;
  }

  return {
    open,
    close: (mapName) => { sessions.delete(mapName); },
    has: (mapName) => sessions.has(mapName),
    dirty: () => [...sessions].filter(([, e]) => e.session.isDirty).map(([name]) => name).sort(),
    closeAll: () => { sessions.clear(); },
    entries: () => [...sessions.entries()],
    root,
  };
}
