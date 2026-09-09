import { useEffect, useState } from "react";

export interface MapVisibilityInfo {
  mapType: string;
  manual: boolean;
}

export interface UseWorldVisibilityResult {
  /** Every map with a real placement, keyed by name. A name absent here
   *  has NO placement at all -- see visibility.ts's own isDrawnByDefault
   *  and the sidebar grey-out (a later task) for how the two cases combine
   *  into one "greyed" state. Null while loading or disabled. */
  placed: Map<string, MapVisibilityInfo> | null;
  error: string | null;
}

/**
 * Feeds the sidebar's World-mode grey-out (dungeon-mode-and-warp-tools
 * spec §3.3) -- independent of WorldCanvas's own /api/world fetch by
 * design, the same "each component fetches what it needs, the server
 * caches the expensive part" split SpeciesSpotlight's own /api/species
 * fetch already established. `enabled` gates the fetch so Map mode never
 * pays for 1,209 placements it has no use for.
 */
export function useWorldVisibility(enabled: boolean): UseWorldVisibilityResult {
  const [placed, setPlaced] = useState<Map<string, MapVisibilityInfo> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPlaced(null);
      setError(null);
      return;
    }
    let cancelled = false;
    fetch("/api/world")
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/world -> ${r.status}`);
        return r.json() as Promise<{ placements: Record<string, { mapType: string; manual: boolean }> }>;
      })
      .then((d) => {
        if (cancelled) return;
        const out = new Map<string, MapVisibilityInfo>();
        for (const [name, p] of Object.entries(d.placements)) out.set(name, { mapType: p.mapType, manual: p.manual });
        setPlaced(out);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { placed, error };
}
