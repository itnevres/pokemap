### Strengths
- Hook order in useGbaRuntime (adapter.tsx:35-63) is unconditional and fixed: six hooks (useMapGroups, useMapLayout, useWorldVisibility, useDungeons, useEditSession, useMapEditing), none behind a branch or early return. `mode` only feeds boolean args, as App.tsx did. Inputs are only { selected, mode }; all other data arrives via ShellSlots. StrictMode-safe: the body has no side effects, and window.confirm runs only inside the leave callback.
- World host identity is correct. Both branches of renderWorld (adapter.tsx:112-116) return MapEditingWorkspace with the same type, the same position and `key="world-host"`. So the WorldCanvas inside (`key="world"`) is not remounted when `active` flips or contextLayout appears. renderMap has no key, but it is a different slot, so it is never confused with the world host.
- No stale-closure risk. The render slots close over the current-render editSession/editing/layout. The shell calls them during its own render, so nothing is held across renders.
- contextLayoutFor guards against useMapLayout keeping the previous map's data (adapter.tsx:72-74). The App.tsx comments are kept where they explain behavior. No new dependency.

### Issues
**Critical:** none.

**Important:** none.

**Minor**
1. adapter.tsx:122 `leave: (go) => leave(go)` is a pointless wrapper. The `{ sameMap }` second parameter is dropped, which is fine since it is ignored on purpose. Fix: define `leave` once as the returned property, `leave: (go) => { ... }`, and drop the intermediate const.
2. adapter.tsx:119-154 gives the runtime and slots fresh identities every render: the `visibility` and `map` objects, the `leave`/`onSelected`/`onEnterContext` closures, the `context` object and `renderCanvas` passed to WorldCanvas, and the `world` closure. This matches App.tsx's old behavior (inline JSX every render), so there is no regression. It would only matter if the shell memoizes on these. The rule for the shell (Task 4) is to never put them in effect or memo deps. Hoist `onSelected`/`onEnterContext` no-ops to module-level `const noop = () => {}` (cheap, stable). Do not add useMemo here; it would need editSession/editing deps that change every render anyway.
3. adapter.tsx:123-124, 153 `onSelected: () => {}`, `onEnterContext: () => {}` and `onCommitted: () => {}` are inline no-ops. A shared module-level `noop` would give stable identities and mark them as deliberate.
4. adapter.tsx:78 the nested `world` render function is redefined each call. Fine for correctness. The 8-line key comment (adapter.tsx:79-87) is carried over verbatim from App.tsx. It is accurate, and now sits one scope away from the key it describes (`key="dungeon"` is at line 134). Optional: add a one-line pointer there.
5. Test value is low (adapter.test.ts:+9). It checks three static fields and `capabilities` identity. It would not catch a hook-order regression, a key change, or a leave-policy change. Suggest one cheap behavioral test (renderHook with mocked hooks, or a source-level check) for `leave`: dirty and confirm declined means `go` is not called; dirty and confirmed means it is; clean means it is. Not blocking. Plan 9 behavior is covered by the integration and e2e tests in later tasks.
6. The duplicated MapEditingWorkspace props across the two branches of renderWorld (adapter.tsx:113 and 115) invite drift. Consider `const common = { onStrokeChain, key..., editSession, editing, renderCanvas: world }`. Optional. Spreading `key` in JSX triggers a React warning, so keep `key` literal if refactored.

### Assessment
Approved
