import { useCallback, useMemo } from "react";
import { useEditSessionCore } from "../../shared/useEditSessionCore.js";
import type { Block, GbcMapEvents } from "@pokemap/core/src/gbc/model/types.js";
import type { GbcStamp } from "@pokemap/core/src/gbc/edit/paint.js";
import type { GbcEventKind, GbcWarpRenumberWarning } from "@pokemap/core/src/gbc/edit/events.js";
import { isRecord } from "../guards.js";

export type { GbcEventKind, GbcWarpRenumberWarning };

/** The `paint/apply` request bodies (`gbcEditRoutes.ts`'s `paintApply`). Coordinates are BLOCKS (32 px). */
export type GbcPaintBody =
  | { tool: "pencil"; targets: { x: number; y: number }[]; stamp: GbcStamp; origin: { x: number; y: number } }
  | { tool: "rect"; x0: number; y0: number; x1: number; y1: number; stamp: GbcStamp; origin: { x: number; y: number } }
  | { tool: "bucket"; x: number; y: number; replacement: { metatileId: number } }
  | { tool: "shift"; dx: number; dy: number };

export interface UseGbcEditSessionResult {
  blocks: Block[];
  events: GbcMapEvents;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  beginStroke(): Promise<void>;
  applyPaint(body: GbcPaintBody): Promise<void>;
  endStroke(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  /** Closes the server session and restores the seed (what the map looked like on disk), NOT an empty grid --
   *  the same blank-canvas regression `useEditSession.ts`'s `discard` doc comment (lines 97-128) postmortems.
   *  Throws on a non-ok response so a failed discard is never shown as a success. */
  discard(): Promise<void>;
  /** `SaveDialog` commits with a plain fetch, and a commit closes the server session; this tells the client.
   *  Blocks/events stay as they are -- they ARE what is on disk now (`useEditSession.ts` `markClean`, lines 41-54). */
  markClean(): void;
  /** Coordinates are STEPS (16 px), the `.asm` event grid. */
  moveEvent(kind: GbcEventKind, index: number, x: number, y: number): Promise<void>;
  /** `args` are the macro's arguments as source text, in macro order. */
  addEvent(kind: GbcEventKind, args: string[], objectConst?: string): Promise<void>;
  deleteEvent(kind: GbcEventKind, index: number): Promise<{ warpRenumberWarnings: GbcWarpRenumberWarning[] }>;
  /** Applies the full session body returned by SignEditor without a second request. */
  applyExternalSession?(body: unknown): void;
}

interface SessionBody {
  blocks: Block[];
  /** `null` only on undo/redo's "nothing open" no-op (`NOTHING_OPEN` in `gbcEditRoutes.ts`). */
  events: GbcMapEvents | null;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  warpRenumberWarnings?: GbcWarpRenumberWarning[];
}

const EVENT_LISTS = ["warps", "coords", "bgs", "objects", "sceneScripts", "callbacks", "objectConsts"] as const;

export function isSessionBody(x: unknown): x is SessionBody {
  if (!isRecord(x)) return false;
  if (!Array.isArray(x.blocks) || !x.blocks.every((b) => isRecord(b) && Number.isInteger(b.metatileId))) return false;
  if (x.events !== null) {
    if (!isRecord(x.events) || !EVENT_LISTS.every((k) => Array.isArray((x.events as Record<string, unknown>)[k]))) return false;
  }
  if (typeof x.isDirty !== "boolean" || typeof x.canUndo !== "boolean" || typeof x.canRedo !== "boolean") return false;
  if (x.warpRenumberWarnings !== undefined) {
    const w = x.warpRenumberWarnings;
    if (!Array.isArray(w) || !w.every((e) => isRecord(e) && typeof e.fromMap === "string" && Number.isInteger(e.warpIndex) && Number.isInteger(e.destWarp))) return false;
  }
  return true;
}

const NO_EVENTS: GbcMapEvents = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };

/**
 * The client face of `gbcEditRoutes.ts` (`/api/edit/:map/*`), mirroring `useEditSession.ts` for GBA with the
 * same discipline: a thin mirror of whatever the server's session holds, never computing anything itself.
 *
 * Both families use the shared core for map/seed-derived state and ordered response tickets.
 * Differences from the GBA hook, all deliberate:
 * - Every response is shape-checked (RESUME) before it touches state; a malformed one throws with the state unchanged.
 * - The server's `{ error }` body is surfaced as the thrown message: event refusals (a referenced object const,
 *   the 15-object cap) are 400s whose text is the whole explanation.
 * - All event ops return the full session (`blocks` + `events` + flags), so there is none of GBA's
 *   `callEvent` canUndo-guessing.
 *
 * Lives in `GbcApp`, always mounted, so a World/Dungeon round trip never loses the client's view of a session
 * the server still holds dirty (the reasoning at `App.tsx:50-62`).
 */
export function useGbcEditSession(mapName: string | null, initialBlocks?: Block[], initialEvents?: GbcMapEvents): UseGbcEditSessionResult {
  const seed = useMemo(() => ({ blocks: initialBlocks ?? [], events: initialEvents ?? NO_EVENTS }), [initialBlocks, initialEvents]);
  const { state, isDirty, canUndo, canRedo, post: corePost, apply, discard, markClean } = useEditSessionCore("/api/edit", mapName, seed, { readServerError: true });
  const { blocks, events } = state;

  const post = useCallback(async (path: string, body?: unknown): Promise<SessionBody | null> => {
    const reply = await corePost<unknown>(path, body);
    if (!reply) return null;
    const d = reply.data;
    if (!isSessionBody(d)) throw new Error(`POST /api/edit/${mapName}${path} returned an unexpected shape`);
    if (d.events === null) return null; // nothing open server-side (undo/redo no-op): leave the client as it is
    const nextEvents = d.events;
    apply({ state: () => ({ blocks: d.blocks, events: nextEvents }), isDirty: d.isDirty, canUndo: d.canUndo, canRedo: d.canRedo }, reply.ticket);
    return d;
  }, [corePost, apply, mapName]);

  const beginStroke = useCallback(() => post("/paint/begin").then(() => {}), [post]);
  const applyPaint = useCallback((body: GbcPaintBody) => post("/paint/apply", body).then(() => {}), [post]);
  const endStroke = useCallback(() => post("/paint/end").then(() => {}), [post]);
  const undo = useCallback(() => post("/undo").then(() => {}), [post]);
  const redo = useCallback(() => post("/redo").then(() => {}), [post]);
  const moveEvent = useCallback((kind: GbcEventKind, index: number, x: number, y: number) => post("/event/move", { kind, index, x, y }).then(() => {}), [post]);
  const addEvent = useCallback(
    (kind: GbcEventKind, args: string[], objectConst?: string) => post("/event/add", objectConst === undefined ? { kind, args } : { kind, args, objectConst }).then(() => {}),
    [post],
  );
  const deleteEvent = useCallback(
    (kind: GbcEventKind, index: number) => post("/event/delete", { kind, index }).then((d) => ({ warpRenumberWarnings: d?.warpRenumberWarnings ?? [] })),
    [post],
  );
  const applyExternalSession = useCallback((body: unknown) => {
    if (!isSessionBody(body) || body.events === null) return;
    apply({ state: () => ({ blocks: body.blocks, events: body.events! }), isDirty: body.isDirty, canUndo: body.canUndo, canRedo: body.canRedo });
  }, [apply]);

  return {
    blocks, events, isDirty, canUndo, canRedo,
    beginStroke, applyPaint, endStroke, undo, redo, discard, markClean, moveEvent, addEvent, deleteEvent, applyExternalSession,
  };
}
