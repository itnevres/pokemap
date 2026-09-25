import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { buildGbcMapPayload, buildGbcWorldPayload, buildGbcEncountersPayload, decodeMapName, parseTimeParam } from "../src/gbcRoutes.js";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { renderGbcMap, renderGbcMapMetatile } from "@pokemap/core/src/gbc/render/map.js";
import { loadGbcMapEvents } from "@pokemap/core/src/gbc/load/events.js";
import { buildGbcWorld } from "@pokemap/core/src/gbc/world/connections.js";
import { gbcEncounterSources, gbcWhereSpecies, gbcCoverage, loadGbcSpeciesConstants } from "@pokemap/core/src/gbc/analyse/atlas.js";
import { encodePng } from "@pokemap/cli/src/png.js";
import { GBC_SUBJECT_ROOT, hasGbcProject, itWithGbcCorpus } from "@pokemap/core/test/gbc/helpers/corpus.js";
import { stubGbcProject } from "@pokemap/core/test/gbc/helpers/stubGbcProject.js";

// Pure functions -- no server, no corpus needed, so these run unconditionally
// (not gated by describe.skipIf) rather than only when PerfPlus happens to be
// checked out.
describe("parseTimeParam / decodeMapName (pure helpers, fix round 1)", () => {
  it("parseTimeParam: absent -> day; morn/day/nite -> themselves; anything else -> an error, never a throw", () => {
    expect(parseTimeParam(new URL("http://x/"))).toEqual({ time: "day" });
    expect(parseTimeParam(new URL("http://x/?time=morn"))).toEqual({ time: "morn" });
    expect(parseTimeParam(new URL("http://x/?time=nite"))).toEqual({ time: "nite" });
    const bad = parseTimeParam(new URL("http://x/?time=noon"));
    expect("error" in bad).toBe(true);
  });

  it("decodeMapName: a well-formed escape decodes; a malformed one returns undefined instead of throwing", () => {
    expect(decodeMapName("New%42arkTown")).toBe("NewBarkTown");
    expect(decodeMapName("%E0%A4%A")).toBeUndefined();
  });
});

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

    // Task 1a/1b pinned this as 404 ("Task 2 adds it"). Task 2 adds the real
    // route: /api/species is now 200, proving the exact-match route was
    // added without ever letting GBA_ONLY_ROUTE_RE's own
    // "species/[^/]+/icon.png$" alternative (which requires a name AND
    // icon.png) accidentally swallow the bare path first.
    it("/api/species (bare, no name) is now a 200 -- Task 2's own route", async () => {
      const r = await get("/api/species");
      expect(r.status).toBe(200);
      const body = await r.json() as string[];
      expect(Array.isArray(body)).toBe(true);
      expect(body).toContain("CHIKORITA");
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
    // Spec review finding 1: the old version of this test only re-checked
    // `openGbcProject(...).groupNames()` directly, with no call to the
    // route at all -- a Plan 0 §7 can't-fail test. `body.groupOrder` is now
    // compared with `toEqual` directly against the independently-computed
    // `groupNames()`, which also kills R5 (swapping `groupOrder[1]`/`[2]`)
    // without needing a dedicated test for that swap.
    it("groupOrder equals openGbcProject(root).groupNames() through the route (26 entries, OLIVINE first); groups covers all 391 maps with no duplicate names", async () => {
      const expectedGroupNames = openGbcProject(GBC_SUBJECT_ROOT).groupNames();
      expect(expectedGroupNames).toHaveLength(26);
      expect(expectedGroupNames[0]).toBe("OLIVINE");

      const r = await get("/api/groups");
      expect(r.status).toBe(200);
      const body = await r.json() as { groupOrder: string[]; groups: Record<string, string[]> };
      expect(body.groupOrder).toEqual(expectedGroupNames);

      // Every groupOrder name must be a key.
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
    it("NewBarkTown: every payload field deep-equals its own core object, via a JSON round-trip", async () => {
      const r = await get("/api/map/NewBarkTown");
      expect(r.status).toBe(200);
      const body = await r.json() as {
        map: unknown;
        layout: { blkPath: string; width: number; height: number; writable: boolean };
        blocks: { metatileId: number }[];
        metatileCount: number;
        tileset: { constName: string; name: string };
        collision: { tl: number; tr: number; bl: number; br: number }[];
        collisionInfo: Record<string, { name: string | null; category: string; talk: boolean }>;
        events: unknown;
        defects: unknown[];
        paddingWidth: number;
      };

      // A JSON round-trip of the real core objects, so `toEqual` compares
      // against exactly what travelled over the wire (no `Map`/`Set`/etc.
      // surviving on one side but not the other) -- spec review finding 5.
      const rt = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const map = proj.map("NewBarkTown");
      const ts = proj.tileset(map.tileset);
      const { layout } = proj.layout(map);
      const { events } = loadGbcMapEvents(proj.root, map);

      expect(body.map).toEqual(rt(map));
      // attributes.asm:100 -- `map_attributes NewBarkTown, NEW_BARK_TOWN, $05, WEST | EAST`.
      expect((body.map as { connections: unknown[] }).connections).toHaveLength(2);

      expect(body.layout).toEqual({ blkPath: "maps/NewBarkTown.blk", width: 10, height: 9, writable: true });
      expect(body.layout.blkPath).toBe(layout.blkPath);

      // Read the real .blk bytes independently of the route/core renderer --
      // proves `blocks` is raw, unsubstituted data (Plan 0 §7: pin against
      // an independent measurement, not against the route's own output).
      const blkBytes = readFileSync(`${GBC_SUBJECT_ROOT}/maps/NewBarkTown.blk`);
      expect(body.blocks.map((b) => b.metatileId)).toEqual([...blkBytes]);

      expect(body.tileset).toEqual({ constName: ts.constName, name: ts.name });
      expect(body.tileset.constName).toBe("TILESET_JOHTO");
      expect(body.metatileCount).toBe(ts.metatiles.length);
      expect(body.metatileCount).toBe(128);
      expect(body.collision).toEqual(rt(ts.collision));
      expect(body.collision).toHaveLength(128);

      expect(body.events).toEqual(rt(events));
      expect((body.events as { warps: unknown[] }).warps).toHaveLength(4);
      expect((body.events as { warps: { x: number; y: number; mapConst: string; destWarp: number }[] }).warps[0])
        .toMatchObject({ x: 6, y: 3, mapConst: "ELMS_LAB", destWarp: 1 });

      expect(body.defects).toEqual([]);

      // collisionInfo: every entry the route sends, compared field-for-field
      // against proj.collisionInfo() (not just the first pinned value, and
      // not just the key set) -- kills a mutation that corrupts every
      // non-pinned entry's category (R14).
      const usedValues = new Set<number>();
      for (const c of body.collision) { usedValues.add(c.tl); usedValues.add(c.tr); usedValues.add(c.bl); usedValues.add(c.br); }
      const info = proj.collisionInfo();
      const expectedCollisionInfo = Object.fromEntries([...usedValues].map((v) => [String(v), rt(info.get(v)!)]));
      expect(body.collisionInfo).toEqual(expectedCollisionInfo);

      expect(body.paddingWidth).toBe(proj.paddingWidth());
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

    it("400s a malformed percent-escape in the name, naming the raw segment (GBC only -- index.ts is untouched)", async () => {
      const r = await get("/api/map/%E0%A4%A");
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "malformed map name %E0%A4%A" });
    });
  });

  describe("buildGbcMapPayload (unit, stubGbcProject) -- mutation 7: block-0 substitution", () => {
    // The real corpus has no map with an id-0 block anywhere (independently
    // re-measured; see task-1b-implementer.md), so no HTTP-level test can
    // discriminate the block-0 -> border substitution mutation. This test
    // closes that gap directly at the payload-builder level (quality review
    // finding 2), by wrapping the REAL project's own data and overriding
    // only `layout()` to inject the one input the corpus lacks -- preferred
    // over a `vi.mock` of the whole module (spec review finding 6's own
    // proof file) because every other field (`map`, `tileset`,
    // `collisionInfo`, `paddingWidth`, `root`) stays the real, measured
    // data, and `stubGbcProject` is the helper this codebase already uses
    // for exactly this shape of fixture.
    itWithGbcCorpus("keeps a raw id-0 block instead of substituting the border metatile", () => {
      const real = openGbcProject(GBC_SUBJECT_ROOT);
      const map = real.map("NewBarkTown");
      expect(map.border).not.toBe(0); // NewBarkTown's border is $05 -- a real, non-zero substitution value

      const proj = stubGbcProject({
        root: real.root,
        maps: real.maps,
        map: real.map,
        tileset: real.tileset,
        paddingWidth: real.paddingWidth,
        collisionInfo: real.collisionInfo,
        layout: (m) => {
          const r = real.layout(m);
          const blocks = r.layout.blocks.map((b, i) => (i === 0 ? { metatileId: 0 } : b));
          return { layout: { ...r.layout, blocks }, defects: r.defects };
        },
      });

      const payload = buildGbcMapPayload(proj, map);
      expect(payload.blocks[0]).toEqual({ metatileId: 0 });
      expect(payload.blocks[0]!.metatileId).not.toBe(map.border);
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
          expect(r.headers.get("cache-control")).toBe("no-cache");
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

    // Spec review finding 2: every test above uses only NewBarkTown, so a
    // cache key that drops the map name entirely (`${border}:${time}`, R1)
    // was never discriminated. Two DIFFERENT maps at the SAME border/time
    // close that gap: each must equal its own core render, and the two
    // must differ from each other.
    it("cache-key proof: two different maps at the same border/time each byte-equal their own core render, and differ from each other (name is part of the key)", async () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const a = Buffer.from(await (await get("/api/render/NewBarkTown.png?border=0&time=day")).arrayBuffer());
      const b = Buffer.from(await (await get("/api/render/ElmsLab.png?border=0&time=day")).arrayBuffer());
      expect(a.equals(encodePng(renderGbcMap(proj, "NewBarkTown", { border: 0, time: "day" })))).toBe(true);
      expect(b.equals(encodePng(renderGbcMap(proj, "ElmsLab", { border: 0, time: "day" })))).toBe(true);
      expect(a.equals(b)).toBe(false);
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

    it("404s an unknown map, naming it in the body", async () => {
      const r = await get("/api/render/NoSuchMap.png");
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ error: "no map NoSuchMap" });
    });

    // Coordinator decision (Task 1b fix round 1, spec review finding 4):
    // both PNG routes now resolve the map name FIRST, so a request with
    // BOTH a bad name and a bad param answers 404, not 400 -- kills R11
    // (render reverted to checking params before the name).
    it("an unknown map AND a bad param together: 404 wins (the name is resolved before any param)", async () => {
      const r = await get("/api/render/NoSuchMap.png?border=9");
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ error: "no map NoSuchMap" });
    });

    it("400s a malformed percent-escape in the name, naming the raw segment", async () => {
      const r = await get("/api/render/%E0%A4%A.png");
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "malformed map name %E0%A4%A" });
    });
  });

  describe("GET /api/metatile/:map/:id.png", () => {
    // VioletCity block (4,7), metatile id 24, tile $10 -- the same roof
    // metatile Task 1a's own render/map.test.ts corpus test isolates
    // (VioletCity vs MahoganyTown, both TILESET_JOHTO, different real
    // roofs; measured facts recorded in that file's own header comment).
    const ROOF_METATILE_ID = 24;

    it("VioletCity roof metatile, time=nite: byte-equal to encodePng(renderGbcMapMetatile(...)), IHDR 32x32, cache-control no-cache", async () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const r = await get(`/api/metatile/VioletCity/${ROOF_METATILE_ID}.png?time=nite`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("image/png");
      expect(r.headers.get("cache-control")).toBe("no-cache");
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

    it("no ?time= defaults to day, not nite (R4: metatile's own time default was untested)", async () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const r = await get(`/api/metatile/VioletCity/${ROOF_METATILE_ID}.png`);
      const got = Buffer.from(await r.arrayBuffer());
      const wantDay = encodePng(renderGbcMapMetatile(proj, "VioletCity", ROOF_METATILE_ID, { time: "day" }));
      const wantNite = encodePng(renderGbcMapMetatile(proj, "VioletCity", ROOF_METATILE_ID, { time: "nite" }));
      expect(got.equals(wantDay)).toBe(true);
      expect(got.equals(wantNite)).toBe(false);
    });

    it("the same id on MahoganyTown (same TILESET_JOHTO, a different real roof) differs from VioletCity", async () => {
      const violet = Buffer.from(await (await get(`/api/metatile/VioletCity/${ROOF_METATILE_ID}.png?time=day`)).arrayBuffer());
      const mahogany = Buffer.from(await (await get(`/api/metatile/MahoganyTown/${ROOF_METATILE_ID}.png?time=day`)).arrayBuffer());
      expect(mahogany.equals(violet)).toBe(false);
    });

    // Spec review finding 2: every test above uses only id 24, so a cache
    // key that drops the id entirely (`${name}:${time}`, R2) was never
    // discriminated. Two DIFFERENT ids on the SAME map close that gap.
    it("cache-key proof: two different ids on the same map each byte-equal their own core render, and differ from each other (id is part of the key)", async () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const otherId = 0; // VioletCity's own block-0-vs-roof(24) pixel difference is already established (Task 1a's render/map.test.ts)
      const a = Buffer.from(await (await get(`/api/metatile/VioletCity/${ROOF_METATILE_ID}.png?time=day`)).arrayBuffer());
      const b = Buffer.from(await (await get(`/api/metatile/VioletCity/${otherId}.png?time=day`)).arrayBuffer());
      expect(a.equals(encodePng(renderGbcMapMetatile(proj, "VioletCity", ROOF_METATILE_ID, { time: "day" })))).toBe(true);
      expect(b.equals(encodePng(renderGbcMapMetatile(proj, "VioletCity", otherId, { time: "day" })))).toBe(true);
      expect(a.equals(b)).toBe(false);
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
      expect(await r2.json()).toEqual({ error: "no map NoSuchMap" });
    });

    // Coordinator decision (Task 1b fix round 1, spec review finding 4):
    // both PNG routes now resolve the map name FIRST, so a request with
    // BOTH an unknown map and a bad id answers 404, not 400 -- kills R12
    // (metatile reverted to checking the id before the name).
    it("an unknown map AND a bad id together: 404 wins (the name is resolved before the id)", async () => {
      const r = await get("/api/metatile/NoSuchMap/abc.png");
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ error: "no map NoSuchMap" });
    });

    it("400s a malformed percent-escape in the map name, naming the raw segment", async () => {
      const r = await get("/api/metatile/%E0%A4%A/0.png");
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "malformed map name %E0%A4%A" });
    });
  });

  // ---------------------------------------------------------------------
  // Task 2: world + atlas routes. Kept in its own describe block, separate
  // from Task 1b's tests above (spec instruction), inside the same
  // corpus-guarded suite/beforeAll -- no new describe.skipIf needed.
  // ---------------------------------------------------------------------

  describe("GET /api/world", () => {
    it("deep-equals Object.fromEntries(buildGbcWorld(...).placements); 326 components, exactly 3 with more than one map; blockPx 32", async () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const world = buildGbcWorld(proj);
      const expectedPlacements = Object.fromEntries(world.placements);

      const r = await get("/api/world");
      expect(r.status).toBe(200);
      const body = await r.json() as { family: string; blockPx: number; placements: Record<string, unknown>; components: { maps: string[] }[]; conflicts: unknown[] };

      expect(body.family).toBe("gbc");
      expect(body.blockPx).toBe(32);
      expect(body.placements).toEqual(expectedPlacements);

      // Measured directly against buildGbcWorld's own output (not guessed):
      // 391 maps split into 326 components, of which exactly 3 (sizes
      // 35/31/2 -- Kanto, Johto, and one 2-map pair) have more than one map;
      // the other 323 are single-map interiors.
      expect(body.components).toHaveLength(326);
      const multiMap = body.components.filter((c) => c.maps.length > 1);
      expect(multiMap).toHaveLength(3);
      expect(multiMap.map((c) => c.maps.length).sort((a, b) => a - b)).toEqual([2, 31, 35]);

      expect(body.placements.NewBarkTown).toMatchObject({ width: 10, height: 9 });
    });

    it("exactly 2 conflicts, on Route17 and Route18", async () => {
      const r = await get("/api/world");
      const body = await r.json() as { conflicts: { map: string }[] };
      expect(body.conflicts).toHaveLength(2);
      expect(body.conflicts.map((c) => c.map).sort()).toEqual(["Route17", "Route18"]);
    });

    it("a second request returns deep-equal data -- the world cache is never mutated by serving it", async () => {
      const first = await (await get("/api/world")).json();
      const second = await (await get("/api/world")).json();
      expect(second).toEqual(first);
    });

    it("buildGbcWorldPayload wire-shapes a real GbcWorld directly (unit, no HTTP)", () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const world = buildGbcWorld(proj);
      const payload = buildGbcWorldPayload(world);
      expect(payload).toEqual({
        family: "gbc",
        blockPx: 32,
        placements: Object.fromEntries(world.placements),
        components: world.components,
        conflicts: world.conflicts,
      });
    });
  });

  describe("GET /api/encounters/:map", () => {
    // Route29 (data/wild/johto_grass.asm's ROUTE_29 entry): 3 grass sources
    // (morn/day/nite) + 2 headbutt sources (common/rare), no water/fish/rock
    // -- measured directly from gbcEncounterSources, not guessed.
    it("Route29: the exact source list gbcEncounterSources returns, pinned against the real johto_grass.asm text", async () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const expectedSources = gbcEncounterSources(proj, "Route29");
      expect(expectedSources).toHaveLength(5);

      const r = await get("/api/encounters/Route29");
      expect(r.status).toBe(200);
      const body = await r.json() as { mapName: string; sources: { method: string; time?: string; list?: string; chances: { species: string; percent: number }[] }[]; defects: unknown[] };
      expect(body.mapName).toBe("Route29");
      expect(body.sources).toEqual(expectedSources);

      // Pin one source's tags and its first chance literally, cross-checked
      // against the real .asm text (not just against the core function's
      // own output) -- ROUTE_29's morn block's first slot line is
      // `db 2, PIDGEY`, weight 2 of the section's 7-slot total, which
      // (per probabilities.asm's grass weights) resolves to 45%.
      const text = readFileSync(`${GBC_SUBJECT_ROOT}/data/wild/johto_grass.asm`, "utf8");
      const routeText = text.slice(text.indexOf("def_grass_wildmons ROUTE_29"));
      const mornBlock = routeText.slice(routeText.indexOf("; morn"), routeText.indexOf("; day"));
      const firstSlot = /db\s+(\d+),\s*(\w+)/.exec(mornBlock);
      expect(firstSlot?.[2]).toBe("PIDGEY");

      const morn = body.sources.find((s) => s.method === "grass" && s.time === "morn")!;
      expect(morn).toBeDefined();
      expect(morn.chances[0]).toEqual({ species: "PIDGEY", percent: 45, minLevel: 2, maxLevel: 7 });

      // Every grass/water source's chances sum to 100% (within float slop) --
      // this map has grass but no water; still checked generically over
      // every source of either method, not just the one pinned above.
      for (const s of body.sources) {
        if (s.method === "grass" || s.method === "water") {
          const sum = s.chances.reduce((a, c) => a + c.percent, 0);
          expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.05);
        }
      }
    });

    it("a map with no encounters at all (NewBarkTown's PlayersHouse1F) returns sources: [] -- real data, not an error", async () => {
      const r = await get("/api/encounters/PlayersHouse1F");
      expect(r.status).toBe(200);
      const body = await r.json() as { mapName: string; sources: unknown[] };
      expect(body.mapName).toBe("PlayersHouse1F");
      expect(body.sources).toEqual([]);
    });

    it("ElmsLab also returns sources: []", async () => {
      const r = await get("/api/encounters/ElmsLab");
      expect(r.status).toBe(200);
      const body = await r.json() as { sources: unknown[] };
      expect(body.sources).toEqual([]);
    });

    it("404s an unknown map", async () => {
      const r = await get("/api/encounters/NoSuchMap");
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ error: "no map NoSuchMap" });
    });

    it("defects names kanto_grass.asm -- the one documented terminator defect", async () => {
      const r = await get("/api/encounters/Route29");
      const body = await r.json() as { defects: { message: string }[] };
      expect(body.defects.length).toBeGreaterThan(0);
      expect(body.defects.some((d) => d.message.includes("kanto_grass.asm"))).toBe(true);
    });

    it("400s a malformed percent-escape in the map name, naming the raw segment", async () => {
      const r = await get("/api/encounters/%E0%A4%A");
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "malformed map name %E0%A4%A" });
    });

    it("buildGbcEncountersPayload directly (unit, no HTTP)", () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const payload = buildGbcEncountersPayload(proj, "Route29");
      expect(payload.mapName).toBe("Route29");
      expect(payload.sources).toEqual(gbcEncounterSources(proj, "Route29"));
      expect(payload.defects).toEqual(proj.wild().defects);
    });
  });

  describe("GET /api/where/:species", () => {
    it("DUNSPARCE, dunsparce and SPECIES_DUNSPARCE all return the same array -- exactly 6 hits, all on DarkCaveVioletEntrance", async () => {
      const upper = await (await get("/api/where/DUNSPARCE")).json() as { mapName: string }[];
      const lower = await (await get("/api/where/dunsparce")).json() as { mapName: string }[];
      const prefixed = await (await get("/api/where/SPECIES_DUNSPARCE")).json() as { mapName: string }[];

      expect(upper).toHaveLength(6);
      expect(lower).toEqual(upper);
      expect(prefixed).toEqual(upper);
      for (const hit of upper) expect(hit.mapName).toBe("DarkCaveVioletEntrance");
    });

    it("an unknown species returns [], a 200, like GBA", async () => {
      const r = await get("/api/where/NOTAMON");
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual([]);
    });

    it("matches gbcWhereSpecies(proj, 'CHIKORITA') directly", async () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const expected = gbcWhereSpecies(proj, "CHIKORITA");
      const r = await get("/api/where/CHIKORITA");
      expect(await r.json()).toEqual(expected);
    });

    it("400s a malformed percent-escape in the species segment", async () => {
      const r = await get("/api/where/%E0%A4%A");
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "malformed species %E0%A4%A" });
    });
  });

  describe("GET /api/coverage", () => {
    it("deep-equals gbcCoverage(openGbcProject(root)); mapsWithEncounters=125, unusedSpecies.length=70 (measured, cross-checked against the CLI's --json output)", async () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const expected = gbcCoverage(proj);
      expect(expected.mapsWithEncounters).toBe(125);
      expect(expected.unusedSpecies).toHaveLength(70);

      const r = await get("/api/coverage");
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body).toEqual(expected);
    });

    it("a second request returns deep-equal data -- the coverage cache is never mutated by serving it", async () => {
      const first = await (await get("/api/coverage")).json();
      const second = await (await get("/api/coverage")).json();
      expect(second).toEqual(first);
    });
  });

  describe("GET /api/species", () => {
    it("sorted, contains CHIKORITA, nothing starts with SPECIES_, excludes NO_MON and EGG, length matches loadGbcSpeciesConstants (251)", async () => {
      const expectedLength = loadGbcSpeciesConstants(GBC_SUBJECT_ROOT).length;
      expect(expectedLength).toBe(251);

      const r = await get("/api/species");
      expect(r.status).toBe(200);
      const body = await r.json() as string[];
      expect(body).toEqual([...body].sort());
      expect(body).toHaveLength(expectedLength);
      expect(body).toContain("CHIKORITA");
      expect(body.some((s) => s.startsWith("SPECIES_"))).toBe(false);
      expect(body).not.toContain("NO_MON");
      expect(body).not.toContain("EGG");
    });
  });
});
