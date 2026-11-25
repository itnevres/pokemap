import { useCallback, useEffect, useRef, useState } from "react";
import type { MapData } from "@pokemap/core/load/maps";
import type { BrokenPath, Layout, Split } from "@pokemap/core/model/types";
import type { DataDefect } from "@pokemap/core/defects/types";
import { noteTilesetStamp, tilesetGeneration } from "../shared/tilesetVersion.js";
import { keepUnchanged } from "../shared/keepUnchanged.js";
import { errorMessage } from "@pokemap/core/errorMessage";

/** A 409 `broken-path` reply from `/api/map/:name`: the map cannot be opened until its
 *  out-of-project path is fixed (D25). Carries the defect so the shell can render it. */
export class BrokenPathError extends Error {
  constructor(readonly defect: BrokenPath) {
    super(defect.message);
    this.name = "BrokenPathError";
  }
}

/** A `BrokenPath` from a 409 reply, as the `DataDefect` `DefectsBanner` renders. The `file`
 *  carries its 1-based line when known, matching the banner's other defect sources. */
export function brokenPathToDefect(bp: BrokenPath): DataDefect {
  return { file: bp.line ? `${bp.file}:${bp.line}` : bp.file, message: bp.message, kind: "build", fix: bp.fix };
}

/** Mirrors `packages/core/src/model/types.ts`'s `Block`, plus the resolved
 *  tile behaviour the server computes per block (see `/api/map/:name`). */
export interface MapBlock {
  metatileId: number;
  collision: number;
  elevation: number;
  behavior: number;
}

export interface MapLayoutData {
  map: MapData;
  layout: Layout;
  split: Split;
  blocks: MapBlock[];
  primaryCount: number;
  secondaryCount: number;
  /** The hub's current tileset version at the time of this reply (Task 10b). */
  tilesetVersion?: number;
  tilesetInstance?: string;
}

export interface UseMapLayoutResult {
  data: MapLayoutData | null;
  error: string | null;
  /** The broken-path defect from a 409 reply (the map cannot open until it is fixed), or null. */
  brokenPath: BrokenPath | null;
  loading: boolean;
  /** Plan H Q7: re-reads `/api/map/:name` in place, the way `useGbcMap.reload` does -- it never nulls
   *  `data` and never flips `loading`, so the canvas keeps its zoom/pan/tool through the refresh. A reply
   *  for a map that is no longer selected, or that lands after unmount, is dropped. Rejects on a failed
   *  fetch (the caller decides how to surface it); a failure leaves `data` exactly as it was. */
  reload(): Promise<void>;
}

/**
 * Fetches `/api/map/:name` -- header, layout, split and the raw block grid
 * MapCanvas needs for collision/elevation overlays and the hover status
 * strip, all off one payload rather than a round trip per hover.
 *
 * `name === null` (nothing selected yet) fetches nothing and returns null,
 * rather than the component having to guard every render on `selected`.
 */
export function useMapLayout(name: string | null): UseMapLayoutResult {
  const [data, setData] = useState<MapLayoutData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brokenPath, setBrokenPath] = useState<BrokenPath | null>(null);
  const [loading, setLoading] = useState(false);
  // Q7: `reload` needs to know, when its reply lands, whether the map it started for is still the
  // selected one and whether this hook is still mounted -- without re-running the load effect below.
  // `epoch` also retires a reload reply once a NEWER load (a name change, including A -> B -> A) has
  // started, the same "a reload's result never shadows a newer fetch" rule `useGbcMap` keeps with
  // `forBase`.
  const selected = useRef(name);
  const epoch = useRef(0);
  const reloadSeq = useRef(0);
  const loadingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Deliberately does NOT stamp: a cancelled/superseded reply must never reach the store (the
  // "does not announce a cancelled map response" rule). Each caller stamps its reply once it has
  // won the cancellation/epoch guard, with the generation captured when its fetch started.
  const fetchLayout = useCallback((target: string) => {
    return fetch(`/api/map/${encodeURIComponent(target)}`)
      .then(async (r) => {
        if (r.ok) return r.json() as Promise<MapLayoutData>;
        // A 409 broken-path reply carries the defect that blocks the map; surface it as a
        // typed error so the shell can show the fix instead of the bare status. Anything
        // else (other status, non-JSON body, other code) keeps the old bare error.
        try {
          const body = await r.json();
          if (body && typeof body === "object" && body.code === "broken-path" && body.defect && typeof body.defect === "object"
            && typeof body.defect.file === "string" && typeof body.defect.message === "string" && typeof body.defect.fix === "string") {
            throw new BrokenPathError(body.defect as BrokenPath);
          }
        } catch (e) {
          if (e instanceof BrokenPathError) throw e;
          // Non-JSON body (or a JSON parse failure): fall through to the old error.
        }
        throw new Error(`GET /api/map/${target} -> ${r.status}`);
      });
  }, []);

  useEffect(() => {
    // Any load retires a reload that is still in flight for an older selection.
    const mine = ++epoch.current;
    selected.current = name;
    if (!name) {
      loadingRef.current = false;
      setData(null);
      setError(null);
      setBrokenPath(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    setBrokenPath(null);
    const generation = tilesetGeneration();

    fetchLayout(name)
      .then((d) => {
        if (!cancelled && epoch.current === mine) {
          noteTilesetStamp(d, generation);
          setData(d);
          setBrokenPath(null);
          loadingRef.current = false;
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled && epoch.current === mine) {
          setError(errorMessage(e));
          setBrokenPath(e instanceof BrokenPathError ? e.defect : null);
          loadingRef.current = false;
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [name, fetchLayout]);

  const reload = useCallback(async () => {
    const target = selected.current;
    // Nothing selected, or the first load is still in flight (it reads the current state itself).
    if (!target || loadingRef.current) return;
    const mine = epoch.current;
    const seq = ++reloadSeq.current;
    const generation = tilesetGeneration();
    const d = await fetchLayout(target);
    // Last-STARTED wins: a slower older reload must not overwrite a newer one's payload.
    if (!mounted.current || epoch.current !== mine || selected.current !== target || reloadSeq.current !== seq) return;
    noteTilesetStamp(d, generation);
    // A reload that changed only counts keeps the blocks/map identities: they seed the edit session, and a
    // new seed would hide a dirty session's view until its next read.
    setData((prev) => keepUnchanged(prev, d, ["blocks", "map"]));
    setError(null);
  }, [fetchLayout]);

  return { data, error, brokenPath, loading, reload };
}
