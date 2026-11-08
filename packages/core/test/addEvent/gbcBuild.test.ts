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
import { parseGbcCharmap } from "../../src/signs/charmap.js";
import { copyGbcScriptBody } from "../../src/addEvent/gbcCopy.js";

let root: string, text: string, ctx: GbcAddCtx;
beforeAll(() => {
  root = copyGbcSubjectToTemp();
  text = readFileSync(join(root, "maps/Route29.asm"), "utf8");
  const options = loadGbcEventOptions(root);
  ctx = { options, mapOptions: { entryPoints: ["ObjectEvent", "Route29YoungsterScript"],
    localScripts: ["Route29YoungsterScript"], localTexts: ["Route29YoungsterText"],
    scenes: ["SCENE_ROUTE29_NOOP", "SCENE_ROUTE29_CATCH_TUTORIAL"], warps: [] },
    mapConsts: new Set(options.maps), eventFlagsDisk: readFileSync(join(root, "constants/event_flags.asm"), "utf8"),
    constEdits: [], check: () => ({ taken: false }),
    charmap: parseGbcCharmap(readFileSync(join(root, "constants/charmap.asm"), "utf8")) };
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
  const added = r.events.objects[r.created.index]!;
  expect(added.objectType).toBe("OBJECTTYPE_ITEMBALL");
  expect(added.script).toBe("Route29PokemapObject1");
  expect(added.eventFlag).toBe("EVENT_POKEMAP_POTION");
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
  expect(r.events.objects[r.created.index]!.eventFlag).toBe("-1");
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
  expect(build({ kind: "coord", x: 1, y: 2, fields: { scene: "-1" }, script: { mode: "existing", label: "Route29YoungsterScript" } }).text).toContain("-1, Route29YoungsterScript");
});
it("NO_SCENES on a map with no scene_script", () => {
  const noScenes = text.replace(/^\s*scene_script[^\n]*\n/gm, "");
  refuses("NO_SCENES", () => build({ kind: "coord", x: 1, y: 2, fields: { scene: "-1" }, script: { mode: "existing", label: "Route29YoungsterScript" } }, noScenes, { ...ctx, mapOptions: { ...ctx.mapOptions, scenes: [] } }));
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

it("unchanged Route29 dialogue containing #MON copies with the project charmap", () => {
  // PerfPlus maps/Route29.asm:294, preserved as plain dialogue for TextChoice.
  const body = copyGbcScriptBody(text, "Route29YoungsterScript").texts.Route29YoungsterText!;
  const commands = [...body.matchAll(/^\s*(text|line|cont|para)\s+"([^"]*)"/gm)];
  const dialogue = commands.map(m => `${m[1] === "para" ? "\n" : ""}${m[2]}`).join("\n");
  expect(dialogue).toContain("#MON");
  const f = npc(); f.objectType = "trainer"; f.fields.trainer = "YOUNGSTER,JOEY1";
  f.flag = { mode: "existing", name: "EVENT_BEAT_YOUNGSTER_JOEY" };
  f.texts = { seen: { mode: "copy", from: "Route29YoungsterText", text: dialogue },
    beaten: { mode: "new", text: "Bye" }, after: { mode: "new", text: "Bye" } };
  const r = build(f);
  const generated = r.text.slice(r.text.indexOf("Route29PokemapObject1SeenText:"), r.text.indexOf("Route29PokemapObject1BeatenText:"));
  expect([...generated.matchAll(/^\s*(?:text|line|cont|para)\s+"([^"]*)"/gm)].map(m => m[1])).toEqual(commands.map(m => m[2]));
});
it("project charmap accepts #MON ampersand and TM tokens", () => {
  const f = npc(); f.script = { mode: "new", label: "Route29ProjectGlyphs", text: "#MON & <TM>" };
  expect(build(f).text).toContain('text "#MON & <TM>"');
});
it("project charmap refuses absent characters naming map and file", () => {
  const f = npc(); f.script = { mode: "new", label: "Route29ProjectGlyphs", text: "Hello" };
  refuses("BAD_OPTION", () => build(f, text, { ...ctx, charmap: parseGbcCharmap('charmap "H", $80') }));
  expect(ctx.charmap.has("\u2603")).toBe(false);
  f.script.text = "Hello\u2603";
  refuses("BAD_OPTION", () => build(f));
});
it("edited copy with an empty trailing local block refuses COPY_FALLTHROUGH", () => {
  const f = npc(); f.script = { mode: "copy", from: "Route29YoungsterScript", label: "CopiedScript",
    body: "\tiftrue .Tail\n\tend\n.Tail:\n", texts: { Next: '\ttext "Next"\n\tdone\n' } };
  refuses("COPY_FALLTHROUGH", () => build(f));
});
it("edited copy refuses extra top-level helper definitions without staging", () => {
  const before = JSON.stringify(ctx);
  const f = npc(); f.flag = { mode: "new", name: "PENDING_HELPER" };
  f.script = { mode: "copy", from: "Route29YoungsterScript", label: "CopiedScript",
    body: "\tscall AddedHelper\n\tend\nAddedHelper:\n\tfaceplayer\n\treturn\n", texts: {} };
  refuses("COPY_UNBOUNDED", () => build(f));
  expect(JSON.stringify(ctx)).toBe(before);
  expect(ctx.constEdits).toEqual([]);
});
it("edited copy refuses macro definitions before extraction without staging", () => {
  const before = JSON.stringify(ctx);
  const f = npc(); f.flag = { mode: "new", name: "PENDING_MACRO" };
  f.script = { mode: "copy", from: "Route29YoungsterScript", label: "CopiedScript",
    body: "MACRO helper\n\tfaceplayer\nENDM\n\thelper\n\tend\n", texts: {} };
  refuses("COPY_NOT_SCRIPT", () => build(f));
  expect(JSON.stringify(ctx)).toBe(before);
  expect(ctx.constEdits).toEqual([]);
});

it("existing script ObjectEvent is allowed only for an NPC", () => {
  const zero = { mode: "existing", label: "ObjectEvent" } as const;
  const result = build({ ...npc(), script: zero });
  expect(result.events.objects[result.created.index]!.script).toBe("ObjectEvent");
  for (const kind of ["bg", "coord"] as const) {
    const f: AddEventForm = { kind, x: 1, y: 2, fields: { scene: "-1" }, script: zero };
    refuses("BAD_OPTION", () => build(f));
    expect(() => build(f)).toThrow("script ObjectEvent is only allowed for an NPC");
  }
});
it("unedited corpus script copy passes with the project charmap", () => {
  const original = copyGbcScriptBody(text, "Route29YoungsterScript");
  const result = build({ ...npc(), script: { mode: "copy", from: original.label, label: "CopiedScript",
    body: original.body, texts: original.texts } });
  expect(result.text).toContain("CopiedScript:");
  expect(result.text).toContain("CopiedScriptText1:");
  expect(result.events.objects[result.created.index]!.script).toBe("CopiedScript");
});
it.each(["text", "line", "cont", "para"])("edited copy refuses an absent charmap character in %s", command => {
  const original = copyGbcScriptBody(text, "Route29YoungsterScript");
  const f: AddEventForm = { ...npc(), script: { mode: "copy", from: original.label, label: "CopiedScript",
    body: original.body, texts: { Route29YoungsterText: `${command === "text" ? "" : '\ttext "Hi"\n'}\t${command} "Hello\u2603"\n\tdone\n` } } };
  refuses("BAD_OPTION", () => build(f));
  expect(() => build(f)).toThrow('Character "\u2603" is not in the charmap.');
});

const widthCopy = (originalTexts: Record<string, string>, editedTexts: Record<string, string>) => {
  const body = Object.keys(originalTexts).map(name => `\twritetext ${name}\n`).join("") + "\tend\n";
  const source = text.replace("Route29_MapEvents:", "WidthScript:\n" + body +
    Object.entries(originalTexts).map(([name, value]) => `${name}:\n${value}`).join("") + "Route29_MapEvents:");
  const context = { ...ctx, mapOptions: { ...ctx.mapOptions, localScripts: [...ctx.mapOptions.localScripts, "WidthScript"] } };
  return build({ ...npc(), script: { mode: "copy", from: "WidthScript", label: "CopiedWidthScript",
    body, texts: editedTexts } }, source, context);
};
it.each(["text", "line", "cont", "para"])("edited copy refuses a %s line wider than SIGN_WIDTH", command => {
  const original = { WidthText: '\ttext "Hi"\n\tdone\n' };
  const edited = { WidthText: `${command === "text" ? "" : '\ttext "Hi"\n'}\t${command} "${"A".repeat(19)}"\n\tdone\n` };
  refuses("BAD_OPTION", () => widthCopy(original, edited));
  expect(() => widthCopy(original, edited)).toThrow("text WidthText has a line wider than 18 characters");
});
it("edited copy measures displayed lines separately and accepts SIGN_WIDTH", () => {
  const result = widthCopy({ WidthText: '\ttext "Hi"\n\tdone\n' },
    { WidthText: `\ttext "${"A".repeat(18)}"\n\tline "${"B".repeat(18)}"\n\tdone\n` });
  expect(result.text).toContain(`text "${"A".repeat(18)}"`);
  expect(result.text).toContain(`line "${"B".repeat(18)}"`);
});
it("edited copy uses the widest original line across copied texts as its limit", () => {
  const original = { WidthText: '\ttext "Hi"\n\tdone\n', WideText: `\ttext "${"A".repeat(24)}"\n\tdone\n` };
  const edited = { ...original, WidthText: `\ttext "${"B".repeat(24)}"\n\tdone\n` };
  expect(widthCopy(original, edited).text).toContain(`text "${"B".repeat(24)}"`);
  edited.WidthText = `\ttext "${"B".repeat(25)}"\n\tdone\n`;
  refuses("BAD_OPTION", () => widthCopy(original, edited));
  expect(() => widthCopy(original, edited)).toThrow("text WidthText has a line wider than 24 characters");
});
it("edited copy uses charmap token widths for original and edited lines", () => {
  // Three player names occupy 21 characters; eleven TM tokens occupy 22.
  const original = { WidthText: '\ttext "<PLAYER><PLAYER><PLAYER>"\n\tdone\n' };
  expect(widthCopy(original, { WidthText: `\ttext "${"A".repeat(21)}"\n\tdone\n` }).text)
    .toContain(`text "${"A".repeat(21)}"`);
  const edited = { WidthText: `\ttext "${"<TM>".repeat(11)}"\n\tdone\n` };
  refuses("BAD_OPTION", () => widthCopy(original, edited));
  expect(() => widthCopy(original, edited)).toThrow("text WidthText has a line wider than 21 characters");
});
