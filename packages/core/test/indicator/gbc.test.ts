import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { insertGbcIndicator, findGbcIndicator, updateGbcIndicator } from "../../src/indicator/gbc.js";
import { addGbcEvent } from "../../src/gbc/edit/events.js";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/indicator/gbc-${name}.asm`, import.meta.url), "utf8");
const own = new Set(["GEODUDE"]);
const input = { x: 5, y: 7, species: "GEODUDE", sprite: "SPRITE_GEODUDE", paragraphs: [["Hello"]] };
const event = { script: "Route29PokemonIndicator1", sprite: "SPRITE_GEODUDE" };
const base = () => fixture("route29-lf");
const golden = () => fixture("geodude-lf");

describe("GBC Indicator", () => {
  // Oracles are separate literal fixtures derived from C4 and trimmed PerfPlus Route29.
  it.each(["lf", "crlf"])("place golden preserves %s bytes with own and fallback sprites", style => {
    for (const [species, sprite] of [["GEODUDE", "SPRITE_GEODUDE"], ["SENTRET", "SPRITE_MONSTER"]]) {
      const result = insertGbcIndicator(fixture(`route29-${style}`), "Route29", { ...input, species: species!, sprite: sprite! });
      expect(result.scriptLabel).toBe(event.script);
      expect(result.text).toBe(fixture(`${species!.toLowerCase()}-${style}`));
    }
  });

  it("numbers same-species indicators and reserves real references and either label", () => {
    const first = insertGbcIndicator(base(), "Route29", input);
    expect(insertGbcIndicator(first.text, "Route29", input).scriptLabel).toBe("Route29PokemonIndicator2");
    for (const ref of ["Route29PokemonIndicator1", "Route29PokemonIndicator1Text"]) {
      expect(insertGbcIndicator(`\tcall ${ref}\n` + base(), "Route29", input).scriptLabel).toBe("Route29PokemonIndicator2");
    }
    expect(insertGbcIndicator("\tcall Route29PokemonIndicator3\n" + base(), "Route29", input).scriptLabel).toBe(event.script);
  });

  it("ignores quoted strings and semicolon comments when numbering", () => {
    const prefix = '; Route29PokemonIndicator1\n\ttext "Route29PokemonIndicator1Text; hello"\n';
    expect(insertGbcIndicator(prefix + base(), "Route29", input).scriptLabel).toBe(event.script);
    expect(insertGbcIndicator('\tmacro "semi;colon", Route29PokemonIndicator1\n' + base(), "Route29", input).scriptLabel).toBe("Route29PokemonIndicator2");
  });

  it("locates cap and const refusals, preserving the original message and adding a fix", () => {
    const args = ["0", "0", "SPRITE_MONSTER", "SPRITEMOVEDATA_POKEMON", "0", "0", "-1", "-1", "0", "OBJECTTYPE_SCRIPT", "0", event.script, "-1"];
    let capped = base();
    for (let i = 1; i < 15; i++) capped = addGbcEvent(capped, "Route29", "object", args).text;
    for (const [text, marker, fix] of [
      [capped, "def_object_events", "Remove an object_event from this map or place the Indicator on another map."],
      [base().replace("\tconst ROUTE29_YOUNGSTER\n", ""), "object_const_def", "Make object_const_def list one const per object_event."],
    ]) {
      let refusal = "";
      try { addGbcEvent(text!, "Route29", "object", args); } catch (e) { refusal = (e as Error).message; }
      expect(refusal).toMatch(/15 object_event|out of step/);
      const line = text!.split("\n").findIndex(value => value.trim() === marker) + 1;
      let message = "";
      try { insertGbcIndicator(text!, "Route29", input); } catch (e) { message = (e as Error).message; }
      expect(message).toContain(`maps/Route29.asm:${line}:`);
      expect(message).toContain(refusal);
      expect(message).toContain(fix);

    }
  });

  it("locates a missing object section and supplies a repair", () => {
    const text = base().replace(/^\tobject_event.*\n/gm, "").replace("\tconst ROUTE29_YOUNGSTER\n", "").replace("\tdef_object_events\n", "");
    let original = "";
    const args = ["5", "7", "SPRITE_GEODUDE", "SPRITEMOVEDATA_POKEMON", "0", "0", "-1", "-1", "0", "OBJECTTYPE_SCRIPT", "0", event.script, "-1"];
    try { addGbcEvent(text, "Route29", "object", args); } catch (e) { original = (e as Error).message; }
    expect(original).toMatch(/missing "def_object_events" section/);
    let message = "";
    try { insertGbcIndicator(text, "Route29", input); } catch (e) { message = (e as Error).message; }
    expect(message).toContain(`maps/Route29.asm:${text.split("\n").findIndex(line => line === "Route29_MapEvents:") + 1}:`);
    expect(message).toContain(original);
    expect(message).toContain("Restore the missing event section markers below Route29_MapEvents:.");
  });

  it("refuses a script shared by two objects and stale updates without changing bytes", () => {
    const original = golden();
    const stale = findGbcIndicator(original, event, own)!;
    const shared = addGbcEvent(original, "Route29", "object", ["9", "9", "SPRITE_GEODUDE", "SPRITEMOVEDATA_POKEMON", "0", "0", "-1", "-1", "0", "OBJECTTYPE_SCRIPT", "0", event.script, "-1"]).text;
    const snapshot = shared;
    for (const index of [1, 2]) {
      const block = findGbcIndicator(shared, { ...event }, own)!;
      expect(block).toMatchObject({ editable: false, reason: expect.stringContaining("shared script") });
      for (const candidate of [block, stale]) {
        expect(() => updateGbcIndicator(shared, "Route29", index, candidate, "SENTRET", "SPRITE_MONSTER", [["Hello"]])).toThrow(/maps\/Route29\.asm:\d+:.*shared script.*Restore/);
      }
    }
    expect(shared).toBe(snapshot);
    expect(findGbcIndicator(original, event, own)?.editable).toBe(true);
  });

  it.each([
    `Other:\n\tscall ${event.script}\n`,
    `\tobject_event 1, 1, SPRITE_MONSTER, SPRITEMOVEDATA_POKEMON, 0, 0, -1, -1, 0, OBJECTTYPE_SCRIPT, 0, OtherScript, ${event.script}\n`,
  ])("refuses other real script references: %j", reference => {
    const text = golden() + reference;
    expect(findGbcIndicator(text, event, own)).toMatchObject({ editable: false, reason: expect.stringContaining("shared script") });
  });

  it("ignores comments and literals when checking script ownership", () => {
    const text = golden() + `; ${event.script}\nOther:\n\ttext "${event.script}"\n\tdone\n`;
    expect(findGbcIndicator(text, event, own)?.editable).toBe(true);
  });

  it("locates a missing or duplicate MapEvents anchor and gives a fix", () => {
    for (const text of [base().replace("Route29_MapEvents:", "Other_MapEvents:"), base() + "Route29_MapEvents:\n"]) {
      expect(() => insertGbcIndicator(text, "Route29", input)).toThrow(/maps\/Route29\.asm:.*MapEvents.*Restore/);
    }
  });

  it("recognises generated blocks and round trips canonical paragraphs", () => {
    expect(findGbcIndicator(golden(), event, own)).toMatchObject({ scriptLabel: event.script, editable: true, species: "GEODUDE", text: "Hello", textLabel: event.script + "Text" });
    const paragraphs = [["First", "Second", "Third"], ["Last; yes"]];
    const out = insertGbcIndicator(base(), "Route29", { ...input, paragraphs });
    expect(findGbcIndicator(out.text, event, own)).toMatchObject({ editable: true, text: "First\nSecond\nThird\n\nLast; yes" });
  });

  it("refuses extra script commands, shared text, duplicate labels and sprite/cry disagreement", () => {
    for (const text of [
      golden().replace("\tcry GEODUDE", "\tsetevent EVENT_TEST\n\tcry GEODUDE"),
      golden() + `Other:\n\twritetext ${event.script}Text\n\tend\n`,
      golden() + `${event.script}:\n\tend\n`,
      golden() + `${event.script}Text:\n\ttext "Other"\n\tdone\n`,
      golden().replace("\tcry GEODUDE", "\tcry SENTRET"),
      golden().replace("\tdone\n\nRoute29_MapEvents:", "\tdone\n\ttext \"extra\"\n\nRoute29_MapEvents:"),
    ]) expect(findGbcIndicator(text, event, own)).toMatchObject({ editable: false, reason: expect.any(String) });
    expect(findGbcIndicator(golden(), { ...event, sprite: "SPRITE_MONSTER" }, own)).toMatchObject({ editable: false, reason: expect.stringContaining("sprite") });
    expect(findGbcIndicator(golden(), { script: "Route29YoungsterScript", sprite: "SPRITE_YOUNGSTER" }, own)).toBeNull();
    expect(findGbcIndicator(golden(), { ...event, script: "Absent" }, own)).toBeNull();
  });

  it.each([
    '\t\ttext "Hello"', '\ttext "Hello" ; keep', '; keep\n\ttext "Hello"', '\ttext "Hello" ', '\n\ttext "Hello"',
  ])("refuses noncanonical text layout: %j", body => {
    const text = golden().replace('\ttext "Hello"', body);
    const block = findGbcIndicator(text, event, own)!;
    expect(block).toMatchObject({ editable: false, reason: "text layout changed outside PokeMap" });
    expect(() => updateGbcIndicator(text, "Route29", 1, block, "SENTRET", "SPRITE_MONSTER", [["New"]])).toThrow(/maps\/Route29\.asm:.*text layout changed outside PokeMap.*Restore/);
  });

  it("ignores comment and literal mentions when checking text ownership", () => {
    const text = golden() + `; ${event.script}Text\nOther:\n\ttext "${event.script}Text"\n\tdone\n`;
    expect(findGbcIndicator(text, event, own)?.editable).toBe(true);
  });

  it.each(["lf", "crlf"])("updates only sprite and cry, preserves labels and consts (%s)", style => {
    const before = fixture(`geodude-${style}`);
    const block = findGbcIndicator(before, event, own)!;
    expect(updateGbcIndicator(before, "Route29", 1, block, "GEODUDE", "SPRITE_GEODUDE", [["Hello"]])).toBe(before);
    const after = updateGbcIndicator(before, "Route29", 1, block, "SENTRET", "SPRITE_MONSTER", [["Hello"]]);
    expect(after).toBe(before.replace("\tcry GEODUDE", "\tcry SENTRET").replace("SPRITE_GEODUDE", "SPRITE_MONSTER"));
    const a = before.split(/\r?\n/), b = after.split(/\r?\n/);
    expect(a.flatMap((line, i) => line === b[i] ? [] : [line.trim().split(" ")[0]])).toEqual(["cry", "object_event"]);
  });

  it.each(["\n", "\r\n"])("preserves EOL and final-newline state on insertion and text update (%j)", eol => {
    const source = base().replace(/\n/g, eol).replace(/\r?\n$/, "");
    const placed = insertGbcIndicator(source, "Route29", input).text;
    const block = findGbcIndicator(placed, event, own)!;
    const updated = updateGbcIndicator(placed, "Route29", 1, block, "SENTRET", "SPRITE_MONSTER", [["New", "text"], ["End"]]);
    expect(updated).toBe(placed.replace("\tcry GEODUDE", "\tcry SENTRET").replace("SPRITE_GEODUDE", "SPRITE_MONSTER").replace('\ttext "Hello"', ['\ttext "New"', '\tline "text"', '', '\tpara "End"'].join(eol)));
    for (const text of [placed, updated]) {
      expect(text.endsWith("\n")).toBe(false);
      expect(text.match(/\r?\n/g)?.every(ending => ending === eol)).toBe(true);
    }
  });

  it("updates text before script without shifting the cry or dropping cry comments", () => {
    const source = golden();
    const start = source.indexOf("Route29PokemonIndicator1:");
    const body = source.indexOf("Route29PokemonIndicator1Text:");
    const end = source.indexOf("Route29_MapEvents:");
    const before = source.slice(0, start) + source.slice(body, end) + source.slice(start, body) + source.slice(end);
    const annotated = before.replace("\tcry GEODUDE", "\tcry GEODUDE ; keep");
    const block = findGbcIndicator(annotated, event, own)!;
    expect(block.editable).toBe(true);
    expect(updateGbcIndicator(annotated, "Route29", 1, block, "SENTRET", "SPRITE_MONSTER", [["New", "text"]])).toBe(
      annotated.replace("\tcry GEODUDE", "\tcry SENTRET").replace("SPRITE_GEODUDE", "SPRITE_MONSTER").replace('\ttext "Hello"', '\ttext "New"\n\tline "text"'),
    );
  });

  it("locates invalid input and provides a fix without changing the source", () => {
    for (const change of [{ species: "BAD; end" }, { sprite: "SPRITE_X\nend" }, { paragraphs: [] }, { paragraphs: [[""]] }, { paragraphs: [['bad"literal']] }]) {
      expect(() => insertGbcIndicator(base(), "Route29", { ...input, ...change })).toThrow(/maps\/Route29\.asm:.*Restore/);
    }
  });

  it("rechecks stale blocks and the target object's script before updating", () => {
    const block = findGbcIndicator(golden(), event, own)!;
    expect(() => updateGbcIndicator(golden().replace("\twaitbutton", "\tpromptbutton"), "Route29", 1, block, "SENTRET", "SPRITE_MONSTER", [["Hello"]])).toThrow(/maps\/Route29\.asm/);
    expect(() => updateGbcIndicator(golden(), "Route29", 0, block, "SENTRET", "SPRITE_MONSTER", [["Hello"]])).toThrow(/maps\/Route29\.asm/);
  });
});
