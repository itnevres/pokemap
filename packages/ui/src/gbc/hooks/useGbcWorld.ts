import type { GbcWorldPayload } from "@pokemap/core/src/gbc/wire.js";
import { isGbcWorldPayload } from "../guards.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGuarded, type UseGuardedFetchResult } from "../../hooks/useGuardedFetch.js";

export interface UseGbcWorldResult extends UseGuardedFetchResult<GbcWorldPayload> {
  /** The generation whose GET produced `data`; the first load is generation 0. */
  loadedGen: number;
  /** Refetches in place and returns the new generation synchronously; current `data` stays until success. */
  reload(): number;
}

/**
 * Fetches `/api/world` once for the GBC world view -- built on the same
 * shared `useGuardedFetch` every other GBC hook uses (Task 3's own
 * convention). Unlike `useGbcMap`, the URL never changes (there is only ever
 * the one world), reload generations identify which GET produced the data.
 * A fixed URL and a guard give a real, visible `error` string on a 404,
 * a network failure, or a shape that fails `isGbcWorldPayload` -- never a
 * silently-empty world.
 */
export function useGbcWorld(enabled: boolean = true, onIssue?: (gen: number) => void): UseGbcWorldResult {
  const [data, setData] = useState<GbcWorldPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gen, setGen] = useState(0);
  const [loadedGen, setLoadedGen] = useState(0);
  const generation = useRef(0);
  // Called as each GET is issued (Plan 11 F3: the canvas snapshots its placement ledger then); a ref so the effect never re-runs for a new callback.
  const onIssueRef = useRef(onIssue);
  onIssueRef.current = onIssue;
  const reload = useCallback(() => {
    const next = ++generation.current;
    setGen(next);
    return next;
  }, []);
  useEffect(() => {
    if (!enabled) { setData(null); setError(null); return; }
    let cancelled = false;
    onIssueRef.current?.(gen);
    fetchGuarded("/api/world", isGbcWorldPayload)
      .then((d) => { if (!cancelled) { setData(d); setLoadedGen(gen); setError(null); } })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [enabled, gen]);
  return { data, error, reload, loadedGen };
}
