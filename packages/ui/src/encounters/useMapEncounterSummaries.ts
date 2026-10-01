import { useEffect, useRef, useState } from "react";
import { fetchGuarded } from "../hooks/useGuardedFetch.js";
import { isGbcEncountersPayload } from "../gbc/guards.js";
import { isGbaEncountersPayload } from "./guards.js";
import { summariseGba, summariseGbc, type SpeciesSummary } from "./summary.js";

/** `undefined` = the placeholder written before the fetch (in flight), `{ error }` = failed (not retried). */
type Cached = SpeciesSummary[] | { error: string } | undefined;

/**
 * One map's encounter summaries for a single-map canvas (Plan 6c B4). Fetches
 * `/api/encounters/:map` only once `enabled` is true, at most once per map per
 * hook instance: a placeholder goes into the cache synchronously, before the
 * fetch, so a re-render, StrictMode's double effect or a re-toggle never
 * fetches twice. The cache is per instance, never module-level: a project
 * switch remounts the app, and a module cache would serve the old project's
 * data. Time-independent (GBC dimming happens in `EncounterBorder`), so a time
 * change never refetches. `summaries` is always read for the CURRENT
 * `mapName`: a late response for a map the user has left is cached, nothing more.
 */
export function useMapEncounterSummaries(
  mapName: string,
  family: "gba" | "gbc",
  enabled: boolean,
): { summaries: SpeciesSummary[] | undefined; error: string | null } {
  const cacheRef = useRef(new Map<string, Cached>());
  const [, setVersion] = useState(0);

  useEffect(() => {
    const cache = cacheRef.current;
    if (!enabled || cache.has(mapName)) return;
    cache.set(mapName, undefined);
    const url = `/api/encounters/${encodeURIComponent(mapName)}`;
    const request =
      family === "gba"
        ? fetchGuarded(url, isGbaEncountersPayload, url).then((d) => summariseGba(d.methods))
        : fetchGuarded(url, isGbcEncountersPayload, url).then((d) => summariseGbc(d.sources));
    request
      .then((s) => cache.set(mapName, s))
      .catch((e: unknown) => cache.set(mapName, { error: e instanceof Error ? e.message : String(e) }))
      .then(() => setVersion((v) => v + 1));
  }, [mapName, family, enabled]);

  const cached = cacheRef.current.get(mapName);
  if (cached === undefined) return { summaries: undefined, error: null };
  return Array.isArray(cached) ? { summaries: cached, error: null } : { summaries: undefined, error: cached.error };
}
