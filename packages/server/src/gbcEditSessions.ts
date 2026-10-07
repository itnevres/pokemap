import type { GbcProject } from "@pokemap/core/src/gbc/project.js";
import type { Block, GbcMapEvents } from "@pokemap/core/src/gbc/model/types.js";
import { EditCommandStack } from "@pokemap/core/src/edit/commands.js";
import { openGbcEditSession, type GbcEditSession } from "@pokemap/core/src/gbc/write/save.js";

export interface GbcSessionEntry {
  session: GbcEditSession;
  stack: EditCommandStack<GbcEditSession>;
  /** Set by /paint/begin, cleared by /paint/end -- the blocks a live gesture
   *  reverts to if the client never calls /end. Not itself part of the undo
   *  stack. */
  strokeStartBlocks: Block[] | null;
}

/** The mutable slice of a GBC session that one undo step swaps wholesale
 *  (GBA's `Snapshot` equivalent, `editSessions.ts`). `events` is always the
 *  parse of `eventsText`, so the two travel together. */
export interface GbcSnapshot {
  blocks: Block[];
  eventsText: string;
  events: GbcMapEvents;
}

export const gbcSnapshotOf = (s: GbcEditSession): GbcSnapshot => ({ blocks: s.blocks, eventsText: s.eventsText, events: s.events });

/**
 * One `Map<mapName, GbcSessionEntry>` per GBC handler, the counterpart of
 * `createEditSessionStore` (`editSessions.ts`): holds the mutable edit state
 * between requests. An open session is not a write -- nothing has touched
 * disk -- so dropping one (after a successful commit, or on an explicit
 * discard) is always safe; the NEXT `open()` re-reads the real files, which
 * are the only durable truth. Unbounded, like the GBA store: a session opened
 * and never closed sits here for the life of the handler.
 */
export function createGbcEditSessionStore(proj: GbcProject) {
  const sessions = new Map<string, GbcSessionEntry>();

  /** Opens lazily on first use; `mapName` must already be a known map (`openGbcEditSession` throws on a miss). */
  function open(mapName: string): GbcSessionEntry {
    let entry = sessions.get(mapName);
    if (!entry) {
      entry = { session: openGbcEditSession(proj, mapName), stack: new EditCommandStack<GbcEditSession>(), strokeStartBlocks: null };
      sessions.set(mapName, entry);
    }
    return entry;
  }

  const close = (mapName: string): void => { sessions.delete(mapName); };
  const has = (mapName: string): boolean => sessions.has(mapName);

  /** Names (sorted) of every open session with `session.isDirty` -- the hub's
   *  `ProjectHandler.dirtyMaps()`, which its unsaved-edits 409 guard reads.
   *  `EditCommandStack` keeps `isDirty` current on every push/undo/redo, so
   *  this is a plain filter. */
  const dirty = (): string[] => [...sessions].filter(([, e]) => e.session.isDirty).map(([name]) => name).sort();

  /** Drops every open session -- the handler's `dispose()`. */
  const closeAll = (): void => { sessions.clear(); };

  return { open, close, has, dirty, closeAll };
}
