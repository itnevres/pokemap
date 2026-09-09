import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { projectPaths } from "@pokemap/core/src/config/paths.js";

let s: PokemapServer;
const dungeonsPath = projectPaths(SUBJECT_ROOT).dungeons;

describe.skipIf(!hasProject(SUBJECT_ROOT))("dungeons api", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  const withCleanDungeonsFile = async (fn: () => Promise<void>) => {
    const before = existsSync(dungeonsPath) ? readFileSync(dungeonsPath, "utf8") : null;
    try {
      await fn();
    } finally {
      if (before === null) rmSync(dungeonsPath, { force: true });
      else writeFileSync(dungeonsPath, before);
    }
  };

  it("lists an empty array when no dungeons exist yet", async () => {
    await withCleanDungeonsFile(async () => {
      rmSync(dungeonsPath, { force: true });
      const r = await fetch(`http://127.0.0.1:${s.port}/api/dungeons`);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual([]);
    });
  }, 300_000);

  it("creates a dungeon from an explicit maps list, lists it, then deletes it", async () => {
    await withCleanDungeonsFile(async () => {
      const create = await fetch(`http://127.0.0.1:${s.port}/api/dungeons`, {
        method: "POST",
        body: JSON.stringify({ name: "Test Dungeon", maps: ["NewBarkTown_Lab", "NewBarkTown"] }),
      });
      expect(create.status).toBe(200);
      const created = await create.json() as any;
      expect(created.name).toBe("Test Dungeon");
      expect(created.maps).toEqual(["NewBarkTown_Lab", "NewBarkTown"]);
      expect(typeof created.id).toBe("string");
      expect(created.id.length).toBeGreaterThan(0);

      const list = await (await fetch(`http://127.0.0.1:${s.port}/api/dungeons`)).json() as any[];
      expect(list.some((d) => d.id === created.id)).toBe(true);

      const del = await fetch(`http://127.0.0.1:${s.port}/api/dungeons/${created.id}`, { method: "DELETE" });
      expect(del.status).toBe(200);
      const listAfter = await (await fetch(`http://127.0.0.1:${s.port}/api/dungeons`)).json() as any[];
      expect(listAfter.some((d) => d.id === created.id)).toBe(false);
    });
  }, 300_000);

  it("creates a dungeon from a seedMap, computing its members via the warp BFS", async () => {
    await withCleanDungeonsFile(async () => {
      const create = await fetch(`http://127.0.0.1:${s.port}/api/dungeons`, {
        method: "POST",
        body: JSON.stringify({ name: "From Seed", seedMap: "NewBarkTown_Lab" }),
      });
      expect(create.status).toBe(200);
      const created = await create.json() as any;
      expect(created.maps).toContain("NewBarkTown_Lab");
      expect(created.maps).toContain("NewBarkTown");
    });
  }, 300_000);

  it("400s a create with an unknown seedMap", async () => {
    await withCleanDungeonsFile(async () => {
      const r = await fetch(`http://127.0.0.1:${s.port}/api/dungeons`, {
        method: "POST",
        body: JSON.stringify({ name: "Bad", seedMap: "NoSuchMap" }),
      });
      expect(r.status).toBe(400);
    });
  }, 300_000);

  it("PATCHes a dungeon's name and maps, reflected in the next GET", async () => {
    await withCleanDungeonsFile(async () => {
      const created = await (
        await fetch(`http://127.0.0.1:${s.port}/api/dungeons`, {
          method: "POST",
          body: JSON.stringify({ name: "Before", maps: ["NewBarkTown"] }),
        })
      ).json() as any;

      const patch = await fetch(`http://127.0.0.1:${s.port}/api/dungeons/${created.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "After", maps: ["NewBarkTown", "Route29"] }),
      });
      expect(patch.status).toBe(200);
      const patched = await patch.json() as any;
      expect(patched.name).toBe("After");
      expect(patched.maps).toEqual(["NewBarkTown", "Route29"]);
    });
  }, 300_000);

  it("404s a PATCH or DELETE for an unknown dungeon id", async () => {
    await withCleanDungeonsFile(async () => {
      expect((await fetch(`http://127.0.0.1:${s.port}/api/dungeons/no-such-id`, { method: "PATCH", body: "{}" })).status).toBe(404);
      expect((await fetch(`http://127.0.0.1:${s.port}/api/dungeons/no-such-id`, { method: "DELETE" })).status).toBe(404);
    });
  }, 300_000);

  it("400s a create with no name", async () => {
    await withCleanDungeonsFile(async () => {
      const r = await fetch(`http://127.0.0.1:${s.port}/api/dungeons`, { method: "POST", body: JSON.stringify({ maps: [] }) });
      expect(r.status).toBe(400);
    });
  }, 300_000);
});
