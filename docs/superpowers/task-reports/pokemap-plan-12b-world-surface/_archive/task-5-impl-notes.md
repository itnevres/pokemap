# Task 5 implementation notes

Tier: High — shared canvas behavior, asynchronous tile and encounter loading, and independently derived geometry. Budget: 75 minutes allotted; implementation uses the Codex route selected by the orchestrator because this is an iterative multi-file change. No further dispatches. No commit; independent spec and quality reviews are in progress.

Files: `packages/ui/src/canvas/worldSurfaceAdapter.ts`, `WorldSurface.tsx`, `useStage.ts`, and `packages/ui/test/canvas/WorldSurface.test.tsx`. The preexisting modified spec and untracked brief were preserved. `useStage` adds the optional current-view continuous zoom bounds, sampled through a ref.

## DOM comparison

| Element | Existing WorldCanvas | Existing GbcWorldCanvas | Surface location / difference |
| --- | --- | --- | --- |
| Section | `section.world-canvas`, aria-label World canvas | same | shared section |
| Toolbar first groups | dungeon switch, Warps, conditional Connection lines | Fit group, dungeon switch, layout error, Warps, conditional Connection lines, warp error | `fitFirst` preserves Fit position; `toolbarExtras` preserves extra groups; Task 6 owns switches and errors |
| Encounter failure | encounter alert after switches | same, after warp error | shared `EncounterFetchAlert` |
| Save/reload errors | toasts inside viewport | toolbar groups following encounter alert | Task 6; this unresolved placement difference requires appropriate adapter slots when implemented |
| Grow group | SpeciesSpotlight then WorldLensControl | same | shared grow group |
| Fit/zoom | zoom readout and Fit at trailing edge | Fit first, no zoom readout there | `fitFirst` selects existing order and readout; not a new user policy |
| Lens legend | default method key and legend text | custom method key and copy | shared WorldLensLegend with typed `lensLegend` |
| Conflict legend | ConflictLegendItems followed by Dive and Emerge swatches | ConflictLegendItems only | shared legend plus `legendExtras` for existing additional swatches |
| Body | viewport then UnplacedRail | same | shared body and rail |
| Placeholder | error or Loading world… in viewport | same | shared placeholder |
| Canvas | stage, focusable, event handlers, no explicit canvas aria-label | stage, focusable, explicit keyboard aria-label | adapter `canvasLabel`; Task 6 handlers |
| Overlays | encounter, selection, jump, warps, connections, marquee, lens, spotlight, context, tooltip, menu, toast stack | encounter, warps, connections, lens, spotlight, selection, jump, context, tooltip, menu, conflict toast | shared encounter/selection/jump/lens/spotlight/context/menu/tooltip; Task 6 deferred elements. Overlay relative ordering differs and current surface uses the first canvas order for selection/jump and the second canvas ordering for toasts. This needs review against the approved rulings. |
| Status | placed/hidden/unplaced/conflicts/accepted, contextual hover | components/maps/zoom/conflicts/accepted, different hover detail | adapter `statusItems`; hover is Task 6 |
| Popup | destination modal | separate destination modal | Task 6 |

Conflict badges: the first canvas loops all conflicts without applying the filter; the second skips out-of-filter conflicts. The brief explicitly chooses the latter. Both compute offsets, colors, accepted tick and tooltip hit records in the same order. The first canvas also draws vertical-link triangles before badges; this is `drawExtraLayers`.

Method tint evidence: `GbcWorldCanvas.tsx:275-281` tests only the fetched source `method` values, and `WorldCanvas.tsx:1120-1127` tests only fetched method rows. Neither reads time, despite the stale comment at `GbcWorldCanvas.tsx:679` suggesting otherwise. Computing the tint once during the adapter fetch is equivalent; the border's separate time prop still controls dimming.

Tests added: placeholders; StrictMode pre-world image gate, hand-derived cluster fit, culling, status and draw ordering; anchored filter fit, waiting jump and re-key, manual fit; hidden reveal, shared projection and image retention; dynamic cap. The fixtures include two clusters, a singleton and a shelved placement. Geometry derivations are in test comments. Test execution is unverified due to the sandbox; independent review should scrutinize tests and assumptions. In particular the requested projection check uses wheel-induced pan, since pointer pan belongs to Task 6; the pre-fit check starts with no world rather than observing the intervening measured-world commit. No mutation checks or live app check were performed. Neither is authorized by the scoped command override; the orchestrator must arrange them when permitted.

Verification:

- `npm.cmd run typecheck`: exit 0, `tsc --noEmit -p tsconfig.base.json && tsc --noEmit -p packages/ui/tsconfig.json` (fresh after source changes).
- `npx vitest run packages/ui/test/canvas/WorldSurface.test.tsx packages/ui/test/canvas/useStage.test.tsx`: PowerShell blocked `npx.ps1` because script execution is disabled. `npx.cmd` with the same arguments exited 1 before tests: esbuild reported `Cannot read directory "../../../../../../../..": Access is denied.` and `Could not resolve "C:\\Users\\Serve\\AppData\\Local\\Temp\\claude\\C--Programming-Projects-PokeMap\\0f8b92cb-134d-4121-a4f0-c5dbe75162fb\\scratchpad\\wt-t5\\vitest.config.ts"`. `failed to load config` / `Build failed with 2 errors`; 0 test files executed. The same failure occurred on the final retry.
- Full gate, UI build, live check, mutations: not run; user restricted commands to focused vitest and typecheck. No pass count can be claimed.
- `rg -n -i 'gba|gbc|family' packages/ui/src/canvas` finds preexisting references in `events.ts`, `MapSurface.tsx`, `mapSurfaceAdapter.ts`, `useWorldTiles.ts`, `view.ts`, and `worldView.ts`. No matches occur in the new source or modified useStage. Existing files were not changed to remove them.

Known limitations: no real adapter has been wired yet (Tasks 7–8); no Task 6 interactions are implemented. The requested full suite, build, browser check and mutations remain outstanding under the command restriction. Tests have not executed and may contain fixture or harness errors. The narrow initial test run could not establish a red test because Vitest could not start.
