import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createServer as createHttp } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHub, parentOf, safeNorm, type Hub } from "../src/hub.js";
import { norm } from "@pokemap/core/src/config/paths.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";
import { GBC_SUBJECT_ROOT, hasGbcProject } from "@pokemap/core/test/gbc/helpers/corpus.js";

const homes: string[] = [];
function makeHome(): string {
  const h = mkdtempSync(join(tmpdir(), "pokemap-home-"));
  homes.push(h);
  return h;
}
const roots: string[] = [];
function makeRoot(): string {
  const r = mkdtempSync(join(tmpdir(), "pokemap-hubtree-"));
  roots.push(r);
  return r;
}
function touch(root: string, relPath: string): void {
  const full = join(root, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, "");
}

afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const getJson = async (port: number, path: string) => (await fetch(`http://127.0.0.1:${port}${path}`)).json();
const postJson = async (port: number, path: string, body: unknown) =>
  fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", body: JSON.stringify(body) });

describe("hub (non-corpus)", () => {
  it("test 1: GET /api/hub before any open reports current: null, recent: []", async () => {
    const hub = await createHub({ port: 0, home: makeHome() });
    try {
      expect(await getJson(hub.port, "/api/hub")).toEqual({ current: null, recent: [] });
    } finally {
      await hub.close();
    }
  });

  it("test 2: GET /api/project and /api/groups before any open both 503 \"no project open\"", async () => {
    const hub = await createHub({ port: 0, home: makeHome() });
    try {
      for (const path of ["/api/project", "/api/groups"]) {
        const r = await fetch(`http://127.0.0.1:${hub.port}${path}`);
        expect(r.status).toBe(503);
        expect(await r.json()).toEqual({ error: "no project open" });
      }
    } finally {
      await hub.close();
    }
  });

  it("test 3: GET /api/hub/nope -> 404", async () => {
    const hub = await createHub({ port: 0, home: makeHome() });
    try {
      expect((await fetch(`http://127.0.0.1:${hub.port}/api/hub/nope`)).status).toBe(404);
    } finally {
      await hub.close();
    }
  });

  it("test 4: browse a temp tree -- directories only, family-probed, sorted case-insensitively", async () => {
    const tmp = makeRoot();
    // SR-F8: created in a deliberately scrambled order, and including names
    // ("_under", "Zed", "alpha", "Beta") whose correct order (localeCompare,
    // sensitivity: "base") disagrees with BOTH a plain default `.sort()`
    // (ASCII: uppercase before "_" before lowercase) AND raw NTFS readdir
    // order (~creation order for a small directory) -- so a sort dropped
    // entirely, or swapped for a naive comparator, can't pass by accident.
    mkdirSync(join(tmp, "yellow/data/maps/headers"), { recursive: true });
    touch(tmp, "yellow/constants/map_constants.asm");
    touch(tmp, "both/include/fieldmap.h");
    touch(tmp, "both/data/maps/attributes.asm");
    touch(tmp, "both/constants/map_constants.asm");
    mkdirSync(join(tmp, "Beta"), { recursive: true });
    touch(tmp, "gbcProj/data/maps/attributes.asm");
    touch(tmp, "gbcProj/constants/map_constants.asm");
    mkdirSync(join(tmp, "alpha"), { recursive: true });
    mkdirSync(join(tmp, "plain"), { recursive: true });
    mkdirSync(join(tmp, "Zed"), { recursive: true });
    touch(tmp, "gbaProj/include/fieldmap.h");
    mkdirSync(join(tmp, "_under"), { recursive: true });
    mkdirSync(join(tmp, ".hidden"), { recursive: true });
    mkdirSync(join(tmp, "$sys"), { recursive: true });
    writeFileSync(join(tmp, "notes.txt"), "hi");

    const hub = await createHub({ port: 0, home: makeHome() });
    try {
      const body = await getJson(hub.port, `/api/hub/browse?dir=${encodeURIComponent(tmp)}`) as {
        dir: string; parent: string | null; entries: { name: string; path: string; family: string | null }[];
      };
      const expectedDir = norm(tmp);
      expect(body.dir).toBe(expectedDir);
      expect(body.parent).toBe(norm(dirname(tmp)));
      expect(body.entries).toEqual([
        { name: "_under", path: `${expectedDir}/_under`, family: null },
        { name: "alpha", path: `${expectedDir}/alpha`, family: null },
        { name: "Beta", path: `${expectedDir}/Beta`, family: null },
        { name: "both", path: `${expectedDir}/both`, family: "unsupported" },
        { name: "gbaProj", path: `${expectedDir}/gbaProj`, family: "gba" },
        { name: "gbcProj", path: `${expectedDir}/gbcProj`, family: "gbc" },
        { name: "plain", path: `${expectedDir}/plain`, family: null },
        { name: "yellow", path: `${expectedDir}/yellow`, family: "unsupported" },
        { name: "Zed", path: `${expectedDir}/Zed`, family: null },
      ]);
    } finally {
      await hub.close();
    }
  });

  // SR-F4/QR-F1: pure-function pinning, independent of which OS runs the
  // test -- parentOf/safeNorm are plain string functions (no node:path
  // platform-default parsing inside them), so these values must hold
  // identically everywhere. "/home" -> "/" is the bug QR-F1 found: norm("/")
  // strips the WHOLE string to "", and the old parentOf only special-cased a
  // win32 drive root, never the POSIX root itself.
  it("SR-F4/QR-F1: parentOf/safeNorm pin the POSIX-root and drive-root edge cases on every platform", () => {
    expect(parentOf("/home")).toBe("/");
    expect(parentOf("/")).toBeNull();
    expect(parentOf("C:/")).toBeNull();
    expect(parentOf("C:/x")).toBe("C:/");
    expect(safeNorm("/")).toBe("/");
    expect(safeNorm("C:/")).toBe("C:/");
  });

  it("SR-F4: browse resolves a relative dir (e.g. \".\") to an absolute path", async () => {
    const hub = await createHub({ port: 0, home: makeHome() });
    try {
      const body = await getJson(hub.port, "/api/hub/browse?dir=.") as { dir: string };
      expect(body.dir).toBe(norm(process.cwd()));
    } finally {
      await hub.close();
    }
  });

  it("test 5: browse a missing directory -> 404; a file -> 400", async () => {
    const tmp = makeRoot();
    writeFileSync(join(tmp, "afile.txt"), "hi");
    const hub = await createHub({ port: 0, home: makeHome() });
    try {
      const missing = await fetch(`http://127.0.0.1:${hub.port}/api/hub/browse?dir=${encodeURIComponent(join(tmp, "nope"))}`);
      expect(missing.status).toBe(404);
      const file = await fetch(`http://127.0.0.1:${hub.port}/api/hub/browse?dir=${encodeURIComponent(join(tmp, "afile.txt"))}`);
      expect(file.status).toBe(400);
    } finally {
      await hub.close();
    }
  });

  it.skipIf(process.platform !== "win32")("test 6 (win32): no dir lists drives; dir=C:/ avoids the norm(\"C:/\") cwd trap", async () => {
    const hub = await createHub({ port: 0, home: makeHome() });
    try {
      const noDir = await getJson(hub.port, "/api/hub/browse") as { dir: null; parent: null; entries: { name: string; path: string }[] };
      expect(noDir.dir).toBeNull();
      expect(noDir.parent).toBeNull();
      expect(noDir.entries.some((e) => e.name === "C:" && e.path === "C:/")).toBe(true);

      const driveRoot = await getJson(hub.port, "/api/hub/browse?dir=C:/") as { dir: string; parent: null; entries: unknown[] };
      expect(driveRoot.dir).toBe("C:/");
      expect(driveRoot.parent).toBeNull();

      // The norm("C:/") trap: readdirSync("C:") (missing the trailing slash)
      // would silently list the CURRENT directory on drive C instead of the
      // real drive root -- proven by asserting the two listings differ.
      const cwdListing = await getJson(hub.port, `/api/hub/browse?dir=${encodeURIComponent(process.cwd())}`) as { entries: unknown[] };
      expect(driveRoot.entries).not.toEqual(cwdListing.entries);
    } finally {
      await hub.close();
    }
  });

  it("test 7: POST /api/hub/open validates the body and 422s an ambiguous or unsupported root", async () => {
    const tmp = makeRoot();
    touch(tmp, "both/include/fieldmap.h");
    touch(tmp, "both/data/maps/attributes.asm");
    touch(tmp, "both/constants/map_constants.asm");
    mkdirSync(join(tmp, "yellow/data/maps/headers"), { recursive: true });
    touch(tmp, "yellow/constants/map_constants.asm");

    const hub = await createHub({ port: 0, home: makeHome() });
    const postRaw = (body: string) => fetch(`http://127.0.0.1:${hub.port}/api/hub/open`, { method: "POST", body });
    try {
      expect((await postRaw("{not json")).status).toBe(400);
      // SR-F2: valid JSON that isn't an object at all (null, or a bare
      // array/number/string) must 400 like any other shape mismatch, not
      // 500 from a TypeError reading `.path` off it.
      expect((await postRaw("null")).status).toBe(400);
      expect((await postRaw("[1,2,3]")).status).toBe(400);
      expect((await postJson(hub.port, "/api/hub/open", {})).status).toBe(400);
      expect((await postJson(hub.port, "/api/hub/open", { path: "x", force: "yes" })).status).toBe(400);
      expect((await postJson(hub.port, "/api/hub/open", { path: join(tmp, "nope") })).status).toBe(404);

      const bothRes = await postJson(hub.port, "/api/hub/open", { path: join(tmp, "both") });
      expect(bothRes.status).toBe(422);
      expect((await bothRes.json() as { error: string }).error).toMatch(/matches both engine families/);

      const yellowRes = await postJson(hub.port, "/api/hub/open", { path: join(tmp, "yellow") });
      expect(yellowRes.status).toBe(422);
      expect((await yellowRes.json() as { error: string }).error).toMatch(/pokeyellow/i);
    } finally {
      await hub.close();
    }
  });

  it("test 8: a failed open leaves current: null -- no half-swap", async () => {
    const tmp = makeRoot();
    touch(tmp, "both/include/fieldmap.h");
    touch(tmp, "both/data/maps/attributes.asm");
    touch(tmp, "both/constants/map_constants.asm");
    const hub = await createHub({ port: 0, home: makeHome() });
    try {
      await postJson(hub.port, "/api/hub/open", { path: join(tmp, "both") });
      expect(hub.current()).toBeNull();
      expect(await getJson(hub.port, "/api/hub")).toMatchObject({ current: null });
    } finally {
      await hub.close();
    }
  });
});

// Hooks live INSIDE the describe (api.test.ts's own established pattern for
// this repo): createHub -> createProjectHandler -> openProject opens the
// real project the moment a beforeAll runs, so a file-level (hoisted)
// beforeAll would run even when the corpus isn't checked out on this
// machine -- putting the hooks inside is what actually makes the skip work.
describe.skipIf(!hasProject(SUBJECT_ROOT) || !hasGbcProject(GBC_SUBJECT_ROOT))("hub against the real corpus", () => {
  let hub: Hub;
  let gbaLookingButIncompleteRoot: string;

  beforeAll(async () => {
    hub = await createHub({ port: 0, home: makeHome() });
    gbaLookingButIncompleteRoot = makeRoot();
    touch(gbaLookingButIncompleteRoot, "include/fieldmap.h"); // passes detectEngineFamily, fails openProject
  });
  afterAll(async () => {
    await hub?.close();
  });

  it("test 9: open GBA, then GBC, then GBA again -- /api/project follows, recent is deduped and most-recent-first", async () => {
    const r1 = await postJson(hub.port, "/api/hub/open", { path: SUBJECT_ROOT });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ family: "gba", root: norm(SUBJECT_ROOT) });
    expect(await getJson(hub.port, "/api/project")).toEqual({ family: "gba", root: norm(SUBJECT_ROOT) });

    const r2 = await postJson(hub.port, "/api/hub/open", { path: GBC_SUBJECT_ROOT });
    expect(r2.status).toBe(200);
    expect(await getJson(hub.port, "/api/project")).toMatchObject({ family: "gbc" });

    const r3 = await postJson(hub.port, "/api/hub/open", { path: SUBJECT_ROOT });
    expect(r3.status).toBe(200);
    expect(await getJson(hub.port, "/api/project")).toMatchObject({ family: "gba" });

    const hubState = await getJson(hub.port, "/api/hub") as { recent: { path: string; family: string }[] };
    expect(hubState.recent).toHaveLength(2);
    expect(hubState.recent[0]).toMatchObject({ family: "gba", path: norm(SUBJECT_ROOT) });
    expect(hubState.recent[1]).toMatchObject({ family: "gbc", path: norm(GBC_SUBJECT_ROOT) });
  }, 60_000);

  // Corpus variant of "no half-swap" (test 8 only proves it starting from
  // current: null, which can't distinguish a correct implementation from one
  // that disposes the OLD handler before even trying to create the new one
  // -- there's nothing to dispose yet in that case). This needs a REAL prior
  // successful open (a synthetic temp tree's bare marker file isn't a real
  // enough project for openProject to succeed on), so it lives here rather
  // than in the non-corpus block. The second path must pass BOTH the
  // exists/isDirectory check and detectEngineFamily (so the request reaches
  // the create-new-handler step at all) and only THEN fail, inside
  // createProjectHandler's own openProject -- a directory with only the gba
  // marker file, missing every other real project file, does exactly that.
  it("a failed second open (past family detection) after a successful one leaves the existing project running, not disposed", async () => {
    const opened = await postJson(hub.port, "/api/hub/open", { path: SUBJECT_ROOT });
    expect(opened.status).toBe(200);

    const bad = await postJson(hub.port, "/api/hub/open", { path: gbaLookingButIncompleteRoot });
    expect(bad.status).toBe(500);

    // The pre-existing GBA project must still answer normally -- a swap-
    // before-open bug would have disposed it already, making this 503.
    expect(await getJson(hub.port, "/api/project")).toEqual({ family: "gba", root: norm(SUBJECT_ROOT) });
  }, 60_000);

  // SR-F1 (spec review): `dirty()` must filter by `session.isDirty`, not just
  // list every OPEN session -- a mutant that lists every open session passed
  // every other test here, because every other test's "open but not dirty"
  // state never gets probed by an open-elsewhere attempt. Route124: isolated
  // from Route123 (test 10, below) and from every other test file (same
  // grep-proof reasoning as Route123's own comment).
  it("SR-F1: an open-but-clean session (begin+end, no apply) does not block a swap", async () => {
    await postJson(hub.port, "/api/hub/open", { path: SUBJECT_ROOT });

    const map = "Route124";
    await postJson(hub.port, `/api/edit/${map}/paint/begin`, {});
    const ended = await (await postJson(hub.port, `/api/edit/${map}/paint/end`, {})).json() as { isDirty: boolean };
    expect(ended.isDirty).toBe(false); // nothing was ever painted

    const r = await postJson(hub.port, "/api/hub/open", { path: GBC_SUBJECT_ROOT });
    expect(r.status).toBe(200); // no unsaved edits -- no force needed
  }, 60_000);

  // Map choice: "Route123" appears nowhere else under packages/*/test (grep
  // proof in the implementer report) -- not that it would matter anyway,
  // since editSessions.ts's own store (`createEditSessionStore`) is a plain
  // `Map` private to ONE `createProjectHandler` call; this test's hub is its
  // own such call, so no other test file's session could ever alias this
  // one's regardless of map name. The paint itself never touches disk
  // (editSessions.ts's whole design -- see index.ts's commit route comment),
  // so there is nothing here for a concurrent test file to race against
  // either.
  it("test 10: a real dirty session blocks a swap with 409 until force: true; dispose() then closes the old handler", async () => {
    // Re-open GBA explicitly rather than relying on test 9's ordering.
    await postJson(hub.port, "/api/hub/open", { path: SUBJECT_ROOT });

    const map = "Route123";
    await postJson(hub.port, `/api/edit/${map}/paint/begin`, {});
    await postJson(hub.port, `/api/edit/${map}/paint/apply`, {
      tool: "pencil", targets: [{ x: 0, y: 0 }], stamp: { width: 1, height: 1, cells: [{ metatileId: 42 }] }, origin: { x: 0, y: 0 },
    });
    const ended = await (await postJson(hub.port, `/api/edit/${map}/paint/end`, {})).json() as { isDirty: boolean };
    expect(ended.isDirty).toBe(true);

    const blockedRes = await postJson(hub.port, "/api/hub/open", { path: GBC_SUBJECT_ROOT });
    expect(blockedRes.status).toBe(409);
    const blocked = await blockedRes.json() as { error: string; dirtyMaps: string[] };
    expect(blocked.dirtyMaps).toEqual([map]);
    expect(await getJson(hub.port, "/api/project")).toMatchObject({ family: "gba" });

    // Cancel keeps the edit: a second /paint/end (no intervening /begin,
    // exactly paintRoutes.test.ts's own "stray double /paint/end" pattern)
    // still reports isDirty: true -- the blocked open above touched nothing.
    const stillDirty = await (await postJson(hub.port, `/api/edit/${map}/paint/end`, {})).json() as { isDirty: boolean };
    expect(stillDirty.isDirty).toBe(true);

    const old = hub.current();
    const forcedRes = await postJson(hub.port, "/api/hub/open", { path: GBC_SUBJECT_ROOT, force: true });
    expect(forcedRes.status).toBe(200);
    expect((await forcedRes.json() as { family: string }).family).toBe("gbc");

    expect(old?.dirtyMaps()).toEqual([]); // dispose() ran, closing every session

    // old.handle, driven through its own tiny in-test http.Server, answers
    // 503 -- proof a request holding this exact (now-disposed) handler
    // cannot read or write through it any more.
    const oldHttp = createHttp((req, res) => old!.handle(req, res));
    await new Promise<void>((r) => oldHttp.listen(0, "127.0.0.1", r));
    const addr = oldHttp.address();
    const oldPort = typeof addr === "object" && addr ? addr.port : 0;
    try {
      const res = await fetch(`http://127.0.0.1:${oldPort}/api/project`);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "project closed" });
    } finally {
      await new Promise<void>((r) => oldHttp.close(() => r()));
    }
  }, 60_000);

  // SR-F5: a swap that succeeded must not be reported as a failure to the
  // client just because the follow-up recent.json write couldn't happen --
  // `home` here is a FILE, so `pushRecent`'s own `mkdirSync(home, {
  // recursive: true })` throws EEXIST. Needs a real successful open (same
  // reason as the M7-coverage test above), so its own fresh hub/home rather
  // than the shared corpus one.
  it("SR-F5: a pushRecent failure after a committed swap logs to stderr but still 200s", async () => {
    const homeFile = join(makeRoot(), "not-a-directory");
    writeFileSync(homeFile, "");
    const hub2 = await createHub({ port: 0, home: homeFile });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await postJson(hub2.port, "/api/hub/open", { path: SUBJECT_ROOT });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ family: "gba", root: norm(SUBJECT_ROOT) });
      expect(hub2.current()?.family).toBe("gba"); // the swap really did commit
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      await hub2.close();
    }
  }, 60_000);

  it("test 11: createHub({ open: SUBJECT_ROOT }) opens at startup and records it in recent", async () => {
    const hub2 = await createHub({ port: 0, home: makeHome(), open: SUBJECT_ROOT });
    try {
      expect(hub2.current()?.family).toBe("gba");
      const recent = await getJson(hub2.port, "/api/hub") as { recent: { path: string }[] };
      expect(recent.recent.some((e) => e.path === norm(SUBJECT_ROOT))).toBe(true);
    } finally {
      await hub2.close();
    }
  });
});
