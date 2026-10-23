import { useEffect, useState } from "react";
import type { MapDefectsCheck } from "@pokemap/core/src/defects/types.js";

interface MapDefectsResult extends MapDefectsCheck { error: string | null }
const EMPTY: MapDefectsResult = { defects: [], incomplete: [], error: null };

export function useMapDefects(mapName: string | null, saveToken: number): MapDefectsResult {
  const [result, setResult] = useState<MapDefectsResult & { mapName: string; saveToken: number } | null>(null);
  useEffect(() => {
    if (mapName === null) return;
    let cancelled = false;
    fetch(`/api/defects/${encodeURIComponent(mapName)}`)
      .then(async (r) => {
        if (!r.ok) {
          let reason = `GET /api/defects/${mapName} -> ${r.status}`;
          try {
            const body: unknown = await r.json();
            if (body && typeof body === "object" && "error" in body && typeof body.error === "string") reason = body.error;
          } catch { /* Keep the HTTP status when the error body is not JSON. */ }
          throw new Error(reason);
        }
        return r.json() as Promise<MapDefectsCheck>;
      })
      .then(({ defects, incomplete }) => { if (!cancelled) setResult({ mapName, saveToken, defects, incomplete, error: null }); })
      .catch((e: unknown) => {
        if (!cancelled) {
          console.error("Could not check map defects", e);
          setResult({ mapName, saveToken, defects: [], incomplete: [], error: e instanceof Error ? e.message : String(e) });
        }
      });
    return () => { cancelled = true; };
  }, [mapName, saveToken]);
  return result?.mapName === mapName && result.saveToken === saveToken ? { defects: result.defects, incomplete: result.incomplete, error: result.error } : EMPTY;
}
