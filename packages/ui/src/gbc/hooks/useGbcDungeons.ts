import { useCallback, useEffect, useState } from "react";
import type { Dungeon, UseDungeonsResult } from "../../hooks/useDungeons.js";
import { fetchGuarded } from "../../hooks/useGuardedFetch.js";
import { isRecord } from "../guards.js";

function isDungeon(x: unknown): x is Dungeon {
  return isRecord(x) && typeof x.id === "string" && typeof x.name === "string"
    && Array.isArray(x.maps) && x.maps.every((m: unknown) => typeof m === "string");
}

function isDungeons(x: unknown): x is Dungeon[] {
  return Array.isArray(x) && x.every(isDungeon);
}

function isDeleted(x: unknown): x is { ok: true } {
  return isRecord(x) && x.ok === true;
}

export function useGbcDungeons(enabled: boolean): UseDungeonsResult {
  const [data, setData] = useState<Dungeon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (!enabled) { setData(null); setError(null); return; }
    let cancelled = false;
    setError(null);
    fetchGuarded("/api/dungeons", isDungeons).then((result) => {
      if (!cancelled) setData(result);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { cancelled = true; };
  }, [enabled, generation]);

  const reload = useCallback(() => setGeneration((n) => n + 1), []);
  const create = useCallback(async (input: { name: string; seedMap?: string; maps?: string[] }) => {
    const result = await fetchGuarded("/api/dungeons", isDungeon, undefined, { method: "POST", body: JSON.stringify(input) });
    reload();
    return result;
  }, [reload]);
  const patch = useCallback(async (id: string, body: { name?: string; maps?: string[] }) => {
    const result = await fetchGuarded(`/api/dungeons/${encodeURIComponent(id)}`, isDungeon, undefined, { method: "PATCH", body: JSON.stringify(body) });
    reload();
    return result;
  }, [reload]);
  const rename = useCallback((id: string, name: string) => patch(id, { name }), [patch]);
  const setMaps = useCallback((id: string, maps: string[]) => patch(id, { maps }), [patch]);
  const remove = useCallback(async (id: string) => {
    await fetchGuarded(`/api/dungeons/${encodeURIComponent(id)}`, isDeleted, undefined, { method: "DELETE" });
    reload();
  }, [reload]);
  return { data, error, create, rename, setMaps, remove };
}
