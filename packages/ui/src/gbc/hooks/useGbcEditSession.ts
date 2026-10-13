import { useCallback, useRef, useState } from "react";
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

function isSessionBody(x: unknown): x is SessionBody {
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

interface Live {
  forMap: string;
  /** The `initialBlocks` this state was derived from: a new payload (a refetch after a commit) invalidates it. */
  seed: Block[] | undefined;
  blocks: Block[];
  events: GbcMapEvents;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * The client face of `gbcEditRoutes.ts` (`/api/edit/:map/*`), mirroring `useEditSession.ts` for GBA with the
 * same discipline: a thin mirror of whatever the server's session holds, never computing anything itself.
 *
 * Differences from the GBA hook, all deliberate:
 * - Per-map state is keyed by `forMap` (and by the `initialBlocks` seed) and derived at render, not reset by an
 *   effect (6c B4). `useEditSession`'s reset effect leaves a one-tick window and a documented clobber gap
 *   (lines 209-241); here a map switch, or a refetched payload, simply stops matching `live` and the seed shows.
 * - A response that lands after the map changed is dropped, so a slow request never paints into the next map.
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
  const [state, setState] = useState<Live | null>(null);
  const latest = useRef({ mapName, initialBlocks });
  latest.current = { mapName, initialBlocks };
  // Read when a response lands: a new map or seed also drops a stale in-flight response, not just stops showing old state.
  // `issued`/`applied` order the responses of one map: a pencil drag fires parallel POSTs, and an older response
  // landing after a newer one must not revert the view (the server is right; the client would be stale).
  const seq = useRef({ issued: 0, applied: 0 });

  const live = state !== null && state.forMap === mapName && state.seed === initialBlocks ? state : null;
  const blocks = live ? live.blocks : initialBlocks ?? [];
  const events = live ? live.events : initialEvents ?? NO_EVENTS;

  const post = useCallback(async (path: string, body?: unknown): Promise<SessionBody | null> => {
    if (!mapName) return null; // nothing open -- same no-op as useEditSession
    const url = `/api/edit/${encodeURIComponent(mapName)}${path}`;
    const mine = ++seq.current.issued;
    const r = await fetch(url, body === undefined ? { method: "POST" } : { method: "POST", body: JSON.stringify(body) });
    const d: unknown = await r.json().catch(() => null);
    if (!r.ok) throw new Error(isRecord(d) && typeof d.error === "string" ? d.error : `POST /api/edit/${mapName}${path} -> ${r.status}`);
    if (!isSessionBody(d)) throw new Error(`POST /api/edit/${mapName}${path} returned an unexpected shape`);
    if (d.events === null) return null; // nothing open server-side (undo/redo no-op): leave the client as it is
    const seed = initialBlocks;
    if (latest.current.mapName === mapName && latest.current.initialBlocks === seed && mine > seq.current.applied) {
      seq.current.applied = mine;
      setState({ forMap: mapName, seed, blocks: d.blocks, events: d.events, isDirty: d.isDirty, canUndo: d.canUndo, canRedo: d.canRedo });
    }
    return d;
  }, [mapName, initialBlocks]);

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

  const markClean = useCallback(() => {
    setState((prev) => (prev === null ? prev : { ...prev, isDirty: false, canUndo: false, canRedo: false }));
  }, []);

  const discard = useCallback(async () => {
    if (!mapName) return;
    const r = await fetch(`/api/edit/${encodeURIComponent(mapName)}/discard`, { method: "POST" });
    if (!r.ok) throw new Error(`POST /api/edit/${mapName}/discard -> ${r.status}`);
    seq.current.applied = seq.current.issued; // an op still in flight must not resurrect the discarded session
    setState(null); // back to the seed -- disk state, not an empty grid
  }, [mapName]);

  return {
    blocks, events, isDirty: live?.isDirty ?? false, canUndo: live?.canUndo ?? false, canRedo: live?.canRedo ?? false,
    beginStroke, applyPaint, endStroke, undo, redo, discard, markClean, moveEvent, addEvent, deleteEvent,
  };
}
