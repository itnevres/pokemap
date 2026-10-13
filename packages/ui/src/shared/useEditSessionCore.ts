import { useCallback, useRef, useState } from "react";

export interface EditFlags { isDirty: boolean; canUndo: boolean; canRedo: boolean }
/** An updater lets family hooks merge partial replies without losing other state. */
export type EditUpdate<State> = { state?: (prev: State) => State } & Partial<EditFlags>;
export interface EditTicket { readonly map: string; readonly seed: unknown; readonly seq: number }
export interface EditSessionCore<State> extends EditFlags {
  state: State;
  post<R>(path: string, body?: unknown): Promise<{ data: R; ticket: EditTicket } | null>;
  apply(update: EditUpdate<State>, ticket?: EditTicket): boolean;
  discard(): Promise<void>;
  markClean(): void;
}

interface Stored<State> extends EditFlags {
  forMap: string | null;
  seed: State;
  state: State;
}

/** Map/seed identity controls the rendered view; tickets order asynchronous replies. */
export function useEditSessionCore<State>(base: string, mapName: string | null, seed: State, opts?: { readServerError?: boolean }): EditSessionCore<State> {
  const [stored, setStored] = useState<Stored<State> | null>(null);
  const latest = useRef({ mapName, seed });
  latest.current = { mapName, seed };
  const seq = useRef({ issued: 0, applied: 0 });
  const readServerError = opts?.readServerError ?? false;
  const live = stored !== null && stored.forMap === mapName && stored.seed === seed ? stored : null;

  const post = useCallback(async <R,>(path: string, body?: unknown): Promise<{ data: R; ticket: EditTicket } | null> => {
    if (mapName === null) return null;
    const ticket: EditTicket = { map: mapName, seed, seq: ++seq.current.issued };
    const r = await fetch(`${base}/${encodeURIComponent(mapName)}${path}`, body === undefined ? { method: "POST" } : { method: "POST", body: JSON.stringify(body) });
    // GBC reads even malformed bodies once, then its family shape check owns the failure.
    const data: unknown = readServerError ? await r.json().catch(() => null) : undefined;
    if (!r.ok) {
      const message = data !== null && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : `POST ${base}/${mapName}${path} -> ${r.status}`;
      throw new Error(message);
    }
    return { data: (readServerError ? data : await r.json()) as R, ticket };
  }, [base, mapName, seed, readServerError]);

  const apply = useCallback((update: EditUpdate<State>, ticket?: EditTicket): boolean => {
    const current = latest.current;
    if (ticket) {
      if (current.mapName !== ticket.map || current.seed !== ticket.seed || ticket.seq <= seq.current.applied) return false;
      seq.current.applied = ticket.seq;
    }
    setStored((prev) => {
      const start = prev !== null && prev.forMap === current.mapName && prev.seed === current.seed
        ? prev
        : { forMap: current.mapName, seed: current.seed, state: current.seed, isDirty: false, canUndo: false, canRedo: false };
      return {
        ...start,
        state: update.state ? update.state(start.state) : start.state,
        isDirty: update.isDirty ?? start.isDirty,
        canUndo: update.canUndo ?? start.canUndo,
        canRedo: update.canRedo ?? start.canRedo,
      };
    });
    return true;
  }, []);

  const discard = useCallback(async () => {
    if (mapName === null) return;
    const r = await fetch(`${base}/${encodeURIComponent(mapName)}/discard`, { method: "POST" });
    if (!r.ok) throw new Error(`POST ${base}/${mapName}/discard -> ${r.status}`);
    seq.current.applied = seq.current.issued; // in-flight edits cannot resurrect a discarded session
    setStored(null); // show disk seed, never the server's empty closed-session reply
  }, [base, mapName]);

  const markClean = useCallback(() => {
    setStored((prev) => prev === null ? prev : { ...prev, isDirty: false, canUndo: false, canRedo: false });
  }, []);

  return { state: live ? live.state : seed, isDirty: live?.isDirty ?? false, canUndo: live?.canUndo ?? false, canRedo: live?.canRedo ?? false, post, apply, discard, markClean };
}
