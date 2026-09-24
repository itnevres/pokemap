# Plan 6 Task 4 — code-quality review (1227a33 → 6e6cdc3)

Verdict: **APPROVED**. Spec compliance already adversarially verified (corpus round-trip, mutation testing). This pass covers ergonomics/duplication/perf/tests only. 0 Critical, 0 Important, 4 Minor (all optional, none blocking).

## Gates
| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 80 files / 856 tests passed |
| `npx vitest run packages/core/test/gbc --reporter=verbose` | 6 files / 137 tests, 771ms total; corpus round-trip test (391 maps + 32 collision files, ~5000 calls, ~40k no-op splices) = 341ms — no perf trap |

## Files reviewed
`gbc/load/asm.ts` (new, 177 lines), `gbc/load/map.ts` (diff only: 3 local helpers deleted, imports from asm.ts), `gbc/write/asmSplice.ts` (new, 111 lines), `test/gbc/load/asm.test.ts` (149 lines), `test/gbc/write/asmSplice.test.ts` (350 lines).

## Findings

**Minor 1 — duplicated ordinal-bound-check.** `locateNthCall` (asmSplice.ts:59-65) and `locateEventCall` (asmSplice.ts:98-101) both do `if (ordinal < 0 || ordinal >= matches.length) throw ...`, same shape, different message text (one names the macro, one names the label). ~4 lines duplicated. Could extract `pickOrdinal(matches, ordinal, subject): AsmCall` but the two call sites' messages differ meaningfully enough (`"...call(s)"` vs `"...call(s) after "${label}:""`) that a shared helper would need a message-template param, which is barely smaller than the status quo. Not worth doing unless a 3rd locator shows up in Plan 7.

**Minor 2 — refusal messages lack file/map context.** `spliceArg`'s three refusals (asmSplice.ts:22-33, 38-41) and `locateNthCall`'s (asmSplice.ts:62) name argIndex/value/ordinal/macro but never a file path or map name — `AsmCall` carries no such field. For a batch operation across many maps (Plan 7's actual use case), the error alone won't say which file failed; the caller must wrap. This is scope-appropriate (this module works on in-memory strings, not files) and is already called out as non-blocking in the spec review's re-review notes (task-4-spec-review.md line 122). No action needed here; flagging so Plan 7's implementer remembers to wrap with file context rather than surfacing these raw to a UI.

**Minor 3 — `locateEventCall` bundles five responsibilities in one function** (asmSplice.ts:82-111): find label line → compute tail offset → bound tail at next label → scan+pick ordinal → rebase every offset back to absolute. It's cohesive (all steps exist only to support the final rebase) and is exhaustively tested (9 cases in asmSplice.test.ts:147-219), so no change needed now. If Plan 7's event parser (which the module header says will reuse `scanCalls`/`codeLines`) needs the "bound at next label" logic standalone, extract it then rather than pre-emptively splitting today.

**Minor 4 — regex re-compiled per call, not hoisted.** `scanCalls` (asm.ts:162) and `matchCall` (asm.ts:130) build a `new RegExp(...)` on every invocation rather than caching per keyword/macro. At current scale (measured: 341ms for the whole corpus sweep) this is not a real cost — V8's RegExp compile is cheap and this isn't a per-line loop, it's a per-call-to-scanCalls cost. Only worth revisiting if a future caller invokes `scanCalls`/`matchCall` in a tight per-line loop across many files repeatedly (not the current shape).

## What's good
- `codeLines` is genuinely the single MACRO/ENDM state machine now; `stripMacroDefs` and `scanCalls` are both thin wrappers over it (confirmed by grep: no other `inMacro`/`ENDM` logic in `gbc/`). Fixes the Task 4 spec-review Issue 1 divergence (lone-`\r` handling) cleanly.
- `spliceArg`/`locateCall`/`locateNthCall`/`locateEventCall` refusal style matches `write/jsonEdit.ts`'s convention exactly: throw, name the offending value/index, explain why (G4 "refuse rather than guess"). Comment density matches too (multi-line doc comments explaining the *why*, not just the *what*).
- `AsmArg`/`AsmCall`/`CodeLine` shapes (`start`/`end`/`text`) mirror `jsonEdit.ts`'s `Span` — consistent vocabulary across GBA and GBC write paths.
- `codeLines`/`AsmArg` are exported but not yet consumed outside `asm.ts` itself — not dead code: the module header explicitly earmarks them for Task 5 (collision/palette-map parsing) and Task 7 (event parser). Verified via grep, no other candidate use today.
- No dead exports, no stale fix-round leftovers (checked the 58b4dd4→6e6cdc3 diff against the spec-review's W6 unused-import finding — already removed).
- Test files are long (350 lines for asmSplice.test.ts) but organized into clear `describe` blocks matching the module's own function boundaries; consistent with this repo's existing corpus-test style (e.g. `write/corpus.test.ts` at similar length). Not flagging as over-long.

## Not re-litigated
Everything the spec review already covers with corpus/mutation evidence (span correctness, MACRO skipping, CRLF/no-final-newline, blank-arg refusal, `lineIndex` rebasing, label-boundary behavior) — re-reading the code confirms it matches; no independent re-derivation performed here since this review's remit is quality, not correctness.
