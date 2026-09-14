import { readFileSync } from "node:fs";
import type { Project } from "@pokemap/core/src/project.js";
import type { EditSession } from "@pokemap/core/src/write/save.js";
import { EditCommandStack, type EditCommand } from "@pokemap/core/src/edit/commands.js";
import { parseBlocks } from "@pokemap/core/src/load/blocks.js";

export interface SessionEntry {
  session: EditSession;
  stack: EditCommandStack;
  /** Set by /paint/begin, cleared by /paint/end -- the blocks snapshot a
   *  live gesture reverts to if the client never calls /end (e.g. it
   *  crashed mid-drag). Not itself part of the undo stack. */
  strokeStartBlocks: EditSession["blocks"] | null;
}

/**
 * One `Map<mapName, SessionEntry>` per server process, exactly the shape
 * `worldCache`/`coverageCache` already use for "read-only project, compute
 * once" -- except a session is genuinely mutable and this store's whole
 * job is holding that mutation between requests, not memoizing a pure
 * answer. `close()` is what actually enforces I6 in spirit: an edit
 * session existing in memory is not itself a write (nothing has touched
 * disk), and dropping it (after a successful commit, or on an explicit
 * discard) is always safe -- the NEXT open() just re-reads the real files,
 * which are the only durable truth.
 */
export function createEditSessionStore(project: Project) {
  // Unbounded for now, same honesty as index.ts's own pngCache/iconCache --
  // nothing calls close() yet (Task 9's commit route is expected to, after
  // a successful save), so a session opened and never explicitly closed or
  // saved just sits here for the life of the process.
  const sessions = new Map<string, SessionEntry>();

  function open(mapName: string): SessionEntry {
    let entry = sessions.get(mapName);
    if (entry) return entry;

    const map = project.map(mapName);
    const layout = project.layoutForMap(mapName);
    const blocks = parseBlocks(readFileSync(`${project.paths.root}/${layout.blockdataFilepath}`), project.profile);
    const border = parseBlocks(readFileSync(`${project.paths.root}/${layout.borderFilepath}`), project.profile);
    const originalMapJson = readFileSync(project.paths.mapJson(mapName), "utf8");

    const session: EditSession = {
      mapName, layout, blocks, border, map,
      // `map` is `project.map(mapName)`'s own cached MapData, shared across
      // the whole server process -- aliasing it here (as `originalMap: map`)
      // would violate EditSession.originalMap's own doc comment (MUST be an
      // independent copy) exactly as originalBlocks's own copy below avoids
      // for blocks: a later in-place mutation of session.map (Task 9's event
      // moves, Task 17's sign writes) would otherwise silently corrupt BOTH
      // guardMapSave's prev/next diff and the project-wide map cache that
      // /api/map/:name still reads from.
      originalBlocks: blocks.map((b) => ({ ...b })), originalMap: structuredClone(map),
      originalMapJson, jsonEdits: [], insertOps: [], removeOps: [], isDirty: false,
    };
    entry = { session, stack: new EditCommandStack(), strokeStartBlocks: null };
    sessions.set(mapName, entry);
    return entry;
  }

  function close(mapName: string): void {
    sessions.delete(mapName);
  }

  function has(mapName: string): boolean {
    return sessions.has(mapName);
  }

  return { open, close, has };
}

/** A snapshot-diff command: `apply`/`revert` just assign the session's own
 *  mutable fields wholesale, rather than knowing HOW to reverse a specific
 *  paint or event operation -- every route handler in index.ts builds one
 *  of these the same way (capture a `Snapshot` before mutating, mutate via
 *  a pure `core` function, capture another `Snapshot` after), so undo/redo
 *  works identically for a paint stroke, an event move, an event add, and
 *  an event delete without this file needing to know the difference. */
export interface Snapshot {
  blocks: EditSession["blocks"];
  border: EditSession["border"];
  map: EditSession["map"];
  jsonEdits: EditSession["jsonEdits"];
  insertOps: EditSession["insertOps"];
  removeOps: EditSession["removeOps"];
  /** Added for Task 17's wild-sign write path -- `Object.assign` in
   *  snapshotCommand below only overwrites keys a Snapshot actually
   *  carries, so omitting this field here would silently leave a sign's
   *  scriptAppend in place across an undo. Always present (defaults to
   *  `[]`), unlike EditSession's own optional field, so every snapshot is
   *  a complete, unambiguous state to revert TO. */
  scriptAppends: NonNullable<EditSession["scriptAppends"]>;
}

export function snapshotOf(session: EditSession): Snapshot {
  return {
    blocks: session.blocks, border: session.border, map: session.map,
    jsonEdits: session.jsonEdits, insertOps: session.insertOps, removeOps: session.removeOps,
    scriptAppends: session.scriptAppends ?? [],
  };
}

export function snapshotCommand(label: string, prev: Snapshot, next: Snapshot): EditCommand {
  return {
    label,
    apply: (s) => Object.assign(s, next),
    revert: (s) => Object.assign(s, prev),
  };
}
