# Task B1 executed spec: GBC species sprites + species summary adapters

Plan §B1 (Phase B, encounter border). U1 binding: shared UI changes for both families; an existing test
changes **only** where this spec says behaviour changes, and each such edit is named in the report.
B1 adds data plumbing only: no visible UI change yet (B3 consumes `summary.ts`; the gutters stay until B3).

## Ground truth (measured 2026-09-30 on Windows, PerfPlus at `C:/Programming Projects/pokecrystal-PerfPlus`)

### Species → `gfx/pokemon/<dir>` mapping: which file is authoritative
- **Neither file alone.** `data/pokemon/pic_pointers.asm` is the engine's species-indexed table
  (`PokemonPicPointers::`, `table_width 3 * 2`, "entries correspond to Pokémon species, two apiece"):
  slot pair *i* (0-based) belongs to species id *i+1*; the even slot is `dba_pic <X>Frontpic`. It names
  **labels**, not folders. `gfx/pics.asm` maps each label to a file, one line each:
  `HoOhFrontpic:        INCBIN "gfx/pokemon/ho_oh/front.animated.2bpp.lz"` (label and INCBIN on the
  **same line**, so `gbc/load/incbin.ts`'s `parseIncbins`, which wants the label on a preceding line, does
  **not** apply; use a line regex `^(\w+):\s*INCBIN\s+"gfx\/pokemon\/([^/"]+)\/`).
- Chain: species constant → id (`constants/pokemon_constants.asm`, first `const_def` block, via
  `parseConstDefs` — the same slicing `loadGbcSpeciesConstants` in `gbc/analyse/atlas.ts` does) → slot
  `(id-1)*2` in `PokemonPicPointers` (counting `dba_pic X` and `dbw -1, -1` entries in order, from
  `PokemonPicPointers::` up to `assert_table_length NUM_POKEMON`) → label → `pics.asm` folder.
- **UNOWN** (id 201): its slot pair is `dbw -1, -1` with the comment "Unown pics have their own table.
  See UnownPicPointers". Use the first `dba_pic` in `data/pokemon/unown_pic_pointers.asm`
  (`UnownAFrontpic` → `unown_a`). The folder `gfx/pokemon/unown/` exists but has **no `front.png`**
  (shared anim/palette only).
- Measured result: 502 slots (= 251 × 2), 251/251 species resolve, every resolved folder has `front.png`.
- **Plan correction:** the plan named `NIDORAN_F`, `MR__MIME`, `HO_OH` as lowercasing traps. In PerfPlus
  they are not: they lowercase to their real folders (`nidoran_f`, `mr__mime`, `ho_oh`). The **only**
  species whose folder differs from its lowercased constant is `UNOWN` → `unown_a`. Still derive from
  source (a mod could rename either side); pin all five anyway.

### Folder census: the "295 vs 251"
- `gfx/pokemon` has **295 entries = 278 directories + 17 `.asm` files** (`anims.asm`, `anim_pointers.asm`,
  `bitmasks.asm`, … `unown_*.asm`). The 278 directories = **250** species folders (all but Unown) +
  `egg` + `unown` (no `front.png`) + **26** `unown_a`..`unown_z`. 277 directories have `front.png`.
- No code depends on this; it is recorded so nobody re-counts.

### `front.png` format
- All 277: `depth 8`, colour type 3 (indexed), non-interlaced, `PLTE` of 4 entries, height a multiple of
  width (stacked square frames). 251 carry `tRNS` = `[255,255,255,255]` (fully opaque); the 26 Unown
  forms have no `tRNS`. So **every sprite is opaque**, index 0 = white `(255,255,255)` background.
- `readIndexedPng` (`packages/core/src/load/png.ts`) already decodes depth 8 / type 3 and returns
  `palette` from `PLTE`. It ignores `tRNS`, which is harmless here (all 255).
- DUNSPARCE (`gfx/pokemon/dunsparce/front.png`): **48×288** (6 frames). PLTE
  `[[255,255,255],[255,198,49],[66,123,189],[0,0,0]]`. Frame-0 pins (x,y → index → RGBA):
  - `(24,1)` → 3 → `[0,0,0,255]`
  - `(27,1)` → 2 → `[66,123,189,255]`
  - `(25,2)` → 1 → `[255,198,49,255]`
  - `(10,24)` → 0 → `[255,255,255,255]`; **frame 1 has index 2 at the same spot** (`(10,72)` in the
    sheet), so this pixel fails if the crop takes frame 1 or the wrong rows.
  The test must byte-read these from the PNG's raw IDAT itself (`inflateSync`, filter byte is 0 on every
  row of this file), independent of `readIndexedPng`, and compare with the loader's output.

### Server today
- `packages/server/src/gbcRoutes.ts`: `GBA_ONLY_ROUTE_RE` (grep `const GBA_ONLY_ROUTE_RE`) includes
  `species\/[^/]+\/icon\.png$`, so `GET /api/species/CHIKORITA/icon.png` answers 501. `decodeMapName`
  (same file) is the malformed-escape guard (→ 400). `normalizeGbcSpecies` (`gbc/analyse/atlas.ts`)
  uppercases and strips `SPECIES_`. `encodePng` is imported from `@pokemap/cli/src/png.js`.
- GBA's route (`index.ts`, grep `speciesIconMatch`) is the shape to mirror: `[^/]+` capture, per-key
  `Map<string, Buffer>` cache, `content-type: image/png`, `cache-control: no-cache`, 404 `{ error }` on no art.
- `packages/server/test/gbcRoutes.test.ts`, describe "GBA-only routes are refused with 501…": its
  `cases` array has a `/api/species/:name/icon.png` entry (CHIKORITA). The near-miss describe has
  `/api/species/CHIKORITA/icon.pngx` → 404 and `/api/species/A/B/icon.png` → 404, both commented in terms
  of the 501 regex.

### Route30 GBC encounter sources (real, `gbcEncounterSources(openGbcProject(PerfPlus), "Route30")`)
```json
[{"method":"grass","time":"morn","encounterRate":9.765625,"chances":[{"species":"CATERPIE","percent":45,"minLevel":3,"maxLevel":8},{"species":"LEDYBA","percent":25,"minLevel":3,"maxLevel":7},{"species":"PIDGEY","percent":10,"minLevel":4,"maxLevel":8},{"species":"WEEDLE","percent":10,"minLevel":3,"maxLevel":7},{"species":"HOPPIP","percent":10,"minLevel":4,"maxLevel":8}]},
{"method":"grass","time":"day","encounterRate":9.765625,"chances":[{"species":"CATERPIE","percent":45,"minLevel":3,"maxLevel":8},{"species":"PIDGEY","percent":35,"minLevel":3,"maxLevel":8},{"species":"WEEDLE","percent":10,"minLevel":3,"maxLevel":7},{"species":"HOPPIP","percent":10,"minLevel":4,"maxLevel":8}]},
{"method":"grass","time":"nite","encounterRate":9.765625,"chances":[{"species":"HOOTHOOT","percent":45,"minLevel":3,"maxLevel":8},{"species":"SPINARAK","percent":25,"minLevel":3,"maxLevel":7},{"species":"POLIWAG","percent":20,"minLevel":4,"maxLevel":8},{"species":"ZUBAT","percent":10,"minLevel":3,"maxLevel":7}]},
{"method":"water","encounterRate":1.953125,"chances":[{"species":"POLIWAG","percent":75,"minLevel":15,"maxLevel":24},{"species":"POLIWHIRL","percent":25,"minLevel":20,"maxLevel":24}]},
{"method":"fish","rod":"old","biteChance":50,"chances":[{"species":"MAGIKARP","percent":85.15625,"minLevel":10,"maxLevel":10},{"species":"POLIWAG","percent":14.84375,"minLevel":10,"maxLevel":10}]},
{"method":"fish","rod":"good","time":"day","biteChance":50,"chances":[{"species":"POLIWAG","percent":64.84375,"minLevel":20,"maxLevel":20},{"species":"MAGIKARP","percent":35.15625,"minLevel":20,"maxLevel":20}]},
{"method":"fish","rod":"good","time":"nite","biteChance":50,"chances":[{"species":"POLIWAG","percent":64.84375,"minLevel":20,"maxLevel":20},{"species":"MAGIKARP","percent":35.15625,"minLevel":20,"maxLevel":20}]},
{"method":"fish","rod":"super","time":"day","biteChance":50,"chances":[{"species":"POLIWAG","percent":79.6875,"minLevel":40,"maxLevel":40},{"species":"MAGIKARP","percent":20.3125,"minLevel":40,"maxLevel":40}]},
{"method":"fish","rod":"super","time":"nite","biteChance":50,"chances":[{"species":"POLIWAG","percent":79.6875,"minLevel":40,"maxLevel":40},{"species":"MAGIKARP","percent":20.3125,"minLevel":40,"maxLevel":40}]},
{"method":"headbutt","list":"common","chances":[{"species":"HOOTHOOT","percent":50,"minLevel":10,"maxLevel":10},{"species":"EXEGGCUTE","percent":20,"minLevel":10,"maxLevel":10},{"species":"SPINARAK","percent":15,"minLevel":10,"maxLevel":10},{"species":"LEDYBA","percent":15,"minLevel":10,"maxLevel":10}]},
{"method":"headbutt","list":"rare","chances":[{"species":"HOOTHOOT","percent":50,"minLevel":10,"maxLevel":10},{"species":"PINECO","percent":30,"minLevel":10,"maxLevel":10},{"species":"EXEGGCUTE","percent":20,"minLevel":10,"maxLevel":10}]}]
```
No rock source on Route30. Paste this verbatim as the UI test fixture (the UI test must not read the corpus).

### UI today
- `packages/ui/src/gbc/GbcEncounterGutter.tsx` exports `matchesTime`, `rowLabel`, `chipText`.
  `packages/ui/test/gbc/GbcEncounterGutter.test.tsx` has describe `matchesTime (pure)` (5 its) and
  describe `rowLabel (pure)` (2 its), importing them from the gutter.
- GBA wire rows (`/api/encounters/:map` in `index.ts`): `{ method: Method; rod?: Rod; chances: SpeciesChance[] }`
  (`Method`/`Rod`/`SpeciesChance` from `@pokemap/core/src/load/encounters.js`). GBA's payload carries no
  encounter rate. `EncounterGutterRow` in `components/EncounterGutter.tsx` is this shape, but that file is
  deleted in B3, so `summary.ts` must not import it.
- `GbcTimeOfDay` is in `packages/ui/src/gbc/time.ts`.

## Design (binding)

### 1. Core: `packages/core/src/gbc/load/sprites.ts` (new)
```ts
/** Species constant (e.g. "NIDORAN_F") -> folder under gfx/pokemon (e.g. "nidoran_f"). */
export function loadGbcPicFolders(root: string): Map<string, string>;
/** Frame 0 (top width×width square) of gfx/pokemon/<dir>/front.png as RGBA; null for an unknown species. */
export function loadGbcFrontSprite(root: string, species: string, folders?: Map<string, string>): Raster | null;
```
- `loadGbcPicFolders`: the chain above. Throw (message names the file) when: `PokemonPicPointers::` or
  `assert_table_length NUM_POKEMON` is missing; the slot count isn't `2 × (number of species)`; a
  non-Unown front label has no `pics.asm` line. Species list = the same set `loadGbcSpeciesConstants`
  returns (reuse it; take ids from `parseConstDefs` on the same first block — factor a tiny shared
  helper in `atlas.ts` only if it's a straight extraction, otherwise read the ids locally).
- `loadGbcFrontSprite`: `species` is already normalised by the caller. `folders ?? loadGbcPicFolders(root)`;
  unknown → `null`. `readIndexedPng(readFileSync(...))`; throw if `height < width`. Output `Raster`
  (`packages/core/src/render/raster.ts`) `width × width`, RGBA from `palette[index]`, alpha 255.
  Add a `ponytail:` comment: alpha is always 255 because every PerfPlus `front.png` tRNS is all-255
  (measured) and Unown has none; honour `tRNS` if a mod ships a transparent index.

### 2. Server: GBC `/api/species/:s/icon.png`
- In `gbcRoutes.ts`: drop the `species\/[^/]+\/icon\.png$` alternative from `GBA_ONLY_ROUTE_RE` (update
  its doc comment). Add a route `^\/api\/species\/([^/]+)\/icon\.png$` **before** the exact
  `/api/species` route: `decodeMapName` (undefined → 400 naming the raw segment, same wording style as
  the other `:name` routes), `normalizeGbcSpecies`, `picFolders` computed lazily once per handler,
  unknown species → 404 `{ error: "no sprite for <SPECIES>" }`, cache `Map<string, Buffer>` keyed by
  normalised species, `res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" })`.
  Query params are ignored (frame 0 only; plan Out of scope).
- **Named existing-test edits (behaviour changes, U1):** in `gbcRoutes.test.ts`, remove the
  `/api/species/:name/icon.png` case from the 501 `cases` array (the route is now real); keep the two
  near-miss tests (`icon.pngx`, `A/B/icon.png`) and their 404 expectations, re-worded to say they now
  prove the **new route's** `[^/]+` and `$` anchors. No other existing test changes.

### 3. UI: `packages/ui/src/encounters/summary.ts` (new)
```ts
export type SpeciesMethod = "grass" | "water" | "fish" | "headbutt" | "rock";
export interface SpeciesRow {
  method: SpeciesMethod; label: string; percent: number; minLevel: number; maxLevel: number;
  time?: "morn" | "day" | "nite"; rod?: string; list?: string; conditional?: "swarm"; rate?: number;
  /** GBC grass/water only: PerfPlus's runtime +0-4 level buff (the tooltip's "+"). GBA never sets it. */
  levelBuff?: true;
}
export interface SpeciesSummary { species: string; displayName: string; iconUrl: string; rows: SpeciesRow[]; availableAt?: Array<"morn" | "day" | "nite"> }
export interface GbaEncounterRow { method: Method; rod?: Rod; chances: SpeciesChance[] }  // the GBA wire row
export function summariseGba(methods: GbaEncounterRow[]): SpeciesSummary[];
export function summariseGbc(sources: GbcEncounterSource[]): SpeciesSummary[];
export function matchesTime(...)   // MOVED verbatim from GbcEncounterGutter.tsx (doc comment too)
export function rowLabel(source: GbcEncounterSource): string  // MOVED verbatim
export function displaySpeciesName(species: string): string   // strips an optional "SPECIES_" prefix, then Title Case per "_" word
```
- `levelBuff` is a **deviation from the plan's interface**, deliberate: B3's tooltip needs to know
  whether to print `+`, and GBA has no such buff; carrying it on the row keeps `EncounterBorder`
  family-blind.
- `GbcEncounterGutter.tsx` keeps working until B3: it **imports** `matchesTime` and `rowLabel` from
  `../encounters/summary.js` instead of declaring them (no re-export).
- Method mapping. GBC: identity. GBA: `land_mons`→`grass` label `"Land"`; `water_mons`→`water` label
  `"Water"`; `fishing_mons`→`fish` label `"Fishing · Old Rod"` / `"Fishing · Good Rod"` /
  `"Fishing · Super Rod"`; `rock_smash_mons`→`rock` label `"Rock Smash"`. GBC label = `rowLabel(source)`
  (e.g. `"Grass · morn"`, `"Fish · Good Rod · day"`, `"Headbutt · rare"`, `"Surf"`).
- One `SpeciesRow` per (input row/source, species in its `chances`), copying `percent`/levels and the
  source's `time`/`rod`/`list`/`conditional`; `rate` = GBC `encounterRate ?? biteChance` (absent for
  headbutt and all GBA rows); `levelBuff: true` for GBC `grass`/`water` rows only.
- `iconUrl` = `` `/api/species/${encodeURIComponent(species)}/icon.png` `` (the raw constant: GBA
  `SPECIES_ODDISH`, GBC `CHIKORITA`). `displayName` = `displaySpeciesName(species)` (`"Nidoran F"`,
  `"Mr Mime"`, `"Ho Oh"`).
- **Order (binding, deterministic):**
  - Within a species: rows by method order `grass, water, fish, headbutt, rock`, ties kept in input order.
  - Species: (1) the method-order index of the species' **first** method, ascending; (2) the species'
    **highest percent among rows of that first method**, descending; (3) first appearance in the input
    (flattened source/chance order), ascending.
- `availableAt` (GBC only; GBA leaves it undefined): `["morn","day","nite"].filter(t => rows.some(r => matchesTime(r, t)))`.
  Swarm rows count like any other row (the label already discloses "swarm").

### Expected Route30 GBC result (hand-derived; the test pins it exactly)
Species order: `CATERPIE, HOOTHOOT, PIDGEY, LEDYBA, SPINARAK, POLIWAG, WEEDLE, HOPPIP, ZUBAT` (grass;
45, 45, 35, 25, 25, 20, 10, 10, 10 with CATERPIE before HOOTHOOT and LEDYBA before SPINARAK and
WEEDLE/HOPPIP/ZUBAT by first appearance), then `POLIWHIRL` (water), `MAGIKARP` (fish), then
`PINECO, EXEGGCUTE` (headbutt; 30 vs 20). 13 species.

POLIWAG's rows, exactly, in order:
| method | label | percent | Lv | time | rod | rate | levelBuff |
|---|---|---|---|---|---|---|---|
| grass | `Grass · nite` | 20 | 4-8 | nite | | 9.765625 | true |
| water | `Surf` | 75 | 15-24 | | | 1.953125 | true |
| fish | `Fish · Old Rod` | 14.84375 | 10-10 | | old | 50 | |
| fish | `Fish · Good Rod · day` | 64.84375 | 20-20 | day | good | 50 | |
| fish | `Fish · Good Rod · nite` | 64.84375 | 20-20 | nite | good | 50 | |
| fish | `Fish · Super Rod · day` | 79.6875 | 40-40 | day | super | 50 | |
| fish | `Fish · Super Rod · nite` | 79.6875 | 40-40 | nite | super | 50 | |

`availableAt`: POLIWAG / HOOTHOOT / LEDYBA / SPINARAK / EXEGGCUTE / PINECO / MAGIKARP / POLIWHIRL →
`["morn","day","nite"]`; CATERPIE / PIDGEY / WEEDLE / HOPPIP → `["morn","day"]`; ZUBAT → `["nite"]`.
Re-derive this table yourself from the fixture before pinning; if it disagrees, stop and report.

## TDD steps (commit each green step)

1. **Core sprites, red then green.** `packages/core/test/gbc/load/sprites.test.ts`, every corpus test via
   `itWithGbcCorpus` (`../helpers/corpus.js`):
   - `loadGbcPicFolders(G)`: `size` 251; `CHIKORITA`→`chikorita`, `NIDORAN_F`→`nidoran_f`,
     `MR__MIME`→`mr__mime`, `HO_OH`→`ho_oh`, `UNOWN`→`unown_a`; every value has `front.png` on disk;
     and exactly one entry differs from its lowercased key (`UNOWN`).
   - `loadGbcFrontSprite(G, "DUNSPARCE")`: 48×48, the four pixels above, expected RGBA computed in the
     test from the raw PNG (its own `inflateSync` + PLTE read), not from `readIndexedPng`.
   - `loadGbcFrontSprite(G, "NOT_A_MON")` → `null`.
   - Not corpus: a temp-dir project whose `pic_pointers.asm` has one slot too few → throws naming the file.
   Implement `sprites.ts`. Commit.
2. **Server route.** In `packages/server/test/gbcRoutes.test.ts` add a describe for
   `GET /api/species/:name/icon.png`: CHIKORITA body **byte-equal** to
   `encodePng(loadGbcFrontSprite(GBC_SUBJECT_ROOT, "CHIKORITA")!)`, `content-type` `image/png`;
   `chikorita` and `SPECIES_CHIKORITA` give the same bytes; `NOT_A_MON` → 404 with the exact error;
   `%E0%A4%A` → 400. Make the two named edits to the 501 describe and near-miss comments. Implement.
   Commit.
3. **UI summary.** `packages/ui/test/encounters/summary.test.ts`:
   - Move the `matchesTime (pure)` and `rowLabel (pure)` describes **verbatim** from
     `GbcEncounterGutter.test.tsx` (only the import path changes). These are moves, not edits; name them.
   - Route30 fixture → the full `SpeciesSummary[]` with `toEqual` (all 13, every row, `iconUrl`,
     `displayName`, `availableAt`). At minimum the species order and POLIWAG's 7 rows above must be literal.
   - A GBA fixture (hand-written, 2-3 methods incl. all 3 rods for one species, `SPECIES_NIDORAN_F`
     among them) → exact summaries; `availableAt` undefined; no `levelBuff`, no `rate`.
   - A synthetic morn-only species (grass morn only) → `availableAt: ["morn"]`.
   - Tie-break cases: two species with equal top percent in the same first method keep input order.
   Implement `summary.ts`; switch `GbcEncounterGutter.tsx` to import `matchesTime`/`rowLabel`. Commit.
4. Gate: `npm test` (expect baseline 1,780 + new tests; the known flake is
   `WorldCanvas.test.tsx` "pans/zooms to the given map's real placement…": rerun it isolated if it
   appears), `npm run typecheck`, `npx vite build packages/ui`.

## Mutations the reviewers will run
- Unown mapped to `unown` (no fallback to UnownPicPointers) → a red test.
- Slot index off by one (`id*2` instead of `(id-1)*2`) → red.
- Crop takes frame 1 (rows `w..2w`) → the `(10,24)` pin red.
- `normalizeGbcSpecies` dropped from the route → the `chikorita` test red.
- Species order tie-break by percent across **all** methods instead of the first method → red.
- `levelBuff` set on fish rows → red.
- `availableAt` computed with `time === t` instead of `matchesTime` → red (fish `day` at morn).

## Report
Write `task-B1-implementer.md` in this folder: commits, test counts, every named existing-test edit
(file, test name, what changed, why), and any fact that disagreed with this spec.
