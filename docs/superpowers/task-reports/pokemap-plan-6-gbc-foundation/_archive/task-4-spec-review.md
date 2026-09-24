# Plan 6 Task 4 — spec-compliance review (b2b716b + 58b4dd4 vs 1227a33)

Verdict: **❌ ISSUES (2)** + 6 ⚠️. Scanner itself proven correct on the whole corpus; both ❌ are small, targeted fixes.

## Gates
| Check | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm test` | ✅ 80 files / 844 tests |
| verbose asm/asmSplice/map | ✅ 92/92; both corpus tests executed (not skipped) |
| Subject porcelain after all runs | ✅ empty |
| PokeMap tree after mutations | ✅ only untracked report files |

## Per spec item
| # | Item | | Evidence |
|---|---|---|---|
| 1a | `scanCalls` shape/offsets/trim/comment/MACRO/CRLF/no-final-NL/whole-token | ✅ | Independent char-walk scanner (whole-text MACRO-range regex, no shared helpers) == `scanCalls` exactly (lineIndex + every {start,end,text}) for all 11 macros over 391+32+3 files: 0 mismatches, 44,460 args. Every arg: slice===text, no lead/trail ws, no `,;\r\n`, inside [lineStart,lineEnd), strictly ordered; line code-part `split(",")` reproduces args. |
| 1b | helpers moved, map.ts imports them | ✅ | map.ts imports `stripComment/stripMacroDefs/matchCall`; local copies deleted; Task 3 tests green. |
| 1c | **ONE implementation of comment-stripping and MACRO-skipping** | ❌ | See Issue 1. |
| 2a | `spliceArg` exact-span replace + refusals (argIndex OOR, empty, lead/trail ws, `,;\n\r`, stale) | ✅ | Code read; stale on *changed-length* edit also refused (verified directly: arg2/arg3 after widening arg0). |
| 2b | `locateCall` 0/>1 refusal | ✅ | Corpus: every map_attributes/map/map_const first arg locates uniquely (0 errors). |
| 2c | `locateNthCall` | ✅ | code correct incl. negative ordinal (untested, see W1). |
| 2d | `locateEventCall` label/trailing-space/missing/OOR | ⚠️→❌ | Offsets correct on 3,701 corpus event calls; **lineIndex wrong on 3,701/3,701** — Issue 2. |
| 2e | Minimal API, no insert/remove | ✅ | only 4 exports (+ `escapeRegExp` helper). |
| 3a | Unit tests listed | ✅ | all present (padding, comment, expression, legacy connection MACRO body, whole-token, CRLF, no-final-NL, each refusal). |
| 3b | Real-edit tests (warp x / border / tilecoll) prefix/suffix-only | ✅ | in-memory, asserts unchanged prefix/suffix. |
| 3c | Corpus no-op, file counts, per-macro pins, arg-count sets | ✅ | Re-measured independently: warp 1327, coord 114, bg 792, object 1468, scene_script 170, callback 105, map_attributes 391, connection 142, map 391, map_const 391, **tilecoll 2368** — all match. Arg sets match ({1,2} scene_script, 13 object, 8 map, 3 map_const, else 4). |
| 3d | No writes | ✅ | readFileSync only. |

## Issue 1 ❌ — two MACRO state machines + two comment strippers
- `stripMacroDefs` (asm.ts:38-54) and `scanCalls` (asm.ts:140-154) each carry their own `inMacro` machine; `scanCalls` also re-implements `stripComment` inline (asm.ts:156-157, `indexOf(";")`). Spec text: "ONE implementation of comment-stripping and MACRO-skipping". Offsets argument doesn't hold: `stripComment` returns a prefix (offset-preserving), and the MACRO decision is per-line.
- Already diverges: text ending in a lone `\r` (`"\twarp_event 1, 2, FOO, 3\r"`) — `scanCalls` finds it (splitLines strips `\r`), `stripMacroDefs`+`matchCall` don't (line keeps `\r`, `.` won't match it). No corpus impact (no CR anywhere), but it's the drift the rule exists to prevent.
- Minimal fix (asm.ts only, net −10ish lines):
  ```ts
  /** Non-MACRO-body lines with absolute spans. The one MACRO...ENDM skipper. */
  export function codeLines(text: string): { lineIndex: number; start: number; end: number; text: string }[] {
    let inMacro = false; const out = [];
    splitLines(text).forEach(({ start, end }, lineIndex) => {
      const line = text.slice(start, end);
      if (!inMacro && /^\s*MACRO\b/.test(line)) { inMacro = true; return; }
      if (inMacro) { if (/^\s*ENDM\b/.test(line)) inMacro = false; return; }
      out.push({ lineIndex, start, end, text: line });
    });
    return out;
  }
  export const stripMacroDefs = (text: string) => codeLines(text).map((l) => l.text);
  // scanCalls: for (const l of codeLines(text)) { const working = stripComment(l.text); ... }
  ```
  Existing tests (stripMacroDefs, map.ts CRLF/no-NL, corpus) cover the refactor.

## Issue 2 ❌ — `locateEventCall` returns tail-relative `lineIndex`
- asmSplice.ts:263 copies `call.lineIndex` from the scan of `text.slice(tailOffset)` unadjusted; `lineStart/lineEnd/args` are rebased, `lineIndex` isn't. Corpus: 3,701/3,701 event calls wrong (off by the label's line number). `AsmCall.lineIndex` contract = index in the scanned text; Plan 7 error messages/UI would point at wrong lines.
- Test "returns absolute offsets into the whole file" doesn't assert `lineIndex`.
- Fix: `lineIndex: call.lineIndex + (text.slice(0, tailOffset).match(/\n/g)?.length ?? 0)`, + one assertion in that test.

## Warnings (⚠️, not blocking)
- **W1 surviving mutants (test gaps)** — my mutation run (13 mutants, src reverted after each):
  | Mutant | Result |
  |---|---|
  | M1 no `\r` strip in splitLines | killed (CRLF test) |
  | M4 locateCall >1 not refused | killed |
  | M7 `;` allowed in value | killed |
  | M10 locateEventCall ignores label | killed |
  | M12 scanCalls MACRO skip removed | killed (unit + corpus) |
  | M13 stripMacroDefs ENDM never closes | killed |
  | M5 locateNthCall negative ordinal unchecked | **survived** (would return `undefined`, not a named refusal) |
  | M6 locateEventCall negative ordinal unchecked | **survived** |
  | M8 comment cut at `lastIndexOf(";")` | **survived** (corpus: 0 event lines with 2+ `;`, so corpus can't catch) |
  | M9 ws refusal spaces-only (`"\t9"` accepted) | **survived** |
  | M11 label regex `^Label:\s*` (drops one-line restriction) | **survived** |
  | M3 stale check only if same length | equivalent mutant (slice length always = end−start) — changed-length stale verified directly instead |
  Add: `ordinal -1` refusal for both locators; value `"\t9"`; comment containing a 2nd `;` (`; a ; b`) keeps last arg.
- **W2 label one-line restriction (asked)** — not test-proven. It *is* load-bearing: M11 mutant, given a label directly followed by the first call (`X_MapEvents:\n\twarp_event …`), loses ordinal 0 (sees 1 of 2). Corpus can't catch it: 391/391 labels are followed by `db 0, 0` (389 with `; filler`). Add that one fixture (+ CRLF variant).
- **W3 locateEventCall never stops at a following label** — scans to EOF (`X_MapEvents:` then `Y_MapEvents:` → X ordinal 1 returns Y's warp). Corpus: 0 labels after `_MapEvents:` in all 391 maps → harmless today; Plan 7 should refuse or bound at next label.
- **W4 empty arg silently dropped** — `foo 1,,3` → 2 args `["1","3"]`, shifting argIndex. Corpus: 0 occurrences. For a writer, refuse (G4) rather than renumber.
- **W5 corpus `reconstruct` check is tautological** — rebuilds from `arg.text`, which is by construction `text.slice(start,end)`; can't detect wrong-but-consistent spans. Independent-scanner comparison above closes that gap for this review; consider adding a line-code-part `split(",").trim()` comparison to the corpus test (cheap, non-circular).
- **W6** asmSplice.test.ts imports `GBC_SUBJECT_ROOT`, `hasGbcProject` unused.

## Corpus hunt (asked)
- Tabs after keyword: 0. Multi-space after keyword: 2,314 calls (handled). Tabs inside arg lists: 0. Calls with trailing comment: 2,790. Trailing ws on call lines: 0. No-final-newline files: 2 (CeruleanCave). CR anywhere: 0.
- Whole-token keyword occurrences NOT returned by `scanCalls` (incl. `Label: macro …` pattern): only `MACRO map_attributes`, `MACRO connection`, legacy `connection \1, \2, \3, (\4) - (\5)`, `fail "Invalid direction for 'connection'."`, `MACRO map`, `MACRO map_const` — all correct exclusions. 0 label-prefixed calls.
- connection: 142 real (143 raw incl. legacy MACRO-body line) ✅.
- File sets: 391 unique map INCLUDEs, 32 unique collision INCLUDEs ✅.

---

# Re-review 1 (58b4dd4 → 6e6cdc3)

Verdict: **✅ SPEC COMPLIANT.** Both ❌ fixed; all 6 ⚠️ addressed; 2 new non-blocking notes.

## Gates
| Check | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm test` | ✅ 80 files / 856 tests |
| gbc verbose | ✅ 137/137; both corpus tests executed, not skipped |
| Independent scanner vs `scanCalls`, whole corpus (re-run) | ✅ 0 mismatches, 44,460 args, all span invariants hold; counts unchanged (tilecoll 2368, connection 142, …); not-scanned set unchanged (only MACRO heads, legacy body line, `fail` string) |
| `locateEventCall` corpus sweep | ✅ 3,701/3,701 offsets+args match; **lineIndex wrong 0** (was 3,701) |
| `locateCall` uniqueness (map_attributes/map/map_const) | ✅ 0 errors |
| Trees | ✅ PokeMap: only untracked reports; PerfPlus porcelain empty |

## Per item
| Item | | Evidence |
|---|---|---|
| Issue 1 single MACRO skipper + single stripComment | ✅ | `codeLines` = sole `inMacro` machine; `stripMacroDefs` = `codeLines().map(text)`; `scanCalls` iterates `codeLines` + calls `stripComment`. grep: no other MACRO/ENDM or `indexOf(";")` in gbc src. Lone-`\r` divergence gone (`stripMacroDefs("a\r")` → `["a"]`); regression test present. Mutants N9 (no MACRO skip) killed ×14, N10 (keep `\r`) killed ×2. |
| Issue 2 absolute lineIndex + assertion | ✅ | `+ linesBeforeTail`; asserted (=4) + tight-label LF/CRLF (=1). Own CRLF probe with blank line: 4 ✓. N7 (rebase removed) / N8 (off-by-one) killed ×3 each. |
| W1 negative ordinals / `"\t9"` / `; a ; b` | ✅ | M5, M6, M8, M9 now killed. |
| W2 label-then-call LF + CRLF | ✅ | M11 (`^Label:\s*`) now killed ×2. |
| W3 bound at next label + test | ✅ | N1 (bound removed), N2 (bound requires `::`) killed. Bounds on `Bar:`, `Bar::`, `Bar: ; c`, `Bar:\t`, `Bar:\r`, CRLF. |
| W4 empty arg refused, corpus clean | ✅ | `1,,3`, `1, , 3`, `1,2,` refuse; commas inside comment don't. Corpus test green ⇒ 0 real blank slots. N4 (silent drop) killed ×4, N5 (trailing comma allowed) killed ×2. `splitArgs` now shares the refusal → map.ts parsers also refuse; Task 3 corpus tests stay green. |
| W5 non-circular corpus check | ✅ | Recomputes args from raw line (`stripComment` + keyword regex + `split(",")`, no blank filtering), never reads `call.args` offsets. Couldn't build a mutant that reaches it: every wrong-span mutant tried (N11 trailing ws in span) is already caught first by `spliceArg`'s own whitespace/stale refusals inside the no-op loop. Belt-and-braces; my independent scanner covers the same ground. |
| W6 unused imports | ✅ | removed; typecheck clean. |

## Surviving mutants (non-blocking)
| Mutant | Why OK / note |
|---|---|
| N3 bound slices *through* the next label line | near-equivalent: a bare label line never holds a call. |
| N6 whitespace-only `rest` refused instead of `[]` | untested: `matchCall("\tnewgroup  ", …)` → `[]` is the only path, and the corpus has none. Optional one-line test. |

## New notes (⚠️, non-blocking)
- W3 boundary does **not** bound on `.local:`, `Bar: db 0` (label + code), or an indented label. Corpus has 0 labels of any kind after `_MapEvents:`, so no effect now; Plan 7 insert/remove should note it.
- Blank-arg refusal message is `splitArgs: blank argument in "1,,3" …`. It gives no file, line or macro, and one bad line makes `scanCalls` throw for the whole file. That's fine for G4. Plan 7's UI may want the line number, which callers can add.
