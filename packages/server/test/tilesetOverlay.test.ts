/** Task 10a oracle: expectations are earlier HTTP PNGs, response versions and disk bytes. */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openProject, type Project } from "@pokemap/core/src/project.js";
import { openGbcProject, type GbcProject } from "@pokemap/core/src/gbc/project.js";
import { canonicalTilesetPath } from "@pokemap/core/src/blockEdit/canonicalTilesetPath.js";
import { gbcTilesetsForFile } from "@pokemap/core/src/blockEdit/usage.js";
import type { FileOverlay, TilesetFileEdit } from "@pokemap/core/src/blockEdit/types.js";
import { stageTilesetPlan, type BlockEditPlan, type OwnershipEntry } from "../src/blockEditOwnership.js";
import { syncTilesetOverlay, type OverlayState } from "../src/tilesetOverlay.js";
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
    // A no-op paint begin is the existing HTTP payload builder, not a second stage.
    const stagedPayload = (name: string) => edit(name, "paint/begin", {});
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
        if ((await metatile(subject, subject.offset + other)).equals(originalPng)) continue;
        const after = Buffer.from(before);
        replacement.copy(after, local * 16);
        return { ...subject, originalPng, plan: buildPlan([{ path: subject.path, before, after }]) };
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
      expect(staged).not.toEqual(original);
      expect(await render(candidate.name)).not.toEqual(originalRender);
      for (const [action, expected] of [
        ["undo", original], ["redo", staged], ["discard", original],
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
          const plan = await edit(candidate.name, "plan");
          expect(plan.refusals).toEqual([]);
          expect(typeof plan.fingerprint).toBe("string");
          expect(plan.fingerprint.length).toBeGreaterThan(0);
          if (!succeeds) {
            const path = resolve(root, candidate.path);
            writeFileSync(path, Buffer.concat([readFileSync(path), Buffer.alloc(16, 0x11)]));
          }
          const committed = await req(`/api/edit/${encodeURIComponent(candidate.name)}/commit`, {
            fingerprint: plan.fingerprint,
          });
          if (succeeds) expect(committed.status, JSON.stringify(committed.body)).toBe(200);
          else expect(committed.status).not.toBe(200);
          expect(await render(candidate.name)).toEqual(staged);
          const next = versionOf(await mapGet(candidate.name));
          if (succeeds) expect(next).toBeGreaterThan(beforeCommit);
          else expect(next).toBe(beforeCommit);
        } finally {
          restore();
          restore = undefined;
        }
      }, 120_000);
    }

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
    }
  });
}

describe("6: syncTilesetOverlay identity union", () => {
  const entries = (edits?: TilesetFileEdit[]): [string, OwnershipEntry][] => [
    ["A", { session: { ...(edits === undefined ? {} : { tilesetEdits: edits }) } } as OwnershipEntry],
  ];
  it("applies once, preserves identical Buffer identities, bumps for a replacement and empties absent edits", () => {
    const calls: FileOverlay[] = [];
    const project = { setTilesetOverlay: vi.fn((overlay: FileOverlay) => calls.push(overlay)) };
    const clearCaches = vi.fn();
    const state: OverlayState = { version: 0, applied: new Map(), clearCaches };
    const [edit] = appendPlan("tilesets/example.bin", Buffer.alloc(16)).edits as [TilesetFileEdit];
    const first = syncTilesetOverlay(entries([edit]), project, state);
    expect(first).toBe(1);
    expect(calls[0]?.get(edit.path)).toBe(edit.after);
    expect(syncTilesetOverlay(entries([edit]), project, state)).toBe(first);
    expect(project.setTilesetOverlay).toHaveBeenCalledTimes(1);
    expect(clearCaches).toHaveBeenCalledTimes(1);
    const replacement = { ...edit, after: Buffer.from(edit.after) };
    const second = syncTilesetOverlay(entries([replacement]), project, state);
    expect(second).toBe(first + 1);
    expect(calls[1]?.get(edit.path)).toBe(replacement.after);
    expect(clearCaches).toHaveBeenCalledTimes(2);
    const empty = syncTilesetOverlay(entries(), project, state);
    expect(empty).toBe(second + 1);
    expect(calls[2]?.size).toBe(0);
    expect(state.applied.size).toBe(0);
    expect(clearCaches).toHaveBeenCalledTimes(3);
    expect(syncTilesetOverlay([], project, state)).toBe(empty);
    expect(project.setTilesetOverlay).toHaveBeenCalledTimes(3);
    expect(clearCaches).toHaveBeenCalledTimes(3);
  });
});

