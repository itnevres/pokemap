# Task 5 code-quality review (98aa5ea over a0cfb95)

### Strengths
- Hook order is clean. `FamilyApp` has no early return and no conditional hook. `useRuntime` is called once, right after the `useState` calls. `useBeforeUnloadGuard`, `useStrokeChainRegistry`, `useContextEditing`, `useDungeonFilter` and the two `useMemo` calls (`allMapNames`, `visibility`) all run unconditionally. Every branch happens in JSX or inside callbacks. `caps` is read from the adapter, which is fixed per mount because Root keys on `family:root:gen`.
- `runtime` hook inputs are only `{ selected, mode }`, as required. Everything else reaches the render slots through the `ShellSlots` object.
- `deleteDungeon` is correct. The post-`await` `setOpenDungeonId((cur) => cur === id ? null : cur)` is functional, so there is no stale `openDungeonId`. A rejection from `remove` propagates to `DungeonSidebar`, which awaits `onDelete` and reports into its action-error slot. Nothing is swallowed and nothing goes unhandled. The comment is kept.
- `ShellSlots` closures are rebuilt every render, so none go stale. The async GBC discard path (`runtime.leave` -> `.then(go)`) only touches `name` and state setters in `go`. `ctx.leaveContext` and `select` are only used for their setter effects, so a late call is harmless.
- Element identity is preserved. `<main>` always has the same four child positions: `{runtime.banners}`, the content expression, the `SaveDialog` expression and `{runtime.modals}`. The world host stays in the content position in both modes. Both adapters keep `key="world-host"` and use the same element type in both branches (`gba/adapter.tsx:96,98`, `gbc/adapter.tsx:116`). An in-context toggle therefore does not remount the world host. Moving the GBC `switchError` banner into the `banners` slot is position-stable, because it is a fixed first child and the old inline position was also first.
- `useDungeonFilter` keeps both families' filter-identity semantics. GBA re-mints the Set on every dungeon change. GBC reuses it by id and sorted members. `filterCache` is reset when no dungeon is open.
- Wrappers are minimal. Root's routing is a single expression. The mojibake ellipses were fixed before commit.

### Issues

**Critical:** none.

**Important:** none.

**Minor**
1. `FamilyApp.tsx:1016,1019,1027-1029` (ellipsis). No test pins the `…` text. `GbcApp.test.tsx:221` matches only `/Loading map groups/`, and nothing matches `Loading {selected}…`. This is the same class of silent regression the Codex mojibake already produced once. Fix: in a later task, add one assertion such as `getByText("Loading map groups…")` to the shell tests (or to the FamilyApp tests Task 6 will write). It does not need to block Task 5.
2. `FamilyApp.tsx:1025-1029` (readability). The `<main>` content is a three-level ternary compressed onto five lines, mixing mode, `selected`, `map.error` and `map.ready` branches. The `: <p>` and `? (` placements make it hard to scan. Fix: extract a local `const content = ...` computed with early `if` returns, or a small `renderContent()` function. Keep `{content}` in the same slot so identity is unchanged.
3. `FamilyApp.tsx:1026` (redundant guard). `openDungeon && mapFilter` is redundant, because `mapFilter` is non-null exactly when `openDungeon` is. It is only there to narrow the type. Either keep it with a one-line comment, or have `useDungeonFilter` return the narrowed type.
4. `FamilyApp.tsx:992` (coupling). `caps.timeOfDay && runtime.headerExtras` gates a generic slot on a specific capability. If a second family adds header extras without time of day, this is a trap. Fix: render `{runtime.headerExtras}` directly and let GBA return `null`. If it is a deliberate guard, say so.
5. Stale comment references. The `FamilyApp.tsx` comments say "GbcWorldCanvas" and "GbcApp's own jumpTarget" (~lines 845-856, 932-943). `useDungeonFilter.ts` cites `App.tsx:136-149` and `GbcApp.tsx:133-143`. These files are deleted or gutted in Task 6, so the line references will rot. Fix in Task 6: reword to the adapter or family.
6. `Root.test.tsx` new test (value). It shows that the other family's UI replaces the first (the Time-of-day group and "Crystal" are gone, one View group remains). It does not directly prove a fresh mount, because a same-instance re-render with a swapped adapter would show the same DOM. Hook-count mismatch would probably throw, which gives indirect protection. Fix: before switching, change shell-local state that a fresh mount would reset (for example click World, then assert Map is `aria-pressed="true"` after the switch). The reverse direction, gba to gbc, is also untested. Low priority, since the brief supplied this test.
7. Unmemoized `leave`/`slots`/`deleteDungeon` are recreated every render. This is fine today because no consumer depends on their identity. It is noted only so Task 6 does not add memoized children that assume stable callbacks.

### Assessment
Approved. No Critical or Important findings. The Minor items above are all non-blocking; items 1 and 5 are best picked up in Task 6.
