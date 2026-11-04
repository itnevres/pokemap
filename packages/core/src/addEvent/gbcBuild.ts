import { codeLines, escapeRegExp, scanCalls } from "../gbc/load/asm.js";
import { gbcEventGap } from "../gbc/load/constCounter.js";
import { objectConstDefLine, parseMapEvents } from "../gbc/load/events.js";
import { addGbcEvent } from "../gbc/edit/events.js";
import type { GbcMapEvents } from "../gbc/model/types.js";
import { insertLineAfter, replaceLines } from "../gbc/write/asmSplice.js";
import { renderGbcBody } from "../gbc/signs.js";
import { wrapSign, SIGN_WIDTH } from "../signs/wrap.js";
import type { Charmap } from "../signs/charmap.js";
import { copyGbcScriptBody } from "./gbcCopy.js";
import { AddEventRefusal, type AddEventForm, type EventKind, type EventOptions, type FileReplace,
  type MapEventOptions, type NameCheck, type RefusalCode, type TextChoice } from "./types.js";

export type GbcAddCtx = { options: EventOptions; mapOptions: MapEventOptions; mapConsts: Set<string>;
  eventFlagsDisk: string; constEdits: FileReplace[]; check: NameCheck; charmap: Charmap };

/** Lowest unused default, including generated companion labels. */
export function defaultGbcLabel(mapName: string, kind: EventKind, check: NameCheck): string {
  const base = `${mapName}Pokemap${kind[0]!.toUpperCase()}${kind.slice(1)}`;
  for (let n = 1; ; n++) {
    const label = `${base}${n}`;
    if (["", "Text", "SeenText", "BeatenText", "After", "AfterText", "Script"].every(s => !check(label + s).taken)) return label;
  }
}

/** Build a complete candidate; never mutates context, text, or the session. */
export function buildGbcAddEvent(text: string, mapName: string, form: AddEventForm, ctx: GbcAddCtx): {
  text: string; events: GbcMapEvents; constEdits: FileReplace[]; newNames: string[]; created: { kind: EventKind; index: number };
} {
  const path = `maps/${mapName}.asm`;
  const fail = (code: RefusalCode, message: string, file = path): never => {
    throw new AddEventRefusal(code, `${mapName}: ${file}: ${message}`, file);
  };
  const newNames: string[] = [];
  const constEdits = ctx.constEdits.map(e => ({ ...e }));
  // Macro-generated definitions missed by the symbol index cannot be checked
  // by NameCheck; the project's assembly build remains the spec's backstop.
  const definitions = new Set([...text.matchAll(/^\s*(?:const\s+|DEF\s+)?([A-Za-z_]\w*)(?:::?|\s+(?:EQU|EQUS)|\s*(?:;.*)?$)/gm)].map(m => m[1]!));
  const taken = (name: string) => definitions.has(name) || newNames.includes(name) || ctx.check(name).taken ||
    new RegExp(`\\b${escapeRegExp(name)}\\b`).test(ctx.eventFlagsDisk) ||
    constEdits.some(e => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(e.after));
  const claim = (name: string, file = path, qualified = false): string => {
    if (!(qualified ? /^[A-Za-z_]\w*\.[A-Za-z_]\w*$/ : /^[A-Za-z_]\w*$/).test(name)) fail("NAME_INVALID", `invalid name ${name}`, file);
    if (taken(name)) fail("LABEL_TAKEN", `name ${name} is already taken`, file);
    newNames.push(name); return name;
  };
  const option = (value: string | undefined, allowed: string[], field: string, fallback?: string): string => {
    const v = value ?? fallback;
    if (v === undefined || /[,;\s]/.test(v) || (allowed.length ? !allowed.includes(v) : !/^[A-Za-z_]\w*$/.test(v))) fail("BAD_OPTION", `invalid ${field}: ${v}`);
    return v!;
  };
  const number = (value: string | undefined, fallback: string, field: string, min: number, max: number): string => {
    const v = value ?? fallback;
    if (!/^-?\d+$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) < min || Number(v) > max) fail("BAD_OPTION", `invalid ${field}: ${v}`);
    return v;
  };
  const f = form.fields;
  const blocks: string[] = [];
  const emit = (label: string, body: string) => blocks.push(`${label}:\n${body.trimEnd()}\n`);
  const textBody = (choice: TextChoice): string => {
    if (choice.mode === "copy") {
      if (!ctx.mapOptions.localTexts.includes(choice.from)) fail("COPY_NOT_SCRIPT", `text ${choice.from} is not local to this map`);
      // Validate provenance against actual current text, not a potentially stale options list.
      try { copyGbcScriptBody(`PokemapProbe:\n\tjumptext ${choice.from}\nPokemapProbeBoundary:\n\tend\n${text}`, "PokemapProbe"); }
      catch { fail("COPY_NOT_SCRIPT", `text ${choice.from} is not defined as dialogue in this map`); }
    }
    const wrapped = wrapSign(choice.text, ctx.charmap, SIGN_WIDTH);
    if ("refusal" in wrapped) fail("BAD_OPTION", wrapped.refusal);
    try { return renderGbcBody((wrapped as { paragraphs: string[][] }).paragraphs).join("\n"); }
    catch (error) { return fail("BAD_OPTION", error instanceof Error ? error.message : String(error)); }
  };
  const flag = (required: boolean): string => {
    if (!form.flag) { if (required) fail("BAD_OPTION", "an event flag is required"); return "-1"; }
    if (form.flag.mode === "existing") return option(form.flag.name, [...(required ? [] : ["-1"]), ...ctx.options.flags], "flag");
    const file = "constants/event_flags.asm";
    const proposed = form.flag.name.startsWith("EVENT_") ? form.flag.name : `EVENT_${form.flag.name}`;
    if (!/^EVENT_[A-Z_][A-Z0-9_]*$/.test(proposed)) fail("NAME_INVALID", `invalid event constant ${proposed}`, file);
    const name = claim(proposed, file);
    const edit = constEdits.find(e => e.path === file);
    const before = edit?.before ?? ctx.eventFlagsDisk;
    const current = edit?.after ?? before;
    let gap: ReturnType<typeof gbcEventGap>;
    try { gap = gbcEventGap(current, file); } catch (error) { return fail("NO_FLAG_SLOT", String(error), file); }
    if (!gap) fail("NO_FLAG_SLOT", "no free event flag slot remains", file);
    const line = codeLines(current).find(l => l.lineIndex === gap!.afterLine)!;
    const after = insertLineAfter(current, line.end, `\tconst ${name}`);
    if (edit) edit.after = after; else constEdits.push({ path: file, before, after });
    return name;
  };
  const defaultLabel = () => defaultGbcLabel(mapName, form.kind, name => ({ taken: taken(name) }));
  const script = (): string => {
    const choice = form.script;
    if (!choice) return fail("BAD_OPTION", "a script choice is required");
    if (choice.mode === "existing") {
      if (!ctx.mapOptions.entryPoints.includes(choice.label)) fail("BAD_OPTION", `invalid script: ${choice.label}`);
      return option(choice.label, ctx.mapOptions.entryPoints, "script");
    }
    const label = claim(choice.label);
    if (choice.mode === "new") {
      const textLabel = claim(`${label}Text`);
      emit(label, form.kind === "coord" ? `\topentext\n\twritetext ${textLabel}\n\twaitbutton\n\tclosetext\n\tend` : `\t${form.kind === "object" ? "jumptextfaceplayer" : "jumptext"} ${textLabel}`);
      emit(textLabel, textBody({ mode: "new", text: choice.text }));
    } else {
      if (!ctx.mapOptions.localScripts.includes(choice.from)) fail("COPY_NOT_SCRIPT", `script ${choice.from} is not local to this map`);
      copyGbcScriptBody(text, choice.from);
      // One editable body owns one global scope; never silently discard helper definitions.
      for (const body of [choice.body, ...Object.values(choice.texts)]) {
        if (body.split(/\r?\n/).some(line => /^\s*[A-Za-z_]\w*::?/.test(line))) {
          fail("COPY_UNBOUNDED", "edited copy contains an extra top-level definition");
        }
      }
      // Re-parse edited content with the identical grammar before renaming anything.
      const synthetic = `${choice.from}:\n${choice.body}\n` + Object.entries(choice.texts).map(([n, b]) => `${n}:\n${b}\n`).join("\n");
      const preview = copyGbcScriptBody(synthetic, choice.from);
      if (Object.keys(preview.texts).length !== Object.keys(choice.texts).length) {
        fail("COPY_UNBOUNDED", "edited copy contains unused text definitions");
      }
      const renames = new Map<string, string>([[choice.from, label]]);
      for (const [i, name] of Object.keys(preview.texts).entries()) renames.set(name, claim(`${label}Text${i + 1}`));
      for (const m of preview.body.matchAll(/^\s*(\.[A-Za-z_]\w*):/gm)) {
        const local = `.${label}_${m[1]!.slice(1)}`;
        claim(`${label}${local}`, path, true); renames.set(m[1]!, local);
        renames.set(`${choice.from}${m[1]}`, `${label}${local}`);
      }
      // Only replace identifier tokens outside strings and comments.
      const rename = (body: string) => body.replace(/"[^"\r\n]*"|;[^\r\n]*|[A-Za-z_.][\w.]*/g, token => renames.get(token) ?? token);
      emit(label, rename(preview.body));
      for (const [name, body] of Object.entries(preview.texts)) emit(renames.get(name)!, body);
    }
    return label;
  };

  try {
    if (ctx.options.family !== "gbc") fail("BAD_OPTION", "GBC options required");
    if (new Set(constEdits.map(e => e.path)).size !== constEdits.length) fail("BAD_OPTION", "duplicate constants replacement path");
    const events = parseMapEvents(text, mapName);
    const keys = { object: "objects", warp: "warps", coord: "coords", bg: "bgs" } as const;
    if (!(form.kind in keys)) fail("BAD_OPTION", `unknown kind ${form.kind}`);
    const index = events[keys[form.kind]].length;
    const xy = [number(String(form.x), "0", "x", 0, 255), number(String(form.y), "0", "y", 0, 255)];
    let args: string[], objectConst: string | undefined;
    if (form.kind === "warp") {
      args = [...xy, option(f.destMap, [...ctx.mapConsts], "destination map"), number(f.destWarp, "1", "destination warp", -1, 255)];
      if (args[3] === "0") fail("BAD_OPTION", "destination warp must be positive or -1");
    } else if (form.kind === "coord") {
      const scenes = scanCalls(text, "scene_script").map(c => c.args[1]?.text).filter((s): s is string => !!s);
      if (!scenes.length) fail("NO_SCENES", "map has no scene_script");
      args = [...xy, option(f.scene, ["-1", ...scenes], "scene"), script()];
    } else if (form.kind === "bg") {
      const type = option(f.bgType, ctx.options.bgTypes.filter(t => t !== "BGEVENT_COPY"), "background type", "BGEVENT_READ");
      let target: string;
      if (type === "BGEVENT_ITEM" || type === "BGEVENT_IFSET" || type === "BGEVENT_IFNOTSET") {
        const label = claim(f.label ?? defaultLabel());
        const event = flag(true);
        const body = type === "BGEVENT_ITEM" ? `\thiddenitem ${option(f.item, ctx.options.items, "item")}, ${event}` : `\tconditional_event ${event}, ${script()}`;
        emit(label, body); target = label;
      } else target = script();
      args = [...xy, type, target];
    } else {
      if (events.objects.length >= 15) fail("OBJECT_CAP", "map already has 15 objects");
      const sprite = option(f.sprite, ctx.options.sprites, "sprite", "SPRITE_YOUNGSTER");
      const movement = option(f.movement, ctx.options.movements, "movement", "SPRITEMOVEDATA_STANDING_DOWN");
      const palette = option(f.palette, ctx.options.palettes, "palette", "0");
      const kind = form.objectType ?? "npc";
      if (!["npc", "itemball", "trainer"].includes(kind)) fail("BAD_OPTION", `invalid object type ${kind}`);
      const event = flag(kind !== "npc");
      let target: string;
      if (kind === "npc") target = script();
      else {
        target = claim(f.label ?? defaultLabel());
        if (kind === "itemball") emit(target, `\titemball ${option(f.item, ctx.options.items, "item")}`);
        else {
          const trainer = ctx.options.trainers.find(t => t.id === f.trainer);
          if (!trainer || !/^[A-Za-z_]\w*,[A-Za-z_]\w*$/.test(trainer.id)) fail("BAD_OPTION", `invalid trainer ${f.trainer}`);
          if (!form.texts) fail("BAD_OPTION", "seen, beaten and after texts are required");
          const seen = claim(`${target}SeenText`), beaten = claim(`${target}BeatenText`);
          const after = claim(`${target}After`), afterText = claim(`${target}AfterText`);
          // PerfPlus Route30.asm:40 and macros/scripts/maps.asm:134-145.
          emit(target, `\ttrainer ${trainer!.id.split(",").join(", ")}, ${event}, ${seen}, ${beaten}, 0, ${after}`);
          emit(after, `\tendifjustbattled\n\tjumptext ${afterText}`);
          for (const [label, choice] of [[seen, form.texts!.seen], [beaten, form.texts!.beaten], [afterText, form.texts!.after]] as const) emit(label, textBody(choice));
        }
      }
      if (objectConstDefLine(text)) {
        const base = `${mapName.toUpperCase()}_${sprite.replace(/^SPRITE_/, "")}`;
        let name = f.objectConst ?? base;
        if (!f.objectConst) for (let n = 2; events.objectConsts.includes(name); n++) name = `${base}${n}`;
        if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) fail("NAME_INVALID", `invalid object constant ${name}`);
        objectConst = claim(name);
      } else if (f.objectConst) fail("BAD_OPTION", "map has no object_const_def");
      args = [...xy, sprite, movement, number(f.rangeX, "0", "range x", 0, 15), number(f.rangeY, "0", "range y", 0, 15),
        number(f.hourStart, "-1", "hour start", -1, 23), number(f.hourEnd, "-1", "hour end", -1, 23), palette,
        kind === "npc" ? "OBJECTTYPE_SCRIPT" : kind === "itemball" ? "OBJECTTYPE_ITEMBALL" : "OBJECTTYPE_TRAINER",
        // Route30.asm:413-415: the trainer beaten flag belongs only in its header.
        number(f.sightRange, "0", "sight range", 0, 255), target, kind === "trainer" ? "-1" : event];
    }
    let result = addGbcEvent(text, mapName, form.kind, args, { mapConsts: ctx.mapConsts, objectConst });
    if (blocks.length) {
      const anchor = codeLines(result.text).find(l => l.text.trim() === `${mapName}_MapEvents:`);
      if (!anchor) fail("BAD_OPTION", "missing map events label");
      const out = replaceLines(result.text, anchor!.lineIndex, anchor!.lineIndex, blocks.join("\n").split("\n"));
      result = { text: out, events: parseMapEvents(out, mapName) };
    }
    return { ...result, constEdits, newNames, created: { kind: form.kind, index } };
  } catch (error) {
    if (error instanceof AddEventRefusal) {
      if (error.path !== path && error.path !== "constants/event_flags.asm") fail(error.code, error.message);
      throw error;
    }
    return fail("BAD_OPTION", error instanceof Error ? error.message : String(error));
  }
}
