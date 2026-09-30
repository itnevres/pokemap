# Task A2 spec-compliance review

Diff `48b50e8..cbd2076`. Reviewer: adversarial spec pass. Nothing committed; tree clean after every mutation/probe.

## Verdict: ISSUES (0 Critical / 1 Important / 5 Minor + 9 mutation survivors, all test-gap)

Design + tests 1-6 implemented as specified; U1 discipline clean; binding UI rules clean. One real behaviour hole (Escape in confirm closes the whole switcher) that the spec's own "never two stacked backdrops" line was meant to prevent.

## Verified OK (independently)
- Guards: `isHubState`/`isBrowseResult`/`isOpenConflict` exact-literal family checks; reuse `isRecord`/`isProjectInfo`; types from `@pokemap/core/src/hub/wire.js`, not server.
- `openProject`: body read once `r.json().catch(()=>null)`; 200+guard→opened, 409+guard→conflict, else body `.error` or `Open failed (status N)`; try/catch → never throws. Tests cover 200/409/422/404/500/thrown/bad-200/unparseable.
- Picker order recent → browse → typed form; heading "Open a project"; Close only with `onClose` (+autoFocus).
- Initial dir current→recent[0]→null; URL `?dir=`+`encodeURIComponent`, bare `/api/hub/browse` for null.
- Breadcrumb win32: `C:/x/y` → crumbs `C:`→`C:/`, `C:/x`, `C:/x/y` (path correct; label `C:`).
- Up: `parent ?? null`; disabled at `dir===null`. Entry Open disabled unless gba/gbc. Badge none for null.
- Stale browse: `useRef` counter checked in both `.then`/`.catch`.
- Open errors inline `role="alert"` verbatim (`result.error`).
- 409 → picker returns `<SwitchConfirmDialog>` instead of body; Cancel = `setConflict(null)` (no POST); confirm → `openProject(path,true)` → body `{path,force:true}`.
- Confirm: SaveDialog shell (backdrop Escape→onCancel, role/aria-modal/aria-label="Unsaved edits", Cancel autoFocus), danger btn `disabled={submitting}`, inline error.
- Switcher: `map-canvas__btn hub-switcher__btn`, title=root, aria-label per spec, backdrop Escape, panel `warp-modal__panel hub-picker--modal` role/aria-modal/label "Switch project".
- Root: exact spec shape; key `family:root:gen`; gen bumps every `onOpened`; picker when `current` null; alerts/loading unchanged.
- App/GbcApp: optional `switcher?: ReactNode`, last child of `app__toolbar`, nothing else changed.
- `useProjectInfo.ts` + test deleted; `grep -rn useProjectInfo packages/ui` → 0 hits; the 3 doc comments now name Root's `/api/hub` fetch.
- U1: `git diff --name-status 48b50e8 cbd2076 -- packages/ui/test/` = M `gbc/Root.test.tsx`, D `gbc/useProjectInfo.test.ts`, A 4× `hub/*`. `App.test.tsx`/`gbc/GbcApp.test.tsx` byte-identical (`git diff --quiet` ok). No server/core files touched.
- Root.test original 6 intents all survive case-by-case: loading placeholder; gba→Dungeon; gbc→Time of day group; 500→alert `^Could not open project: `+`500`; bad shape→alert naming `n64` (now via `current.family`); gbc never mounts App + no GBA-only fetches. +4 new (current null picker / no `/api/groups`; switcher in both shells; 2 re-key).
- Rules: no jest-dom; no `.btn`; every `var(--…)` in new CSS (21 tokens) defined in `:root`; no `*/` inside comment bodies (styles.test strict parse green); `min-width:0` on `.hub-picker__path`, `.hub-picker__entry-name`, `.hub-picker__form-label`; only `set…((` updater is Root's `setOpened(o=>({info,gen}))` — no nested setter. GETs all via `useGuardedFetch`/`fetchGuarded` with guards + visible error.
- Implementer report claims (commits, gate, M1-M7 red) reproduced.

## Findings

| id | sev | file:line | what | evidence | fix |
|---|---|---|---|---|---|
| F1 | Important | `src/hub/SwitchConfirmDialog.tsx:37-42` (+ `ProjectSwitcher.tsx:48-53`) | In the switcher modal, Escape on the confirm dialog bubbles from the inner backdrop to the switcher's backdrop: inner `onCancel` + outer `setOpen(false)` both fire → whole modal closes, not "back to the picker". Safe (no POST) but not the spec'd Cancel semantics; user meant "cancel the discard". | Scratch probe (deleted): open switcher → 409 → keyDown Escape on focused Cancel → "Switch project" dialog present=false, confirm present=false. | `e.stopPropagation()` in SwitchConfirmDialog's Escape branch (1 line). Add test in ProjectSwitcher.test: 409 → Escape → "Switch project" dialog still present, "Unsaved edits" gone. |
| F2 | Minor (spec-design call) | `src/hub/ProjectPicker.tsx:146-150` inside `ProjectSwitcher.tsx:47-58` | Spec "never two stacked backdrops" violated in modal use: the confirm (own SaveDialog-style backdrop, as the spec also mandates) renders inside the switcher's backdrop/panel → 2 `.warp-modal__backdrop`, 2 `role=dialog aria-modal`; visually double scrim + empty 640×600 outer panel behind the confirm. Root (non-modal) path has exactly one. Spec-internal contradiction, implementer followed both clauses literally. | Probe: `querySelectorAll(".warp-modal__backdrop").length === 2`, 2 dialogs. | Coordinator decide: accept (document) or give the confirm an `embedded` mode (no own backdrop) when `onClose` present. F1's stopPropagation is needed either way unless embedded. |
| F3 | Minor | `src/hub/ProjectPicker.tsx:120-130`, 179, 217-224, 246 | No in-flight guard on picker opens: double-click Open (recent/entry/submit) posts twice → server swaps handler twice (2nd disposes the 1st new handler), `onOpened` twice → 2 gen bumps/remounts. | Probe: 2 clicks → posts=2, onOpened calls=2. | `opening` state (or ref) — early-return in `attemptOpen` + `disabled` on Open buttons/submit while pending. |
| F4 | Minor | `src/hub/ProjectPicker.tsx:100-114`, 202-209 | Browse into a 403 folder (A1 EPERM / cross-origin): alert shows `GET /api/hub/browse?dir=%2Ftmp%2Flocked -> 403` — server's message dropped by `fetchGuarded`'s status-only error. Old listing + breadcrumb stay displayed under the alert; re-clicking the same folder is a no-op (`dir` unchanged → effect doesn't rerun) so no retry. | Probe: alert text as quoted; retry click refetched=false; old entries still shown. | Clear `browseResult` (or keep and label) on error; retry via a nonce/`dir` reset. Optional: `fetchGuarded` include body `.error` (shared helper — out of scope, flag only). |
| F5 | Minor | `src/hub/ProjectPicker.tsx:24-31` (`guessParent`) | Project at a win32 drive top level (`C:/pokeemerald`) seeds `?dir=C%3A`; server does `resolve("C:")` = drive-relative CWD on win32, not `C:/` → initial browse lands in the server's cwd. | Probe: initial URL `/api/hub/browse?dir=C%3A`. | If result matches `/^[A-Za-z]:$/` append `/`. |
| F6 | Minor | `ProjectPicker.tsx:85-89`, 206; `breadcrumbOf` 41-55 | Edge UX: `/api/hub` fails → `dir` stays `undefined` → no browse ever starts, Up enabled (only `null` disables) and jumps to root list; POSIX at `/` (dir "/", parent null) Up enabled and re-fetches `/`; UNC `//srv/share` breadcrumb builds `/srv`-style paths. 503 never reaches the picker (hub routes precede the 503 gate) — fine. | Probe: hub 503 → "Could not load projects: GET /api/hub -> 503", Up disabled=false. Code read for POSIX/UNC. | Optional: disable Up when `browseResult?.dir == null && browseResult?.parent == null`; start null-dir browse on hub error. |

Focus after confirm Cancel (modal): picker body remounts → Close `autoFocus` refires → focus back inside modal, Escape still works (by code read; tree swaps from confirm to `.hub-picker` element).

## Mutations (27 run; each applied via exact-anchor replace asserting 1 match, narrow file run, restored by writing the original bytes back, `git status --porcelain` clean for code each time — only an untracked sibling `task-A2-quality-review.md` from the parallel reviewer appeared transiently). No anchor skipped.

| id | mutation | test file | result |
|---|---|---|---|
| M1 | Root key = `family` only | gbc/Root.test | RED (2: both re-key) |
| M2 | confirm Cancel also calls `confirmForceOpen` | hub/ProjectPicker.test | RED (409 Cancel) |
| M3 | entry Open enabled for `unsupported` | ProjectPicker.test | RED |
| M4a | `openProject` 409 branch `false &&` | hub/guards.test | RED |
| M4b | same | ProjectPicker.test | RED (both 409 tests) |
| M5 | confirm Cancel drops `autoFocus` | hub/SwitchConfirmDialog.test | RED |
| M6 | stale-browse check removed (`.then`) | ProjectPicker.test | RED (stale) |
| M7 | `isOpenConflict` `Array.isArray` only | guards.test | RED |
| M8 | RecentEntry guard accepts `"unsupported"` | guards.test | **SURVIVOR** |
| M9 | Up → `setDir(null)` always | ProjectPicker.test | RED (Up, stale) |
| M10 | initial dir prefers `recent[0]` over `current` | ProjectPicker.test | **SURVIVOR** (fixture: both parents `/tmp`) |
| M11 | initial dir always null | ProjectPicker.test | RED (6) |
| M12 | GbcApp drops `{switcher}` | gbc/Root.test | RED (3) |
| M13 | danger btn `disabled={false}` | SwitchConfirmDialog.test | RED |
| M14 | open error → generic "Open failed" | ProjectPicker.test | RED (422, 404) |
| M15 | switcher backdrop Escape handler removed | hub/ProjectSwitcher.test | RED |
| M16 | Up `disabled={false}` (not at dir null) | ProjectPicker.test | **SURVIVOR** |
| M17 | Up with null parent stays in `dir` (not root list) | ProjectPicker.test | **SURVIVOR** |
| M18 | breadcrumb win32 drive seg → `/C:` | ProjectPicker.test | **SURVIVOR** (no breadcrumb test; implementer flagged) |
| M19 | `isBrowseResult` drops `dir` type check | guards.test | **SURVIVOR** |
| M20 | picker Close drops `autoFocus` | ProjectSwitcher.test | **SURVIVOR** (Escape test fires on backdrop directly, not on focused el) |
| M21 | `openProject` 200 skips `isProjectInfo` | guards.test | RED (2) |
| M22 | Root `gen: 1` constant | gbc/Root.test | **SURVIVOR** (only one re-open; a 2nd same-root forced re-open wouldn't remount) |
| M23 | confirm posts without `force` | ProjectPicker.test | RED |
| M24 | App drops `{switcher}` | gbc/Root.test | RED |
| M25 | confirm backdrop Escape removed | SwitchConfirmDialog.test | RED |
| M26 | `isBrowseResult` drops `parent` check | guards.test | RED |
| M27 | browse-entry badge removed | ProjectPicker.test | **SURVIVOR** |

Spec M1-M7: all RED (confirmed). Survivors 9: M8, M10, M16, M17, M18, M19, M20, M22, M27 — all test gaps, code correct. Highest value to close: M10 (spec explicitly says "assert the exact URL" for parent-of-current; use a fixture where `current.root` and `recent[0]` differ), M20 (spec-named reason for Close autoFocus; assert `document.activeElement` = Close on open, or keyDown on `document.activeElement`), M22 (re-open same root twice), M17/M16 (Up at null parent / disabled at drive list), M18 (win32 breadcrumb crumb paths).

## Gate
- `npm test`: 112 files / 1762 passed / 0 failed.
- `npm run typecheck`: clean.
- `npx vite build packages/ui`: built in 902ms, CSS 42.03 kB, JS 310.56 kB; no lightningcss/other warnings.
