# Task A1 executed spec: server hub, handler split, browse/open, recent list

Plan: `docs/superpowers/plans/2026-09-28-pokemap-plan-6c-hub-encounters-world.md` §A1. Decisions U1-U4
binding (none bites A1 directly; A1 is server-only). Baseline: 1,679 pass / 0 fail, typecheck clean,
`vite build` passes (`baseline.md`).

## Ground truth (measured 2026-09-29 against the real code)

- `packages/server/src/index.ts` (1,016 lines): `createServer({projectPath, port})` line 76. Line 77
  already dispatches `detectEngineFamily(...) === "gbc"` → `createGbcServer(opts)`. The GBA body builds
  caches + `editSessions` (line 146), then `const http: Server = createHttp((req, res) => { ... })`
  (lines 187-1009), then listens on `127.0.0.1` (line 1011) and returns
  `{ port, family: "gba", project, close }`.
- `packages/server/src/gbcRoutes.ts` (458 lines): `createGbcServer` line 229, same shape
  (`createHttp` handler, listen, return `{ port, family: "gbc", project: proj, close }`).
- `PokemapServer` (index.ts line 37) is imported by 6 test files; `createGbcServer` is imported by no
  test (grep). Tests only call `createServer({ projectPath, port: 0 })`.
- `packages/server/src/editSessions.ts`: `createEditSessionStore(project)` returns `{ open, close, has }`
  over a private `sessions` Map; each `entry.session.isDirty` is kept current by `EditCommandStack`.
- `packages/core/src/family.ts`: `detectEngineFamily(root)` throws on both-markers, on Yellow shape
  (`data/maps/headers/` + `constants/map_constants.asm`), and on no markers. `ProjectInfo = { family, root }`.
- `packages/core/src/config/paths.ts:38`: `norm = s => s.replace(/\\/g,"/").replace(/\/+$/,"")`.
  **Trap:** `norm("C:/")` is `"C:"`, and on Windows `readdirSync("C:")` lists the *current directory on
  drive C*, not the drive root. Drive roots must be kept as `"C:/"`.
- `packages/server/src/serve.ts` (55 lines): reads `pokemap.config.json` unconditionally; `--gbc` →
  `cfg.gbc.projectPath` (named refusal if absent); else first non-flag argv or `cfg.projectPath`.
- Corpus helpers: `SUBJECT_ROOT`/`hasProject` from `@pokemap/core/test/helpers/corpus.js`;
  `GBC_SUBJECT_ROOT`/`hasGbcProject` from `@pokemap/core/test/gbc/helpers/corpus.js`.
- `~/.pokemap/` does not exist on this machine. Tests must never touch it: every test passes an explicit
  temp `home`.

## Design (binding)

### 1. Handler split: `index.ts` and `gbcRoutes.ts`

```ts
// index.ts
export type ProjectHandler =
  | { family: "gba"; project: Project; info: ProjectInfo; handle(req: IncomingMessage, res: ServerResponse): void; dirtyMaps(): string[]; dispose(): void }
  | { family: "gbc"; project: GbcProject; info: ProjectInfo; handle(req: IncomingMessage, res: ServerResponse): void; dirtyMaps(): string[]; dispose(): void };

export function createProjectHandler(root: string): ProjectHandler; // SYNC. gbc → createGbcProjectHandler(root)
export async function createServer(opts: { projectPath: string; port?: number }): Promise<PokemapServer>; // wrapper
```

- `createProjectHandler` is **synchronous** (both `openProject` and `openGbcProject` are sync). This is
  what makes the hub's swap race-free: no await between "open new" and "swap".
- Mechanical move: the existing `(req, res) => { ... }` arrow body becomes `const handle = (req, res) => { ... }`
  inside `createProjectHandler`, unchanged. Do not re-indent or rewrite routes. Same for gbcRoutes.
- `info` = the exact object `/api/project` already sends (`{ family, root: project.paths.root }` for GBA;
  GBC's existing equivalent). `/api/project` must keep sending it byte-identically.
- `dirtyMaps()`: GBA → names of open sessions whose `session.isDirty` is true, sorted. Add
  `dirty(): string[]` to `createEditSessionStore`'s returned object (and `closeAll(): void`). GBC → `[]`.
- `dispose()`: GBA → `editSessions.closeAll()`; both → set `disposed = true`. At the top of `handle`, a
  disposed handler answers **503 `{ error: "project closed" }`** (an in-flight client that still holds
  the old handler must not read or write through it).
- `createServer` becomes: `const h = createProjectHandler(opts.projectPath); const http = createHttp(h.handle); listen 127.0.0.1; return { port, family: h.family, project: h.project, close }` (keep the
  `PokemapServer` union typing; cast only as narrowly as needed). `createGbcServer` may be deleted
  (no importer) or kept as a wrapper; prefer deleting and updating gbcRoutes.ts's header comment.
- **Gate:** every existing file in `packages/server/test/` passes **unchanged**
  (`git diff <A1 base> -- packages/server/test/{api,dungeons,editSessions,eventRoutes,gbcRoutes,paintRoutes,saveRoutes,signRoutes,world}.test.ts` must be empty).

### 2. `packages/core/src/family.ts` (additive)

```ts
/** Never throws. "unsupported" = some family marker exists but detectEngineFamily refuses (both families, Yellow). null = no marker. */
export function probeEngineFamily(root: string): EngineFamily | "unsupported" | null;
```
Implementation: `try { return detectEngineFamily(root) } catch { return anyMarkerExists ? "unsupported" : null }`
where the markers are `include/fieldmap.h`, `data/maps/attributes.asm`, `constants/map_constants.asm`.
Tests go in the existing `packages/core/test/family.test.ts` (reuse its `makeRoot`/`touch`): gba, gbc,
both → "unsupported", Yellow shape → "unsupported", only `attributes.asm` → "unsupported", empty → null,
nonexistent path → null.

### 3. `packages/server/src/recent.ts` (new)

```ts
export interface RecentEntry { path: string; family: EngineFamily; openedAt: string } // ISO
export function recentHome(home?: string): string; // home ?? process.env.POKEMAP_HOME ?? join(homedir(), ".pokemap")
export function readRecent(home: string): RecentEntry[];
export function pushRecent(home: string, entry: { path: string; family: EngineFamily }, now?: Date): RecentEntry[];
```
- File `${home}/recent.json` = `{ "version": 1, "entries": RecentEntry[] }`, pretty-printed + trailing newline.
- Missing file → `[]`. Unparseable JSON or wrong shape (`isRecentFile` guard: version === 1, entries an
  array of `{ path: string, family: "gba"|"gbc", openedAt: string }`) → rename to `recent.json.bad`
  (overwrite an existing `.bad`), return `[]`. Never throws for a bad file.
- `pushRecent`: new entry first; dedupe by normalised path (`norm`, and case-insensitive on win32);
  keep at most 10; `mkdirSync(home, { recursive: true })`; write; return the list.
- Paths are stored `norm`-ed (forward slashes, no trailing slash).

### 4. `packages/server/src/hub.ts` (new)

```ts
export interface Hub {
  port: number;
  close(): Promise<void>;
  current(): ProjectHandler | null;      // for tests and serve.ts
}
export async function createHub(opts: { port?: number; home?: string; open?: string }): Promise<Hub>;
```
- One `node:http` listener on `127.0.0.1` (never `0.0.0.0`), `port ?? 5174` (tests pass 0).
- `opts.open`: if given, open it at startup exactly as `POST /api/hub/open` would (push to recent); a
  failure throws out of `createHub` (serve.ts reports it). No `force` question at startup.
- Routes (all JSON; reuse `readBody` from index.ts — export it rather than copy):
  - `GET /api/hub` → `{ current: ProjectInfo | null, recent: RecentEntry[] }`.
  - `GET /api/hub/browse?dir=<path>`:
    - no `dir` param (or empty): on win32 → `{ dir: null, parent: null, entries }` where entries are the
      drive roots `A:/`..`Z:/` that `existsSync` (name `"C:"`, path `"C:/"`, family `probeEngineFamily`);
      elsewhere → the listing of `/`.
    - with `dir`: 404 `{ error }` if missing, 400 `{ error }` if not a directory. Else list
      `readdirSync(dir, { withFileTypes: true })`, **directories only**, excluding names starting with
      `.` or `$`; an entry whose probe throws is skipped, never fatal; sorted by
      `localeCompare(undefined, { sensitivity: "base" })`.
    - `dir` in the response is normalised, **except drive roots stay `X:/`**. `parent` = `dirname`,
      normalised the same way; `null` at a drive root / `/` (on win32 a drive root's parent is `null`,
      meaning "show drives").
    - Entry shape: `{ name, path, family }`, `path` joined with `/`.
    - Never reads file contents. Only `readdirSync` + `existsSync` probes.
  - `POST /api/hub/open` body `{ path: string, force?: boolean }`, checked in this order:
    1. invalid JSON / `path` not a non-empty string / `force` present and not boolean → **400**;
    2. path missing or not a directory → **404** `{ error }`;
    3. `detectEngineFamily(path)` throws → **422** `{ error: <its message> }`;
    4. current handler's `dirtyMaps()` non-empty and `force !== true` → **409**
       `{ error: "unsaved edits in N map(s)", dirtyMaps }`;
    5. `createProjectHandler(path)`; if it throws → **500** `{ error }` and the old handler stays current
       (open the new one BEFORE disposing the old);
    6. `old?.dispose()`, swap, `pushRecent(home, { path: info.root, family })`, **200** `info`.
    Re-opening the same root is allowed and yields a fresh handler (same dirty rule).
  - Any other `/api/hub...` path → 404. Any other path → `current.handle(req, res)`, or **503**
    `{ error: "no project open" }` when there is none.
  - Outer try/catch → 500 `{ error }`, like index.ts. Async POST chain gets its own `.catch` (index.ts's
    `/api/world/placement` pattern).

### 5. `packages/server/src/serve.ts`

- `pokemap.config.json` is read **only** for `--gbc` (it may not exist for a hub user). Keep `--gbc`'s
  wording/refusal and its "wins over positional" semantics and doc comment.
- `--gbc` → `createHub({ port: 5174, open: cfg.gbc.projectPath })`.
- positional root → `createHub({ port: 5174, open: root })`.
- no args → `createHub({ port: 5174 })`, then reopen `readRecent(recentHome())[0]` if
  `probeEngineFamily(path)` returns `"gba"|"gbc"`; a failure to reopen is printed to stderr and the hub
  keeps running with no project (the picker handles it). Print one line:
  `pokemap hub on http://127.0.0.1:5174 (<family> <root> | no project open)`.
- **Behaviour change to name in the report:** no-args no longer opens `cfg.projectPath`; it reopens the
  most recent project. `.claude/launch.json`'s `server` entry is already `serve.ts` with no args, so it
  now starts the hub; `server-gbc` stays `--gbc`. No launch.json edit needed; state that in the report.

## Tests (new file `packages/server/test/hub.test.ts`, plus `recent.test.ts`, plus family.test.ts additions)

Every hub test uses a temp `home` (`mkdtempSync(join(tmpdir(), "pokemap-home-"))`), removed in `afterAll`.
Temp project trees: `mkdtempSync`, markers via the family.test.ts `touch` idea (copy the helper; it is
3 lines).

Not corpus-gated:
1. `GET /api/hub` before any open → `{ current: null, recent: [] }`.
2. `GET /api/project`, `/api/groups` before open → 503 `{ error: "no project open" }`.
3. `GET /api/hub/nope` → 404.
4. browse a temp tree: `gbaProj/include/fieldmap.h`, `gbcProj/data/maps/attributes.asm` +
   `gbcProj/constants/map_constants.asm`, `both/` (all three markers), `yellow/` (`data/maps/headers/`
   dir + map_constants), `plain/`, `.hidden/`, `$sys/`, and a FILE `notes.txt` → entries exactly
   `[both:unsupported, gbaProj:gba, gbcProj:gbc, plain:null, yellow:unsupported]` in that order, with
   `path === \`${norm(tmp)}/<name>\``, `dir === norm(tmp)`, `parent === norm(dirname(tmp))`.
5. browse a missing dir → 404; a file → 400.
6. `it.skipIf(process.platform !== "win32")`: browse with no `dir` → `dir: null`, entries include
   `{ name: "C:", path: "C:/" }`; browse `dir=C:/` → `dir === "C:/"`, `parent === null`, and the entries
   do not equal the listing of `process.cwd()` (the `norm("C:/")` trap).
7. open: 400 invalid JSON; 400 `{}`; 400 `{ path: "x", force: "yes" }`; 404 missing path; 422 on `both/`
   (message contains "matches both engine families"); 422 on `yellow/` (contains "pokeyellow").
8. After a failed open the hub still has `current: null` (no half-swap).

Corpus-gated (`describe.skipIf(!hasProject(SUBJECT_ROOT) || !hasGbcProject(GBC_SUBJECT_ROOT))`, hooks
inside the describe as api.test.ts's comment explains):
9. open GBA → 200 `{ family: "gba", root: norm(SUBJECT_ROOT) }`; `/api/project` → gba; open PerfPlus →
   gbc; `/api/project` → gbc; open GBA again → gba. `GET /api/hub` `recent` is
   `[GBA, PerfPlus]` (deduped, most recent first, length 2) after that sequence.
10. **Real dirty session:** with GBA open, `POST /api/edit/<map>/paint/begin`, `paint/apply` (pencil, one
    target — copy the exact body shape `paintRoutes.test.ts` uses), `paint/end` through the hub's own
    port. Pick a map with `grep -rn "<name>" packages/*/test` to confirm the in-memory session races
    nothing (it never touches disk, but check anyway and say so). Then:
    - `POST /api/hub/open { path: GBC }` → 409, `dirtyMaps` equals `[<map>]` exactly, and `/api/project`
      still says gba (Cancel keeps the edit: `GET /api/edit/<map>/plan` still shows the change or the
      next paint/end still reports `isDirty: true` — pick one and assert it).
    - keep `const old = hub.current()`; `POST { path: GBC, force: true }` → 200 gbc;
      `old.dirtyMaps()` → `[]` (dispose ran); calling `old.handle` via a fake req/res or by asserting the
      503 through a small in-test `http.createServer(old.handle)` → 503 `{ error: "project closed" }`.
11. `createHub({ port: 0, home, open: SUBJECT_ROOT })` → `current()?.family === "gba"` and recent has it.

`recent.test.ts`:
12. round-trip: push A, B, A → `[A, B]`, A's `openedAt` updated; file content `version: 1`.
13. dedupe normalises: push `C:\\x\\y\\` then `C:/x/y` → one entry (on win32 also `c:/X/y`; gate the
    case-insensitive assertion with `it.skipIf(process.platform !== "win32")`).
14. cap: push 12 distinct → 10, newest first.
15. corrupt: write `{not json` → `readRecent` returns `[]`, `recent.json.bad` exists with the original
    bytes, `recent.json` gone; wrong shape `{ "version": 2, "entries": [] }` → same.
16. `recentHome()` honours `POKEMAP_HOME` (set/restore `process.env` in `try/finally`).

## Steps (commit each green step; `git commit -- <paths>`)

1. `probeEngineFamily` + tests (red → green). Commit.
2. `recent.ts` + `recent.test.ts`. Commit.
3. Handler split in `index.ts` / `gbcRoutes.ts` / `editSessions.ts` (`dirty`, `closeAll`). Run the full
   `packages/server/test` suite: every existing test green, **no test file edited**. Commit.
4. `hub.ts` + `hub.test.ts` (non-corpus first, then corpus). Commit.
5. `serve.ts`. Manually: `npx tsx packages/server/src/serve.ts` with `POKEMAP_HOME` pointed at a temp dir
   → prints "no project open"; `curl` `/api/hub` → `current: null`; stop it **by PID**. Then with
   `--gbc` → gbc. Record the output. Commit.
6. Full gate: `npm test` (expect 1,679 + new, 0 fail), `npm run typecheck`, `npx vite build packages/ui`.

## Mutations the reviewer will run (make sure a test goes red for each)

- M1 skip the dirty check (step 4 of open) → test 10 red.
- M2 drop `old?.dispose()` → test 10 red (`old.dirtyMaps()` / 503).
- M3 recent not deduplicated → tests 9/12 red.
- M4 browse lists files too → test 4 red.
- M5 503 → pass-through (no current handler: answer 404 or throw) → test 2 red.
- M6 `norm` applied to drive roots → test 6 red (win32).
- M7 swap before open (dispose old, then open new which throws) → test 8 or a corpus variant red.

## Rules

- No jest-dom (server-only task, but no new deps either). No new npm dependencies.
- Don't touch any UI file. Don't edit any existing server test file.
- Report to `docs/superpowers/task-reports/pokemap-plan-6c-hub-encounters-world/task-A1-implementer.md`:
  files changed, each test's name, the gate numbers, the serve.ts manual transcript, the map chosen in
  test 10 and the grep proving it's safe, and any deviation from this spec with the reason. Return only
  one status line + that path.
