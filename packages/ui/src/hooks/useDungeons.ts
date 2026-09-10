import { useCallback, useEffect, useState } from "react";

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

/**
 * Feature C's dungeon CRUD (the server's own /api/dungeons routes), gated
 * by `enabled` the same way useWorldVisibility is -- Dungeon mode is the
 * only consumer, and Map/World mode should never pay for this fetch.
 */
export function useDungeons(enabled: boolean): UseDungeonsResult {
  const [data, setData] = useState<Dungeon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gen, setGen] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    fetch("/api/dungeons")
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/dungeons -> ${r.status}`);
        return r.json() as Promise<Dungeon[]>;
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
  }, [enabled, gen]);

  const reload = useCallback(() => setGen((g) => g + 1), []);

  const create = useCallback(
    async (input: { name: string; seedMap?: string; maps?: string[] }): Promise<Dungeon> => {
      const r = await fetch("/api/dungeons", { method: "POST", body: JSON.stringify(input) });
      if (!r.ok) throw new Error(`POST /api/dungeons -> ${r.status}`);
      const dungeon = (await r.json()) as Dungeon;
      reload();
      return dungeon;
    },
    [reload],
  );

  const rename = useCallback(
    async (id: string, name: string): Promise<Dungeon> => {
      const r = await fetch(`/api/dungeons/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ name }) });
      if (!r.ok) throw new Error(`PATCH /api/dungeons/${id} -> ${r.status}`);
      const dungeon = (await r.json()) as Dungeon;
      reload();
      return dungeon;
    },
    [reload],
  );

  const setMaps = useCallback(
    async (id: string, maps: string[]): Promise<Dungeon> => {
      const r = await fetch(`/api/dungeons/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ maps }) });
      if (!r.ok) throw new Error(`PATCH /api/dungeons/${id} -> ${r.status}`);
      const dungeon = (await r.json()) as Dungeon;
      reload();
      return dungeon;
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      const r = await fetch(`/api/dungeons/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`DELETE /api/dungeons/${id} -> ${r.status}`);
      reload();
    },
    [reload],
  );

  return { data, error, create, rename, setMaps, remove };
}
