# Task A2 coordinator verification (2026-09-30, final fix commit a49375f)

## Surviving-mutation re-run

Same harness as A1: literal anchor asserted once, narrowest test file, byte-exact restore, tree clean.

| Mutation | Result on a49375f |
|---|---|
| M8 recent guard accepts `unsupported` | RED |
| M10 initial dir prefers `recent[0]` over `current` | RED |
| M16 Up never disabled | RED |
| M17 Up with null parent stays in `dir` | RED |
| M18 drive crumb built as `/C:` | RED |
| M19 `isBrowseResult` without the `dir` check | RED |
| M20 picker Close without `autoFocus` | RED |
| M22 Root `gen` constant | RED |
| M27 entry badge removed | RED |
| SR-F1 confirm Escape without `stopPropagation` | RED |
| SR-F3 in-flight guard removed | RED |
| SR-F4 retry nonce removed | RED |
| SR-F5 drive-top project seeds `C:` | RED (2) |

13/13 red.

## Gate

- `npm test`: 1,780 pass / 0 fail, 112 files, in 4 of 5 runs. The first run had 1 unidentified failure
  that did not recur in the next 4 full runs. That matches RESUME's known "one unidentified Windows test
  fails about once in 8 runs" note. It is not attributed to A2.
- `npm run typecheck`: clean. `npx vite build packages/ui`: passes, no lightningcss warnings.
- `git diff 48b50e8 -- packages/ui/test/`: `M gbc/Root.test.tsx`, `D gbc/useProjectInfo.test.ts`, `A hub/{ProjectPicker,ProjectSwitcher,SwitchConfirmDialog}.test.tsx`, `A hub/guards.test.ts`. `App.test.tsx` and `GbcApp.test.tsx` are unchanged.

## Live-verify, criterion 1 (built-in browser, 2026-09-30)

Ports 5173/5174 were held by dev servers left from the 6b session (started 2026-09-28, pre-A1 code, not
started by this session), so they were left alone. The real `serve.ts` ran with no flags, with a scratch
`--import` preload remapping its `listen(5174)` to 5184, and the real `packages/ui` ran in Vite on 5183
(`configFile: false`, same react plugin, `/api` proxied to 5184). `POKEMAP_HOME` was a scratch dir.

| Step | Observed |
|---|---|
| Hub, no flags, empty home | stdout `pokemap hub on http://127.0.0.1:5184 (no project open)`; `/api/hub` = `{"current":null,"recent":[]}` |
| UI | "Open a project" picker; Browse lists drives `C:`, `D:`; Up disabled; Open disabled on drives |
| Folder browser → GBA | C: → Programming Projects → Pokemon Game. Breadcrumb `C: / Programming Projects / Pokemon Game`. `game` has a GBA badge and Open enabled; `refs` has no badge and Open disabled. Open → GBA app (Map/World/Dungeon), header switcher reads `game` |
| Header → PerfPlus | The modal shows Recent (GBA) and the browser seeded at the current project's parent. Breadcrumb → Programming Projects: `pokecrystal-PerfPlus` has a GBC badge. Open → GBC app (Crystal, Morn/Day/Nite), switcher reads `pokecrystal-PerfPlus` |
| Header → back to GBA | Recent lists GBC first, then GBA. Open GBA → GBA app |
| Unsaved edit, then switch | Pencil-painted one block on NewBarkTown ("Save (unsaved changes)"). Switcher → PerfPlus → "Unsaved edits: 1 map(s) … NewBarkTown". DOM: 1 `.warp-modal__backdrop`, 1 `[aria-modal=true]`, focus on Cancel |
| Real Escape key | Confirm closes; picker back, switcher still open, focus on Close |
| Cancel | Back in the picker. Close → still GBA, NewBarkTown's painted block visible, Save still "unsaved changes". Server: `/api/project` gba; a plain open → 409 `dirtyMaps:["NewBarkTown"]` |
| Forged `Origin: http://evil.example` force-open (curl) | 403 `cross-origin request refused`; the project is unchanged |
| Discard and switch | GBC app |
| Restart (hub killed by PID, rerun with no flags) | stdout `(gbc C:/Programming Projects/pokecrystal-PerfPlus)`; browser reload lands straight in the GBC app |
| Overflow | `scrollWidth === clientWidth` at 1024 and 1280 with the switcher open; 0 picker rows overflow |

Console: the expected 409 responses, plus 1 `ERR_CONNECTION_REFUSED` during the restart gap. No other
errors.

Invariants: the GBA subject's porcelain is byte-identical before and after (the edit lived only in memory
and was discarded). PerfPlus is clean. The real `~/.pokemap/` is still absent.

## Declined / deferred

- SR-F6 remainder: Up at POSIX `/` and UNC breadcrumbs (declined, Windows-first dev tool).
- SR-F4: the server's 403 message isn't shown on a browse error, because the shared `fetchGuarded` only
  reports the status. The stale listing is now cleared and a retry works.
