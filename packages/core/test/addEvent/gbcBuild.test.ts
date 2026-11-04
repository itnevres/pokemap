import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { copyGbcSubjectToTemp, removeTemp } from "../gbc/helpers/corpus.js";
import { loadGbcEventOptions } from "../../src/addEvent/gbcOptions.js";
import { buildGbcAddEvent, defaultGbcLabel, type GbcAddCtx } from "../../src/addEvent/gbcBuild.js";
import { AddEventRefusal, type AddEventForm } from "../../src/addEvent/types.js";
import { gbcEventGap } from "../../src/gbc/load/constCounter.js";
import { parseMapEvents } from "../../src/gbc/load/events.js";
import { addGbcEvent } from "../../src/gbc/edit/events.js";

let root: string, text: string, ctx: GbcAddCtx;
beforeAll(() => {
  root = copyGbcSubjectToTemp();
  text = readFileSync(join(root, "maps/Route29.asm"), "utf8");
  const options = loadGbcEventOptions(root);
  ctx = { options, mapOptions: { entryPoints: ["ObjectEvent", "Route29YoungsterScript"],
    localScripts: ["Route29YoungsterScript"], localTexts: ["Route29YoungsterText"],
    scenes: ["SCENE_ROUTE29_NOOP", "SCENE_ROUTE29_CATCH_TUTORIAL"], warps: [] },
    mapConsts: new Set(options.maps), eventFlagsDisk: readFileSync(join(root, "constants/event_flags.asm"), "utf8"),
    constEdits: [], check: () => ({ taken: false }) };
});
afterAll(() => { if (root) removeTemp(root); });
const npc = (): AddEventForm => ({ kind: "object", x: 3, y: 4, objectType: "npc",
  fields: { sprite: "SPRITE_YOUNGSTER", movement: "SPRITEMOVEDATA_STANDING_DOWN" },
  script: { mode: "new", label: "Route29PokemapObject1", text: "Hello there!" } });
const build = (form = npc(), source = text, context = ctx) => buildGbcAddEvent(source, "Route29", form, context);
function refuses(code: string, fn: () => unknown, path = "maps/Route29.asm") {
  try { fn(); throw new Error("expected refusal"); }
  catch (e) {
    expect(e).toBeInstanceOf(AddEventRefusal);
    expect(e).toMatchObject({ code, path });
    expect((e as Error).message).toContain("Route29");
    expect((e as Error).message).toContain(path);
  }
}

it("npc new", () => {
  const result = build();
  expect(result.events.objects.length).toBe(parseMapEvents(text, "Route29").objects.length + 1);
  expect(result.text.match(/\bobject_event\b/g)!.length).toBe(text.match(/\bobject_event\b/g)!.length + 1);
  expect(result.text).toContain("Route29PokemapObject1:\n\tjumptextfaceplayer Route29PokemapObject1Text".replace(/\n/g, text.includes("\r\n") ? "\r\n" : "\n"));
  expect(result.text.indexOf("Route29PokemapObject1:")).toBeLessThan(result.text.indexOf("Route29_MapEvents:"));
  expect(result.text).toMatch(/Route29PokemapObject1Text:\r?\n\ttext "Hello there!"\r?\n\tdone/);
  expect(result.newNames).toEqual(["Route29PokemapObject1", "Route29PokemapObject1Text", "ROUTE29_YOUNGSTER2"]);
  expect(result.created).toEqual({ kind: "object", index: parseMapEvents(text, "Route29").objects.length });
});
it("itemball", () => {
  const f = npc(); f.objectType = "itemball"; f.fields.item = "POTION"; f.script = undefined;
  f.flag = { mode: "new", name: "POKEMAP_POTION" };
  const r = build(f);
  expect(r.text).toContain("OBJECTTYPE_ITEMBALL");
  expect(r.text).toMatch(/Route29PokemapObject1:\r?\n\titemball POTION/);
  expect(r.constEdits).toHaveLength(1);
  expect(r.constEdits[0]!.path).toBe("constants/event_flags.asm");
  const gap = gbcEventGap(ctx.eventFlagsDisk)!;
  expect(r.constEdits[0]!.after.split(/\r?\n/)[gap.afterLine + 1]).toBe("\tconst EVENT_POKEMAP_POTION");
});
it("trainer existing", () => {
  // PerfPlus maps/Route30.asm:40, TrainerYoungsterJoey1, and macros/scripts/maps.asm:134-145:
  // trainer group, id, event flag, seen text, beaten text, loss text, after-battle script.
  // macros/scripts/events.asm defines jumptext/endifjustbattled used by the after script.
  const f = npc(); f.objectType = "trainer"; f.script = undefined;
  f.fields.trainer = "YOUNGSTER,JOEY1";
  f.flag = { mode: "existing", name: "EVENT_BEAT_YOUNGSTER_JOEY" };
  f.texts = { seen: { mode: "new", text: "Seen!" }, beaten: { mode: "new", text: "Beaten!" }, after: { mode: "new", text: "After!" } };
  const r = build(f);
  expect(r.text).toContain("OBJECTTYPE_TRAINER");
  expect(r.text).toContain("trainer YOUNGSTER, JOEY1, EVENT_BEAT_YOUNGSTER_JOEY, Route29PokemapObject1SeenText, Route29PokemapObject1BeatenText, 0, Route29PokemapObject1After");
  for (const value of ["Seen!", "Beaten!", "After!"]) expect(r.text).toContain(`text "${value}"`);
  expect(r.text).toMatch(/Route29PokemapObject1After:\r?\n\tendifjustbattled\r?\n\tjumptext Route29PokemapObject1AfterText/);
});
it("bg item", () => {
  const r = build({ kind: "bg", x: 1, y: 2, fields: { bgType: "BGEVENT_ITEM", item: "POTION" }, flag: { mode: "existing", name: ctx.options.flags[0]! } });
  expect(r.text).toContain(`hiddenitem POTION, ${ctx.options.flags[0]}`);
  expect(r.text).toMatch(/Route29PokemapBg1:\r?\n\thiddenitem/);
  expect(r.text).toContain("BGEVENT_ITEM, Route29PokemapBg1");
});
it("bg ifset", () => {
  const r = build({ kind: "bg", x: 1, y: 2, fields: { bgType: "BGEVENT_IFSET" }, flag: { mode: "existing", name: ctx.options.flags[0]! }, script: { mode: "existing", label: "Route29YoungsterScript" } });
  expect(r.text).toContain(`conditional_event ${ctx.options.flags[0]}, Route29YoungsterScript`);
});
it("coord", () => {
  const f: AddEventForm = { kind: "coord", x: 1, y: 2, fields: { scene: "SCENE_ROUTE29_NOOP" }, script: { mode: "existing", label: "Route29YoungsterScript" } };
  expect(build(f).text).toContain("SCENE_ROUTE29_NOOP, Route29YoungsterScript");
});
it("coord scene -1 accepted", () => {
  expect(build({ kind: "coord", x: 1, y: 2, fields: { scene: "-1" }, script: { mode: "existing", label: "ObjectEvent" } }).text).toContain("-1, ObjectEvent");
});
it("NO_SCENES on a map with no scene_script", () => {
  const noScenes = text.replace(/^\s*scene_script[^\n]*\n/gm, "");
  refuses("NO_SCENES", () => build({ kind: "coord", x: 1, y: 2, fields: { scene: "-1" }, script: { mode: "existing", label: "ObjectEvent" } }, noScenes, { ...ctx, mapOptions: { ...ctx.mapOptions, scenes: [] } }));
});
it("NAME_INVALID (1abc)", () => {
  const f = npc(); f.script = { mode: "new", label: "1abc", text: "Hi" };
  refuses("NAME_INVALID", () => build(f));
});
it("LABEL_TAKEN (check says taken)", () => {
  refuses("LABEL_TAKEN", () => build(npc(), text, { ...ctx, check: () => ({ taken: true }) }));
});
it("object const is checked against the injected namespace", () => {
  refuses("LABEL_TAKEN", () => build(npc(), text, { ...ctx, check: name => ({ taken: name === "ROUTE29_YOUNGSTER2" }) }));
});
it("OBJECT_CAP at 15", () => {
  let source = text;
  const count = parseMapEvents(source, "Route29").objects.length;
  for (let i = count; i < 15; i++) source = addGbcEvent(source, "Route29", "object", ["1", "1", "SPRITE_YOUNGSTER", "SPRITEMOVEDATA_STANDING_DOWN", "0", "0", "-1", "-1", "0", "OBJECTTYPE_SCRIPT", "0", "ObjectEvent", "-1"], { objectConst: `ROUTE29_TEST_${i}` }).text;
  refuses("OBJECT_CAP", () => build(npc(), source));
});
it("NO_FLAG_SLOT (gap-full fixture)", () => {
  const f = npc(); f.flag = { mode: "new", name: "FULL" };
  refuses("NO_FLAG_SLOT", () => build(f, text, { ...ctx, eventFlagsDisk: "\tconst_def\n\tconst EVENT_LAST\n\tconst_next 1\n" }), "constants/event_flags.asm");
});
it("BAD_OPTION (sprite not in options)", () => {
  const f = npc(); f.fields.sprite = "SPRITE_NOT_REAL";
  refuses("BAD_OPTION", () => build(f));
});
it("two new flags", () => {
  const f = npc(); f.flag = { mode: "new", name: "FIRST" };
  const first = build(f);
  f.script = { mode: "new", label: "Route29PokemapObject2", text: "Hello!" }; f.flag.name = "SECOND";
  const second = build(f, first.text, { ...ctx, constEdits: first.constEdits });
  expect(second.constEdits).toHaveLength(1);
  const edit = second.constEdits[0]!;
  expect(edit.before).toBe(ctx.eventFlagsDisk);
  expect(edit.after).toContain("\tconst EVENT_FIRST"); expect(edit.after).toContain("\tconst EVENT_SECOND");
  expect(edit.after.replace(/^\tconst EVENT_(?:FIRST|SECOND)\r?\n/gm, "")).toBe(ctx.eventFlagsDisk);
  expect(first.constEdits[0]!.after).not.toContain("EVENT_SECOND");
});
it("text provenance", () => {
  const f = npc(); f.objectType = "trainer"; f.fields.trainer = "YOUNGSTER,JOEY1";
  f.flag = { mode: "existing", name: "EVENT_BEAT_YOUNGSTER_JOEY" };
  f.texts = { seen: { mode: "copy", from: "ForeignText", text: "Hi" }, beaten: { mode: "new", text: "Bye" }, after: { mode: "new", text: "Bye" } };
  refuses("COPY_NOT_SCRIPT", () => build(f));
});
it("text provenance rejects a stale localTexts entry that is not dialogue", () => {
  const f = npc(); f.objectType = "trainer"; f.fields.trainer = "YOUNGSTER,JOEY1";
  f.flag = { mode: "existing", name: "EVENT_BEAT_YOUNGSTER_JOEY" };
  f.texts = { seen: { mode: "copy", from: "Route29YoungsterScript", text: "Hi" }, beaten: { mode: "new", text: "Bye" }, after: { mode: "new", text: "Bye" } };
  refuses("COPY_NOT_SCRIPT", () => build(f, text, { ...ctx, mapOptions: { ...ctx.mapOptions, localTexts: ["Route29YoungsterScript"] } }));
});
it("trainer accepts copied dialogue from this map", () => {
  const f = npc(); f.objectType = "trainer"; f.fields.trainer = "YOUNGSTER,JOEY1";
  f.flag = { mode: "existing", name: "EVENT_BEAT_YOUNGSTER_JOEY" };
  f.texts = { seen: { mode: "copy", from: "Route29YoungsterText", text: "Copied hello!" }, beaten: { mode: "new", text: "Bye" }, after: { mode: "new", text: "Bye" } };
  expect(build(f).text).toContain('text "Copied hello!"');
});
it("copy re-validation", () => {
  const f = npc(); f.script = { mode: "copy", from: "Route29YoungsterScript", label: "CopiedScript", body: "\tfaceplayer\n", texts: {} };
  refuses("COPY_UNBOUNDED", () => build(f));
});
it("failed create leaves context byte-identical", () => {
  const before = JSON.stringify(ctx);
  const f = npc(); f.flag = { mode: "new", name: "PENDING" }; f.script = { mode: "new", label: "1abc", text: "Hi" };
  refuses("NAME_INVALID", () => build(f));
  expect(JSON.stringify(ctx)).toBe(before);
  expect(ctx.constEdits).toEqual([]);
});
it("default label skips collisions in script and text namespaces", () => {
  expect(defaultGbcLabel("Route29", "object", name => ({ taken: name === "Route29PokemapObject1Text" }))).toBe("Route29PokemapObject2");
});
