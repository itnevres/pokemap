### Task 3: Shared app-level context controller (absorbs M5). Risk: medium

**Files:**
- Create: `packages/ui/src/shared/useContextEditing.ts`, `packages/ui/test/shared/useContextEditing.test.tsx`.
- Modify: `App.tsx` (`contextMap`, `tileVersions`, enter, exit, mode switch, the selection-leaves effect, the SaveDialog commit bump) and `gbc/GbcApp.tsx` (about `:81-99` and `:197-222`, the SaveDialog block at about `:430-445`).

**Interfaces (consumes Task 1's `StrokeChain.settled`; produces):**

```ts
export interface UseContextEditingArgs {
  selected: string | null;
  session: { isDirty: boolean; markClean(): void };
  leave(go: () => void): void;            // the family's existing dirty-switch guard
  strokeSettled(): Promise<void>;         // from the active canvas's StrokeChain (M5)
}
export interface ContextEditing {
  contextMap: string | null;
  tileVersions: Record<string, number>;
  enter(map: string): void;               // through `leave`
  requestExit(): void;                    // awaits strokeSettled, then dirty → open SaveDialog, else leave
  saveOpen: boolean; setSaveOpen(open: boolean): void;
  onCommitted(): void;                    // markClean + bump tileVersions[contextMap]
  leaveForModeSwitch(): void;             // no prompt
}
export function useContextEditing(args: UseContextEditingArgs): ContextEditing;
```

- [ ] **Step 1:** Write the tests:
  - enter goes through `leave`;
  - a dirty exit opens SaveDialog, and Cancel stays;
  - a clean exit leaves;
  - a commit bumps only that map's version and calls `markClean`;
  - a mode switch leaves without a prompt;
  - a selection change leaves;
  - **M5:** exit while an apply is held waits for it, then opens SaveDialog.
- [ ] **Step 2:** Run them and confirm they fail.
- [ ] **Step 3:** Implement the hook.
- [ ] **Step 4:** Make both apps consume it. The canvas exposes `settled` through the existing `canvasProps` path (`GbcMapEditingCanvasProps` and the GBA equivalent) as an optional `onStrokeChain` callback. Add no new context provider.
- [ ] **Step 5:** Add the M5 app-level test in both families (paint with a held apply, press Done, expect SaveDialog). Confirm it fails before Step 4's wiring and passes after.
- [ ] **Step 6:** Teeth-proof:
  - `requestExit` does not await;
  - commit bumps every tile;
  - mode switch prompts.
- [ ] **Step 7:** Gate, then commit.

