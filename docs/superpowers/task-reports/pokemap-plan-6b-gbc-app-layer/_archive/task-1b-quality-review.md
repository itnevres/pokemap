# Plan 6b Task 1b: code-quality review

Reviewed `git diff e3d999d..602e77d` (`packages/server/src/gbcRoutes.ts`,
`packages/server/test/gbcRoutes.test.ts`) against
`task-1b-spec.md` / `task-1b-implementer.md`. Read-only review; nothing in
the repo was changed.

## Verdict: **approve-with-fixes**

The routes are correct, match `index.ts`'s conventions closely (regex
captures, `decodeURIComponent`, PNG headers, 400-vs-500 discipline,
`mapNames` guard against `proj.map()` throwing into the outer 500 handler),
and every comment claim I checked against the real `index.ts` code is
accurate. Nothing here blocks the task. The fixes below are worth doing,
mainly because Task 2 is about to roughly double this file's size.

## Findings

1. **[Important]** `packages/server/test/gbcRoutes.test.ts:131-135` — the
   test `"groupOrder matches openGbcProject(root).groupNames(), 26 entries,
   starting with OLIVINE"` never calls `/api/groups` (no `get(...)` call at
   all); it only re-checks `openGbcProject(GBC_SUBJECT_ROOT).groupNames()`
   directly. That fact is already covered by `packages/core/test/gbc/project.test.ts`'s
   own `groupNames()` tests, and the very next test (137-152) independently
   re-derives the same "26 entries, starts with OLIVINE" facts *and* calls
   the route. Sitting inside `describe("GET /api/groups")`, this test reads
   as a route test but adds zero route coverage. Fix: delete it (or fold its
   two assertions as inline comments/setup in the next test if they're
   wanted as documentation).

2. **[Important]** Mutation 7 (block-0→border substitution leaking into
   `/api/map/:name`'s `blocks` field) survives, and the implementer's stated
   reason for not adding a unit test — "`createGbcServer`'s signature has no
   injection point for a stub `GbcProject`" — targets the wrong layer. The
   payload-assembly logic in the `mapMatch` branch
   (`gbcRoutes.ts:95-137`, from `proj.layout(map)` through the final
   `send(200, {...})`) doesn't need `createGbcServer` restructured at all: it
   only needs `proj` and `map` as plain arguments. Extracting it into a
   small exported function, e.g.
   `export function buildMapPayload(proj: GbcProject, map: GbcMap): GbcMapPayload`,
   would let it be unit-tested directly against `stubGbcProject`
   (`packages/core/test/gbc/helpers/stubGbcProject.ts`, already used for
   exactly this kind of fixture in `render/map.test.ts`) with a stub
   `layout()` returning a block with `metatileId: 0`, closing the gap the
   report accepts as unclosable. This also directly helps finding 6 below.
   Until this is done, the report's framing ("no stub-based test is worth
   adding") slightly overstates the cost — a stub test is easy here, just not
   at the HTTP layer the implementer considered.

3. **[Minor]** `gbcRoutes.ts:167-174` and `204-211` — the `?time` parsing
   block (absent → `"day"`, else `parseTime` → 400 on throw) is duplicated
   verbatim across the render and metatile routes. This matches this file's
   own established idiom of inlining rather than extracting (`index.ts`
   repeats its cache-get/set/`writeHead` pattern three times — render,
   metatile, species-icon — without a helper), so it's not a foreign
   pattern, but it is exact, char-for-char duplication of 8 lines twice.
   Worth a tiny `parseTimeParam(url): { time } | never` (throwing 400 via a
   thrown, caught value, or returning a tagged result) if Task 2 adds
   another `?time`-taking route; not worth doing for two call sites alone.

4. **[Minor]** Same duplication note for the cache-get-or-render-and-send
   block (`renderCache`/`metatileCache`, `gbcRoutes.ts:178-185` and
   `220-227`) — identical shape to `index.ts`'s own thrice-repeated
   `pngCache`/`iconCache` pattern, so this is consistent with the file's
   convention rather than a regression. No action needed now; flagging only
   because the review brief asked to weigh a helper vs. moved duplication —
   moving it (matching `index.ts`) is the right call here.

5. **[Important, forward-looking]** All four routes' bodies live inline in
   one `createHttp` callback (now ~200 lines), mirroring `index.ts`'s own
   single-giant-handler style. That style has a lot of historical inertia in
   `index.ts` (1000+ lines); `gbcRoutes.ts` doesn't yet, and Task 2 adds five
   more routes (`/api/world`, `/api/encounters`, `/api/where`,
   `/api/coverage`, `/api/species`) to the same function, which will roughly
   double it. Before Task 2 lands, consider extracting each route's body
   into a small named function (`buildMapPayload`, `buildGroupsPayload`,
   etc.) taking already-parsed inputs and returning a plain value for
   `send()`, so the dispatch chain in `createHttp`'s callback stays a
   readable list of `if (match) return send(200, buildX(...))` lines. This
   is the same fix as finding 2, generalized — it buys testability (stub
   injection without touching `createGbcServer`) and navigability at once.
   Not a blocker for 1b; flagging now so Task 2 doesn't inherit a much
   bigger single function to untangle later. Also relevant to Tasks 3-6
   (UI runtime type guards): smaller, named payload-builders make it obvious
   at a glance which function's return type each `GbcXPayload` guard should
   be checked against.

6. **[Nit]** `gbcRoutes.ts:168` and `205` — the local `time` variable is
   typed with the literal union `"morn" | "day" | "nite"` instead of the
   already-exported `TimeOfDay` type
   (`packages/cli/src/args.ts:29`, which `parseTime` already returns).
   Importing `type { TimeOfDay }` and using it for both `let time: TimeOfDay;`
   declarations would remove the duplicated literal and track any future
   change to the union automatically. Purely stylistic; not a bug.

7. **[Confirmed accurate, no fix needed]** Comment-accuracy spot-checks, all
   verified true against the real code:
   - "the GBA render route validates `?border` before resolving the map name
     to 404" — confirmed, `index.ts:259-293` (`parseBorder` at 259,
     `resolveLayoutName()`'s 404 only reached at 282/292).
   - "the GBA metatile route checks `layoutByName`'s 404 before
     `Number.isInteger(id)`'s 400" — confirmed, `index.ts:318-320`.
   - The `/api/groups` comment's claim that it reuses `MapTree`'s
     `MapGroupsData` shape (`{groupOrder: string[]; groups:
     Record<string,string[]>}`) — confirmed exact match,
     `packages/ui/src/components/MapTree.tsx:4-7`. (No `satisfies
     MapGroupsData` is used there, unlike the file's other two `satisfies`
     usages — correctly so, since `@pokemap/server` doesn't and shouldn't
     depend on `@pokemap/ui`; not a finding.)
   - PNG response headers (`content-type`/`cache-control`) match `index.ts`'s
     three existing usages verbatim.
   - Error messages all correctly name the offending value: `no map
     ${name}`, `metatile id must be a non-negative integer, got ${rawId}`,
     `border ${border} out of range -- must be an integer 0-${maxBorder}`,
     `metatile ${id} out of range for ${ts.constName} (count
     ${metatileCount})`.

8. **[Confirmed, no fix needed]** The implementer's spec-deviation #1 (render
   and metatile routes deliberately using different 404-vs-400 orders) is
   correctly justified — re-verified independently against `index.ts` above
   (finding 7) and matches the spec's own per-route table, which does
   genuinely conflict with the ground-rules' general "make it the same for
   both" line. Reasonable call, well-documented in-code.

9. Test-suite structure otherwise matches this file's own conventions well:
   `describe.skipIf(...)` at the top with `beforeAll`/`afterAll` inside it
   (correct per Plan 0 §7); combined 400-assertion tests
   (`"400s: border out of range... plus abc/-1/1.5, plus a bad time"`) match
   `api.test.ts`'s own established style of bundling several bad-input
   cases into one `it`; the CABLE_CLUB group-order pin and the
   VioletCity/MahoganyTown roof-metatile pair are both independently
   measured (constants file, corpus `.blk` bytes) rather than echoing the
   route, as the spec requires. No slow tests observed by inspection (all
   fixtures are single small maps; the border×time matrix in the render
   test is 9 HTTP round-trips against one small map, not a corpus-wide
   sweep).

## Not investigated further
Runtime behavior (server not started, per the read-only/no-server
constraint) — the implementer's own live-check curl output in
`task-1b-implementer.md` was read and is consistent with the code.
