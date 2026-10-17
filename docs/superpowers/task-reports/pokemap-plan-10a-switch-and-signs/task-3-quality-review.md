# Task 3 code-quality review (diff 29dac15..a54d82e)

Verdict: Approved (no Critical/Important; minor items below).

## Findings
- Minor: replaceLines (asmSplice.ts) re-derives EOL with `text.match(/\r?\n/)` (first EOL wins) while the same file already has `eolOf` (any CRLF wins, documented ponytail). Two policies in one file; mixed-EOL file gets LF from replaceLines but CRLF from insertLineAfter. Reuse eolOf.
- Minor: signs.ts `code()` is a second comment stripper beside asm.ts `stripComment`; justified by its comment (quoted semicolons), but note stripComment's limitation or fold the quote-aware version into asm.ts for reuse by Task 4 (GBA will need similar).
- Minor: replaceLines uses its own line chunking regex rather than codeLines/splitLines; fine but a lone-CR is handled differently from terminatorAt's documented stance (not a terminator) - consistent in effect, undocumented.
- Minor: findGbcSign uses `lines.indexOf(scripts[0]!)` (use findIndex), re-splits `rawLines` while codeLines already has spans; `reason` "unsupported text command done" for an empty-paragraph done and "...missing done" read oddly (reason strings are brief-mandated, so leave).
- Minor: updateGbcSign `block` arg is used only for scriptLabel/marker and the body is re-read from `text` (good: stale-block test covers it); `unchanged` via JSON.stringify is fine.
- Minor (tests): writeGate B7 hardcodes `added` length 9 (8 block lines + 1 bg_event) with no comment; imports `parseMapEvents` in a second import line from the same module as `scanObjectConsts`; `it.each` titles embed whole source text (noisy). x/y fixed at 0,0 so reparse check does not exercise distinct coordinates.
- Minor (tests): no direct test that replaceLines mixed-EOL file or marker-already-present with mode-only change keeps bytes; covered indirectly. Greedy line-diff in B7 is sound (identical lines are interchangeable byte-wise).
- Hygiene OK: corpus tests only readFileSync; B7 works on in-memory snapshots of the temp copy; B1 golden is hand-written; hash vectors (811c9dc5, 4f9f2cab) are correct FNV-1a.
- No dead code found; no over-engineering; SignMode/SignBlock defined once in marker.ts per R-c.
