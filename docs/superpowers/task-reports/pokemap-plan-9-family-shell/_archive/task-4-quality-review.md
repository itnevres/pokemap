# Task 4 quality review (a0cfb95)

### Strengths
- Hook order is unconditional and fixed: every hook (useState x4, useGbcDungeons, useGbcGroups, useGbcWorld, useMemo, useGbcMap, useGbcEditSession) runs at top level; mode-dependence is only via arguments (`mode === "dungeon"` / `"world"`), matching GbcApp. No hooks inside slot closures.
- Async boundary in `leave` (adapter.tsx:77-81) is byte-equivalent to GbcApp.tsx:119-122. `.then(go).catch(...)` terminates the chain, so no unhandled rejection; a throw inside `go` is also surfaced as switchError (same as original). `onCommitted` reload (adapter.tsx:189-191) is also caught.
- Identity: World host keeps `key="world-host"` and the inner `GbcWorldCanvas key="world"`, with GbcMapEditing always the same child type/position in the host, so toggling `contextMap` does not remount the canvas. renderMap's GbcMapEditing is unkeyed exactly as GbcApp (adapter.tsx:158); its per-visit reset is internal (`useVisit(mapName)` / `forMap` keys in GbcMapEditing.tsx:63-67), not key-driven, so no key is needed.
- `ready` gating by `map.data.map.name === selected` retained; `placed` uses the ternary form the brief suggested (typed Map|null, no `&&` widening).
- StrictMode: no effects or module state added here; all state updates are in event handlers/promise callbacks. Double render is harmless.
- No new dependency. Comments ported and updated to point at the new slot arguments.
- Faithful port (spot-checked GbcApp.tsx:107-122, 290-335) reduces drift risk.

### Issues
Critical: none.

Important: none.

Minor
1. adapter.tsx:80 (carried over, plan-mandated): `session.discard().then(go)` can resolve after unmount or after `selected` moved on (e.g. user clicks a second map while the discard is in flight). `go` closes over the click-time target, so it would apply a stale selection and `setSwitchError` could fire on an unmounted component. React 18 ignores the latter, and GbcApp has the identical behavior, so it is not a regression. If hardened later: guard with a ref token incremented per `leave`. Not needed for this task.
2. adapter.tsx:190 (carried over): `map.reload()` rejection message is attributed to the *current* switchError slot even if the user has since switched maps; `onSelected` clears it on the next switch, so it self-heals. Cosmetic.
3. adapter.tsx:96-101: `editingProps` and the `world`/slot closures are rebuilt each render, so `onHoverMetatile`/`onOpenSave` get new identities every render. Same as GbcApp (inline lambdas there too); only matters if GbcMapEditing becomes memoized.
4. Test (adapter.test.ts:233-239) is a thin metadata pin; it adds value only as a module-load/import-graph check and cannot exercise leave/identity behavior. Acceptable for this task (plan-specified); behavioral coverage presumably arrives with the FamilyApp/GbcApp-parity tests in later tasks. Worth confirming Task 6/7 covers: dirty-leave confirm+discard failure, and World host non-remount on context toggle.

### Assessment
Approved
