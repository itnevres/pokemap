# Task 8 report: symbol-failure path (F13)

Tier: Low (one server line, one test). Implementer: Anthropic direct, inline. Reason: a tiny change (3 source lines in 1 file), and Codex was at its usage limit.

## Change

`packages/server/src/projectSymbols.ts` `check()`: when the symbol-index build fails, the `incomplete` entry has `file: "."` (was the absolute root). Its reason replaces every occurrence of the root in the error message with `.`.

## Test

`packages/server/test/projectSymbols.test.ts` (both families, existing backoff test). The expected entry is now `{ file: ".", … }`. A new assertion pins the exact reason: `C7-C9 symbol checks unavailable: ENOENT: no such file or directory, scandir '.'`.

Red runs:
- Old code: 2 failed (`file` was `C:\Users\…\pokemap-symbol-retry-…\project`).
- With only `file` fixed: 2 failed. The reason still held the absolute root (`scandir 'C:\Users\…\project'`). This proves the error message really carries the root.

Related server tests pass: `projectSymbols`, `gbcDefectIsolation` and `api`, 43 tests.

## Gate

3,528 pass / 0 fail / 218 files; typecheck and UI build pass (run together with the Task 7 review fixes).

## Final-review fix (M1)

The strip also removes the normalized root with trailing separators trimmed, so a root given as `C:/…/` or with a trailing separator no longer leaks. New test; red on the code above (reason held `C:\…\project\`). Gate: 3,529 pass / 0 fail / 218 files; typecheck and UI build pass.
