import { existsSync, readFileSync } from "node:fs";
import { projectPaths } from "../config/paths.js";
import { generateSignScript } from "./script.js";
import type { Refusal } from "../write/guards.js";

export interface WildSignInput {
  x: number;
  y: number;
  elevation: number;
  /** Bare ("RATTATA") or SPECIES_-prefixed ("SPECIES_RATTATA"); both accepted. */
  species: string;
  dialogue: string;
}

export interface WildSignBuild {
  /** Raw, snake_case object_events value -- ready for events.ts's own
   *  `addEvent(map, "object", objectEvent)`, matching load/maps.ts's real
   *  field names exactly. */
  objectEvent: Record<string, unknown>;
  scriptLabel: string;
  textLabel: string;
  /** Script block + blank line + text block, ready to hand to a
   *  `ScriptAppend.text` (save.ts's own EditSession.scriptAppends field). */
  scriptAppendText: string;
}

/**
 * Pure data construction -- builds everything a wild sign needs to become
 * one object-event insert plus one scripts.inc append, but performs no I/O
 * itself. Mirrors CeladonCity's real Poliwrath object event (data/maps/
 * CeladonCity/map.json) field-for-field: OBJ_EVENT_GFX_SPECIES(...), not an
 * NPC standing nearby -- the sign literally IS the wild Pokemon's overworld
 * sprite.
 */
export function buildWildSign(mapName: string, sign: WildSignInput): WildSignBuild {
  const generated = generateSignScript({ mapName, species: sign.species, dialogue: sign.dialogue });
  const speciesBare = sign.species.replace(/^SPECIES_/, "");

  const objectEvent = {
    graphics_id: `OBJ_EVENT_GFX_SPECIES(${speciesBare})`,
    x: sign.x, y: sign.y, elevation: sign.elevation,
    movement_type: "MOVEMENT_TYPE_FACE_DOWN",
    movement_range_x: 1, movement_range_y: 1,
    trainer_type: "TRAINER_TYPE_NONE",
    trainer_sight_or_berry_tree_id: "0",
    script: generated.scriptLabel,
    flag: "0",
  };

  return {
    objectEvent, scriptLabel: generated.scriptLabel, textLabel: generated.textLabel,
    scriptAppendText: `${generated.script}\n${generated.text}`,
  };
}

/**
 * The two things that can go wrong ONLY AT WRITE TIME (buildWildSign's own
 * throw already covers the pure-logic case of empty/illegal dialogue) --
 * takes a bare project root rather than a full `Project` so this stays a
 * plain, dependency-free filesystem check exactly like guards.ts's own
 * guards, callable from a route that already has `entry.session` open
 * without re-loading the whole project.
 */
export function guardSignWrite(root: string, mapName: string, scriptLabel: string): Refusal[] {
  const scriptsPath = projectPaths(root).mapScriptsInc(mapName);
  if (!existsSync(scriptsPath)) {
    return [{
      code: "NO_SCRIPTS_INC", subject: mapName,
      message: `${mapName} has no scripts.inc`,
      fix: `Create data/maps/${mapName}/scripts.inc before adding a wild sign here`,
    }];
  }
  const text = readFileSync(scriptsPath, "utf8");
  if (text.includes(`${scriptLabel}::`) || text.includes(`${scriptLabel}:`)) {
    return [{
      code: "SIGN_LABEL_EXISTS", subject: scriptLabel,
      message: `${scriptLabel} is already defined in ${mapName}/scripts.inc`,
      fix: "Choose a different species, or edit the existing script by hand",
    }];
  }
  return [];
}
