### Task 7: Assemble the family adapter and converge the app shells. Risk: medium

**Files:**
- Create: `packages/ui/src/family/types.ts`, `family/gba.ts`, `family/gbc.ts`.
- Modify: `App.tsx` and `gbc/GbcApp.tsx`.

**Interfaces (produces; built from what Tasks 1-6 actually parameterised; add nothing speculative):**

```ts
export interface EngineAdapter<Payload, Session, CanvasProps> {
  family: "gba" | "gbc";
  geometry: { nativePx: 16 | 32; borderRings: number };   // Task 2 native, composite origin
  capabilities: { collisionPaint: boolean; timeOfDay: boolean };
  useSession(mapName: string | null, seed: Payload | undefined): Session; // UseEditSessionResult | UseGbcEditSessionResult (Task 5 keeps both)
  slots: WorkspaceSlots<CanvasProps>;                       // Task 6
}
```

- [ ] **Step 1:** Write `family/*.ts`, plus a test asserting each adapter's geometry and capabilities (16/1/collision true for GBA; 32/1/timeOfDay true for GBC).
- [ ] **Step 2:** **Stop rule** for the shells. After Tasks 1-6, diff `App.tsx` against `GbcApp.tsx`.
  - If the remaining difference is only adapter-shaped, merge them into `shared/FamilyApp.tsx`, and keep `App` and `GbcApp` as one-line wrappers so `Root` and the tests are untouched.
  - Otherwise, record the remaining real differences, merge only the identical sections (hooks, effects), and stop.
- [ ] **Step 3:** Gate, plus a live smoke test of both families (open a project from the picker, switch Map/World/Dungeon, context edit). Commit.

