import { useEffect, useState } from "react";
import type { Coverage } from "@pokemap/core/src/analyse/coverage.js";

/**
 * The server's own `/api/coverage` response: `coverage(project)`'s own
 * shape, with each `levelByMap` entry ALSO carrying the map's display
 * name. The level-curve lens paints by placement, and the world view's
 * placements are keyed by map NAME, not mapId (see
 * packages/core/src/world/connections.ts's own `Placement.map`), while
 * `coverage()`'s own `levelByMap` is keyed by mapId only (see
 * coverage.ts's doc comment on `Coverage.levelByMap`). Rather than
 * changing `coverage()`'s own tested core shape for a UI-only need, the
 * server route enriches its wire response with the same `idToName` lookup
 * `whereSpecies` already builds for exactly this reason -- see
 * packages/server/src/index.ts's `/api/coverage` handler.
 */
export interface CoverageResponse extends Coverage {
  levelByMap: Array<Coverage["levelByMap"][number] & { mapName?: string }>;
}

export interface UseCoverageResult {
  data: CoverageResponse | null;
  error: string | null;
}

/**
 * Fetches `/api/coverage` once. The server itself caches `coverage(project)`
 * -- it walks all 497 tables (Task 29 Step 3) -- so this hook only needs
 * the usual "fetch once per mount" shape every other single-resource hook
 * in this package already uses (mirrors useMapGroups.ts almost exactly).
 */
export function useCoverage(): UseCoverageResult {
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coverage")
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/coverage -> ${r.status}`);
        return r.json() as Promise<CoverageResponse>;
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
