import { useCallback, useEffect, useState } from "react";
import { fetchGuarded, postJson, sendJson } from "./useGuardedFetch.js";
import { isRecord } from "../gbc/guards.js";

export interface Dungeon {
  id: string;
  name: string;
  maps: string[];
}

export interface UseDungeonsResult {
  data: Dungeon[] | null;
  error: string | null;
  create(input: { name: string; seedMap?: string; maps?: string[] }): Promise<Dungeon>;
  rename(id: string, name: string): Promise<Dungeon>;
  setMaps(id: string, maps: string[]): Promise<Dungeon>;
  remove(id: string): Promise<void>;
}

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

/**
 * Feature C's dungeon CRUD (the server's own /api/dungeons routes), gated
 * by `enabled` the same way useWorldVisibility is -- Dungeon mode is the
 * only consumer, and Map/World mode should never pay for this fetch.
 */
export function useDungeons(enabled: boolean): UseDungeonsResult {
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
    const result = await postJson("/api/dungeons", input, isDungeon);
    reload();
    return result;
  }, [reload]);
  const patch = useCallback(async (id: string, body: { name?: string; maps?: string[] }) => {
    const result = await sendJson("PATCH", `/api/dungeons/${encodeURIComponent(id)}`, body, isDungeon);
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
