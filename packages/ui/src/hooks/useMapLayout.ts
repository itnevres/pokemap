import { useEffect, useState } from "react";
import type { MapData } from "@pokemap/core/src/load/maps.js";
import type { Layout, Split } from "@pokemap/core/src/model/types.js";

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
}

export interface UseMapLayoutResult {
  data: MapLayoutData | null;
  error: string | null;
  loading: boolean;
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

  useEffect(() => {
    if (!name) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/map/${encodeURIComponent(name)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/map/${name} -> ${r.status}`);
        return r.json() as Promise<MapLayoutData>;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [name]);

  return { data, error, loading };
}
