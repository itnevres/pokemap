import type { GbcEncounterMethod, GbcEncounterSource } from "@pokemap/core/src/gbc/analyse/atlas.js";
import type { Method, Rod, SpeciesChance } from "@pokemap/core/src/load/encounters.js";
import type { GbcTimeOfDay } from "../gbc/time.js";

/**
 * Per-species encounter summaries (Plan 6c Task B1): one adapter per family
 * turns that family's wire shape into the same `SpeciesSummary[]`, which the
 * shared encounter-border component (B3) renders family-blind. Pure, no React.
 */

export type SpeciesMethod = "grass" | "water" | "fish" | "headbutt" | "rock";

export interface SpeciesRow {
  method: SpeciesMethod;
  label: string;
  percent: number;
  minLevel: number;
  maxLevel: number;
  time?: "morn" | "day" | "nite";
  rod?: string;
  list?: string;
  conditional?: "swarm";
  /** GBC encounter rate (grass/water/rock) or bite chance (fish); absent for headbutt and all GBA rows. */
  rate?: number;
  /** GBC grass/water only: PerfPlus's runtime +0-4 level buff (the tooltip's "+"). GBA never sets it. */
  levelBuff?: true;
}

export interface SpeciesSummary {
  species: string;
  displayName: string;
  iconUrl: string;
  rows: SpeciesRow[];
  /** GBC only: the times of day at which any of this species' rows is live. */
  availableAt?: Array<"morn" | "day" | "nite">;
}

/** The GBA wire row (`/api/encounters/:map`); declared here so this file never
 *  depended on the since-deleted `EncounterGutter.tsx`. */
export interface GbaEncounterRow {
  method: Method;
  rod?: Rod;
  chances: SpeciesChance[];
}

/** Row/species ordering and grouping order (spec's own "grass, water, fish, headbutt, rock"). */
const METHOD_ORDER: SpeciesMethod[] = ["grass", "water", "fish", "headbutt", "rock"];

const METHOD_LABEL: Record<GbcEncounterMethod, string> = {
  grass: "Grass",
  water: "Surf",
  fish: "Fish",
  headbutt: "Headbutt",
  rock: "Rock Smash",
};

const ROD_LABEL: Record<string, string> = { old: "Old Rod", good: "Good Rod", super: "Super Rod" };

/**
 * Time-matching rule (spec's own "Facts (measured)", re-verified against
 * `engine/events/fish.asm`'s `.TimeEncounter` -- `cp NITE_F / jr c,
 * .time_species` with `MORN_F=0, DAY_F=1, NITE_F=2`, so anything strictly
 * less than NITE (morn OR day) takes the "day" entry):
 *  - an untagged source (no `time` field at all -- water/headbutt/rock, and
 *    old-rod fish) always matches, regardless of the app's current time;
 *  - grass matches only when its own tag equals the app's current time
 *    exactly (morn/day/nite are three genuinely distinct grass tables);
 *  - a `fish` source tagged "day" matches at BOTH morn and day (the engine
 *    has no separate morn table for fishing -- "day" is really "not nite");
 *  - a `fish` source tagged "nite" matches only at nite.
 *
 * Exported and unit-tested with the full truth table, including the two
 * mutation-sensitive edges the spec names explicitly: old-rod (untagged)
 * fish is never filtered OUT regardless of time (mutation check #2), and
 * grass never matches every time (mutation check #6).
 */
export function matchesTime(source: { method: GbcEncounterMethod; time?: string }, time: GbcTimeOfDay): boolean {
  if (source.time === undefined) return true;
  if (source.method === "grass") return source.time === time;
  if (source.method === "fish") {
    if (source.time === "day") return time === "morn" || time === "day";
    if (source.time === "nite") return time === "nite";
  }
  return true;
}

/**
 * A row's own label, disclosing every scoping tag it carries -- mirrors
 * the old `EncounterGutter.tsx`'s own `rowLabel` reasoning (a row must say what it's
 * scoped to, never stay quiet about it): method, then rod (fish only), then
 * list (headbutt only), then time (grass/fish only), then " · swarm" for a
 * conditional source. Exact strings pinned against the spec's own examples:
 * "Grass · morn", "Surf", "Fish · Good Rod · day", "Fish · Old Rod",
 * "Headbutt · rare", "Rock Smash".
 */
export function rowLabel(source: GbcEncounterSource): string {
  const parts = [METHOD_LABEL[source.method]];
  if (source.rod) parts.push(ROD_LABEL[source.rod] ?? source.rod);
  if (source.list) parts.push(source.list);
  if (source.time) parts.push(source.time);
  if (source.conditional === "swarm") parts.push("swarm");
  return parts.join(" · ");
}

/** The official punctuated names, keyed on the constant after the "SPECIES_"
 *  strip (both families' spellings); Title Case would mangle each of these. */
const OFFICIAL_NAME: Record<string, string> = {
  NIDORAN_F: "Nidoran♀",
  NIDORAN_M: "Nidoran♂",
  MR__MIME: "Mr. Mime",
  MR_MIME: "Mr. Mime",
  FARFETCH_D: "Farfetch'd",
  FARFETCHD: "Farfetch'd",
  HO_OH: "Ho-Oh",
};

/** Strips an optional "SPECIES_" prefix (GBA), then the override table above,
 *  else Title Case per "_" word: "CHIKORITA" -> "Chikorita". */
export function displaySpeciesName(species: string): string {
  const bare = species.replace(/^SPECIES_/, "");
  if (Object.hasOwn(OFFICIAL_NAME, bare)) return OFFICIAL_NAME[bare]!;
  return bare
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

export const speciesIconUrl = (species: string) => `/api/species/${encodeURIComponent(species)}/icon.png`;

/**
 * Groups (species, row) pairs, given in flattened input order, into
 * summaries. Rows within a species follow METHOD_ORDER (ties keep input
 * order). Species sort by (1) the METHOD_ORDER index of their first method,
 * (2) their top percent among rows of THAT method, descending, (3) first
 * appearance in the input.
 */
function summarise(pairs: Array<[string, SpeciesRow]>): SpeciesSummary[] {
  const bySpecies = new Map<string, SpeciesRow[]>(); // insertion order = first appearance
  for (const [species, row] of pairs) {
    const rows = bySpecies.get(species);
    if (rows) rows.push(row);
    else bySpecies.set(species, [row]);
  }
  const rank = (m: SpeciesMethod) => METHOD_ORDER.indexOf(m);
  return [...bySpecies]
    .map(([species, rows], appearance) => {
      const sorted = [...rows].sort((a, b) => rank(a.method) - rank(b.method));
      const first = sorted[0]!.method;
      const top = Math.max(...sorted.filter((r) => r.method === first).map((r) => r.percent));
      return { species, rows: sorted, first: rank(first), top, appearance };
    })
    .sort((a, b) => a.first - b.first || b.top - a.top || a.appearance - b.appearance)
    .map(({ species, rows }) => ({ species, displayName: displaySpeciesName(species), iconUrl: speciesIconUrl(species), rows }));
}

const GBA_METHOD: Record<Method, { method: SpeciesMethod; label: string }> = {
  land_mons: { method: "grass", label: "Land" },
  water_mons: { method: "water", label: "Water" },
  fishing_mons: { method: "fish", label: "Fishing" },
  rock_smash_mons: { method: "rock", label: "Rock Smash" },
};

export function summariseGba(methods: GbaEncounterRow[]): SpeciesSummary[] {
  return summarise(
    methods.flatMap((m): Array<[string, SpeciesRow]> => {
      const { method, label } = GBA_METHOD[m.method];
      const full = m.rod ? `${label} · ${ROD_LABEL[m.rod] ?? m.rod}` : label;
      return m.chances.map((c) => [
        c.species,
        { method, label: full, percent: c.percent, minLevel: c.minLevel, maxLevel: c.maxLevel, ...(m.rod ? { rod: m.rod } : {}) },
      ]);
    }),
  );
}

export function summariseGbc(sources: GbcEncounterSource[]): SpeciesSummary[] {
  const times: GbcTimeOfDay[] = ["morn", "day", "nite"];
  const rate = (s: GbcEncounterSource) => s.encounterRate ?? s.biteChance;
  return summarise(
    sources.flatMap((s): Array<[string, SpeciesRow]> =>
      s.chances.map((c) => [
        c.species,
        {
          method: s.method,
          label: rowLabel(s),
          percent: c.percent,
          minLevel: c.minLevel,
          maxLevel: c.maxLevel,
          ...(s.time ? { time: s.time } : {}),
          ...(s.rod ? { rod: s.rod } : {}),
          ...(s.list ? { list: s.list } : {}),
          ...(s.conditional ? { conditional: s.conditional } : {}),
          ...(rate(s) !== undefined ? { rate: rate(s) } : {}),
          // Grass and water get the runtime GRASS_WATER_LEVEL_BUFF_MAX level buff; nothing else does.
          ...(s.method === "grass" || s.method === "water" ? { levelBuff: true as const } : {}),
        },
      ]),
    ),
  ).map((sp) => ({ ...sp, availableAt: times.filter((t) => sp.rows.some((r) => matchesTime(r, t))) }));
}
