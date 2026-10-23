import type { GbcWorldPayload } from "@pokemap/core/src/gbc/wire.js";
import { isGbcWorldPayload } from "../guards.js";
import { useCallback, useEffect, useState } from "react";
import { fetchGuarded, type UseGuardedFetchResult } from "../../hooks/useGuardedFetch.js";

export interface UseGbcWorldResult extends UseGuardedFetchResult<GbcWorldPayload> {
  /** Refetches in place: the current `data` stays until the new answer lands. */
  reload(): void;
}

/**
 * Fetches `/api/world` once for the GBC world view -- built on the same
 * shared `useGuardedFetch` every other GBC hook uses (Task 3's own
 * convention). Unlike `useGbcMap`, the URL never changes (there is only ever
 * the one world), so this is the simplest possible `useGuardedFetch` caller:
 * a fixed URL and a guard, giving a real, visible `error` string on a 404,
 * a network failure, or a shape that fails `isGbcWorldPayload` -- never a
 * silently-empty world.
 */
export function useGbcWorld(enabled: boolean = true): UseGbcWorldResult {
  const [data, setData] = useState<GbcWorldPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gen, setGen] = useState(0);
  const reload = useCallback(() => setGen((g) => g + 1), []);
  useEffect(() => {
    if (!enabled) { setData(null); setError(null); return; }
    let cancelled = false;
    fetchGuarded("/api/world", isGbcWorldPayload)
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [enabled, gen]);
  return { data, error, reload };
}
