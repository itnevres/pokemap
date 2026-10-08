import { useCallback, useState } from "react";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import { isGbcMapPayload } from "../guards.js";
import { fetchGuarded, useGuardedFetch, type UseGuardedFetchResult } from "../../hooks/useGuardedFetch.js";

export interface UseGbcMapResult extends UseGuardedFetchResult<GbcMapPayload> {
  /** Plan 7 Task 5: re-reads the payload in place (after a save committed). Unlike a URL change this never
   *  nulls `data`, so the canvas keeps its zoom/pan/tool through the refresh. Rejects on a failed fetch. */
  reload(): Promise<void>;
}

/**
 * Fetches `/api/map/:name` for the GBC map view -- built on the same shared
 * `useGuardedFetch` `useGbcGroups`/`Root.tsx`'s own `/api/hub` fetch use
 * (Task 3's own convention: every fetch goes through it, never a
 * hand-rolled fetch+guard+error block). `name === null` (nothing selected yet, mirroring
 * `useMapLayout.ts`'s own shape) fetches nothing and idles at
 * `{ data: null, error: null }` -- `useGuardedFetch`'s own `url === null`
 * branch (added by this task) is what makes that possible without this hook
 * reimplementing its own cancelled-guard/fetch/catch chain.
 *
 * `reload` keeps its result next to the base fetch it refreshed (`forBase`): a later base fetch (a map switch
 * and back) produces a new `data` object, which silently retires the reloaded copy, so a stale reload can
 * never shadow a newer fetch.
 */
export function useGbcMap(name: string | null): UseGbcMapResult {
  const url = name === null ? null : `/api/map/${encodeURIComponent(name)}`;
  const label = name === null ? undefined : `/api/map/${name}`;
  const base = useGuardedFetch(url, isGbcMapPayload, label);
  const [fresh, setFresh] = useState<{ url: string; forBase: GbcMapPayload; data: GbcMapPayload } | null>(null);
  const baseData = base.data;
  const reload = useCallback(async () => {
    if (url === null || baseData === null) return;
    const data = await fetchGuarded(url, isGbcMapPayload, label);
    setFresh({ url, forBase: baseData, data });
  }, [url, label, baseData]);
  const data = fresh && fresh.url === url && fresh.forBase === baseData ? fresh.data : baseData;
  return { data, error: base.error, reload };
}
