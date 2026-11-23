# Plan H L1+L2 combined review (BASE 3f166b4, HEAD 04262b6)

Verdict: APPROVED with 2 Minor findings (doc text to update). No Critical or Important findings. Read-only review; no test, build, install or typecheck was run. Counts and the UI build are for the orchestrator's gate.

## Acceptance checklist

| Criterion | Status | Evidence |
|---|---|---|
| L1 `npm audit fix` without `--force`, lockfile only | met | `git diff 3f166b4 bc5ee41 --stat`: only `package-lock.json` (553+/91-). |
| L2 vitest 2.1.9 -> 5.x with matching vite | met | root `package.json`: `vite ^8.3.8`, `vitest ^5.1.1`. Lock: `node_modules/vitest` 5.1.1, `node_modules/vite` 8.3.8. |
| vite declared (plan row 33) | met | `packages/ui/package.json` devDependencies `vite ^8.3.8`. Also in root (extra, see note 1). |
| Same test and file counts | not measurable here | Selection is an exact partition (section 1), so counts should match. The gate must confirm. |
| `--no-file-parallelism` works | met | still a vitest 5 CLI flag: `node_modules/vitest/dist/chunks/cac.BK306qhQ.js:950`. |
| globalSetup runs, and runs once | met | section 2. |
| UI build passes | not checkable read-only | The gate must confirm. |
| `environmentMatchGlobs` replaced | met | `vitest.config.ts:3` comment, two projects at lines 9-28; no `environmentMatchGlobs` or `poolMatchGlobs` string left in vitest 5 `dist/chunks/index.ER9afepi.js`. |

## 1. Test selection (old include vs new projects)

Old: `include packages/*/test/**/*.test.{ts,tsx}`, jsdom for `packages/ui/**`, node otherwise.
New (`vitest.config.ts`):
- node project (lines 10-17): same include, `exclude ["packages/ui/**", "**/node_modules/**"]`.
- ui project (lines 18-26): `include packages/ui/test/**/*.test.{ts,tsx}`, jsdom.

`git ls-files` shows 283 `.test.ts(x)` files, all under `packages/*/test/` (none elsewhere, no `.spec`, no `.test.js/mjs`, none under `packages/ui` outside `packages/ui/test`).
- ui: 140 files (43 at the top of `packages/ui/test` plus canvas 12, encounters 7, gba 3, gbc 30, hub 4, shared 29, shell 8, world 4).
- node: 143 files (cli 7, mcp 3, server 26, core 107).
- 140 + 143 = 283. The partition is exact: no file in both, none in neither.

Behaviour difference: the node project's own `exclude` replaces vitest's default exclude list (dist, cypress and so on). Nothing under `packages/*/test` lives in such dirs, so it has no effect today. Using `configDefaults.exclude` would be tidier (Minor, optional).

`packages/ui/test/setup.ts` is guarded on `typeof document` (lines 12-20), so inheriting `setupFiles` into the node project is harmless, same as before.

## 2. vitest 5 semantics (read from `node_modules/vitest/dist`)

- `test.projects` inline form is valid: `chunks/plugin.d.Du7hHZwb.d.ts:3818` (`projects?: TestProjectConfiguration[]`), inline entry type with `extends?: string | boolean` at `:4696-4704` (`true` inherits everything from the root config).
- Root globalSetup runs once: `chunks/index.ER9afepi.js:3757-3759` (`NON_INHERITED_ROOT_OPTIONS` includes `globalSetup`) and `:7436-7440` strip root `globalSetup` from projects that `extends: true` the root config. The root/core project initialises it: `chunks/cli-api.D6E8EtSi.js:13751-13753` (the core project is always added before `_initializeGlobalSetup()`), teardown at `:13958-13961`. So `testRootsSetup.ts` and `subjectSnapshotSetup.ts` run once, from the root, not per project.
- `setupFiles` and `globals` are not in the non-inherited list (`:3752-3759`), so both projects inherit them, as intended.
- A run filtered with `--project ui` still runs the root globalSetup (line 13752 adds the core project unconditionally). Fine for the test-root redirect.

## 3. Lockfile sanity

- Single vite major: only `node_modules/vite` 8.3.8 in the lock. The old `packages/ui/node_modules/vite` 8.2.2 and the old 5.4.21 are gone. This satisfies the vitest peer `^6.4 || ^7 || ^8`, `@vitest/mocker` peer `^6 || ^7 || ^8`, and `@vitejs/plugin-react` 6.1.1 peer `^8.0.0`.
- `@types/node ^22` (root) satisfies vitest's `^22.0.0 || >=24.0.0` peer.
- No `vite-node`, `tinypool`, or `esbuild` 0.21.x entries remain (the removed advisories). The only esbuild is `node_modules/tsx/node_modules/esbuild` 0.28.2 (dev, owned by tsx; vite 8 uses rolldown 1.2.19 and treats esbuild as an optional peer). `undici` 7.30.2 and `source-map-js` 1.2.4 are present (the L1 fixes). All dev only. No duplicates that matter.
- L1 side effect, Minor and acceptable: bc5ee41 changed more than the plan text ("undici and source-map-js"). It also bumped `rolldown` 1.2.6 -> 1.2.19, `@oxc-project/types`, `postcss`, `nanoid`, `packages/ui` vite 8.2.2 -> 8.3.8, and added `@esbuild/*` 0.28.2 platform stubs under `packages/ui/node_modules` plus wasm runtime entries. All are in-range. L2 then removed the nested copies. No action.

## 4. Stale references

- `LAUNCH.md:5` (Minor, needs update): says "Node.js 20.19.x or later in the 20.x line, or 22.12+" and "The UI's Vite 8.2.2". Vite is now 8.3.8, and vitest 5.1.1 declares engines `^22.12.0 || ^24.0.0 || >=26.0.0` (lock `node_modules/vitest`), so Node 20.x can no longer run `npm test`. The project CLAUDE.md says to keep LAUNCH.md in step with launch-related changes. Suggested text: Node 22.12+ (the app and UI build still allow 20.19, only the tests do not); drop the exact vite patch version or set it to 8.3.8. `npm ci` only warns on an engine mismatch unless engine-strict is set.
- `.claude/skills/gate/SKILL.md:18-20`: `npm test -- --no-file-parallelism` is still valid. No change needed.
- `docs/superpowers/plans/plan-h-hardening.md:74` (row 33), `:156` and `:460` describe L2 as future work and cite `environmentMatchGlobs (vitest.config.ts:8)`. Mark L1/L2 done when the plan or RESUME is updated.
- `docs/superpowers/plans/archive/plan-01-foundation-world.md:4776-4782`, older task reports and `task-reports/pokemap-plan-14-2-block-editor/ledger.md` mention vitest 2.x or `environmentMatchGlobs`. They are historical; leave them.
- No `vitest.workspace*` file, no `poolOptions`, no other vitest config files; `package.json` scripts (`test`, `test:watch`) need no change. `launch.sh` and `.claude/launch.json` have no vitest reference.

## Findings

1. Minor (doc): `LAUNCH.md:5` Node range and Vite version are now wrong, as above.
2. Minor (optional): `vitest.config.ts:14` the node project's `exclude` replaces the defaults; consider `[...configDefaults.exclude, "packages/ui/**"]`. Not a failure today.

## Notes (not findings)

1. `vite` is declared in both the root and the UI `package.json` (`^8.3.8` twice). The plan asked only for the UI package. The root entry makes the hoisted copy explicit for vitest's peer, which is defensible. If the two ranges drift, npm could nest a second copy.
2. Test output is now prefixed by project name (`node`, `ui`). The gate's summary should still show the same file and test totals as RESUME's baseline; the orchestrator should confirm.
3. Mutation evidence is not applicable (config change, Medium tier).
