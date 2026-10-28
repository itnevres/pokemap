import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createServer, type PokemapServer } from "../src/index.js";
import { createProjectHandler, type ProjectHandler } from "../src/index.js";
import { createGbcProjectHandler } from "../src/gbcRoutes.js";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { GBC_SUBJECT_ROOT, hasGbcProject, copyGbcSubjectToTemp, removeTemp } from "@pokemap/core/test/gbc/helpers/corpus.js";
import { syncBuiltinESMExports } from "node:module";
import fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// -----------------------------------------------------------------------------
// GBA warm-up tests
// -----------------------------------------------------------------------------
const gbaMocks = vi.hoisted(() => ({
  renderLayoutCalls: 0,
  onRender: undefined as (() => void) | undefined,
  renderLayoutMock: vi.fn(),
}));

vi.mock("@pokemap/core/src/render/layout.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@pokemap/core/src/render/layout.js")>();
  return {
    ...mod,
    renderLayout: (...args: Parameters<typeof mod.renderLayout>) => {
      gbaMocks.renderLayoutCalls++;
      const out = mod.renderLayout(...args);
      gbaMocks.onRender?.();
      return out;
    },
  };
});

describe.skipIf(!hasProject(SUBJECT_ROOT))("GBA warmUp", () => {
  let handler: ProjectHandler;

  beforeAll(async () => {
    await vi.resetModules();
    const { createProjectHandler: freshHandler } = await import("../src/index.js");
    handler = freshHandler(SUBJECT_ROOT);
  });

  afterAll(async () => {
    handler.dispose();
    vi.restoreAllMocks();
    await vi.resetModules();
  });

  beforeEach(() => {
    gbaMocks.renderLayoutCalls = 0;
    gbaMocks.onRender = undefined;
    gbaMocks.renderLayoutMock.mockClear();
  });

  // (a) after warmUp([A, B]), GET /api/render/A.png does not render again and returns 200 PNG
  it("a) warms two maps and subsequent render request uses cache", async () => {
    const result = await handler.warmUp(["PetalburgCity", "LittlerootTown"]);
    expect(result.rendered).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(gbaMocks.renderLayoutCalls).toBe(2);

    // Now make an HTTP request for the first map - should not call renderLayout again
    const srv = createHttpServer(handler.handle);
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      const r = await fetch(`${base}/api/render/PetalburgCity.png`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("image/png");
      // renderLayout should NOT have been called again
      expect(gbaMocks.renderLayoutCalls).toBe(2);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  });

  it("b) yields between maps and allows interleaved requests", async () => {
    const { warmEach } = await import("../src/warmUp.js");
    // warmEach queues one setImmediate per map; a callback queued right after the call lands between map 1 and map 2.
    const order: string[] = [];
    let seenAtCallback: string[] | undefined;
    const looped = warmEach(["A", "B", "C"], (name) => { order.push(name); return "rendered"; }, () => false);
    setImmediate(() => { seenAtCallback = [...order]; });
    expect((await looped).rendered).toBe(3);
    expect(seenAtCallback).toEqual(["A"]);

    // Integration: a request sent while real renders run is answered before the warm-up finishes.
    const SIX = ["OldaleTown", "Route101", "Route102", "Route103", "Route104", "Route110"];
    const fresh = createProjectHandler(SUBJECT_ROOT);
    const srv = createHttpServer(fresh.handle);
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      let warmDone = false;
      const warm = fresh.warmUp(SIX).then((r) => { warmDone = true; return r; });
      const project = await fetch(`${base}/api/project`);
      expect(project.status).toBe(200);
      expect(warmDone).toBe(false);
      expect((await warm).rendered).toBe(6);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
      fresh.dispose();
    }
  });

  // (c) open edit session on A, warmUp([A]) reports skipped: 1, then discard and GET renders once
  it("c) skips map with open edit session, then renders after discard", async () => {
    // Open an edit session via paint/begin
    const srv = createHttpServer(handler.handle);
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      await fetch(`${base}/api/edit/Route102/paint/begin`, { method: "POST", body: "{}" });
      // One in-memory pencil stroke makes the session dirty; the discard below drops it, so disk is never written.
      await fetch(`${base}/api/edit/Route102/paint/apply`, { method: "POST", body: JSON.stringify({
        tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 42 }] }, origin: { x: 0, y: 0 },
      }) });
      await fetch(`${base}/api/edit/Route102/paint/end`, { method: "POST", body: "{}" });
      expect(handler.dirtyMaps()).toContain("Route102");

      // warmUp should skip this map
      const result = await handler.warmUp(["Route102"]);
      expect(result.rendered).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(0);
      expect(gbaMocks.renderLayoutCalls).toBe(0);

      // Discard the session
      await fetch(`${base}/api/edit/Route102/discard`, { method: "POST", body: "{}" });
      expect(handler.dirtyMaps()).not.toContain("Route102");

      // Now GET should render
      const r = await fetch(`${base}/api/render/Route102.png`);
      expect(r.status).toBe(200);
      expect(gbaMocks.renderLayoutCalls).toBe(1);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  });

  // (d) dispose() stops warmUp before first yield
  it("d) dispose stops warmUp before any render", async () => {
    const freshHandler = createProjectHandler(SUBJECT_ROOT);
    const warmPromise = freshHandler.warmUp(["PetalburgCity", "LittlerootTown", "OldaleTown", "Route101"]);
    // Dispose before first yield fires
    freshHandler.dispose();
    const result = await warmPromise;
    expect(result.rendered).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(gbaMocks.renderLayoutCalls).toBe(0);
  });

  it("e) a map is cached in the same step it renders, so nothing between maps sees it uncached (P12-4w)", async () => {
    // P12-4w: render and cache insert happen in one synchronous step, so a cache clear (save) between two maps can never be
    // followed by an insert of a render taken before it. Observable form: a request scheduled from inside A's render runs
    // before the warm-up's next turn (setImmediate FIFO) and must already be a cache hit. A render/insert split across a
    // yield makes that request render A again.
    const fresh = createProjectHandler(SUBJECT_ROOT);
    let scheduled = false;
    gbaMocks.onRender = () => {
      if (scheduled) return;
      scheduled = true;
      setImmediate(() => fresh.handle(
        { url: "/api/render/PetalburgCity.png", method: "GET", headers: {} } as never,
        { writeHead: () => undefined, end: () => undefined, setHeader: () => undefined } as never,
      ));
    };
    const result = await fresh.warmUp(["PetalburgCity", "LittlerootTown"]);
    expect(result.rendered).toBe(2);
    expect(gbaMocks.renderLayoutCalls).toBe(2); // A and B once each; the in-between request for A was a hit
    fresh.dispose();
  });

  // (f) warmUp([A, "NoSuchMap", B]) -> { rendered: 2, failed: 1 }, A and B cached
  it("f) handles unknown map as failed, continues with others", async () => {
    const freshHandler = createProjectHandler(SUBJECT_ROOT);
    const result = await freshHandler.warmUp(["PetalburgCity", "NoSuchMap", "LittlerootTown"]);
    expect(result.rendered).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(gbaMocks.renderLayoutCalls).toBe(2);
    freshHandler.dispose();
  });

  // (g) no disk writes during warmUp
  it("g) performs no disk writes", async () => {
    const writeFileSyncSpy = vi.spyOn(fs, "writeFileSync");
    const writeFileSpy = vi.spyOn(fs, "writeFile");
    const renameSyncSpy = vi.spyOn(fs, "renameSync");
    const mkdirSyncSpy = vi.spyOn(fs, "mkdirSync");
    syncBuiltinESMExports();

    const freshHandler = createProjectHandler(SUBJECT_ROOT);
    await freshHandler.warmUp(["PetalburgCity", "LittlerootTown"]);

    expect(writeFileSyncSpy).not.toHaveBeenCalled();
    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(renameSyncSpy).not.toHaveBeenCalled();
    expect(mkdirSyncSpy).not.toHaveBeenCalled();

    writeFileSyncSpy.mockRestore();
    writeFileSpy.mockRestore();
    renameSyncSpy.mockRestore();
    mkdirSyncSpy.mockRestore();
    syncBuiltinESMExports();
    freshHandler.dispose();
  });

  // (h) warmUp() with no names builds the default list (drawn-by-default world maps): a world town is
  // rendered and cached, so a later GET does not render it again.
  it("h) no-argument warmUp warms the default world list", async () => {
    const result = await handler.warmUp();
    expect(result.rendered).toBeGreaterThan(10);
    expect(result.failed).toBe(0);
    const calls = gbaMocks.renderLayoutCalls;
    expect(calls).toBe(result.rendered);
    const srv = createHttpServer(handler.handle);
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    try {
      const r = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/render/PetalburgCity.png`);
      expect(r.status).toBe(200);
      expect(gbaMocks.renderLayoutCalls).toBe(calls);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  }, 60000);
});

// -----------------------------------------------------------------------------
// GBC warm-up tests
// -----------------------------------------------------------------------------
const gbcMocks = vi.hoisted(() => ({
  renderGbcMapCalls: 0,
  onRender: undefined as (() => void) | undefined,
  renderGbcMapMock: vi.fn(),
}));

vi.mock("@pokemap/core/src/gbc/render/map.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@pokemap/core/src/gbc/render/map.js")>();
  return {
    ...mod,
    renderGbcMap: (...args: Parameters<typeof mod.renderGbcMap>) => {
      gbcMocks.renderGbcMapCalls++;
      const out = mod.renderGbcMap(...args);
      gbcMocks.onRender?.();
      return out;
    },
  };
});

describe.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT))("GBC warmUp", () => {
  let tmp: string;
  let handler: ProjectHandler;

  beforeAll(async () => {
    tmp = copyGbcSubjectToTemp();
    await vi.resetModules();
    const { createGbcProjectHandler: freshHandler } = await import("../src/gbcRoutes.js");
    handler = freshHandler(tmp);
  });

  afterAll(async () => {
    handler.dispose();
    vi.restoreAllMocks();
    await vi.resetModules();
    if (tmp) removeTemp(tmp);
  });

  beforeEach(() => {
    gbcMocks.renderGbcMapCalls = 0;
    gbcMocks.onRender = undefined;
    gbcMocks.renderGbcMapMock.mockClear();
  });

  // (a) after warmUp([A, B]), GET /api/render/A.png?time=day does not render again and returns 200 PNG
  it("a) warms two maps and subsequent render request uses cache", async () => {
    const result = await handler.warmUp(["NewBarkTown", "CherrygroveCity"]);
    expect(result.rendered).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(gbcMocks.renderGbcMapCalls).toBe(2);

    const srv = createHttpServer(handler.handle);
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      const r = await fetch(`${base}/api/render/NewBarkTown.png?time=day`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("image/png");
      expect(gbcMocks.renderGbcMapCalls).toBe(2);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  });

  it("b) yields between maps and allows interleaved requests", async () => {
    const { warmEach } = await import("../src/warmUp.js");
    // warmEach queues one setImmediate per map; a callback queued right after the call lands between map 1 and map 2.
    const order: string[] = [];
    let seenAtCallback: string[] | undefined;
    const looped = warmEach(["A", "B", "C"], (name) => { order.push(name); return "rendered"; }, () => false);
    setImmediate(() => { seenAtCallback = [...order]; });
    expect((await looped).rendered).toBe(3);
    expect(seenAtCallback).toEqual(["A"]);

    // Integration: a request sent while real renders run is answered before the warm-up finishes.
    const SIX = ["VioletCity", "Route29", "Route30", "Route31", "Route32", "Route33"];
    const fresh = createGbcProjectHandler(tmp);
    const srv = createHttpServer(fresh.handle);
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      let warmDone = false;
      const warm = fresh.warmUp(SIX).then((r) => { warmDone = true; return r; });
      const project = await fetch(`${base}/api/project`);
      expect(project.status).toBe(200);
      expect(warmDone).toBe(false);
      expect((await warm).rendered).toBe(6);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
      fresh.dispose();
    }
  });

  // (c) open edit session on A, warmUp([A]) reports skipped: 1, then discard and GET renders once
  it("c) skips map with open edit session, then renders after discard", async () => {
    const srv = createHttpServer(handler.handle);
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      await fetch(`${base}/api/edit/Route30/paint/begin`, { method: "POST", body: "{}" });
      // One in-memory pencil stroke makes the session dirty; the discard below drops it, so disk is never written.
      await fetch(`${base}/api/edit/Route30/paint/apply`, { method: "POST", body: JSON.stringify({
        tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 42 }] }, origin: { x: 0, y: 0 },
      }) });
      await fetch(`${base}/api/edit/Route30/paint/end`, { method: "POST", body: "{}" });
      expect(handler.dirtyMaps()).toContain("Route30");

      const result = await handler.warmUp(["Route30"]);
      expect(result.rendered).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(0);
      expect(gbcMocks.renderGbcMapCalls).toBe(0);

      await fetch(`${base}/api/edit/Route30/discard`, { method: "POST", body: "{}" });
      expect(handler.dirtyMaps()).not.toContain("Route30");

      const r = await fetch(`${base}/api/render/Route30.png?time=day`);
      expect(r.status).toBe(200);
      expect(gbcMocks.renderGbcMapCalls).toBe(1);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  });

  // (d) dispose() stops warmUp before first yield
  it("d) dispose stops warmUp before any render", async () => {
    const freshHandler = createGbcProjectHandler(tmp);
    const warmPromise = freshHandler.warmUp(["NewBarkTown", "CherrygroveCity", "VioletCity", "Route29"]);
    freshHandler.dispose();
    const result = await warmPromise;
    expect(result.rendered).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(gbcMocks.renderGbcMapCalls).toBe(0);
  });

  it("e) a map is cached in the same step it renders, so nothing between maps sees it uncached (P12-4w)", async () => {
    // P12-4w: render and cache insert happen in one synchronous step, so a cache clear (save) between two maps can never be
    // followed by an insert of a render taken before it. Observable form: a request scheduled from inside A's render runs
    // before the warm-up's next turn (setImmediate FIFO) and must already be a cache hit. A render/insert split across a
    // yield makes that request render A again.
    const fresh = createGbcProjectHandler(tmp);
    let scheduled = false;
    gbcMocks.onRender = () => {
      if (scheduled) return;
      scheduled = true;
      setImmediate(() => fresh.handle(
        { url: "/api/render/NewBarkTown.png?time=day", method: "GET", headers: {} } as never,
        { writeHead: () => undefined, end: () => undefined, setHeader: () => undefined } as never,
      ));
    };
    const result = await fresh.warmUp(["NewBarkTown", "CherrygroveCity"]);
    expect(result.rendered).toBe(2);
    expect(gbcMocks.renderGbcMapCalls).toBe(2); // A and B once each; the in-between request for A was a hit
    fresh.dispose();
  });

  // (f) warmUp([A, "NoSuchMap", B]) -> { rendered: 2, failed: 1 }, A and B cached
  it("f) handles unknown map as failed, continues with others", async () => {
    const freshHandler = createGbcProjectHandler(tmp);
    const result = await freshHandler.warmUp(["NewBarkTown", "NoSuchMap", "CherrygroveCity"]);
    expect(result.rendered).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(gbcMocks.renderGbcMapCalls).toBe(2);
    freshHandler.dispose();
  });

  // (g) no disk writes during warmUp
  it("g) performs no disk writes", async () => {
    const writeFileSyncSpy = vi.spyOn(fs, "writeFileSync");
    const writeFileSpy = vi.spyOn(fs, "writeFile");
    const renameSyncSpy = vi.spyOn(fs, "renameSync");
    const mkdirSyncSpy = vi.spyOn(fs, "mkdirSync");
    syncBuiltinESMExports();

    const freshHandler = createGbcProjectHandler(tmp);
    await freshHandler.warmUp(["NewBarkTown", "CherrygroveCity"]);

    expect(writeFileSyncSpy).not.toHaveBeenCalled();
    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(renameSyncSpy).not.toHaveBeenCalled();
    expect(mkdirSyncSpy).not.toHaveBeenCalled();

    writeFileSyncSpy.mockRestore();
    writeFileSpy.mockRestore();
    renameSyncSpy.mockRestore();
    mkdirSyncSpy.mockRestore();
    syncBuiltinESMExports();
    freshHandler.dispose();
  });

  // (h) warmUp() with no names builds the default list (drawn-by-default world maps): a world town is
  // rendered and cached, so a later GET does not render it again.
  it("h) no-argument warmUp warms the default world list", async () => {
    const result = await handler.warmUp();
    expect(result.rendered).toBeGreaterThan(10);
    expect(result.failed).toBe(0);
    const calls = gbcMocks.renderGbcMapCalls;
    expect(calls).toBe(result.rendered);
    const srv = createHttpServer(handler.handle);
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    try {
      const r = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/render/NewBarkTown.png?time=day`);
      expect(r.status).toBe(200);
      expect(gbcMocks.renderGbcMapCalls).toBe(calls);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  }, 60000);
});
