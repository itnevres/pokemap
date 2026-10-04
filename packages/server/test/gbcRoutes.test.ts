import { existsSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { buildGbcMapPayload, buildGbcWorldPayload, buildGbcEncountersPayload, buildGbcWarpsPayload, decodeMapName, parseTimeParam } from "../src/gbcRoutes.js";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { renderGbcMap, renderGbcMapMetatile } from "@pokemap/core/src/gbc/render/map.js";
import { loadGbcMapEvents } from "@pokemap/core/src/gbc/load/events.js";
import { buildGbcWorld } from "@pokemap/core/src/gbc/world/connections.js";
import { wireConflicts } from "@pokemap/core/src/world/conflictAcceptance.js";
import { placeNearWarps } from "@pokemap/core/src/world/nearWarp.js";
import { gbcWarpLinks, gbcWarpConnectedMapsFrom } from "@pokemap/core/src/world/nearWarpAdapters.js";
import type { WarpLink } from "@pokemap/core/src/world/nearWarp.js";
import type { Sidecar } from "@pokemap/core/src/world/sidecar.js";
import { gbcEncounterSources, gbcWhereSpecies, gbcCoverage, loadGbcSpeciesConstants } from "@pokemap/core/src/gbc/analyse/atlas.js";
import { loadGbcFrontSprite } from "@pokemap/core/src/gbc/load/sprites.js";
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

describe("GBC directed dungeon seed traversal", () => {
  it("follows outgoing edges through hidden maps and cycles, including the seed", () => {
    const link = (from: string, to: string): WarpLink => ({ from, to, sourceOrdinal: 0, destinationOrdinal: 0,
      source: { x: 0, y: 0 }, arrival: { x: 0, y: 0 } });
    const links = [link("A", "Hidden"), link("Hidden", "B"), link("B", "A"), link("ReverseOnly", "A")];
    expect([...gbcWarpConnectedMapsFrom("A", links)].sort()).toEqual(["A", "B", "Hidden"]);
    expect([...gbcWarpConnectedMapsFrom("Isolated", links)]).toEqual(["Isolated"]);
  });
});

let s: PokemapServer;
const get = async (path: string) => fetch(`http://127.0.0.1:${s.port}${path}`);
const post = async (path: string, body: unknown = {}) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", body: JSON.stringify(body) });
const postRaw = async (path: string, body: string) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, { method: "POST", body });
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
      { label: "/api/world/dungeons (POST)", path: "/api/world/dungeons", call: () => post("/api/world/dungeons") },
      { label: "/api/sign/:name/suggestions", path: "/api/sign/NewBarkTown/suggestions", call: () => get("/api/sign/NewBarkTown/suggestions") },
      { label: "/api/edit/:name/undo (POST)", path: "/api/edit/NewBarkTown/undo", call: () => post("/api/edit/NewBarkTown/undo") },
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

    // Plan 6c B1: /api/species/:name/icon.png is a real GBC route now (no longer
    // in GBA_ONLY_ROUTE_RE), so these two near-misses prove the NEW route's own
    // `$` and `[^/]+` anchors instead.
    it("/api/species/CHIKORITA/icon.pngx is a 404 -- the icon route's icon\\.png$ anchor must not match a longer path", async () => {
      const r = await get("/api/species/CHIKORITA/icon.pngx");
      expect(r.status).toBe(404);
    });

    it("/api/species/A/B/icon.png is a 404 -- the icon route's species/([^/]+) must not match a name containing a slash", async () => {
      const r = await get("/api/species/A/B/icon.png");
      expect(r.status).toBe(404);
    });

    it("/x/api/warps/y is a 404 -- the leading ^ must not let the pattern match mid-path", async () => {
      const r = await get("/x/api/warps/y");
      expect(r.status).toBe(404);
    });
  });

  describe("GET /api/species/:name/icon.png (Plan 6c B1)", () => {
    const expected = (species: string) => encodePng(loadGbcFrontSprite(GBC_SUBJECT_ROOT, species)!);
    const bodyOf = async (r: Response) => Buffer.from(await r.arrayBuffer());
    /** Length first (a readable diff on a size mismatch), then byte-compare. */
    const expectSameBytes = (got: Buffer, want: Buffer) => {
      expect(got.length).toBe(want.length);
      expect(Buffer.compare(got, want)).toBe(0);
    };

    it("serves frame 0 of the GBC front sprite as a PNG, byte-equal to the core loader's encoding", async () => {
      const r = await get("/api/species/CHIKORITA/icon.png");
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("image/png");
      expect(r.headers.get("cache-control")).toBe("no-cache");
      expectSameBytes(await bodyOf(r), expected("CHIKORITA"));
    });

    it("serves each species its own sprite: DUNSPARCE matches its loader bytes and differs from CHIKORITA's", async () => {
      const dun = await bodyOf(await get("/api/species/DUNSPARCE/icon.png"));
      expectSameBytes(dun, expected("DUNSPARCE"));
      const chik = await bodyOf(await get("/api/species/CHIKORITA/icon.png"));
      expect(Buffer.compare(dun, chik)).not.toBe(0);
    });

    it("UNOWN (the one species resolved through UnownPicPointers) is a 200 with its loader bytes", async () => {
      const r = await get("/api/species/UNOWN/icon.png");
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("image/png");
      expectSameBytes(await bodyOf(r), expected("UNOWN"));
    });

    it("normalises the species: lowercase and SPECIES_-prefixed names give the same bytes", async () => {
      const want = expected("CHIKORITA");
      for (const name of ["chikorita", "SPECIES_CHIKORITA"]) {
        const r = await get(`/api/species/${name}/icon.png`);
        expect(r.status).toBe(200);
        expectSameBytes(await bodyOf(r), want);
      }
    });

    it("an unknown species is a 404 with a named error", async () => {
      const r = await get("/api/species/NOT_A_MON/icon.png");
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ error: "no sprite for NOT_A_MON" });
    });

    it("a malformed percent-escape is a 400 naming the raw segment", async () => {
      const r = await get("/api/species/%E0%A4%A/icon.png");
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "malformed species %E0%A4%A" });
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
    it("deep-equals independently resolved near-warp placements; 326 components, exactly 3 with more than one map; blockPx 32", async () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const world = buildGbcWorld(proj);
      const r = await get("/api/world");
      expect(r.status).toBe(200);
      const body = await r.json() as { family: string; blockPx: number; placements: Record<string, any>; components: { maps: string[] }[]; conflicts: unknown[] };
      const mapTypeByName = new Map(proj.maps.map((map) => [map.name, map.environment]));
      const shown = new Set(proj.maps.filter((map) => !["INDOOR", "GATE"].includes(map.environment)).map((map) => map.name));
      const hidden = new Set(proj.maps.filter((map) => !shown.has(map.name)).map((map) => map.name));
      const resolved = placeNearWarps({ placements: world.placements, shown, hidden, warps: gbcWarpLinks(proj),
        sizes: new Map([...world.placements].map(([name, p]) => [name, { width: p.width, height: p.height }])), gap: 4,
        singletons: new Set(world.components.filter((c) => c.maps.length === 1).map((c) => c.maps[0]!)) });
      const expectedPlacements = Object.fromEntries([...resolved].map(([name, placement]) => [name, {
        ...placement,
        mapType: mapTypeByName.get(name) ?? "",
        manual: false,
      }]));

      expect(body.family).toBe("gbc");
      expect(body.blockPx).toBe(32);
      expect(body.placements).toEqual(expectedPlacements);
      expect(Object.values(body.placements).filter((p: any) => p.manual || !["INDOOR", "GATE"].includes(p.mapType))).toHaveLength(158);
      expect(Object.values(body.placements).filter((p: any) => !p.manual && ["INDOOR", "GATE"].includes(p.mapType))).toHaveLength(233);

      // Fix round 1, spec review Minor #2: components/conflicts were
      // previously pinned only by count/size (components) or by `.map`
      // (conflicts), never deep-equalled against the core output over the
      // real HTTP/JSON round-trip -- so a route-level bug that corrupted
      // `components[].bounds` or `conflicts[].viaA/viaB` (both of which
      // Task 5's world canvas consumes -- the fit and the conflict-badge
      // tooltip) would have shipped undetected.
      expect(body.components).toEqual(world.components);
      expect(body.conflicts).toEqual(wireConflicts(world.conflicts, []));

      // Measured directly against buildGbcWorld's own output (not guessed):
      // 391 maps split into 326 components, of which exactly 3 (sizes
      // 35/31/2 -- Kanto, Johto, and one 2-map pair) have more than one map;
      // the other 323 are single-map interiors.
      expect(body.components).toHaveLength(326);
      const multiMap = body.components.filter((c) => c.maps.length > 1);
      expect(multiMap).toHaveLength(3);
      expect(multiMap.map((c) => c.maps.length).sort((a, b) => a - b)).toEqual([2, 31, 35]);

      expect(body.placements.NewBarkTown).toMatchObject({ width: 10, height: 9, mapType: "TOWN", manual: false });
    });

    it("exactly 2 conflicts, on Route17 and Route18, one pinned literally", async () => {
      const r = await get("/api/world");
      const body = await r.json() as { conflicts: { map: string; viaA: { from: string; x: number; y: number }; viaB: { from: string; x: number; y: number } }[] };
      expect(body.conflicts).toHaveLength(2);
      expect(body.conflicts.map((c) => c.map).sort()).toEqual(["Route17", "Route18"]);

      // Fix round 1, spec review Minor #2: pinned literally, re-derived from
      // `attributes.asm`'s real Route17<->Route18 connection offsets (`west,
      // Route17, -38` vs `east, Route18, 38`, which disagree by 1 block in y
      // once seen from each end), not just from the core function's own
      // output.
      const route17 = body.conflicts.find((c) => c.map === "Route17");
      expect(route17).toEqual({ map: "Route17", viaA: { from: "Route18", x: 30, y: 50 }, viaB: { from: "Route16", x: 30, y: 49 },
        key: '["Route17","Route18",30,50,"Route16",30,49]', accepted: false });
    });

    it("pure payload resolution preserves the same base world after automatic and manual calls", () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const base = buildGbcWorld(proj);
      const original = structuredClone([...base.placements]);
      const warps = gbcWarpLinks(proj);
      const sidecar: Sidecar = { version: 1, dungeonAutoLayout: true, manualPlacements: {}, view: { x: 0, y: 0, zoom: 1 } };
      const automatic = buildGbcWorldPayload(proj, base, sidecar, warps);
      expect(automatic.placements.IlexForest).toMatchObject({ x: 40, y: 259, manual: false });
      expect([...base.placements]).toEqual(original);
      const manual = buildGbcWorldPayload(proj, base, { ...sidecar, manualPlacements: { IlexForest: { x: 80, y: 269 } } }, warps);
      expect(manual.placements.IlexForest).toMatchObject({ x: 80, y: 269, manual: true });
      expect([...base.placements]).toEqual(original);
    });

    it("repeated HTTP world responses are equal", async () => {
      const first = await (await get("/api/world")).json();
      const second = await (await get("/api/world")).json();
      expect(second).toEqual(first);
    });

    it("uses supplied normalized warps without reading map events", () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const world = buildGbcWorld(proj);
      const withInvalidEventRoot = { ...proj, root: "C:/pokemap-d2-nonexistent-event-root" };
      const sidecar: Sidecar = { version: 1, dungeonAutoLayout: true, manualPlacements: {}, view: { x: 0, y: 0, zoom: 1 } };
      const result = buildGbcWorldPayload(withInvalidEventRoot, world, sidecar, []);
      expect(result.placements.IlexForest).toMatchObject(world.placements.get("IlexForest")!);
    });

    it("applies a manual placement last on a moved GBC singleton even when it overlaps a fixed anchor", () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const world = buildGbcWorld(proj);
      const warps = gbcWarpLinks(proj);
      const empty: Sidecar = { version: 1, dungeonAutoLayout: true, manualPlacements: {}, view: { x: 0, y: 0, zoom: 1 } };
      const automatic = buildGbcWorldPayload(proj, world, empty, warps);
      expect(automatic.placements.IlexForest).toMatchObject({ x: 40, y: 259, manual: false });
      const azalea = automatic.placements.AzaleaTown!;
      const manual = buildGbcWorldPayload(proj, world, { ...empty, manualPlacements: { IlexForest: { x: azalea.x, y: azalea.y } } }, warps);
      expect(manual.placements.IlexForest).toMatchObject({ x: azalea.x, y: azalea.y, manual: true });
      expect(manual.placements.IlexForest!.x).not.toBe(automatic.placements.IlexForest!.x);
      expect(manual.placements.AzaleaTown).toEqual(azalea);
      expect(manual.placements.IlexForest!.width).toBeGreaterThan(0);
      expect(manual.placements.IlexForest!.height).toBeGreaterThan(0);
      expect(azalea.width).toBeGreaterThan(0);
      expect(azalea.height).toBeGreaterThan(0);
    });

    // Fix round 1, spec review Minor #3: GBC has no dungeons-on/off toggle
    // (unlike GBA's own /api/world, which reads ?dungeons=), so a query
    // string on this route must be silently ignored, never change the
    // response and never turn the exact-match route into a 404.
    it("?dungeons=0 is ignored -- returns the identical body, unlike GBA's own /api/world", async () => {
      const plain = await (await get("/api/world")).json();
      const withQuery = await (await get("/api/world?dungeons=0")).json();
      expect(withQuery).toEqual(plain);
    });

    it("buildGbcWorldPayload wire-shapes a real GbcWorld directly (unit, no HTTP)", () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      const world = buildGbcWorld(proj);
      const sidecar: Sidecar = {
        version: 1,
        dungeonAutoLayout: true,
        manualPlacements: { NewBarkTown: { x: 321, y: -45 }, AddedMap: { x: 7, y: 8 } },
        view: { x: 0, y: 0, zoom: 1 },
      };
      const mapTypeByName = new Map(proj.maps.map((map) => [map.name, map.environment]));
      const shown = new Set(proj.maps.filter((map) => !["INDOOR", "GATE"].includes(map.environment) || Object.hasOwn(sidecar.manualPlacements, map.name)).map((map) => map.name));
      const hidden = new Set(proj.maps.filter((map) => !shown.has(map.name)).map((map) => map.name));
      const resolved = placeNearWarps({ placements: world.placements, shown, hidden, warps: gbcWarpLinks(proj),
        sizes: new Map([...world.placements].map(([name, p]) => [name, { width: p.width, height: p.height }])), gap: 4,
        singletons: new Set(world.components.filter((c) => c.maps.length === 1).map((c) => c.maps[0]!)) });
      const expectedPlacements = Object.fromEntries([...resolved].map(([name, placement]) => [name, {
        ...placement,
        ...(sidecar.manualPlacements[name] ?? {}),
        mapType: mapTypeByName.get(name) ?? "",
        manual: Object.prototype.hasOwnProperty.call(sidecar.manualPlacements, name),
      }]));
      expectedPlacements.AddedMap = { map: "AddedMap", x: 7, y: 8, width: 0, height: 0, component: -1, mapType: "", manual: true };
      expect(buildGbcWorldPayload(proj, world, sidecar)).toEqual({
        family: "gbc",
        blockPx: 32,
        placements: expectedPlacements,
        components: world.components,
        conflicts: wireConflicts(world.conflicts, []),
      });
    });
  });

  it("accepts and un-accepts Route17 without moving maps, with exact PerfPlus sidecar restoration", async () => {
    const path = `${GBC_SUBJECT_ROOT}/.pokemap/world.json`;
    const dir = `${GBC_SUBJECT_ROOT}/.pokemap`;
    const dirExisted = existsSync(dir);
    const before = existsSync(path) ? readFileSync(path) : null;
    const observed = { lastWritten: null as Buffer | null };
    try {
      const observedPost = async (body: unknown) => {
        try { return await post("/api/world/conflicts/accept", body); }
        finally { observed.lastWritten = existsSync(path) ? readFileSync(path) : null; }
      };
      const observedRawPost = async (body: string) => {
        try { return await postRaw("/api/world/conflicts/accept", body); }
        finally { observed.lastWritten = existsSync(path) ? readFileSync(path) : null; }
      };
      const start = await (await get("/api/world")).json() as { conflicts: { key: string; accepted: boolean; map: string }[]; placements: unknown };
      const key = start.conflicts.find((conflict) => conflict.map === "Route17")!.key;
      expect(start.conflicts.find((conflict) => conflict.key === key)?.accepted).toBe(false);
      expect((await observedRawPost("{")).status).toBe(400);
      for (const body of [null, [], { key, accepted: "yes" }, { key: 3, accepted: true }]) {
        expect((await observedPost(body)).status).toBe(400);
      }
      expect((await observedPost({ key: "unknown", accepted: true })).status).toBe(404);
      expect(existsSync(path)).toBe(before !== null);
      if (before) expect(readFileSync(path)).toEqual(before);

      const accepted = await observedPost({ key, accepted: true });
      expect(accepted.status).toBe(200);
      expect((await accepted.json() as { acceptedConflicts: string[] }).acceptedConflicts).toContain(key);
      const duplicate = await observedPost({ key, accepted: true });
      expect((await duplicate.json() as { acceptedConflicts: string[] }).acceptedConflicts.filter((value) => value === key)).toHaveLength(1);
      const afterAccept = await (await get("/api/world")).json() as typeof start;
      expect(afterAccept.placements).toEqual(start.placements);
      expect(afterAccept.conflicts.find((conflict) => conflict.key === key)?.accepted).toBe(true);

      const unaccepted = await observedPost({ key, accepted: false });
      expect((await unaccepted.json() as { acceptedConflicts: string[] }).acceptedConflicts).not.toContain(key);
      const afterUnaccept = await (await get("/api/world")).json() as typeof start;
      expect(afterUnaccept.placements).toEqual(start.placements);
      expect(afterUnaccept.conflicts.find((conflict) => conflict.key === key)?.accepted).toBe(false);
    } finally {
      if (observed.lastWritten && existsSync(path) && readFileSync(path).equals(observed.lastWritten)) {
        if (before) {
          if (!observed.lastWritten.equals(before)) writeFileSync(path, before);
        } else {
          unlinkSync(path);
          if (!dirExisted) try { rmdirSync(dir); } catch {}
        }
      } else if (observed.lastWritten) throw new Error("PerfPlus sidecar changed outside this test; refusing to overwrite it");
    }
  });

  describe("POST /api/world/placement", () => {
    it("writes a GBC manual placement, surfaces it on GET, and restores PerfPlus's absent sidecar", async () => {
      const sidecarPath = `${GBC_SUBJECT_ROOT}/.pokemap/world.json`;
      const sidecarDir = `${GBC_SUBJECT_ROOT}/.pokemap`;
      const sidecarDirExisted = existsSync(sidecarDir);
      const before = existsSync(sidecarPath) ? readFileSync(sidecarPath) : null;
      let written: Buffer | null = null;
      try {
        const r = await post("/api/world/placement", { map: "PlayersHouse1F", x: 321, y: -45 });
        written = existsSync(sidecarPath) ? readFileSync(sidecarPath) : null;
        expect(r.status).toBe(200);
        expect(await r.json()).toEqual({ ok: true });
        expect(written).not.toBeNull();
        if (!written) throw new Error("placement response succeeded without writing its sidecar");
        expect(JSON.parse(written.toString("utf8")).manualPlacements.PlayersHouse1F).toEqual({ x: 321, y: -45 });

        const world = await (await get("/api/world")).json() as { placements: Record<string, { x: number; y: number; mapType: string; manual: boolean }> };
        expect(world.placements.PlayersHouse1F).toMatchObject({ x: 321, y: -45, mapType: "INDOOR", manual: true });
      } finally {
        if (before && written) {
          if (existsSync(sidecarPath) && readFileSync(sidecarPath).equals(written) && !written.equals(before)) writeFileSync(sidecarPath, before);
        } else if (!before && written && existsSync(sidecarPath) && readFileSync(sidecarPath).equals(written)) {
          unlinkSync(sidecarPath);
          if (!sidecarDirExisted) try { rmdirSync(sidecarDir); } catch {}
        }
      }
    });

    it("rejects malformed placement bodies", async () => {
      const r = await post("/api/world/placement", { map: "PlayersHouse1F", x: "321", y: -45 });
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ error: expect.stringContaining("expected { map: string, x: number, y: number }") });
    });

    it("rejects null and non-finite coordinates without writing a sidecar", async () => {
      const sidecarPath = `${GBC_SUBJECT_ROOT}/.pokemap/world.json`;
      const sidecarDir = `${GBC_SUBJECT_ROOT}/.pokemap`;
      const sidecarDirExisted = existsSync(sidecarDir);
      const before = existsSync(sidecarPath) ? readFileSync(sidecarPath) : null;
      let written: Buffer | null = null;
      try {
        for (const body of ["null", '{"map":"PlayersHouse1F","x":1e400,"y":0}']) {
          const r = await postRaw("/api/world/placement", body);
          written = existsSync(sidecarPath) ? readFileSync(sidecarPath) : null;
          expect(r.status).toBe(400);
          expect(await r.json()).toMatchObject({ error: expect.stringContaining("expected { map: string, x: number, y: number }") });
        }
        expect(existsSync(sidecarPath)).toBe(before !== null);
        if (before) expect(readFileSync(sidecarPath)).toEqual(before);
      } finally {
        if (before && written && existsSync(sidecarPath) && readFileSync(sidecarPath).equals(written) && !written.equals(before)) {
          writeFileSync(sidecarPath, before);
        } else if (!before && written && existsSync(sidecarPath) && readFileSync(sidecarPath).equals(written)) {
          unlinkSync(sidecarPath);
          if (!sidecarDirExisted) try { rmdirSync(sidecarDir); } catch {}
        }
      }
    });
  });

  describe("GET /api/warps/:map", () => {
    it("pins BurnedTower1F index 2 to B1F index 0 using raw event coordinates", async () => {
      const r = await get("/api/warps/BurnedTower1F");
      expect(r.status).toBe(200);
      const body = await r.json() as ReturnType<typeof buildGbcWarpsPayload>;
      const expected = buildGbcWarpsPayload(openGbcProject(GBC_SUBJECT_ROOT), "BurnedTower1F");
      expect(body).toEqual(expected);
      expect(body.family).toBe("gbc");
      expect(body.warps[2]).toMatchObject({ x: 10, y: 9, mapConst: "BURNED_TOWER_B1F", destWarp: 1,
        destMapName: "BurnedTowerB1F", destEvent: { x: 10, y: 9 } });
      expect(body.warps[2]!.destEvent).toEqual(loadGbcMapEvents(GBC_SUBJECT_ROOT,
        openGbcProject(GBC_SUBJECT_ROOT).map("BurnedTowerB1F")).events.warps[0]);
    });

    it("keeps a named -1 destination edge without a resolved destination event", async () => {
      const body = await (await get("/api/warps/CeladonDeptStoreElevator")).json() as ReturnType<typeof buildGbcWarpsPayload>;
      expect(body.warps[0]).toMatchObject({ x: 1, y: 3, mapConst: "CELADON_DEPT_STORE_1F", destWarp: -1,
        destMapName: "CeladonDeptStore1F" });
      expect(body.warps[0]!.destEvent).toBeUndefined();
    });

    it("rejects malformed and unknown source maps before looking up events", async () => {
      const malformed = await get("/api/warps/%E0%A4%A");
      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toMatchObject({ error: expect.stringContaining("malformed map name") });
      const unknown = await get("/api/warps/NoSuchMap");
      expect(unknown.status).toBe(404);
      expect(await unknown.json()).toEqual({ error: "no map NoSuchMap" });
    });
  });

  describe("GBC dungeon CRUD", () => {
    const snapshotSidecar = () => {
      const dir = `${GBC_SUBJECT_ROOT}/.pokemap`;
      const path = `${dir}/dungeons.json`;
      const dirExisted = existsSync(dir);
      const read = () => existsSync(path) ? readFileSync(path) : null;
      const before = read();
      let lastObserved = before;
      const request = async (call: () => Promise<Response>) => {
        try { return await call(); }
        finally { lastObserved = read(); }
      };
      const restore = () => {
        const current = read();
        const same = (a: Buffer | null, b: Buffer | null) => a === null ? b === null : b !== null && a.equals(b);
        // Preserve a later write that appeared after the last request completed.
        if (same(current, lastObserved) && !same(current, before)) {
          if (before) {
            mkdirSync(dir, { recursive: true });
            writeFileSync(path, before);
          } else if (current) unlinkSync(path);
        }
        if (!dirExisted && existsSync(dir)) try { rmdirSync(dir); } catch {}
      };
      return { path, dir, dirExisted, before, request, restore };
    };

    it("roundtrips explicit and seeded dungeons in the root sidecar, then restores exact prior bytes", async () => {
      const { path, dir, dirExisted, before, request, restore } = snapshotSidecar();
      try {
        const explicit = await request(() => post("/api/dungeons", { name: "D3 explicit", maps: ["BurnedTower1F"] }));
        const afterCreate = existsSync(path) ? readFileSync(path) : null;
        expect(explicit.status).toBe(200);
        const created = await explicit.json() as { id: string; name: string; maps: string[] };
        expect(afterCreate).not.toBeNull();
        if (!afterCreate) throw new Error("dungeon POST did not write its sidecar");
        expect(created).toMatchObject({ name: "D3 explicit", maps: ["BurnedTower1F"] });
        expect(created.id).toEqual(expect.any(String));
        expect(JSON.parse(afterCreate.toString("utf8")).dungeons).toContainEqual(created);
        const list = await (await get("/api/dungeons")).json() as { id: string }[];
        expect(list.some((d) => d.id === created.id)).toBe(true);
        const changed = await request(() => patch(`/api/dungeons/${created.id}`, { name: "D3 changed", maps: ["BurnedTowerB1F"] }));
        expect(changed.status).toBe(200);
        expect(await changed.json()).toMatchObject({ id: created.id, name: "D3 changed", maps: ["BurnedTowerB1F"] });
        const seeded = await request(() => post("/api/dungeons", { name: "D3 seeded", seedMap: "BurnedTower1F" }));
        expect(seeded.status).toBe(200);
        const seedBody = await seeded.json() as { id: string; maps: string[] };
        expect(seedBody.maps).toContain("BurnedTower1F");
        expect(seedBody.maps).toContain("BurnedTowerB1F");
        expect(seedBody.maps).toEqual([...seedBody.maps].sort());
        const deletedExplicit = await request(() => fetch(`http://127.0.0.1:${s.port}/api/dungeons/${created.id}`, { method: "DELETE" }));
        expect(deletedExplicit.status).toBe(200);
        const deletedSeed = await request(() => fetch(`http://127.0.0.1:${s.port}/api/dungeons/${seedBody.id}`, { method: "DELETE" }));
        expect(deletedSeed.status).toBe(200);
        expect((await request(() => fetch(`http://127.0.0.1:${s.port}/api/dungeons/missing`, { method: "DELETE" }))).status).toBe(404);
      } finally {
        restore();
      }
      expect(existsSync(path)).toBe(before !== null);
      if (before) expect(readFileSync(path)).toEqual(before);
      expect(existsSync(dir)).toBe(dirExisted);
    });

    it("rejects invalid create and patch bodies without writing", async () => {
      const { path, dir, dirExisted, before, request, restore } = snapshotSidecar();
      try {
        for (const body of ["null", "[]", "{", '{}', '{"name":" "}', '{"name":5}', '{"name":"x","maps":[1]}', '{"name":"x","seedMap":2}']) {
          const r = await request(() => postRaw("/api/dungeons", body));
          expect(r.status).toBe(400);
          expect(await r.json()).toMatchObject({ error: expect.any(String) });
        }
        for (const body of ["null", "[]", "{", '{"name":" "}', '{"name":5}', '{"maps":[1]}']) {
          const r = await request(() => fetch(`http://127.0.0.1:${s.port}/api/dungeons/missing`, { method: "PATCH", body }));
          expect(r.status).toBe(400);
          expect(await r.json()).toMatchObject({ error: expect.any(String) });
        }
      } finally {
        restore();
      }
      expect(existsSync(path)).toBe(before !== null);
      if (before) expect(readFileSync(path)).toEqual(before);
      expect(existsSync(dir)).toBe(dirExisted);
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
      // `db 2, PIDGEY`; the `2` there is PIDGEY's LEVEL, not a weight (fix
      // round 1, spec review Minor #6b: an earlier version of this comment
      // called it "weight 2 of the section's 7-slot total"). The 45% comes
      // from slots 0 and 2 both being PIDGEY (`probabilities.asm`'s
      // GrassMonProbTable gives those two slots 25% + 20%), and the max
      // level 7 is slot 2's own level 3 plus the +4 grass/water buff.
      const text = readFileSync(`${GBC_SUBJECT_ROOT}/data/wild/johto_grass.asm`, "utf8");
      const routeText = text.slice(text.indexOf("def_grass_wildmons ROUTE_29"));
      const mornBlock = routeText.slice(routeText.indexOf("; morn"), routeText.indexOf("; day"));
      const firstSlot = /db\s+(\d+),\s*(\w+)/.exec(mornBlock);
      expect(firstSlot?.[2]).toBe("PIDGEY");

      const morn = body.sources.find((s) => s.method === "grass" && s.time === "morn")!;
      expect(morn).toBeDefined();
      expect(morn.chances[0]).toEqual({ species: "PIDGEY", percent: 45, minLevel: 2, maxLevel: 7 });

      // Every grass/water source's chances sum to 100% (within float slop) --
      // checked generically over every source of either method, not just the
      // one pinned above. Route29 itself has no water source, so this alone
      // leaves the water branch vacuous (fix round 1, spec review Minor #5).
      for (const s of body.sources) {
        if (s.method === "grass" || s.method === "water") {
          const sum = s.chances.reduce((a, c) => a + c.percent, 0);
          expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.05);
        }
      }
    });

    // Fix round 1, spec review Minor #5: Route32 (grass, water, fish,
    // headbutt -- unlike Route29) exercises the water branch over the real
    // HTTP route, not just the core function directly.
    it("Route32: the water source's chances also sum to 100% -- the water branch runs, unlike the Route29 test above", async () => {
      const r = await get("/api/encounters/Route32");
      expect(r.status).toBe(200);
      const body = await r.json() as { sources: { method: string; chances: { percent: number }[] }[] };
      const water = body.sources.filter((s) => s.method === "water");
      expect(water.length).toBeGreaterThan(0);
      for (const s of water) {
        const sum = s.chances.reduce((a, c) => a + c.percent, 0);
        expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.05);
      }
    });

    // Fix round 1, spec review Minor #5: the two tests above only cover one
    // map each. This walks every one of the 391 maps directly through the
    // core function (no HTTP round-trip, so it stays fast -- see the
    // implementer report for the measured runtime), proving the same fact
    // corpus-wide: all ~800 real grass/water sources sum to 100% within
    // float slop, across every method/time/swarm variant.
    it("every grass/water source across the whole corpus sums to 100% (measured runtime in the implementer report)", () => {
      const proj = openGbcProject(GBC_SUBJECT_ROOT);
      let checked = 0;
      const t0 = performance.now();
      for (const map of proj.maps) {
        for (const s of gbcEncounterSources(proj, map.name)) {
          if (s.method === "grass" || s.method === "water") {
            const sum = s.chances.reduce((a, c) => a + c.percent, 0);
            expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.05);
            checked++;
          }
        }
      }
      const elapsedMs = performance.now() - t0;
      // Deliberate console.log, not a lint violation this repo checks for:
      // the fix round asks the report to state this loop's measured
      // runtime, and this is the one place that runtime is actually timed.
      console.log(`[corpus percent-sum check] ${checked} grass/water sources, ${elapsedMs.toFixed(1)}ms`);
      expect(checked).toBeGreaterThan(0); // vacuous-pass guard
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
      expect(payload.family).toBe("gbc");
      expect(payload.mapName).toBe("Route29");
      expect(payload.sources).toEqual(gbcEncounterSources(proj, "Route29"));
      expect(payload.defects).toEqual(proj.wild().defects);
    });

    // Fix round 1, quality review Important #1: /api/encounters/:map is not
    // a GBC-only path (GBA's own index.ts serves the identical URL pattern
    // with a structurally different { mapName, mapId, methods } shape), the
    // same "same URL, two shapes" situation /api/map/:name and /api/world
    // are already tagged for -- so this response needs family: "gbc" too.
    it("the HTTP response carries family: \"gbc\"", async () => {
      const r = await get("/api/encounters/Route29");
      const body = await r.json() as { family: string };
      expect(body.family).toBe("gbc");
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

    // Fix round 1, spec review Minor #4: the capture is `([^/]+)`, ONE
    // segment (the GBA `/api/where/:species` convention) -- an extra path
    // segment must 404 through the generic fallthrough, not get silently
    // swallowed into the capture the way `.+` would.
    it("/api/where/DUNSPARCE/x is a 404 -- the one-segment capture must not swallow an extra path segment", async () => {
      const r = await get("/api/where/DUNSPARCE/x");
      expect(r.status).toBe(404);
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
