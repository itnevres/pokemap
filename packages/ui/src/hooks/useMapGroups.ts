import { unguarded, useGuardedFetch } from "./useGuardedFetch.js";
import type { MapGroupsData } from "../components/MapTree.js";

export interface UseMapGroupsResult {
  data: MapGroupsData | null;
  error: string | null;
}

/** Wraps useGuardedFetch without a shape guard for /api/groups. */
export function useMapGroups(): UseMapGroupsResult {
  return useGuardedFetch<MapGroupsData>("/api/groups", unguarded);
}
