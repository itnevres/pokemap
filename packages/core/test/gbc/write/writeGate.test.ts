import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { addGbcEvent, deleteGbcEvent, moveGbcEvent, type GbcEventEdit, type GbcEventKind } from "../../../src/gbc/edit/events.js";
import { scanObjectConsts } from "../../../src/gbc/load/events.js";
import { openGbcProject, type GbcProject } from "../../../src/gbc/project.js";
import { locateEventCall } from "../../../src/gbc/write/asmSplice.js";
import { commitGbcSave, openGbcEditSession, planGbcSave, type GbcEditSession } from "../../../src/gbc/write/save.js";
import type { GbcMap } from "../../../src/gbc/model/types.js";
import { copyGbcRootToTemp, gbcCorpusRoots, gbcRootLabel, GBC_REFERENCE_ROOTS, GBC_SUBJECT_ROOT, hasGbcProject, removeTemp } from "../helpers/corpus.js";

// Plan 7 Task 7: the G5 write gate. Real writes through the real funnel
// (openGbcEditSession -> edit -> planGbcSave -> commitGbcSave) over every map of
// every corpus root, each root copied to a temp dir (never a real root). Every
// round trip must restore the exact original bytes.
//
// Re-measuring the pins (after a PerfPlus or pret bump): run
//   vitest run packages/core/test/gbc/write/writeGate.test.ts -t B6
// and copy the "GATE-STATS <label> {...}" line into PINS.

const KINDS: GbcEventKind[] = ["warp", "coord", "bg", "object"];
const MACRO = { warp: "warp_event", coord: "coord_event", bg: "bg_event", object: "object_event" } as const;
const KEY = { warp: "warps", coord: "coords", bg: "bgs", object: "objects" } as const;
const SYNTH: Record<"coord" | "bg", string[]> = {
  coord: ["0", "0", "SCENE_X", "ScriptX"],
  bg: ["0", "0", "BGEVENT_READ", "X"],
};

// Per-phase timeouts: B2/B4 walk a whole root (measured 2-60 s on a loaded machine); the rest are quick.
const HEAVY = 180_000;
const LIGHT = 60_000;

type PerKind = Record<GbcEventKind, number>;
const perKind = (warp: number, coord: number, bg: number, object: number): PerKind => ({ warp, coord, bg, object });

interface Pins {
  maps: number;
  layouts: number;
  writable: number;
  nonWritable: string[];
  binaryRoundTrips: number;
  moves: PerKind;
  deleteReAdds: PerKind;
  addDeletes: PerKind;
  /** Last event lines `addGbcEvent` cannot regenerate byte-for-byte (trailing comment / spacing): delete+re-add is not attempted. */
  lineNotCanonical: string[];
  /** Objects whose `const` line has a trailing comment (re-add would drop it). */
  constLineNotCanonical: string[];
  /** Objects whose const name is used elsewhere in the file, so delete refuses. */
  constReferenced: number;
  /** Objects/adds refused because the const list is out of step with the objects. */
  outOfStep: string[];
}

// Measured on the first green run after the F3 marker rule. The pret pins are for vanilla
// pret/pokecrystal @ 3bc8daa; pret shares most numbers with the subject (it lacks the 3 CeruleanCave maps).
const SUBJECT: Pins = {
  maps: 391, layouts: 257, writable: 255, nonWritable: ["CeruleanCave2F", "CeruleanCaveB1"], binaryRoundTrips: 255,
  moves: perKind(384, 44, 223, 349), deleteReAdds: perKind(379, 44, 223, 286), addDeletes: perKind(7, 347, 168, 42),
  lineNotCanonical: ["CeruleanCave1F warp", "CeruleanCave2F warp", "CeruleanCaveB1 warp", "BurnedTower1F warp", "BlackthornGym2F warp", "MoveDeletersHouse object"],
  constLineNotCanonical: ["MountMoonGiftShop", "CopycatsHouse2F"], constReferenced: 60, outOfStep: [],
};
const PINS: Record<"subject" | "pret", Pins> = {
  subject: SUBJECT,
  pret: {
    ...SUBJECT, maps: 388, layouts: 254, writable: 254, nonWritable: [], binaryRoundTrips: 254,
    moves: perKind(381, 44, 223, 348), deleteReAdds: perKind(379, 44, 223, 287), addDeletes: perKind(7, 344, 165, 40),
    lineNotCanonical: ["BurnedTower1F warp", "BlackthornGym2F warp"], constReferenced: 59,
  },
};

/** Belt-and-braces guard on top of the temp-copy isolation: a real root's git status must not change. */
const porcelain = (root: string): string => execFileSync("git", ["--no-optional-locks", "-C", root, "status", "--porcelain"], { encoding: "utf8" });

/** Every file under `dir/sub` (relative to `dir`, "/"-separated); `.git` excluded. */
function walk(dir: string, sub = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(sub ? `${dir}/${sub}` : dir, { withFileTypes: true })) {
    if (e.name === ".git") continue;
    const r = sub ? `${sub}/${e.name}` : e.name;
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

/** Runs `f`, prefixing any failure with the sub-step name so a failure names where it broke. */
function at<T>(step: string, f: () => T): T {
  try {
    return f();
  } catch (e) {
    throw new Error(`${step}: ${(e as Error).message}`);
  }
}

/** The first object_event's argument texts in `text`, or null when the map has none. */
function firstObjectArgs(text: string, mapName: string): string[] | null {
  try {
    return locateEventCall(text, mapName, "object_event", 0).args.map((a) => a.text);
  } catch {
    return null;
  }
}

function gateRoot(root: string): void {
  const label = gbcRootLabel(root);
  const pins = PINS[label];
  describe(`G5 write gate: ${label} (${root})`, () => {
    let tmp = "";
    let proj: GbcProject;
    let porcelain0 = "";
    const before = new Map<string, Buffer>();
    const writable: GbcMap[] = [];
    const nonWritable: GbcMap[] = [];
    const stats: Pins = {
      maps: 0, layouts: 0, writable: 0, nonWritable: [], binaryRoundTrips: 0,
      moves: perKind(0, 0, 0, 0), deleteReAdds: perKind(0, 0, 0, 0), addDeletes: perKind(0, 0, 0, 0),
      lineNotCanonical: [], constLineNotCanonical: [], constReferenced: 0, outOfStep: [],
    };

    const disk = (rel: string): Buffer => readFileSync(`${tmp}/${rel}`);
    const snapOf = (rel: string): Buffer => {
      const b = before.get(rel);
      if (!b) throw new Error(`no snapshot for ${rel}`);
      return b;
    };
    const apply = (s: GbcEditSession, e: GbcEventEdit): void => {
      s.eventsText = e.text;
      s.events = e.events;
    };
    const commit = (s: GbcEditSession): void => {
      const plan = planGbcSave(proj, s);
      if (plan.refusals.length > 0) throw new Error(`plan refused: ${plan.refusals.map((r) => r.code).join(", ")}`);
      commitGbcSave(proj, plan);
    };
    const capOf = (m: GbcMap): number => proj.tileset(m.tileset).metatiles.length;

    // ---- B4 building blocks. Each throws on a failed expectation (message prefixed with the sub-step). ----

    /** Move event 0 one tile; exactly event 0's line differs on disk; move it back; byte-identical. */
    function moveRoundTrip(map: GbcMap, kind: GbcEventKind): void {
      const rel = `maps/${map.name}.asm`;
      const snap = snapOf(rel);
      const s = openGbcEditSession(proj, map.name);
      const ev = s.events[KEY[kind]][0]!;
      const wantLine = locateEventCall(s.eventsText, map.name, MACRO[kind], 0).lineIndex;
      const nx = ev.x + 1 <= 255 ? ev.x + 1 : ev.x - 1;
      at("move", () => {
        apply(s, moveGbcEvent(s.eventsText, map.name, kind, 0, nx, ev.y));
        commit(s);
      });
      const a = snap.toString("utf8").split("\n");
      const b = disk(rel).toString("utf8").split("\n");
      const differing = a.length === b.length ? a.flatMap((l, i) => (l !== b[i] ? [i] : [])) : [-1];
      if (differing.length !== 1 || differing[0] !== wantLine) {
        throw new Error(`move: differing line(s) ${JSON.stringify(differing.slice(0, 5))}, expected only [${wantLine}] (event 0)`);
      }
      at("move back", () => {
        const back = openGbcEditSession(proj, map.name);
        apply(back, moveGbcEvent(back.eventsText, map.name, kind, 0, ev.x, ev.y));
        commit(back);
      });
      if (!disk(rel).equals(snap)) throw new Error("move back: not byte-identical");
    }

    /** Delete the last event, re-add it with its exact argument texts. Returns a skip reason when the line cannot round-trip, else null. */
    function deleteReAdd(map: GbcMap, kind: GbcEventKind, n: number): string | null {
      const rel = `maps/${map.name}.asm`;
      const snap = snapOf(rel);
      let s = openGbcEditSession(proj, map.name);
      const call = locateEventCall(s.eventsText, map.name, MACRO[kind], n - 1);
      const args = call.args.map((x) => x.text);
      const constName = kind === "object" && s.events.objectConsts.length > 0 ? s.events.objectConsts[n - 1] : undefined;
      // addGbcEvent regenerates the line as `\t<macro> <x>, <y>, <rest>` (x/y padded to 2); a line not already that exact shape cannot round-trip.
      const canon = `\t${MACRO[kind]} ${args[0]!.padStart(2)}, ${args[1]!.padStart(2)}, ${args.slice(2).join(", ")}`;
      if (s.eventsText.slice(call.lineStart, call.lineEnd) !== canon) {
        stats.lineNotCanonical.push(`${map.name} ${kind}`);
        return "line";
      }
      // The same for the const line add re-creates (`\tconst NAME`): a trailing comment on it is lost.
      if (kind === "object" && constName !== undefined) {
        const cl = scanObjectConsts(s.eventsText)[n - 1]?.line;
        if (cl && s.eventsText.slice(cl.start, cl.end) !== `\tconst ${constName}`) {
          stats.constLineNotCanonical.push(map.name);
          return "const-line";
        }
      }
      let del: GbcEventEdit;
      try {
        del = deleteGbcEvent(s.eventsText, map.name, kind, n - 1);
      } catch (e) {
        const msg = (e as Error).message;
        if (kind === "object" && /still referenced/.test(msg)) stats.constReferenced++;
        else if (kind === "object" && /out of step/.test(msg)) stats.outOfStep.push(`${map.name} delete`);
        else throw new Error(`delete: ${msg}`);
        return "refused";
      }
      at("delete", () => {
        apply(s, del);
        commit(s);
      });
      at("re-add", () => {
        s = openGbcEditSession(proj, map.name);
        apply(s, addGbcEvent(s.eventsText, map.name, kind, args, constName === undefined ? {} : { objectConst: constName }));
        commit(s);
      });
      if (!disk(rel).equals(snap)) throw new Error("re-add: not byte-identical to the original");
      return null;
    }

    /** Add a synthetic event of a kind the map has none of, then delete it. Returns a skip reason when add refuses (out-of-step consts). */
    function addDelete(map: GbcMap, kind: GbcEventKind, donorArgs: string[]): string | null {
      const rel = `maps/${map.name}.asm`;
      let s = openGbcEditSession(proj, map.name);
      let args: string[];
      if (kind === "warp") args = ["0", "0", proj.maps.find((m) => m.name !== map.name)!.constName, "1"];
      else if (kind === "object") args = donorArgs;
      else args = SYNTH[kind];
      try {
        apply(s, addGbcEvent(s.eventsText, map.name, kind, args));
      } catch (e) {
        if (kind === "object" && /out of step/.test((e as Error).message)) {
          stats.outOfStep.push(`${map.name} add`);
          return "refused";
        }
        throw new Error(`add: ${(e as Error).message}`);
      }
      at("add", () => commit(s));
      at("delete added", () => {
        s = openGbcEditSession(proj, map.name);
        apply(s, deleteGbcEvent(s.eventsText, map.name, kind, s.events[KEY[kind]].length - 1));
        commit(s);
      });
      if (!disk(rel).equals(snapOf(rel))) throw new Error("delete added: not byte-identical to the original");
      return null;
    }

    beforeAll(() => {
      porcelain0 = porcelain(root);
      tmp = copyGbcRootToTemp(root);
      proj = openGbcProject(tmp);
    }, HEAVY);
    afterAll(() => {
      try {
        expect(porcelain(root)).toBe(porcelain0);
      } finally {
        if (tmp) removeTemp(tmp);
      }
    });

    it("B1 baseline: snapshot maps/ + blocks.asm + attributes.asm; classify distinct layouts", () => {
      for (const f of walk(tmp, "maps")) before.set(f, disk(f));
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
    }, LIGHT);

    it("B2 binary round trip: every writable layout, block 0 changes exactly byte 0, then restores byte-identically", () => {
      expect(writable.length, "writable layouts (B1 classification)").toBe(pins.writable);
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
          if (!plan.changes[0]!.path.endsWith(`/${m.blkPath}`)) throw new Error(`plan targets ${plan.changes[0]!.path}, not ${m.blkPath}`);
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
      expect(failures.slice(0, 20), `${failures.length} failure(s)`).toEqual([]);
    }, HEAVY);

    it("B3 non-writable layouts refuse: layout-not-writable, commit throws, file unchanged", () => {
      expect(nonWritable.map((m) => m.name), "non-writable layouts (B1 classification)").toEqual(pins.nonWritable);
      for (const m of nonWritable) {
        const s = openGbcEditSession(proj, m.name);
        s.blocks[0] = { metatileId: (s.blocks[0]!.metatileId + 1) % capOf(m) };
        const plan = planGbcSave(proj, s);
        expect(plan.refusals.map((r) => r.code), m.name).toContain("layout-not-writable");
        expect(() => commitGbcSave(proj, plan), m.name).toThrow(/layout-not-writable/);
        expect(disk(m.blkPath).equals(snapOf(m.blkPath)), m.name).toBe(true);
      }
    }, LIGHT);

    it("B4 event round trips: every map, all 4 kinds (move, delete-last + re-add, add-then-delete), byte-identical", () => {
      const failures: string[] = [];
      // A donor object_event (any map with one) for synthetic object adds on object-less maps.
      const donor = proj.maps.find((m) => firstObjectArgs(snapOf(`maps/${m.name}.asm`).toString("utf8"), m.name) !== null)!;
      const donorArgs = firstObjectArgs(snapOf(`maps/${donor.name}.asm`).toString("utf8"), donor.name)!;

      for (const map of proj.maps) {
        for (const kind of KINDS) {
          try {
            const n = openGbcEditSession(proj, map.name).events[KEY[kind]].length;
            if (n >= 1) {
              moveRoundTrip(map, kind);
              stats.moves[kind]++;
              if (deleteReAdd(map, kind, n) === null) stats.deleteReAdds[kind]++;
            } else if (addDelete(map, kind, donorArgs) === null) {
              stats.addDeletes[kind]++;
            }
          } catch (e) {
            // The copy is deliberately left dirty after a failure: B5 then goes red too, so a broken write cannot hide there.
            failures.push(`${map.name} ${kind}: ${(e as Error).message}`);
          }
        }
      }
      expect(failures.slice(0, 20), `${failures.length} failure(s)`).toEqual([]);
    }, HEAVY);

    it("B5 no stray write: the whole copy equals the real root byte for byte; no .pokemap", () => {
      expect(existsSync(`${tmp}/.pokemap`)).toBe(false);
      const real = new Set(walk(root));
      const copy = new Set(walk(tmp));
      expect([...copy].filter((f) => !real.has(f)).slice(0, 20), "files only in the copy").toEqual([]);
      expect([...real].filter((f) => !copy.has(f)).slice(0, 20), "files missing from the copy").toEqual([]);
      const diffs = [...real].filter((f) => !readFileSync(`${root}/${f}`).equals(readFileSync(`${tmp}/${f}`)));
      expect(diffs.slice(0, 20), `${diffs.length} differing file(s)`).toEqual([]);
    }, LIGHT);

    it("B6 pinned counts", () => {
      console.log(`GATE-STATS ${label} ${JSON.stringify(stats)}`);
      expect(stats).toEqual(pins);
    }, LIGHT);
  });
}

const roots = gbcCorpusRoots();
if (!hasGbcProject(GBC_SUBJECT_ROOT)) {
  it.skip("no GBC corpus on this machine", () => {});
} else {
  // A configured reference root that is not checked out must fail loudly, not silently shrink the gate.
  it("every configured corpus root is present", () => {
    expect(roots).toEqual([GBC_SUBJECT_ROOT, ...GBC_REFERENCE_ROOTS]);
  });
  for (const root of roots) gateRoot(root);
}
