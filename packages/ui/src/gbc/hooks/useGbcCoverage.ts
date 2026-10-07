import type { GbcCoverage } from "@pokemap/core/src/gbc/analyse/atlas.js";
import { isGbcCoveragePayload } from "../guards.js";
import { useGuardedFetch, type UseGuardedFetchResult } from "../../hooks/useGuardedFetch.js";

export type UseGbcCoverageResult = UseGuardedFetchResult<GbcCoverage>;

/**
 * `GET /api/coverage` for `GbcWorldCanvas`'s own level-curve/empty-maps
 * lenses and `LensLegend`'s own summary counts and lists (Plan 6b Task 6) -- the
 * simplest possible `useGuardedFetch` caller, mirroring `useGbcWorld`
 * exactly: a fixed URL (there is only ever the one coverage report) and a
 * guard, giving a real, visible `error` string on a 404, a network failure,
 * or a shape that fails `isGbcCoveragePayload` -- never a silent `?? 0`
 * papering over a failed fetch (the exact bug `WorldCanvas.tsx`'s own
 * `coverageError` review-fix comment documents for the GBA lens panel).
 */
export function useGbcCoverage(): UseGbcCoverageResult {
  return useGuardedFetch("/api/coverage", isGbcCoveragePayload);
}
