# Plan 14.1 Task 8 implementation report

Status: implementation and tests written; runtime verification and independent reviews pending conductor.
Tier: High, because dialog stacking, deferred create/preview responses, and visit ownership require independent reasoning.

## Routing and interruption

The delegate skill was read before implementation. Native Codex gpt-6.1-sol implemented the initial task; this connected multi-file task skipped the small-file Aider route. The implementation helper and two separate gpt-6-astra static reviews were interrupted by the provider usage limit. No review result was produced. After the user's explicit continuation request, the root agent completed the remaining code, tests, and static inspection inline to preserve the existing work. No fresh implementation helper was dispatched. This is an infrastructure-recovery exception to the usual small-inline-edit rule. No Anthropic model was available. Do not treat this report as an independent approval.

## Files written

Created:
- packages/ui/src/shared/AddEventDialog.tsx
- packages/ui/src/gba/addEventFields.ts
- packages/ui/src/gbc/addEventFields.ts
- packages/ui/test/shared/AddEventDialog.test.tsx
- packages/ui/test/gba/addEventFields.test.ts
- packages/ui/test/gbc/addEventFields.test.ts

Modified:
- packages/ui/src/shell/adapter.ts
- packages/ui/src/gba/adapter.tsx
- packages/ui/src/gbc/adapter.tsx
- packages/ui/src/components/MapEditingWorkspace.tsx
- packages/ui/src/gbc/GbcMapEditing.tsx
- packages/ui/src/components/SaveDialog.tsx
- packages/ui/src/styles.css

This report is the additional AGENTS-required task ledger. Existing test files and shared fixtures were not edited. No core/server files, subjects, launch files, or session-hook contracts were edited. Git status/diff was not available for an independent baseline comparison.

## Behavior

Both workspaces open the shared dialog from the placement pick and pass the exact event-grid coordinates to createEvent. Family providers describe object/NPC/itemball/existing-trainer, warp, coord, and conditional BG fields and defaults. GBA placement supplies the tile elevation. GBC automatic object constants omit the empty field so the existing builder chooses its default. GBC conditional BG wrapper defaults are distinct from the generated script label.

The form renders searchable long selects, text fallbacks, and source modes. Copy previews retain editable bodies/texts and trainer text provenance. Required values and identifier syntax gate Add. A synchronous request latch prevents duplicate submissions; in-flight Cancel, Escape, backdrop, and fields are locked. Preview sequence tickets and visit/unmount ownership suppress stale successes and errors. Cache invalidation keeps the form mounted and preserves its current warp query. Current-visit successes close and select through the live session; refusals preserve the form.

Add buttons extend existing disabled-reason plumbing for unavailable/editing states, both object caps, and absent GBC scenes. Canvas paint requests are tracked at the workspace boundary. Legacy canvas-only sessions retain their original object identity, as pinned by the existing workspace test. Context exit retires the workspace's visit ownership.

Topmost dialog checks preserve Escape/Tab behavior. Completion does not steal focus from a stacked Save dialog. Save derives notes from live dirty-workspace warp identities versus their baseline, checks destinations afresh, and subscribes to source updates. Undo/redo and remounts do not require a second warning history. Source identity and per-query tickets discard retired answers. These notes remain advisory.

## Compatibility choice

EngineAdapter's two added methods are optional on the legacy structural shell interface because packages/ui/test/shared/createEvent.test.tsx constructs an adapter literal without them. Editing that existing fixture was forbidden. The concrete gbaAdapter and gbcAdapter exports use satisfies EngineAdapter and expose both methods as required; AddEventFieldAdapter requires them for the actual dialog. No existing check or fixture was loosened.

## Task 8 Step 1 coverage mapping

Unless stated otherwise, shared dialog tests run once for GBA and once for GBC. Source tests use controllable promises, not timers. Fixtures are local to the three new files and use family constant names (GBC POTION, GBA ITEM_POTION).

1. Family/kind/type field tables:
   Both addEventFields.test.ts files: "NPC exposes sprite, movement, ranges, flag and all three script modes"; "item ball requires item and flag without script source"; "trainer has existing trainer, sight, beaten flag and exactly three new/copy text sources"; "warp provides map and destination warp values with engine numbering"; "coord provides its engine trigger and script"; "bg visibility follows each supported type and never offers quantity or copy flags"; "defaults use project values and choose the lowest unused local script name". GBC also: "conditional BG wrappers have a distinct generated label from the selected script". These pin GBA hidden-item quantity absence, Existing/New flag modes, GBC scene -1, and all trainer text sources.
2. Searchable selects and empty lists:
   "searches selects over twenty options and uses a textbox for empty options".
3. Required fields and identifier validation:
   "validates required content and new identifier before enabling Add".
4. Disabled reasons and real workspace placement:
   "real workspace not-editable state disables every Add button with its reason";
   "real workspace pending paint request disables every Add button until it settles";
   "real workspace object cap uses project cap and disables with reason";
   "real GBC workspace without scenes disables Coord with the reason" (GBC only);
   "real workspace canvas pick opens dialog; POST success closes and selects created" (also checks the in-flight create reason and posted coordinates).
5. Script/text copy sources:
   "copy fills editable script body, text bodies and a default new label";
   "trainer %s Copy from fills the matching text and keeps provenance" (seen/beaten/after);
   "late copy/text previews cannot overwrite a newer same-visit selection or mode";
   "late trainer text success and failure cannot overwrite another source or a New mode".
6. Submit once, current/stale results, retained errors, in-flight locks:
   "double submit creates once; in-flight Escape, Cancel and backdrop do nothing";
   "400 message remains inline with entered fields intact";
   "real workspace canvas pick opens dialog; POST success closes and selects created";
   "real workspace preserves dialog on refused create and its typed fields";
   "real workspace delayed %s after A to B to A neither selects nor errors on the new visit" (success/failure);
   "dialog suppresses delayed %s callbacks after A to B to A" (success/failure, direct callback witness independent of the session hook's stale guard);
   "option invalidation during create keeps the form mounted and its fields locked".
7. Save stacking, Escape, Tab, and focus:
   "Save stacks above Add: only topmost Escape closes and Tab is trapped; focus returns to Add button";
   "Save opened during create waits and shows the new warp note without losing focus".
8. Advisory warp warnings and Save notes:
   "warp tile and return warnings are advisory and use destination numbering";
   "Save notes retain the unsaved one-way warp warning" (also pins destination query normalization);
   "Save notes follow live warp undo/redo and ignore a retired identical source";
   "Save opened during create waits and shows the new warp note without losing focus".

## Verification result lines

- Focused three-file vitest: NOT RUN (user sandbox instruction; conductor required).
- UI vitest suite: NOT RUN (user sandbox instruction; conductor required).
- Full gate / passing tests / failures / file count: NOT RUN; no result claimed.
- npm run typecheck: NOT RUN (conductor required).
- npm run build -w packages/ui: NOT RUN (conductor required).
- Live app / Playwright: NOT RUN.
- Required conductor mutations: NOT RUN. The direct stale callback tests witness removal of the success ownership check; the in-flight Escape test witnesses removal of its request latch. Red/green results must be established by the conductor.
- Separate spec and quality reviews: NOT COMPLETED; interrupted by provider usage limits, no approval claimed.
- Static source inspection: performed against the real core types, builders, hooks, focus helper, and relevant existing workspace assertions.
- Encoding inspection: all 13 code/test/style files have CRLF only and no BOM; all six new source/test files are ASCII. Existing non-ASCII bytes in pre-existing files were retained; inserted code is ASCII.
- Git commands, commits, pushes: NOT RUN / none created.

## Remaining work

The implementation portion is ready for conductor checks, not a claim that Task 8's gates pass. Run the exact focused/UI/typecheck/build commands in the user brief, the full gate required by AGENTS, the named mutations, live checks, and separate spec/quality reviews. Preserve any full failure evidence and repair this same work product without changing existing assertions or fixtures. Archive this report only after the required reviews pass with no open findings.
