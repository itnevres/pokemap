import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import { isGbcMapPayload } from "../guards.js";
import { useGuardedFetch, type UseGuardedFetchResult } from "../../hooks/useGuardedFetch.js";

export type UseGbcMapResult = UseGuardedFetchResult<GbcMapPayload>;

/**
 * Fetches `/api/map/:name` for the GBC map view -- built on the same shared
 * `useGuardedFetch` `useGbcGroups`/`useProjectInfo` use (Task 3's own
 * convention: every fetch goes through it, never a hand-rolled fetch+guard+
 * error block). `name === null` (nothing selected yet, mirroring
 * `useMapLayout.ts`'s own shape) fetches nothing and idles at
 * `{ data: null, error: null }` -- `useGuardedFetch`'s own `url === null`
 * branch (added by this task) is what makes that possible without this hook
 * reimplementing its own cancelled-guard/fetch/catch chain.
 */
export function useGbcMap(name: string | null): UseGbcMapResult {
  const url = name === null ? null : `/api/map/${encodeURIComponent(name)}`;
  const label = name === null ? undefined : `/api/map/${name}`;
  return useGuardedFetch(url, isGbcMapPayload, label);
}
