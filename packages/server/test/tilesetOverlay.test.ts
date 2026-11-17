/** Task 10a oracle: expectations are earlier HTTP PNGs, response versions and disk bytes. */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openProject, type Project } from "@pokemap/core/src/project.js";
import { openGbcProject, type GbcProject } from "@pokemap/core/src/gbc/project.js";
import { canonicalTilesetPath } from "@pokemap/core/src/blockEdit/canonicalTilesetPath.js";
import { gbcTilesetsForFile } from "@pokemap/core/src/blockEdit/usage.js";
import type { FileOverlay, TilesetFileEdit } from "@pokemap/core/src/blockEdit/types.js";
import * as saves from "@pokemap/core/src/write/save.js";
import * as gbcSaves from "@pokemap/core/src/gbc/write/save.js";
import { stageTilesetPlan, type BlockEditPlan, type OwnershipEntry } from "../src/blockEditOwnership.js";
import * as overlay from "../src/tilesetOverlay.js";
import { createProjectHandler } from "../src/index.js";
import { createGbcProjectHandler } from "../src/gbcRoutes.js";
import * as editSessions from "../src/editSessions.js";
import * as gbcEditSessions from "../src/gbcEditSessions.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { copyGbaTilesetProject, removeGbaTemp } from "@pokemap/core/test/helpers/gbaTilesetProject.js";
import {
  copyGbcSubjectToTemp, removeTemp, hasGbcProject, GBC_SUBJECT_ROOT,
} from "@pokemap/core/test/gbc/helpers/corpus.js";

const NEW_METATILE = Buffer.alloc(16, 0x5a);
const buildPlan = (
  edits: TilesetFileEdit[],
  placement?: { x: number; y: number; blockId: number },
): BlockEditPlan => ({
  edits,
  ...(placement === undefined ? {} : { placement }),
  warnings: [],
  usage: { files: [], tilesets: [], maps: [], sharedGrids: [] },
  confirm: false,
  revision: "",
});
const appendPlan = (path: string, before: Buffer): BlockEditPlan =>
  buildPlan([{ path, before, after: Buffer.concat([before, NEW_METATILE]) }]);
const restoreBytes = (paths: string[]) => {
  const snapshot = paths.map(path => [path, readFileSync(path)] as const);
  return () => {
    for (const [path, bytes] of snapshot) writeFileSync(path, bytes);
  };
};

interface Subject {
  name: string;
  path: string;
  grid: string;
  metatileName: string;
  offset: number;
  id: number;
}
interface VisibleEdit extends Subject {
  plan: BlockEditPlan;
  originalPng: Buffer;
  /** The HTTP PNG of the metatile whose bytes this edit copies in, fetched before staging. */
  replacementPng: Buffer;
}
const versionOf = (body: { tilesetVersion?: unknown }): number => {
  expect(typeof body.tilesetVersion, "HTTP tilesetVersion is numeric").toBe("number");
  return body.tilesetVersion as number;
};

for (const family of ["gba", "gbc"] as const) {
  const present = family === "gba" ? hasProject(SUBJECT_ROOT) : hasGbcProject(GBC_SUBJECT_ROOT);
  describe.skipIf(!present)(`${family.toUpperCase()} tileset overlay lifecycle (Task 10)`, () => {
    let root: string;
    let server: Server | undefined;
    let base: string;
    let gba: Project;
    let gbc: GbcProject;
    let store: ReturnType<typeof editSessions.createEditSessionStore>
      | ReturnType<typeof gbcEditSessions.createGbcEditSessionStore>;
    let restore: (() => void) | undefined;

    const req = async (path: string, body?: unknown) => {
      const response = await fetch(base + path, body === undefined ? {} : {
        method: "POST", body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() as any };
    };
    const ok = async (path: string, body?: unknown) => {
      const result = await req(path, body);
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      return result.body;
    };
    const edit = (name: string, route: string, body?: unknown) =>
      ok(`/api/edit/${encodeURIComponent(name)}/${route}`, body);
    const mapGet = (name: string) => ok(`/api/map/${encodeURIComponent(name)}`);
    const png = async (path: string) => {
      const response = await fetch(base + path);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type")).toContain("image/png");
      return Buffer.from(await response.arrayBuffer());
    };
    const render = (name: string) => png(`/api/render/${encodeURIComponent(name)}.png`);
    const metatile = (subject: Subject, id = subject.id) =>
      png(`/api/metatile/${encodeURIComponent(subject.metatileName)}/${id}.png`);
    // An empty stroke (begin + end, no apply) answers through the existing HTTP payload
    // builder without staging anything or leaving a stroke open across undo/redo.
    const stagedPayload = async (name: string) => {
      await edit(name, "paint/begin", {});
      return edit(name, "paint/end", {});
    };
    const stage = (candidate: VisibleEdit, owner = candidate.name) =>
      stageTilesetPlan(store, owner, candidate.plan, "overlay oracle edit");

    beforeEach(async () => {
      root = (family === "gba" ? copyGbaTilesetProject() : copyGbcSubjectToTemp()).replace(/\\/g, "/");
      if (family === "gba") {
        gba = openProject(root);
        const factory = editSessions.createEditSessionStore;
        vi.spyOn(editSessions, "createEditSessionStore").mockImplementation(project => {
          store = factory(project);
          return store;
        });
        server = createServer(createProjectHandler(root).handle);
      } else {
        gbc = openGbcProject(root);
        const factory = gbcEditSessions.createGbcEditSessionStore;
        vi.spyOn(gbcEditSessions, "createGbcEditSessionStore").mockImplementation(project => {
          store = factory(project);
          return store;
        });
        server = createServer(createGbcProjectHandler(root).handle);
      }
      await new Promise<void>(done => server!.listen(0, "127.0.0.1", done));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    }, 120_000);
    afterEach(async () => {
      try {
        restore?.();
        restore = undefined;
      } finally {
        if (server) await new Promise<void>(done => server!.close(() => done()));
        server = undefined;
        vi.restoreAllMocks();
        if (root) (family === "gba" ? removeGbaTemp : removeTemp)(root);
      }
    });

    async function* subjects(names?: string[]): AsyncGenerator<Subject> {
      const allNames = names ?? (family === "gba" ? gba.mapNames() : gbc.maps.map(map => map.name));
      for (const name of [...allNames].sort()) {
        const body = await mapGet(name);
        const ids = [...new Set<number>(body.blocks.map((block: { metatileId: number }) => block.metatileId))];
        for (const id of ids) {
          if (family === "gba") {
            const layout = gba.layoutForMap(name);
            const split = gba.splitFor(layout).metatiles;
            const offset = id >= split ? split : 0;
            const symbol = id >= split ? layout.secondaryTileset : layout.primaryTileset;
            yield {
              name, id, offset, metatileName: layout.name,
              path: canonicalTilesetPath(gba.tilesetPaths(symbol).metatilesBin),
              grid: layout.blockdataFilepath,
            };
          } else {
            const map = gbc.map(name);
            yield {
              name, id, offset: 0, metatileName: name, grid: map.blkPath,
              path: canonicalTilesetPath(gbc.tileset(map.tileset).metatilesPath),
            };
          }
        }
      }
    }

    // Find a different-looking saved metatile in the SAME rendering context.
    // Copy only its 16 on-disk tile entries over an id actually used by the grid.
    // No renderer/planner/overlay internals supply expected bytes.
    const visibleEdit = async (subject: Subject): Promise<VisibleEdit | undefined> => {
      const before = readFileSync(resolve(root, subject.path));
      const local = subject.id - subject.offset;
      if (local < 0 || (local + 1) * 16 > before.length) return undefined;
      const originalPng = await metatile(subject);
      for (let other = 0; other < before.length / 16; other++) {
        if (other === local) continue;
        const replacement = before.subarray(other * 16, (other + 1) * 16);
        if (replacement.equals(before.subarray(local * 16, (local + 1) * 16))) continue;
        const replacementPng = await metatile(subject, subject.offset + other);
        if (replacementPng.equals(originalPng)) continue;
        const after = Buffer.from(before);
        replacement.copy(after, local * 16);
        return {
          ...subject, originalPng, replacementPng,
          plan: buildPlan([{ path: subject.path, before, after }]),
        };
      }
      return undefined;
    };
    const findEdits = async (count: number): Promise<VisibleEdit[]> => {
      const found: VisibleEdit[] = [];
      for await (const subject of subjects()) {
        if (found.some(candidate => candidate.path === subject.path || candidate.name === subject.name)) continue;
        const candidate = await visibleEdit(subject);
        if (candidate) found.push(candidate);
        if (found.length === count) return found;
      }
      throw new Error(`${family}: need ${count} maps on distinct metatiles files with visible edits`);
    };
    // Same discovery, but only maps whose event source exists and whose object
    // list is not near the family cap: case C creates an event in the same
    // session after staging (GBC refuses at 15 objects, GBA has a larger cap).
    const findEventEdit = async (): Promise<VisibleEdit> => {
      for await (const subject of subjects()) {
        const eventSource = family === "gba"
          ? gba.paths.mapScriptsInc(subject.name)
          : `${root}/maps/${subject.name}.asm`;
        if (!existsSync(resolve(root, eventSource))) continue;
        const objects = family === "gba"
          ? gba.map(subject.name).objectEvents.length
          : ((await mapGet(subject.name)).events.objects as unknown[]).length;
        if (objects >= (family === "gba" ? 40 : 12)) continue;
        const candidate = await visibleEdit(subject);
        if (candidate) return candidate;
      }
      throw new Error(`${family}: no visible edit on a map with an event source file`);
    };

    it("1: unions two owners of different files and restores both renders on discard", async () => {
      const [a, b] = await findEdits(2) as [VisibleEdit, VisibleEdit];
      expect(a.path).not.toBe(b.path);
      const beforeA = await render(a.name);
      const beforeB = await render(b.name);
      stage(a);
      stage(b);
      expect(await render(a.name)).not.toEqual(beforeA);
      expect(await render(b.name)).not.toEqual(beforeB);
      // Each file must be present even when the maps also share their other tileset half.
      expect(await metatile(a)).toEqual(a.replacementPng);
      expect(await metatile(b)).toEqual(b.replacementPng);
      expect(await metatile(a)).not.toEqual(a.originalPng);
      expect(await metatile(b)).not.toEqual(b.originalPng);
      await edit(a.name, "discard", {});
      await edit(b.name, "discard", {});
      expect(await render(a.name)).toEqual(beforeA);
      expect(await render(b.name)).toEqual(beforeB);
      expect(await metatile(a)).toEqual(a.originalPng);
      expect(await metatile(b)).toEqual(b.originalPng);
    }, 120_000);

    it("3 + 5: metatile PNG and numeric versions follow stage, undo, redo and discard", async () => {
      const [candidate] = await findEdits(1) as [VisibleEdit];
      const original = candidate.originalPng;
      const originalRender = await render(candidate.name);
      const initial = versionOf(await mapGet(candidate.name));
      stage(candidate);
      let previous = versionOf(await stagedPayload(candidate.name));
      expect(previous).toBeGreaterThan(initial);
      expect(versionOf(await mapGet(candidate.name))).toBe(previous);
      const staged = await metatile(candidate);
      expect(staged).toEqual(candidate.replacementPng);
      expect(staged).not.toEqual(original);
      expect(await render(candidate.name)).not.toEqual(originalRender);
      for (const [action, expected] of [
        ["undo", original], ["redo", candidate.replacementPng], ["discard", original],
      ] as const) {
        const current = versionOf(await edit(candidate.name, action, {}));
        expect(current).toBeGreaterThan(previous);
        expect(versionOf(await mapGet(candidate.name))).toBe(current);
        expect(await metatile(candidate)).toEqual(expected);
        previous = current;
      }
      expect(await render(candidate.name)).toEqual(originalRender);
      // V2/V4 also cover the two responses when no session is open.
      for (const action of ["undo", "redo"] as const) {
        expect(versionOf(await edit(candidate.name, action, {}))).toBe(previous);
        expect(versionOf(await mapGet(candidate.name))).toBe(previous);
      }
    }, 120_000);

    for (const succeeds of [true, false]) {
      it(`4: ${succeeds ? "successful" : "failed"} save preserves staged pixels and correct version`, async () => {
        const [candidate] = await findEdits(1) as [VisibleEdit];
        const paths = [resolve(root, candidate.path), resolve(root, candidate.grid)];
        restore = restoreBytes(paths);
        try {
          const original = await render(candidate.name);
          stage(candidate);
          const beforeCommit = versionOf(await stagedPayload(candidate.name));
          const staged = await render(candidate.name);
          expect(staged).not.toEqual(original);
          expect(await metatile(candidate)).toEqual(candidate.replacementPng);
          const plan = await edit(candidate.name, "plan");
          expect(plan.refusals).toEqual([]);
          expect(typeof plan.fingerprint).toBe("string");
          expect(plan.fingerprint.length).toBeGreaterThan(0);
          if (!succeeds) {
            const path = resolve(root, candidate.path);
            writeFileSync(path, Buffer.concat([readFileSync(path), Buffer.alloc(16, 0x11)]));
          }
          const syncSpy = vi.spyOn(overlay, "syncTilesetOverlay");
          syncSpy.mockClear();
          const committed = await req(`/api/edit/${encodeURIComponent(candidate.name)}/commit`, {
            fingerprint: plan.fingerprint,
          });
          // Read the spy before any later request, which would sync again.
          const synced = syncSpy.mock.results.map(result => result.value);
          if (succeeds) {
            expect(committed.status, JSON.stringify(committed.body)).toBe(200);
            expect(synced.length).toBeGreaterThan(0);
            expect(synced.at(-1)!).toBeGreaterThan(beforeCommit);
          } else {
            expect(committed.status).not.toBe(200);
          }
          expect(await render(candidate.name)).toEqual(staged);
          if (succeeds) expect(await metatile(candidate)).toEqual(candidate.replacementPng);
          const next = versionOf(await mapGet(candidate.name));
          if (succeeds) expect(next).toBeGreaterThan(beforeCommit);
          else expect(next).toBe(beforeCommit);
        } finally {
          restore();
          restore = undefined;
        }
      }, 120_000);
    }

    it("4b: a writer failure syncs at the pre-commit version and keeps the staged pixels", async () => {
      const [candidate] = await findEdits(1) as [VisibleEdit];
      const paths = [resolve(root, candidate.path), resolve(root, candidate.grid)];
      restore = restoreBytes(paths);
      try {
        stage(candidate);
        const beforeCommit = versionOf(await stagedPayload(candidate.name));
        const staged = await render(candidate.name);
        const plan = await edit(candidate.name, "plan");
        expect(plan.refusals).toEqual([]);
        if (family === "gba") {
          vi.spyOn(saves, "commitSave")
            .mockImplementationOnce(() => { throw new Error("injected writer failure"); });
        } else {
          vi.spyOn(gbcSaves, "commitGbcSave")
            .mockImplementationOnce(() => { throw new Error("injected writer failure"); });
        }
        const syncSpy = vi.spyOn(overlay, "syncTilesetOverlay");
        syncSpy.mockClear();
        const committed = await req(`/api/edit/${encodeURIComponent(candidate.name)}/commit`, {
          fingerprint: plan.fingerprint,
        });
        // Read the spy before any later request, which would sync again.
        const synced = syncSpy.mock.results.map(result => result.value);
        expect(committed.status, JSON.stringify(committed.body)).not.toBe(200);
        expect(synced.length).toBeGreaterThan(0);
        expect(synced.at(-1)!).toBe(beforeCommit);
        expect(store.has(candidate.name)).toBe(true);
        expect(await render(candidate.name)).toEqual(staged);
        expect(await metatile(candidate)).toEqual(candidate.replacementPng);
      } finally {
        restore();
        restore = undefined;
      }
    }, 120_000);

    it("4c: creating an event keeps the staged tileset bytes usable", async () => {
      const candidate = await findEventEdit();
      const eventSource = family === "gba"
        ? gba.paths.mapScriptsInc(candidate.name)
        : `${root}/maps/${candidate.name}.asm`;
      restore = restoreBytes([
        resolve(root, candidate.path),
        resolve(root, candidate.grid),
        resolve(root, eventSource),
        ...(family === "gba" ? [resolve(root, gba.paths.mapJson(candidate.name))] : []),
      ]);
      // The tileset temp copy carries no charmap; script text needs it (temp copy only).
      if (family === "gba") copyFileSync(resolve(SUBJECT_ROOT, "charmap.txt"), resolve(root, "charmap.txt"));
      try {
        stage(candidate);
        const staged = await render(candidate.name);
        // A new-script NPC needs no new flag or var; body copied from the 14.1 route tests.
        const body = family === "gba"
          ? {
            kind: "object", objectType: "npc", x: 1, y: 1,
            fields: { sprite: "OBJ_EVENT_GFX_YOUNGSTER" },
            script: { mode: "new", label: `${candidate.name}_EventScript_PokemapOverlayOracle`, text: "HELLO" },
          }
          : {
            kind: "object", objectType: "npc", x: 1, y: 1,
            fields: { sprite: "SPRITE_YOUNGSTER" },
            script: { mode: "new", label: `${candidate.name}PokemapOverlayOracle`, text: "HELLO" },
          };
        await edit(candidate.name, "event/create", body);
        const edits = store.open(candidate.name).session.tilesetEdits ?? [];
        expect(edits.length).toBeGreaterThan(0);
        for (const tilesetEdit of edits) expect(Buffer.isBuffer(tilesetEdit.after)).toBe(true);
        expect(await render(candidate.name)).toEqual(staged);
        expect(await metatile(candidate)).toEqual(candidate.replacementPng);
        await edit(candidate.name, "undo", {});
        expect(await metatile(candidate)).toEqual(candidate.replacementPng);
        await edit(candidate.name, "undo", {});
        expect(await metatile(candidate)).toEqual(candidate.originalPng);
        await edit(candidate.name, "redo", {});
        await edit(candidate.name, "redo", {});
        expect(await metatile(candidate)).toEqual(candidate.replacementPng);
        const plan = await edit(candidate.name, "plan");
        expect(plan.refusals).toEqual([]);
        const committed = await req(`/api/edit/${encodeURIComponent(candidate.name)}/commit`, {
          fingerprint: plan.fingerprint,
        });
        expect(committed.status, JSON.stringify(committed.body)).toBe(200);
        expect(readFileSync(resolve(root, candidate.path))).toEqual(candidate.plan.edits[0]!.after);
      } finally {
        restore();
        restore = undefined;
      }
    }, 120_000);

    if (family === "gbc") {
      it("2: a first render on another tileset const sees the shared-file edit", async () => {
        let alias: { owner: string; candidate: VisibleEdit } | undefined;
        for await (const subject of subjects()) {
          const consts = gbcTilesetsForFile(gbc, subject.path);
          if (consts.length < 2) continue;
          const targetConst = gbc.map(subject.name).tileset;
          const owner = gbc.maps.find(map => map.tileset !== targetConst
            && consts.includes(map.tileset));
          if (!owner) continue;
          const candidate = await visibleEdit(subject);
          if (candidate) {
            alias = { owner: owner.name, candidate };
            break;
          }
        }
        if (!alias) throw new Error("GBC: no visible metatiles alias across two used tileset consts");
        const { owner, candidate } = alias;
        expect(gbcTilesetsForFile(gbc, candidate.path).length).toBeGreaterThanOrEqual(2);
        expect(gbc.map(owner).tileset).not.toBe(gbc.map(candidate.name).tileset);
        stage(candidate, owner);
        // subjects/visibleEdit used map GET/metatile only: this map's first render is AFTER stage.
        const staged = await render(candidate.name);
        await edit(owner, "discard", {});
        const original = await render(candidate.name);
        expect(staged).not.toEqual(original);
      }, 120_000);

      it("2b: coverage follows a staged collision edit and returns on discard", async () => {
        const coverageBefore = await ok("/api/coverage");
        const constantsPath = resolve(root, "constants/collision_constants.asm");
        const constants = readFileSync(constantsPath, "utf8");
        const values = new Map<string, number>();
        for (const match of constants.matchAll(/^\s*DEF\s+(COLL_[A-Za-z0-9_]+)\s+EQU\s+(\S+)/gm)) {
          const raw = match[2]!;
          const value = raw.startsWith("$") ? Number.parseInt(raw.slice(1), 16) : Number(raw);
          if (Number.isFinite(value)) values.set(match[1]!, value);
        }
        const waterValues = gbc.waterCollisionValues();
        const waterTokens = new Set([...values]
          .filter(([, value]) => waterValues.has(value))
          .map(([name]) => name.slice("COLL_".length)));
        if (waterTokens.size === 0) throw new Error("GBC: no WATER_TILE-category collision names");
        let nonWaterName = [...values.keys()].find(name => !waterValues.has(values.get(name)!));
        if (values.has("COLL_FLOOR") && !waterValues.has(values.get("COLL_FLOOR")!)) {
          nonWaterName = "COLL_FLOOR";
        }
        if (!nonWaterName) throw new Error("GBC: no non-water collision name");
        const nonWaterToken = nonWaterName.slice("COLL_".length);

        let picked: { name: string; collisionPath: string; plan: BlockEditPlan } | undefined;
        for (const map of [...gbc.maps].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
          if (map.fishGroup === "FISHGROUP_NONE") continue;
          if ((coverageBefore.fishGroupWithoutWater as string[]).includes(map.name)) continue;
          const payload = await mapGet(map.name);
          const collision = payload.collision as { tl: number; tr: number; bl: number; br: number }[];
          const categories = payload.collisionInfo as Record<string, { category: string }>;
          const hasWater = (payload.blocks as { metatileId: number }[]).some(block => {
            const quadrants = collision[block.metatileId];
            if (!quadrants) return false;
            return [quadrants.tl, quadrants.tr, quadrants.bl, quadrants.br]
              .some(value => categories[String(value)]?.category === "water");
          });
          if (!hasWater) continue;
          const collisionPath = gbc.tileset(map.tileset).collisionPath;
          const before = readFileSync(resolve(root, collisionPath));
          const beforeText = before.toString("utf8");
          let replacements = 0;
          const afterText = beforeText.split("\n").map(line => {
            if (!/\btilecoll\b/.test(line)) return line;
            return line.replace(/\b[A-Za-z0-9_]+\b/g, token => {
              if (!waterTokens.has(token)) return token;
              replacements += 1;
              return nonWaterToken;
            });
          }).join("\n");
          if (replacements === 0) continue;
          // Same line count, CRLF intact: only token names inside tilecoll lines change.
          expect(afterText.split("\n").length).toBe(beforeText.split("\n").length);
          const after = Buffer.from(afterText);
          expect(after.equals(before)).toBe(false);
          picked = { name: map.name, collisionPath, plan: buildPlan([{ path: collisionPath, before, after }]) };
          break;
        }
        if (!picked) throw new Error("GBC: no fishing map with water and a water collision token");
        restore = restoreBytes([resolve(root, picked.collisionPath)]);
        try {
          stageTilesetPlan(store, picked.name, picked.plan, "overlay oracle collision edit");
          const coverageAfter = await ok("/api/coverage");
          expect(coverageAfter).not.toEqual(coverageBefore);
          expect(coverageAfter.fishGroupWithoutWater).toContain(picked.name);
          await edit(picked.name, "discard", {});
          expect(await ok("/api/coverage")).toEqual(coverageBefore);
        } finally {
          restore();
          restore = undefined;
        }
      }, 120_000);
    }
  });
}

describe("6: syncTilesetOverlay identity union", () => {
  const entries = (edits?: TilesetFileEdit[]): [string, OwnershipEntry][] => [
    ["A", { session: { ...(edits === undefined ? {} : { tilesetEdits: edits }) } } as OwnershipEntry],
  ];
  it("applies once, preserves identical Buffer identities, bumps for a replacement and empties absent edits", () => {
    const calls: FileOverlay[] = [];
    const project = { setTilesetOverlay: vi.fn((files: FileOverlay) => calls.push(files)) };
    const clearCaches = vi.fn();
    const state: overlay.OverlayState = { version: 0, applied: new Map(), clearCaches };
    const [edit] = appendPlan("tilesets/example.bin", Buffer.alloc(16)).edits as [TilesetFileEdit];
    const first = overlay.syncTilesetOverlay(entries([edit]), project, state);
    expect(first).toBe(1);
    expect(calls[0]?.get(edit.path)).toBe(edit.after);
    expect(overlay.syncTilesetOverlay(entries([edit]), project, state)).toBe(first);
    expect(project.setTilesetOverlay).toHaveBeenCalledTimes(1);
    expect(clearCaches).toHaveBeenCalledTimes(1);
    const replacement = { ...edit, after: Buffer.from(edit.after) };
    const second = overlay.syncTilesetOverlay(entries([replacement]), project, state);
    expect(second).toBe(first + 1);
    expect(calls[1]?.get(edit.path)).toBe(replacement.after);
    expect(clearCaches).toHaveBeenCalledTimes(2);
    const empty = overlay.syncTilesetOverlay(entries(), project, state);
    expect(empty).toBe(second + 1);
    expect(calls[2]?.size).toBe(0);
    expect(state.applied.size).toBe(0);
    expect(clearCaches).toHaveBeenCalledTimes(3);
    expect(overlay.syncTilesetOverlay([], project, state)).toBe(empty);
    expect(project.setTilesetOverlay).toHaveBeenCalledTimes(3);
    expect(clearCaches).toHaveBeenCalledTimes(3);
  });
  it("the alphabetically first owner wins a shared path in either input order", () => {
    const aEdit: TilesetFileEdit = {
      path: "tilesets/shared.bin", before: Buffer.alloc(16, 0x00), after: Buffer.alloc(16, 0xaa),
    };
    const bEdit: TilesetFileEdit = {
      path: "tilesets/shared.bin", before: Buffer.alloc(16, 0x00), after: Buffer.alloc(16, 0xbb),
    };
    const entry = (edit: TilesetFileEdit): OwnershipEntry =>
      ({ session: { tilesetEdits: [edit] } } as OwnershipEntry);
    const orders: [string, OwnershipEntry][][] = [
      [["B", entry(bEdit)], ["A", entry(aEdit)]],
      [["A", entry(aEdit)], ["B", entry(bEdit)]],
    ];
    for (const ordered of orders) {
      const calls: FileOverlay[] = [];
      const project = { setTilesetOverlay: vi.fn((files: FileOverlay) => calls.push(files)) };
      const clearCaches = vi.fn();
      const state: overlay.OverlayState = { version: 0, applied: new Map(), clearCaches };
      expect(overlay.syncTilesetOverlay(ordered, project, state)).toBe(1);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.get(aEdit.path)).toBe(aEdit.after);
      expect(calls[0]!.get(aEdit.path)).not.toBe(bEdit.after);
      expect(clearCaches).toHaveBeenCalledTimes(1);
    }
  });
});

