### Task 6: One editing workspace with family slots. Risk: medium

**Files:**
- Modify: `components/MapEditingWorkspace.tsx`. It becomes the single workspace, with slots.
- Modify: `gbc/GbcMapEditing.tsx`. It becomes a GBC slot configuration over the shared workspace and keeps its export and props.
- Read: `hooks/useMapEditing.ts`, which holds the GBA per-visit state that GBC keeps inline (`pick`, `err`, `warn`, the visit identity at `GbcMapEditing.tsx:60-91`).

**Interfaces (produces):**

```ts
export interface WorkspaceSlots<CanvasProps> {
  Palette: React.ComponentType<{ mapKey: string; onPick(stamp: unknown): void }>;
  Inspector: React.ComponentType<{ mapKey: string }>;
  toolbarExtras?: React.ReactNode;
  buildCanvasProps(): CanvasProps | null; // the existing GbcMapEditingCanvasProps builder / GBA equivalent
}
// MapEditingWorkspace gains `slots` and keeps `active` + `renderCanvas` (the E2/5b seam) exactly.
```

The per-visit state and the visit-identity guard (`isCurrent`) move into the shared workspace, so GBA gains the A→B→A protection GBC has.

- [ ] **Step 1:** Write tests for the workspace with stub slots:
  - a visit change retires the pick, error and warning before children render;
  - a deferred callback from the old visit is ignored;
  - `active={false}` hides the chrome but keeps the canvas node.

  Run them and confirm they fail.
- [ ] **Step 2:** Implement the shared workspace. Wire GBC first: `GbcMapEditing.test.tsx` and `GbcAppContext*` stay unchanged and green. Then wire GBA: `MapEditingWorkspace*.test.tsx` and `AppContextEdit.test.tsx` stay unchanged and green.
- [ ] **Step 3:** Add a GBA test for the A→B→A stale-pick case that GBC already covers (`GbcAppContext.test.tsx` "different-map tree visits retire a context stamp…"). It fails before Step 2 and passes after.
- [ ] **Step 4:** Teeth-proof: drop the visit reset, drop `isCurrent`, and remount the canvas on `active` toggle.
- [ ] **Step 5:** Gate. Live check: context edit in both families. Commit.

