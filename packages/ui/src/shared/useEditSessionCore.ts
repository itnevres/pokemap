import { useCallback, useEffect, useRef, useState } from "react";
import type { AddEventForm, EventKind } from "@pokemap/core/src/addEvent/types.js";
import { useVisit } from "./useVisit.js";
import { invalidateEventOptions } from "./useEventOptions.js";
import { noteTilesetVersion, tilesetGeneration } from "./tilesetVersion.js";

/** Refusals keep their server code; callers suppress failures belonging to a retired visit. */
export class EditSessionError extends Error {
  constructor(message: string, public code?: string, public stale = false) { super(message); }
}

// SaveDialog and the switch shell share this registry with the owning session hook.
// Session mutations live until the request has settled, including failed requests.
const sessionMutations = new Map<string, Set<Promise<unknown>>>();
export function hasPendingSessionMutations(map: string | null): boolean {
  return map !== null && (sessionMutations.get(map)?.size ?? 0) > 0;
}
export async function sessionMutationBarrier(map: string | null): Promise<void> {
  while (map !== null && hasPendingSessionMutations(map)) {
    await Promise.all([...sessionMutations.get(map)!].map((pending) => pending.catch(() => undefined)));
  }
}

/** New operations are separate from the legacy canvas-session subset, keeping existing adapters structural. */
export interface EventCreateSession {
  createEvent(form: AddEventForm): Promise<{ kind: EventKind; index: number } | null>;
  barrier(): Promise<void>;
}

export interface BlockCheckReply {
  usage: unknown;
  confirm: boolean;
  warnings: string[];
  refusal?: { code: string; error: string };
}
export interface BlockEditSession {
  blockCheck(request: unknown, revision: string): Promise<BlockCheckReply | null>;
  blockPreview(request: unknown): Promise<{ png: string } | null>;
  /** Posts /block/apply and applies the reply exactly like undo. Resolves true when applied. Throws EditSessionError on a refusal. */
  blockApply(request: unknown, revision: string): Promise<boolean>;
}

export interface EditFlags { isDirty: boolean; canUndo: boolean; canRedo: boolean }
/** An updater lets family hooks merge partial replies without losing other state. */
export type EditUpdate<State> = { state?: (prev: State) => State } & Partial<EditFlags>;
export interface EditTicket { readonly map: string; readonly seed: unknown; readonly seq: number; readonly isCurrent?: () => boolean }
export interface EditSessionCore<State> extends EditFlags {
  state: State;
  post<R>(path: string, body?: unknown): Promise<{ data: R; ticket: EditTicket } | null>;
  apply(update: EditUpdate<State>, ticket?: EditTicket): boolean;
  barrier(): Promise<void>;
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
  const visit = useVisit(mapName);
  const visitRef = useRef(visit);
  visitRef.current = visit;
  if (visit.changed && stored !== null) setStored(null);
  const ownedSessionMutations = useRef(new Map<Promise<unknown>, string>());
  useEffect(() => () => {
    for (const [pending, name] of ownedSessionMutations.current) {
      const active = sessionMutations.get(name);
      active?.delete(pending);
      if (active?.size === 0) sessionMutations.delete(name);
    }
    ownedSessionMutations.current.clear();
  }, []);
  const barrier = useCallback(() => sessionMutationBarrier(mapName), [mapName]);
  // A seed change resets the view. GBA's useMapLayout keeps the previous map data until B's fetch lands, so a
  // paint in that window is shown then wiped when B's seed arrives while the server session stays dirty: a
  // pre-existing gap, kept as before Plan 8.
  const live = stored !== null && stored.forMap === mapName && stored.seed === seed ? stored : null;

  const post = useCallback(<R,>(path: string, body?: unknown): Promise<{ data: R; ticket: EditTicket } | null> => {
    if (mapName === null) return Promise.resolve(null);
    const owner = visitRef.current;
    const run = async () => {
      if (path === "/undo" || path === "/redo") await barrier();
      if (!owner.isCurrent()) return null;
      const ticket: EditTicket = { map: mapName, seed, seq: ++seq.current.issued, isCurrent: owner.isCurrent };
      try {
        const generation = tilesetGeneration();
        const r = await fetch(`${base}/${encodeURIComponent(mapName)}${path}`, body === undefined ? { method: "POST" } : { method: "POST", body: JSON.stringify(body) });
        // Legacy callers can opt out of body reads on errors; session mutations, block reads and redo always need refusal codes.
        const structured = readServerError || path === "/event/create" || path === "/redo"
          || path === "/block/apply" || path === "/block/check" || path === "/block/preview";
        const data: unknown = structured ? await r.json().catch(() => null) : r.ok ? await r.json() : undefined;
        if (!r.ok) {
          const error = data as { error?: unknown; code?: unknown } | null;
          throw new EditSessionError(typeof error?.error === "string" ? error.error : `POST ${base}/${mapName}${path} -> ${r.status}`,
            typeof error?.code === "string" ? error.code : undefined, !owner.isCurrent());
        }
        noteTilesetVersion((data as { tilesetVersion?: unknown } | null)?.tilesetVersion, generation);
        if (owner.isCurrent() && (path === "/undo" || path === "/redo" || path === "/event/create")) invalidateEventOptions();
        return { data: data as R, ticket };
      } catch (error) {
        if (error instanceof EditSessionError) throw error;
        throw new EditSessionError(error instanceof Error ? error.message : String(error), undefined, !owner.isCurrent());
      }
    };
    const pending = run();
    if (path === "/event/create" || path === "/block/apply") {
      const active = sessionMutations.get(mapName) ?? new Set<Promise<unknown>>();
      sessionMutations.set(mapName, active);
      active.add(pending);
      ownedSessionMutations.current.set(pending, mapName);
      const settled = () => { ownedSessionMutations.current.delete(pending); active.delete(pending); if (active.size === 0 && sessionMutations.get(mapName) === active) sessionMutations.delete(mapName); };
      void pending.then(settled, settled);
    }
    return pending;
  }, [base, mapName, seed, readServerError, barrier]);

  const apply = useCallback((update: EditUpdate<State>, ticket?: EditTicket): boolean => {
    const current = latest.current;
    if (ticket) {
      if (ticket.isCurrent?.() === false || current.mapName !== ticket.map || current.seed !== ticket.seed || ticket.seq <= seq.current.applied) return false;
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
    const owner = visitRef.current;
    await barrier();
    if (!owner.isCurrent()) return;
    const generation = tilesetGeneration();
    const r = await fetch(`${base}/${encodeURIComponent(mapName)}/discard`, { method: "POST" });
    if (!r.ok) throw new Error(`POST ${base}/${mapName}/discard -> ${r.status}`);
    // A 2xx whose body is not JSON still ran the discard server-side; reset locally and note a version only if it is a number.
    const data: unknown = await r.json().catch(() => null);
    noteTilesetVersion((data as { tilesetVersion?: unknown } | null)?.tilesetVersion, generation);
    if (!owner.isCurrent()) return;
    invalidateEventOptions();
    seq.current.applied = seq.current.issued; // in-flight edits cannot resurrect a discarded session
    setStored((prev) => (prev?.forMap === mapName ? null : prev)); // a switch during the await keeps the new map's record
  }, [base, mapName, barrier]);

  const markClean = useCallback(() => {
    invalidateEventOptions();
    setStored((prev) => prev === null ? prev : { ...prev, isDirty: false, canUndo: false, canRedo: false });
  }, []);

  return { state: live ? live.state : seed, isDirty: live?.isDirty ?? false, canUndo: live?.canUndo ?? false, canRedo: live?.canRedo ?? false, post, apply, barrier, discard, markClean };
}
