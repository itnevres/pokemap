import { findGbcSign } from "@pokemap/core/gbc/signs";
import { signHash } from "@pokemap/core/signs/marker";
import { gbcSignLabels } from "./signRefresh.js";
import type { GbcProject } from "@pokemap/core/gbc/project";
import type { Block, GbcMapEvents } from "@pokemap/core/gbc/model/types";
import type { TilesetFileEdit } from "@pokemap/core/blockEdit/types";
import { EditCommandStack } from "@pokemap/core/edit/commands";
import { openGbcEditSession, type GbcEditSession } from "@pokemap/core/gbc/write/save";
import { createSessionStore, type SessionStore } from "./sessionStore.js";

export interface GbcSessionEntry {
  session: GbcEditSession;
  signBaselines: Map<string, string>;
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
  constEdits: NonNullable<GbcEditSession["constEdits"]>;
  newNames: string[];
  ownedAdds: NonNullable<GbcEditSession["ownedAdds"]>;
  blocks: Block[];
  eventsText: string;
  events: GbcMapEvents;
  /** Task 9: the staged tileset edits (one per path, `after` = staged bytes)
   *  this snapshot carries, so undo/redo can restore them together with the
   *  grid. `[]` when the session has none. */
  tilesetEdits: TilesetFileEdit[];
}

export const gbcSnapshotOf = (s: GbcEditSession): GbcSnapshot => ({ tilesetEdits: s.tilesetEdits ?? [], blocks: s.blocks, eventsText: s.eventsText, events: s.events, constEdits: s.constEdits ?? [], newNames: s.newNames ?? [], ownedAdds: s.ownedAdds ?? [] });

/**
 * The GBC counterpart of `createEditSessionStore` (`editSessions.ts`): the
 * store itself is `createSessionStore` (`sessionStore.ts`); only opening one
 * entry is GBC-specific. `mapName` must already be a known map
 * (`openGbcEditSession` throws on a miss, and then nothing is stored).
 */
function openGbcEntry(proj: GbcProject, mapName: string): GbcSessionEntry {
  const entry: GbcSessionEntry = { session: openGbcEditSession(proj, mapName), stack: new EditCommandStack<GbcEditSession>(), strokeStartBlocks: null, signBaselines: new Map() };
  for (const label of gbcSignLabels(entry.session.eventsText)) {
    const block = findGbcSign(entry.session.eventsText, label);
    if (block.editable) entry.signBaselines.set(label, signHash(block.body));
  }
  return entry;
}

export function createGbcEditSessionStore(proj: GbcProject): SessionStore<GbcSessionEntry> {
  return createSessionStore(proj.root, (mapName) => openGbcEntry(proj, mapName));
}
