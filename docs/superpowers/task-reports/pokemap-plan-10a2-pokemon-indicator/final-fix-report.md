# Final review fix wave

Base: 3c31c8c4184d1a0f47647cc7382c1fc034a401ff (clean scratch worktree).
Scope: exactly F1-F3, their existing test files, and this report.
Risk: high because F2 parses source and F3 handles an external error response.
Execution: direct scoped Codex fix wave under the supplied complete brief; no Anthropic use or unrelated edits.

Changes:
- F1: check every word width before line placement, preserving the exact refusal text.
- F2: share the allocator's comment/string stripping with the write guard; only line-start definitions collide, including either colon form, trailing comments and inline commands.
- F3: validated suggestion refusals use the existing refusal state/rendering, including message, subject and fix. Hide the loading message once refusals arrive; retain the generic fallback for other bodies.

Added 10 regression cases without changing existing test bodies or fixtures:
- Two overlong later-word cases, including after an exactly full wrapped line.
- Seven label cases: comments, strings, escaped quotes, single/double colons, inline command, and a different label with the same suffix.
- One suggestions GET 400 refusal case asserting message, subject, fix, no generic/loading message, and no completion callback.

Verification:
- PASS: focused Node runtime checks loaded actual TypeScript sources using the existing main checkout's TypeScript compiler. Checked F1 later-word refusals and valid wrapping, all seven F2 cases, and F3 rendered DOM via React Testing Library/jsdom.
- PASS: the same harness loaded baseline HEAD sources in memory and reproduced all three findings (later word accepted, commented label refused, and suggestion refusal collapsed to generic error). No source mutation was left on disk.
- PASS: git diff --check. Byte checks confirm CRLF throughout all six changed working files, append-only test additions, and preserved non-ASCII UTF-8 sequences. Edits used byte replacements, preserving untouched text.
- BLOCKED: targeted Vitest and full Vitest gate both fail before collection: esbuild cannot read ancestor directories (Access is denied) or resolve this worktree's vitest.config.ts. No suite pass/fail/file counts are available. An initial npx attempt was interrupted without a result; no dependency installation was performed.
- BLOCKED: npm run typecheck cannot find tsc, npm run build --workspace packages/ui cannot find vite (no local node_modules). Calling the main checkout's tsc directly also fails TS2688 (cannot find node type definitions).
- Live application acceptance was not run. The focused UI check rendered the actual dialog in jsdom; it does not replace a real-app check.

Coordinator follow-up: run the added tests, full gate, typecheck, UI build, and real-app suggestion-failure check in the normal environment. No unrelated bugs were found during this bounded fix wave.

Commit blocker: git add and git commit both failed because Git cannot create C:/Programming Projects/PokeMap/.git/worktrees/wt-final/index.lock (Permission denied). The linked worktree metadata is outside the writable sandbox. No commit was created; all scoped changes and this report remain saved in the working tree. Intended message: fix(indicator): address final review refusals and label detection.
