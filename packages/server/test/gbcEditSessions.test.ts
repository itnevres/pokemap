import { describe, it, expect } from "vitest";
import { openGbcProject } from "@pokemap/core/src/gbc/project.js";
import { GBC_SUBJECT_ROOT, hasGbcProject } from "@pokemap/core/test/gbc/helpers/corpus.js";
import { createGbcEditSessionStore } from "../src/gbcEditSessions.js";

describe.skipIf(!hasGbcProject(GBC_SUBJECT_ROOT))("createGbcEditSessionStore", () => {
  const proj = openGbcProject(GBC_SUBJECT_ROOT);

  it("exposes the project root", () => {
    expect(createGbcEditSessionStore(proj).root).toBe(proj.root);
  });

  it("opening a map twice returns the same entry; close() makes the next open fresh", () => {
    const store = createGbcEditSessionStore(proj);
    const a = store.open("NewBarkTown");
    expect(store.open("NewBarkTown")).toBe(a);
    store.close("NewBarkTown");
    expect(store.open("NewBarkTown")).not.toBe(a);
  });

  it("records a baseline hash per editable sign label on open", () => {
    const { signBaselines } = createGbcEditSessionStore(proj).open("NewBarkTown");
    expect([...signBaselines.keys()]).toEqual(expect.arrayContaining(["NewBarkTownSign", "NewBarkTownElmsLabSign"]));
    expect(signBaselines.get("NewBarkTownSign")).toEqual(expect.any(String));
  });

  it("an unknown map throws and stores nothing", () => {
    const store = createGbcEditSessionStore(proj);
    expect(() => store.open("NoSuchMap")).toThrow();
    expect(store.has("NoSuchMap")).toBe(false);
  });
});
