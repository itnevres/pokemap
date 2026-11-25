import { describe, it, expect } from "vitest";
import { openGbcProject } from "@pokemap/core/gbc/project";
import { GBC_SUBJECT_ROOT, hasGbcProject } from "@pokemap/core/test/gbc/helpers/corpus.js";
import { createGbcEditSessionStore } from "../src/gbcEditSessions.js";

describe.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT))("createGbcEditSessionStore", () => {
  // Opened per test, not in the describe body: a skipped suite's body still runs.
  const open = () => openGbcProject(GBC_SUBJECT_ROOT);

  it("exposes the project root", () => {
    const proj = open();
    expect(createGbcEditSessionStore(proj).root).toBe(proj.root);
  });

  it("opening a map twice returns the same entry; close() makes the next open fresh", () => {
    const store = createGbcEditSessionStore(open());
    const a = store.open("NewBarkTown");
    expect(store.open("NewBarkTown")).toBe(a);
    store.close("NewBarkTown");
    expect(store.open("NewBarkTown")).not.toBe(a);
  });

  it("records a baseline hash per editable sign label on open", () => {
    const { signBaselines } = createGbcEditSessionStore(open()).open("NewBarkTown");
    expect([...signBaselines.keys()]).toEqual(expect.arrayContaining(["NewBarkTownSign", "NewBarkTownElmsLabSign"]));
    expect(signBaselines.get("NewBarkTownSign")).toEqual(expect.any(String));
  });

  it("an unknown map throws and stores nothing", () => {
    const store = createGbcEditSessionStore(open());
    expect(() => store.open("NoSuchMap")).toThrow();
    expect(store.has("NoSuchMap")).toBe(false);
  });
});
