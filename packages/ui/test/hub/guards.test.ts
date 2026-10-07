import { describe, it, expect, vi, afterEach } from "vitest";
import { isHubState, isBrowseResult, isOpenConflict, openProject } from "../../src/hub/guards.js";

// No @testing-library/jest-dom in this repo (see SaveDialog.test.tsx's own
// comment) -- not needed here, this file has no DOM at all.

afterEach(() => {
  vi.unstubAllGlobals();
});

const REAL_HUB_STATE = {
  current: { family: "gba", root: "/tmp/pokeemerald" },
  recent: [
    { path: "/tmp/pokeemerald", family: "gba", openedAt: "2026-09-29T00:00:00.000Z" },
    { path: "/tmp/pokecrystal", family: "gbc", openedAt: "2026-09-28T00:00:00.000Z" },
  ],
};

const REAL_BROWSE_RESULT = {
  dir: "C:/Programming Projects",
  parent: "C:/",
  entries: [
    { name: "pokeemerald", path: "C:/Programming Projects/pokeemerald", family: "gba" },
    { name: "pokecrystal", path: "C:/Programming Projects/pokecrystal", family: "gbc" },
    { name: "notes", path: "C:/Programming Projects/notes", family: "unsupported" },
    { name: "Downloads", path: "C:/Programming Projects/Downloads", family: null },
  ],
};

const REAL_OPEN_CONFLICT = { error: "unsaved edits in 2 map(s)", dirtyMaps: ["Route1", "Route2"] };

describe("isHubState", () => {
  it("accepts the real shape with a current project", () => {
    expect(isHubState(REAL_HUB_STATE)).toBe(true);
  });

  it("accepts current: null", () => {
    expect(isHubState({ current: null, recent: [] })).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(isHubState(null)).toBe(false);
    expect(isHubState([])).toBe(false);
    expect(isHubState("x")).toBe(false);
  });

  it("rejects a wrong family string on current", () => {
    expect(isHubState({ current: { family: "n64", root: "/x" }, recent: [] })).toBe(false);
  });

  it("rejects non-array recent", () => {
    expect(isHubState({ current: null, recent: "nope" })).toBe(false);
  });

  it("rejects a recent entry with a wrong family string", () => {
    expect(
      isHubState({ current: null, recent: [{ path: "/x", family: "n64", openedAt: "2026-01-01" }] }),
    ).toBe(false);
  });

  it("rejects a recent entry whose family is \"unsupported\" (only gba/gbc are ever recorded)", () => {
    expect(
      isHubState({ current: null, recent: [{ path: "/x", family: "unsupported", openedAt: "2026-01-01" }] }),
    ).toBe(false);
  });

  it("rejects a recent entry missing openedAt", () => {
    expect(isHubState({ current: null, recent: [{ path: "/x", family: "gba" }] })).toBe(false);
  });

  it("rejects a recent entry with a non-string path", () => {
    expect(
      isHubState({ current: null, recent: [{ path: 42, family: "gba", openedAt: "2026-01-01" }] }),
    ).toBe(false);
  });
});

describe("isBrowseResult", () => {
  it("accepts the real shape", () => {
    expect(isBrowseResult(REAL_BROWSE_RESULT)).toBe(true);
  });

  it("accepts dir: null, parent: null (drive list / root)", () => {
    expect(isBrowseResult({ dir: null, parent: null, entries: [] })).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(isBrowseResult(null)).toBe(false);
    expect(isBrowseResult([])).toBe(false);
  });

  it("rejects a non-string, non-null dir or parent", () => {
    expect(isBrowseResult({ dir: 5, parent: null, entries: [] })).toBe(false);
    expect(isBrowseResult({ dir: null, parent: 5, entries: [] })).toBe(false);
  });

  it("rejects missing parent", () => {
    const { parent: _parent, ...rest } = REAL_BROWSE_RESULT;
    expect(isBrowseResult(rest)).toBe(false);
  });

  it("rejects non-array entries", () => {
    expect(isBrowseResult({ dir: null, parent: null, entries: "nope" })).toBe(false);
  });

  it("rejects an entry with a wrong family string", () => {
    expect(
      isBrowseResult({ dir: null, parent: null, entries: [{ name: "x", path: "/x", family: "n64" }] }),
    ).toBe(false);
  });

  it("accepts an entry with family 'unsupported' or null", () => {
    expect(
      isBrowseResult({
        dir: null,
        parent: null,
        entries: [
          { name: "x", path: "/x", family: "unsupported" },
          { name: "y", path: "/y", family: null },
        ],
      }),
    ).toBe(true);
  });

  it("rejects an entry with a non-string name", () => {
    expect(
      isBrowseResult({ dir: null, parent: null, entries: [{ name: 1, path: "/x", family: null }] }),
    ).toBe(false);
  });
});

describe("isOpenConflict", () => {
  it("accepts the real shape", () => {
    expect(isOpenConflict(REAL_OPEN_CONFLICT)).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(isOpenConflict(null)).toBe(false);
  });

  it("rejects a non-string error", () => {
    expect(isOpenConflict({ error: 42, dirtyMaps: [] })).toBe(false);
  });

  it("rejects dirtyMaps with a number in it", () => {
    expect(isOpenConflict({ error: "x", dirtyMaps: ["Route1", 2] })).toBe(false);
  });

  it("rejects missing dirtyMaps", () => {
    expect(isOpenConflict({ error: "x" })).toBe(false);
  });

  it("rejects non-array dirtyMaps", () => {
    expect(isOpenConflict({ error: "x", dirtyMaps: "nope" })).toBe(false);
  });
});

describe("openProject", () => {
  const PATH = "/tmp/pokeemerald";
  const INFO = { family: "gba", root: PATH };

  it("200 + valid ProjectInfo -> opened", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(INFO) }),
    );
    const result = await openProject(PATH);
    expect(result).toEqual({ kind: "opened", info: INFO });
  });

  it("posts { path } with no force by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(INFO) });
    vi.stubGlobal("fetch", fetchMock);
    await openProject(PATH);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/hub/open",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ path: PATH }),
      }),
    );
  });

  it("posts { path, force: true } when force is passed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(INFO) });
    vi.stubGlobal("fetch", fetchMock);
    await openProject(PATH, true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/hub/open",
      expect.objectContaining({ body: JSON.stringify({ path: PATH, force: true }) }),
    );
  });

  it("409 + valid OpenConflict -> conflict", async () => {
    const conflict = { error: "unsaved edits in 1 map(s)", dirtyMaps: ["Route1"] };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve(conflict) }),
    );
    const result = await openProject(PATH);
    expect(result).toEqual({ kind: "conflict", dirtyMaps: ["Route1"], error: conflict.error });
  });

  it("422 -> error with the server's message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 422, json: () => Promise.resolve({ error: "not a pokeemerald-family directory" }) }),
    );
    const result = await openProject(PATH);
    expect(result).toEqual({ kind: "error", error: "not a pokeemerald-family directory" });
  });

  it("404 -> error with the server's message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({ error: "no such directory /tmp/x" }) }),
    );
    const result = await openProject(PATH);
    expect(result).toEqual({ kind: "error", error: "no such directory /tmp/x" });
  });

  it("500 with no error field -> a generic status message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) }),
    );
    const result = await openProject(PATH);
    expect(result).toEqual({ kind: "error", error: "Open failed (status 500)" });
  });

  it("a thrown fetch -> error, never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await openProject(PATH);
    expect(result).toEqual({ kind: "error", error: "network down" });
  });

  it("a 200 response with a bad shape -> error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ family: "n64" }) }),
    );
    const result = await openProject(PATH);
    expect(result.kind).toBe("error");
  });

  it("a body that fails to parse as JSON never throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.reject(new Error("bad json")) }),
    );
    const result = await openProject(PATH);
    expect(result.kind).toBe("error");
  });
});
