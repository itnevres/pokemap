# Task 10b tests report — versioned tileset URLs (tests + typed stub)

Branch `p14-2-t10b`. Tier: High (a stale URL is a stale image across three shared render caches).
Scope of this hop: the oracle plus one typed stub. No production behaviour was implemented.

## Files

Created:

- `packages/ui/src/shared/tilesetVersion.ts` — stub. Exports `noteTilesetVersion(v: unknown): void`,
  `resetTilesetVersion(): void`, `useTilesetVersion(): number`; each body is exactly
  `throw new Error("not implemented (Task 10b)");`.
- `packages/ui/test/shared/tilesetVersion.test.tsx` — Cases 1 and 2.

Appended (imports plus one new `describe` each; no existing case touched):

- `packages/ui/test/MetatilePalette.test.tsx`
- `packages/ui/test/gbc/GbcMetatilePalette.test.tsx`
- `packages/ui/test/gba/GbaMapSurface.test.tsx`
- `packages/ui/test/gbc/GbcMapSurface.test.tsx`
- `packages/ui/test/WorldCanvasSurface.test.tsx`
- `packages/ui/test/gbc/GbcWorldCanvasSurface.test.tsx`

Not changed: every existing case, fixture and mock in those files. The added imports are
`noteTilesetVersion` / `resetTilesetVersion`; `describe` was added to the vitest import in the two world
files (they used only top-level `it`).

## Cases per number

### 1. Store unit — `packages/ui/test/shared/tilesetVersion.test.tsx`

- `describe("tileset version store")`
  - **"starts at 0, keeps the largest version, and resets to 0"** — a mounted probe reads 0; `noteTilesetVersion(3)`
    → 3; `noteTilesetVersion(2)` → still 3 (max, never a rollback); `resetTilesetVersion()` → 0.
  - **"ignores strings, NaN, undefined, null and Infinity"** — store at 3; each of `"7"`, `NaN`, `undefined`,
    `null`, `Infinity` leaves it at 3.
  - **"re-renders a mounted component when the version changes"** — the same mounted probe reflects 5 then 6 with
    no prop change (subscription, not a fresh mount).
- Reset: `beforeEach` and `afterEach` call `resetTilesetVersion()`. The new `describe` blocks in the six
  existing files each carry their own `afterEach(() => resetTilesetVersion())`, so no existing case in those files
  can observe a leftover version.

### 2. `useEditSessionCore` — same file

- `describe("useEditSessionCore announces the tileset version")`
  - **"a session reply carrying tilesetVersion 4 sets the store to 4"** — `fetch` is stubbed the way
    `test/shared/useEditSessionCore.test.tsx` stubs it (`{ ok: true, status: 200, json: … }`); a probe renders
    `useEditSessionCore("/api/edit", "Route101", seed)` and posts `/paint/apply`, whose reply body is
    `{ blocks: [], tilesetVersion: 4 }`; the store reads 0 before and 4 after.

### 3. Palettes

- `packages/ui/test/MetatilePalette.test.tsx` — `describe("MetatilePalette tileset version (Task 10b)")`
  - **"keeps today's URL at version 0 and appends tv= to the same mounted palette"** — ids 0, 1 and the secondary
    id 640 (`split.metatiles`) equal `/api/metatile/Test_Layout/<id>.png` at 0; after `act(noteTilesetVersion(5))`
    the same mounted thumbnails read `/api/metatile/Test_Layout/<id>.png?tv=5`.
- `packages/ui/test/gbc/GbcMetatilePalette.test.tsx` — `describe("GbcMetatilePalette tileset version (Task 10b)")`
  - **"keeps today's URL at version 0 and appends tv= after time on the same mounted palette"** — at 0
    `/api/metatile/NewBarkTown/0.png?time=day`; at 5 `…?time=day&tv=5`; also checked on id 2.

### 4. Surface adapters

Rendered through each family's existing surface harness and read from the real DOM/requests:

- `packages/ui/test/gba/GbaMapSurface.test.tsx` — `describe("GBA map surface tileset version (Task 10b)")`
  - **"keeps today's URL at version 0 and appends tv= to the same mounted canvas"** — `mount()`ed `MapCanvas`
    (`mapName="Foo"`): `<img src>` is `/api/render/Foo.png?border=1`, then
    `/api/render/Foo.png?border=1&tv=5` on the same mounted canvas.
- `packages/ui/test/gbc/GbcMapSurface.test.tsx` — `describe("GBC map surface tileset version (Task 10b)")`
  - **"keeps today's URL at version 0 and appends tv= after time on the same mounted canvas"** —
    `<img src>` `/api/render/M.png?border=1&time=day` → `/api/render/M.png?border=1&time=day&tv=5`.
- `packages/ui/test/WorldCanvasSurface.test.tsx` — `describe("GBA world surface tileset version (Task 10b)")`
  - **"keeps today's URL at version 0 and re-requests a visible tile with tv="** — `FakeImage` requests contain
    `/api/render/A.png`, then `/api/render/A.png?tv=5` after the store changes.
  - **"keeps a per-map v parameter alongside tv"** — with `tileVersions={{ A: 3 }}`:
    `/api/render/A.png?v=3` → `/api/render/A.png?v=3&tv=5`.
- `packages/ui/test/gbc/GbcWorldCanvasSurface.test.tsx` — `describe("GBC world surface tileset version (Task 10b)")`
  - **"keeps today's URL at version 0 and re-requests a visible tile with tv="** —
    `/api/render/MapA.png?time=day` → `/api/render/MapA.png?time=day&tv=5`.
  - **"keeps a per-map v parameter alongside time and tv"** — with `tileVersions={{ MapA: 1 }}`:
    `/api/render/MapA.png?time=day&v=1` → `/api/render/MapA.png?time=day&v=1&tv=5`.

Expected URLs are literal strings built in the tests; no expectation is derived from the code under test. Every
expectation is checked against the URL the component actually requests, not against a mocked builder.

## Interpretations chosen

1. **Rulings U1-U5 were not readable from this sandbox.** `read`/`glob` on
   `C:\Programming Projects\PokeMap\.superpowers\sdd\2026-11-10-pokemap-plan-14-2-block-editor\task-10-rulings.md`
   is refused with `permission.rejected: external_directory` (the path is outside the worktree). The cases here are
   derived from the task brief's Cases 1-4 and plan "Task 10" (`tilesetVersion` in every session payload, URL
   builders append `tv=`). If a ruling contradicts one of the points below, the ruling wins and the case changes.
2. **`tv` is omitted at version 0**, because the brief requires the URL to *equal today's URL* at 0. `?tv=0` is
   never expected. This mirrors the existing `v=` rule (`version > 0`).
3. **`tv` is appended last**, after every existing parameter: `?border=1&tv=5`, `?border=1&time=day&tv=5`,
   `?v=3&tv=5`, `?time=day&v=1&tv=5`. The plan's wording is "append `tv=<tilesetVersion>`"; the tests pin that order
   so a reader of the URL sees the pre-existing parameters unchanged.
4. **Case 2 lives in `test/shared/tilesetVersion.test.tsx`, not in the existing
   `test/shared/useEditSessionCore.test.tsx`.** The Deliverables list is an allowlist of paths ("only these paths
   may change") and does not include the `useEditSessionCore` test file; the fetch-mock shape is copied from that
   file instead. The POST path used is the real `/paint/apply`.
5. **Surface files chosen: the family surface suites**, not `test/canvas/MapSurface.test.tsx` /
   `test/canvas/WorldSurface.test.tsx`. The shared suites drive hand-written fixture adapters (`imageUrl: vi.fn(…)`)
   and never reach `gba/mapSurface.tsx`, `gbc/mapSurface.tsx`, `gba/worldSurface.tsx` or `gbc/worldSurface.tsx`;
   `gba/GbaMapSurface.test.tsx`, `gbc/GbcMapSurface.test.tsx`, `WorldCanvasSurface.test.tsx` and
   `gbc/GbcWorldCanvasSurface.test.tsx` are the existing suites for those four modules and already expose the
   requested URLs (`<img src>` / `FakeImage.instances`).
6. **All four adapters are verified through their rendered surface, not by calling the exported factory.**
   `createGbaWorldSurface()` / `createGbcWorldSurface(time)` take no tileset version today, and
   `tilesetVersion.ts` exports no getter, so any argument-based contract would fail this hop's typecheck and would
   over-specify internals. The rendered path pins the only thing that matters: an already-open canvas re-requests
   the image with `tv=` (whether the hook subscribes internally or the shell passes the value down is left to the
   implementation).
7. **Map-surface `v=` is not re-pinned here.** It is already pinned by `MapCanvas.test.tsx` /
   `gba/GbaMapSurface.test.tsx` "P12-4h/P12-8" and by `canvas/MapSurface.test.tsx`; the brief's "keeps `v`" is
   covered where `v` exists in these four builders (both world adapters, above) plus those existing cases.
8. **Test ids chosen to catch an id-base regression:** GBA palette uses ids 0, 1 and the secondary id 640
   (`split.metatiles`), so a wrong secondary base or a "primary ids only" regression is visible; GBC uses 0 and 2.
9. **No jest-dom matchers** anywhere; assertions use `getAttribute`, `toBe`, `toContain` and `toHaveLength`.
10. **The stub is intentionally not importable-free**: the new test file imports all three exports, and the six
    appended cases import the two non-hook ones, so the stub's shape is pinned by typecheck.

## Verify

`npm run typecheck`: **NOT RUN in this session.** Every shell invocation here is refused by the harness
(`permission.rejected: shell`, including `pwd` and `npm run typecheck`), and a subagent in the same session reported
"shell denied". The files were therefore reviewed statically (imports used, `describe`/`act`/`afterEach` present,
no jest-dom, literal expectations) but the required typecheck line is missing and must be produced by the conductor
before this hop is accepted. Nothing was run with vitest.

Red expectation for the conductor's red check: all Cases 1-4 fail with `Error: not implemented (Task 10b)` (from
`beforeEach`/`afterEach` in the new file, from the render call in the six appended cases); every existing case in
the six files stays green.
