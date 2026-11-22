/**
 * Plan 14.2 Task 9 — hub ownership of staged tileset edits.
 *
 * Implements the shared ownership checks and staging operations used by the
 * block-editor routes and both session stores.
 *
 * Contract highlights (binding, from the plan's Task 9 interface list and the
 * design spec, "Session ownership, Save and undo"):
 *
 * - **One owner per file.** `requireTilesetOwnership` throws
 *   `BlockEditRefusal("NOT_OWNER", "<path>: <owner> has unsaved block edits to
 *   this file; save, undo or discard them there first")` for a path owned by
 *   another open session; the caller's own paths are never refused, and paths
 *   are checked in sorted order so the refusal names the alphabetically
 *   first offender.
 * - **Ownership follows current staged entries.** `ownedTilesetPaths` returns the
 *   paths in the current session's `tilesetEdits` (restored, i.e.
 *   `after === before`, entries included). Undo/redo restore `tilesetEdits`
 *   through the snapshot command, so ownership reflects the restored state;
 *   history is not scanned.
 * - **Redo reacquires, in the routes.** Both families' redo routes
 *   (`index.ts`, `gbcEditRoutes.ts`) call `requireTilesetOwnership` and core's
 *   `checkTilesetBaselines` on the candidate snapshot's edits before it is
 *   restored; this file only supplies the check.
 * - `refuseUnsavedBlockRefs` refuses (`UNSAVED_BLOCK` naming the owner) any
 *   block id at or past a metatiles file's saved count while another map owns
 *   that file; it is wired into both families' paint/fill/stamp routes.
 * - `stageTilesetPlan` merges the plan's edits, applies the placement to the
 *   grid and pushes **one** undo command (a `snapshotCommand` covering the
 *   tileset bytes and the grid cell).
 */
import type { EditSession } from "@pokemap/core/src/write/save.js";
import type { GbcEditSession } from "@pokemap/core/src/gbc/write/save.js";
import type { GbcMapEvents } from "@pokemap/core/src/gbc/model/types.js";
import type { EditCommandStack } from "@pokemap/core/src/edit/commands.js";
import { BlockEditRefusal, type BlockEditPlan, type TilesetFileEdit } from "@pokemap/core/src/blockEdit/types.js";
import type { createEditSessionStore } from "./editSessions.js";
import type { createGbcEditSessionStore } from "./gbcEditSessions.js";

import { mergeTilesetEdits } from "@pokemap/core/src/blockEdit/save.js";
import { snapshotCommand } from "./editSessions.js";

export type { BlockEditPlan } from "@pokemap/core/src/blockEdit/types.js";

/** The one entry shape a staged-tileset check needs from either session store. */
export interface OwnershipEntry {
  session: EditSession | GbcEditSession;
  // `any` so one type covers both families' stacks for staging commands.
  stack: EditCommandStack<any>;
}

export type BlockEditStore = ReturnType<typeof createEditSessionStore> | ReturnType<typeof createGbcEditSessionStore>;

/**
 * What the hub answers after a staged block edit: exactly the family's
 * existing session body (GBA `sendSession`, GBC `sessionBody`), the same body
 * undo/redo answer. Staged tileset bytes are never sent to the client (O4).
 */
export interface SessionPayload {
  blocks: EditSession["blocks"] | GbcEditSession["blocks"];
  /** GBA only — the session's border blocks. */
  border?: EditSession["border"];
  /** GBA only — the session's map data (events etc.). */
  map?: EditSession["map"];
  /** GBC only — the session's events. */
  events?: GbcMapEvents;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Paths owned by one entry right now: the paths in its current session's
 * `tilesetEdits` (restored, `after === before`, entries included). Undo/redo
 * restore these entries through the snapshot command; history is not scanned.
 */
export function ownedTilesetPaths(entry: OwnershipEntry): Set<string> {
  return new Set((entry.session.tilesetEdits ?? []).map(edit => edit.path));
}

/**
 * Throws `BlockEditRefusal("NOT_OWNER", "<path>: <owner> has unsaved block edits
 * to this file; save, undo or discard them there first")` when a path in
 * `paths` is owned by another open session. The caller's own paths are never
 * refused. Paths are checked in sorted order, so the refusal names the
 * alphabetically first offender.
 */
export function requireTilesetOwnership(entries: Iterable<[string, OwnershipEntry]>, mapName: string, paths: readonly string[]): void {
  const owners = [...entries].filter(([name]) => name !== mapName).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  for (const path of [...paths].sort()) {
    const owner = owners.find(([, entry]) => ownedTilesetPaths(entry).has(path));
    if (owner) throw new BlockEditRefusal("NOT_OWNER", `${path}: ${owner[0]} has unsaved block edits to this file; save, undo or discard them there first`);
  }
}

/**
 * Stages a block edit in `mapName`'s session: ownership check, edits merged
 * onto `session.tilesetEdits`, the placement applied to the grid, one
 * undo command. Used by Task 11's routes and by Task 10's tests.
 */
export function stageTilesetPlan(store: BlockEditStore, mapName: string, plan: BlockEditPlan, label: string): SessionPayload {
  // A refusal closes a session this call opened, so a refused stage leaves the store as it found it.
  const wasOpen = store.has(mapName);
  const entry: OwnershipEntry = store.open(mapName);
  try {
    return stageInto(store, entry, mapName, plan, label);
  } catch (error) {
    if (!wasOpen) store.close(mapName);
    throw error;
  }
}

function stageInto(store: BlockEditStore, entry: OwnershipEntry, mapName: string, plan: BlockEditPlan, label: string): SessionPayload {
  const session = entry.session;
  requireTilesetOwnership(store.entries(), mapName, plan.edits.map(edit => edit.path));
  const merged = mergeTilesetEdits(session.tilesetEdits, plan.edits);
  const prevBlocks = session.blocks.map(block => ({ ...block }));
  const nextBlocks = session.blocks.map(block => ({ ...block }));
  if (plan.placement) {
    const { x, y, blockId } = plan.placement;
    const { width, height } = session.layout;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
      throw new BlockEditRefusal("BAD_VALUE", `${mapName}: placement (${x}, ${y}) is outside the map`);
    }
    const index = y * width + x;
    nextBlocks[index] = { ...nextBlocks[index]!, metatileId: blockId };
  }
  entry.stack.push(session, snapshotCommand<EditSession | GbcEditSession>(label,
    { tilesetEdits: [...(session.tilesetEdits ?? [])], blocks: prevBlocks },
    { tilesetEdits: merged, blocks: nextBlocks }));
  return {
    blocks: session.blocks,
    ...("border" in session ? { border: session.border, map: session.map } : { events: session.events }),
    isDirty: session.isDirty, canUndo: entry.stack.canUndo(), canRedo: entry.stack.canRedo(),
  };
}

/**
 * Throws `BlockEditRefusal("UNSAVED_BLOCK", ...)` naming the owner when any id
 * in `ids` is at or past `savedCount` of `metatilesPath` while another open
 * session owns that file. The caller's own paths are never refused. Wired into
 * both families' paint/fill/stamp routes.
 */
export function refuseUnsavedBlockRefs(entries: Iterable<[string, OwnershipEntry]>, mapName: string, metatilesPath: string, savedCount: number, ids: Iterable<number>): void {
  const owner = [...entries].filter(([name, entry]) => name !== mapName && ownedTilesetPaths(entry).has(metatilesPath))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)[0];
  if (!owner) return;
  const unsaved = [...ids].filter(id => id >= savedCount).sort((a, b) => a - b)[0];
  if (unsaved !== undefined) {
    throw new BlockEditRefusal("UNSAVED_BLOCK", `${metatilesPath}: block ${unsaved} is an unsaved addition of ${owner[0]}; save it there first`);
  }
}
