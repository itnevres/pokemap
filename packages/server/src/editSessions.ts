import { existsSync, readFileSync } from "node:fs";
import { findGbaSign } from "@pokemap/core/src/signs/gbaSign.js";
import { signHash } from "@pokemap/core/src/signs/marker.js";
import { gbaSignLabels } from "./signRefresh.js";
import type { Project } from "@pokemap/core/src/project.js";
import type { EditSession } from "@pokemap/core/src/write/save.js";
import type { TilesetFileEdit } from "@pokemap/core/src/blockEdit/types.js";
import { EditCommandStack, type EditCommand } from "@pokemap/core/src/edit/commands.js";
import { parseBlocks } from "@pokemap/core/src/load/blocks.js";
import { createSessionStore, type SessionStore } from "./sessionStore.js";

export interface SessionEntry {
  session: EditSession;
  signBaselines: Map<string, string>;
  stack: EditCommandStack;
  /** Set by /paint/begin, cleared by /paint/end -- the blocks snapshot a
   *  live gesture reverts to if the client never calls /end (e.g. it
   *  crashed mid-drag). Not itself part of the undo stack. */
  strokeStartBlocks: EditSession["blocks"] | null;
}

/**
 * Opens ONE GBA edit session entry: `createEditSessionStore` below hands it to
 * `createSessionStore`, which owns the per-process `Map<mapName, SessionEntry>`
 * (see `sessionStore.ts` for why dropping an entry is always safe). `project.map`
 * is called on every open, so a project whose `map` re-parses from disk (the
 * `index.ts` handler's) hands a reopened session the last commit -- keep calling
 * it here, never cache the map in the store.
 */
function openGbaEntry(project: Project, mapName: string): SessionEntry {
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
  const entry: SessionEntry = { session, stack: new EditCommandStack(), strokeStartBlocks: null, signBaselines: new Map() };
  const scriptsPath = project.paths.mapScriptsInc(mapName);
  if (existsSync(scriptsPath)) {
    const text = readFileSync(scriptsPath, "utf8");
    for (const label of gbaSignLabels(text)) {
      const block = findGbaSign(text, label);
      if (block.editable) entry.signBaselines.set(label, signHash(block.body));
    }
  }
  return entry;
}

export function createEditSessionStore(project: Project): SessionStore<SessionEntry> {
  return createSessionStore(project.paths.root, (mapName) => openGbaEntry(project, mapName));
}

/** A snapshot-diff command: `apply`/`revert` just assign the session's own
 *  mutable fields wholesale, rather than knowing HOW to reverse a specific
 *  paint or event operation -- every route handler in index.ts builds one
 *  of these the same way (capture a `Snapshot` before mutating, mutate via
 *  a pure `core` function, capture another `Snapshot` after), so undo/redo
 *  works identically for a paint stroke, an event move, an event add, and
 *  an event delete without this file needing to know the difference. */
export interface Snapshot {
  newNames: string[];
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
  scriptReplaces: NonNullable<EditSession["scriptReplaces"]>;
  /** Task 9: the staged tileset edits (one per path, `after` = staged bytes)
   *  this snapshot carries, so undo/redo can restore them together with the
   *  grid. `[]` when the session has none. */
  tilesetEdits: TilesetFileEdit[];
}

export function snapshotOf(session: EditSession): Snapshot {
  return {
    newNames: session.newNames ?? [],
    tilesetEdits: session.tilesetEdits ?? [],
    blocks: session.blocks, border: session.border, map: session.map,
    jsonEdits: session.jsonEdits, insertOps: session.insertOps, removeOps: session.removeOps,
    scriptAppends: session.scriptAppends ?? [],
    scriptReplaces: session.scriptReplaces ?? [],
  };
}

// NoInfer: S comes from the return-type context (or the EditSession default at the GBA call sites), never from
// prev/next -- without it S is inferred as Snapshot there and the GBA call sites stop compiling.
export function snapshotCommand<S extends object = EditSession>(label: string, prev: NoInfer<Partial<S>>, next: NoInfer<Partial<S>>): EditCommand<S> {
  return {
    label,
    apply: (s) => Object.assign(s, next),
    revert: (s) => Object.assign(s, prev),
  };
}
