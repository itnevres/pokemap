import { useCallback, useEffect, useRef, useState } from "react";
import type { MapData } from "@pokemap/core/src/load/maps.js";
import type { Layout, Split } from "@pokemap/core/src/model/types.js";
import { noteTilesetStamp, tilesetGeneration } from "../shared/tilesetVersion.js";

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
  const [loading, setLoading] = useState(false);
  // Q7: `reload` needs to know, when its reply lands, whether the map it started for is still the
  // selected one and whether this hook is still mounted -- without re-running the load effect below.
  // `epoch` also retires a reload reply once a NEWER load (a name change, including A -> B -> A) has
  // started, the same "a reload's result never shadows a newer fetch" rule `useGbcMap` keeps with
  // `forBase`.
  const selected = useRef(name);
  selected.current = name;
  const epoch = useRef(0);
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
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/map/${target} -> ${r.status}`);
        return r.json() as Promise<MapLayoutData>;
      });
  }, []);

  useEffect(() => {
    // Any load retires a reload that is still in flight for an older selection.
    const mine = ++epoch.current;
    if (!name) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    const generation = tilesetGeneration();

    fetchLayout(name)
      .then((d) => {
        if (!cancelled && epoch.current === mine) {
          noteTilesetStamp(d, generation);
          setData(d);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled && epoch.current === mine) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [name, fetchLayout]);

  const reload = useCallback(async () => {
    const target = selected.current;
    if (target === null) return;
    const mine = epoch.current;
    const generation = tilesetGeneration();
    const d = await fetchLayout(target);
    if (!mounted.current || epoch.current !== mine || selected.current !== target) return;
    noteTilesetStamp(d, generation);
    setData(d);
    setError(null);
  }, [fetchLayout]);

  return { data, error, loading, reload };
}
