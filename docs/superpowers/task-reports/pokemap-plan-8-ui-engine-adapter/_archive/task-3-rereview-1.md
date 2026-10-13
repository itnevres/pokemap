# Task 3 re-review 1 (fix round 1, 474dc66)

Verdict: ADDRESSED.

Evidence (diff + App.tsx:139-142 + Toolbar.tsx:92):
- New test in AppContextStroke.test.tsx only (plus tidy edits in the GBC twin). No production diff.
- Dirty state is real: paint via App/canvas path, waits for dirty-indicator and /paint/end before switching.
- Mode switch to Map: asserts overlay null, no "Save changes" dialog (after `await act(async()=>{})`), dirty-indicator present (Toolbar renders it from editSession.isDirty in map mode). Covers all three required assertions. Extra: Dungeon switch from re-entered context, return to Map still dirty, window.confirm never called.
- Mutant (requestExit instead of leaveContext) leaves overlay mounted, so the first assertion catches it; matches reported RED at test line 180.
- Tidy: unused describe/within/chrome/StrictMode imports and helpers removed; headers rewritten. grep confirms none remain in either file.

New breakage: Critical 0, Important 0, Minor 1.
- Minor: AppContextStroke.test.tsx (new test, "no Save changes dialog" checks) use a single `await act(async () => {})` flush. For a mutant that leaves context AND later opens the dialog asynchronously, the negative could pass early. Not relevant to the stated mutant (overlay assertion kills it); a `waitFor`-then-absent or extra flush would harden it.

Deferred (out of scope): none beyond the above.
