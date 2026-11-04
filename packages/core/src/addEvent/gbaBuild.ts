import { readFileSync } from "node:fs";
import { projectPaths } from "../config/paths.js";
import { addEvent } from "../edit/events.js";
import type { MapData } from "../load/maps.js";
import type { ScriptAppend, ScriptReplace } from "../write/save.js";
import { renderGbaBody } from "../signs/gbaSign.js";
import { wrapSign, SIGN_WIDTH } from "../signs/wrap.js";
import type { Charmap } from "../signs/charmap.js";
import { copyGbaScriptBody } from "./gbaCopy.js";
import { cDefines } from "./sources.js";
import { AddEventRefusal, type AddEventForm, type EventKind, type EventOptions, type MapEventOptions,
  type NameCheck, type RefusalCode, type TextChoice } from "./types.js";

/** `scriptReplaces` holds the session's current entries; the result's list replaces them. */
export type GbaAddCtx = { options: EventOptions; mapOptions: MapEventOptions; root: string; mapName: string;
  tileElevation: number; freeFlags: string[]; freeVars: string[]; scriptReplaces: ScriptReplace[]; check: NameCheck;
  charmap: Charmap };

const KIND_NAME: Record<EventKind, string> = { object: "Object", warp: "Warp", coord: "Coord", bg: "Bg" };
const TRAINER_TEXTS = ["Intro", "Defeated", "PostBattle"] as const;
const textLabelOf = (script: string) => script.includes("_EventScript_") ? script.replace("_EventScript_", "_Text_") : `${script}_Text`;

/** Lowest unused default, including the generated trainer text labels. */
export function defaultGbaLabels(mapName: string, kind: EventKind, check: NameCheck): { script: string; text: string } {
  for (let n = 1; ; n++) {
    const script = `${mapName}_EventScript_Pokemap${KIND_NAME[kind]}${n}`, text = `${mapName}_Text_Pokemap${KIND_NAME[kind]}${n}`;
    if ([script, text, ...TRAINER_TEXTS.map(s => text + s)].every(name => !check(name).taken)) return { script, text };
  }
}

/** Build a complete candidate; never mutates the map, the context or the session. */
export function buildGbaAddEvent(map: MapData, scriptsInc: string | null, form: AddEventForm, ctx: GbaAddCtx): {
  value: Record<string, unknown>; scriptAppends: ScriptAppend[]; scriptReplaces: ScriptReplace[]; newNames: string[];
  created: { kind: EventKind; index: number };
} {
  const inc = `data/maps/${ctx.mapName}/scripts.inc`, json = `data/maps/${ctx.mapName}/map.json`;
  const HEADERS = { FLAG: "include/constants/flags.h", VAR: "include/constants/vars.h" } as const;
  const fail = (code: RefusalCode, message: string, file: string = json): never => {
    throw new AddEventRefusal(code, `${ctx.mapName}: ${file}: ${message}`, file);
  };
  const paths = projectPaths(ctx.root);
  const abs = (rel: string) => `${paths.root}/${rel}`;
  const newNames: string[] = [];
  const scriptReplaces = ctx.scriptReplaces.map(r => ({ ...r }));
  const headerText = (rel: string): string => {
    const edit = scriptReplaces.find(r => r.path === abs(rel));
    if (edit) return edit.after;
    try { return readFileSync(abs(rel), "utf8"); } catch { return fail("BAD_OPTION", "cannot read the constants header", rel); }
  };
  // Macro-generated definitions missed by the symbol index cannot be checked
  // by NameCheck; the project's build remains the spec's backstop.
  const definitions = new Set([...(scriptsInc ?? "").matchAll(/^[ \t]*(?:\.(?:set|equ)[ \t]+([A-Za-z_]\w*)[ \t]*,|([A-Za-z_]\w*)::?)/gm)]
    .map(m => (m[1] ?? m[2])!));
  const word = (name: string) => new RegExp(`\\b${name}\\b`);
  const taken = (name: string, headers = false) => definitions.has(name) || newNames.includes(name) || ctx.check(name).taken ||
    (headers && Object.values(HEADERS).some(rel => word(name).test(headerText(rel))));
  const claim = (name: string, file = inc, headers = false): string => {
    if (!/^[A-Za-z_]\w*$/.test(name)) fail("NAME_INVALID", `invalid name ${name}`, file);
    if (taken(name, headers)) fail("LABEL_TAKEN", `name ${name} is already taken`, file);
    newNames.push(name); return name;
  };
  const option = (value: string | undefined, allowed: string[], field: string, fallback?: string): string => {
    const v = value ?? fallback;
    if (v === undefined || !allowed.includes(v)) fail("BAD_OPTION", `invalid ${field}: ${v}`);
    return v!;
  };
  const number = (value: string | undefined, fallback: string, field: string, min: number, max: number): number => {
    const v = value ?? fallback;
    if (!/^-?\d+$/.test(v) || Number(v) < min || Number(v) > max) fail("BAD_OPTION", `invalid ${field}: ${v}`);
    return Number(v);
  };
  const needInc = (): string => scriptsInc ?? fail("NO_SCRIPTS_INC", "map has no scripts.inc for a generated or copied script", inc);
  const f = form.fields;
  const blocks: string[] = [];
  const emit = (label: string, body: string, global: boolean) => blocks.push(`${label}${global ? "::" : ":"}\n${body.trimEnd()}\n`);
  const textBody = (choice: TextChoice): string => {
    const source = needInc();
    if (choice.mode === "copy") {
      if (!ctx.mapOptions.localTexts.includes(choice.from)) fail("COPY_NOT_SCRIPT", `text ${choice.from} is not local to this map`, inc);
      // Validate provenance against the actual current text, not a possibly stale options list.
      // Appended last: GBA scopes run to the next label, so a leading probe would absorb `.set` lines.
      const probe = `${source}\nPokemapProbe::\n\tmsgbox ${choice.from}, MSGBOX_DEFAULT\n\tend\n`;
      let found = false;
      try { found = choice.from in copyGbaScriptBody(probe, "PokemapProbe").texts; } catch { /* refused below */ }
      if (!found) fail("COPY_NOT_SCRIPT", `text ${choice.from} is not defined as dialogue in this map`, inc);
    }
    const wrapped = wrapSign(choice.text, ctx.charmap, SIGN_WIDTH);
    if ("refusal" in wrapped) fail("BAD_OPTION", wrapped.refusal, inc);
    try { return renderGbaBody((wrapped as { paragraphs: string[][] }).paragraphs).join("\n"); }
    catch (error) { return fail("BAD_OPTION", error instanceof Error ? error.message : String(error), inc); }
  };
  /** Renames the first free `<KIND>_UNUSED_*` define still present in the staged header. */
  const slot = (kind: "FLAG" | "VAR", name: string): string => {
    const rel = HEADERS[kind];
    const proposed = name.startsWith(`${kind}_`) ? name : `${kind}_${name}`;
    if (!/^[A-Z_][A-Z0-9_]*$/.test(proposed)) fail("NAME_INVALID", `invalid ${kind.toLowerCase()} name ${proposed}`, rel);
    claim(proposed, rel, true);
    const current = headerText(rel);
    const defined = new Set(cDefines(current).map(d => d.name));
    const free = (kind === "FLAG" ? ctx.freeFlags : ctx.freeVars).find(s => defined.has(s));
    if (!free) fail(kind === "FLAG" ? "NO_FLAG_SLOT" : "NO_VAR_SLOT", `no free ${kind}_UNUSED_* slot remains`, rel);
    const after = current.replace(new RegExp(`^([ \\t]*#define[ \\t]+)${free}\\b`, "m"), `$1${proposed}`);
    const edit = scriptReplaces.find(r => r.path === abs(rel));
    if (edit) edit.after = after; else scriptReplaces.push({ path: abs(rel), before: current, after });
    return proposed;
  };
  const flag = (required: boolean): string => {
    if (!form.flag) return required ? fail("BAD_OPTION", "a flag is required") : "0";
    if (form.flag.mode === "new") return slot("FLAG", form.flag.name);
    return option(form.flag.name, [...(required ? [] : ["0"]), ...ctx.options.flags], "flag");
  };
  const defaults = () => defaultGbaLabels(ctx.mapName, form.kind, name => ({ taken: taken(name) }));
  const script = (): string => {
    const choice = form.script;
    if (!choice) return fail("BAD_OPTION", "a script choice is required");
    if (choice.mode === "existing") return option(choice.label, ctx.mapOptions.entryPoints, "script");
    const source = needInc();
    const label = claim(choice.label);
    if (choice.mode === "new") {
      const text = claim(textLabelOf(label));
      emit(label, form.kind === "coord" ? `\tlockall\n\tmsgbox ${text}, MSGBOX_DEFAULT\n\treleaseall\n\tend`
        : `\tmsgbox ${text}, ${form.kind === "bg" ? "MSGBOX_SIGN" : "MSGBOX_NPC"}\n\tend`, true);
      emit(text, textBody({ mode: "new", text: choice.text }), false);
      return label;
    }
    if (!ctx.mapOptions.localScripts.includes(choice.from)) fail("COPY_NOT_SCRIPT", `script ${choice.from} is not local to this map`, inc);
    copyGbaScriptBody(source, choice.from);
    // One editable body owns one global scope; never silently discard helper definitions.
    for (const body of [choice.body, ...Object.values(choice.texts)]) {
      if (body.split(/\r?\n/).some(line => /^\s*[A-Za-z_]\w*::?/.test(line))) {
        fail("COPY_UNBOUNDED", "edited copy contains an extra top-level definition", inc);
      }
    }
    // Re-parse the edited content with the identical grammar; the script comes last so a lost terminator is unbounded.
    const synthetic = `${ctx.mapName}_MapScripts::\n\tend\n` + Object.entries(choice.texts).map(([n, b]) => `${n}:\n${b}\n`).join("") +
      `${choice.from}::\n${choice.body}\n`;
    const preview = copyGbaScriptBody(synthetic, choice.from);
    if (Object.keys(preview.texts).length !== Object.keys(choice.texts).length) {
      fail("COPY_UNBOUNDED", "edited copy contains unused text definitions", inc);
    }
    const renames = new Map<string, string>([[choice.from, label]]);
    for (const [i, name] of Object.keys(preview.texts).entries()) renames.set(name, claim(`${textLabelOf(label)}${i ? i + 1 : ""}`));
    // Only replace identifier tokens outside strings and comments.
    emit(label, preview.body.replace(/"[^"\r\n]*"|@[^\r\n]*|[A-Za-z_]\w*/g, token => renames.get(token) ?? token), true);
    for (const [name, body] of Object.entries(preview.texts)) emit(renames.get(name)!, body, false);
    return label;
  };

  try {
    if (ctx.options.family !== "gba") fail("BAD_OPTION", "GBA options required");
    if (new Set(scriptReplaces.map(r => r.path)).size !== scriptReplaces.length) fail("BAD_OPTION", "duplicate constants replacement path");
    if (!(form.kind in KIND_NAME)) fail("BAD_OPTION", `unknown kind ${form.kind}`);
    const x = number(String(form.x), "0", "x", 0, 32767), y = number(String(form.y), "0", "y", 0, 32767);
    const elevation = number(f.elevation, String(ctx.tileElevation), "elevation", 0, 15);
    let value: Record<string, unknown>;
    if (form.kind === "warp") {
      const dest = option(f.destMap, ctx.options.maps, "destination map");
      let raw: { id?: unknown; warp_events?: unknown };
      try { raw = JSON.parse(readFileSync(paths.mapJson(dest), "utf8")); }
      catch { return fail("BAD_OPTION", `cannot read destination ${dest}`, `data/maps/${dest}/map.json`); }
      const warps = Array.isArray(raw.warp_events) ? raw.warp_events.length : 0;
      if (typeof raw.id !== "string" || !warps) fail("BAD_OPTION", `destination ${dest} has no warps`, `data/maps/${dest}/map.json`);
      // map.json dest_warp_id is the destination's 0-based warp index, as a string.
      value = { x, y, elevation, dest_map: raw.id, dest_warp_id: String(number(f.destWarp, "0", "destination warp", 0, warps - 1)) };
    } else if (form.kind === "coord") {
      if (!form.varName) fail("BAD_OPTION", "a var is required");
      const v = form.varName!.mode === "new" ? slot("VAR", form.varName!.name) : option(form.varName!.name, ctx.options.vars, "var");
      value = { type: "trigger", x, y, elevation, var: v, var_value: String(number(f.varValue, "0", "var value", 0, 65535)), script: script() };
    } else if (form.kind === "bg") {
      const type = option(f.bgType, ctx.options.bgTypes, "bg type", "sign");
      if (type === "sign") {
        value = { type, x, y, elevation, player_facing_dir: option(f.facing, ctx.options.facings, "facing", "BG_EVENT_PLAYER_FACING_ANY"), script: script() };
      } else if (type === "hidden_item") {
        // The subject's mapjson emits item and flag only; the pickup awards one.
        value = { type, x, y, elevation, item: option(f.item, ctx.options.items, "item"), flag: flag(true) };
      } else value = { type, x, y, elevation, secret_base_id: option(f.secretBase, ctx.options.secretBases, "secret base") };
    } else {
      if (map.objectEvents.length >= ctx.options.objectCap) fail("OBJECT_CAP", `map already has ${ctx.options.objectCap} objects`);
      const kind = form.objectType ?? "npc";
      if (!["npc", "itemball", "trainer"].includes(kind)) fail("BAD_OPTION", `invalid object type ${kind}`);
      const sprite = kind === "itemball" ? option("OBJ_EVENT_GFX_ITEM_BALL", ctx.options.sprites, "sprite")
        : option(f.sprite, ctx.options.sprites, "sprite", "OBJ_EVENT_GFX_BOY_1");
      const movement = option(f.movement, ctx.options.movements, "movement", "MOVEMENT_TYPE_FACE_DOWN");
      const rangeX = number(f.rangeX, "0", "range x", 0, 15), rangeY = number(f.rangeY, "0", "range y", 0, 15);
      let target: string, flagName: string, sight = "0";
      if (kind === "npc") { flagName = flag(false); target = script(); }
      else {
        needInc();
        target = claim(f.label ?? defaults().script);
        if (kind === "itemball") {
          flagName = flag(true);
          // Subject data/maps/Route102/scripts.inc Route102_EventScript_ItemPotion: finditem / end.
          emit(target, `\tfinditem ${option(f.item, ctx.options.items, "item")}\n\tend`, true);
        } else {
          flagName = flag(false);
          const trainer = option(f.trainer, ctx.options.trainers.map(t => t.id), "trainer");
          sight = String(number(f.sightRange, "3", "sight range", 0, 255));
          if (!form.texts) fail("BAD_OPTION", "intro, defeated and post-battle texts are required");
          const [seen, beaten, after] = TRAINER_TEXTS.map(s => claim(`${textLabelOf(target)}${s}`));
          // Subject data/maps/Route102/scripts.inc:63-66, Route102_EventScript_Rick.
          emit(target, `\ttrainerbattle_single ${trainer}, ${seen}, ${beaten}\n\tmsgbox ${after}, MSGBOX_AUTOCLOSE\n\tend`, true);
          for (const [label, choice] of [[seen!, form.texts!.seen], [beaten!, form.texts!.beaten], [after!, form.texts!.after]] as const) {
            emit(label, textBody(choice), false);
          }
        }
      }
      value = { graphics_id: sprite, x, y, elevation, movement_type: movement, movement_range_x: rangeX, movement_range_y: rangeY,
        trainer_type: kind === "trainer" ? "TRAINER_TYPE_NORMAL" : "TRAINER_TYPE_NONE", trainer_sight_or_berry_tree_id: sight,
        script: target, flag: flagName };
    }
    const eol = scriptsInc?.includes("\r\n") ? "\r\n" : "\n";
    const scriptAppends = blocks.length ? [{ path: paths.mapScriptsInc(ctx.mapName), text: blocks.join("\n").replace(/\n/g, eol) }] : [];
    return { value, scriptAppends, scriptReplaces, newNames, created: { kind: form.kind, index: addEvent(map, form.kind, value).insertOp.index } };
  } catch (error) {
    if (error instanceof AddEventRefusal) {
      // Refusals from the shared copy grammar on a synthetic body still name this map's scripts.inc.
      if (!error.path || !error.message.startsWith(`${ctx.mapName}: ${error.path}`)) fail(error.code, error.message, inc);
      throw error;
    }
    return fail("BAD_OPTION", error instanceof Error ? error.message : String(error));
  }
}
