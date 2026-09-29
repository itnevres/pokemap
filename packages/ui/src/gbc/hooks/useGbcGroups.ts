import type { MapGroupsData } from "../../components/MapTree.js";
import { isMapGroupsData } from "../guards.js";
import { useGuardedFetch, type UseGuardedFetchResult } from "../../hooks/useGuardedFetch.js";

export type UseGbcGroupsResult = UseGuardedFetchResult<MapGroupsData>;

/**
 * `GET /api/groups` for the GBC shell -- built on the same shared
 * `useGuardedFetch` `useProjectInfo` uses (see that hook's own doc comment
 * for why the shared helper lives under the family-agnostic `src/hooks/`
 * rather than here under `src/gbc/`). GBC-specific hooks (this one, and
 * Task 4-6's `useGbcMap`/`useGbcWorld`/`useGbcCoverage`) live under
 * `src/gbc/hooks/`; family-agnostic ones (`useProjectInfo`) stay in
 * `src/hooks/`, matching `useMapGroups.ts`'s own location.
 */
export function useGbcGroups(): UseGbcGroupsResult {
  return useGuardedFetch("/api/groups", isMapGroupsData);
}
