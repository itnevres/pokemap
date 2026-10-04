# D2 independent implementation spec review (replacement)

Verdict: changes requested for two acceptance-test gaps; no production correctness defect found. Reviewed implementation `85c5e92` against task-D2-spec.md. This is the independent high-risk spec review, separate from quality review. No production/test edits retained, no external corpus writes, no full suite run.

## Findings

1. **P2 — Snapshot the world actually reused across both calls.** `packages/server/test/gbcRoutes.test.ts:694–705` constructs a separate `base`, calls `buildGbcWorldPayload` once, then sends two HTTP requests whose handler owns a different worldCache. Its last assertion repeats a snapshot of the unrelated object. This does prove the pure payload helper did not mutate one input on one call, but does not meet the executed spec's explicit “snapshot cached base placements around both requests” requirement. Make two payload calls with the same base and assert its snapshot after each, plus retain HTTP equality; or expose/capture the handler's actual base in a test and assert it around both requests. Do not write the corpus or weaken existing HTTP assertions. State the tested boundary accurately.

2. **P2 — Pin GBC manual-last on a moved singleton with an intentional overlap.** The changed direct payload test at `packages/server/test/gbcRoutes.test.ts:717` manually places NewBarkTown (a fixed multi-map anchor) and an unknown zero-size AddedMap. It does not exercise an automatically moved singleton whose manual placement intentionally overlaps an anchor. The executed acceptance explicitly requests manual-last separately, including intentional overlap, for both families. Add a read-only payload case that first establishes e.g. IlexForest's automatic position, overrides it onto AzaleaTown using an in-memory sidecar, and asserts the exact override and overlap. Existing GBA coverage already meets this requirement. No API POST or external sidecar change is necessary.

These are acceptance coverage gaps, not claims that the inspected implementation currently mutates the cache or applies manual placement incorrectly. Continue the original implementer for fixes.

## Independent geometry derivation

Anchor spans x=[0,12), y=[0,4); endpoint=(1,0). Manhattan distances to N/E/S/W boundary segments are 0,11,4,1. North is strictly nearest. Target width=3 gives x=1−1.5=−0.5; JavaScript Math.round returns negative zero, so explicit normalization is necessary to return positive zero. North top-left y=0−gap(1)−height(2)=−3. Final target is (+0,−3), occupying [0,3)×[−3,−1), with a one-unit gap. A center-vector rule instead sees delta=(−5,−2), selects west, and yields (−4,−1), demonstrably different.

Blocked fixture independently follows preferred (10,10); radius 1 N/E/S/W are all blocked; radius 2 cardinals are all blocked; ascending y then x begins diagonal (9,9), which is free. A/B collision: A wins (30,−3); B's radius-1 offsets all overlap A, so radius-2 north gives (30,−5).

Out-of-bounds arrival spot checks executed with a scratch tsx script: (15,−2) against the same anchor has N/E/S/W distances 5/5/9/17; north wins and gives (14,−3). (−3,6) gives distances 9/17/5/5; south wins and gives (−4,5). Segment-distance implementation handles tangential overflow correctly.

## Code inspection

Forward-only BFS traverses hidden maps, admits null arrival links for traversal only, and refuses unresolved shown singletons as intermediaries. Reachability is classified before constructing blockers. Fixed shown anchors and unreachable shown fallbacks block; hidden maps do not. Each newly placed target becomes both blocker and anchor before recomputation. Candidate sorting is distance then map name; path sorting is distance then anchor then full edge-key sequence. Stable original ordinals survive reversed link order. Positive-size half-open intersection excludes touching edges. Fixed anchor coordinates are cloned without being moved. Both family integrations apply sidecar after automatic placement. GBA off semantics and shelf fallback are retained; GBC uses base-builder fallbacks and frozen cached warp records/endpoints.

GBA adapter uses zero-based destination indices without scaling; symbolic named-map links retain null arrival. GBC adapter loads each map once per normalization, resolves constName, converts positive destination numbers from 1-based, divides both endpoints by two, and leaves missing arrival null without dereferencing undefined.

## Corpus remeasurement

Read-only scratch script independently loaded every GBC map: 391 maps, 1,327 warp events, six destWarp=−1, zero unresolved mapConst values, one positive out-of-range destination: CeruleanCave1F event 0 → CeruleanCity warp 7 where six exist. AzaleaTown events 7/8 are raw (2,10)/(2,11), hence (1,5)/(1,5.5). IlexForest events 2/3 lead to IlexForestAzaleaGate; gate event 3 reaches AzaleaTown event 7. Its other exit reaches Route34 through Route34IlexForestGate. BurnedTower1F event 1 reaches EcruteakCity; B1F event 1 reaches 1F event 3. DarkCaveVioletEntrance reaches Route31 and Route46 directly; canonical anchor choice selects Route31.

GBA: all 54 symbolic destination IDs also target MAP_DYNAMIC. Independently read GraniteCave_1F event 0 (37,12) → Route106 event 0 (48,16); MeteorFalls_1F_1R event 0 (27,18) → Route114 event 0 (8,63); Room1 event 0 (5,18) → Entrance event 1 (10,1), Entrance event 0 (10,18) → Underwater_Route128 event 0 (38,26). Core corpus pins pass for GraniteCave_1F (18,366), MeteorFalls_1F_1R (−30,44), Entrance (417,1600), Room1 (440,1537), IlexForest (40,259), DarkCaveVioletEntrance (122,197), BurnedTower1F (73,166), B1F (73,153).

Remeasured fixed shown anchors: GBA 179 with exactly the ten specified pairs (AzaleaTown/Route34; BellchimeTrail/LakeOfRage; BellchimeTrail/LakeOfRageLowTide; EcruteakCity/Route42; GoldenrodCity/RuinsOfAlph_Outside; LakeOfRage/LakeOfRageLowTide; Route29/Route30; Route35/RuinsOfAlph_Outside; SafariZone_Enterance/SafariZone_Low_Right; SafariZone_Low_Right/SafariZone_Top_Right). GBC 68 with zero pairs. Focused tests confirm no added pairs.

## Validation and mutation evidence

- Core nearWarp.test.ts: 8/8 pass, including both live corpora.
- GBC routes, only `GET /api/world` selection: 5 pass, 74 skipped; no POST/write test ran.
- Existing GBA named tests remain unchanged and both fail with persisted dungeonAutoLayout=false: 186 vs expected 1209, and 186 vs greater-than 186. Independent in-memory sidecar isolation returns on=1209/off=186. These are the documented environment failures, not D2 regressions. No original external-sidecar restoration claim is made.
- Reran `C:/Users/Serve/AppData/Local/Temp/pokemap-d2-mutations.mjs`: stop-hidden-gate, reverse-edge, accept-blocked, center-vector-side, drop-canonical-sort, omit-gbc-half-block, symbolic-gba-as-anchor, omit-signed-zero, null-final-anchor all RED (exit 1). Each literal replacement anchor occurs exactly once; originals are held as buffers in memory, restored in finally, and byte-compared. The unmutated focused file passes afterward. The mutations respectively alter chain reachability, collision coordinates, edge choice, A/B winner under reversed inputs, endpoint units, null-arrival normalization, signed-zero identity, or direct-anchor fallback; none is an equivalent change.
- U1: no existing GBA test changed. Existing GBC edits are limited to independently derived new automatic expectations, cache-preservation strengthening, and direct payload expectations with manual overrides, all named in implementer report. Existing GBC builder tests and ignored dungeons query expectation remain untouched.
