# Task 2 code-quality review (d92c5b1 vs b1732da)
Verdict: NOT APPROVED

## Critical / Important
1. charmap.ts:45 `GBA_DISALLOWED_CHARS = new Set(["$", "\n", "\l", "\p"])`: in a JS/TS string literal `"\l"` is just `"l"` and `"\p"` is just `"p"`. Combined with `unescapeQuoted` (which turns `'l'` and `'\l'` alike into "l"), real GBA letters `l` and `p` are silently dropped from the charmap, so any sign text containing lowercase l or p is refused ("not in the charmap"). The `\n` entry never matches either (unescape of `'\n'` yields "n", not a newline); it only works by accident. No test covers it: the GBA tests only check `A`, `$`, and `"\n"` (the last passes trivially). Fix: handle the `\l`, `\p`, `\n` charmap lines by testing the raw left-hand text (`'\\l'`, `'\\p'`, `'\\n'`) before unescaping, and add a test that `has("l")` and `has("p")` are true.
2. charmap.ts:38-42 GBC widths: spec S9a names `<PK>` and `<MN>` as fixed-width tokens (2 each); the code instead lists `<PKMN>: 2`, so `<PK>` and `<MN>` count as 1. Confirm against the real charmap and align; no test covers any fixed-width token other than `<PLAYER>`.

## Minor
3. charmap.ts:61-70 width if/else-if chain: all three branches assign 1 (dead branching). Replace with `GBC_TOKEN_WIDTHS[token] ?? 1`.
4. charmap.ts: `tokenize` duplicates the `<...>` and `{...}` branches verbatim; parameterize on the closing delimiter. The two parse functions also duplicate the `Charmap` object construction (`has`/`widthOf`); extract a `makeCharmap(family, widths)` helper.
5. charmap.ts:21-35 `GBC_CONTROL_TOKENS` is a hard-coded exclusion list; fine per S3 (`@` refused), but `<LINE>/<CONT>/<DONE>/<PROMPT>` etc. are not asserted by any test (only `@`, `<LF>`, `<PARA>`).
6. wrap.ts: tokenize + width-sum is written twice (whole line, then per word); add a `widthOf(tokens)` helper. `words.length === 0` branch is effectively dead except for whitespace-only over-wide lines (pushed unwrapped). `import { Charmap, ... }` should be `import type` for the interface if the repo uses verbatimModuleSyntax/isolatedModules (check tsconfig; typecheck not run here).
7. Tests: wrap.test.ts has 4 real-corpus tests that duplicate the inline-charmap tests one-to-one (low added value, skipped without corpus); no GBA wrap test, no GBA `$` refusal test, no unterminated-token (`<ABC`) test, no wrap case that needs 3+ lines or a multi-space input. charmap.test `has("\n")` false is vacuous (see 1).
8. Tests with `if (...) throw` guards are fine but verbose; a tiny `ok(result)` helper would shorten them. Style otherwise consistent with script.ts (named exports, plain functions, no comments of note).

## Test-strength notes
- Wrap tests do discriminate width 7 vs 1 for `<PLAYER>` (second fixture) and the three reported mutations on wrap.ts are credible kills. I judge the coordinator's fixture ruling correct: HI(2)+1+7+1+HOW(3)+1+ARE(3) = 18 fits, so `[["HI <PLAYER> HOW ARE","YOU"]]` is right.
- Charmap parsing has no mutation coverage; finding 1 shows a real defect the tests would not catch.
