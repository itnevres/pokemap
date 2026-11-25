# Plan H P1 combined review (ESLint) - commit 459cf1a

Verdict: APPROVED with 4 Minor notes (none blocking). `npx eslint .` ran clean (exit 0, "No issues found") on the worktree.

## Spec checklist

| Criterion | Status | Evidence |
|---|---|---|
| ESLint + typescript-eslint + react-hooks configured | met | eslint.config.js:5-8, 17-18, 36-40 |
| Current code passes `npx eslint .` | met | run in this review, exit 0 |
| No formatter rules / churn | met | no stylistic rules; source diff is 3 one-line edits |
| No rule needing >20 line edits left on | met (per the author's counts) | off rules at eslint.config.js:29-30, 40, 47-52 |
| Files: eslint.config.js, root package.json, lockfile | met | `git show --stat 459cf1a`: 6 files, only these plus 3 tiny src edits |
| `lint` script | met | package.json `"lint": "eslint ."` |
| Config independent of local-only state | met | no tsconfig / parserOptions.project, no absolute paths, no env reads; only committed devDeps |
| Source edits only if tiny | met | see section 1 |

Note on the stat: `git diff origin/master --stat` also shows a plan-14a doc deletion. That is origin/master having moved ahead of the branch base, not part of this commit (`git show --stat 459cf1a` has only the 6 files).

## 1. The source edits

1. `packages/core/src/write/jsonEdit.ts:214`: `/["{[\-0-9tfn]/` vs `/["{\[\-0-9tfn]/`. Behavior-preserving. Inside a character class without the `v` flag (no flags on this literal), `[` is a literal and `\[` is the same literal. The `\-` is kept as a literal hyphen. Same char set.
2. `packages/server/src/blockEditOwnership.ts:38`: `TilesetFileEdit` was a type-only import. A grep of the file finds no other use, and a type import has no runtime effect. Safe.
3. `packages/ui/src/shared/AddEventDialog.tsx:253` (was `textKeys` at old line 218): the const was `["seen","beaten","after"] as const`. The inline union `"seen" | "beaten" | "after"` has the same three keys and the call site (line 254) calls `text("seen")`, `text("beaten")`, `text("after")`. `grep textKeys` on the file now returns nothing, so there is no other user. The template-literal index `values[\`${key}Mode\`]` types identically. Safe.
4. `packages/cli/src/index.ts:186` was not edited. It is the one site that relies on `ignoreRestSiblings: true` (eslint.config.js:26). It destructures `connections, objectEvents, warpEvents, coordEvents, bgEvents, ...header` purely to drop keys, and none of the five is used afterwards. Confirmed correct. `gbcCommands.ts:146` and `duplicateEvent.ts:26` use the `_` prefix and are covered by `varsIgnorePattern`. Note the `_` prefix pattern is also configured, so two mechanisms coexist; harmless.

## 2. Config sanity

Flat config shape is valid. `tseslint.config(...)` is passed a global `ignores` object first (eslint.config.js:11-14, an object with only `ignores`, so it is global), then `linterOptions`, then the base sets, then scoped overrides. Ordering is right: the overrides come after `js.configs.recommended` and `tseslint.configs.recommended`, so they win.

Scoping:
- `no-undef` off (line 24) is applied to all ts/js files. This is typescript-eslint's own advice for TS files. For the `.mjs`/`.js` files (scripts/launch.mjs, packages/core/bench/*.mjs, .js config) the check is lost, but globals.node is set so they are only missing "undeclared variable" detection, which `tsc` also does not cover for plain JS here. Minor (see M2).
- react-hooks plugin and browser globals are scoped to `packages/ui/**/*.{ts,tsx}` (lines 34-42). `rules-of-hooks` is the one hook rule that is a real bug class and it stays at error. Good.
- The test overrides (lines 43-54) are scoped to `packages/*/test/**`, which is where tests live (no `*.test.ts` outside a `test/` dir in tracked files). Source is not weakened. Good.

Ignores: `docs/**` is ignored. Tracked files under docs with js/ts extensions are all `.mjs` Playwright screenshot or mutation drivers under `docs/superpowers/task-reports/**` (plus `vite.config.mjs` in a task-15-shots folder). None is product source. Sensible. `fixtures/**` and `packages/ui/public/**` are data and static assets. `.claude/**` ignores `.claude/hooks/guard-subject-writes.mjs`, which is real, tracked, safety-relevant code (it guards writes to subject repos). It is small; see M1.

Rules switched off, and anything hidden beyond the comments:
- `@typescript-eslint/no-explicit-any` off (line 29). Comment says follow-up. Hides type-safety erosion only, no runtime bug class. OK.
- `preserve-caught-error` off (line 30). New in ESLint 10 recommended: flags `throw new X()` in a catch without `{ cause }`. Loss is diagnostic detail only. OK.
- `react-hooks/exhaustive-deps` off (line 40). This hides a genuine stale-closure bug class, but the comment names it and gives the count (43 sites). Clearly justified by the 20-line rule. It should be the first follow-up.
- Test-only: `no-unused-vars` (47), `no-non-null-asserted-optional-chain` (48), `no-control-regex` (49), `no-regex-spaces` (50), `no-useless-escape` (51), `no-unsafe-finally` (52).
  - `no-unsafe-finally` hides a real bug class (a `return`/`throw` in `finally` swallows errors), but only in tests, and the comment names "finally patterns". Acceptable.
  - `no-non-null-asserted-optional-chain` (`a?.b!`) is a real wrong-answer pattern (the `!` lies about undefined), again tests only.
  - `no-unused-vars` off for ALL tests is broader than the stated "unused imports/variables" (it also stops flagging unused imports in tests). That is the intent; just note that it is a blanket off, not a per-site suppression.
- Not enabled at all (never part of the recommended sets used): the react-hooks v7 React Compiler rules, `tseslint` type-aware rules (explicitly not type-aware, line 4). Stated and fine.
- `reportUnusedDisableDirectives: "off"` (line 16). Reasoning checks out: three existing disables name `react-hooks/exhaustive-deps` (`packages/ui/src/canvas/MapSurface.tsx:111`, `packages/ui/src/canvas/useStage.ts:92`, `packages/ui/src/shared/useWorldContext.ts:103`). With exhaustive-deps off, ESLint 10's default (`"warn"`) would report each as an unused directive. Warnings do not fail the exit code, but they would make the run noisy and break any `--max-warnings 0` that P2 might add. The downside is that the flag is global, so a stale `eslint-disable` for a rule that IS on will also go unreported. It would be better scoped (see M3) and must be flipped back when exhaustive-deps is turned on.

## 3. package.json / lockfile

- devDependencies are complete: `eslint ^10.15.0`, `@eslint/js ^10.0.1`, `typescript-eslint ^8.74.0`, `eslint-plugin-react-hooks ^7.1.1`, `globals ^17.14.0` (package.json diff); the lockfile root entry carries exactly the same set, and `@typescript-eslint/parser`/`eslint-plugin` resolve at 8.74.0.
- Peer ranges are satisfied: typescript-eslint 8.74 requires `typescript >=4.8.4 <6.1.0` and the lock has typescript 5.9.3; `@eslint/js` needs eslint ^10; react-hooks plugin accepts eslint ^10.
- Engines: eslint 10.15.0 and @eslint/js 10.0.1 require `node ^20.19.0 || ^22.13.0 || >=24`. README.md:36 tells users "Node.js 20.19+ (or 22.12+)". 22.12.x is therefore below the lint requirement, a one-patch gap. There is no `engines` field in package.json and no `.nvmrc`/`.node-version`, so nothing pins Node. Local Node is v24.13.0, fine. P2 must pick Node 22.13+ or 24 (or 20.19+) explicitly (M4).
- The lockfile peer flags (`"peer": true` on eslint, typescript, vite, react) are the same npm quirk the old lockfile already has (11 flagged before). Nothing unusual. `npm ci` consistency: root devDependencies in the lock equal package.json.
- `tseslint.config()` is marked `@deprecated` in typescript-eslint 8.74 in favor of ESLint's `defineConfig()` (node_modules/typescript-eslint/dist/config-helper.d.ts:67). It works, and nothing here depends on it going away, but it is a deprecated helper in a brand-new config (M5).

## 4. Rules switched off, for the PR body

Global (all packages):
- `@typescript-eslint/no-explicit-any`
- `preserve-caught-error`

`packages/ui` (ts/tsx):
- `react-hooks/exhaustive-deps` (43 sites, 37 in ui/src; `rules-of-hooks` stays on)

Tests only (`packages/*/test/**`):
- `@typescript-eslint/no-unused-vars`
- `@typescript-eslint/no-non-null-asserted-optional-chain`
- `no-control-regex`
- `no-regex-spaces`
- `no-useless-escape`
- `no-unsafe-finally`

Also relevant to the PR body: `no-undef` is off by design (not a follow-up); `reportUnusedDisableDirectives` is off until exhaustive-deps returns; the lint is not type-aware by design; ignored paths are `docs/**`, `.claude/**`, `.codex/**`, `.agents/**`, `fixtures/**`, `packages/ui/public/**`, build output.

## Findings

Critical: none. Important: none.

Minor:
- M1. `.claude/hooks/guard-subject-writes.mjs` is tracked, real code, and is excluded by `.claude/**` (eslint.config.js:13). Consider ignoring only `.claude/worktrees/**` (the worktree copies are what actually duplicates source) and linting the hooks. Lower value; can be a follow-up.
- M2. `no-undef` is off for `.js/.mjs/.cjs` too (eslint.config.js:20-24), though the TS rationale only applies to ts/tsx. Scoping the off to `**/*.{ts,tsx}` would keep undeclared-variable detection in scripts/launch.mjs and the bench scripts. Whether it still passes was not tested.
- M3. `reportUnusedDisableDirectives: "off"` is global. It could be scoped by keeping it on and listing the exhaustive-deps sites, or switched to `"warn"` once exhaustive-deps returns. Add a TODO beside the existing comment (eslint.config.js:15) that it must be flipped back with the exhaustive-deps follow-up, so it does not outlive it.
- M4. README.md:36 says Node 22.12+; eslint 10 needs 22.13+. Either bump README/LAUNCH wording or accept that `npm run lint` has a slightly higher floor. P2 CI should set an explicit Node version (24 or 22.13+).
- M5. `tseslint.config` is deprecated (config-helper.d.ts:67). Using `defineConfig` from `eslint/config` avoids a later churn. Not blocking; works today.

Not verified (by instruction): vitest, build, typecheck. Tool-call budget: well under 80.
