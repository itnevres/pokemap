# PokeMap Plan 4 — Electron, MCP Server, Optional Git Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Read [Plan 0](2026-08-26-pokemap-plan-0-roadmap.md) first — invariants I1–I8 bind every task.
>
> **RE-GRANULARISE BEFORE EXECUTING.** Task level only; expand to Plan 1's step shape against the code Plans 1–3 actually produced.

**Goal:** Ship PokeMap as a desktop application, give AI agents native tool access via MCP, and add the opt-in git safety net deferred from the design discussion.

**Architecture:** No new logic. `electron` hosts the existing `server` and `ui`. `mcp` wraps the existing `core` and `cli` surface. Git integration is a setting on the existing save funnel. If any task here requires changing `core`, that is a signal the layering in Plan 1 was wrong — fix the layering rather than reaching through it.

**Success criteria — demonstrated, not asserted:**
1. A double-clickable PokeMap on Windows that opens the subject repo with no terminal.
2. Claude Code can call `pokemap_render` and see the resulting image.
3. With git integration on, a save into a dirty tree is refused and names the dirty files.

---

## Traps and pitfalls (2026-11-15)

From the plan review of 2026-11-15, checked against `plan-14-2-block-editor` at `21bf0b9`. This plan was written before the hub, the GBC family and the unified shell existed; the GBC invariants G1-G7 bind it as well as I1-I8.

**Task 1 (Electron)**
1. **Half of Task 1 is built, in the hub.** The project picker, the recent list and the in-app switcher exist (Plan 6c Phase A, merged via #11, `a16b604`): `packages/server/src/recent.ts` keeps `~/.pokemap/recent.json`, and the UI is `packages/ui/src/hub/`. The "native project picker" and "recent list in Electron's userData" bullets are marked superseded below.
2. **The hub cannot host the UI yet.** It serves no static files, and `serve.ts:70` hardcodes port 5174. The built UI calls relative `/api/...` paths, which work today only through the Vite proxy (`packages/ui/vite.config.ts`). A page loaded from disk sends an `Origin` the hub rejects with 403 (`server/src/hub.ts:161-169`; any localhost port passes, a file origin does not). The hub gains "serve `packages/ui/dist`" and "port 0" first; `createHub` already takes a port (`hub.ts:322`).
3. **"No new logic" hides a build that does not exist.** The server runs from TypeScript through `tsx` and imports core by `src/` paths; nothing compiles it. A packaged app needs a server bundle, and Plan H Task P3 changes how core is resolved, so the bundle is built after P3.
4. **There is no Ctrl+S.** The only save entry is the Save button (`ui/src/shell/FamilyApp.tsx:308`), and the selected map is React state with no URL (`FamilyApp.tsx:30`). The menu's Save, Ctrl+S and the `pokemap://map/<Name>` link each need a new bridge into the UI.
5. **The app is not offline until Plan H Task M3.** `styles.css:1` loads its fonts from Google.
6. **The smoke test as written breaks two rules.** It opens "the subject repo" (every test runs on a scratch copy since Plan 14.2 Task 0) and selects `NewBarkTown`, a Crystal map, without saying which family it opened. "`git status` clean" fails on the GBA subject, which always carries the user's own lines; compare before and after, as the `gate` skill does.

**Task 2 (packaging)**
7. **No workflow folder exists,** and Plan H Task P2 creates the first CI job. The release job is added to that, after it.

**Task 3 (MCP)**
8. **The tool table names commands that changed.** `sign suggest` and `sign add` are now `indicator suggest` and `indicator add` (Plan 10a2, #21); `validate` and `indicator` are GBA only and `event move/add/delete` are GBC only (`packages/cli/src/index.ts:189-196,308-341,394-420`); `render`, `render-world`, `query`, `encounters`, `where`, `coverage`, `paint` and `diff` serve both. The write flag is `--yes`. The table needs a family column before any tool is written.
9. **`pokemap_diff` is not "what a pending save would change".** The CLI's `diff` dry-runs a paint given on the command line. The pending changes of an open editor session exist only in the hub (`GET /api/edit/<map>/plan`).
10. **MCP writes go around the hub.** They call core directly, so a running hub keeps its caches (Plan H Task G) and an open session of that map keeps its baseline; its next save is refused as changed on disk (`core/src/write/atomic.ts:53-60`). Either the write tools call a running hub's routes, or the guide says not to use them with the app open.

**Task 4 (git)**
11. **`refuseDirtyTree` as written refuses every save for this user.** The GBA subject always has the user's own uncommitted lines (RESUME, External baselines); PerfPlus does not ignore `.pokemap/`, so the first placement makes the tree dirty; and a crash leaves `*.pokemap-tmp-*` files (LESSONS, Testing: "A power loss mid-gate").
12. **The save fingerprint does not cover it.** The fingerprint hashes file entries (`core/src/write/atomic.ts:97`), not refusals, so a tree that turns dirty after the preview passes the commit. The check runs at plan and again at commit.
13. **"Extend `save.ts`" names one file of four.** There are two save modules (`core/src/write/save.ts`, `core/src/gbc/write/save.ts`) and two commit routes (`server/src/index.ts:1036`, `server/src/gbcEditRoutes.ts:424`). The header's "no task changes core" also contradicts this task.
14. **A failed commit after a successful write is not a failed save.** The files are on disk. The result is a notice, as Plan 10a3 does for `PLAN_CHANGED`.
15. **The settings have no route on GBC.** The GBC world payload returns only `{ dungeonAutoLayout }` of the sidecar (`server/src/gbcRoutes.ts:246`), and the sidecar's shape guard is hand-written (`core/src/world/sidecar.ts:33`). Settings get their own route in the shared sidecar module (Plan H Task H).

**Tasks 5 and 6**
16. **There is no root `README.md`;** `LAUNCH.md` holds the launch steps. "Wild signs" are the Pokémon Indicator since Plan 10a2, and the guide covers two families.
17. **Task 6's cache location damages the subjects.** `.pokemap/cache/` inside the project adds files on every render: the gate reads that as a changed subject and Task 4 as a dirty tree. The key also lacks two inputs that now exist: the tileset overlay generation (`core/src/project.ts:207-211`) and the GBC time of day.
18. **One target is already met and measured.** The hub pre-warms world tiles after every open (Plan 12b ruling P12-4w, `server/src/warmUp.ts`): warm settle 0.49-0.56 s on GBA and 0.37-0.38 s on GBC (RESUME). The targets quote GBA counts only.

## Subtasks (2026-11-15)

**Ruled by the user 2026-11-16 (roadmap D32, D33).**
- **Launcher only, for now.** "Start with just the launcher, stand alone app can be down the line. Launcher should be all I need to press to run the app." In scope: 1a and 1b. Deferred (not cancelled): 1c-1f, 2a, 2b. Success criterion 1 is met by the launcher.
- **No git.** "I don't want this tool to rely on git, maybe the person using it doesn't use git?" Task 4 and rows 4a-4c are cancelled, and success criterion 3 is withdrawn. No product feature may require git (D33).
- **What "all I need to press" means for 1b** (Claude's reading, for the 1b brief): one file to double-click (and a desktop shortcut to it). It installs dependencies if `node_modules` is missing, builds the UI if the build is missing or older than the UI sources, starts the hub serving the built UI, waits until the hub answers, and opens the browser at it. If PokeMap is already running, it only opens the browser. Closing the launcher's window stops the hub. It needs Node.js installed; if Node is missing it says so in plain words and stops. It never runs git and never writes into a game project.
- Questions 3 and 5 below are closed by these rulings; 2 and 4 are still open.

Each task here is independent of the others; this is not one plan to run top to bottom. Verify lines run from the repo root after `npm run typecheck`. Decisions that are the user's, with recommendations:

1. **Whether Electron is still the way to "no terminal".** The hub and browser flow already works. Recommendation: subtasks 1a and 1b alone (the hub serves the built UI; a launcher script starts it and opens the browser) meet success criterion 1 at a fraction of the cost; build 1c-1f only if a native window is wanted.
2. **MCP writes:** read tools only at first. Recommendation: yes; add the write tools after trap 10 is ruled.
3. **Git:** recommendation: drop `refuseDirtyTree`; keep `autoCommit`, which stages the plan's files by path, and skip the commit with a notice when one of those files already had uncommitted changes before the save (so the user's own edits never ride along).
4. **The render cache:** recommendation: `~/.pokemap/cache/<project>`, and only if 6a's numbers ask for it.
5. **Deep links:** recommendation: drop until the selected map is in the URL.

| Id | What | Files | Tier | Verify | After |
|---|---|---|---|---|---|
| 1a | Hub serves the built UI and takes port 0 | `packages/server/src/{hub,serve}.ts`, `packages/server/test/hub.test.ts` | High (hub I/O: file paths from a URL) | `npx vitest run packages/server/test/hub.test.ts` | Plan H Task E |
| 1b | Launcher per the ruling above: one double-click file at the repo root (`PokeMap.cmd`) that runs `scripts/launch.mjs`; `LAUNCH.md` updated to put it first | new `PokeMap.cmd`, `scripts/launch.mjs`; `LAUNCH.md` | Medium (process start and stop; a wrong answer is visible but not tested automatically) | double-click it with the hub stopped, then again with it running, then with `packages/ui/dist` deleted; each time the app opens on the last project | 1a; Plan H Task M3 |
| 1c | Server bundle for packaging | new `packages/electron/build.mjs`, `packages/electron/package.json` | Medium | the bundle starts and answers `GET /api/hub` | Plan H Task P3 |
| 1d | Electron main and preload, window state | new `packages/electron/src/{main,preload}.ts` | Medium | manual launch | 1c |
| 1e | Save from the menu and Ctrl+S open the Save dialog | `packages/ui/src/components/Toolbar.tsx` or the shell key handler, its test; `packages/electron/src/main.ts` | Medium | `npx vitest run packages/ui/test/shell` | 1d |
| 1f | Smoke test on scratch copies, one per family | new `packages/electron/test/smoke.spec.ts` | Medium | that test | 1e |
| 2a | Installer and portable build | new `packages/electron/electron-builder.yml` | Low | the installer runs on this machine | 1f |
| 2b | Release job | `.github/workflows/` | Low | a tagged dry run | 2a; Plan H Task P2 |
| 3a | MCP package with the read tools, both families, from the corrected table | new `packages/mcp/package.json`, `packages/mcp/src/index.ts`, tests | Medium | `npx vitest run packages/mcp` | trap 8's table |
| 3b | `pokemap_render` returns image content | `packages/mcp/src/index.ts`, test | Low | `npx vitest run packages/mcp` | 3a |
| 3c | Write tools behind `--allow-writes`, per the ruling on trap 10 | `packages/mcp/src/index.ts`, tests on scratch roots | High (subject writes) | `npx vitest run packages/mcp` | 3a; decision 2 |
| 4a | Git module: porcelain parse, stage by path, commit; tests on temporary repositories only | new `packages/core/src/write/git.ts` and test | High (parsing, subject repo writes) | `npx vitest run packages/core/test/write` | decision 3 |
| 4b | Settings: storage, route in the shared sidecar module, first-run prompt | `packages/core/src/world/sidecar.ts`, `packages/server/src/sidecarRoutes.ts`, a shared UI prompt | Medium | `npx vitest run packages/server packages/ui/test/shared` | Plan H Task H |
| 4c | Both commit routes: the check at plan and commit, the commit after the write, notices | `packages/server/src/{index,gbcEditRoutes}.ts` or the route modules Plan H Task I leaves; tests | High (save ownership) | `npx vitest run packages/server` | 4a, 4b |
| 5 | README, user guide, agent guide, for both families | `README.md`, `docs/user-guide.md`, `docs/agent-guide.md` | Low | a reader follows the guide on a scratch project | the features it describes |
| 6a | Benchmarks and a measured baseline for both families | new `packages/core/bench/*.mjs`; numbers in the task report | Low | the scripts print the four numbers | - |
| 6b | Only what 6a shows to be slow | per finding | per finding | 6a rerun | 6a |

---

## Task 1: Electron shell

**Files:** Create `packages/electron/package.json`, `src/main.ts`, `src/preload.ts`, `electron-builder.yml`

**Requirements:**
- The main process starts the existing `server` in-process on a random free port and loads the built `ui` from disk. `ui` code does not change; it still talks HTTP to `127.0.0.1`.
- **SUPERSEDED 2026-11-15, do not build:** the hub's project picker and `~/.pokemap/recent.json` do this in both families (Plan 6c Phase A, merged via #11, `a16b604`; `packages/server/src/recent.ts`, `packages/ui/src/hub/ProjectPicker.tsx`). Original text: Native project picker replacing `pokemap.config.json` for end users; the config file remains the CLI's source. Recent projects list persisted in Electron's userData, **never in the decomp**.
- Menu: File (Open Project, Recent, Save, Quit), Edit (Undo/Redo), View (zoom, overlays, lenses), Help (docs link).
- **Ctrl+S opens the diff preview and does not save** — invariant **I6** survives the port to a native menu, where "Save" traditionally means "write now".
- Window state persisted. Deep link `pokemap://map/<Name>` opens a map, so an agent or a doc can link to one.

**Test:** a Playwright-Electron smoke test that launches the app, opens the subject repo, selects `NewBarkTown`, and asserts the canvas rendered — with `git status` in the decomp clean afterwards.

---

## Task 2: Packaging

**Files:** `electron-builder.yml`, CI workflow

**Requirements:**
- Windows NSIS installer and a portable `.exe`. Windows is the only required target; do not spend time on macOS signing unless asked.
- Node native modules: there are none, by design. If one has crept in, remove it rather than configuring rebuilds.
- Version from the root `package.json`; the About dialog shows version and commit.
- CI builds the installer on tag and attaches it to a release.

---

## Task 3: MCP server

**Files:** Create `packages/mcp/package.json`, `src/index.ts`, tests

Wraps the command surface that Plans 1–3 settled. Designing these tools *after* the CLI exists is deliberate — Plan 0 §1 — because the tools worth exposing are the ones that turned out to be used.

**Tools** (marked 2026-11-15: this table predates the GBC family and the `sign` to `indicator` rename; correct it per trap 8 and add a family column before building any tool; `pokemap_diff` per trap 9):

| Tool | Wraps | Notes |
|---|---|---|
| `pokemap_render` | `render` | Returns the PNG as image content so the agent can *look* at it |
| `pokemap_render_world` | `render-world` | Bounded region of the stitched world |
| `pokemap_map_info` | `query` | Header, connections, events, split, `layout_version` |
| `pokemap_validate` | `validate` | Per-layout metatile range, warps, connections |
| `pokemap_encounters` | `encounters` | With true percentages |
| `pokemap_where` | `where` | Every map a species appears on |
| `pokemap_coverage` | `coverage` | Design gaps |
| `pokemap_sign_suggest` | `sign suggest` | Read-only |
| `pokemap_diff` | `diff` | What a pending save would change |
| `pokemap_paint` | `paint --write` | **Write.** Gated, see below |
| `pokemap_sign_add` | `sign add --write` | **Write.** Gated, see below |

**Requirements:**
- Read tools are unrestricted. **Write tools are off unless the server is started with `--allow-writes`**, and the refusal names the flag. An agent that can silently repaint 1,209 maps is not a feature.
- Every write tool returns the `SavePlan` diff in its result, so the agent sees what it did.
- `pokemap_render` returns real image content, not a file path. The whole point is that the agent can check its own work by looking.
- Errors return refusal codes and fix text verbatim from `write/guards.ts` — an agent that gets "missing-layout-version: run classify_layout_versions.py --write" can act on it.

**Test:** an MCP client harness that calls each tool against a temp copy of the subject repo and asserts shape; plus a test that every write tool refuses without `--allow-writes`.

---

## Task 4: Optional git integration

**CANCELLED 2026-11-16 by the user (roadmap D33): PokeMap never relies on git.** Do not build. The text below is kept for the record only.

The feature deferred from the design discussion: strictly additive protection over the existing save funnel, default off.

**Files:** Create `packages/core/src/write/git.ts`, extend `save.ts`, tests

**Settings** (in `.pokemap/world.json`, since it is per-project):

```json
{ "git": { "refuseDirtyTree": false, "autoCommit": false, "commitMessageTemplate": "map: {summary}" } }
```

**Requirements:**
- `refuseDirtyTree`: `planSave` gains a refusal when `git status --porcelain` is non-empty, listing the dirty files. Files this save would itself touch are excluded — otherwise the second save of a session is always refused.
- `autoCommit`: after a successful `commitSave`, stage **exactly the files in the plan by path** and commit. **Never `git add -A`** — `docs/resolved.md` records `git add -A` without re-checking `git status` as the mechanism by which the Porymap 6 damage reached a commit. A test asserts the staging command names explicit paths.
- Both default to **off**. A first-run prompt offers to enable them and explains what each does.
- A repo with no git, or git not on PATH, degrades to off with a one-line notice — never an error, never a blocked save.
- Git calls are out of the render path entirely; a slow `git status` may delay a save dialog but must never affect panning.

---

## Task 5: Documentation

**Files:** `README.md`, `docs/user-guide.md`, `docs/agent-guide.md`

**Requirements:**
- `README.md`: what PokeMap is, and the two Porymap failures it exists to prevent, stated plainly with the dates and the evidence. That framing is the fastest way for a new reader to understand why the tool has the shape it does.
- `docs/user-guide.md`: install, open a project, the per-layout boundary explained once and well, painting, events, wild signs, the world view, and the save/diff flow.
- **A migration note for the subject repo**: `docs/human-porymap.md`'s Step 2 and Step 5 — swap the constants in `include/fieldmap.h` before editing an `emerald` map, swap them back before building — are no longer needed. That worklist should be updated to say so once PokeMap is in use. Do not edit the subject repo's docs as part of this plan; write the note and let the owner apply it.
- `docs/agent-guide.md`: the CLI and MCP surface, the render-and-look workflow, and the `--dry-run` / `--allow-writes` gates.

---

## Task 6: Performance pass

**Files:** benchmarks under `packages/core/bench/`

Only now, with the real feature set in place, is it worth optimising.

**Targets, each measured before and after:**
- Cold open of the subject repo (1,209 maps, 1,020 layouts): under 3 seconds to an interactive map list.
- Full world view at minimum zoom: under 2 seconds to first paint, using cached LOD buffers.
- Pan at any zoom: 60fps with no fetch stalls.
- `pokemap render` for one map: under 300ms including process start — this is the number that decides whether an agent's check-your-work loop feels instant or annoying.

**Requirements:**
- Measure first; optimise only what the numbers say is slow.
- Persistent render cache under `.pokemap/cache/`, keyed by content hash of the layout's blockdata plus both tilesets plus the split. Invalidation must be automatic on any input change — a stale render is worse than a slow one, because it silently shows the wrong map.
- The cache directory is disposable and gitignorable; deleting it must only cost time.

---

## Plan 4 completion checklist

- [ ] `npm test` green, all packages
- [ ] Installer builds; the installed app opens the subject repo with no terminal
- [ ] Claude Code calls `pokemap_render` and the image comes back visible in the transcript
- [ ] Write tools refuse without `--allow-writes`, naming the flag
- [ ] With `refuseDirtyTree` on, a save into a dirty tree is refused and lists the dirty files
- [ ] With `autoCommit` on, the commit contains **only** the plan's files — verified with `git show --stat`
- [ ] Benchmarks meet the Task 6 targets, with numbers recorded in the PR
- [ ] `git status` in the decomp clean after a full exploratory session
