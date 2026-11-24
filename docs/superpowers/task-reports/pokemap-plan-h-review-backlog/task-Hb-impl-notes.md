# Plan H task H-b implementation notes -- one `sidecarRoutes.ts` for both server families

## What changed

- **New** `packages/server/src/sidecarRoutes.ts` -- the seven sidecar routes both
  families hand-wrote inline, now one module mounted by both handlers:
  `POST /api/world/conflicts/accept`, `POST /api/world/placement`,
  `POST /api/world/dungeons`, `GET|POST /api/dungeons`,
  `PATCH|DELETE /api/dungeons/<id>`.
- **New** `packages/server/test/sidecarRoutes.test.ts` -- mounts the module on a
  bare temp root with stub deps (no `createServer`, no project/loader import).
- **Edited** `packages/server/src/index.ts` (GBA) -- inline routes removed, one
  `if (sidecar(req, url, send)) return;` mount where the first of them sat.
- **Edited** `packages/server/src/gbcRoutes.ts` (GBC) -- same.
- **Edited** `packages/server/test/gbcRoutes.test.ts` -- one added `it` next to
  "rejects malformed placement bodies".

## Lines removed from each handler (`git diff --stat` will show exact counts)

Roughly, from `index.ts`: the seven inline route bodies spanned ~739-928 in the
pre-change file, i.e. ~190 lines of route code (plus the `dungeonIdMatch`
declaration and the two now-unused `readDungeons`/`writeDungeons`,
`conflictKey`/`isAcceptConflictBody`/`updatedAcceptedConflicts` imports and the
`writeSidecar` import). From `gbcRoutes.ts`: the same seven bodies spanned
~507-674, ~168 lines, plus the now-unused `readDungeons`/`writeDungeons`,
`randomUUID`, `conflictKey`/`isAcceptConflictBody`/`updatedAcceptedConflicts`,
`BodyTooLarge`, `readBody` and `writeSidecar` imports. Exact line counts are in
`git diff --stat` in the commit.

## Deviations from the brief

1. **`POST /api/dungeons` and `PATCH /api/dungeons/<id>` do not route through
   `http.jsonBody`.** The brief says "Use it for every body-reading route", but
   both inline copies answered a non-object with
   `expected a dungeon object, got <raw body>`, while `jsonBody` spells its own
   shape 400 `expected ${shapeText}, got ${text}`. There is no `shapeText` that
   makes those the same string, and the brief simultaneously requires
   "everything else must stay byte-identical, including ... error strings".
   Rather than change one of the two texts, `sidecarRoutes.ts` keeps a small
   private `dungeonBody` helper carrying the same read/parse/400/413/500
   preamble (the one preamble `jsonBody` was factored out of). This is the
   "deviation" the brief's own `jsonBody` doc comment anticipates: http.ts names
   it as the shared shape and this is the one body it cannot express. The
   function is documented as such at its definition. Every other body-reading
   route (conflicts/accept, placement, world/dungeons) does go through
   `jsonBody`, and `dungeonBody` still delegates to `http.readBody` and
   `http.BodyTooLarge` rather than re-implementing the read or the 413.
2. **`SidecarRouteDeps.getWorld` is typed `{ conflicts: Conflict[] }`.** The brief
   writes `{ conflicts: ... }`; the real GBA `World` and GBC `GbcWorld` both
   carry `conflicts: Conflict[]`, so the concrete core type is used (it is what
   `conflictKey` consumes). `Conflict` is imported as a type from
   `core/world/connections.js`.
3. **The `POST /api/world/placement` known-map guard for GBC is the only
   behaviour change applied**, exactly as allowed. GBC's placement shape guard
   is now the shared `isPlacementBody` (the stricter GBA one, which also checks
   `Number.isFinite`), which is the "unify onto the stricter GBC guards" rule
   restated: the placement guard was already identical in both families except
   for the known-map check, so unifying it changes nothing.
4. **`PATCH`/`DELETE` malformed-id text is GBC's** (`malformed dungeon id <raw>`),
   per the brief. The old GBA text ("malformed percent-escape in path") is gone
   from these two routes only; it remains on GBA's other `:name` routes.
5. **`PATCH`/`DELETE`/`POST /api/dungeons` guards are now the stricter
   non-null/non-array object check** for both families (GBA previously threw on
   `null` -> 500). This is allowed change #2.

## Unrelated bugs noticed (not fixed)

- `index.ts`'s `GET /api/world` reads `readSidecar(...)` into a local also named
  `sidecar`, which shadows the module handle of the same name now declared at
  the top of `createProjectHandler`. The shadowing is legal (the local is inside
  an `if` block that returns before the mount site runs), and the mount call
  `sidecar(req, url, send)` is outside that block, so behaviour is unchanged --
  but a future edit that moves the mount inside that block would silently call
  the wrong `sidecar`. Left as-is to keep the diff to the brief's scope; noted
  here because it is the one readability trap the extraction creates.
- No other unrelated bug found while moving these routes.

## Verification

Not run here by instruction (the orchestrator runs vitest/typecheck/build). The
module imports no `Project`/`GbcProject` and the new test imports no
`createServer`/`createProjectHandler`/`createGbcProjectHandler`, which is the
"no family dependency" pin the brief asks for.