# Task 3 spec-compliance review (Plan 10a, High risk)

Commit reviewed: a54d82e (vs 29dac15). Inputs: brief, dispatch rulings R-a/R-b/R-c, spec S3/S6/S7/S8/S9a/S10, implementer report.

## Verdict: Spec PASS (no Critical/Important findings; 3 Minor)

## Independent re-derivation

- **Golden B1 by hand against S8.** Expected Tiny output = original lines up to the blank line, then `TinyPokemapSign1:`,
  `\tjumptext TinyPokemapSign1Text`, blank, `; pokemap:sign free <h>`, `TinyPokemapSign1Text:`, `\ttext "HELLO"`,
  `\tdone`, blank, `Tiny_MapEvents:` ... . Matches S8 order, tab indent, one trailing blank line, placement directly
  above `<Map>_MapEvents:`. Hash recomputed in Python (FNV-1a 32 over bytes `\ttext "HELLO"\n\tdone\n`) = `11eed898`,
  equal to the fixture literal. `signHash("hello")` = `4f9f2cab` also recomputed. The CRLF/no-final-newline variant is a
  pure `\n`->`\r\n` transform of a hand-written string; the code's CRLF marker hash equals the LF one (normalisation).
- **findGbcSign against real PerfPlus (all 391 `maps/*.asm`, every `bg_event` script; tsx probe, read-only):**
  353 editable, 438 `script is not a single jumptext`, 1 `unsupported text command if` (CeladonCityGameCornerSign,
  body wrapped in `if DEF(_CRYSTAL_AU)` - correct refusal). For all 353: body equals an independent slice
  "lines after `X:` through first `done`" byte-for-byte; adoption with unchanged paragraphs differs from source by
  exactly one inserted marker line. No refused sign had a plain single-`jumptext` script except the `if` one.
- **Cross-reference sweep:** for the 353 editable text labels, every `.asm` in PerfPlus (all dirs) searched for the
  label in any line other than its definition and its sign's `jumptext`: 0 hits. So no real shared/`text_far`/cross-file
  counterexample exists in the subject.
- **Route29Sign1:** source is LF, `jumptext Route29Sign1Text`; test asserts exact paragraphs
  `[["ROUTE 29"],["CHERRYGROVE CITY -","NEW BARK TOWN"]]` and marker-only adoption. Passes.
- **Synthetic edge probes:** `text_ram` -> `unsupported text command text_ram`; `text_end` -> `... text_end`;
  `prompt` (test) -> `... prompt`; local `.x:` inside body -> refused (`... missing done`); `SignText::` -> `text label not
  found in this file`; body ends at the first `done` (a second `done` is outside the body, per S7).
- **Reason strings** match the brief verbatim: `script is not a single jumptext`, `text label not found in this file`,
  `shared text`, `unsupported text command <cmd>`; `hand-edited`; `missing <Map>_MapEvents: label`.
- **Line endings / final newline:** `replaceLines` uses the first EOL, keeps untouched bytes and final-newline state
  (8 parameterised cases incl. mixed EOL, EOF insert, delete-to-empty). Update on CRLF source without final newline
  keeps no final newline and re-hashes the EOF body correctly (tested).
- **R-a:** baseline = marker hash else `opts.baselineHash`; none -> `hand-edited` unless force; current body re-read
  (stale block cannot bypass); missing terminator refuses even with force (S7 "counts as hand-edited"). Unchanged
  paragraphs keep body bytes and only add/update the marker (S6/B6).
- **R-b / G5 not tautological:** the B7 case inserts in memory on every map of both roots (`checked === pins.maps`),
  asserts `parseMapEvents` gives exactly one more bg event with x 0, y 0 and the new script, and that the original
  lines (with terminators) are an in-order subsequence of the edited lines with exactly 9 additions. Mutation run by me:
  insertGbcSign made to overwrite the line above the anchor (non-additive edit) -> B7 fails on both roots (2 failed).
  File restored byte-exact (sha256 be706bf7...; blob 429f59e matches HEAD). Note: the final `undone === text` byte
  check is implied by the subsequence match and adds nothing on its own; the cursor and 9-line assertions carry the proof.
- **R-c:** `SignMode` and `SignBlock` defined only in `signs/marker.ts`; `gbc/signs.ts` imports them.
- Focused run (vitest CLI works here): 3 files, 45/45 pass, corpus tests not skipped.

## Findings

Minor:
1. `shared text` counts only `jumptext`/`writetext`/`text_far` (exactly as the brief says), but S6 says "no other
   script references". Probed: a second reference via `jumptextfaceplayer X`, `farwritetext X` or `dw X` leaves the
   sign editable, and an Update would also change that other script's text. No instance in PerfPlus (0 hits over every
   `.asm`), so latent. Suggest counting any code-line occurrence of `\bX\b` other than the `X:` definition.
2. Two `<Map>_MapEvents:` anchors also throw `missing <Map>_MapEvents: label`, which misnames the cause. S10's
   "located refusal (file, line, fix)" is not present in this layer; acceptable if Task 6 wraps it, otherwise open.
3. G5 `undone` byte-equality line is redundant (see above); not a defect, just not extra evidence.

No Critical or Important findings. No tracked file changed by this review; decomp never written.
