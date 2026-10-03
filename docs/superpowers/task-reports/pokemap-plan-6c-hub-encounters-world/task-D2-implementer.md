# D2 implementer report

## Scope and revision

Started after coordinator commits through `0521de1` (the dispatch cited older `9bca4c0`; the worktree had advanced before implementation). Implemented near-warp placement in `nearWarp.ts`, family adapters in `nearWarpAdapters.ts`, GBA resolver integration, and GBC route integration. GBC normalizes warp events once per handler into a frozen list. Both paths use fresh automatic placements and apply manual sidecar positions last. GBA's off toggle still deletes singleton placements. No UI code, external corpus files, or `.codex` files changed.

The helper takes an optional explicit `singletons` set. GBA's shelf fallback assigns cluster component IDs to several original planar singletons, so its fallback placements cannot be used to infer planar singleton identity. Both adapters pass their original component membership. Fixed multi-map anchors are excluded from candidate placement.

## Geometry and corpus evidence

The hand fixture has Anchor `(0,0)` size `12×4`, arrival `(1,0)`, Target `3×2`, gap `1`. North/east/south/west distances are `0/11/4/1`; north wins. `Math.round(1-3/2)` is `-0`, normalized to `+0`; y is `0-1-2=-3`. The center-vector mutation chooses west and fails. For out-of-bounds arrivals, the helper uses Manhattan distance to each edge segment, including the tangential distance beyond the segment, before the N/E/S/W tie order.

GBA measured output with an in-memory enabled sidecar: `GraniteCave_1F (18,366)` beside `Route106`; `MeteorFalls_1F_1R (-30,44)` from `Route114`; `SeafloorCavern_Entrance (417,1600)` from `Underwater_Route128`; `SeafloorCavern_Room1 (440,1537)` after Entrance. Obstacle avoidance moves the last two from their first preferred points. All ten pre-existing shown-map overlap pairs remain exactly the ten listed in the corrected D2 spec; no new pair is added. A manual Granite Cave placement `(0,342)` intentionally overlaps Route106 and wins after automatic placement.

GBC measured output: `IlexForest (40,259)`, `DarkCaveVioletEntrance (122,197)`, `BurnedTower1F (73,166)`, `BurnedTowerB1F (73,153)`. The IlexForest to hidden `IlexForestAzaleaGate` chain's gate source ordinal 2 goes to AzaleaTown destination ordinal 6, whose raw `(2,10)` converts to `(1,5)` blocks. Source ordinal 3 goes to destination ordinal 7, raw `(2,11)` to `(1,5.5)`. `CeruleanCave1F` event 0 targets `CeruleanCity` ordinal 6 when that destination has only six warps; the named edge exists with `arrival: null`. No shown GBC placement pairs overlap. Repeated resolution is byte-equivalent and leaves base placements value-identical.

Corpus correction: all 54 GBA symbolic destination warp IDs in this subject also target unresolved `MAP_DYNAMIC`. None supplies a named destination to traverse. A synthetic valid-map symbolic link proves the adapter retains a directed edge with null arrival when that combination occurs. The executed spec bullet was corrected accordingly.

## Test changes

New `nearWarp.test.ts` titles and reasons:

- `keeps a map-resolved symbolic GBA warp as traversal-only`: preserves the named edge without inventing an arrival.
- `places Target north of Anchor from the resolved arrival endpoint and normalizes signed zero`: pins the hand geometry, full coordinates, and `Object.is` signed zero behavior.
- `follows a forward Target to hidden Gate to Anchor chain using the final destination event`: pins directed hidden traversal and anchor-frame arrival.
- `uses null arrivals for hidden traversal but never for a final shown anchor`: separates traversable map edges from geometric anchor edges.
- `takes the first free diagonal after a blocked preferred point and blocked cardinal offsets`: pins `(9,9)` after blocked preferred/cardinal positions.
- `chooses lexicographic anchor and target order independently of map and link order`: pins competing A/B placement, equal-length anchor tie, and reversed-input equality.
- `GBA near-warp uses resolved zero-based arrivals for Granite Cave, Meteor Falls, and Seafloor Cavern`: pins source/arrival events, exact real positions, ten baseline overlaps, deterministic rerun, and manual-last intentional overlap.
- `GBC adapter preserves half-block endpoints and null out-of-range arrival`: pins AzaleaTown #7/#8, Cerulean null arrival, four real positions, zero overlaps, input immutability, and deterministic rerun.

Changed existing `gbcRoutes.test.ts` titles/reasons:

- `deep-equals independently resolved near-warp placements; 326 components, exactly 3 with more than one map; blockPx 32`: expected placements now come from independent core resolution rather than raw shelf baseline.
- `a second request returns deep-equal data -- the world cache is never mutated by serving it`: additionally snapshots a base `GbcWorld` across direct resolution and two HTTP calls; the private handler cache itself is not directly exposed.
- `buildGbcWorldPayload wire-shapes a real GbcWorld directly (unit, no HTTP)`: expected automatic positions now use independent core resolution before manual overrides.

No GBA server tests or GBC base-builder tests were changed. The two previously documented GBA `world.test.ts` failures depend on the external persisted `dungeonAutoLayout:false` sidecar; that file was not touched or rerun because those tests write the external corpus. The safe core resolver tests cover the on/off behavior.

## Mutation red proof

Runnable scratch harness: `C:/Users/Serve/AppData/Local/Temp/pokemap-d2-mutations.mjs` (outside repository). Run `node C:\Users\Serve\AppData\Local\Temp\pokemap-d2-mutations.mjs` from the repository root. For each ID, it requires each literal source anchor exactly once, builds the replacement in memory, runs only the named focused Vitest case, restores original source bytes in `finally`, and byte-compares the restored file. All nine yielded `RED (exit 1)`:

| ID | Mutant | Failing witness |
| --- | --- | --- |
| stop-hidden-gate | refuse hidden traversal | forward Gate chain |
| reverse-edge | index links by destination instead of source | forward Gate chain |
| accept-blocked | accept occupied preferred point | obstacle spiral |
| center-vector-side | choose side from anchor center vector | north geometry |
| drop-canonical-sort | keep candidate input order | reversed A/B winner |
| omit-gbc-half-block | use raw destination event coordinates | AzaleaTown conversion |
| symbolic-gba-as-anchor | invent source-coordinate arrival | symbolic adapter |
| omit-signed-zero | return `-0` | `Object.is` geometry assertion |
| null-final-anchor | let null arrival terminate at shown anchor | direct-anchor fallback |

## Focused verification

- `npx vitest run packages/core/test/world/nearWarp.test.ts packages/core/test/world/resolve.test.ts packages/server/test/gbcRoutes.test.ts`: 90 passed across 3 files.
- `npx vitest run packages/server/test/gbcRoutes.test.ts` after freezing the handler warp cache: 79 passed.
- `npm run typecheck`: passed.
- No `build` script exists in root `package.json`; coordinator owns the final full suite.
