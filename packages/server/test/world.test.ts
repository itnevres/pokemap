import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createServer, type PokemapServer } from "../src/index.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { projectPaths } from "@pokemap/core/src/config/paths.js";

let s: PokemapServer;

// The hooks live INSIDE the describe, not beside it -- same reasoning as
// packages/server/test/api.test.ts: `createServer` opens the real project,
// so a file-level `beforeAll` above a `describe.skipIf` is not covered by
// the skip and would crash `openProject` on a machine without the decomp
// checked out, instead of skipping gracefully. The plan's own reference
// code for this file put the hooks outside the describe; this is fixed
// independently of the dungeon-toggle defect.
describe.skipIf(!hasProject(SUBJECT_ROOT))("world api", () => {
  beforeAll(async () => { s = await createServer({ projectPath: SUBJECT_ROOT, port: 0 }); });
  afterAll(async () => { await s?.close(); });

  it("returns placements, components, conflicts and vertical links", async () => {
    const w = await (await fetch(`http://127.0.0.1:${s.port}/api/world`)).json() as any;
    expect(Object.keys(w.placements).length).toBe(1209);
    expect(w.verticalLinks.length).toBe(14);
    expect(Array.isArray(w.conflicts)).toBe(true);
  }, 300_000);

  // Confirmed against the live decomp before writing this fix: buildWorld
  // places every one of the 1,209 maps unconditionally (an isolated map
  // still becomes its own 1-map component), so a naive
  // `new Map([...world.placements, ...auto])` merge -- the plan's own
  // reference Step 3 -- has the SAME 1,209 keys whether or not `auto` was
  // computed with dungeons on or off, and this test could not have passed
  // against it. "Off" has to remove the ~1,028 unplaced names from the base
  // set, not just skip repositioning them.
  it("respects the dungeonAutoLayout flag", async () => {
    const on = await (await fetch(`http://127.0.0.1:${s.port}/api/world?dungeons=1`)).json() as any;
    const off = await (await fetch(`http://127.0.0.1:${s.port}/api/world?dungeons=0`)).json() as any;
    expect(Object.keys(on.placements).length).toBeGreaterThan(Object.keys(off.placements).length);
  }, 300_000);

  it("400s a malformed placement body instead of hanging the request", async () => {
    // readBody(req).then(...) runs after this route's try/catch has already
    // returned, so a throw inside it (bad JSON here) becomes an unhandled
    // promise rejection -- and an unanswered request -- unless the route's
    // own .catch() turns it into a response. This proves the request
    // actually completes, not just that it eventually would.
    const r = await fetch(`http://127.0.0.1:${s.port}/api/world/placement`, {
      method: "POST",
      body: "not json",
    });
    expect(r.status).toBe(400);
  }, 300_000);

  it("persists a manual placement, reflected in the next GET /api/world", async () => {
    // Writes the real decomp's .pokemap/world.json (I8's sanctioned write
    // path) under a map name that can never collide with a real one, then
    // restores whatever was there (or removes the file if it didn't exist)
    // so this test leaves no trace for the Step 7 manual verification pass
    // that exercises the same file for real.
    const sidecarPath = projectPaths(SUBJECT_ROOT).sidecar;
    const before = existsSync(sidecarPath) ? readFileSync(sidecarPath, "utf8") : null;

    try {
      const name = "__pokemap_world_test_placement__";
      const post = await fetch(`http://127.0.0.1:${s.port}/api/world/placement`, {
        method: "POST",
        body: JSON.stringify({ map: name, x: 12345, y: 67890 }),
      });
      expect(post.status).toBe(200);
      expect(await post.json()).toEqual({ ok: true });

      const after = await (await fetch(`http://127.0.0.1:${s.port}/api/world`)).json() as any;
      // Exact shape, not just presence: a name absent from both the base and
      // auto sets falls through applySidecar's placeholder branch, which is
      // documented (packages/core/test/world/sidecar.test.ts) to carry
      // component: -1 and zero size -- pinning that here is what makes this
      // test double as proof the server passes the sidecar's manual entries
      // through untouched rather than reshaping them.
      expect(after.placements[name]).toEqual({ map: name, x: 12345, y: 67890, width: 0, height: 0, component: -1 });
    } finally {
      if (before === null) rmSync(sidecarPath, { force: true });
      else writeFileSync(sidecarPath, before);
    }
  }, 300_000);

  // Review fix: the world-canvas dungeon-layout switch previously only
  // changed a local query string used for its own next fetch -- nothing
  // ever persisted sidecar.dungeonAutoLayout, so a reload silently
  // discarded it. Same restore-afterward discipline as the placement
  // persistence test above.
  it("persists the dungeon-layout flag, reflected in the next GET /api/world's sidecar", async () => {
    const sidecarPath = projectPaths(SUBJECT_ROOT).sidecar;
    const before = existsSync(sidecarPath) ? readFileSync(sidecarPath, "utf8") : null;

    try {
      const flipped = await (await fetch(`http://127.0.0.1:${s.port}/api/world`)).json() as any;
      const target = !flipped.sidecar.dungeonAutoLayout;

      const post = await fetch(`http://127.0.0.1:${s.port}/api/world/dungeons`, {
        method: "POST",
        body: JSON.stringify({ enabled: target }),
      });
      expect(post.status).toBe(200);
      expect(await post.json()).toEqual({ ok: true });

      const after = await (await fetch(`http://127.0.0.1:${s.port}/api/world`)).json() as any;
      expect(after.sidecar.dungeonAutoLayout).toBe(target);
    } finally {
      if (before === null) rmSync(sidecarPath, { force: true });
      else writeFileSync(sidecarPath, before);
    }
  }, 300_000);

  it("400s a malformed dungeon-layout body instead of hanging the request", async () => {
    const r = await fetch(`http://127.0.0.1:${s.port}/api/world/dungeons`, {
      method: "POST",
      body: JSON.stringify({ enabled: "yes" }), // string, not boolean
    });
    expect(r.status).toBe(400);
  }, 300_000);
});
