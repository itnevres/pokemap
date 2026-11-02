### Task 2: dungeon surfaces request the scope; auto-layout switch hidden there

**Files:**
- Modify: `packages/ui/src/canvas/worldSurfaceAdapter.ts:97` (`useWorld`), `packages/ui/src/canvas/WorldSurface.tsx:94`
  and the toolbar `DungeonAutoLayoutSwitch` line (~`:778`)
- Modify: `packages/ui/src/gba/worldSurface.tsx:59-77` (`useGbaWorld`), `packages/ui/src/gbc/worldSurface.tsx:219-223`,
  `packages/ui/src/gbc/hooks/useGbcWorld.ts:24-43`
- Test: `packages/ui/test/canvas/WorldSurface.test.tsx`, `packages/ui/test/WorldCanvasSurface.test.tsx`,
  `packages/ui/test/gbc/GbcWorldCanvasSurface.test.tsx`, `packages/ui/test/gbc/useGbcWorld.test.ts`

**Interfaces:**
- Consumes: Task 1's query parameter.
- Produces: `type WorldScope = "world" | "dungeon"` exported from `worldSurfaceAdapter.ts`;
  `useWorld(ledger: PlacementLedger, scope: WorldScope): WorldData<P, C, W>`; `useGbcWorld(enabled = true, onIssue?,
  scope: WorldScope = "world")`. WorldSurface passes `mapFilter ? "dungeon" : "world"` (fixed per keyed mount).

- [ ] **Step 1: Failing tests:** each family's dungeon-mode surface (`mapFilter` set) GETs exactly
  `/api/world?scope=dungeon`; World mode GETs `/api/world`; the "Dungeon auto-layout" switch is absent with a
  `mapFilter` and present without. Existing dungeon tests whose fetch mock matches `/api/world` exactly are updated to the
  new URL (name that reason in the report).
- [ ] **Step 2: Run; expect FAIL** (`npx vitest run` on the four files).
- [ ] **Step 3: Implement** the signatures above; the switch renders only when `adapter.postDungeons && !mapFilter`.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Mutation check:** hard-code `"world"` in WorldSurface; the dungeon URL tests fail.
- [ ] **Step 6: Commit** `feat(plan-13): dungeon views request scope=dungeon; hide auto-layout switch there`.

