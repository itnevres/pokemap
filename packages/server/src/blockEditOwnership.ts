/**
 * Plan 14.2 Task 9 — hub ownership of staged tileset edits.
 *
 * This file is the Task 9 **oracle** stage: it carries the type contract the
 * tests and the two session stores compile against, with every body stubbed
 * to `throw new Error("not implemented (Task 9)")`. The behaviour is the
 * implementer's job (Task 9, plan `docs/superpowers/plans/2026-11-10-pokemap-plan-14-2-block-editor.md`).
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
 * - **Ownership follows history, not bytes.** `ownedTilesetPaths` returns the
 *   paths in the current session's `tilesetEdits` (restored, i.e.
 *   `after === before`, entries included) **or in any snapshot on the undo
 *   side of its history** — staging an edit and its inverse still owns the
 *   file until the last change touching it is undone, saved or discarded.
 * - **Redo reacquires.** Before restoring, the redo path calls
 *   `requireTilesetOwnership` and core's `checkTilesetBaselines` for every
 *   path in the target snapshot; on refusal, history and bytes stay as they
 *   were.
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
import type { BlockUsage, TilesetFileEdit } from "@pokemap/core/src/blockEdit/types.js";
import type { createEditSessionStore } from "./editSessions.js";
import type { createGbcEditSessionStore } from "./gbcEditSessions.js";

/**
 * The planner's output for one block edit — one undo step's worth. Task 6's
 * `gbcOps.ts` / Task 7's `gbaOps.ts` produce the real thing in core; it is
 * declared here so the hub contract typechecks before core exports it.
 * Replace this with an imported type when Task 6 lands.
 */
export interface BlockEditPlan {
  /** `before` = baseline bytes when the path was first staged; `after` = the staged bytes. */
  edits: TilesetFileEdit[];
  /** Save-as-new only: the appended block's file-local id. */
  newBlockId?: number;
  /** Save-as-new only: the one grid cell the new block is placed on. */
  placement?: { x: number; y: number; blockId: number };
  warnings: string[];
  usage: BlockUsage;
  /** True exactly when another map draws something this draft changes. */
  confirm: boolean;
  /** The baseline token the popup was opened with (`blockEditRevision`). */
  revision: string;
}

/** The one entry shape a staged-tileset check needs from either session store. */
export interface OwnershipEntry {
  session: EditSession | GbcEditSession;
  // `any` so one type covers both families' stacks; the implementation reads
  // the undo side of the history through it.
  stack: EditCommandStack<any>;
}

export type BlockEditStore = ReturnType<typeof createEditSessionStore> | ReturnType<typeof createGbcEditSessionStore>;

/**
 * What the hub answers after a staged block edit: the union of the two
 * families' existing session bodies, plus the staged tileset edits so the
 * client can disable Save / show the owning file.
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
  /** The merged staged edits, one per path, after this command. */
  tilesetEdits: TilesetFileEdit[];
}

/**
 * Paths owned by one entry right now: the paths in its current session's
 * `tilesetEdits` (restored, `after === before`, entries included) **or** in
 * any snapshot on the undo side of its history — ownership follows history,
 * not bytes.
 */
export function ownedTilesetPaths(entry: OwnershipEntry): Set<string> {
  throw new Error("not implemented (Task 9)");
}

/**
 * Throws `BlockEditRefusal("NOT_OWNER", "<path>: <owner> has unsaved block edits
 * to this file; save, undo or discard them there first")` when a path in
 * `paths` is owned by another open session. The caller's own paths are never
 * refused. Paths are checked in sorted order, so the refusal names the
 * alphabetically first offender.
 */
export function requireTilesetOwnership(entries: Iterable<[string, OwnershipEntry]>, mapName: string, paths: readonly string[]): void {
  throw new Error("not implemented (Task 9)");
}

/**
 * Stages a block edit in `mapName`'s session: ownership check, edits merged
 * onto `session.tilesetEdits`, the placement applied to the grid, one
 * undo command. Used by Task 11's routes and by Task 10's tests.
 */
export function stageTilesetPlan(store: BlockEditStore, mapName: string, plan: BlockEditPlan, label: string): SessionPayload {
  throw new Error("not implemented (Task 9)");
}

/**
 * Throws `BlockEditRefusal("UNSAVED_BLOCK", ...)` naming the owner when any id
 * in `ids` is at or past `savedCount` of `metatilesPath` while another open
 * session owns that file. The caller's own paths are never refused. Wired into
 * both families' paint/fill/stamp routes.
 */
export function refuseUnsavedBlockRefs(entries: Iterable<[string, OwnershipEntry]>, mapName: string, metatilesPath: string, savedCount: number, ids: Iterable<number>): void {
  throw new Error("not implemented (Task 9)");
}
