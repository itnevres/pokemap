# D4 coordinator record — final mutations, live criteria 6/7, Phase D close

Session: Claude Code coordinator, 2026-10-04, resuming the ChatGPT/Codex run at `042f451` (code `1c49c53`).

## Final narrow reviews

Both were already committed when this session began, so no fix round was needed and `/root/d4_implementer` was not resumed:

- `task-D4-spec-final-review.md` (`6e8e1d7`): **PASS**. The GBA selection assertion now reads the original `canvas.parentElement` straight after the right-button sequence, which closes residual F3.
- `task-D4-quality-final-review.md` (`042f451`): **PASS**. The measured two-axis clamp with an 8 px inset closes the popup clipping finding.

Final D4 code commit: **`1c49c53`**.

## Coordinator mutation rerun on `1c49c53`

Harness: `C:/Users/Serve/AppData/Local/Temp/pokemap-phase-d-coordinator/d4-coordinator-mutations.mjs`, outside the repo. Method:

- Every witness is first run unmutated and must pass with ≥1 pass and 0 fail. All 8 witnesses were green.
- Each literal anchor must occur exactly once. CRLF is normalised per file, since the server and sidecar sources use CRLF.
- One mutant at a time. The narrowest file and title run via `node node_modules/vitest/vitest.mjs run <file> -t <title>`.
- Each source is restored from its in-memory bytes in `finally`, then byte-compared.
- The requested IDs are cross-checked against the reported IDs: 13 requested, 13 reported, none missing.

Where a mutant has a site in each family, both sites were mutated as separate cases.

| ID | Mutation (anchor → replacement) | Witness | Result |
|---|---|---|---|
| D4-M1 | `conflictKey` full tuple → `[map, viaA.from, viaB.from, dx, dy]` | core `uses the full ordered tuple…` | RED |
| D4-M2-gbc / -gba | accept route `writeSidecar(…)` → `void writeSidecar` | `gbcRoutes` Route17 round-trip / `world` scratch-root test | RED / RED |
| D4-M3-gbc / -gba | accept route also writes `manualPlacements[map] = {-999,-999}` | same two route tests | RED / RED |
| D4-M4-gba / -gbc | `accepted ? acceptedColor : conflictColor` → `conflictColor` | GBA `independently acknowledges two same-map badges…` / GBC `accepts a Route17 badge, persists on remount…` | RED / RED |
| D4-M5-gbc / -gba | unknown-key `some(...)` guard → `if (false)` | both route tests | RED / RED |
| D4-M6 | sidecar `acceptedConflicts.every(string)` member guard removed | `defaults acceptedConflicts and rejects non-string entries…` | RED |
| D4-M7-gba / -gbc | hook `setError(…)` → `void cause` | GBA `shows a malformed accept response…` / GBC `shows a rejected POST response…` | RED / RED |
| D4-M8 | `offsets.set(key, index * step)` → `offsets.set(key, 0)` | GBA two-same-map-badges test | RED |

Afterwards: `git status` showed only the pre-existing untracked `.codex/`, and there was no source diff. PerfPlus was clean with no `.pokemap`. The GBA subject world and dungeons hashes were unchanged (`b285bbf…` / `f73f9b7…`). Each D4-M2/M3/M5-gbc run wrote PerfPlus's sidecar, and the test's own read-guarded `finally` removed it each time.

## Live verification (criteria 6 and 7)

Setup:

- The documented scratch ports. The real `serve.ts` ran under the `preload.mjs` `listen(5174→5184)` remap, and the programmatic Vite ran on 5183 proxying to 5184. Nothing was listening on 5173, 5174, 5183 or 5184 beforehand.
- `POKEMAP_HOME` = `…/pokemap-phase-d-coordinator/d4-home`.
- `vite.mjs` needed two Windows fixes. It now imports through `pathToFileURL(require.resolve(...))`, because a bare `C:` path fails as an ESM URL. Its `createRequire` base is now `packages/ui/package.json`, because `@vitejs/plugin-react` is installed only there.
- Browser: the Playwright MCP `browser_run_code_unsafe` at 1280×800, with `document.visibilityState === "visible"` checked first.

### GBC: PerfPlus, opened directly as the hub's project

**Criterion 7: counts.** `/api/world` returns 391 placements, and **158** of them draw by default: TOWN 23 + ROUTE 54 + CAVE 42 + DUNGEON 39. The tree greys out **233** rows (INDOOR 208 + GATE 25).

**Criterion 7: near-warp placement** (block units; gap = edge-to-edge distance):

| Map | Neighbour | Gap |
|---|---|---|
| IlexForest (40,259 15×27) | Route34 (70,251) | 15 blocks to the west, vertically overlapping |
| IlexForest | AzaleaTown | 25 blocks |
| DarkCaveVioletEntrance (122,197) | Route31 (120,215) | **0**: touching on the south edge |
| BurnedTower1F (73,166) | EcruteakCity (75,179) | 4 blocks north (the configured gap) |
| BurnedTowerB1F (73,153) | BurnedTower1F | 4 blocks north |

**Criterion 7: warps.**

- The Warps switch showed 14 markers around Route17 (LOD ≥ 8 px/block).
- Double-clicking a marker opened the `ViridianGym preview` dialog with a rendered `GbcMapCanvas`. Escape closed it.

**Criterion 7: Dungeon tab.**

- The tab showed `Select or create a dungeon`.
- Creating a group with seed `BurnedTower1F` gave a 35-map group. This is the GBA-parity outgoing-warp BFS: it leaves through EcruteakCity into Pokecenter2F and the Colosseum, Mount Mortar and Tin Tower. The scoped canvas (`35 maps`) drew 24 connection lines.
- A second group with no seed, with BurnedTower1F and BurnedTowerB1F added through "Add map…", gave a `2 maps` scoped view. It drew 18 warp lines between the floors (screenshot inspected).
- Both groups were deleted through "Delete dungeon", and `/api/dungeons` returned `[]`.

**Criterion 6: GBC.**

- Two `--danger` (239,68,68) badge clusters. Their tooltips read `Route17 placed via Route16; Route18 disagrees by (0,1)` and the Route18 counterpart.
- Right-clicking the map body opened no action. Right-clicking the Route17 badge opened `Accept conflict`.
- After clicking it:
  - the status read `2 conflicts · 1 accepted`;
  - the badge pixel turned `--text-muted` (100,116,139) with a ✓;
  - the tooltip began `Accepted (right-click to un-accept).`;
  - `/api/world` reported Route17 `accepted: true`.
- After a page reload, the status still read `2 conflicts · 1 accepted`.
- Right-clicking the badge again offered `Un-accept conflict`. Clicking it restored `0 accepted` and the `--danger` pixel.

### GBA: scratch mirror `…/pokemap-phase-d-coordinator/gba-mirror`

The mirror links the corpus read-only through junctions, and its own `.pokemap` is a copy at `b285bbf…`. That sidecar has `dungeonAutoLayout:false`. Starting status: `placed 186 · hidden 2 · unplaced 1023 · 19 conflicts · 0 accepted`.

**Criterion 6: GBA.**

- Jumping to Route111 showed its two badges 22 px apart (x 723 and 745, y 116). Their tooltips named Route113/MauvilleCity and Route112/MauvilleCity.
- Accepting the first:
  - gave `19 conflicts · 1 accepted`;
  - turned that badge muted while the other stayed `--danger`;
  - showed the accepted tooltip.
- After a reload, the status still read `1 accepted` and the pixel was still muted.
- Escape closed the action.
- Un-accepting restored `0 accepted` and the `--danger` pixel.

### Restoration

Both servers and the Vite process were stopped by PID.

- PerfPlus's `.pokemap/` was created by this session at 21:41; it was absent before. Its contents at the end were the defaults (`dungeons: []`, `acceptedConflicts: []`). Both files and the directory were removed, PerfPlus `git status` is clean, and `.pokemap` is absent.
- The mirror's `world.json` had been re-serialised with `acceptedConflicts: []` (`3946120…`). It was restored to `b285bbf…` by copying it from the read-only subject's identical bytes. The mirror's `dungeons.json` stayed at `f73f9b7…`.
- The Playwright MCP log `console-2026-10-05T04-40-32-815Z.log` was this session's and has been removed. The three older logs are not this session's and were left.
- Screenshots are kept outside the repo in the scratch directory: `d4-gbc-world.png`, `d4-gbc-action.png`, `d4-gbc-accepted.png`, `d4-gbc-warps.png`, `d4-gbc-warp-modal.png`, `d4-gbc-dungeon.png`, `d4-gbc-dungeon-floors.png`, `d4-gba-route111.png`, `d4-gba-accepted.png`.

## Phase D gate

This ran through `final-gates.mjs`: one suite at a time, output captured to the local `phase-d-final-*.log` files (gitignored), and both projects' sidecars snapshotted and restored.

**First run, on `042f451`:** 2,037 pass / 3 fail. Typecheck (core and ui) was clean and the build passed. One of the 3 failures was new:

- **The new failure was a D3 regression in an existing test.** `packages/ui/test/gbc/Root.test.tsx` › `a gbc project never mounts App (its Dungeon button is absent)…` asserted `queryByText("Dungeon") === null` to prove that App isn't mounted. D3 gave `GbcApp` its own Dungeon button, so the discriminator went stale. It stayed red when rerun in isolation. Neither D3's implementer nor its reviewers ran that file.
- **Fix (`1b558b0`, test only).** The test now requires exactly one `View` group and one `Dungeon` button. If App were mounted alongside GbcApp, there would be two of each.
- **Red proof** (`root-redprove.mjs`, in-memory restore, byte-equal): the baseline passes. The mutant `Root` returns `<><GbcApp/><App/></>`, and the test fails.

**Rerun on `1b558b0`:**

- `npm test`: **2,038 pass / 2 fail** (121 files).
- The 2 failures are the known pair `world.test.ts` › `returns placements…` (186 vs 1,209) and `respects the dungeonAutoLayout flag`. Rerun in isolation, they give the same 186 values. They come from the subject's persisted `dungeonAutoLayout:false` (`b285bbf…`), and are the same pair as the Phase D start baseline (1,985 / 2).
- **0 new failures, +53 tests.**
- Typecheck is clean (`tsconfig.base.json` and `packages/ui`), and `vite build` passes.
- Machine-readable results: `phase-d-final-gates.json`.

## External state at close

The state is identical to `task-D4-external-state-before.txt`:

- GBA HEAD `718b89f…`, with the same 6 modified files plus the untracked `docs/human-tasks-notes.md`. World `b285bbf…`, dungeons `f73f9b7…`.
- PerfPlus HEAD `81ededb…`, clean, `.pokemap` absent.
- Ports 5183 and 5184 are free.
- The unrecovered pre-baseline GBA hash `4983f97…` (recorded in `task-D-coordinator.md`) still stands. Nothing here claims the original bytes were restored.
