import { useEffect, useState } from "react";
import type { DataDefect } from "@pokemap/core/src/defects/types.js";

export function useMapDefects(mapName: string | null, saveToken: number): DataDefect[] {
  const [result, setResult] = useState<{ mapName: string; saveToken: number; defects: DataDefect[] } | null>(null);
  useEffect(() => {
    if (mapName === null) return;
    let cancelled = false;
    fetch(`/api/defects/${encodeURIComponent(mapName)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/defects/${mapName} -> ${r.status}`);
        return r.json() as Promise<{ defects: DataDefect[] }>;
      })
      .then(({ defects }) => { if (!cancelled) setResult({ mapName, saveToken, defects }); })
      .catch((e: unknown) => {
        if (!cancelled) {
          console.error("Could not check map defects", e);
          setResult({ mapName, saveToken, defects: [] });
        }
      });
    return () => { cancelled = true; };
  }, [mapName, saveToken]);
  return result?.mapName === mapName && result.saveToken === saveToken ? result.defects : [];
}
