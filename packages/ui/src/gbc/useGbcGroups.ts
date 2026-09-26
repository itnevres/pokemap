import { useEffect, useState } from "react";
import type { MapGroupsData } from "../components/MapTree.js";
import { isMapGroupsData } from "./guards.js";

export interface UseGbcGroupsResult {
  data: MapGroupsData | null;
  error: string | null;
}

/** Truncates a received-value fragment to 200 characters, matching
 *  `useProjectInfo.ts`'s own convention. */
function describeReceived(x: unknown): string {
  let s: string;
  try {
    s = JSON.stringify(x);
  } catch {
    s = String(x);
  }
  return s.length > 200 ? s.slice(0, 200) : s;
}

/**
 * `GET /api/groups` for the GBC shell -- same pattern as `useProjectInfo`
 * (and the GBA `useMapGroups` it mirrors): a `cancelled` guard, and every
 * failure mode (non-OK status, thrown fetch, bad shape) sets a real,
 * visible `error` message rather than a silent `.catch`.
 */
export function useGbcGroups(): UseGbcGroupsResult {
  const [data, setData] = useState<MapGroupsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/groups")
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/groups -> ${r.status}`);
        return r.json() as Promise<unknown>;
      })
      .then((d) => {
        if (cancelled) return;
        if (!isMapGroupsData(d)) {
          throw new Error(`GET /api/groups returned an unexpected shape: ${describeReceived(d)}`);
        }
        setData(d);
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
