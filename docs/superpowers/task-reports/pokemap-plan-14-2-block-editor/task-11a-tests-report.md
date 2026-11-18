# Task 11a tests report

Risk: high (route parsing and error boundaries, shared staged files, independent numeric and PNG oracles). This is the tests/stubs slice only. The dispatcher assigned a 30-minute budget and retained separate spec and quality reviews. No route is mounted and the two factories throw the required Task 11a error.

## Cases and interpretations

1. Both families check id, cell, `viaBorder`, revision and draft shape. GBC's tile list is compared with the selected 16 on-disk metatile bytes. The map GET provides the cell id; a raw GBC zero is interpreted per B4 as the border.
2. GBC paints zero through the existing paint route and checks the resulting session cell is actually zero, then compares the read route with the map header border.
3. Revision comparisons use only GET replies. A paint on a different grid must preserve the revision; a paint on the target grid and a staged file append must each change it.
4. An unstaged read expects null owner; a second map that shares the file stages it and becomes owner.
5. Counts come from disk and the GBA map payload; GBC cap is the B6 literal 256. The GBA selected primary file uses the map's split as its cap. This assumes the selected fixture's consuming layouts do not impose a smaller split; see independent review.
6. PNG dimensions come from IHDR, with B7's 16 columns and eight-pixel tiles. GBA compares palette 0 and 1 and checks identity tile ids; GBC checks `0x60 -> 0x80`. URL includes version and GBC time.
7. Identity preview is compared byte-for-byte against the existing metatile PNG, both at renderer scale 1. The test expects an out-of-sheet tile to return 400 with its field and code. B8 specifies JSON base64.
8. B13 checks `has` before and after the three reads. On a painted open session it compares the serialized payload and actual undo stack length before and after.
9. B12 checks an empty effects list, then the staged plan's file path and its owning map in the consuming maps list. The collision edit is also staged for GBC, with four additional records in each consuming collision file in the temp copy (T1).
10. B11 checks malformed map escapes, unknown maps, selector ambiguity and null/array preview bodies and the exact `{error, code}` schema. Unknown maps are checked on all three routes.

Fixture discovery scans maps for a shared metatile file and a distinct grid; absence fails explicitly. GBA uses a primary file. Temp copies are removed after the suite, and the staging-effects case restores its selected disk bytes in `finally`. No production subject is written. The request contract and body interpretation follow B1-B8, B11-B13; 11b is intentionally left for the next task. T2 coordinates use only cell (0,0); T3 is addressed below; T4 is not invoked; T5 values come from prior HTTP responses, disk and literals.

## Existing assertions changed for B12

Only `packages/server/test/gbcEditRoutes.test.ts` lines 97, 291, 331 and 449: each empty whole-body Save plan expectation gained `tilesetEffects: []`. The trap's older references 122 and 228 correspond to other payloads in this base and were not changed. Search found no GBA whole-body GET plan expectations; individual field assertions and POST commit error assertions do not gain this field.

## Verification

`npm.cmd run typecheck`: PASS (exit 0; root and UI TypeScript checks). `npm run typecheck` through PowerShell's `npm.ps1` first failed because execution of scripts is disabled; `.cmd` invoked the same npm script successfully. Vitest and npm test were not run as instructed. The tests are intentionally unmounted and their red status remains for the conductor to verify. No full gate or UI build was requested or run for this test-only slice.

## Spec review (initial, independent)

Status: CHANGES REQUIRED pending the implementer's fixture repairs. Reviewed against base b9b74f28e0f45588fcdb5aa8e2ddfa8fd7f0575a, Task 11 plan/global constraints/review addendum, and task-11-rulings.md. High-risk review used the dispatched native gpt-6-astra because Opus is unavailable. No Vitest, npm test, typecheck, build, or production-subject writes were performed by this reviewer.

### Blocking findings

1. GBA staged append is incomplete. Both new files' initial appendPlan helper (lines 72-85) appends 16 metatile bytes; only the GBC branch adds companion data. The GBA identity planner explicitly requires attribute byte length to equal metatile count times attribute size (packages/core/src/blockEdit/gbaOps.ts:289-290). Therefore a correctly implemented GET following stage returns BAD_VALUE rather than the required 200 in the revision and ownership cases. Append a matching attribute record too, or use a valid in-place edit. This is fixture invalidity, not an intended red from absent routes.
2. GBA preview identity oracle is transparent and cannot detect the required palette-context mutation. idFor initially always selects id 0. The alphabetically selected primary building file's first 16 metatile bytes are all zero; read-only Pillow inspection of data/tilesets/primary/building/tiles.png found tile 0 contains only palette index 0. packages/core/src/render/tile.ts skips index 0. Thus all eight entries render no pixels, and a preview that ignores map palettes still equals the transparent reference. Choose a visibly contextual block using a deterministic fail-loud scan and establish sensitivity using existing hub images/disk evidence. Preserve the identity-preview comparison with an independent preexisting HTTP PNG.

### Coverage and scope assessed

The two factories have B1 typed family project/store dependencies, syncOverlay, overlay, sessionBody, hasMap, and boolean handle return types. Both bodies contain exactly the Task 11a throw. No mounts or implementations were added. The existing test diff adds only tilesetEffects: [] to four full GBC plan-body assertions; GBA commit-error whole-body assertions are not GET-plan bodies and should remain unchanged. No 11b check/apply scenarios were added.

The new tests exercise both id and cell reads, GBC 16 disk bytes and raw-zero border resolution, revision changes after own paint/staging and stability after another grid's paint, null then shared-file owner, disk/HTTP/literal limits, sheet IHDR dimensions and tile-id mapping, GBA palette difference, GBC slot 0x60 to id 0x80 and URL time/version, identity preview and invalid tile field, absent/open-session B13 behavior, B12 empty/staged effects, malformed/unknown names on all three read routes, ambiguous/missing cell selectors, and null/array bodies. All targets are (0,0), so they obey the four-wide fixture constraint. GBC stages both metatiles and collision and pads consuming collision files in the temp copy. Discovery absence throws.

The dispatch's shorthand initially suggested exact literal errors and every consuming map were required. Parent clarified the actual user requirements: exact { error: string, code: string } schema and at least the staged map in B12 maps. Current assertions meet those requirements; these are not findings. Options/usage assertions would be additional coverage, not a blocker for the specified list.

### Evidence and remaining limits

Independent reads included route payload/render implementations, core request types/planners/ownership-related effects, fixture copy helpers, renderer, and the actual selected subject files read-only. GBC's first shared BattleTowerInside sheet is 128x96 on disk, i.e. 192 eight-pixel tiles, so this fixture has index 0x60. Its palette-map parser specifies the low 0x00-0x5f / high 0x80-0xdf mapping.

The GBA limits assertion assumes the selected map split is the effective append cap across every consuming layout. Core checks every consuming use in gbaOps.ts:339-349; this cross-layout condition was not empirically certified. The implementer report already records it; a checked fixture should remove the assumption. A read-only node --import tsx fixture diagnostic failed before project load with ERR_SYSTEM_ERROR: uv_os_get_passwd returned ENOMEM in tsx temporary-directory initialization; no result was inferred from that failure. The subsequent direct disk/Pillow checks above succeeded. No tests or build were run, in accordance with the task's explicit restriction. Final pass requires rereading the repair diff; mutation execution and intentional red verification remain with the conductor.

## Independent code-quality review (initial oracle snapshot)

Status: CHANGES REQUIRED. High-risk code-quality review independently read task-11-rulings.md and the actual tests, planners, loaders, renderers, session stores, ownership staging and Save-effects code against BASE b9b74f28e0f45588fcdb5aa8e2ddfa8fd7f0575a. Native gpt-6-astra substituted for unavailable Opus; the separate spec review remains independent. Findings below refer to the initial reviewed line numbers, before the same implementer repairs them.

### Required narrow fixes

1. **P1 — incomplete GBA staged append**, packages/server/test/blockEditRoutes.test.ts:72-85 (duplicated helper in gbcBlockEditRoutes.test.ts). appendPlan appends 16 metatile bytes but the GBA branch adds no matching attribute record. loadTileset tolerates a shorter attributes array, which can make this fixture appear drawable; planGbaBlockEdit explicitly rejects an attribute/metatile count mismatch (core/src/blockEdit/gbaOps.ts:289-290). The mandated identity planner therefore refuses the post-stage GET in revision and ownership cases, even after correct routes exist. Append a disk-derived attribute word of profile.metatileAttributesSize with a coherent before buffer, or stage a valid in-place change. This failure is separate from the intentionally absent route implementation.

2. **P2 — malformed-name preview can fail for the wrong reason**, both new suites:291. The request to /api/edit/%/block/preview uses {}. That body already lacks request/draft, so an implementation that never validates the malformed map escape can return a structurally valid 400 body and pass. Reuse an otherwise valid identity-preview request for this malformed-name case; keep null and array tests separate. The existing unknown-map case expects 404, so an ordinary malformed-body 400 does not falsely satisfy that assertion. No exact error literal beyond the user's specified schema is being required.

3. **P2 — outside-sheet preview does not isolate sheet validation**, both new suites:259-260. Setting tile 999999 exceeds the format's numeric encoding range as well as the sheet. A route that checks representable numeric limits but omits drawable-sheet validation can satisfy this test. GBA's patcher explicitly rejects values over 0x3ff (core/src/blockEdit/gbaPatch.ts:43-44); GBC has an eight-bit tile space with invalid palette-map holes. Use an otherwise well-formed representable absent tile: GBC 0x60 is a documented hole (core/src/gbc/load/tileset.ts:599-606); for GBA establish a representable missing tile from fixture/disk dimensions and layout split, and fail loudly if the selected fixture supplies no such gap. Keep the existing field-naming error assertion. This strengthens the existing B8 case without broadening route scope.

### Advisory, not blocking

Both suites:227 require effects.maps to contain pair.b only. An owner-only consumer list would pass even though pair.a shares the edited file. Adding pair.a or an independently constructed complete consumer list would strengthen B12. Parent clarified that the user explicitly accepted at least the staged map, so the present assertion meets the required minimum and this is not a required change.

### Other conclusions and limitations

The GBC staged edit contains both metatile and collision changes, and beforeAll adds surplus collision records to each distinct collision file of map-consumed aliases sharing the selected metatile path. That matches the aliases traversed by gbcTilesetsForFile/buildGbcRelations; no missing-alias defect was found. Targets are cell (0,0), and the other-grid fixture compares actual grid paths. Session factories are intercepted before handler construction; absent-session checks themselves use store.has, while historyLength opens only after painting already established the session. afterEach closes sessions; the next read syncs the cleared overlay. Temporary copies are used, and the explicit disk-byte restoration helper runs in finally in the ownership/Save case. The four existing GBC changes add only the B12 empty array. The new source module remains typed throwing factories without mounts or implementation. Both test files were compared and differ only in the terminal family selection; no style-only deduplication change is requested.

Existing GBA and GBC metatile endpoints use the same native scales their family renderers expose (16 and 32 pixels respectively), so byte equality is plausible when preview uses the same encoder. The review did not prove the chosen previews are palette-sensitive; the independent spec review records a concrete transparent GBA fixture defect and owns that evidence. Sheet IHDR checks and the GBC 0x60-to-0x80 mapping were traced to renderer/loader conventions; no fixture-derived numeric values were accepted from the proposed route implementation.

No Vitest, npm test, typecheck, build, source edits, or subject writes were performed. One read-only node --import tsx project-inspection attempt failed before task code executed: ERR_SYSTEM_ERROR, uv_os_get_passwd returned ENOMEM, from tsx temporary-directory initialization. No runtime conclusions were inferred from that failure. Source inspection, git status/diff, duplicate-suite comparison, and read-only subject text inspection supplied this review's evidence. Parent owns final typecheck/red-test verification and mutations. This initial review is not a pass for repaired files; reinspection is required after the same implementer completes fixes.

## Implementer repair disposition

- Spec 1 / quality 1: the GBA append now includes a disk-derived attribute record of the configured width; the fixture checks the initial record count. The GBC plan continues to include a collision edit.
- Spec 2: GBA preview selects the first pre-existing hub metatile PNG with at least two decoded RGBA colors, failing if none is found; it no longer chooses known-transparent block 0. GBC scans existing metatile images until day and night pixels differ and previews at night, so this comparison has a demonstrated time/palette negative control. Both compare the identity preview byte-for-byte to an earlier same-scale hub PNG. GBA's nonuniform-image selection establishes visibility; it does not independently prove a palette mutation changes that image.
- Cap concern: fixture selection now requires all consuming primary/secondary aliases to have the same cap as the selected map's primary split, and verifies the on-disk count is below that cap. A missing suitable pair fails loudly. The earlier assumption in case 5 is superseded by this check.
- Quality 2: malformed and unknown preview map cases now carry a valid identity request; null and array cases remain separate.
- Quality 3: GBC uses the documented 0x60 gap after asserting that ID is absent from the sheet mapping; GBA selects the first absent 10-bit tile from the returned sheet IDs, falling back to `tileCount` if the sheet covers all 1024 representable values. The fallback cannot isolate sheet validation from numeric encoding and is recorded for conductor review.
- The B12 case additionally requires both sharing maps in the file's effects. A separate GBC nonzero cell is selected for case 1; raw zero remains case 2. Collision fixture files are snapshotted and restored during teardown before the temp tree is removed, including on teardown errors.
- The GBC sheet check retains a loud failure if no sheet with more than 0x60 cells is found; the initial review identified one 192-cell sheet in the chosen fixture.

Final repair verification: `npm.cmd run typecheck` PASS, exit 0. Vitest and npm test were not run. Independent re-reviews and conductor red/mutation checks remain pending.

## Spec re-review (first repair)

Status: CHANGES REQUIRED for two new oracle-selection issues; the two original spec findings are resolved. This is a narrow independent reread of both current test files, the factory stubs, and the existing-test diff. No tests, builds, typecheck, or source edits were performed. The paired files still differ only in their final family selection.

The GBA append helper now validates attribute/metatile count alignment and appends exactly one original attribute record using profile.metatileAttributesSize alongside the 16-byte metatile append. This resolves the identity planner's count refusal. Its fixture scan now requires spare primary capacity and equal limits across all map-consumed primary and secondary uses of the same resolved path, removing the earlier cross-layout cap assumption.

The GBA preview now scans only existing /api/metatile images and chooses an image with more than one decoded RGBA color, failing loudly if none exists. This eliminates the all-transparent identity oracle. The GBC preview independently compares day and night images from the preexisting metatile route, requires a pixel difference, stores the night PNG as its reference, and posts preview with ?time=nite. Its source draft still comes from block GET as intended; the reference pixels and selection criterion do not. These changes resolve the original preview finding. The conductor still owns actual palette-mutation execution.

Two new fixture criteria violate T5 / the explicit requirement that proposed block routes never supply oracle values:

1. Both files lines 286-296: the GBC sheet fallback tests result.sheet.tileCount and selects another fixture based on candidate.status === 200 and candidate.body.sheet.tileCount > 0x60 from the new block GET. A defective route can determine which fixture is exercised, and the scan silently bypasses failing candidate responses. Select the fixture from existing hub/disk sheet dimensions or retain the already verified 192-cell BattleTowerInside sheet and fail loudly on its independent precondition. Do not use the proposed route to select candidates.
2. Both files lines 351-354: the GBA invalid tile is selected from data.sheet.tileIds and falls back to data.sheet.tileCount, both returned by the proposed block route. A corrupt tile map can manufacture the negative-test input, and the fallback can also exceed the representable 0..1023 range. Derive a representable absent tile independently from disk sheet dimensions and the existing layout split (or a literal with an independent precondition), and fail loudly if no suitable tile exists. The GBC literal 0x60 is independent and remains suitable.

All ten requested scenario groups remain. Non-border GBC cell selection now explicitly finds a nonzero cell and computes coordinates with the existing map width; the separate raw-zero case remains. B12 now checks both owner and sharing map. Malformed/unknown preview routes receive an otherwise valid identity request, while null and array bodies remain separate. B13 still covers closed and painted-open sessions. The four existing assertion changes remain B12-only; factories remain exact typed throwing stubs; no 11b scenarios or mounts were introduced. Cleanup now restores the GBC collision snapshots before removing its temporary root. Parent has been notified of the two narrow fixes above.
