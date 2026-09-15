import { useCallback, useState } from "react";
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
  beginStroke(): Promise<void>;
  applyPaint(body: PaintApplyBody): Promise<void>;
  endStroke(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
}

/**
 * The client-side face of Task 8/9's `/api/edit/:map/*` routes -- mirrors
 * every other data hook's own "fetch, hold in state, expose setters that
 * round-trip and update from the response" shape (useDungeons.ts is the
 * closest sibling). `blocks`/`border`/`isDirty` all come straight from
 * whatever the server's own session state was after the last call; this
 * hook never computes anything client-side, it is a thin, honest mirror.
 */
export function useEditSession(mapName: string): UseEditSessionResult {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [border, setBorder] = useState<Block[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const applyResponse = (d: { blocks: Block[]; border: Block[]; isDirty: boolean }) => {
    setBlocks(d.blocks);
    setBorder(d.border);
    setIsDirty(d.isDirty);
  };

  const call = useCallback(
    async (path: string, body: unknown = {}) => {
      const r = await fetch(`/api/edit/${encodeURIComponent(mapName)}${path}`, { method: "POST", body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`POST /api/edit/${mapName}${path} -> ${r.status}`);
      applyResponse((await r.json()) as { blocks: Block[]; border: Block[]; isDirty: boolean });
    },
    [mapName],
  );

  const beginStroke = useCallback(() => call("/paint/begin"), [call]);
  const applyPaint = useCallback((body: PaintApplyBody) => call("/paint/apply", body), [call]);
  const endStroke = useCallback(() => call("/paint/end"), [call]);
  const undo = useCallback(() => call("/undo"), [call]);
  const redo = useCallback(() => call("/redo"), [call]);

  return { blocks, border, isDirty, beginStroke, applyPaint, endStroke, undo, redo };
}
