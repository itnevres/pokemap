# PokeMap Plan 4 — Launcher, Electron, MCP Server

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Read [Plan 0](2026-08-26-pokemap-plan-0-roadmap.md) first — invariants I1–I8 bind every task.
>
> **Work from the Subtasks table (2026-11-15).** Each row is one dispatch; its brief also carries the traps for its task. The Task 1-6 sections after it are the original 2026-08 requirements: where a trap or a ruling disagrees with them, the trap or ruling wins, and their **Files** lines are the 2026-08 layout (the table names the real files).

**Goal:** Start PokeMap with one double-click, and give AI agents native tool access via MCP. A desktop (Electron) app and its installer come later (roadmap D32). The optional git integration is cancelled (roadmap D33).

**Architecture:** No new logic. The launcher starts the existing hub serving the built `ui`; a later `electron` package would host the same hub and `ui`. `mcp` wraps the existing `core` and `cli` surface. If any task here requires changing `core`, that is a signal the layering in Plan 1 was wrong — fix the layering rather than reaching through it.

**Success criteria — demonstrated, not asserted:**
1. A double-clickable PokeMap on Windows that opens the subject repo with no terminal. The launcher (subtasks 1a and 1b) meets it (D32).
2. Claude Code can call `pokemap_render` and see the resulting image.

(Criterion 3, a git dirty-tree refusal, was deleted 2026-11-21: Task 4 is cancelled, D33.)

---

## Traps and pitfalls (2026-11-15)

From the plan review of 2026-11-15, checked against `plan-14-2-block-editor` at `21bf0b9`. Line numbers were moved to `master` at `9d14637` on 2026-11-21; the facts were not re-derived. This plan was written before the hub, the GBC family and the unified shell existed; the GBC invariants G1-G7 bind it as well as I1-I8.

**Task 1 (Electron)**
1. **Half of Task 1 is built, in the hub.** The project picker, the recent list and the in-app switcher exist (Plan 6c Phase A, merged via #11, `a16b604`): `packages/server/src/recent.ts` keeps `~/.pokemap/recent.json`, and the UI is `packages/ui/src/hub/`. Task 1's "native project picker" and "recent list in Electron's userData" bullet was deleted for this reason.
2. **The hub cannot host the UI yet.** It serves no static files, and `serve.ts:70` hardcodes port 5174. The built UI calls relative `/api/...` paths, which work today only through the Vite proxy (`packages/ui/vite.config.ts`). A page loaded from disk sends an `Origin` the hub rejects with 403 (`server/src/hub.ts:161-169`; any localhost port passes, a file origin does not). The hub gains "serve `packages/ui/dist`" and "port 0" first; `createHub` already takes a port (`hub.ts:322`).
3. **"No new logic" hides a build that does not exist.** The server runs from TypeScript through `tsx` and imports core by `src/` paths; nothing compiles it. A packaged app needs a server bundle, and Plan H Task P3 changes how core is resolved, so the bundle is built after P3.
4. **There is no Ctrl+S.** The only save entry is the Save button (`ui/src/shell/FamilyApp.tsx:312`), and the selected map is React state with no URL (`FamilyApp.tsx:34`). The menu's Save, Ctrl+S and the `pokemap://map/<Name>` link each need a new bridge into the UI.
5. **The app is not offline until Plan H Task M3.** `styles.css:1` loads its fonts from Google.
6. **The smoke test as written breaks two rules.** It opens "the subject repo" (every test runs on a scratch copy since Plan 14.2 Task 0) and selects `NewBarkTown`, a Crystal map, without saying which family it opened. "`git status` clean" fails on the GBA subject, which always carries the user's own lines; compare before and after, as the `gate` skill does.

**Task 2 (packaging)**
7. **No workflow folder exists,** and Plan H Task P2 creates the first CI job. The release job is added to that, after it.

**Task 3 (MCP)**
8. **The CLI changed after the tool table was written; the table was corrected 2026-11-21.** `sign suggest` and `sign add` are now `indicator suggest` and `indicator add` (Plan 10a2, #21); `validate` and `indicator` are GBA only and `event move/add/delete` are GBC only (`packages/cli/src/index.ts:189-196,308-341,394-420`); `render`, `render-world`, `query`, `encounters`, `where`, `coverage`, `paint` and `diff` serve both. The write flag is `--yes`. The table now has a family column and these names.
9. **`pokemap_diff` is not "what a pending save would change".** The CLI's `diff` dry-runs a paint given on the command line. The pending changes of an open editor session exist only in the hub (`GET /api/edit/<map>/plan`).
10. **MCP writes go around the hub.** They call core directly, so a running hub keeps its caches (Plan H Task G) and an open session of that map keeps its baseline; its next save is refused as changed on disk (`core/src/write/atomic.ts:53-60`). Either the write tools call a running hub's routes, or the guide says not to use them with the app open.

**Task 4 (git)**

Traps 11-15 were deleted 2026-11-21: they covered the git integration, which is cancelled (D33). The numbers are kept so references to traps 16-18 still hold.

**Tasks 5 and 6**
16. **There is no root `README.md`;** `LAUNCH.md` holds the launch steps. "Wild signs" are the Pokémon Indicator since Plan 10a2, and the guide covers two families.
17. **Task 6's cache location damages the subjects.** `.pokemap/cache/` inside the project adds files on every render, and the gate reads that as a changed subject. The key also lacks two inputs that now exist: the tileset overlay generation (`core/src/project.ts:207-211`) and the GBC time of day.
18. **One target is already met and measured.** The hub pre-warms world tiles after every open (Plan 12b ruling P12-4w, `server/src/warmUp.ts`): warm settle 0.49-0.56 s on GBA and 0.37-0.38 s on GBC (RESUME). The targets quote GBA counts only.

## Subtasks (2026-11-15)

**Ruled by the user 2026-11-16 (roadmap D32, D33).**
- **Launcher only, for now.** "Start with just the launcher, stand alone app can be down the line. Launcher should be all I need to press to run the app." In scope: 1a and 1b. Deferred (not cancelled): 1c-1f, 2a, 2b. Success criterion 1 is met by the launcher.
- **No git.** "I don't want this tool to rely on git, maybe the person using it doesn't use git?" Task 4 is cancelled, and success criterion 3 is withdrawn; both, and rows 4a-4c, were deleted 2026-11-21. No product feature may require git (D33).
- **What "all I need to press" means for 1b** (Claude's reading, for the 1b brief): one file to double-click (and a desktop shortcut to it). It installs dependencies if `node_modules` is missing, builds the UI if the build is missing or older than the UI sources, starts the hub serving the built UI, waits until the hub answers, and opens the browser at it. If PokeMap is already running, it only opens the browser. Closing the launcher's window stops the hub. It needs Node.js installed; if Node is missing it says so in plain words and stops. It never runs git and never writes into a game project.
Each task here is independent of the others; this is not one plan to run top to bottom. Verify lines run from the repo root after `npm run typecheck`. Decisions:

1. **Whether Electron is still the way to "no terminal":** closed by D32 (launcher first; 1c-1f deferred).
2. **MCP writes:** read tools only at first. Recommendation: yes; add the write tools after trap 10 is ruled. Open.
3. **Git:** closed by D33 (cancelled). Its recommendation was deleted 2026-11-21.
4. **The render cache:** recommendation: `~/.pokemap/cache/<project>`, and only if 6a's numbers ask for it. Open.
5. **Deep links:** closed by D32 (they belong to the deferred Electron app).

| Id | What | Files | Tier | Verify | After |
|---|---|---|---|---|---|
| 1a | Hub serves the built UI and takes port 0 | `packages/server/src/{hub,serve}.ts`, `packages/server/test/hub.test.ts` | High (hub I/O: file paths from a URL) | `npx vitest run --no-file-parallelism packages/server/test/hub.test.ts` | Plan H Task E |
| 1b | Launcher per the ruling above: one double-click file at the repo root (`PokeMap.cmd`) that runs `scripts/launch.mjs`; `LAUNCH.md` updated to put it first | new `PokeMap.cmd`, `scripts/launch.mjs`; `LAUNCH.md` | Medium (process start and stop; a wrong answer is visible but not tested automatically) | double-click it with the hub stopped, then again with it running, then with `packages/ui/dist` deleted; each time the app opens on the last project | 1a; Plan H Task M3 |
| 1c | Server bundle for packaging | new `packages/electron/build.mjs`, `packages/electron/package.json` | Medium | the bundle starts and answers `GET /api/hub` | Plan H Task P3 |
| 1d | Electron main and preload, window state | new `packages/electron/src/{main,preload}.ts` | Medium | manual launch | 1c |
| 1e | Save from the menu and Ctrl+S open the Save dialog | `packages/ui/src/components/Toolbar.tsx` or the shell key handler, its test; `packages/electron/src/main.ts` | Medium | `npx vitest run --no-file-parallelism packages/ui/test/shell` | 1d |
| 1f | Smoke test on scratch copies, one per family | new `packages/electron/test/smoke.spec.ts` | Medium | that test | 1e |
| 2a | Installer and portable build | new `packages/electron/electron-builder.yml` | Low | the installer runs on this machine | 1f |
| 2b | Release job | `.github/workflows/` | Low | a tagged dry run | 2a; Plan H Task P2 |
| 3a | MCP package with the read tools, both families, from the corrected table | new `packages/mcp/package.json`, `packages/mcp/src/index.ts`, tests | Medium | `npx vitest run --no-file-parallelism packages/mcp` | - |
| 3b | `pokemap_render` returns image content | `packages/mcp/src/index.ts`, test | Low | `npx vitest run --no-file-parallelism packages/mcp` | 3a |
| 3c | Write tools behind `--allow-writes`, per the ruling on trap 10 | `packages/mcp/src/index.ts`, tests on scratch roots | High (subject writes) | `npx vitest run --no-file-parallelism packages/mcp` | 3a; decision 2 |
| 5 | README, user guide, agent guide, for both families | `README.md`, `docs/user-guide.md`, `docs/agent-guide.md` | Low | a reader follows the guide on a scratch project | the features it describes |
| 6a | Benchmarks and a measured baseline for both families | new `packages/core/bench/*.mjs`; numbers in the task report | Low | the scripts print the four numbers | - |
| 6b | Only what 6a shows to be slow | per finding | per finding | 6a rerun | 6a |

---

## Task 1: Electron shell

Deferred (D32): only the launcher, subtasks 1a and 1b, is built now. The requirements below are for the later Electron app (1c-1f).

**Files:** Create `packages/electron/package.json`, `src/main.ts`, `src/preload.ts`, `electron-builder.yml` (2026-08 list; the launcher's files are in rows 1a and 1b)

**Requirements:**
- The main process starts the existing `server` in-process on a random free port and loads the built `ui` from disk. `ui` code does not change; it still talks HTTP to `127.0.0.1`.
- (The project picker and recent-projects bullet was deleted 2026-11-21: the hub's picker and `~/.pokemap/recent.json` built it in both families, Plan 6c Phase A, #11.)
- Menu: File (Open Project, Recent, Save, Quit), Edit (Undo/Redo), View (zoom, overlays, lenses), Help (docs link).
- **Ctrl+S opens the diff preview and does not save** — invariant **I6** survives the port to a native menu, where "Save" traditionally means "write now".
- Window state persisted. Deep link `pokemap://map/<Name>` opens a map, so an agent or a doc can link to one.

**Test:** a Playwright-Electron smoke test that launches the app, opens the subject repo, selects `NewBarkTown`, and asserts the canvas rendered — with `git status` in the decomp clean afterwards. Trap 6 corrects this test (scratch copies, one per family, a before-and-after comparison); row 1f follows the trap.

---

## Task 2: Packaging

Deferred with the Electron app (D32).

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

**Tools** (corrected 2026-11-21 to the CLI in `packages/cli/src/index.ts`, per traps 8 and 9):

| Tool | Wraps | Family | Notes |
|---|---|---|---|
| `pokemap_render` | `render` | both | Returns the PNG as image content so the agent can *look* at it |
| `pokemap_render_world` | `render-world` | both | Bounded region of the stitched world |
| `pokemap_map_info` | `query` | both | Header, connections, events, split, `layout_version` |
| `pokemap_validate` | `validate` | GBA | Per-layout metatile range, warps, connections |
| `pokemap_encounters` | `encounters` | both | With true percentages |
| `pokemap_where` | `where` | both | Every map a species appears on |
| `pokemap_coverage` | `coverage` | both | Design gaps |
| `pokemap_indicator_suggest` | `indicator suggest` | GBA | Read-only |
| `pokemap_diff` | `diff` | both | Dry-runs a paint given in the call; it does not see an open editor session's pending changes (trap 9) |
| `pokemap_paint` | `paint --yes` | both | **Write.** Gated, see below |
| `pokemap_indicator_add` | `indicator add --yes` | GBA | **Write.** Gated, see below |

The CLI's `indicator list` (GBA) and `event move/add/delete` (GBC) have no tool in this table.

**Requirements:**
- Read tools are unrestricted. **Write tools are off unless the server is started with `--allow-writes`**, and the refusal names the flag. An agent that can silently repaint 1,209 maps is not a feature.
- Every write tool returns the `SavePlan` diff in its result, so the agent sees what it did.
- `pokemap_render` returns real image content, not a file path. The whole point is that the agent can check its own work by looking.
- Errors return refusal codes and fix text verbatim from `write/guards.ts` — an agent that gets "missing-layout-version: run classify_layout_versions.py --write" can act on it.

**Test:** an MCP client harness that calls each tool against a temp copy of the subject repo and asserts shape; plus a test that every write tool refuses without `--allow-writes`.

---

## Task 4: Optional git integration (cancelled)

**Cancelled 2026-11-16 by the user (roadmap D33): PokeMap never relies on git.** The original requirements (`refuseDirtyTree`, `autoCommit`, their settings) were deleted 2026-11-21; they are in this file's history before that date.

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

Updated 2026-11-21 to the subtask table: the two git lines went with Task 4 (D33), and the installer line waits for the deferred 2a (D32).

- [ ] The `gate` skill passes (full suite, typecheck, UI build, subjects unchanged)
- [ ] 1a: the hub serves the built UI and takes port 0
- [ ] 1b: one double-click opens PokeMap on the last project with no terminal, with the hub stopped, with it running, and with `packages/ui/dist` deleted (criterion 1)
- [ ] 3a, 3b: Claude Code calls `pokemap_render` and the image comes back visible in the transcript (criterion 2)
- [ ] 3c: write tools refuse without `--allow-writes`, naming the flag
- [ ] 5: a reader follows the guide on a scratch project
- [ ] 6a, 6b: benchmarks meet the Task 6 targets, with numbers recorded in the PR
- [ ] Both subjects unchanged after a full exploratory session (compared before and after, as the `gate` skill does; trap 6)
