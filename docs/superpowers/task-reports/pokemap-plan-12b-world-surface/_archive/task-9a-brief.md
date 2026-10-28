# Plan 12b Task 9a: hub world-tile pre-warm (ruling P12-4w) -- implementer brief

Repo: `C:\Programming Projects\PokeMap` (npm workspaces, TypeScript, vitest). Branch `plan-12b-world-surface`. Files are CRLF: keep CRLF line endings. No added line over 140 chars. Match the surrounding comment style (comments explain WHY, briefly).

## Goal

After the hub opens a project, the server renders every map the World canvas draws by default into its in-memory render
cache, in the background, so the first World open is served from cache. Measured cold: GBA last tile 9.4 s after the world
payload; GBC world payload 2.8 s plus last tile 3.6 s. Warm: 0.5-1.3 s.

## Exact files (touch nothing else)

1. NEW `packages/server/src/warmUp.ts` -- the family-neutral loop.
2. `packages/server/src/index.ts` -- GBA `createProjectHandler` (`pngCache`, render route at the `renderMatch` block, `dispose`)
   and the `ProjectHandler` type (add `warmUp` to BOTH union members).
3. `packages/server/src/gbcRoutes.ts` -- GBC `createGbcProjectHandler` (`renderCache`, render route, `dispose`).
4. `packages/server/src/hub.ts` -- `createHub` option `prewarm?: boolean`; when true, call `warmUp()` on every handler the hub
   opens (startup `opts.open` AND `/api/hub/open` after the swap). Log the result (see below). Default false so existing hub tests are unchanged.
5. `packages/server/src/serve.ts` -- pass `prewarm: true` to `createHub`.
6. NEW `packages/server/test/warmUp.test.ts` -- tests (a)-(g) below.

Do not edit any existing test or fixture.

## Design (follow it; it is decided)

### warmUp.ts

```ts
export interface WarmResult { rendered: number; skipped: number; failed: number; ms: number }

/** Runs warmOne(name) for each name, one per macrotask: a setImmediate yield BEFORE each map, so a client request queued
 *  meanwhile is answered after at most one map's render. warmOne is synchronous (render + cache insert in one step: see
 *  P12-4w -- a cache clear on save can then never be refilled from a render taken before the clear). Stops as soon as
 *  stopped() is true. A throwing map counts as failed and the loop goes on. Never rejects. */
export function warmEach(names: Iterable<string>, warmOne: (name: string) => "rendered" | "skipped",
  stopped: () => boolean): Promise<WarmResult>
```

Implementation: record `performance.now()`, iterate with `await new Promise((r) => setImmediate(r))` before each name,
check `stopped()` after each yield (return early with counts so far), wrap `warmOne` in try/catch (failed++, keep going,
no console spam beyond one `console.warn` per failure with the name and message).

### GBA (index.ts)

- Extract the cached render into one local helper used by BOTH the route and the warm-up, so they share the key:
  `const cachedRender = (name: string, border: number): Buffer | undefined` -- returns the cached PNG for `` `${name}:${border}` ``,
  or resolves the layout (`resolveLayoutName` logic, hoist it out of the route), renders, `pngCache.set`, returns it;
  `undefined` when the name resolves to no layout (route answers 404 as today). The route keeps its edit-session bypass first.
- `warmUp(names?: string[]): Promise<WarmResult>`: if `names` is omitted, compute the default list exactly as the
  `/api/world` route does with dungeons on (`resolveWorldPlacements(project, getWorld(), readSidecar(project.paths.root), { dungeons: true })`),
  keeping names where `manual || !HIDDEN.has(mapType)` with `HIDDEN = MAP_TYPE_INDOOR, MAP_TYPE_NONE` (the UI's
  `isDrawnByDefault`, `packages/ui/src/world/visibility.ts`; copy the two strings, do not import UI code), `mapType` from
  `project.map(name).mapType` when `project.mapNames()` has it, else `"MAP_TYPE_NONE"`, `manual` = `name in sidecar.manualPlacements`.
  Compute the list inside the first yield (not synchronously in `warmUp`), so `warmUp()` itself returns at once.
  warmOne: `editSessions.has(name)` -> "skipped" (never render or cache from a session); `pngCache.has(key)` -> "skipped";
  else `cachedRender(name, 0)` -- `undefined` -> throw `no layout or map ${name}` (counts as failed) -> "rendered".
  Border is 0: the world canvas URL is `/api/render/<map>.png` with no `?border` (`packages/ui/src/gba/worldSurface.tsx` `imageUrl`).
- `stopped` = the handler's existing `disposed` flag. `dispose()` already sets it.

### GBC (gbcRoutes.ts)

- Same shape. Key `` `${name}:0:day` `` (`renderCache`), matching the GBC world URL `/api/render/<map>.png?time=<time>` with the
  default time `day` and no border (`packages/ui/src/gbc/worldSurface.tsx` `imageUrl`). Extract the cached-render helper the same way.
- Default names: `buildGbcWorldPayload(proj, getWorld(), readSidecar(proj.root), getWarps()).placements` (this also warms
  world and warps, which cost most of the 2.8 s), keeping `p.manual || (p.mapType !== "INDOOR" && p.mapType !== "GATE")`.
- Skip when `edit.openBlocks(name)` is defined, or the key is cached. `stopped` = `disposed`.

### hub.ts / serve.ts

After each successful open (startup and `/api/hub/open`), when `opts.prewarm`:
`void handler.warmUp().then((r) => console.log(`pokemap hub: warmed ${r.rendered} world tiles in ${Math.round(r.ms)} ms (${r.skipped} skipped, ${r.failed} failed)`))`.
A swap disposes the old handler, which stops its loop.

## Tests: `packages/server/test/warmUp.test.ts`

Use the real corpora the other server tests use: `SUBJECT_ROOT`/`hasProject` from `@pokemap/core/test/helpers/corpus.js`
(GBA, `describe.skipIf`, hooks INSIDE the describe -- see `test/api.test.ts` header) and the GBC root the GBC route tests use
(`test/gbcRoutes.test.ts`). Build handlers with `createProjectHandler(root)` or `createServer({ projectPath, port: 0 })`.
Pass explicit short `names` lists (2-4 real maps, e.g. `PetalburgCity`, `LittlerootTown`; GBC e.g. `NewBarkTown`, `CherrygroveCity`)
so tests stay fast. Count renders with `vi.mock` of the render module using `importOriginal` and a counting wrapper
(`@pokemap/core/src/render/layout.js` `renderLayout`; GBC `@pokemap/core/src/gbc/render/map.js` `renderGbcMap`).

- (a) GBA and GBC: after `await warmUp([A, B])`, `GET /api/render/A.png` (GBC: `?time=day`) does not render again (counter unchanged) and returns 200 PNG.
- (b) `warmEach`: with a warmOne that records order, a `setImmediate`-scheduled callback queued right after the call runs
  before the second name is warmed (proves one yield per map, never a tight loop). Also integration: a `GET /api/project`
  issued right after `warmUp([...4 names])` resolves before the warm-up promise does.
- (c) GBA: open an edit session on A (follow how `test/api.test.ts` ~line 140-170 opens one, e.g. a paint), `warmUp([A])` reports
  `skipped: 1`, render counter unchanged; then discard/close the session and `GET` A renders once (proves nothing cached from the session).
  GBC: same with its edit route (see `test/gbcEditRoutes.test.ts`). Leave the subject repos byte-identical: no save in (c).
- (d) `dispose()` stops it: start `warmUp([4 names])`, call `dispose()` before the first yield fires; result `rendered: 0`, counter 0.
- (e) GBA: a cache clear between two maps is never refilled from an earlier render. Use `warmEach` + the GBA handler: make the
  counting `renderLayout` wrapper tag nothing -- instead assert ordering: start `warmUp([A, B])`, and in a `setImmediate` after
  A is cached trigger the save route's clear. If triggering a real save would write the subject repo, do NOT; instead test the
  contract at the `warmEach` level: warmOne must complete render AND insert before returning (spy that the cache holds the key
  synchronously when warmOne returns), plus a code comment pointing at P12-4w. State which you did in your reply.
- (f) `warmUp([A, "NoSuchMap", B])` -> `{ rendered: 2, failed: 1 }`, A and B cached.
- (g) No disk writes: spy `fs.writeFileSync`, `fs.writeFile`, `fs.renameSync`, `fs.mkdirSync` (use `syncBuiltinESMExports` as
  `test/api.test.ts` ~line 449 does; restore after) during `await warmUp([A, B])` -- zero calls. Both families.

## Verify (run from the REPO ROOT, foreground)

```
npx vitest run packages/server/test/warmUp.test.ts packages/server/test/api.test.ts packages/server/test/gbcRoutes.test.ts packages/server/test/hub.test.ts
npm run typecheck
```
Pass = all listed files green, a non-zero test count for warmUp.test.ts, typecheck exit 0.

## Rules

- Do not touch other files; do not edit existing tests or fixtures; never loosen a check to make it pass.
- Never write to the subject repos (`C:/Programming Projects/Pokemon Game/game`, `C:/Programming Projects/pokecrystal-PerfPlus`).
- Report unrelated bugs instead of fixing them. Foreground commands only. Do not commit (the conductor commits).
