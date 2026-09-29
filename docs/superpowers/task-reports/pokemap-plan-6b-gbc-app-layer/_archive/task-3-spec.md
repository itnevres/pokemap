# Plan 6b Task 3: executed spec

UI family bootstrap and the GBC shell.

Read the plan first, `docs/superpowers/plans/2026-09-25-pokemap-plan-6b-gbc-app-layer.md`: Q2 (a `Root.tsx` wrapping an untouched `App`), Q3 (app-level time of day), and the Task 3 row.

The server side is done:
- `GET /api/project` returns `{ family, root }`;
- the GBC `/api/groups` returns `{ groupOrder, groups }`, with group names like `OLIVINE`, in `newgroup` order.

The implementer reports are in `_archive/task-1a-*.md` and `_archive/task-1b-*.md`.

## Ground rules

These are the same as in Tasks 1-2: read-only decomps, commit hygiene and trailers, the GBA gate against `baseline-fails.txt`, and Plan 0 §7. The UI specifics below come from `docs/superpowers/RESUME.md` and `packages/ui/DESIGN.md`. Read both.

**Test conventions**
- This repo has **no `@testing-library/jest-dom`**. Use plain DOM reads: `.getAttribute(...)`, `.disabled`, `.textContent`, `document.body.contains(el)`, and `expect(x).toBeTruthy()` / `toBeNull()`.
- Mock `fetch` with `vi.stubGlobal("fetch", vi.fn(...))`, the way `packages/ui/test/App.test.tsx` does. Unstub in `afterEach`.

**Styling**
- **Use only real CSS tokens** from `packages/ui/src/styles.css`'s `:root`.
  - Known-wrong names: `--border-default` is really `--border`; `--bg-panel-elevated` is `--bg-panel-raised`; for selected state, use `--bg-selected` + `--border-strong`; `--warning` is `--warn`.
  - `--radius-sm` does not exist. Copy an existing literal px value instead.
- There is **no shared `.btn` class**. Reuse the existing `map-canvas__btn` for segmented toggles, as `App.tsx`'s Map/World/Dungeon switch already does (`App.tsx:407-432`, `role="group"` + `aria-pressed`).
- New layout classes use the `gbc-app__*` BEM prefix. Reuse `app`, `app__toolbar`, `app__title`, `app__body`, `app__sidebar`, `app__canvas`, `app__canvas-placeholder`, `app__status` and `app__mode` directly, so the two shells look identical.

**Fetch handling**
- **Every fetch validates its response shape** with a real type guard, not a cast. RESUME's `isDiffPlan` lesson applies.
- **Every fetch has a visible error surface**: no silent `.catch`, and no unhandled rejection.

**Design skills**
- `frontend-design` and `ui-ux-pro-max` are not installed in this environment. Follow `DESIGN.md` directly and say so in the report.

**`App.tsx` stays untouched.** It is 633 lines, and RESUME calls this the extraction signal. `git diff` must show no change to `App.tsx` or any existing component. The GBA UI tests (`packages/ui/test/*.test.tsx`) must pass **unchanged**.

## Deliverables

### 1. `packages/ui/src/gbc/guards.ts`

Pure type guards, with unit tests:
- **`isProjectInfo(x): x is ProjectInfo`.** `family` must be exactly `"gba"` or `"gbc"`, and `root` must be a string. Import `ProjectInfo` from `@pokemap/core/src/family.js`.
- **`isMapGroupsData(x)`**, matching `MapTree`'s `MapGroupsData`:
  - `groupOrder` is `string[]`;
  - `groups` is a plain object whose values are all `string[]`;
  - every `groupOrder` entry is a key of `groups`.

  Mutation-test each clause.

Later tasks add `isGbcMapPayload` and the other guards to this file.

### 2. `packages/ui/src/hooks/useProjectInfo.ts`

Fetches `/api/project` once and returns `{ data: ProjectInfo | null; error: string | null }`.
- Follow the shape of `useMapGroups.ts`, including its `cancelled` guard.
- A non-OK status, a thrown fetch, or a response that fails `isProjectInfo` all set `error` to a message naming what went wrong. For a bad shape, name the received value, truncated to 200 characters.

### 3. `packages/ui/src/Root.tsx`, and `main.tsx` mounting it

`Root` calls `useProjectInfo()`:

| State | Renders |
|---|---|
| loading | `<p className="app__canvas-placeholder">Loading project…</p>` inside a minimal `.app` wrapper |
| error | `role="alert"` text: `Could not open project: <error>` |
| `gba` | `<App />`, unchanged |
| `gbc` | `<GbcApp root={data.root} />` |

**Mount-once guarantee.** `App`'s own `useMapGroups` fetch must not start until `Root` has resolved `gba`, so a GBC project never sees a GBA request. This holds structurally, because `App` isn't mounted until then. Test it: under a `gbc` project, `fetch` is never called with `/api/world`, `/api/dungeons` or any GBA-only path.

### 4. `packages/ui/src/gbc/useGbcGroups.ts`

A `/api/groups` fetch with the `isMapGroupsData` guard. It follows the same pattern as `useProjectInfo`.

### 5. `packages/ui/src/gbc/GbcApp.tsx`: the GBC shell

**Header** (`app__toolbar`):
- the title `PokeMap`, plus a small `Crystal` family tag (`gbc-app__family`, data font, `--text-secondary`);
- the **View** group: `Map` | `World` (`role="group" aria-label="View"`, `map-canvas__btn`, `aria-pressed`);
- the **Time of day** group: `Morn` | `Day` | `Nite` (`role="group" aria-label="Time of day"`), with `day` as the default;
- the selected map name (`app__status`), shown in Map view when a map is selected.

**State.** `GbcApp` owns:
- `mode: "map" | "world"`;
- `time: "morn" | "day" | "nite"`;
- `selected: string | null`;
- `selectVersion` (bumped on every tree click, mirroring `App.tsx`'s `selectVersion` for Task 5's `jumpToken`).

**Sidebar.** `MapTree` fed by `useGbcGroups`, with its loading and error states mirroring `App.tsx:447` and `:474`.

**Main area** (`app__canvas`):
- Map view with no selection: `Select a map`.
- Map view with a selection: a placeholder, `<p className="app__canvas-placeholder" data-testid="gbc-map-placeholder">{selected} · {time}</p>`. Task 4 replaces it with `GbcMapCanvas`.
- World view: a placeholder, `World view (Task 5)`, carrying `data-testid="gbc-world-placeholder"`.

The placeholders exist so this task's tests can pin that `time` and `selected` reach the view. Tasks 4 and 5 replace them.

**Things the shell must not do.** No `Toolbar`, `SaveDialog`, `EventInspector`, `DungeonSidebar`, `SignComposer`, `CollisionPalette` or `MetatilePalette`, and no `beforeunload` handler: GBC is read-only in 6b.

### 6. Styles

Add a small block to `packages/ui/src/styles.css`, after the existing `.app__mode` rules. Keep it to the `gbc-app__*` classes the shell actually needs: the family tag, and the gap between the two header groups. Every value comes from existing tokens or existing literals.

## Tests (`packages/ui/test/gbc/*.test.tsx` and `.test.ts`)

**Guards**
- Every accept and reject case.
- Mutations to try: drop the family-literal check; drop the "every `groupOrder` key exists" check. Each must turn a test red.

**`Root`**
- `gba` renders `App`. Prove it with an element only `App` renders, such as its Dungeon button.
- `gbc` renders `GbcApp`. Prove it with the Time of day group.
- A 500 response shows the alert.
- A bad shape (`{ family: "n64" }`) shows the alert naming the bad value.
- The GBA-only fetch check from §3.

**`GbcApp`**
- The tree shows the real-shaped fixture groups (`OLIVINE`, `MAHOGANY`).
- Clicking a map sets the status and the placeholder text.
- Time buttons: exactly one has `aria-pressed="true"`, and it starts as `Day`.
- Clicking `Nite` changes the placeholder to `… · nite`. Pin the exact string.
- The World toggle swaps to the world placeholder.
- A failed `/api/groups` shows its error.

## Live verify (required)

Chromium is preinstalled. Use the global Playwright module:
- `import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs"`;
- `executablePath` is not needed; `PLAYWRIGHT_BROWSERS_PATH` is set.

Put the script in the scratchpad.

**GBC run**
1. Start `npx tsx packages/server/src/serve.ts --gbc` in the background, then `npm run dev --workspace=@pokemap/ui` (Vite, port 5173).
2. Open `http://localhost:5173`.
3. Screenshot the loaded shell.
4. Click `Nite` and a map in the tree, then screenshot again.
5. **Open the screenshots and look at them** (the Read tool shows images). Describe what you see in the report.

**GBA run**
1. Restart the server with no flag, so it serves the GBA subject.
2. Open the app and screenshot it. It must be today's GBA app.
3. Open one map and screenshot that too.

Save screenshots to `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/screens/task-3-*.png` and commit them. Keep them small: viewport 1280×800.

Kill every server and Vite process afterwards, and confirm ports 5173 and 5174 are free.

## Report

Write `task-3-implementer.md` with:
- what was built;
- the SHAs;
- test counts;
- the gate result;
- the mutation table;
- the live-verify narrative, with the screenshot paths and what each shows;
- any deviations from this spec.
