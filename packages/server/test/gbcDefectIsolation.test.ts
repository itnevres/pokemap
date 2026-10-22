import fs, { appendFileSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import { copyGbcSubjectToTemp, GBC_SUBJECT_ROOT, hasGbcProject, removeTemp } from "@pokemap/core/test/gbc/helpers/corpus.js";

const events = (destWarp: number) => `Route29_MapScripts:\n\tdef_scene_scripts\n\tdef_callbacks\nRoute29_MapEvents:\n\tdb 0, 0\n\tdef_warp_events\n\twarp_event 1, 1, NEW_BARK_TOWN, ${destWarp}\n\twarp_event 2, 2, UNKNOWN_DEST, 1\n\tdef_coord_events\n\tdef_bg_events\n\tdef_object_events\n`;
describe.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT))("GBC partial defect checks keep the source map open", () => {
  let root: string, server: PokemapServer;
  const get = () => fetch(`http://127.0.0.1:${server.port}/api/map/Route29`);
  beforeEach(async () => {
    root = copyGbcSubjectToTemp();
    writeFileSync(`${root}/maps/Route29.asm`, events(1));
    const map = openGbcProject(root).map("Route29");
    appendFileSync(`${root}/${map.blkPath}`, Buffer.from([0]));
    server = await createServer({ projectPath: root, port: 0 });
  });
  afterEach(async () => { await server?.close(); if (root) removeTemp(root); });
  it("returns the source payload and other defects when destination events are malformed", async () => {
    writeFileSync(`${root}/maps/NewBarkTown.asm`, "NewBarkTown_MapScripts:\n");
    const response = await get();
    expect(response.status).toBe(200);
    const payload = await response.json() as GbcMapPayload;
    expect(payload.map.name).toBe("Route29");
    expect(payload.defects).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "size" }), expect.objectContaining({ message: expect.stringContaining("UNKNOWN_DEST") }),
    ]));
    expect(payload.incomplete).toEqual([{ file: "maps/NewBarkTown.asm", reason: expect.stringContaining("C5") }]);
  });
  it("does not read a malformed backup-warp destination", async () => {
    writeFileSync(`${root}/maps/Route29.asm`, events(-1));
    writeFileSync(`${root}/maps/NewBarkTown.asm`, "broken");
    const response = await get();
    expect(response.status).toBe(200);
    expect((await response.json() as GbcMapPayload).incomplete).toEqual([]);
  });
  it("returns structural defects when the symbol index throws and retries the next request", async () => {
    const readDir = fs.readdirSync;
    const spy = vi.spyOn(fs, "readdirSync").mockImplementation(((...args: Parameters<typeof readDir>) => {
      if (String(args[0]).replace(/\\/g, "/") === root.replace(/\\/g, "/")) throw new Error("injected unreadable symbol directory");
      return Reflect.apply(readDir, fs, args);
    }) as typeof readDir);
    syncBuiltinESMExports();
    try {
      const response = await get();
      expect(response.status).toBe(200);
      const partial = await response.json() as GbcMapPayload;
      expect(partial.map.name).toBe("Route29");
      expect(partial.defects).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "size" }), expect.objectContaining({ message: expect.stringContaining("UNKNOWN_DEST") }),
      ]));
      expect(partial.incomplete).toEqual([{ file: expect.any(String), reason: expect.stringContaining("C7-C9") }]);
      spy.mockRestore(); syncBuiltinESMExports();
      const retry = await get();
      expect(retry.status).toBe(200);
      expect((await retry.json() as GbcMapPayload).incomplete).toEqual([]);
    } finally { spy.mockRestore(); syncBuiltinESMExports(); }
  });
});
