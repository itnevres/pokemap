# Task 2 re-review 2 (fix ebd5534)
C2 apostrophe regression: ADDRESSED.
New breakage in fix diff: none.

Evidence: parseGbaCharmap now uses /^('(?:\.|[^'\])+'|\S+)\s*=\s*(.*)$/ (escape-aware). Probe on the real charmap.txt
(temporary test, removed): has("'")=true, has(" ")=true, has("=")=true, has("A")=true. Backslash escapes in the file:
line 88 '\'' (now parsed), lines 1457-1459 '\l' '\p' '\n' (control escapes, still not tokens: has("\n")=false, same as before;
no double-quote or backslash entry exists in the file). Non-quoted named tokens (e.g. PKMN = 53 54) match via \S+.
signs tests: 6 files / 53 tests pass. New tests (has("'"), wrap "DON'T") present; 43-char comment corrected, expected values unchanged.
Tracked files unchanged.
