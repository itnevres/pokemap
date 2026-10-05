# D3 coordinator record — final mutation rerun

Session: Claude Code coordinator, 2026-10-04. The D3 spec requires the coordinator to rerun D3-M1–M6 on the final fix commit. No committed record of that run existed: only uncommitted scratch harnesses (`pokemap-d3-mutations*.mjs`) from the ChatGPT/Codex session, with no recorded results. So it was rerun here.

The D3 reviews all passed with no open findings:
- `task-D3-integrated-spec-fix-review.md` (`18a9ef7`): SR1–SR3 resolved.
- `task-D3-integrated-quality-fix-review.md` (`c3b4409`): its one test-isolation finding was fixed by `f7f910e` / `fe75a3c`.

The final D3 code is `410acfb`, plus the test-only `f7f910e` and `fe75a3c`.

## Harness

The harness is `C:/Users/Serve/AppData/Local/Temp/pokemap-phase-d-coordinator/d3-coordinator-mutations.mjs`, which uses the same method as the D4 harness:
- an unmutated green baseline for every witness;
- each literal anchor asserted exactly once, with CRLF normalised;
- one mutant at a time;
- in-memory restore in `finally`, then a byte compare;
- the requested IDs cross-checked against the reported IDs.

M3 has two filter sites, the visible memo and the drop handler, so each was mutated separately.

## Results, first pass (`f6add72`)

6 of 7 cases went RED. **D3-M3-visible survived.** Removing `if (mapFilter && !mapFilter.has(p.map)) continue;` from the `visible` memo left `scopes hidden members, excludes outsiders…` green.

The mutant is not equivalent. That fixture's `Outside` map (50,60) lies beyond the scoped fit (x 10–40, y 20–50), so viewport culling alone kept it from drawing. In real data an outsider often lies inside a scoped view: EcruteakCity sits 4 blocks from the BurnedTower floors.

**Fix (`9400241`, test only).** The new test `never draws an outsider that lies inside the scoped view` moves `Outside` to (22,32), inside the scoped view, and asserts that `Outside.png` is never requested. It is green on real code, and red under D3-M3-visible. The whole file passes 106/106 and the UI typecheck is clean.

## Results, final (`9400241`)

| ID | Anchor → replacement | Witness | Result |
|---|---|---|---|
| D3-M1 | `events.warps[event.destWarp - 1]` → `[event.destWarp]` | gbcRoutes `pins BurnedTower1F index 2 to B1F index 0` | RED |
| D3-M2 | `(placement.x + event.x / 2) * zoom` → `(placement.x + event.x) * zoom` | `renders the exact raw-half marker and both SVG endpoints` | RED |
| D3-M3-visible | the visible-memo `mapFilter` check removed | `never draws an outsider that lies inside the scoped view` | RED |
| D3-M3-drop | the drop `if (mapFilter && !mapFilter.has(map)) return;` → `if (false)` | `scopes hidden members, excludes outsiders…` | RED |
| D3-M4 | the line `!mapFilter.has(w.destMapName)` → `false` | same | RED |
| D3-M5 | the dungeon POST `writeDungeons(...)` → `void writeDungeons` | gbcRoutes `roundtrips explicit and seeded dungeons` | RED |
| D3-M6 | `isGbcWarpsPayload` family check dropped | `shows malformed warp payload errors` | RED |

7 requested, 7 reported, none missing.

After the run, the tree was clean apart from the pre-existing `.codex/`, and PerfPlus `.pokemap` was absent. D3-M5 writes PerfPlus `dungeons.json`, and the test's own `finally` restored it.
