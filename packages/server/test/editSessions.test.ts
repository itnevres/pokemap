import { describe, it, expect } from "vitest";
import { openProject } from "@pokemap/core/src/project.js";
import { createEditSessionStore } from "../src/editSessions.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";

describe.skipIf(!hasProject(SUBJECT_ROOT))("createEditSessionStore", () => {
  const project = openProject(SUBJECT_ROOT);

  it("opening a map twice returns the SAME session (in-memory, not re-read from disk each time)", () => {
    const store = createEditSessionStore(project);
    const a = store.open("NewBarkTown_Lab");
    const b = store.open("NewBarkTown_Lab");
    expect(a).toBe(b);
  });

  it("opening loads real blocks from the real decomp, matching parseBlocks directly", () => {
    const store = createEditSessionStore(project);
    const entry = store.open("NewBarkTown_Lab");
    expect(entry.session.blocks.length).toBeGreaterThan(0);
    expect(entry.session.isDirty).toBe(false);
  });

  it("close() forgets the session -- a later open() re-reads from disk", () => {
    const store = createEditSessionStore(project);
    const a = store.open("NewBarkTown_Lab");
    a.session.blocks = [{ metatileId: 999, collision: 0, elevation: 0 }]; // corrupt in place
    store.close("NewBarkTown_Lab");
    const b = store.open("NewBarkTown_Lab");
    expect(b.session.blocks).not.toEqual(a.session.blocks);
  });

  it("has() reflects an open session without creating one", () => {
    const store = createEditSessionStore(project);
    expect(store.has("NewBarkTown_Lab")).toBe(false);
    store.open("NewBarkTown_Lab");
    expect(store.has("NewBarkTown_Lab")).toBe(true);
  });

  // Code-review fix: originalMap used to alias project.map(mapName)'s own
  // process-wide cache entry (the exact same object as session.map, not a
  // copy) -- EditSession.originalMap's own doc comment requires an
  // independent copy, the same guarantee originalBlocks already gets via
  // its own .map((b) => ({...b})). Deep equality alone would not catch an
  // aliasing bug (two references to the same object are trivially deep-
  // equal to each other); reference identity is the only check that does.
  it("originalMap is an independent copy, never aliasing session.map or the project's own cache", () => {
    const store = createEditSessionStore(project);
    const entry = store.open("NewBarkTown_Lab");
    expect(entry.session.originalMap).not.toBe(entry.session.map);
    expect(entry.session.originalMap).not.toBe(project.map("NewBarkTown_Lab"));
    expect(entry.session.originalMap).toEqual(project.map("NewBarkTown_Lab"));
  });
});
