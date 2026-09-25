import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { renderGbcMap, renderGbcMapMetatile } from "@pokemap/core/src/gbc/render/map.js";
import { encodePng } from "@pokemap/cli/src/png.js";
import { GBC_SUBJECT_ROOT, hasGbcProject } from "@pokemap/core/test/gbc/helpers/corpus.js";

let s: PokemapServer;
const get = async (path: string) => fetch(`http://127.0.0.1:${s.port}${path}`);
const post = async (path: string, body: unknown = {}) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", body: JSON.stringify(body) });
const patch = async (path: string, body: unknown = {}) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { method: "PATCH", body: JSON.stringify(body) });

// Same "hooks live INSIDE the describe" reasoning as api.test.ts's own
// GBA suite (see that file's comment, packages/server/test/api.test.ts:10-17):
// createServer opens the real project, so a hoisted beforeAll would run even
// under a skipped describe.
describe.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT))("gbcRoutes", () => {
  beforeAll(async () => { s = await createServer({ projectPath: GBC_SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  it("GET /api/project reports the gbc family and the project's own root", async () => {
    const expectedRoot = openGbcProject(GBC_SUBJECT_ROOT).root; // computed independently of the server's own instance
    const r = await get("/api/project");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ family: "gbc", root: expectedRoot });
  });

  it("createServer against a gbc root returns family: \"gbc\" on the PokemapServer itself", () => {
    expect(s.family).toBe("gbc");
  });

  // Spec review finding 5: GBC_SUBJECT_ROOT itself has no trailing slash, so
  // every other test above can't tell `proj.root` (normalised) from
  // `opts.projectPath` (raw) -- a route that answered with the raw input
  // would still pass them. A second server, opened with a trailing slash
  // appended, is the one input that can tell the two apart.
  it("GET /api/project reports the normalised root, not the raw projectPath, when given a trailing slash", async () => {
    const slashServer = await createServer({ projectPath: `${GBC_SUBJECT_ROOT}/`, port: 0 });
    try {
      const expectedRoot = openGbcProject(GBC_SUBJECT_ROOT).root; // no trailing slash
      const r = await fetch(`http://127.0.0.1:${slashServer.port}/api/project`);
      expect(await r.json()).toEqual({ family: "gbc", root: expectedRoot });
      expect(expectedRoot.endsWith("/")).toBe(false);
    } finally {
      await slashServer.close();
    }
  });

  describe("GBA-only routes are refused with 501, naming the path, for every method", () => {
    const cases: { label: string; call: () => Promise<Response>; path: string }[] = [
      { label: "/api/warps/:name", path: "/api/warps/NewBarkTown", call: () => get("/api/warps/NewBarkTown") },
      { label: "/api/dungeons (bare)", path: "/api/dungeons", call: () => get("/api/dungeons") },
      { label: "/api/dungeons/:id (PATCH)", path: "/api/dungeons/x", call: () => patch("/api/dungeons/x") },
      { label: "/api/world/placement (POST)", path: "/api/world/placement", call: () => post("/api/world/placement") },
      { label: "/api/world/dungeons (POST)", path: "/api/world/dungeons", call: () => post("/api/world/dungeons") },
      { label: "/api/sign/:name/suggestions", path: "/api/sign/NewBarkTown/suggestions", call: () => get("/api/sign/NewBarkTown/suggestions") },
      { label: "/api/edit/:name/undo (POST)", path: "/api/edit/NewBarkTown/undo", call: () => post("/api/edit/NewBarkTown/undo") },
      { label: "/api/species/:name/icon.png", path: "/api/species/CHIKORITA/icon.png", call: () => get("/api/species/CHIKORITA/icon.png") },
    ];

    for (const { label, call, path } of cases) {
      it(label, async () => {
        const r = await call();
        expect(r.status).toBe(501);
        expect(await r.json()).toEqual({ error: `${path} is not supported for gbc (pokecrystal-family) projects yet` });
      });
    }
  });

  it("404s an unknown path", async () => {
    const r = await get("/api/nope");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not found" });
  });

  describe("near-misses that must NOT be refused (proves the 501 regex anchors)", () => {
    it("/api/worldx is a 404, not a 501 for /api/world/*", async () => {
      const r = await get("/api/worldx");
      expect(r.status).toBe(404);
    });

    it("/api/world/placementx is a 404 -- the $ anchor on world/placement$ must not match a longer path", async () => {
      const r = await get("/api/world/placementx");
      expect(r.status).toBe(404);
    });

    // Task 2 adds a real /api/species route; pinned as 404 here so that
    // task's own test can update this one rather than silently drifting.
    it("/api/species (bare, no name) is a 404 in this task -- Task 2 adds it", async () => {
      const r = await get("/api/species");
      expect(r.status).toBe(404);
    });

    // Spec review finding 2: /api/worldx and /api/world/placementx above
    // only prove the regex is anchored at ALL (leading ^ and one $). Each
    // case below proves one specific anchor/character-class the spec's own
    // near-misses never touched, so a regression in any single alternative
    // (e.g. `dungeons(\/|$)` losing its `$`, or `species/[^/]+` widening to
    // `species/.+`) still turns red here even though the spec's own 3
    // near-misses would stay green.
    it("/api/dungeonsx is a 404 -- dungeons(/|$) must not match a bare prefix", async () => {
      const r = await get("/api/dungeonsx");
      expect(r.status).toBe(404);
    });

    it("/api/world/dungeonsx is a 404 -- the $ anchor on world/dungeons$ must not match a longer path", async () => {
      const r = await get("/api/world/dungeonsx");
      expect(r.status).toBe(404);
    });

    it("/api/species/CHIKORITA/icon.pngx is a 404 -- the $ anchor on icon\\.png$ must not match a longer path", async () => {
      const r = await get("/api/species/CHIKORITA/icon.pngx");
      expect(r.status).toBe(404);
    });

    it("/api/species/A/B/icon.png is a 404 -- species/[^/]+ must not match a name containing a slash", async () => {
      const r = await get("/api/species/A/B/icon.png");
      expect(r.status).toBe(404);
    });

    it("/x/api/warps/y is a 404 -- the leading ^ must not let the pattern match mid-path", async () => {
      const r = await get("/x/api/warps/y");
      expect(r.status).toBe(404);
    });
  });

  describe("GET /api/groups", () => {
    it("groupOrder matches openGbcProject(root).groupNames(), 26 entries, starting with OLIVINE", () => {
      const expected = openGbcProject(GBC_SUBJECT_ROOT).groupNames();
      expect(expected).toHaveLength(26);
      expect(expected[0]).toBe("OLIVINE");
    });

    it("groupOrder[0] === \"OLIVINE\" and groups covers all 391 maps with no duplicate names", async () => {
      const r = await get("/api/groups");
      expect(r.status).toBe(200);
      const body = await r.json() as { groupOrder: string[]; groups: Record<string, string[]> };
      expect(body.groupOrder[0]).toBe("OLIVINE");
      expect(body.groupOrder).toHaveLength(26);
      // Every groupOrder name must be a key, even a group whose bucket
      // happens to be non-empty for every real group in the corpus (there
      // is no empty group here, but the spec requires the key to exist
      // regardless).
      for (const name of body.groupOrder) expect(Object.hasOwn(body.groups, name)).toBe(true);

      const all = Object.values(body.groups).flat();
      expect(all).toHaveLength(391);
      expect(new Set(all).size).toBe(391);
    });

    it("NewBarkTown is in groups[groupOrder[NewBarkTown.group - 1]]", async () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const map = proj.map("NewBarkTown");
      const r = await get("/api/groups");
      const body = await r.json() as { groupOrder: string[]; groups: Record<string, string[]> };
      const groupName = body.groupOrder[map.group - 1]!;
      expect(body.groups[groupName]).toContain("NewBarkTown");
    });

    // CABLE_CLUB (group 20, index 19): 6 maps, `constants/map_constants.asm`
    // lines 386-391, read directly here rather than trusting a hand-typed
    // copy. Their real map_attributes names (data/maps/attributes.asm:
    // Pokecenter2F, TradeCenter, Colosseum, TimeCapsule, MobileTradeRoom,
    // MobileBattleRoom) are NOT alphabetical (alphabetically it would be
    // Colosseum, MobileBattleRoom, MobileTradeRoom, Pokecenter2F,
    // TimeCapsule, TradeCenter) -- so this test also fails under an
    // alphabetical-sort mutation of `groups[name]` (mutation 5).
    it("CABLE_CLUB (group 20) is pinned fully, in its real map_const order -- not alphabetical", async () => {
      const constAsm = readFileSync(`${GBC_SUBJECT_ROOT}/constants/map_constants.asm`, "utf8");
      const groupTail = constAsm.slice(constAsm.indexOf("newgroup CABLE_CLUB"));
      const groupBody = groupTail.slice(0, groupTail.indexOf("endgroup"));
      const constNames = [...groupBody.matchAll(/map_const\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]!);
      expect(constNames).toEqual(["POKECENTER_2F", "TRADE_CENTER", "COLOSSEUM", "TIME_CAPSULE", "MOBILE_TRADE_ROOM", "MOBILE_BATTLE_ROOM"]);

      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const expectedNames = constNames.map((c) => proj.maps.find((m) => m.constName === c)!.name);
      expect(expectedNames).toEqual(["Pokecenter2F", "TradeCenter", "Colosseum", "TimeCapsule", "MobileTradeRoom", "MobileBattleRoom"]);
      // Not alphabetical -- proves a sort-by-name mutation would be caught.
      expect(expectedNames).not.toEqual([...expectedNames].sort());

      const r = await get("/api/groups");
      const body = await r.json() as { groupOrder: string[]; groups: Record<string, string[]> };
      const groupName = body.groupOrder[19]!;
      expect(groupName).toBe("CABLE_CLUB");
      expect(body.groups[groupName]).toEqual(expectedNames);
    });
  });

  describe("GET /api/map/:name", () => {
    it("NewBarkTown: dimensions, raw blocks from the real .blk, tileset, warps, defects, collisionInfo", async () => {
      const r = await get("/api/map/NewBarkTown");
      expect(r.status).toBe(200);
      const body = await r.json() as {
        map: { width: number; height: number; border: number };
        layout: { width: number; height: number; writable: boolean };
        blocks: { metatileId: number }[];
        metatileCount: number;
        tileset: { constName: string; name: string };
        collision: { tl: number; tr: number; bl: number; br: number }[];
        collisionInfo: Record<string, { name: string | null; category: string; talk: boolean }>;
        events: { warps: { x: number; y: number; mapConst: string; destWarp: number }[] };
        defects: unknown[];
        paddingWidth: number;
      };

      expect(body.map.width).toBe(10);
      expect(body.map.height).toBe(9);
      expect(body.layout.width).toBe(10);
      expect(body.layout.height).toBe(9);
      expect(body.layout.writable).toBe(true);
      expect(body.blocks).toHaveLength(90);

      // Read the real .blk bytes independently of the route/core renderer --
      // proves `blocks` is raw, unsubstituted data (Plan 0 §7: pin against
      // an independent measurement, not against the route's own output).
      const blkBytes = readFileSync(`${GBC_SUBJECT_ROOT}/maps/NewBarkTown.blk`);
      expect(body.blocks.map((b) => b.metatileId)).toEqual([...blkBytes]);

      expect(body.tileset.constName).toBe("TILESET_JOHTO");
      expect(body.metatileCount).toBe(128);
      expect(body.collision).toHaveLength(128);

      expect(body.events.warps).toHaveLength(4);
      expect(body.events.warps[0]).toMatchObject({ x: 6, y: 3, mapConst: "ELMS_LAB", destWarp: 1 });

      expect(body.defects).toEqual([]);

      // collisionInfo keys equal the set of values actually used in
      // `collision`, both ways: no missing key, and no extra one either.
      const usedValues = new Set<number>();
      for (const c of body.collision) { usedValues.add(c.tl); usedValues.add(c.tr); usedValues.add(c.bl); usedValues.add(c.br); }
      expect(new Set(Object.keys(body.collisionInfo).map(Number))).toEqual(usedValues);
      expect(Object.keys(body.collisionInfo)).toHaveLength(usedValues.size);

      // One pinned entry matches the real project's own collisionInfo(),
      // computed independently of the route.
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const info = proj.collisionInfo();
      const oneValue = [...usedValues][0]!;
      const expectedEntry = info.get(oneValue)!;
      expect(body.collisionInfo[String(oneValue)]).toEqual({ name: expectedEntry.name, category: expectedEntry.category, talk: expectedEntry.talk });

      expect(body.paddingWidth).toBe(openGbcProject(GBC_SUBJECT_ROOT).paddingWidth());
    });

    it("CeruleanCave2F: not writable, .blk defect first, then exactly 3 out-of-bounds warp defects", async () => {
      const r = await get("/api/map/CeruleanCave2F");
      expect(r.status).toBe(200);
      const body = await r.json() as { layout: { writable: boolean }; defects: { file: string; message: string }[] };
      expect(body.layout.writable).toBe(false);
      expect(body.defects).toHaveLength(4);
      expect(body.defects[0]!.message).toContain("CeruleanCave2F.blk");
      for (const d of body.defects.slice(1)) {
        expect(d.message).toMatch(/outside the .* step grid/);
        expect(d.message).toContain("warp");
      }
    });

    it("ElmsLab: a border $00 interior, real dimensions", async () => {
      const r = await get("/api/map/ElmsLab");
      expect(r.status).toBe(200);
      const body = await r.json() as { map: { border: number; width: number; height: number } };
      expect(body.map.border).toBe(0);
      expect(body.map.width).toBe(5);
      expect(body.map.height).toBe(6);
    });

    it("404s an unknown map", async () => {
      const r = await get("/api/map/NoSuchMap");
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ error: "no map NoSuchMap" });
    });
  });

  describe("GET /api/render/:name.png", () => {
    const readIhdr = (buf: Buffer) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

    it("NewBarkTown at borders 0/1/3 and times morn/day/nite: byte-equal to encodePng(renderGbcMap(...)), computed independently", async () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const borders = [0, 1, 3] as const;
      const times = ["morn", "day", "nite"] as const;
      const byTime: Record<string, Buffer> = {};

      for (const border of borders) {
        for (const time of times) {
          const r = await get(`/api/render/NewBarkTown.png?border=${border}&time=${time}`);
          expect(r.status).toBe(200);
          expect(r.headers.get("content-type")).toBe("image/png");
          const got = Buffer.from(await r.arrayBuffer());
          const want = encodePng(renderGbcMap(proj, "NewBarkTown", { border, time }));
          expect(got.equals(want)).toBe(true);
          if (border === 0) byTime[time] = got;
        }
      }

      const b0 = Buffer.from(await (await get("/api/render/NewBarkTown.png?border=0&time=day")).arrayBuffer());
      const b3 = Buffer.from(await (await get("/api/render/NewBarkTown.png?border=3&time=day")).arrayBuffer());
      expect(readIhdr(b0)).toEqual({ width: 320, height: 288 });
      expect(readIhdr(b3)).toEqual({ width: 512, height: 480 });

      // Pairwise, the three times differ.
      expect(byTime.morn!.equals(byTime.day!)).toBe(false);
      expect(byTime.morn!.equals(byTime.nite!)).toBe(false);
      expect(byTime.day!.equals(byTime.nite!)).toBe(false);
    });

    it("no ?time= defaults to day (mutation 10: defaulting to nite would fail this)", async () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const r = await get("/api/render/NewBarkTown.png?border=0");
      const got = Buffer.from(await r.arrayBuffer());
      const wantDay = encodePng(renderGbcMap(proj, "NewBarkTown", { border: 0, time: "day" }));
      const wantNite = encodePng(renderGbcMap(proj, "NewBarkTown", { border: 0, time: "nite" }));
      expect(got.equals(wantDay)).toBe(true);
      expect(got.equals(wantNite)).toBe(false);
    });

    it("cache-key proof: day, nite, day again -- the second day equals the first and differs from nite", async () => {
      const day1 = Buffer.from(await (await get("/api/render/NewBarkTown.png?time=day")).arrayBuffer());
      const nite = Buffer.from(await (await get("/api/render/NewBarkTown.png?time=nite")).arrayBuffer());
      const day2 = Buffer.from(await (await get("/api/render/NewBarkTown.png?time=day")).arrayBuffer());
      expect(day2.equals(day1)).toBe(true);
      expect(day2.equals(nite)).toBe(false);
    });

    it("cache-key proof: border 0, 1, 0 again -- the second border-0 equals the first and differs from border 1", async () => {
      const b0a = Buffer.from(await (await get("/api/render/NewBarkTown.png?border=0")).arrayBuffer());
      const b1 = Buffer.from(await (await get("/api/render/NewBarkTown.png?border=1")).arrayBuffer());
      const b0b = Buffer.from(await (await get("/api/render/NewBarkTown.png?border=0")).arrayBuffer());
      expect(b0b.equals(b0a)).toBe(true);
      expect(b0b.equals(b1)).toBe(false);
    });

    it("400s: border out of range names 0-3, plus abc/-1/1.5, plus a bad time", async () => {
      const outOfRange = await get("/api/render/NewBarkTown.png?border=4");
      expect(outOfRange.status).toBe(400);
      expect((await outOfRange.json() as { error: string }).error).toContain("0-3");

      for (const bad of ["abc", "-1", "1.5"]) {
        const r = await get(`/api/render/NewBarkTown.png?border=${bad}`);
        expect(r.status).toBe(400);
      }

      const badTime = await get("/api/render/NewBarkTown.png?time=noon");
      expect(badTime.status).toBe(400);
    });

    it("404s an unknown map", async () => {
      const r = await get("/api/render/NoSuchMap.png");
      expect(r.status).toBe(404);
    });
  });

  describe("GET /api/metatile/:map/:id.png", () => {
    // VioletCity block (4,7), metatile id 24, tile $10 -- the same roof
    // metatile Task 1a's own render/map.test.ts corpus test isolates
    // (VioletCity vs MahoganyTown, both TILESET_JOHTO, different real
    // roofs; measured facts recorded in that file's own header comment).
    const ROOF_METATILE_ID = 24;

    it("VioletCity roof metatile, time=nite: byte-equal to encodePng(renderGbcMapMetatile(...)), IHDR 32x32", async () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const r = await get(`/api/metatile/VioletCity/${ROOF_METATILE_ID}.png?time=nite`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("image/png");
      const got = Buffer.from(await r.arrayBuffer());
      const want = encodePng(renderGbcMapMetatile(proj, "VioletCity", ROOF_METATILE_ID, { time: "nite" }));
      expect(got.equals(want)).toBe(true);
      expect(got.readUInt32BE(16)).toBe(32);
      expect(got.readUInt32BE(20)).toBe(32);
    });

    it("the same id with time=day differs from time=nite (also proves the cache key includes time -- mutation 3)", async () => {
      const nite = Buffer.from(await (await get(`/api/metatile/VioletCity/${ROOF_METATILE_ID}.png?time=nite`)).arrayBuffer());
      const day = Buffer.from(await (await get(`/api/metatile/VioletCity/${ROOF_METATILE_ID}.png?time=day`)).arrayBuffer());
      expect(day.equals(nite)).toBe(false);
    });

    it("the same id on MahoganyTown (same TILESET_JOHTO, a different real roof) differs from VioletCity", async () => {
      const violet = Buffer.from(await (await get(`/api/metatile/VioletCity/${ROOF_METATILE_ID}.png?time=day`)).arrayBuffer());
      const mahogany = Buffer.from(await (await get(`/api/metatile/MahoganyTown/${ROOF_METATILE_ID}.png?time=day`)).arrayBuffer());
      expect(mahogany.equals(violet)).toBe(false);
    });

    it("400s: a non-non-negative-integer id (1.5, -1, abc) and a bad time", async () => {
      for (const bad of ["1.5", "-1", "abc"]) {
        const r = await get(`/api/metatile/VioletCity/${bad}.png`);
        expect(r.status).toBe(400);
        expect((await r.json() as { error: string }).error).toBe(`metatile id must be a non-negative integer, got ${bad}`);
      }
      const badTime = await get(`/api/metatile/VioletCity/${ROOF_METATILE_ID}.png?time=noon`);
      expect(badTime.status).toBe(400);
    });

    it("404s: an id at exactly metatileCount (names the count) and an unknown map", async () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const metatileCount = proj.tileset(proj.map("VioletCity").tileset).metatiles.length;
      const r = await get(`/api/metatile/VioletCity/${metatileCount}.png`);
      expect(r.status).toBe(404);
      const body = await r.json() as { error: string };
      expect(body.error).toContain(String(metatileCount));
      expect(body.error).toContain("TILESET_JOHTO");

      const r2 = await get("/api/metatile/NoSuchMap/0.png");
      expect(r2.status).toBe(404);
    });
  });
});
