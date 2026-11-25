import { describe, it, expect } from "vitest";
import { openProject } from "@pokemap/core/project";
import { createEditSessionStore } from "../src/editSessions.js";
import { SUBJECT_ROOT, hasProject } from "@pokemap/core/test/helpers/corpus.js";

// Plan H trap 24: the GBA handler (`index.ts`) hands the store a project whose
// `map` re-parses from disk, so a session reopened after a commit sees the last
// commit. The store must call `project.map` on EVERY open, never cache it.
describe.skipIf(!hasProject(SUBJECT_ROOT))("createEditSessionStore re-reads the map on every open", () => {
  it("calls project.map once per open and uses its fresh result", () => {
    const base = openProject(SUBJECT_ROOT);
    const calls: object[] = [];
    const project = { ...base, map: (name: string) => { const m = structuredClone(base.map(name)); calls.push(m); return m; } } as typeof base;
    const store = createEditSessionStore(project);

    const first = store.open("NewBarkTown_Lab");
    expect(calls).toHaveLength(1);
    expect(first.session.map).toBe(calls[0]);

    store.open("NewBarkTown_Lab"); // cached entry: no second read
    expect(calls).toHaveLength(1);

    store.close("NewBarkTown_Lab");
    const second = store.open("NewBarkTown_Lab");
    expect(calls).toHaveLength(2);
    expect(second.session.map).toBe(calls[1]);
    expect(second.session.map).not.toBe(first.session.map);
  });
});

describe.skipIf(!hasProject(SUBJECT_ROOT))("createEditSessionStore opening one entry", () => {
  // Opened per test, not in the describe body: a skipped suite's body still runs.
  const open = () => openProject(SUBJECT_ROOT);

  it("exposes the project root", () => {
    const project = open();
    expect(createEditSessionStore(project).root).toBe(project.paths.root);
  });

  it("records a baseline hash per editable sign label on open", () => {
    const { signBaselines } = createEditSessionStore(open()).open("NewBarkTown");
    expect([...signBaselines.keys()]).toEqual(expect.arrayContaining(["NewBarkTown_EventScript_LabSign"]));
    expect(signBaselines.get("NewBarkTown_EventScript_LabSign")).toEqual(expect.any(String));
  });
});
