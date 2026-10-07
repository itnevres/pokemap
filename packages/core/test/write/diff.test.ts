import { describe, it, expect } from "vitest";
import { formatDiffText, formatDiffJson } from "../../src/write/diff.js";
import type { SavePlan } from "../../src/write/save.js";

const PLAN_WITH_CHANGES = {
  session: {} as any,
  changes: [
    { path: "/x/map.bin", kind: "binary" as const, summary: "map.bin -- 3 blocks changed" },
    { path: "/x/Test.json", kind: "json" as const, summary: "Test.json -- 1 field edit" },
  ],
  refusals: [],
};

const PLAN_WITH_REFUSAL = {
  session: {} as any,
  changes: [],
  refusals: [{ code: "metatile-out-of-range", message: "bad id 999", fix: "pick a real one", subject: "Test_Layout" }],
};

describe("formatDiffText", () => {
  it("lists every change with its own summary", () => {
    const text = formatDiffText(PLAN_WITH_CHANGES);
    expect(text).toContain("map.bin -- 3 blocks changed");
    expect(text).toContain("Test.json -- 1 field edit");
  });

  it("lists refusals with their fix text, and nothing else, when refusals are present", () => {
    const text = formatDiffText(PLAN_WITH_REFUSAL);
    expect(text).toContain("metatile-out-of-range");
    expect(text).toContain("pick a real one");
  });

  it("says nothing to save for an empty plan", () => {
    expect(formatDiffText({ changes: [], refusals: [] })).toMatch(/nothing to save/i);
  });
});

describe("formatDiffText on a plain { changes, refusals } object (GBC plans reuse it)", () => {
  it("formats a plan-shaped object that carries no session", () => {
    const text = formatDiffText({ changes: PLAN_WITH_CHANGES.changes, refusals: PLAN_WITH_REFUSAL.refusals });
    expect(text).toBe(
      "map.bin -- 3 blocks changed\nTest.json -- 1 field edit\n" +
        "REFUSED [metatile-out-of-range] Test_Layout: bad id 999 -- pick a real one",
    );
  });
});

describe("formatDiffJson", () => {
  it("round-trips changes and refusals as plain data, dropping the session (not JSON-safe / not the caller's business)", () => {
    const j = formatDiffJson(PLAN_WITH_CHANGES) as any;
    expect(j.changes).toHaveLength(2);
    expect(j.refusals).toEqual([]);
    expect(j.session).toBeUndefined();
  });
});
