import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { copyGbaAddEventProject, removeGbaTemp } from "../helpers/gbaTempProject.js";
import { subjectSnapshot } from "../helpers/subjectSnapshot.js";
import { copyGbaScriptBody } from "../../src/addEvent/gbaCopy.js";
import { buildGbaAddEvent, type GbaAddCtx } from "../../src/addEvent/gbaBuild.js";
import { loadGbaEventOptions } from "../../src/addEvent/gbaOptions.js";
import { AddEventRefusal, type AddEventForm } from "../../src/addEvent/types.js";
import { parseMap, type MapData } from "../../src/load/maps.js";
import { parseGbaCharmap } from "../../src/signs/charmap.js";

let root: string, source: string, map: MapData, ctx: GbaAddCtx;
beforeAll(() => {
  root = copyGbaAddEventProject();
  source = readFileSync(join(root, "data/maps/Route101/scripts.inc"), "utf8");
  map = parseMap(readFileSync(join(root, "data/maps/Route101/map.json"), "utf8"));
  ctx = { options: loadGbaEventOptions(subjectSnapshot().gba!),
    mapOptions: { entryPoints: [], localScripts: ["Route101_EventScript_Youngster"],
      localTexts: ["Route101_Text_TakeTiredPokemonToPokeCenter"], scenes: [], warps: [] },
    root, mapName: "Route101", tileElevation: 3, freeFlags: [], freeVars: [], scriptReplaces: [],
    check: () => ({ taken: false }), charmap: parseGbaCharmap(readFileSync(join(root, "charmap.txt"), "utf8")) };
});
afterAll(() => { if (root) removeGbaTemp(root); });
function refused(text: string, label: string, code: string) {
  expect(() => copyGbaScriptBody(text, label)).toThrow(AddEventRefusal);
  try { copyGbaScriptBody(text, label); } catch (error) { expect(error).toMatchObject({ code }); }
}
const copyForm = (body: string, texts: Record<string, string>): AddEventForm => ({ kind: "object", x: 1, y: 1, objectType: "npc",
  fields: { sprite: "OBJ_EVENT_GFX_YOUNGSTER", movement: "MOVEMENT_TYPE_FACE_DOWN" },
  script: { mode: "copy", from: "Route101_EventScript_Youngster", label: "Route101_EventScript_Copied", body, texts } });

it("copy of Route101_EventScript_Youngster renames its text label", () => {
  const preview = copyGbaScriptBody(source, "Route101_EventScript_Youngster");
  expect(preview.body.trim()).toBe("msgbox Route101_Text_TakeTiredPokemonToPokeCenter, MSGBOX_NPC\n\tend");
  expect(Object.keys(preview.texts)).toEqual(["Route101_Text_TakeTiredPokemonToPokeCenter"]);
  expect(preview.texts.Route101_Text_TakeTiredPokemonToPokeCenter).toMatch(/\.string "TOWN right close by\.\$"\s*$/);
  const r = buildGbaAddEvent(map, source, copyForm(preview.body, preview.texts), ctx);
  const text = r.scriptAppends[0]!.text.replace(/\r\n/g, "\n");
  expect(r.value.script).toBe("Route101_EventScript_Copied");
  expect(text).toContain("Route101_EventScript_Copied::\n\tmsgbox Route101_Text_Copied, MSGBOX_NPC\n\tend\n");
  expect(text).toContain("Route101_Text_Copied:\n\t.string \"If POK\u00e9MON get tired, take them to\\n\"");
  expect(text).not.toContain("Route101_Text_TakeTiredPokemonToPokeCenter");
  expect(r.newNames).toEqual(["Route101_EventScript_Copied", "Route101_Text_Copied"]);
  // The staged copy parses back under the same grammar.
  expect(copyGbaScriptBody(source + "\n" + text, "Route101_EventScript_Copied").texts).toHaveProperty("Route101_Text_Copied");
});
it("a body reached by fall-through -> COPY_FALLTHROUGH", () => {
  refused("Route101_EventScript_Fall::\n\tlock\n\tfaceplayer\nRoute101_EventScript_Next::\n\tend\n", "Route101_EventScript_Fall", "COPY_FALLTHROUGH");
  // A label-only block falls straight into the next label.
  refused("Route101_EventScript_Fall::\nRoute101_EventScript_Next::\n\tend\n", "Route101_EventScript_Fall", "COPY_FALLTHROUGH");
  refused("Route101_EventScript_Fall::\n\tlock\n", "Route101_EventScript_Fall", "COPY_UNBOUNDED");
});
it("an edited body that loses its terminator -> COPY_UNBOUNDED on re-parse", () => {
  const preview = copyGbaScriptBody(source, "Route101_EventScript_Youngster");
  const edited = copyForm("\tmsgbox Route101_Text_TakeTiredPokemonToPokeCenter, MSGBOX_NPC\n", preview.texts);
  expect(() => buildGbaAddEvent(map, source, edited, ctx)).toThrow(AddEventRefusal);
  try { buildGbaAddEvent(map, source, edited, ctx); } catch (e) {
    expect(e).toMatchObject({ code: "COPY_UNBOUNDED", path: "data/maps/Route101/scripts.inc" });
  }
});
it("an edited body with an extra top-level definition is refused", () => {
  const edited = copyForm("\tcall Helper\n\tend\nHelper::\n\treturn\n", {});
  expect(() => buildGbaAddEvent(map, source, edited, ctx)).toThrow(expect.objectContaining({ code: "COPY_UNBOUNDED" }));
});
it("data, movement and text labels are not event scripts", () => {
  refused(source, "Route101_MapScripts", "COPY_NOT_SCRIPT");
  refused(source, "Route101_Movement_PreventExitSouth", "COPY_NOT_SCRIPT");
  refused(source, "Route101_Text_TakeTiredPokemonToPokeCenter", "COPY_NOT_SCRIPT");
  refused(source, "Route101_EventScript_Missing", "COPY_NOT_SCRIPT");
});
const T = "Route101_Text_TakeTiredPokemonToPokeCenter";
const BODY = `\tmsgbox ${T}, MSGBOX_NPC\n\tend\n`;
function buildRefused(form: AddEventForm, code: string, message?: string) {
  expect(() => buildGbaAddEvent(map, source, form, ctx)).toThrow(AddEventRefusal);
  try { buildGbaAddEvent(map, source, form, ctx); } catch (e) {
    expect(e).toMatchObject({ code, path: "data/maps/Route101/scripts.inc" });
    expect((e as Error).message).toContain("Route101");
    if (message) expect((e as Error).message).toContain(message);
  }
}
it("an edited body with a #define, #undef or #include directive is refused", () => {
  for (const line of ["#define Route102_EventScript_Other 1", "#undef FLAG_HIDE_MAP_NAME_POPUP", '#include "data/maps/Route102/scripts.inc"']) {
    buildRefused(copyForm(`${line}\n${BODY}`, { [T]: copyGbaScriptBody(source, "Route101_EventScript_Youngster").texts[T]! }), "COPY_NOT_SCRIPT");
  }
});
it("preprocessor conditionals stay copyable (subject MossdeepCity_SpaceCenter_1F uses #ifdef BUGFIX)", () => {
  const inc = "Route101_MapScripts::\n\tend\nRoute101_EventScript_A::\n#ifdef BUGFIX\n\tlock\n#else\n\tlockall\n#endif\n\tend\n";
  expect(copyGbaScriptBody(inc, "Route101_EventScript_A").body).toContain("#ifdef BUGFIX");
});
it("an edited body with a ; statement separator is refused", () => {
  buildRefused(copyForm(`\tmsgbox ${T}, MSGBOX_NPC ; Helper::\n\tend\n`, copyGbaScriptBody(source, "Route101_EventScript_Youngster").texts),
    "COPY_NOT_SCRIPT");
  // A ; inside a string literal is text, not a separator.
  const inc = 'Route101_MapScripts::\n\tend\nRoute101_EventScript_A::\n\tmsgbox Route101_Text_A, MSGBOX_NPC\n\tend\nRoute101_Text_A:\n\t.string "a;b$"\n';
  expect(copyGbaScriptBody(inc, "Route101_EventScript_A").texts).toHaveProperty("Route101_Text_A");
});
it("string literals honour \\\" escapes", () => {
  const inc = 'Route101_MapScripts::\n\tend\nRoute101_EventScript_A::\n\tmsgbox Route101_Text_A, MSGBOX_NPC\n\tend\n' +
    'Route101_Text_A:\n\t.string "Say \\"hi\\" @ there$"\n';
  expect(copyGbaScriptBody(inc, "Route101_EventScript_A").texts.Route101_Text_A).toBe('\t.string "Say \\"hi\\" @ there$"\n');
});
it("edited texts that are not dialogue or not referenced are refused, never dropped", () => {
  buildRefused(copyForm(BODY, { [T]: '\t.string "a$"\n\t.byte 0\n' }), "COPY_UNBOUNDED");
  buildRefused(copyForm(BODY, { [T]: '\t.string "a$"\n', Route101_Text_Extra: '\t.string "b$"\n' }), "COPY_UNBOUNDED");
});
it("edited copied text is checked against the charmap and the source text's width", () => {
  buildRefused(copyForm(BODY, { [T]: '\t.string "\u4e2d\u6587$"\n' }), "BAD_OPTION", "not in the charmap");
  buildRefused(copyForm(BODY, { [T]: `\t.string "${"a".repeat(60)}$"\n` }), "BAD_OPTION", "wider");
  const ok = buildGbaAddEvent(map, source, copyForm(BODY, { [T]: '\t.string "Short line\\n"\n\t.string "{PLAYER} ok$"\n' }), ctx);
  expect(ok.scriptAppends[0]!.text.replace(/\r\n/g, "\n")).toContain('Route101_Text_Copied:\n\t.string "Short line\\n"\n\t.string "{PLAYER} ok$"');
});
