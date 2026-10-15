# Task 9 quality review (5e5bccc..4c2abe1)

Verdict: Approved. Critical 0, Important 0, minor 3.

## Focus checks
- Hook order: both new hooks (useRef, useEffect) sit at the top of Toolbar. The only `return`s in the diff are inside the keydown handler. No early return precedes them. Safe.
- Ref pattern, stale props: `latest.current` is reassigned on every render and the handler reads it at event time, so no stale closure. The rerender test (availableTools [] then ALL) proves it. Empty deps are correct because nothing else is captured; TOOL_KEY and shortcutBlocked are module-level.
- Listener leak: the effect adds one listener and its cleanup removes the same function. The unmount test and the StrictMode test (mount, cleanup, remount, then exactly one call) would both fail if cleanup were missing. Bubble phase is used as the plan requires.
- Test isolation: ToolbarShortcuts has afterEach cleanup(). App.test.tsx has a file-level `afterEach(() => vi.unstubAllGlobals())` at line 111, so the new App test's trailing unstub is redundant but harmless, and a failed assertion cannot leak the fetch stub. Nothing in the new tests stubs globals or adds window listeners outside Toolbar.
- Vacuous passes: none found.
  - The App test asserts aria-pressed "false" after the keyDown in the search box, then "true" after the window keyDown. It fails if the guard is removed (the first assertion flips) or if the toolbar or shortcut is not wired (the second fails).
  - The prevented-key, modal, input, modifier, unavailable and absent-tool tests each assert the negative with a positive control elsewhere in the file. `press("r")` is the positive control in the absent-tool test.
  - The StrictMode test uses `reactStrictMode: true`.

## Minor
1. `latest.current = ...` is written during render. It is the common pattern and is fine under StrictMode, but it is impure for concurrent rendering (a discarded render can leave a newer value). Assigning in a `useLayoutEffect` or an effect without deps would be stricter. Not blocking, since every handler is user-event driven and renders commit.
2. `document.body.innerHTML = ""` in afterEach is redundant after RTL cleanup(). Harmless.
3. `isTextTarget` ignores keys dispatched at `window` or `document` with a non-Element target. This is correct and intended (the tests rely on it). A focused `<button>` still receives tool letters, which is acceptable and matches the spec.

No new dependency. No jest-dom matchers used.
