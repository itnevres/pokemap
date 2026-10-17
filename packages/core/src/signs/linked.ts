import { readFileSync } from "node:fs";
import type { Project } from "../project.js";
import type { MapData } from "../load/maps.js";
import type { GbcProject } from "../gbc/project.js";
import type { GbcMap } from "../gbc/model/types.js";
import { norm } from "../config/paths.js";
import { codeLines, escapeRegExp, parseConstDefs, scanCalls, stripComment } from "../gbc/load/asm.js";
import { loadGbcSpeciesIds } from "../gbc/load/species.js";
import { gbcEncounterSources } from "../gbc/analyse/atlas.js";
import { rankSpeciesForSign } from "./suggest.js";

function required<K>(table: Map<K, string>, key: K, file: string): string {
  const value = table.get(key);
  if (value === undefined) throw new Error(`${file}: missing name for ${String(key)}`);
  return value;
}

// Comments cannot supply a missing entry; quoted strings retain their contents.
function cSource(file: string): string {
  return readFileSync(file, "utf8").replace(/"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    (part) => part.startsWith('"') ? part : part.replace(/[^\r\n]/g, " "));
}

function cString(quoted: string, file: string, key: string): string {
  try {
    return JSON.parse(quoted) as string;
  } catch (error) {
    throw new Error(`${file}: invalid name for ${key}: ${(error as Error).message}`);
  }
}

export function gbaMapDisplayName(proj: Project, map: MapData): string {
  const file = `${proj.paths.regionMapDir}/region_map_entries.h`;
  const text = cSource(file);
  const entry = new RegExp(`\\[\\s*${escapeRegExp(map.regionMapSection)}\\s*\\]\\s*=\\s*\\{([^}]+)\\}`).exec(text);
  const label = entry?.[1]?.trim().match(/\b(sMapName_\w+)\s*,?\s*$/)?.[1];
  if (!label) throw new Error(`${file}: missing section/name ${map.regionMapSection}`);
  const name = new RegExp(`\\b${escapeRegExp(label)}\\s*\\[\\s*\\]\\s*=\\s*_\\(\\s*("(?:\\\\.|[^"\\\\])*")\\s*\\)`).exec(text);
  if (!name) throw new Error(`${file}: missing name ${label} for ${map.regionMapSection}`);
  return cString(name[1]!, file, label);
}

export function gbcMapDisplayName(root: string, map: GbcMap): string {
  const constantsFile = `${norm(root)}/constants/landmark_constants.asm`;
  // The later const_def $7f, -1 block is CaughtData, not landmark indices.
  const constants = readFileSync(constantsFile, "utf8");
  const defs = [...constants.matchAll(/^\s*const_def\b/gm)];
  let indices: Map<string, number>;
  try {
    indices = parseConstDefs(defs[1] ? constants.slice(0, defs[1].index) : constants);
  } catch (error) {
    throw new Error(`${constantsFile}: ${map.landmark}: ${(error as Error).message}`);
  }
  const index = indices.get(map.landmark);
  if (index === undefined) throw new Error(`${constantsFile}: missing landmark ${map.landmark}`);
  const file = `${norm(root)}/data/maps/landmarks.asm`;
  const text = readFileSync(file, "utf8");
  const label = scanCalls(text, "landmark")[index]?.args[2]?.text;
  if (!label) throw new Error(`${file}: missing landmark ${map.landmark} at index ${index}`);
  const names = new Map<string, string>();
  // Names can be inline with the label or on its following line.
  const source = codeLines(text).map((line) => stripComment(line.text)).join("\n");
  for (const match of source.matchAll(/^[ \t]*(\w+)::?\s*db\s+"([^"\r\n]*)"/gm)) {
    names.set(match[1]!, match[2]!.replace(/@+$/, "").replace(/<BSP>/g, " "));
  }
  return required(names, label, file);
}

export function gbaSpeciesNames(proj: Project): Map<string, string> {
  const file = `${proj.paths.root}/src/data/text/species_names.h`;
  const names = new Map<string, string>();
  for (const match of cSource(file).matchAll(/\[\s*(SPECIES_\w+)\s*\]\s*=\s*_\(\s*("(?:\\.|[^"\\])*")\s*\)/g)) {
    names.set(match[1]!, cString(match[2]!, file, match[1]!));
  }
  if (names.size === 0) throw new Error(`${file}: missing SPECIES_* names`);
  return names;
}

export function gbcSpeciesNames(root: string): Map<string, string> {
  const file = `${norm(root)}/data/pokemon/names.asm`;
  const names = codeLines(readFileSync(file, "utf8")).flatMap((line) => {
    const match = stripComment(line.text).match(/^\s*db\s+"([^"\r\n]*)"\s*$/);
    return match ? [match[1]!.replace(/@+$/, "")] : [];
  });
  const out = new Map<string, string>();
  for (const [species, id] of loadGbcSpeciesIds(root)) {
    const name = names[id - 1];
    if (name === undefined || name === "") throw new Error(`${file}: missing name for ${species} (id ${id})`);
    out.set(species, name);
  }
  return out;
}

export function linkedSpecies(family: "gba", proj: Project, mapName: string): string[];
export function linkedSpecies(family: "gbc", proj: GbcProject, mapName: string): string[];
export function linkedSpecies(family: "gba" | "gbc", proj: Project | GbcProject, mapName: string): string[] {
  const best = new Map<string, number>();
  let names: Map<string, string>;
  let file: string;
  if (family === "gba") {
    const gba = proj as Project;
    names = gbaSpeciesNames(gba);
    file = `${gba.paths.root}/src/data/text/species_names.h`;
    for (const chance of rankSpeciesForSign(gba, mapName)) best.set(chance.species, chance.percent);
  } else {
    const gbc = proj as GbcProject;
    names = gbcSpeciesNames(gbc.root);
    file = `${norm(gbc.root)}/data/pokemon/names.asm`;
    // S9a includes every wildForMap source, even header fishing on dry maps.
    // Reuse the atlas's per-table sums and exact fishing-byte probabilities.
    for (const source of gbcEncounterSources(gbc, mapName, true)) {
      if (source.conditional === "swarm") continue;
      for (const chance of source.chances) {
        best.set(chance.species, Math.max(best.get(chance.species) ?? 0, chance.percent));
      }
    }
  }
  return [...best].map(([species, percent]) => ({ name: required(names, species, file), percent }))
    .sort((a, b) => b.percent - a.percent || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((row) => row.name);
}

export function linkedText(mode: "name" | "species", name: string, species: string[]): string {
  return mode === "name" ? name : `${name}\n\n${species.length ? species.join(", ") : "No wild POKEMON here."}`;
}
