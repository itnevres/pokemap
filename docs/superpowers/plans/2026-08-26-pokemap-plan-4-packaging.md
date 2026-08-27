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

## Task 1: Electron shell

**Files:** Create `packages/electron/package.json`, `src/main.ts`, `src/preload.ts`, `electron-builder.yml`

**Requirements:**
- The main process starts the existing `server` in-process on a random free port and loads the built `ui` from disk. `ui` code does not change; it still talks HTTP to `127.0.0.1`.
- Native project picker replacing `pokemap.config.json` for end users; the config file remains the CLI's source. Recent projects list persisted in Electron's userData, **never in the decomp**.
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

**Tools:**

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
- Read tools are unrestricted. **Write tools are off unless the server is started with `--allow-writes`**, and the refusal names the flag. An agent that can silently repaint 1,214 maps is not a feature.
- Every write tool returns the `SavePlan` diff in its result, so the agent sees what it did.
- `pokemap_render` returns real image content, not a file path. The whole point is that the agent can check its own work by looking.
- Errors return refusal codes and fix text verbatim from `write/guards.ts` — an agent that gets "missing-layout-version: run classify_layout_versions.py --write" can act on it.

**Test:** an MCP client harness that calls each tool against a temp copy of the subject repo and asserts shape; plus a test that every write tool refuses without `--allow-writes`.

---

## Task 4: Optional git integration

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
- Cold open of the subject repo (1,214 maps, 1,020 layouts): under 3 seconds to an interactive map list.
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
