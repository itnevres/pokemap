import { unguarded, useGuardedFetch } from "./useGuardedFetch.js";
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

/** Wraps useGuardedFetch without a shape guard for /api/coverage. */
export function useCoverage(): UseCoverageResult {
  return useGuardedFetch<CoverageResponse>("/api/coverage", unguarded);
}
