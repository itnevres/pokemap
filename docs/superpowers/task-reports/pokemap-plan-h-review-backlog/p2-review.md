# Plan H P2 review (combined spec + quality, Medium tier)

Range: origin/master..HEAD (c9894bb), files `.github/workflows/ci.yml`, `packages/core/test/config/engine.test.ts`, `package-lock.json`.
Not run (per brief): vitest, build, typecheck. Verified via `gh run view 45570115016`: success on head SHA c9894bb; Node 24; log line "running 283 of 303 test files; 20 need the private GBA subject"; "4930 passed, 500 skipped (5430)"; step output "tests: 5430 total, 4930 passed, 0 failed, 500 skipped (pending 500, todo 0)". Repo visibility is PUBLIC (so fork PRs run this workflow).

Verdict: FINDINGS 7 (0 Critical, 2 Important, 5 Minor). Spec criteria are met; the findings are robustness and maintainability.

## Spec checklist (plan-h-hardening.md row P2 / finding 34)

| Criterion | Status | Evidence |
|---|---|---|
| `.github/workflows/ci.yml` runs lint, typecheck, UI build | met | ci.yml:50-54 (`npm run lint`, `typecheck`, `build -w packages/ui`) |
| Tests with public corpora fetched like session-start.sh, pinned | met | ci.yml:56-64 runs the hook with `CLAUDE_CODE_REMOTE=true`; pins live in session-start.sh `PINNED`; run log shows all 7 "fetched ... @ sha" lines |
| Skipped count printed and pinned | met | ci.yml:20, 87-98; run log prints it and compares to 500 |
| Node satisfies ESLint 10 | met | ci.yml:45 `node-version: 24` |
| Verify: green run with skipped count printed | met | run 45570115016 success (10 steps green) |

## Checks asked for

1. Workflow correctness/security: sound. `permissions: contents: read` (ci.yml:13), trigger is `pull_request` not `pull_request_target`, no secrets, no `${{ }}` interpolation inside any `run:` (only `github.ref` in the concurrency key, which is not shell). `EXPECTED_SKIPPED` and `SUBJECT_ONLY_TESTS` come from the committed file, not from PR text, so no injection path. Filter logic: I recomputed it locally. `find` (ci.yml:69) yields 303 files, matching the log. The 20 listed files all exist. 283 remain. No included path is a substring of any other path in the full set (so no `.test.ts` vs `.test.tsx` over-selection today), and no path contains a space. The find root/glob also matches vitest.config.ts include (`packages/*/test/**/*.test.{ts,tsx}`), so no file is missed and none extra. Latent risks are in M2 below.
2. See I2.
3. See M1.
4. engine.test.ts edit: minimal and correct (engine.test.ts:3, 100-101). `!frlg || !existsSync(projectPaths(frlg).porymapCfg)` short-circuits before `projectPaths(undefined)`, TS narrows `frlg` so no cast is needed in the guard, and the body is unchanged. It costs one skipped test in CI (accounted for in the 500). Note it means CI has no real-pokefirered-cfg coverage; the comment says why. Acceptable.
5. Lockfile entries: match the registry. `npm view` returns for @emnapi/core@2.0.0-beta.2 deps `{tslib ^2.4.0, @emnapi/wasi-threads 2.2.0}`, and integrity `sha512-MzCVoWtc...r/8+4A==` and tarball URL identical to package-lock.json:515-526. For @emnapi/runtime@2.0.0-beta.2 deps `{tslib ^2.4.0}`, integrity `sha512-JcrSPzPv...+i5QEw==` identical to :527-537. Both carry `dev`/`optional`, same shape as the neighbouring wasi-threads entry; versions match the peer requests at package-lock.json:963-964 and :1229-1230; alphabetical position correct; tslib 2.9.1 already satisfies `^2.4.0` (:4440).
6. Hermeticity: see I1, M3, M4.

## Findings

### Important

**I1. A failed corpus fetch is swallowed and then surfaces as a misleading "update the pin" failure.** `session-start.sh` `fetch_pinned` is called as `if ! fetch_pinned ...` (session-start.sh, loop after the PINNED array). Inside an `if` context `set -e` is off, and the function's last command is `log "fetched ..."`, which always succeeds. So a transient GitHub outage, or an upstream force-push/GC of a pinned SHA (several pins are third-party forks: resetes12/pokeemerald, danenders/pokeclassic), leaves an empty `git init` dir, prints a false "fetched" line, and the "Fetch public corpora" step still goes green (ci.yml:63-64 only runs the hook). Failure scenario: resetes12 deletes the repo; tests needing modern-emerald silently skip, skipped count becomes e.g. 540, and the Skipped count step fails with "update it in ci.yml if this is intended" (ci.yml:96). A maintainer bumps the pin and permanently blesses the loss of coverage. Fix (cheap, in the workflow, no hook change): after the fetch step verify every corpus dir has `layouts/layouts.json`-equivalent or `git -C <dir> rev-parse HEAD` equals the pinned SHA, and fail with "corpus X not fetched (network or deleted upstream)"; optionally wrap in a retry and `actions/cache` keyed on `hashFiles('.claude/hooks/session-start.sh')`. Also fix the hook function to `return 1` on failed fetch/checkout.

**I2. SUBJECT_ONLY_TESTS has no drift guard and a new subject-dependent file gives an unhelpful failure.** The list is a hand-maintained 20-line blacklist (ci.yml:25-44) applied with `grep -vxFf` (ci.yml:71). (a) A renamed or deleted file stays in the list silently; nothing checks that each entry exists. (b) Once a listed file is fixed with `itWithCorpus` (the stated follow-up, ci.yml:23), it stays excluded and its skips never enter the pinned count, so coverage is lost with no signal. (c) A NEW test that reads the subject at import time is not in the list, so CI goes red with whatever the file throws (an ENOENT stack from `readFileSync` or similar), with no hint that the answer is "add it to SUBJECT_ONLY_TESTS or guard with itWithCorpus". Red is the right outcome, so it is not a false pass, but the message is poor. Fix: after building subject-only.txt, `comm -13 all-tests.txt subject-only.txt` and fail with "stale SUBJECT_ONLY_TESTS entries"; wrap the vitest call so a failure echoes `::error::` naming the list and the itWithCorpus option. Also state in the printed summary that the excluded 20 files are unverified in CI (the "283 of 303" line already does most of this).

### Minor

**M1. Skipped-count step fails with a raw ENOENT stack when vitest produced no JSON (ci.yml:87-98).** It has `if: always()`, so when lint/typecheck/build/fetch/vitest-crash fails earlier it still runs, throws `ENOENT ... vitest-results.json` from `readFileSync` (exit non-zero, but stack trace, not a message) and adds a second red step that hides the real failure. The exit code is correct (fails closed), the message is not. Fix: `if (!fs.existsSync(f)) { console.error("vitest wrote no results JSON; the Test step crashed or did not run"); process.exit(1) }`, or condition the step on `hashFiles('vitest-results.json') != ''` while keeping the Test step as the failure source. Note also that `numPendingTests` counts tests still in `run`/`queued` state (vitest cli-api chunk, `numPendingTests` filter), so an interrupted run inflates "skipped"; harmless because Test already fails.

**M2. Filter list built by unquoted expansion (ci.yml:70, 72-73).** `printf '%s\n' $SUBJECT_ONLY_TESTS` and `$(cat run-tests.txt)` rely on word splitting and glob expansion. Fine today (no spaces, no glob characters, 283 args), and vitest filters are plain substrings, so it works, but a future filename with a space would split into wrong filters (under-selecting, quietly dropping a file), and a filter that is a prefix of another path (`Foo.test.ts` vs `Foo.test.tsx`) would over-select. Safer: `mapfile -t files < run-tests.txt; npx vitest run ... "${files[@]}"` and `printf '%s\n' "$SUBJECT_ONLY_TESTS" | sed '/^$/d'`. Optionally assert in the script that no run path is a substring of another.

**M3. `cancel-in-progress: true` also applies to master pushes (ci.yml:15-17).** Two quick pushes to master cancel the first run, so that commit never gets a verdict (the run takes about 8.5 minutes). Use `cancel-in-progress: ${{ github.ref != 'refs/heads/master' }}`.

**M4. `timeout-minutes: 90` (ci.yml:21) against an 8.5-minute run.** A hang burns up to 90 minutes of runner time (per-test timeout is 60 s, so hangs are unlikely but not a global guard). 25-30 minutes leaves ample headroom.

**M5. Supply-chain hygiene.** Actions are pinned to major tags (`checkout@v4`, `setup-node@v4`, ci.yml:47, 49), not SHAs, and checkout keeps the token in `.git/config` (default `persist-credentials: true`) while arbitrary PR test code runs. The token is read-only (`contents: read`), so impact is low. Add `persist-credentials: false`; pin SHAs if the repo adopts that policy.

## Other observations (no action required)

- The hook runs `npm install` after `npm ci`; the log shows "reverted npm's package-lock.json churn", so the install did rewrite the lockfile in CI. Harmless, but it means CI does not prove `npm install` leaves the lock byte-identical.
- Skipped-count pin is a single total; one newly skipped test plus one newly unskipped test cancels out. Pinning only the total is acceptable for the spec; the total test count (5430) is printed but not pinned.
- Untracked artifacts (`all-tests.txt`, `subject-only.txt`, `run-tests.txt`, `vitest-results.json`) are written into the workspace; harmless in CI.
