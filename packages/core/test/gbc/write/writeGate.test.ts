import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { addGbcEvent, deleteGbcEvent, moveGbcEvent, type GbcEventEdit, type GbcEventKind } from "../../../src/gbc/edit/events.js";
import { scanObjectConsts } from "../../../src/gbc/load/events.js";
import { openGbcProject, type GbcProject } from "../../../src/gbc/project.js";
import { locateEventCall } from "../../../src/gbc/write/asmSplice.js";
import { commitGbcSave, openGbcEditSession, planGbcSave, type GbcEditSession } from "../../../src/gbc/write/save.js";
import type { GbcMap } from "../../../src/gbc/model/types.js";
import { copyGbcRootToTemp, gbcCorpusRoots, GBC_SUBJECT_ROOT, removeTemp } from "../helpers/corpus.js";

// Plan 7 Task 7: the G5 write gate. Real writes through the real funnel
// (openGbcEditSession -> edit -> planGbcSave -> commitGbcSave) over every map of
// every corpus root, each root copied to a temp dir (never a real root). Every
// round trip must restore the exact original bytes.

// Each phase walks a whole corpus root; report (not hide) any phase that nears this.
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

const KINDS: GbcEventKind[] = ["warp", "coord", "bg", "object"];
const MACRO = { warp: "warp_event", coord: "coord_event", bg: "bg_event", object: "object_event" } as const;
const KEY = { warp: "warps", coord: "coords", bg: "bgs", object: "objects" } as const;
const SYNTH: Record<Exclude<GbcEventKind, "warp" | "object">, string[]> = {
  coord: ["0", "0", "SCENE_X", "ScriptX"],
  bg: ["0", "0", "BGEVENT_READ", "X"],
};

const perKind = () => ({ warp: 0, coord: 0, bg: 0, object: 0 });

interface Pins {
  maps: number;
  layouts: number;
  writable: number;
  nonWritable: string[];
  binaryRoundTrips: number;
  moves: Record<GbcEventKind, number>;
  deleteReAdds: Record<GbcEventKind, number>;
  addDeletes: Record<GbcEventKind, number>;
  objectSkips: string[];
  /** Last event lines add cannot regenerate byte-for-byte (trailing comment / non-canonical spacing): delete+re-add is not attempted. */
  reAddSkips: string[];
  addSkips: string[];
}

// Measured on the first green run. The pret pins are for vanilla pret/pokecrystal @ 3bc8daa:
// a pret bump (or a PerfPlus bump) must re-measure them.
const PINS: Record<"subject" | "pret", Pins> = {
  subject: {
    maps: 391, layouts: 257, writable: 255, nonWritable: ["CeruleanCave2F", "CeruleanCaveB1"], binaryRoundTrips: 255,
    moves: { warp: 384, coord: 44, bg: 223, object: 349 },
    deleteReAdds: { warp: 379, coord: 44, bg: 223, object: 226 },
    addDeletes: { warp: 7, coord: 347, bg: 168, object: 42 },
    objectSkips: [
      "NewBarkTown: const referenced",
      "AzaleaTown: const referenced",
      "CianwoodCity: const referenced",
      "GoldenrodCity: const referenced",
      "OlivineCity: const referenced",
      "Route27: const referenced",
      "Route36: const referenced",
      "Route42: const referenced",
      "CinnabarIsland: sole object with const",
      "Route5: sole object with const",
      "CeruleanCity: const referenced",
      "Route24: sole object with const",
      "CeruleanCaveB1: sole object with const",
      "SproutTower3F: const referenced",
      "TinTower3F: sole object with const",
      "TinTower5F: sole object with const",
      "TinTower6F: sole object with const",
      "TinTower7F: sole object with const",
      "TinTower9F: sole object with const",
      "BurnedTowerB1F: const referenced",
      "RuinsOfAlphOutside: const referenced",
      "RuinsOfAlphKabutoChamber: const referenced",
      "RuinsOfAlphResearchCenter: const referenced",
      "UnionCaveB2F: const referenced",
      "GoldenrodUnderground: const referenced",
      "GoldenrodUndergroundSwitchRoomEntrances: const referenced",
      "IcePathB2FBlackthornSide: sole object with const",
      "WhirlIslandNE: sole object with const",
      "WhirlIslandSW: sole object with const",
      "WhirlIslandLugiaChamber: sole object with const",
      "SilverCaveRoom3: sole object with const",
      "DragonShrine: const referenced",
      "TohjoFalls: sole object with const",
      "OlivineTimsHouse: sole object with const",
      "OlivineGoodRodHouse: sole object with const",
      "Route38EcruteakGate: sole object with const",
      "Route42EcruteakGate: sole object with const",
      "DiglettsCave: sole object with const",
      "MountMoon: sole object with const",
      "WiseTriosRoom: const referenced",
      "EcruteakPokecenter1F: const referenced",
      "EcruteakGym: const referenced",
      "BlackthornEmysHouse: sole object with const",
      "Route19FuchsiaGate: sole object with const",
      "SeafoamGym: const referenced",
      "CeruleanGymBadgeSpeechHouse: sole object with const",
      "BillsHouse: sole object with const",
      "KurtsHouse: const referenced",
      "LakeOfRageHiddenPowerHouse: sole object with const",
      "LakeOfRageMagikarpHouse: sole object with const",
      "Route43MahoganyGate: sole object with const",
      "Route43Gate: const referenced",
      "VioletPokecenter1F: const referenced",
      "Route35NationalParkGate: const referenced",
      "Route36NationalParkGate: const referenced",
      "GoldenrodBikeShop: sole object with const",
      "GoldenrodNameRater: sole object with const",
      "GoldenrodDeptStore4F: const referenced",
      "GoldenrodDeptStore5F: const referenced",
      "GoldenrodGameCorner: const referenced",
      "Route34IlexForestGate: const referenced",
      "VermilionFishingSpeechHouse: sole object with const",
      "VermilionDiglettsCaveSpeechHouse: sole object with const",
      "Route6SaffronGate: sole object with const",
      "RedsHouse1F: sole object with const",
      "BluesHouse: sole object with const",
      "PewterSnoozeSpeechHouse: sole object with const",
      "OlivinePort: const referenced",
      "FastShip1F: const referenced",
      "OlivinePortPassage: sole object with const",
      "VermilionPortPassage: sole object with const",
      "MountMoonSquare: const referenced",
      "MountMoonGiftShop: const line not canonical",
      "TinTowerRoof: sole object with const",
      "WillsRoom: sole object with const",
      "KogasRoom: sole object with const",
      "BrunosRoom: sole object with const",
      "KarensRoom: sole object with const",
      "LancesRoom: const referenced",
      "HallOfFame: sole object with const",
      "FuchsiaPokecenter1F: const referenced",
      "SafariZoneWardensHome: sole object with const",
      "Route15FuchsiaGate: sole object with const",
      "LavenderSpeechHouse: sole object with const",
      "LavenderNameRater: sole object with const",
      "Route8SaffronGate: sole object with const",
      "Route12SuperRodHouse: sole object with const",
      "Pokecenter2F: const referenced",
      "TradeCenter: const referenced",
      "Colosseum: const referenced",
      "TimeCapsule: const referenced",
      "CeladonMansionRoof: sole object with const",
      "CeladonMansionRoofHouse: sole object with const",
      "CeladonPokecenter1F: const referenced",
      "CeladonGameCorner: const referenced",
      "CeladonCafe: const referenced",
      "Route16FuchsiaSpeechHouse: sole object with const",
      "Route16Gate: sole object with const",
      "Route7SaffronGate: sole object with const",
      "Route17Route18Gate: sole object with const",
      "ManiasHouse: sole object with const",
      "CianwoodPharmacy: sole object with const",
      "CianwoodPhotoStudio: sole object with const",
      "PokeSeersHouse: sole object with const",
      "BattleTowerBattleRoom: const referenced",
      "BattleTowerElevator: sole object with const",
      "BattleTowerHallway: sole object with const",
      "TrainerHouseB1F: const referenced",
      "Route2NuggetHouse: sole object with const",
      "Route2Gate: sole object with const",
      "ElmsLab: const referenced",
      "PlayersHouse1F: const referenced",
      "Route26HealHouse: sole object with const",
      "DayOfWeekSiblingsHouse: sole object with const",
      "Route27SandstormHouse: sole object with const",
      "MrPsychicsHouse: sole object with const",
      "CopycatsHouse2F: const line not canonical",
      "Route5UndergroundPathEntrance: sole object with const",
      "Route5SaffronGate: sole object with const",
      "GuideGentsHouse: sole object with const",
      "Route30BerryHouse: sole object with const",
      "MrPokemonsHouse: const referenced",
    ],
    reAddSkips: [
      "CeruleanCave1F warp",
      "CeruleanCave2F warp",
      "CeruleanCaveB1 warp",
      "BurnedTower1F warp",
      "BlackthornGym2F warp",
      "MoveDeletersHouse object",
    ],
    addSkips: [],
  },
  pret: {
    maps: 388, layouts: 254, writable: 254, nonWritable: [], binaryRoundTrips: 254,
    moves: { warp: 381, coord: 44, bg: 223, object: 348 },
    deleteReAdds: { warp: 379, coord: 44, bg: 223, object: 226 },
    addDeletes: { warp: 7, coord: 344, bg: 165, object: 40 },
    objectSkips: [
      "NewBarkTown: const referenced",
      "AzaleaTown: const referenced",
      "CianwoodCity: const referenced",
      "GoldenrodCity: const referenced",
      "OlivineCity: const referenced",
      "Route27: const referenced",
      "Route36: const referenced",
      "Route42: const referenced",
      "CinnabarIsland: sole object with const",
      "Route5: sole object with const",
      "CeruleanCity: const referenced",
      "Route24: sole object with const",
      "SproutTower3F: const referenced",
      "TinTower3F: sole object with const",
      "TinTower5F: sole object with const",
      "TinTower6F: sole object with const",
      "TinTower7F: sole object with const",
      "TinTower9F: sole object with const",
      "BurnedTowerB1F: const referenced",
      "RuinsOfAlphOutside: const referenced",
      "RuinsOfAlphKabutoChamber: const referenced",
      "RuinsOfAlphResearchCenter: const referenced",
      "UnionCaveB2F: const referenced",
      "GoldenrodUnderground: const referenced",
      "GoldenrodUndergroundSwitchRoomEntrances: const referenced",
      "IcePathB2FBlackthornSide: sole object with const",
      "WhirlIslandNE: sole object with const",
      "WhirlIslandSW: sole object with const",
      "WhirlIslandLugiaChamber: sole object with const",
      "SilverCaveRoom3: sole object with const",
      "DragonShrine: const referenced",
      "TohjoFalls: sole object with const",
      "OlivineTimsHouse: sole object with const",
      "OlivineGoodRodHouse: sole object with const",
      "Route38EcruteakGate: sole object with const",
      "Route42EcruteakGate: sole object with const",
      "DiglettsCave: sole object with const",
      "MountMoon: sole object with const",
      "WiseTriosRoom: const referenced",
      "EcruteakPokecenter1F: const referenced",
      "EcruteakGym: const referenced",
      "BlackthornEmysHouse: sole object with const",
      "MoveDeletersHouse: sole object with const",
      "Route19FuchsiaGate: sole object with const",
      "SeafoamGym: const referenced",
      "CeruleanGymBadgeSpeechHouse: sole object with const",
      "BillsHouse: sole object with const",
      "KurtsHouse: const referenced",
      "LakeOfRageHiddenPowerHouse: sole object with const",
      "LakeOfRageMagikarpHouse: sole object with const",
      "Route43MahoganyGate: sole object with const",
      "Route43Gate: const referenced",
      "VioletPokecenter1F: const referenced",
      "Route35NationalParkGate: const referenced",
      "Route36NationalParkGate: const referenced",
      "GoldenrodBikeShop: sole object with const",
      "GoldenrodNameRater: sole object with const",
      "GoldenrodDeptStore4F: const referenced",
      "GoldenrodDeptStore5F: const referenced",
      "GoldenrodGameCorner: const referenced",
      "Route34IlexForestGate: const referenced",
      "VermilionFishingSpeechHouse: sole object with const",
      "VermilionDiglettsCaveSpeechHouse: sole object with const",
      "Route6SaffronGate: sole object with const",
      "RedsHouse1F: sole object with const",
      "BluesHouse: sole object with const",
      "PewterSnoozeSpeechHouse: sole object with const",
      "OlivinePort: const referenced",
      "FastShip1F: const referenced",
      "OlivinePortPassage: sole object with const",
      "VermilionPortPassage: sole object with const",
      "MountMoonSquare: const referenced",
      "MountMoonGiftShop: const line not canonical",
      "TinTowerRoof: sole object with const",
      "WillsRoom: sole object with const",
      "KogasRoom: sole object with const",
      "BrunosRoom: sole object with const",
      "KarensRoom: sole object with const",
      "LancesRoom: const referenced",
      "HallOfFame: sole object with const",
      "FuchsiaPokecenter1F: const referenced",
      "SafariZoneWardensHome: sole object with const",
      "Route15FuchsiaGate: sole object with const",
      "LavenderSpeechHouse: sole object with const",
      "LavenderNameRater: sole object with const",
      "Route8SaffronGate: sole object with const",
      "Route12SuperRodHouse: sole object with const",
      "Pokecenter2F: const referenced",
      "TradeCenter: const referenced",
      "Colosseum: const referenced",
      "TimeCapsule: const referenced",
      "CeladonMansionRoof: sole object with const",
      "CeladonMansionRoofHouse: sole object with const",
      "CeladonPokecenter1F: const referenced",
      "CeladonGameCorner: const referenced",
      "CeladonCafe: const referenced",
      "Route16FuchsiaSpeechHouse: sole object with const",
      "Route16Gate: sole object with const",
      "Route7SaffronGate: sole object with const",
      "Route17Route18Gate: sole object with const",
      "ManiasHouse: sole object with const",
      "CianwoodPharmacy: sole object with const",
      "CianwoodPhotoStudio: sole object with const",
      "PokeSeersHouse: sole object with const",
      "BattleTowerBattleRoom: const referenced",
      "BattleTowerElevator: sole object with const",
      "BattleTowerHallway: sole object with const",
      "TrainerHouseB1F: const referenced",
      "Route2NuggetHouse: sole object with const",
      "Route2Gate: sole object with const",
      "ElmsLab: const referenced",
      "PlayersHouse1F: const referenced",
      "Route26HealHouse: sole object with const",
      "DayOfWeekSiblingsHouse: sole object with const",
      "Route27SandstormHouse: sole object with const",
      "MrPsychicsHouse: sole object with const",
      "CopycatsHouse2F: const line not canonical",
      "Route5UndergroundPathEntrance: sole object with const",
      "Route5SaffronGate: sole object with const",
      "GuideGentsHouse: sole object with const",
      "Route30BerryHouse: sole object with const",
      "MrPokemonsHouse: const referenced",
    ],
    reAddSkips: [
      "BurnedTower1F warp",
      "BlackthornGym2F warp",
    ],
    addSkips: [],
  },
};

const porcelain = (root: string): string => execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" });

/** Every file under `dir` (relative, "/"-separated), `.git` excluded. */
function walk(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(rel ? `${dir}/${rel}` : dir, { withFileTypes: true })) {
    if (e.name === ".git") continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(dir, r));
    else out.push(r);
  }
  return out;
}

const diffIdx = (a: Buffer, b: Buffer): number[] => {
  if (a.length !== b.length) return [-1];
  const d: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d.push(i);
  return d;
};

function gateRoot(root: string, label: "subject" | "pret"): void {
  describe(`G5 write gate: ${label} (${root})`, () => {
    let tmp = "";
    let proj: GbcProject;
    let porcelain0 = "";
    const before = new Map<string, Buffer>();
    const writable: GbcMap[] = [];
    const nonWritable: GbcMap[] = [];
    const stats: Pins = {
      maps: 0, layouts: 0, writable: 0, nonWritable: [], binaryRoundTrips: 0,
      moves: perKind(), deleteReAdds: perKind(), addDeletes: perKind(), objectSkips: [], reAddSkips: [], addSkips: [],
    };

    const disk = (rel: string): Buffer => readFileSync(`${tmp}/${rel}`);
    const snapOf = (rel: string): Buffer => before.get(rel)!;
    const apply = (s: GbcEditSession, e: GbcEventEdit): void => {
      s.eventsText = e.text;
      s.events = e.events;
    };
    const commit = (s: GbcEditSession) => {
      const plan = planGbcSave(proj, s);
      expect(plan.refusals).toEqual([]);
      commitGbcSave(proj, plan);
      return plan;
    };
    const capOf = (m: GbcMap): number => proj.tileset(m.tileset).metatiles.length;

    beforeAll(() => {
      porcelain0 = porcelain(root);
      tmp = copyGbcRootToTemp(root);
      proj = openGbcProject(tmp);
    });
    afterAll(() => {
      if (tmp) removeTemp(tmp);
      expect(porcelain(root)).toBe(porcelain0);
    });

    it("B1 baseline: snapshot maps/ + blocks.asm + attributes.asm; classify distinct layouts", () => {
      for (const f of walk(tmp, "").filter((p) => p.startsWith("maps/"))) before.set(f, disk(f));
      for (const f of ["data/maps/blocks.asm", "data/maps/attributes.asm"]) before.set(f, disk(f));
      stats.maps = proj.maps.length;
      const seen = new Set<string>();
      for (const m of proj.maps) {
        if (seen.has(m.blkPath)) continue;
        seen.add(m.blkPath);
        (proj.layout(m).layout.writable ? writable : nonWritable).push(m);
      }
      stats.layouts = seen.size;
      stats.writable = writable.length;
      stats.nonWritable = nonWritable.map((m) => m.name);
      expect(before.size).toBeGreaterThan(stats.maps);
    });

    it("B2 binary round trip: every writable layout, block 0 changes exactly byte 0, then restores byte-identically", () => {
      const failures: string[] = [];
      for (const m of writable) {
        try {
          const cap = capOf(m);
          const s = openGbcEditSession(proj, m.name);
          const orig = s.blocks[0]!.metatileId;
          const next = (orig + 1) % cap;
          if (next === orig) throw new Error(`cap ${cap} leaves no different id`);
          s.blocks[0] = { metatileId: next };
          const plan = planGbcSave(proj, s);
          if (plan.changes.length !== 1 || plan.changes[0]!.kind !== "binary" || plan.refusals.length !== 0) {
            throw new Error(`plan: ${JSON.stringify(plan.changes)} ${JSON.stringify(plan.refusals)}`);
          }
          commitGbcSave(proj, plan);
          const d = diffIdx(disk(m.blkPath), snapOf(m.blkPath));
          if (d.length !== 1 || d[0] !== 0) throw new Error(`after edit, differing bytes ${JSON.stringify(d.slice(0, 5))}`);

          const back = openGbcEditSession(proj, m.name);
          back.blocks[0] = { metatileId: orig };
          commit(back);
          if (!disk(m.blkPath).equals(snapOf(m.blkPath))) throw new Error("not byte-identical after paint back");
          stats.binaryRoundTrips++;
        } catch (e) {
          failures.push(`${m.name} (${m.blkPath}): ${(e as Error).message}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it("B3 non-writable layouts refuse: layout-not-writable, commit throws, file unchanged", () => {
      for (const m of nonWritable) {
        const s = openGbcEditSession(proj, m.name);
        s.blocks[0] = { metatileId: (s.blocks[0]!.metatileId + 1) % capOf(m) };
        const plan = planGbcSave(proj, s);
        expect(plan.refusals.map((r) => r.code), m.name).toContain("layout-not-writable");
        expect(() => commitGbcSave(proj, plan), m.name).toThrow(/layout-not-writable/);
        expect(disk(m.blkPath).equals(snapOf(m.blkPath)), m.name).toBe(true);
      }
    });

    it("B4 event round trips: every map, all 4 kinds (move, delete-last + re-add, add-then-delete), byte-identical", () => {
      const failures: string[] = [];
      // A donor object_event (any map with one) for synthetic object adds on object-less maps.
      const donor = proj.maps.find((m) => parseDonor(snapOf(`maps/${m.name}.asm`).toString("utf8"), m.name) !== null)!;
      const donorArgs = parseDonor(snapOf(`maps/${donor.name}.asm`).toString("utf8"), donor.name)!;

      for (const map of proj.maps) {
        const rel = `maps/${map.name}.asm`;
        const snap = snapOf(rel);
        for (const kind of KINDS) {
          const where = `${map.name} ${kind}`;
          try {
            let s = openGbcEditSession(proj, map.name);
            const list = s.events[KEY[kind]];
            const n = list.length;
            if (n >= 1) {
              // move event 0 by one tile, then back
              const ev = list[0]!;
              const nx = ev.x + 1 <= 255 ? ev.x + 1 : ev.x - 1;
              apply(s, moveGbcEvent(s.eventsText, map.name, kind, 0, nx, ev.y));
              commit(s);
              const a = snap.toString("utf8").split("\n");
              const b = disk(rel).toString("utf8").split("\n");
              const differing = a.length === b.length ? a.filter((l, i) => l !== b[i]).length : -1;
              if (differing !== 1) throw new Error(`move changed ${differing} line(s), expected exactly 1`);
              s = openGbcEditSession(proj, map.name);
              apply(s, moveGbcEvent(s.eventsText, map.name, kind, 0, ev.x, ev.y));
              commit(s);
              if (!disk(rel).equals(snap)) throw new Error("move back is not byte-identical");
              stats.moves[kind]++;

              // delete the last event, then add it back with its exact argument texts
              s = openGbcEditSession(proj, map.name);
              const args = locateEventCall(s.eventsText, map.name, MACRO[kind], n - 1).args.map((x) => x.text);
              const constName = kind === "object" && s.events.objectConsts.length > 0 ? s.events.objectConsts[n - 1] : undefined;
              // addGbcEvent regenerates the line as `	<macro> <x>, <y>, <rest>` (x/y padded to 2). A line that is not
              // already that exact shape (trailing comment, odd spacing) cannot round-trip, so do not touch it.
              const call = locateEventCall(s.eventsText, map.name, MACRO[kind], n - 1);
              const canon = `	${MACRO[kind]} ${args[0]!.padStart(2)}, ${args[1]!.padStart(2)}, ${args.slice(2).join(", ")}`;
              if (s.eventsText.slice(call.lineStart, call.lineEnd) !== canon) {
                stats.reAddSkips.push(where);
                continue;
              }
              // The same for the const line add re-creates (`	const NAME`): a trailing comment on it is lost.
              if (kind === "object" && constName !== undefined) {
                const cl = scanObjectConsts(s.eventsText)[n - 1]?.line;
                if (cl && s.eventsText.slice(cl.start, cl.end) !== `	const ${constName}`) {
                  stats.objectSkips.push(`${map.name}: const line not canonical`);
                  continue;
                }
              }
              // Deleting the only object empties the const block, and add then (by design) cannot restore a const.
              if (kind === "object" && constName !== undefined && n === 1) {
                stats.objectSkips.push(`${map.name}: sole object with const`);
                continue;
              }
              let del: GbcEventEdit;
              try {
                del = deleteGbcEvent(s.eventsText, map.name, kind, n - 1);
              } catch (e) {
                const msg = (e as Error).message;
                if (kind === "object" && /still referenced/.test(msg)) stats.objectSkips.push(`${map.name}: const referenced`);
                else if (kind === "object" && /out of step/.test(msg)) stats.objectSkips.push(`${map.name}: consts out of step`);
                else throw e;
                continue;
              }
              apply(s, del);
              commit(s);
              s = openGbcEditSession(proj, map.name);
              apply(s, addGbcEvent(s.eventsText, map.name, kind, args, constName === undefined ? {} : { objectConst: constName }));
              commit(s);
              if (!disk(rel).equals(snap)) throw new Error("delete-last + re-add is not byte-identical");
              stats.deleteReAdds[kind]++;
            } else {
              // no events of this kind: add a synthetic line (anchored at the marker), then delete it
              let args: string[];
              if (kind === "warp") args = ["0", "0", proj.maps.find((m) => m.name !== map.name)!.constName, "1"];
              else if (kind === "object") args = donorArgs;
              else args = SYNTH[kind];
              try {
                apply(s, addGbcEvent(s.eventsText, map.name, kind, args));
              } catch (e) {
                if (kind === "object" && /out of step/.test((e as Error).message)) {
                  stats.addSkips.push(`${map.name}: consts out of step`);
                  continue;
                }
                throw e;
              }
              commit(s);
              s = openGbcEditSession(proj, map.name);
              apply(s, deleteGbcEvent(s.eventsText, map.name, kind, s.events[KEY[kind]].length - 1));
              commit(s);
              if (!disk(rel).equals(snap)) throw new Error("add-then-delete is not byte-identical");
              stats.addDeletes[kind]++;
            }
          } catch (e) {
            failures.push(`${where}: ${(e as Error).message}`);
            writeFileSync(`${tmp}/${rel}`, snap); // keep one failure from cascading into the map's other kinds
          }
        }
      }
      expect(failures).toEqual([]);
    });

    it("B5 no stray write: the whole copy equals the real root byte for byte; no .pokemap", () => {
      expect(existsSync(`${tmp}/.pokemap`)).toBe(false);
      const real = walk(root).sort();
      const copy = walk(tmp).sort();
      expect(copy).toEqual(real);
      const diffs = real.filter((f) => !readFileSync(`${root}/${f}`).equals(readFileSync(`${tmp}/${f}`)));
      expect(diffs).toEqual([]);
    });

    it("B6 pinned counts", () => {
      console.log(`GATE-STATS ${label} ${JSON.stringify(stats)}`);
      expect(stats).toEqual(PINS[label]);
    });
  });
}

/** The first object_event's argument texts in `text`, or null when the map has none. */
function parseDonor(text: string, mapName: string): string[] | null {
  try {
    return locateEventCall(text, mapName, "object_event", 0).args.map((a) => a.text);
  } catch {
    return null;
  }
}

const roots = gbcCorpusRoots();
if (roots.length === 0) it.skip("no GBC corpus on this machine", () => {});
for (const root of roots) gateRoot(root, root === GBC_SUBJECT_ROOT ? "subject" : "pret");
