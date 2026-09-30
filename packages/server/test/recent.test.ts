import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRecent, pushRecent, recentHome } from "../src/recent.js";

const homes: string[] = [];
function makeHome(): string {
  const h = mkdtempSync(join(tmpdir(), "pokemap-home-"));
  homes.push(h);
  return h;
}

afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});

describe("recent.ts", () => {
  it("round-trips: push A, B, A -> [A, B], A's openedAt updated; file content version: 1", async () => {
    const home = makeHome();
    pushRecent(home, { path: "C:/a", family: "gba" }, new Date("2026-01-01T00:00:00Z"));
    pushRecent(home, { path: "C:/b", family: "gbc" }, new Date("2026-01-02T00:00:00Z"));
    const entries = pushRecent(home, { path: "C:/a", family: "gba" }, new Date("2026-01-03T00:00:00Z"));

    expect(entries.map((e) => e.path)).toEqual(["C:/a", "C:/b"]);
    expect(entries[0]!.openedAt).toBe("2026-01-03T00:00:00.000Z");

    const onDisk = JSON.parse(readFileSync(join(home, "recent.json"), "utf8")) as { version: number };
    expect(onDisk.version).toBe(1);
  });

  it("dedupe normalises: push C:\\\\x\\\\y\\\\ then C:/x/y -> one entry", () => {
    const home = makeHome();
    pushRecent(home, { path: "C:\\x\\y\\", family: "gba" });
    const entries = pushRecent(home, { path: "C:/x/y", family: "gba" });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.path).toBe("C:/x/y");
  });

  it.skipIf(process.platform !== "win32")("dedupe is case-insensitive on win32: c:/X/y dedupes against C:/x/y", () => {
    const home = makeHome();
    pushRecent(home, { path: "C:/x/y", family: "gba" });
    const entries = pushRecent(home, { path: "c:/X/y", family: "gba" });
    expect(entries).toHaveLength(1);
  });

  it("cap: push 12 distinct -> 10, newest first", () => {
    const home = makeHome();
    let entries: ReturnType<typeof pushRecent> = [];
    for (let i = 0; i < 12; i++) {
      entries = pushRecent(home, { path: `C:/proj${i}`, family: "gba" }, new Date(2026, 0, i + 1));
    }
    expect(entries).toHaveLength(10);
    expect(entries[0]!.path).toBe("C:/proj11");
    expect(entries[9]!.path).toBe("C:/proj2");
  });

  it("corrupt (unparseable) JSON: readRecent -> [], recent.json.bad holds the original bytes, recent.json gone", () => {
    const home = makeHome();
    writeFileSync(join(home, "recent.json"), "{not json");
    expect(readRecent(home)).toEqual([]);
    expect(existsSync(join(home, "recent.json"))).toBe(false);
    expect(readFileSync(join(home, "recent.json.bad"), "utf8")).toBe("{not json");
  });

  it("wrong shape ({ version: 2, entries: [] }): same quarantine behaviour", () => {
    const home = makeHome();
    writeFileSync(join(home, "recent.json"), JSON.stringify({ version: 2, entries: [] }));
    expect(readRecent(home)).toEqual([]);
    expect(existsSync(join(home, "recent.json"))).toBe(false);
    expect(existsSync(join(home, "recent.json.bad"))).toBe(true);
  });

  it("recentHome() honours POKEMAP_HOME", () => {
    const prev = process.env.POKEMAP_HOME;
    try {
      process.env.POKEMAP_HOME = "C:/some/pokemap/home";
      expect(recentHome()).toBe("C:/some/pokemap/home");
    } finally {
      if (prev === undefined) delete process.env.POKEMAP_HOME;
      else process.env.POKEMAP_HOME = prev;
    }
  });
});
