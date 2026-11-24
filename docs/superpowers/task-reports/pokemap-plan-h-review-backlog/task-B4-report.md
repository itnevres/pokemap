# Task B4 report: a pending add owns its script edits

Tier High (save ownership). Spec: `task-B4-spec.md`. Branch `claude/plan-h-server-7-4ca143`.

## Built
- GBA: `InsertOp.owns` (appends, new names, header slot renames) stamped by `/event/create`, sign add, Indicator add; `dropOwnedScripts` (core/edit/events.ts) applied by the `event/delete` pending branch. A later marker re-hash on an unterminated scripts.inc re-stamps earlier pending signs' owned text.
- GBC: `GbcEditSession.ownedAdds` (blocks, names, `const` lines) recorded by the add dialog; `findOwnedGbcAdd` (kind + script + object event flag, ignored when two live events share the key) and `dropOwnedGbcAdd` applied by the GBC `event/delete`; carried in `GbcSnapshot`.

## Tests (tests first, run red: 13 of 14 red for the right reason, 1 test bug fixed)
21 `B4:` tests across `addEventRoutes`, `indicatorRoutes`, `gbcAddEventRoutes`.

## Reviews (Opus `high-risk-reviewer`, spec and quality as separate dispatches; Codex is limit-parked)
- Both found the same blocker: GBC delete with no owner record staged the OLD text (delete lost). Fixed, pinned by two new tests (warp and coord delete reach `eventsText` and the plan).
- Fixed: owner lookup ambiguity (two events same script+flag -> no record applies); first-of-two pending signs on an unterminated scripts.inc left its block behind (owned text re-stamped on re-hash).
- Logged, not fixed (decisions-h-server): acceptance 2 slot may differ after deleting an earlier add; a later add reusing the deleted add's new script/flag loses it (needs a ruling); blocks rewritten by a later sign/Indicator UPDATE stay; separator restore in the fold case when disk ends `\n\n` (minor); names removed even when text removal fails (minor); no trainer / VAR-slot route tests; GBC sign/Indicator adds out of scope.

## Mutation checks
GBA/GBC drop logic and stamping: G1-G14, G17, G19 killed; G15 (eventFlag) and G18 (ambiguity guard) survived first, killed after two tests were added. G16 (`base + tail` vs `applyScriptAppend`) survives: equivalent when the owned text ends with a newline (always, for create appends).
