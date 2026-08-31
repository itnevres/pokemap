import { useEffect, useState } from "react";
import type { MapGroupsData } from "../components/MapTree.js";

export interface UseMapGroupsResult {
  data: MapGroupsData | null;
  error: string | null;
}

/**
 * Extracted from App.tsx (Task 20 built it inline). Task 21 adds a second
 * fetch-and-error block for the selected map's layout (`useMapLayout`), and
 * two copy-pasted inline effects in one component is the thing not to build
 * -- so this one moved out first, unchanged in behaviour, to give both a
 * shared shape.
 */
export function useMapGroups(): UseMapGroupsResult {
  const [data, setData] = useState<MapGroupsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/groups")
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/groups -> ${r.status}`);
        return r.json() as Promise<MapGroupsData>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error };
}
