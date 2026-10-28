### Task 1: `?scope=dungeon` in both servers (#6)

**Files:**
- Modify: `packages/server/src/index.ts:607-611` (GBA `/api/world`)
- Modify: `packages/server/src/gbcRoutes.ts:215-243` (`buildGbcWorldPayload`), `:502` (route call)
- Test: `packages/server/test/world.test.ts` (GBA, subject-backed fixture copy), `packages/server/test/gbcRoutes.test.ts`

**Interfaces:**
- Produces: `GET /api/world?scope=dungeon` in both families returns placements resolved as if `dungeonAutoLayout` were
  true; `sidecar` in the response is the saved one, unchanged on disk. `buildGbcWorldPayload(proj, world, sidecar,
  warps?, opts?: { scope?: "world" | "dungeon" })`.

- [ ] **Step 1: Write failing tests (verify the bug in each family first)**
  - GBA `world.test.ts`, `it("includes indoor maps for scope=dungeon without changing the saved layout flag")`: POST
    `/api/world/dungeons {enabled:false}` against the fixture copy; then GET `/api/world` and `/api/world?scope=dungeon`.
    Expect `scoped.sidecar.dungeonAutoLayout === false`; scoped placement count > normal count; one indoor dungeon member
    of the subject (implementer picks a singleton indoor map absent from the normal response) is in scoped only; the
    sidecar file bytes equal the bytes after the POST. Restore the fixture sidecar in `finally`. (Reference: WIP
    `946bb61` `world.test.ts`; its `1209`/`NewBarkTown_Lab` values are not GBA facts, do not copy them.)
  - GBC `gbcRoutes.test.ts`, `it("keeps singleton indoor maps for scope=dungeon with auto-layout off")`: build with
    sidecar `{ dungeonAutoLayout: false, manualPlacements: {} }`; an indoor singleton map is absent without opts and
    present with `{ scope: "dungeon" }`; `payload.sidecar.dungeonAutoLayout === false`. Plus an HTTP test through the
    GBC route (`gbcRoutes.ts:502`, the existing GBC route-test harness) comparing `/api/world` with
    `/api/world?scope=dungeon`, so the route's forwarding is mutated separately from the helper.
- [ ] **Step 2: Run both; expect FAIL.** `npx vitest run packages/server/test/world.test.ts packages/server/test/gbcRoutes.test.ts`.
  If the GBC test passes before any change, GBC is unaffected: record that in the task report, drop the GBC change, keep
  the test as a guard.
- [ ] **Step 3: Implement.** GBA: resolve with `{ ...sidecar, dungeonAutoLayout: true }` when `scope === "dungeon"`,
  return the original `sidecar`. GBC: `keep()` also passes for `opts.scope === "dungeon"`; the route reads
  `url.searchParams.get("scope")`. `?dungeons=` behaviour unchanged.
- [ ] **Step 4: Run both; expect PASS.** Then the whole server suite: `npx vitest run packages/server`.
- [ ] **Step 5: Mutation check:** drop each family's scope branch; the matching test fails. Record in the report.
- [ ] **Step 6: Commit** `feat(plan-13): /api/world?scope=dungeon in both families (#6)`.

