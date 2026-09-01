export type Method = "land_mons" | "water_mons" | "rock_smash_mons" | "fishing_mons";

export interface Mon { minLevel: number; maxLevel: number; species: string; }
export interface MethodTable { encounterRate: number; mons: Mon[]; }
export interface EncounterEntry {
  map: string;
  /** e.g. "gRoute101_Night" -- the only thing distinguishing a map's variants. */
  baseLabel: string;
  methods: Partial<Record<Method, MethodTable>>;
}
export interface EncounterGroup { label: string; fields: Map<Method, number[]>; entries: EncounterEntry[]; }

export type Rod = "old" | "good" | "super";

/**
 * fishing_mons packs THREE distributions into one 10-slot array, one per rod,
 * each summing to 100: [70,30 | 60,20,20 | 40,40,15,4,1]. Treating it as a
 * single distribution makes every fishing percentage wrong and the totals 300%.
 */
export const FISHING_RODS: readonly { rod: Rod; from: number; count: number }[] = [
  { rod: "old", from: 0, count: 2 },
  { rod: "good", from: 2, count: 3 },
  { rod: "super", from: 5, count: 5 },
];

export interface Encounters {
  groups: Map<string, EncounterGroup>;
  /**
   * ALL entries for a map, in file order -- 125 maps in the subject tree have
   * more than one (day, night and two further variants; MAP_ALTERING_CAVE has
   * nine). Returning just the first would hide most of the data while looking
   * like an answer.
   */
  forMap(mapId: string, group?: string): EncounterEntry[];
  fieldsFor(group: string): Map<Method, number[]>;
}

export interface SpeciesChance {
  species: string;
  /** True probability within its distribution, 0-100. For fishing that means
   *  within the selected rod, not across all ten slots. */
  percent: number;
  minLevel: number;
  maxLevel: number;
  slots: number[];
}

export interface ChanceOptions {
  /** Which of the map's entries (day/night/variant). Defaults to the first. */
  entry?: number;
  /** Required in practice for fishing; ignored for other methods. Defaults to "old". */
  rod?: Rod;
}

export function parseEncounters(text: string): Encounters {
  const raw = JSON.parse(text) as Record<string, unknown>;
  // Every one of the six target trees has this key. Without the check, a fork
  // that named it differently would fail as a bare "undefined is not
  // iterable" naming no file and no cause -- the opposite of invariant I7's
  // "refuse and say what to fix" (mirrors the identical guard in
  // parseMapGroups, load/maps.ts, for map_groups.json's `group_order`).
  if (!Array.isArray(raw.wild_encounter_groups)) {
    throw new Error("wild_encounters.json has no `wild_encounter_groups` array; cannot parse encounters");
  }
  const groupsRaw = raw.wild_encounter_groups as any[];
  const groups = new Map<string, EncounterGroup>();

  for (const g of groupsRaw) {
    const fields = new Map<Method, number[]>();
    for (const f of g.fields ?? []) fields.set(f.type as Method, f.encounter_rates as number[]);

    groups.set(g.label, {
      label: g.label,
      fields,
      entries: (g.encounters ?? []).map((e: any) => {
        const methods: Partial<Record<Method, MethodTable>> = {};
        for (const m of ["land_mons", "water_mons", "rock_smash_mons", "fishing_mons"] as Method[]) {
          if (!e[m]) continue;
          methods[m] = {
            encounterRate: Number(e[m].encounter_rate),
            mons: (e[m].mons as any[]).map((x) => ({
              minLevel: Number(x.min_level), maxLevel: Number(x.max_level), species: String(x.species),
            })),
          };
        }
        return { map: e.map, baseLabel: e.base_label, methods };
      }),
    });
  }

  return {
    groups,
    fieldsFor: (g) => groups.get(g)?.fields ?? new Map(),
    forMap: (mapId, group = "gWildMonHeaders") =>
      (groups.get(group)?.entries ?? []).filter((e) => e.map === mapId),
  };
}

/**
 * The real chance of meeting each species, from the per-slot weights.
 *
 * Slot count is not the answer: land_mons slot 0 is 20% and slot 11 is 1%.
 * A species in slots 0 and 1 is a 40% encounter; one in slots 10 and 11 is 2%.
 */
export function speciesChances(
  enc: Encounters, mapId: string, method: Method,
  opts: ChanceOptions = {}, group = "gWildMonHeaders",
): SpeciesChance[] | undefined {
  const entries = enc.forMap(mapId, group);
  const table = entries[opts.entry ?? 0]?.methods[method];
  if (!table) return undefined;

  const weights = enc.fieldsFor(group).get(method) ?? [];

  // Fishing is scoped to one rod; every other method spans all its slots.
  const segment = method === "fishing_mons"
    ? FISHING_RODS.find((r) => r.rod === (opts.rod ?? "old"))!
    : { from: 0, count: table.mons.length };

  const by = new Map<string, SpeciesChance>();

  for (let slot = segment.from; slot < segment.from + segment.count; slot++) {
    const mon = table.mons[slot];
    if (!mon) continue;
    // `?? 0`, not a refusal: 26 (map, variant, method) entries across 14 real
    // maps -- nearly every major Johto town's water table, plus MAP_ROUTE30's
    // fishing_mons -- carry more `mons` slots than their group declares
    // weights for (measured: 24 water_mons entries at 12 mons vs. 5 weights,
    // 2 fishing_mons at 12 vs. 10). A slot past the declared weight array is
    // indistinguishable here from a slot genuinely weighted at zero.
    // Concretely: MAP_LAKE_OF_RAGE's water_mons is 12 slots but only 5
    // weights ([60,30,5,4,1]); Gyarados occupies slot 4 (weight 1) plus
    // unweighted slots 6-11, so it reports exactly 1% rather than its real
    // share of that table. Whether that reflects the game's actual encounter
    // logic or an authoring gap in the source data is outside this parser's
    // job to decide -- it reports what the data says, not what it should say.
    const weight = weights[slot] ?? 0;
    const found = by.get(mon.species);
    if (found) {
      found.percent += weight;
      found.minLevel = Math.min(found.minLevel, mon.minLevel);
      found.maxLevel = Math.max(found.maxLevel, mon.maxLevel);
      found.slots.push(slot);
    } else {
      by.set(mon.species, {
        species: mon.species, percent: weight,
        minLevel: mon.minLevel, maxLevel: mon.maxLevel, slots: [slot],
      });
    }
  }

  return [...by.values()].sort((a, b) => b.percent - a.percent);
}
