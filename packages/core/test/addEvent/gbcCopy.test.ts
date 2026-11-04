import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { copyGbcSubjectToTemp, removeTemp } from "../gbc/helpers/corpus.js";
import { copyGbcScriptBody } from "../../src/addEvent/gbcCopy.js";
import { buildGbcAddEvent } from "../../src/addEvent/gbcBuild.js";
import { loadGbcEventOptions } from "../../src/addEvent/gbcOptions.js";
import { AddEventRefusal } from "../../src/addEvent/types.js";
let root: string, source: string;
beforeAll(() => { root = copyGbcSubjectToTemp(); source = readFileSync(join(root, "maps/Route29.asm"), "utf8"); });
afterAll(() => { if (root) removeTemp(root); });
function refused(text: string, label: string, code: string) {
  expect(() => copyGbcScriptBody(text, label)).toThrow(AddEventRefusal);
  try { copyGbcScriptBody(text, label); } catch (error) { expect(error).toMatchObject({ code }); }
}
it("copy of a jumptextfaceplayer script -> body + its text", () => {
  const r = copyGbcScriptBody(source, "Route29YoungsterScript");
  expect(r.label).toBe("Route29YoungsterScript");
  expect(r.body.trim()).toBe("jumptextfaceplayer Route29YoungsterText");
  expect(Object.keys(r.texts)).toEqual(["Route29YoungsterText"]);
  expect(r.texts.Route29YoungsterText).toMatch(/\btext "/);
  expect(r.texts.Route29YoungsterText!.trim()).toMatch(/done$/);
});
it("fall-through fixture -> COPY_FALLTHROUGH", () => {
  refused("Route29Fall:\n\tfaceplayer\nOther:\n\tend\n", "Route29Fall", "COPY_FALLTHROUGH");
});
it("local .Foo inside the body kept", () => {
  const r = copyGbcScriptBody("Route29Local:\n\tiftrue .Foo\n\tend\n.Foo:\n\tend\n", "Route29Local");
  expect(r.body).toContain("iftrue .Foo"); expect(r.body).toContain(".Foo:");
});
it("jump to a local outside -> COPY_FOREIGN_LOCAL", () => {
  refused("Route29Local:\n\tsjump .Foo\nOther:\n.Foo:\n\tend\n", "Route29Local", "COPY_FOREIGN_LOCAL");
});
it("itemball label -> COPY_NOT_SCRIPT", () => {
  refused(source, "Route29Potion", "COPY_NOT_SCRIPT");
});
it("a staged copy renames self, local and text references consistently", () => {
  const text = source.replace("Route29_MapEvents:", "Route29CopySource:\n\tiftrue Route29CopySource\n\tiftrue .Foo\n\tend\n.Foo:\n\tjumptext Route29CopyText\n\nRoute29CopyText:\n\ttext \"Hello!\"\n\tdone\n\nRoute29_MapEvents:");
  const preview = copyGbcScriptBody(text, "Route29CopySource");
  const options = loadGbcEventOptions(root);
  const r = buildGbcAddEvent(text, "Route29", { kind: "bg", x: 1, y: 2, fields: { bgType: "BGEVENT_READ" }, script: { mode: "copy", from: preview.label, label: "Route29Copied", body: preview.body, texts: preview.texts } }, {
    options, mapOptions: { entryPoints: [], localScripts: ["Route29CopySource"], localTexts: ["Route29CopyText"], scenes: [], warps: [] },
    mapConsts: new Set(options.maps), eventFlagsDisk: readFileSync(join(root, "constants/event_flags.asm"), "utf8"), constEdits: [], check: () => ({ taken: false }),
  });
  const copied = copyGbcScriptBody(r.text, "Route29Copied");
  expect(copied.body).toContain("iftrue Route29Copied");
  expect(copied.body).toContain("iftrue .Route29Copied_Foo");
  expect(copied.body).toContain(".Route29Copied_Foo:");
  expect(copied.body).toContain("jumptext Route29CopiedText1");
  expect(copied.texts.Route29CopiedText1).toContain('text "Hello!"');
  expect(r.newNames).toContain("Route29Copied.Route29Copied_Foo");
});
