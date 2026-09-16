import { useCallback, useEffect, useState } from "react";
import type { Block } from "@pokemap/core/src/model/types.js";
import type { Stamp } from "@pokemap/core/src/edit/paint.js";

export type PaintApplyBody =
  | { tool: "pencil"; targets: { x: number; y: number }[]; stamp: Stamp; origin: { x: number; y: number } }
  | { tool: "rect"; x0: number; y0: number; x1: number; y1: number; stamp: Stamp; origin: { x: number; y: number } }
  | { tool: "bucket"; x: number; y: number; replacement: { metatileId: number; collision?: number; elevation?: number } }
  | { tool: "shift"; dx: number; dy: number };

export interface UseEditSessionResult {
  blocks: Block[];
  border: Block[];
  isDirty: boolean;
  /** Task 13: whether the server's own undo/redo stack has anything to act
   *  on -- see EditCommandStack.canUndo()/canRedo() (core) and sendSession
   *  (server), which is the one place that actually knows the stack depth.
   *  Both default false while no session is open (mapName === null) or
   *  before the first server round trip has told us otherwise. */
  canUndo: boolean;
  canRedo: boolean;
  beginStroke(): Promise<void>;
  applyPaint(body: PaintApplyBody): Promise<void>;
  endStroke(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  /** Task 13, found live (not in the plan's own text -- see this task's own
   *  report): SaveDialog's own commit call is a plain `fetch` straight to
   *  `POST /api/edit/:map/commit`, not routed through this hook at all (it
   *  only needs `mapName`, not the rest of this hook's surface) -- and a
   *  successful commit makes the server CLOSE that session (editSessions.ts
   *  -- `close`, not `markSaved()`-and-keep-open, per that route's own doc
   *  comment). Nothing tells this hook's local isDirty/canUndo/canRedo
   *  that happened, so without this, the Toolbar's dirty dot and disabled
   *  Save button would stay stuck on after a real save until the player
   *  switched maps and back. The caller (App.tsx's own onCommitted) is
   *  responsible for calling this the instant SaveDialog reports success.
   *  `blocks` deliberately isn't touched -- the just-committed blocks ARE
   *  now what's on disk, so they stay exactly as they are. */
  markClean(): void;
}

interface SessionResponse {
  blocks: Block[];
  border: Block[];
  isDirty: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
}

/**
 * The client-side face of Task 8/9's `/api/edit/:map/*` routes -- mirrors
 * every other data hook's own "fetch, hold in state, expose setters that
 * round-trip and update from the response" shape (useDungeons.ts is the
 * closest sibling). `blocks`/`border`/`isDirty`/`canUndo`/`canRedo` all come
 * straight from whatever the server's own session state was after the last
 * call; this hook never computes anything client-side, it is a thin, honest
 * mirror.
 *
 * `mapName: string | null` mirrors useMapLayout's own null-tolerant contract
 * (see that hook's doc comment) -- Task 13 is the first caller that needs to
 * invoke this hook unconditionally from App.tsx (Map mode may have nothing
 * selected, or may be showing a read-only view with editing not yet
 * relevant), and every React hook must be called on every render regardless.
 * With `mapName === null`, every mutating call below is a no-op that never
 * touches the network -- there is nothing open on the server to talk to.
 *
 * `initialBlocks` (Task 13): there is deliberately no server route that
 * returns a freshly-opened session's blocks on their own (only the
 * paint/undo/redo routes return a session snapshot, since those are the only
 * routes Task 8/9 needed) -- so without a seed, `blocks` would start `[]`
 * and MapCanvas's overlay compositing (which switches to `editSession.blocks`
 * the instant the prop is non-null, see MapCanvas.tsx's own `blocks` doc
 * comment) would render every overlay as empty until the player's first
 * edit. Passing the map's already-fetched static blocks (`useMapLayout`'s
 * own `data.blocks`) here seeds the first paint with real data instead.
 */
export function useEditSession(mapName: string | null, initialBlocks?: Block[]): UseEditSessionResult {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks ?? []);
  const [border, setBorder] = useState<Block[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Reset to the new map's own seed whenever `mapName` OR `initialBlocks`
  // changes -- otherwise a session opened for map A would leak its blocks/
  // dirty/undo state into map B's view the instant `selected` changes, the
  // same class of bug App.tsx's own WorldCanvas `key` fix (Task 15) guards
  // against for a different component.
  //
  // Depending on `initialBlocks` too (not just `mapName`) matters because of
  // an ordering gotcha between this hook and useMapLayout, its usual source
  // for the seed: when `selected` changes, useMapLayout's own `data` does
  // NOT reset synchronously -- it keeps the PREVIOUS map's blocks until its
  // fetch resolves (see that hook's own effect: it only guards `!name`, it
  // never resets `data` on a plain name change). If this effect only ran on
  // `mapName`, the very first reset after a map switch would seed from the
  // OLD map's blocks. Re-running when `initialBlocks`'s reference changes
  // means a second, corrective reset lands once useMapLayout's fetch
  // actually resolves for the NEW map -- and since App.tsx only mounts
  // MapCanvas once `layout.data` is truthy for the current map (nothing can
  // paint before then), that second reset always lands before the player
  // could possibly have started editing, so it never clobbers real work.
  useEffect(() => {
    setBlocks(initialBlocks ?? []);
    setBorder([]);
    setIsDirty(false);
    setCanUndo(false);
    setCanRedo(false);
  }, [mapName, initialBlocks]);

  const applyResponse = (d: SessionResponse) => {
    setBlocks(d.blocks);
    setBorder(d.border);
    setIsDirty(d.isDirty);
    setCanUndo(d.canUndo ?? false);
    setCanRedo(d.canRedo ?? false);
  };

  const call = useCallback(
    async (path: string, body: unknown = {}) => {
      if (!mapName) return; // nothing open -- see this hook's own doc comment
      const r = await fetch(`/api/edit/${encodeURIComponent(mapName)}${path}`, { method: "POST", body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`POST /api/edit/${mapName}${path} -> ${r.status}`);
      applyResponse((await r.json()) as SessionResponse);
    },
    [mapName],
  );

  const beginStroke = useCallback(() => call("/paint/begin"), [call]);
  const applyPaint = useCallback((body: PaintApplyBody) => call("/paint/apply", body), [call]);
  const endStroke = useCallback(() => call("/paint/end"), [call]);
  const undo = useCallback(() => call("/undo"), [call]);
  const redo = useCallback(() => call("/redo"), [call]);

  const markClean = useCallback(() => {
    setIsDirty(false);
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  return { blocks, border, isDirty, canUndo, canRedo, beginStroke, applyPaint, endStroke, undo, redo, markClean };
}
