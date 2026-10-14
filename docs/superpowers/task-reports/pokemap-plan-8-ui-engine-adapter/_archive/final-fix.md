# Plan 8 final-review fix (one dispatch). Findings: final-review.md Important 1 and Minor 2.

1. Important 1 (test-only). In these three tests, add `await waitFor(() => expect(calls).toContain("GET /api/map/OlivinePort"));`
   on its own line right BEFORE the `discard < GET` comparison, and change nothing else:
   - `packages/ui/test/gbc/GbcAppWorldGuard.test.tsx` "a world click, confirmed: POST /discard goes out BEFORE the new map is fetched" (before `const d = ...` line is fine, or before the `toBeLessThan` line).
   - same file, "a world double-click (open): cancel stays in World; confirm discards then opens Map on the new map" (before its final `toBeLessThan` line).
   - `packages/ui/test/gbc/GbcAppEditing.test.tsx` the dirty-guard test that asserts `discardAt < calls.indexOf("GET /api/map/OlivinePort")`.
   Keep the `<` assertions: a reversed order (GET before discard) must still fail.
2. Minor 2 (comment only). In `packages/ui/src/shared/useEditSessionCore.ts`, directly above the line `const live = stored !== null && ...`, add a 2-3 line comment: a seed change resets the view; for GBA `useMapLayout` keeps serving the previous map's data until B's fetch lands, so a paint made in that window is shown then wiped when B's seed arrives (while the server session stays dirty) — a pre-existing gap, kept as before Plan 8.

Verify (from the repo ROOT): `npx vitest run packages/ui/test/gbc/GbcAppWorldGuard.test.tsx packages/ui/test/gbc/GbcAppEditing.test.tsx packages/ui/test/shared/useEditSessionCore.test.tsx` (Node API fallback if the CLI cannot load its config, as before). Then `npm run typecheck`. Append a "Final-review fix" section to `docs/superpowers/task-reports/pokemap-plan-8-ui-engine-adapter/_archive/task-7-report.md` with the command and pass counts. No git commands that change state. Touch no other file.
