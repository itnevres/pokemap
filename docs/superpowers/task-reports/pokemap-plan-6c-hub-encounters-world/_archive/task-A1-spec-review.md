# Task A1 spec-compliance review (adversarial)

Diff: `c2dbb62..03e51af` (6 commits). Reviewer ran everything below; implementer report not trusted.

## Verdict: ISSUES

Implementation matches every binding design point (§1-§5) and tests 1-16. No behaviour-changing extras. Issues = 1 Important test gap (dirtyMaps `isDirty` filter unguarded), 9 Minor (spec gaps, edge cases, doc drift, further test gaps). Nothing blocks the next task if F1 gets a test.

Verified OK:
- open order 400→404→422→409→500→swap (hub.ts:118-158); M15/M16/M1/M7 red confirm order.
- new handler created before old disposed (hub.ts:142-156); failure → 500, old stays current (probe + M7).
- disposed → 503 `{error:"project closed"}` at top of both handlers (index.ts:224, gbcRoutes.ts:289).
- `safeNorm` keeps `X:/`; `dir=C:` / `dir=C:/` → `dir:"C:/"`, `parent:null` (probed).
- dirs only; `.`/`$` excluded; `localeCompare` base sort; drives A-Z via `existsSync`.
- recent: dedupe norm + win32 case-insensitive, cap 10, corrupt/wrong shape → `.bad` (overwrite), `POKEMAP_HOME`, pretty + trailing `\n`.
- serve.ts: config read only under `--gbc`; `--gbc` wins over positional; named refusal kept; no-args reopens `recent[0]` if probe is gba/gbc, failure → stderr, hub keeps running; status line format per spec. launch.json unchanged (correct; `server` = no-args → hub).
- listeners bind `127.0.0.1` (hub.ts:193, index.ts createServer).
- Handler split behaviour-neutral: `git diff c2dbb62 03e51af --name-status -- packages/server/test/` = only `A hub.test.ts`, `A recent.test.ts`. Route bodies in index.ts/gbcRoutes.ts untouched (diff hunks are only the wrapper head/tail; no re-indent). `/api/project` lines unchanged. `info` objects byte-equal to `/api/project` payloads.
- Browse reads no file contents (readdirSync + existsSync/statSync only). Traversal yields only dir names + family (by design).
- Implementer claims checked: gate numbers, M1-M7 red, test counts (family 16 = 9+7, recent 7, hub 12), Route123 appears only in hub.test.ts. serve.ts manual transcript NOT re-run (hard-coded 5174 held by PID 22452, not ours); logic reviewed instead.

## Findings

| id | sev | file:line | what | evidence | fix |
|---|---|---|---|---|---|
| F1 | Important | test gap for editSessions.ts:76 | `dirty()`'s `isDirty` filter untested: listing every OPEN session (clean or not) passes all tests. Real regression = 409 after merely viewing/beginning a paint on a map. | M8 SURVIVOR (hub + editSessions tests green) | hub test: GBA open, `paint/begin` (or begin+end no apply) on a map → `open GBC` without force → 200 (or `dirtyMaps()` = `[]`). |
| F2 | Minor | hub.ts:115-118 | Body `null` → `parsed.path` TypeError → `.catch` → **500**; spec step 1 says 400. | probe: `POST "null"` → 500, log `Cannot read properties of null` | `if (typeof parsed !== "object" \|\| parsed === null) return send(400,…)`. |
| F3 | Minor (spec gap) | index.ts:224 / gbcRoutes.ts:289 | Disposed guard only at handle entry. Async POST routes (`readBody().then`) whose headers arrived pre-swap run their body after dispose: edit routes write into the cleared/orphaned store and answer 200; `/api/world/placement`, `/api/world/dungeons`, `POST/PATCH /api/dungeons` would write old project's sidecar post-dispose. | probe: headers of `paint/apply` sent, `force:true` swap to GBC (200), body sent → **200** with blocks from disposed GBA handler | Re-check `disposed` after body read (e.g. handler-local `readBody` wrapper that rejects with 503 when disposed) — touches route bodies, so a later task. |
| F4 | Minor | hub.ts:37-40, 105 | Browse path edge cases: `dir=.` → `{dir:".",parent:"."}` (relative never resolved, "up" loops); explicit `dir=/` → `norm("/")=""` → 404 on win32; on posix `parentOf("/x")` = `safeNorm("/")` = `""` not `"/"`; UNC `//srv/share` dirname = itself (loop). | probe: `browseDot {dir:".",parent:"."}`, `browseSlash 404` | `resolve()` first; map `""`→`"/"` in `safeNorm`; parent null when `dirname(dir)===dir`. |
| F5 | Minor | hub.ts:157 | `pushRecent` throwing (unwritable home) after swap → client gets 500 although the swap committed. | code read | wrap `pushRecent` in try/catch → log, still 200. |
| F6 | Minor | serve.ts:315-319 | Spec: keep `--gbc` doc comment. Second paragraph (why reading `gbc.projectPath` here is a sanctioned dev-server convenience, not a CLI fallback; "the one sanctioned non-test reader") dropped. | `git show c2dbb62:packages/server/src/serve.ts` vs HEAD | restore paragraph. |
| F7 | Minor | gbcRoutes.ts:24, 150, 196 | Stale `createGbcServer` references after deletion (header comment only partly updated). | grep | s/createGbcServer/createGbcProjectHandler/. |
| F8 | Minor | hub.test.ts / recent.test.ts | Further test gaps (all survivors, see table): sort removed (M11/M11b; NTFS readdir already returns this fixture sorted), raw path stored (M17), GBC disposed guard + message (M19/M34), pretty-print (M21), bind host (M23), `open` on a FILE → 404 (M25). | mutation table | add `_under`/`Zed` names to test 4 (NTFS vs ICU order differ); push `C:\\x\\y\\` alone → stored `C:/x/y`; test 10 variant with GBC as old handler; assert raw file text ends `}\n` with 2-space indent; open a file → 404. Bind host: `hub` could expose `address()` or accept a test hook — optional. |
| F9 | Minor (pre-existing class) | hub.ts:111 | No Origin/Host/content-type check: any web page can send a no-preflight `text/plain` POST `{path,force:true}` to `127.0.0.1:5174/api/hub/open` → discards unsaved edits; DNS rebinding could read `browse` listings. Same exposure already exists for `/commit` etc., hub widens it (filesystem-wide dir enumeration). | code read | follow-up: reject non-`application/json` POSTs or check `Origin`/`Host` ∈ localhost. |
| F10 | Minor | hub.ts:52/108 | Unlistable dir (EPERM) → 500 with raw `EPERM … scandir` message. | probe: `dir=C:/System Volume Information` → 500 | map EACCES/EPERM → 403 `{error}`. |

Notes (no action): swap-then-dispose (hub.ts:154-156) vs spec's "dispose, swap" wording — both sync, adjacent, after successful create; unobservable. Whitespace-only `path` → 400 (spec implies 404) — stricter, harmless. `/api/hubble`-style paths caught by `startsWith("/api/hub")` → 404; no such project route exists. Concurrent opens: each `.then` is sync after body read → serialised, last wins, loser disposed (probe: both 200, `/api/project` consistent). Re-open same root / `force:true` with nothing dirty → 200 fresh handler (probe). Trailing-slash + backslash root → 200, `info.root` and recent normalised (probe). `createHub({open})` failure rejects before listen; no leaked listener. `hub.close()` doesn't `dispose()` current — not in spec, memory only.

## Mutations

Harness: perl literal replace, anchor count asserted ==1 (all 35 applied — no ANCHOR-MISS), narrowest test file(s), restore from `git show 03e51af:<path>`, `git hash-object` == blob verified, `git status --porcelain` clean after each (editSessions.ts showed stat-only `M` after CRLF restore of an LF working copy; hashes identical, re-restored as LF → clean; did not affect later runs). Nothing committed; probe test file deleted.

| id | mutation | test run | result |
|---|---|---|---|
| M1 | skip dirty check | hub | RED (test 10) |
| M2 | drop `old?.dispose()` | hub | RED (test 10) |
| M3 | recent no dedupe | recent+hub | RED (recent ×3, hub 9) |
| M4 | browse lists files | hub | RED (4) |
| M5 | no-project 503→404 | hub | RED (2) |
| M6 | `safeNorm` = `norm` (drive roots) | hub | RED (6) |
| M7 | dispose old before create | hub | RED (failed-second-open corpus test; spec test 8 alone would not catch) |
| M8 | `dirty()` ignores `isDirty` | hub+editSessions | **SURVIVOR** (F1) |
| M9 | `.`-exclusion dropped | hub | RED (4) |
| M10 | `$`-exclusion dropped | hub | RED (4) |
| M11 | sort removed | hub | **SURVIVOR** (F8) |
| M11b | sort → default `.sort()` | hub | **SURVIVOR** (F8) |
| M12 | `.bad` not written (rm instead) | recent | RED (×2) |
| M12b | skip pre-rm of existing `.bad` | recent | **SURVIVOR — equivalent** (`renameSync` overwrites on win32/posix; verified) |
| M13 | cap 10→11 | recent | RED |
| M14 | `parent` non-null at drive root | hub | RED (6) |
| M15 | `force:"yes"` accepted | hub | RED (7) |
| M16 | 422 check before 404 | hub | RED (7) |
| M17 | `pushRecent` stores raw path | recent+hub | **SURVIVOR** (F8) |
| M18 | GBA disposed guard off | hub | RED (10) |
| M19 | GBC disposed guard off | hub+gbcRoutes | **SURVIVOR** (F8) |
| M20 | `dispose` skips `closeAll` | hub | RED (10) |
| M21 | recent.json not pretty-printed | recent+hub | **SURVIVOR** (F8) |
| M22 | startup `open` skips `pushRecent` | hub | RED (11) |
| M23 | hub binds `0.0.0.0` | hub | **SURVIVOR** (F8) |
| M24 | `force` ignored (409 always when dirty) | hub | RED (10) |
| M25 | open: drop `isDirectory` (file → 422 not 404) | hub | **SURVIVOR** (F8) |
| M26 | browse `dir` not normalised | hub | RED (4) |
| M27 | probe: drop `attributes.asm` marker | family | RED |
| M28 | open skips `pushRecent` | hub | RED (9) |
| M29 | no `current = next` | hub | RED (9, M7-test, 10) |
| M30 | `/api/hub/*` 404 guard off | hub | RED (3) |
| M31 | `POKEMAP_HOME` ignored | recent | RED |
| M32 | case-insensitive key dropped | recent | RED (×3) |
| M34 | GBC 503 message changed | hub | **SURVIVOR** (F8) |

(M33 dropped before running — multi-line LF anchor would not match CRLF file; not counted.)
Totals: 35 run, 25 red, 10 survivors (1 equivalent: M12b).

## Gate

- `npm test`: 1,705 pass / 0 fail, 109 files.
- `npm run typecheck`: clean.
- `npx vite build packages/ui`: built OK.
- `git status --porcelain` clean afterwards (only this report is new).
