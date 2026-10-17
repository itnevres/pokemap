# Task 1 code-quality review (ea3693c..b92088e)

Verdict: Approved (no Critical/Important issues; minor cleanups recommended).
Method: read the review package diff; one grep for leftover confirm/GUARD_TEXT/stale policy comments. Read-only.

## Critical
None.

## Important
None.

## Minor
1. Stale comments contradicting new behavior (all left in committed code):
   - gba/adapter.tsx:52-53 still says "GBA's switch policy: confirm when dirty ... server session is never discarded here" and "sameMap is ignored on purpose ... tree re-click prompts too"; the new "Plan 10a supersedes" line sits directly under them. Delete the two old lines.
   - gbc/adapter.tsx:53-57 block still describes "GBA's exact confirm, then the server session is discarded BEFORE the switch" and "A failed discard keeps the user on the map"; that logic now lives in FamilyApp. Only the sameMap sentence is still true.
   - shell/FamilyApp.tsx:89 "GBA prompts even for the selected map; GBC does not" is contradicted by the next line (301) added in the same diff. Delete line 89.
   - App.test.tsx:498-499 "Plan 9 characterisation ... even the ALREADY-selected map prompts ... GBA never calls the server's discard" is left above the new "supersedes" comment and the renamed test; keep only the supersedes note.
   - App.test.tsx:473-474 "Cancelled (confirm -> false)" comment now describes a removed mechanism.
   - FamilyApp.tsx ~line 317 "must not raise the 'discard and switch' confirm" mildly stale wording.
2. Duplicated adapter logic: both adapters now have an identical `leave` (`sameMap || !isDirty ? go() : requestPrompt(go)`), identical `switchError` useState + identical dismissible banner JSX, and identical `setSwitchError` plumbing through FamilyRuntime. R7 says the shell owns the prompt; the shell could equally own `leave`'s dirty/sameMap branch and the switchError state/banner (adapters would only supply session + strokeSettled). Not a defect, but the duplication was introduced by this task (GBA banner is a copy of GBC's, using "x" vs the GBC "x" glyph, a small inconsistency).
3. Dead code: none found. GUARD_TEXT removed from both adapters and GbcAppWorldGuard test; remaining window.confirm uses are the unrelated "Discard Changes" button tests. `switchInFlight` and `switchPending` refs plus `switchBusy` state are three overlapping flags; they are each justified by comments/behavior but `switchBusy` could be derived on render if the refs were state-free. Not worth changing now.
4. Test quality:
   - Strong: "discard waits for queued stroke link" flushes microtasks with `await act(async () => {})` before its negative assertions, so it would fail against the old code (and the coordinator's mutation confirms). Positive control present in "no prompt when clean or same map" and the App.test world re-click test.
   - Weak spot: "prompts on dirty switch; Cancel ..." asserts `settled` not called and no new fetches synchronously right after click("Cancel") with no microtask flush; a regression that started a discard asynchronously on Cancel would not be caught. Add `await act(async () => {})` before those negative assertions.
   - Weak spot: older moved tests (AppContextEdit, AppWorldContextMenu, GbcAppContext cancel cases) assert "stays on map" synchronously after Cancel; fine for a sync Cancel but they would also pass if Cancel were a no-op that never closed the dialog (they never assert the dialog is gone). Minor.
   - "second switch while prompt open is ignored" would still pass if the second click merely replaced the pending target as long as Discard ended on names[1]... actually it asserts status == names[1], so replacement by names[2] is caught; OK.
   - `waitFor` uses are all on genuinely async conditions; none on already-true conditions.
5. SwitchPromptDialog test: first test clicks Cancel then fires Escape and expects onCancel x2; fine. The component has no focus trap beyond aria-modal/autoFocus; acceptable per spec R1.
