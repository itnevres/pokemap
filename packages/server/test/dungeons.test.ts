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
      // Proves the response really is sorted, not just non-empty/containing
      // the right names.
      expect(created.maps).toEqual([...created.maps].sort());
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

  it("400s a PATCH with an empty/whitespace-only name, without persisting it", async () => {
    await withCleanDungeonsFile(async () => {
      const created = await (
        await fetch(`http://127.0.0.1:${s.port}/api/dungeons`, {
          method: "POST",
          body: JSON.stringify({ name: "Original", maps: ["NewBarkTown"] }),
        })
      ).json() as any;

      // PATCH's own name guard only checked TYPE, not emptiness, unlike
      // POST's `typeof parsed.name !== "string" || parsed.name.trim() === ""`
      // check -- so `{name: "   "}` used to 200 and persist a whitespace-only
      // name here even though POST correctly refuses the same value.
      const patch = await fetch(`http://127.0.0.1:${s.port}/api/dungeons/${created.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "   " }),
      });
      expect(patch.status).toBe(400);

      const list = await (await fetch(`http://127.0.0.1:${s.port}/api/dungeons`)).json() as any[];
      expect(list.find((d) => d.id === created.id)?.name).toBe("Original");
    });
  }, 300_000);

  it("PATCHes only the keys present in the body, leaving the others untouched", async () => {
    await withCleanDungeonsFile(async () => {
      const c = await (await fetch(`http://127.0.0.1:${s.port}/api/dungeons`, {
        method: "POST", body: JSON.stringify({ name: "Before", maps: ["NewBarkTown"] }),
      })).json() as any;
      // Task 12's useDungeons.rename sends { name } alone; setMaps sends
      // { maps } alone. A mutant that overwrites both fields
      // unconditionally passes every other test in this file, and would
      // silently wipe the user's own curated map list.
      const named = await (await fetch(`http://127.0.0.1:${s.port}/api/dungeons/${c.id}`, {
        method: "PATCH", body: JSON.stringify({ name: "After" }),
      })).json() as any;
      expect(named).toEqual({ id: c.id, name: "After", maps: ["NewBarkTown"] });
      const mapped = await (await fetch(`http://127.0.0.1:${s.port}/api/dungeons/${c.id}`, {
        method: "PATCH", body: JSON.stringify({ maps: ["Route29"] }),
      })).json() as any;
      expect(mapped).toEqual({ id: c.id, name: "After", maps: ["Route29"] });
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

  it("400s a malformed dungeon-create body instead of hanging the request", async () => {
    // readBody(req).then(...) runs after this route's try/catch has already
    // returned, so a throw inside it (bad JSON here) becomes an unhandled
    // promise rejection -- and an unanswered request -- unless the route's
    // own .catch() turns it into a response. This proves the request
    // actually completes, not just that it eventually would.
    await withCleanDungeonsFile(async () => {
      const r = await fetch(`http://127.0.0.1:${s.port}/api/dungeons`, {
        method: "POST",
        body: "not json",
      });
      expect(r.status).toBe(400);
    });
  }, 300_000);

  it("400s a malformed dungeon-patch body instead of hanging the request", async () => {
    // Same "runs after the try/catch has returned" reasoning as the create
    // test just above, for the PATCH route's own readBody(req).then(...).
    await withCleanDungeonsFile(async () => {
      const created = await (
        await fetch(`http://127.0.0.1:${s.port}/api/dungeons`, {
          method: "POST",
          body: JSON.stringify({ name: "Malformed Patch Target", maps: [] }),
        })
      ).json() as any;

      const r = await fetch(`http://127.0.0.1:${s.port}/api/dungeons/${created.id}`, {
        method: "PATCH",
        body: "not json",
      });
      expect(r.status).toBe(400);
    });
  }, 300_000);
});
