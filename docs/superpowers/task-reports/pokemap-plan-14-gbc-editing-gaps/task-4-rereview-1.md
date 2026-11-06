VERDICT: OPEN FINDINGS

Reviewed `01b8c27..91dd5ea`. Paths below are relative to the worktree.

| Round-1 finding | Status | Evidence |
|---|---|---|
| Spec 1: structured `path`/`name` | ADDRESSED | `packages/core/src/write/guards.ts:5` declares both fields; GBA `write/save.ts:26` and GBC `gbc/write/save.ts:32` populate them through helpers used by plan and commit. Assertions: `test/write/save.test.ts:305`, `test/gbc/write/save.test.ts:300`. |
| Spec 2: map/file context | ADDRESSED | GBA `src/write/save.ts:28` and GBC `src/gbc/write/save.ts:34` include map and file. GBA commit includes map at `src/write/save.ts:320`; GBC format remains at `src/gbc/write/save.ts:236`. GBA commit assertion: `test/write/save.test.ts:326`. |
| Spec 3: indented `#define` | ADDRESSED | `src/addEvent/names.ts:13` accepts horizontal whitespace. Space/tab regressions: `test/addEvent/names.test.ts:35` and `:40`. |
| Spec 4: block comments | PARTIAL | `src/addEvent/names.ts:46` handles ordinary multiline comments; coverage at `test/addEvent/names.test.ts:65` and `:70`. Token concatenation and escaped-string state still corrupt extraction; see below. |
| Spec 5: GBC `EVENT_` scenario | ADDRESSED | `test/gbc/write/save.test.ts:382` stages `EVENT_POKEMAP_TEST`, flips the argument-sensitive checker (`:273`, `:409`), checks constants/map/blocks unchanged (`:414`), and verifies successful constant writing (`:435`). |
| Quality 1: comment handling | PARTIAL | Same remaining scanner defects as Spec 4. The original same-line example `/* note */ #define FLAG_X 1` now extracts correctly, confirmed by an in-memory probe. |
| Quality 2: indented directives | ADDRESSED | `src/addEvent/names.ts:13`; regression coverage at `test/addEvent/names.test.ts:35`. |
| Quality 3: refusal contract/context | ADDRESSED | Shared refusal constructors at `src/write/save.ts:23` and `src/gbc/write/save.ts:29`; GBA error at `src/write/save.ts:320`. |
| Quality 4: unused test bindings | ADDRESSED | Removed fake `calls`/`wrapping` fields and unused destructuring: `test/write/save.test.ts:274`, `:318`; `test/gbc/write/save.test.ts:269`, `:313`. |

New **Important** regressions:

1. **Block-comment deletion joins distinct C tokens.** `packages/core/src/addEvent/names.ts:68` removes comments without inserting whitespace. Valid input `#define FLAG_/**/X 1` defines `FLAG_` with replacement text `X 1`; extraction now returns `FLAG_X`. The original commit returned `FLAG_`. This misses an existing name and invents another, allowing duplicate-name selection or false refusals. Replace comments with whitespace while preserving newlines; add this regression.

2. **Escaped backslashes leave string state open and can swallow subsequent definitions.** `packages/core/src/addEvent/names.ts:60` checks only the immediately preceding character, so a quote after two backslashes incorrectly remains escaped. This valid C input reproduces the regression:

   ```c
   #define SLASH "\\"
   #define TEXT "/*"
   #define FLAG_REAL 1
   ```

   Original extraction returns `SLASH`, `TEXT`, `FLAG_REAL`; the fix returns only `SLASH`, `TEXT`. The second opening quote incorrectly closes the previous string, then `/*` starts a comment that consumes the remaining definitions. Handle escape parity or consume escaped pairs. The same defective quote predicate exists in the GBC scanner at `:115`, although this definition-loss reproducer is GBA-specific.

Both regressions were reproduced against original and fixed source using read-only, in-memory TypeScript transpilation—not vitest. Conductor evidence remains reported: focused 285/285, server+CLI 475/475, clean tsc, no pre-task test lines removed, and the three stated mutation checks red.