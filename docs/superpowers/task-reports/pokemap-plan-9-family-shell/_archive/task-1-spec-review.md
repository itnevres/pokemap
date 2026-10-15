### Spec Compliance
Reviewed diff 9ad5138..fd16fcc against the brief and the two rulings.

- ✅ Scope: only the 3 test files touched (App.test.tsx, GbcAppEditing.test.tsx, GbcAppWorldGuard.test.tsx); no packages/ui/src change; no existing test body modified.
- ✅ Step 1 verbatim, appended inside "Task 13 save flow" (App.test.tsx diff ~l.452).
- ✅ Step 2 matches brief; uses the permitted per-test `/api/world` wrapper (no shared helper edit). No jest-dom matchers.
- ✅ Step 3 per ruling: own describe "App -- Plan 9 shell characterisation" (App.test.tsx ~l.640); expected values taken from the real GBA canvas via "Fit world" oracle (no hard-coded 31%/37.5px); each structural change (rename, membership add) preceded by a pan so kept-pan and refit differ; clientWidth/Height stubs restored in finally and asserted. Mutation fails it (below).
- ✅ Steps 4, 5, 6 verbatim (GbcAppEditing.test.tsx ~l.113-158).
- ✅ Step 7 per ruling: mock factory gains only the third button + `onEditHere` prop type (the only 2 removed lines are the factory signature and old closing line); test final check replaced by testid "world" present, click Map, waitFor status "OlivineCity" (sibling-test pattern). No existing test body changed.
- ✅ "Already covered" list is not duplicated; the brief cites them (GbcAppEditing "dirty guard…"/"failed discard…", WorldGuard "failed discard from World…", GbcApp.test "palette highlight resets…"/"preserves dungeon pan on rename…", App.test "in Map mode with a dirty session…"/"a world click on another map asks to discard first"). The implementer report does not itself list them; the orchestrator should cite them in the final report.
- ✅ No jest-dom matchers in any added test (only getAttribute, textContent, toBeNull, toBeTruthy, as the brief itself uses).
- ⚠️ Cannot verify: full gate (2,710 pass / 171 files) not re-run by me; implementer's own full run was invalid (sandbox), orchestrator reports 2710/0 in p9. Not re-verified here.

### Mutation results
Run in codex-t1 (fd16fcc) from repo root, one test at a time, restored with `git checkout -- packages/ui/src` after each.

| Test | Mutation | Result | Failing assertion |
|---|---|---|---|
| 1 GBA re-click prompts | `selectMap` early `return` when `name === selected` | FAIL | `expected confirm to be called 1 times, but got 0` (first toHaveBeenCalledTimes(1)) |
| 2 tool+stamp survive | `switchMode` resets `editing.setActiveToolKind(null)` / `setCurrentStamp(null)` | FAIL | `expected 'false' to be 'true'` (pencil aria-pressed) |
| 3 dungeon rename refits | `mapFilter` memo deps -> `[openDungeon?.id, openDungeon?.maps.join()]` | FAIL | `expected ['20px','10px'] to deeply equal ['0px','0px']` (post-rename refit position) |
| 4 GBC re-click no confirm | GbcApp.tsx:159 -> `leave(go)` unconditionally | FAIL | `expected confirm to not be called at all, but called 1 times` |
| 5 GBC re-click clears error | delete `setSwitchError(null)` at GbcApp.tsx:152 | FAIL | `expected <span></span> to be null` (discard -> 500 text remains) |
| 6 GBC tool resets | brief's mutation: `key="world-host"` on Map div (GbcApp.tsx:324) | PASS (mutation ineffective, see Issues) | none |
| 6 GBC tool resets | substitute mutation: persist `toolKind` outside GbcMapEditing (GbcMapEditing.tsx:61, module/global backing) | FAIL | `expected 'true' to be 'false'` (pencil aria-pressed after round trip) |
| 7 GBC Edit here clears error | delete `if (name === selected) {...}` line GbcApp.tsx:195 | FAIL | `expected <span></span> to be null` |

`git status --short` in codex-t1 after all runs: empty (clean).

### Issues
Critical: none.
Important: none. All 7 tests are load-bearing under a valid mutation.
Minor:
- Brief defect, not an implementer defect: Step 6's prescribed mutation (key `"world-host"` on the Map-branch div, GbcApp.tsx:324) does not make Test 6 fail. The World host already has `key="world-host"` (GbcApp.tsx:298), but the two branches place `GbcMapEditing` at different child positions (index 1 vs 2 because of the loading/placeholder sibling), so it still remounts and the tool still resets. Test 6 does fail under a real "tool survives" mutation (state held outside GbcMapEditing). Plan text for Task 6 reviewer mutation should be corrected for later tasks.
- App.tsx comment (l.136-148) describes rename refit as intentional; Test 3 now pins it. No action.
- Implementer report omits the "already covered" citations (see above).

### Assessment
✅ Spec-compliant. All seven characterisation tests are present, follow the brief verbatim or the two orchestrator rulings, touch tests only, and each fails under a source mutation of the line it pins (Test 6 needs a corrected mutation, noted). 0 Critical, 0 Important.
