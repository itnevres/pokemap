import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openProject } from "../../src/project.js";
import { parseBlocks } from "../../src/load/blocks.js";
import { commitSave, planSave, type EditSession } from "../../src/write/save.js";
import { SUBJECT_ROOT, itWithCorpus } from "../helpers/corpus.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(before: string) {
  const source = openProject(SUBJECT_ROOT);
  const mapName = "Route101";
  const layout = source.layoutForMap(mapName);
  const root = mkdtempSync(join(tmpdir(), "pokemap-script-replace-"));
  roots.push(root);
  const blocks = parseBlocks(readFileSync(`${SUBJECT_ROOT}/${layout.blockdataFilepath}`), source.profile);
  const border = parseBlocks(readFileSync(`${SUBJECT_ROOT}/${layout.borderFilepath}`), source.profile);
  writeFileSync(join(root, "map.bin"), readFileSync(`${SUBJECT_ROOT}/${layout.blockdataFilepath}`));
  writeFileSync(join(root, "border.bin"), readFileSync(`${SUBJECT_ROOT}/${layout.borderFilepath}`));
  const originalMapJson = readFileSync(source.paths.mapJson(mapName), "utf8");
  writeFileSync(join(root, "map.json"), originalMapJson);
  const tempLayout = { ...layout, blockdataFilepath: "map.bin", borderFilepath: "border.bin" };
  const proj = Object.assign(Object.create(source), { paths: { ...source.paths, root, mapJson: () => join(root, "map.json") } });
  const session: EditSession = {
    mapName, layout: tempLayout, blocks, border, map: source.map(mapName), originalBlocks: structuredClone(blocks),
    originalMap: structuredClone(source.map(mapName)), originalMapJson, jsonEdits: [], insertOps: [], removeOps: [], isDirty: true,
  };
  const path = join(root, "scripts.inc");
  writeFileSync(path, before);
  return { proj, session, path, root };
}

describe("scriptReplaces", () => {
  itWithCorpus.each(["Old:\n\tend\n", "Old:\r\n\tend"])("plans one text change and commits exact bytes (%s)", (before) => {
    const { proj, session, path } = fixture(before);
    const after = before.replace("Old", "New");
    session.scriptReplaces = [{ path, before, after }];
    const plan = planSave(proj, session);
    expect(plan.refusals).toEqual([]);
    expect(plan.changes).toEqual([{ path, kind: "text", summary: "Update sign text in scripts.inc" }]);
    expect(readFileSync(path, "utf8")).toBe(before);
    commitSave(proj, plan);
    expect(readFileSync(path)).toEqual(Buffer.from(after));
  });

  itWithCorpus("refuses changed and missing source while planning", () => {
    const { proj, session, path } = fixture("old");
    session.scriptReplaces = [{ path, before: "stale", after: "new" }];
    expect(planSave(proj, session).refusals).toContainEqual(expect.objectContaining({ code: "script-changed-on-disk", subject: path }));
    rmSync(path);
    expect(planSave(proj, session).refusals).toContainEqual(expect.objectContaining({ code: "script-changed-on-disk", subject: path }));
  });

  itWithCorpus("refuses two replaces for one path instead of letting the last one win", () => {
    const { proj, session, path } = fixture("old");
    session.scriptReplaces = [{ path, before: "old", after: "first" }, { path, before: "old", after: "second" }];
    const plan = planSave(proj, session);
    expect(plan.refusals).toContainEqual(expect.objectContaining({ code: "script-replace-duplicate", subject: path }));
    expect(() => commitSave(proj, plan)).toThrow("script-replace-duplicate");
    expect(readFileSync(path, "utf8")).toBe("old");
  });

  itWithCorpus("rechecks disk at commit before any file write", () => {
    const { proj, session, path, root } = fixture("old");
    session.scriptReplaces = [{ path, before: "old", after: "new" }];
    session.jsonEdits = [{ path: ["music"], value: "MUS_NEW" }];
    const plan = planSave(proj, session);
    writeFileSync(path, "external");
    expect(() => commitSave(proj, plan)).toThrow("script-changed-on-disk");
    expect(readFileSync(path, "utf8")).toBe("external");
    expect(readFileSync(join(root, "map.json"), "utf8")).toBe(session.originalMapJson);
  });

  itWithCorpus("applies same-path appends after replacement", () => {
    const { proj, session, path } = fixture("old\n");
    session.scriptReplaces = [{ path, before: "old\n", after: "new\n" }];
    session.scriptAppends = [{ path, text: "first\n" }, { path, text: "second\n" }];
    commitSave(proj, planSave(proj, session));
    expect(readFileSync(path, "utf8")).toBe("new\n\nfirst\n\nsecond\n");
  });
});
