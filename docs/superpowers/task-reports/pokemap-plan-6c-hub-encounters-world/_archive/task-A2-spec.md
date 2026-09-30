# Task A2 executed spec: UI project picker, header switcher, dirty-switch confirm

Plan §A2. U1 binding: shared UI changes for both families; existing GBA tests change **only** where
behaviour changes, each such edit named in the report with the reason. Builds on A1's hub
(`packages/server/src/hub.ts`) and its wire types in `packages/core/src/hub/wire.ts` (added in A1's fix
round; import types from there, never from `@pokemap/server`).

## Hub wire contract (from A1, as implemented)

- `GET /api/hub` → `HubState = { current: ProjectInfo | null, recent: RecentEntry[] }`,
  `RecentEntry = { path, family: "gba"|"gbc", openedAt }`.
- `GET /api/hub/browse[?dir=]` → `BrowseResult = { dir: string|null, parent: string|null, entries: BrowseEntry[] }`,
  `BrowseEntry = { name, path, family: "gba"|"gbc"|"unsupported"|null }`. `dir: null` = the drive list
  (win32). Drive roots are `"C:/"`. 404/400 `{ error }`.
- `POST /api/hub/open { path, force? }` → 200 `ProjectInfo`; 400/404/422/500 `{ error }`;
  409 `{ error, dirtyMaps: string[] }`.

## Ground truth (measured 2026-09-29)

- `packages/ui/src/Root.tsx` (36 lines) uses `useProjectInfo()` (`/api/project`) and renders
  `<GbcApp root/>` or `<App/>`. `useProjectInfo` has **no other importer** (only doc-comment mentions in
  `useGuardedFetch.ts`, `gbc/hooks/useGbcGroups.ts`, `gbc/hooks/useGbcMap.ts`).
- `useGuardedFetch(url, guard)` / `fetchGuarded(url, guard, label?)` in `hooks/useGuardedFetch.ts`: the
  required fetch path (visible `error`, shape guard). `gbc/guards.ts` exports `isRecord`, `isProjectInfo`.
- Headers: `App.tsx` `<header className="app__toolbar">` (grep `app__toolbar`) ends with the
  `app__status` span; `GbcApp.tsx` same, after its Time-of-day group. `App()` takes no props;
  `GbcApp({ root })`. GbcApp default time is `"day"` (`useState<TimeOfDay>("day")`).
- Modal shell to mirror: `components/SaveDialog.tsx` — `warp-modal__backdrop` div with
  `onKeyDown={e => e.key === "Escape" && onCancel()}`, inner `warp-modal__panel` with `role="dialog"
  aria-modal="true" aria-label=…`, `autoFocus` on the safe button (Cancel). `.warp-modal__panel` is
  fixed `min(720px,90vw) × min(560px,85vh)`; SaveDialog adds its own class for sizing (grep
  `.save-dialog {` in styles.css) — do the same.
- Tests: `packages/ui/test/gbc/Root.test.tsx` mocks `/api/project` (+ `/api/groups`), asserts App via
  the "Dungeon" button and GbcApp via the "Time of day" group. `packages/ui/test/gbc/useProjectInfo.test.ts`
  tests the hook.
- CSS tokens are in `styles.css` `:root`: `--bg-panel(-raised)`, `--bg-hover`, `--bg-selected`,
  `--border(-strong)`, `--text-primary/secondary/muted`, `--accent`, `--warn`, `--danger`,
  `--focus-ring`. No `.btn`; buttons use `map-canvas__btn` + a block-scoped modifier (e.g.
  `save-dialog__btn--primary`). `packages/ui/test/styles.test.ts` parses the sheet strictly.

## Design (binding)

### Files
- `packages/ui/src/hub/guards.ts` (new): `isHubState`, `isBrowseResult`, `isOpenConflict` (409 body:
  `{ error: string, dirtyMaps: string[] }`). Reuse `isRecord`/`isProjectInfo` from `../gbc/guards.js`.
  Plus `openProject(path, force?)` → `Promise<{ kind: "opened", info } | { kind: "conflict", dirtyMaps, error } | { kind: "error", error }>`:
  POST, reads the body once (`r.json().catch(() => null)`), 200 + `isProjectInfo` → opened; 409 +
  `isOpenConflict` → conflict; otherwise `error` = body's `error` string or `` `Open failed (status N)` ``;
  a thrown fetch → `error`. Never throws.
- `packages/ui/src/hub/ProjectPicker.tsx` (new): `ProjectPicker({ onOpened, onClose? })`.
  - Fetches `/api/hub` (for `recent`, and `current` to seed the browser) via `useGuardedFetch`.
  - **Recent** section first: each entry = family badge (`GBA`/`GBC`), the path, an "Open" button.
  - **Browser** section: initial dir = parent of `current.root`, else parent of `recent[0].path`, else no
    `dir` (drive list / `/`). Fetch with `fetchGuarded("/api/hub/browse?dir=" + encodeURIComponent(dir), isBrowseResult)`.
    Shows: a breadcrumb (each segment a button that browses to the path up to it; on win32 the first
    segment is the drive `C:/`), an "Up" button (to `parent`; when `parent` is null and `dir` is not
    null → the root list; disabled when `dir` is null), and the entries: each row = a button with the
    folder name (click → browse into it), a family badge (`GBA`/`GBC`/`unsupported`, none for null),
    and an "Open" button **enabled only for `gba`/`gbc`**. Browse errors show inline (`role="alert"`).
    Ignore a stale browse response (a later browse started): use a request counter ref, not state.
  - **Typed path**: a `<form>` with a text input (label "Folder path") and an "Open" submit.
  - Every open goes through `openProject`. `opened` → `onOpened(info)`. `error` → inline alert with the
    server's message (422/404 text must be visible verbatim). `conflict` → render
    `<SwitchConfirmDialog dirtyMaps onCancel onConfirm/>` **instead of** the picker body (never two
    stacked backdrops); Cancel → back to the picker, nothing posted; confirm → `openProject(path, true)`.
  - Heading "Open a project". When `onClose` is given (modal use), a "Close" button.
- `packages/ui/src/hub/ProjectSwitcher.tsx` (new): `ProjectSwitcher({ current: ProjectInfo, onOpened })`.
  A header button `map-canvas__btn hub-switcher__btn` showing the folder name (last path segment) with
  `title={current.root}` and `aria-label={"Switch project (current: " + name + ")"}`. Click → modal:
  `warp-modal__backdrop` (Escape closes) > `warp-modal__panel hub-picker--modal` (`role="dialog"
  aria-modal="true" aria-label="Switch project"`) > `<ProjectPicker onOpened onClose/>`. The modal's
  first focusable (Close) gets `autoFocus` so Escape reaches the backdrop's `onKeyDown`.
- `packages/ui/src/hub/SwitchConfirmDialog.tsx` (new): mirrors `SaveDialog`'s shell exactly
  (backdrop + Escape → `onCancel` + `autoFocus` on Cancel). `aria-label="Unsaved edits"`. Text:
  "N map(s) have unsaved edits. Switching discards them." + a `<ul>` of `dirtyMaps`. Buttons: "Cancel"
  (autoFocus) and "Discard and switch" (`map-canvas__btn hub-confirm__btn--danger`, `--danger` border).
  Disables the danger button while the forced open is in flight; its error shows inline.
- `packages/ui/src/Root.tsx` (rewrite, keep it small):
  ```tsx
  const { data, error } = useGuardedFetch("/api/hub", isHubState);
  const [opened, setOpened] = useState<{ info: ProjectInfo; gen: number } | null>(null);
  const current = opened?.info ?? data?.current ?? null;
  const onOpened = (info: ProjectInfo) => setOpened((o) => ({ info, gen: (o?.gen ?? 0) + 1 }));
  ```
  error → the existing "Could not open project: …" alert; loading → existing "Loading project…";
  no current → `<div className="app"><ProjectPicker onOpened/></div>`; gbc →
  `<GbcApp key={key} root switcher={<ProjectSwitcher current onOpened/>}/>`; gba →
  `<App key={key} switcher={…}/>`, with `key = \`${family}:${root}:${gen}\``. The generation makes a
  forced re-open of the *same* root remount too (its server sessions were dropped).
- `App.tsx` / `GbcApp.tsx`: **additive** optional prop `switcher?: ReactNode`, rendered as the last child
  of `app__toolbar`. No other change. `App.test.tsx` / `GbcApp.test.tsx` stay unchanged.
- Delete `hooks/useProjectInfo.ts` and `test/gbc/useProjectInfo.test.ts` (sole importer was Root);
  update the doc-comment mentions in the three files above to name `Root`'s `/api/hub` fetch instead.
- `styles.css`: `hub-picker*`, `hub-switcher__btn`, `hub-confirm*` rules with real tokens only; long
  paths must wrap or ellipsize (`min-width: 0` on flex children holding paths;
  `overflow-wrap: anywhere` or `text-overflow: ellipsis`). The modal's picker list scrolls
  (`overflow: auto`) inside the fixed panel. `DESIGN.md`: a short "Project hub" section listing the new
  classes and the badge colours (GBA/GBC badges reuse existing tokens; pick and name them).

## Tests (TDD; no jest-dom — plain DOM reads: `.disabled`, `.getAttribute`, `document.body.contains`)

`packages/ui/test/hub/` (new dir) with a shared in-file `makeHubFetch(routes)` mock per file:
1. `guards.test.ts`: `isHubState`, `isBrowseResult`, `isOpenConflict` accept the real shapes and reject
   each single-field corruption (wrong family string, non-array entries, `dirtyMaps` with a number,
   missing `parent`); `openProject` maps 200/409/422/404/500/thrown-fetch/bad-200-shape exactly.
2. `ProjectPicker.test.tsx`:
   - recent entries render with badge + path; clicking a recent "Open" posts `{ path }` and calls
     `onOpened` with the exact info.
   - browse: initial fetch uses the parent of `current.root` (assert the exact URL); clicking a folder
     name fetches its `dir`; "Up" fetches `parent`; the "Open" button is `.disabled` for `null` and
     `"unsupported"` entries and enabled for `gba`/`gbc`; opening a gbc entry calls `onOpened`.
   - a stale browse response arriving after a newer one does not overwrite it (deferred promises).
   - typed path → 422 → the server's message is visible in a `role="alert"`; 404 likewise; `onOpened`
     not called.
   - 409 → `SwitchConfirmDialog` shows the dirty map names; Cancel → back to the picker, exactly one
     POST made; "Discard and switch" → second POST body `{ path, force: true }` → `onOpened`.
3. `SwitchConfirmDialog.test.tsx`: Escape calls `onCancel`; Cancel has focus on mount
   (`document.activeElement`); the list renders exactly the names.
4. `ProjectSwitcher.test.tsx`: shows the folder name, `title` = root; click opens a dialog labelled
   "Switch project"; Escape closes it.
5. `packages/ui/test/gbc/Root.test.tsx` — **behaviour change (U1), name it in the report**: Root now
   fetches `/api/hub`, not `/api/project`. Rewrite the mock to serve `/api/hub`
   (`{ current, recent: [] }`) and keep every existing assertion's intent (loading placeholder; gba →
   App's Dungeon button; gbc → Time of day group; failure → alert; bad shape → alert; a GBC project
   never calls a GBA-only route). Add: `current: null` → "Open a project" heading and no `/api/groups`
   call; the switcher button renders in both App and GbcApp headers.
6. Re-key remount (in Root.test): gbc root A → click "Nite" (aria-pressed true) → open root B through
   the switcher (mock `/api/hub/open` → B) → the Time-of-day "Day" button is pressed again and "Nite" is
   not (fresh state). Also same-root forced re-open remounts (gen bump).

## Mutations the reviewer will run
- M1 Root keys by `family` only (no root/gen) → test 6 red.
- M2 Cancel in the confirm re-posts with force → test 2 (409) red.
- M3 "Open" enabled for `unsupported` → test 2 red.
- M4 `openProject` treats 409 as a plain error → test 1/2 red.
- M5 SwitchConfirmDialog drops `autoFocus` → test 3 red.
- M6 stale-browse guard removed → test 2 stale case red.
- M7 `isOpenConflict` accepts a non-string `dirtyMaps` item → test 1 red.

## Steps (commit each green step, pathspec commits)
1. `hub/guards.ts` + test. 2. `SwitchConfirmDialog` + test. 3. `ProjectPicker` + test.
4. `ProjectSwitcher` + test. 5. Root rewrite + Root.test rewrite + App/GbcApp `switcher` prop; delete
`useProjectInfo`. 6. CSS + DESIGN.md. 7. Gate: `npm test`, `npm run typecheck`,
`npx vite build packages/ui` (no warnings from lightningcss), and
`git diff <A2 base> -- packages/ui/test/` shows only the new `hub/` files, the Root.test rewrite, and
the deleted useProjectInfo test.

## Rules
Binding UI rules: no jest-dom; real tokens only; no `.btn`; modal shells mirror `SaveDialog.tsx`; every
fetch via `useGuardedFetch`/`fetchGuarded` (the POST in `openProject` is the one exception, and it reads
+ guards its body the SaveDialog way); never call a state setter inside another setter's updater;
flex children with long text get `min-width: 0`. No new npm deps. Don't touch server files. Report to
`task-A2-implementer.md`: files, test names, gate numbers, every existing test edited/deleted and why,
deviations, concerns. Reply with one status line + the path.
