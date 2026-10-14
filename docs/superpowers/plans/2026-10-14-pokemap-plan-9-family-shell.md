# Plan 9: one shell (FamilyApp + EngineAdapter) and the unified edit layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GBA and GBC run through one `FamilyApp` shell over a per-family `EngineAdapter` (one `useRuntime` hook each), and both families show the D4 right-hand edit rail and the D5 toolbar (icon + label, shortcut in the tooltip, R1 keyboard shortcuts), plus R2's GBA palette hover-link. Nothing else changes behaviour.

**Architecture:** `shell/FamilyApp.tsx` owns everything the two shells share today (mode, selection, jump token, open dungeon, stroke registry, context editing, header, sidebar, SaveDialog). Each family's `useRuntime` hook owns its data hooks, edit session, switch policy (`leave(go, { sameMap })`) and render slots. Root keys `FamilyApp` on `family:root:gen`, so the adapter (and the runtime hook's hook order) never changes within a mount. `App.tsx` and `GbcApp.tsx` become thin wrappers for one task (so all 13 shell test files prove the merge unchanged), then are deleted when the tests move.

**Tech Stack:** React 19.2, TypeScript, Vite, Vitest 3 + @testing-library/react 16.3 (jsdom). **No `@testing-library/jest-dom`.**

**Spec (binding):** `docs/superpowers/specs/2026-10-14-pokemap-plan-9-family-shell-design.md`. Roadmap decisions D1-D16 (binding): `docs/superpowers/plans/2026-10-14-pokemap-roadmap-unified-ui.md`. Executors read the spec and this plan.

## Global Constraints

- Behaviour does not change apart from layout (D4 rail), toolbar (D5), shortcuts (R1) and the GBA hover-link (R2). Switch semantics stay per family behind `runtime.leave(go, { sameMap })`; D1 save-or-discard is Plan 10.
- Sign composer GBA only; Duplicate GBC only; manual placements, defects banner, dungeon filter cache GBC only; Dungeon auto-layout toggle and Unplaced rail GBA only. Canvas rendering and hit-testing untouched (Plans 11/12) except R2's hover callback.
- Edit-state lifetimes stay: GBA `useMapEditing` at shell (runtime) level, survives mode switches; GBC per-visit state inside `GbcMapEditing`, resets with its mount.
- No new npm dependency (icons are inline SVG in `components/toolIcons.tsx`).
- Tool labels exactly: `Pencil`, `Rect`, `Bucket`, `Dropper`, `Shift`, `Collision`. Tooltips exactly `"Pencil (P)"` … ; `"Undo (Ctrl+Z)"`, `"Redo (Ctrl+Y)"`. Disabled tools keep their reason title (GBC non-writable `.blk`; default `"Not yet available"`).
- Shortcuts exactly: P R B I S C; Ctrl/Cmd+Z undo; Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z redo. Ignored when `defaultPrevented`, target is input/textarea/select/contenteditable, an `[aria-modal="true"]` element exists, a letter key has any modifier (Ctrl, Meta, Alt, Shift), the tool is absent or disabled, or Undo/Redo is unavailable. Handled keys call `preventDefault`.
- R4 (user ruling 2026-10-14, added to the spec): both palettes scroll the hovered cell into view only while the shared "Follow hover" switch is on. One hook (`shared/useFollowHover.ts`), one switch (`shared/FollowHoverSwitch.tsx`), identical in both families. Default on; remembered in `localStorage` key `pokemap.palette.followHover`, every read/write in try/catch (falls back to on).
- Rail: `.edit-rail`, 260 px; order collision palette (Collision tool only) → metatile palette (always, flex, scrolls) → inspector (≤ 50 % height). Removed: `.app__metatile-strip`, `.app__collision-strip`, `.gbc-map-editing__rail`. Flex children `min-width: 0`.
- Tests are moved, never dropped. Gate: **2,703 + tests added by this plan, 0 fail**; typecheck and `npm run build -w @pokemap/ui` pass. Per moved file: `git diff master -- <file> | grep -c '^-[^-]'`, every removed line given a reason in the task report.
- Run vitest **from the repo root** (tell: `document is not defined`). Capture every full run to a file: `npm test > <scratch>/run-N.txt 2>&1`.
- No jest-dom matchers (tell: `toBeInTheDocument is not a function`): use `.getAttribute`, `.disabled`, `.textContent`, `toBeNull()`, `toBeTruthy()`.
- StrictMode witnesses use the `reactStrictMode: true` option (render/renderHook), never a `<StrictMode>` wrapper.
- Real-corpus tests use temp copies (`copyGbcSubjectToTemp` or equivalent) for anything a mutation could turn into a write.
- A shell gaining UI breaks `Root.test.tsx` absence assertions: grep `queryBy…toBeNull` for any text you add.
- Task reports: `docs/superpowers/task-reports/pokemap-plan-9-family-shell/task-<N>-<role>.md`; the dispatch returns one status line + that path. Move (never delete) a task's reports to `_archive/` once its reviews pass.
- Commits: explicit pathspecs only (`git add <paths>`), never `git add -A`/`.`. No push and no PR without the user.

## Review Focus

1. **Typing in the GBA rail's palette search box** (`.metatile-palette__search`, now always visible) must never switch tools: "p" typed there stays in the box. Test: Task 9 Step 5 (integration, GBA).
2. **Ctrl+Z / letters while SaveDialog (or any `aria-modal` dialog) is open** must not undo or switch tools behind the dialog. Test: Task 9 unit "ignored while an aria-modal dialog is open".
3. **A 1024 px wide window** with tree + rail must not scroll sideways and must leave the canvas usable, in Map view and in-context. Test: Task 7 CSS pins (`min-width: 0`, 260 px, inspector ≤ 50 %) + Task 12 live check at 1280/1024.
4. **Switching project family through the header switcher** (GBC → GBA without a reload) must give a fresh shell, never a runtime hook swapped under a live mount. Test: Task 5 Root family-switch test.
5. **A stale palette highlight from the previous map** (GBA, after R2) must clear on every map switch: tree, world click, Open in Map view. Test: Task 10 integration (tree switch) + `onSelected` is the single choke point all selection paths call (Task 5).

## Decisions taken in this plan (for the user's review)

The spec leaves these open or slightly under-determined; each is the smallest faithful reading.

- **Two argument types, not one.** `RuntimeArgs = { selected, mode }` are the runtime hook's only inputs. Everything else the spec lists under `RuntimeArgs` (shared callbacks, jump pair, context result, stroke registry) reaches the runtime's render slots as a `ShellSlots` argument, never as hook inputs (spec: "The context result reaches the runtime's render slots as arguments, never as hook inputs").
- **`sameMap` only matters for the tree.** World click and Open-in-Map-view on the selected map never call `leave` (as today in both shells), so `sameMap` is passed `true` only from the tree's `selectMap`. GBA ignores it (prompts when dirty, as `App.tsx:96-102` does); GBC skips prompt and discard (as `GbcApp.tsx:159`).
- **`onSelected` is called on every selection change**, including a GBC world click (`GbcApp.tsx:169` cleared only `switchError`, not the hover id). Clearing a hover id that belongs to the previous map is the spec's own reset rule ("resets on a map switch"); no test pins the old omission.
- **World-visibility load error placement** follows GBC (`GbcApp.tsx:276`: shown in World mode even when the groups load failed). GBA (`App.tsx:277`) showed it only when groups loaded. Same text; strictly more information.
- **Capability flags read via constants.** `GBA_CAPABILITIES`/`GBC_CAPABILITIES` live in `shell/adapter.ts`; `toolsFor(caps)` derives each family's tool list (GBA all six; GBC five), and GBA's `MapEditingWorkspace` gates Add Sign on `GBA_CAPABILITIES.addSign`. Manual placements: `FamilyApp` owns `manualPlacementMaps` and merges it into tree visibility only when `manualPlacements` is set.
- **GBA hover look** reuses GBC's hover token pair (`--bg-selected` + `--border-strong`, new class `metatile-palette__cell--hovered`). GBA's picked-stamp class already uses the same pair, so hover and pick look alike on GBA until a later plan restyles the pick.
- **Follow hover (R4)** is a palette preference, not shell state: each palette calls `useFollowHover()` and renders `FollowHoverSwitch` in its header, so no prop plumbing through runtimes. Only one rail exists at a time; `localStorage` keeps the choice across remounts, map switches, families and reloads.
- **`useDungeonFilter(openDungeon, cache)`** (new, `shell/useDungeonFilter.ts`) holds both memo forms verbatim, unit-tested in Task 2.

## File map

| File | Task | Responsibility |
|---|---|---|
| `packages/ui/src/shell/adapter.ts` | 2 | types `Family`, `Mode`, `Capabilities`, `EngineAdapter`, `RuntimeArgs`, `ShellSlots`, `FamilyRuntime`; constants `GBA_CAPABILITIES`, `GBC_CAPABILITIES`, `ALL_TOOLS`; `toolsFor` |
| `packages/ui/src/shell/useDungeonFilter.ts` | 2 | the two `mapFilter` memo forms |
| `packages/ui/src/gba/adapter.tsx` | 3, 10 | `useGbaRuntime`, `gbaAdapter` |
| `packages/ui/src/gbc/adapter.tsx` | 4 | `useGbcRuntime`, `gbcAdapter` |
| `packages/ui/src/shell/FamilyApp.tsx` | 5 | shared shell |
| `packages/ui/src/App.tsx`, `src/gbc/GbcApp.tsx` | 5 (wrappers), 6 (deleted) | |
| `packages/ui/src/Root.tsx` | 5 | mounts `FamilyApp` |
| `packages/ui/src/shared/EditingWorkspace.tsx` | 7 | wraps `side` in `.edit-rail` |
| `packages/ui/src/components/MapEditingWorkspace.tsx` | 7, 10 | strips → rail; hover props |
| `packages/ui/src/gbc/GbcMapEditing.tsx` | 7, 8 | own rail wrapper removed; `GBC_TOOLS = toolsFor(GBC_CAPABILITIES)` |
| `packages/ui/src/components/Toolbar.tsx` | 8, 9 | labels, icons, tooltips, shortcut listener |
| `packages/ui/src/components/toolIcons.tsx` | 8 | inline SVG per tool |
| `packages/ui/src/components/MapCanvas.tsx` | 10 | `onHoverMetatile` |
| `packages/ui/src/components/MetatilePalette.tsx` | 10 | `highlightId`, follow-hover scroll + switch |
| `packages/ui/src/gbc/GbcMetatilePalette.tsx` | 10 | scroll gated on follow-hover; switch in header |
| `packages/ui/src/shared/useFollowHover.ts`, `shared/FollowHoverSwitch.tsx` | 10 | R4 preference hook and its switch |
| `packages/ui/src/styles.css` | 7, 8, 10 | rail, toolbar icon, hovered cell |
| `packages/ui/DESIGN.md` | 11 | layout, rail, toolbar, shortcuts, shell row |

## Routing and review per task (delegate skill + ~/.claude/CLAUDE.md)

Before every implementer dispatch run the `delegate` skill; walk the tier's chain; log every hop in the ledger. Codex always gets `-m` and writes in a scratch worktree (`git worktree add <scratch>/codex-t<N> plan-9-family-shell`), never the main checkout. Aider runs `--no-auto-commits`; the orchestrator commits after verify. Reviews stay on Anthropic with explicit models.

| Task | Tier → first hop | Risk | Reviews |
|---|---|---|---|
| 1 Characterisation tests | Sonnet → Codex `gpt-5.6-terra` (multi-file, must run tests) | builds the oracle | split: spec (Sonnet) + quality (Sonnet); reviewer runs one mutation per new test |
| 2 Adapter types + `useDungeonFilter` | Haiku (code verbatim) → Aider Laguna S 2.1 → Ling → Codex `gpt-6-luna` | low | merged (Sonnet) |
| 3 GBA runtime | Sonnet → Codex `gpt-5.6-terra` | context editing | split (Sonnet + Sonnet) |
| 4 GBC runtime | Opus (async discard ordering, `switchError`) → Aider Nemotron 3 Ultra → Dots3-note → Codex `gpt-6.1-sol` | async/error boundary | split: spec (**Opus**) + quality (Sonnet) |
| 5 FamilyApp + Root + wrappers | Sonnet (code verbatim, multi-file) → Codex `gpt-5.6-terra` | context editing, hook order | split: spec (**Opus**) + quality (Sonnet) |
| 6 Move shell tests, delete wrappers | Haiku (mechanical) → Codex `gpt-6-luna` | low, count-sensitive | merged (Sonnet), with removed-line accounting |
| 7 Rail + CSS | Sonnet → Codex `gpt-5.6-terra` | context editing (no remount) | split (Sonnet + Sonnet) |
| 8 Toolbar icons/labels/tooltips + query renames | Haiku → Codex `gpt-6-luna` (12+ files) | low | merged (Sonnet) |
| 9 Shortcuts | Sonnet → Aider Laguna S 2.1 → Nemotron 3 Super → Codex `gpt-5.6-terra` | StrictMode, global listener | split (Sonnet + Sonnet) |
| 10 GBA hover-link + follow-hover toggle (R4) | Sonnet → Codex `gpt-5.6-terra` | low (browser storage at a trust boundary: try/catch) | merged (Sonnet) |
| 11 DESIGN.md | Haiku → Aider Laguna S 2.1 | docs | merged (Sonnet) |
| 12 Live acceptance | Anthropic direct — verification (delegate §3); orchestrator or a Sonnet subagent with Playwright | real-corpus writes | the orchestrator re-checks every `cmp` and screenshot |
| Final | — | — | whole-branch review (**Opus**) |

Gate after every code task (any task touching `packages/`): from the repo root, `npm test > <scratch>/t<N>-run.txt 2>&1`, read the summary line (pass/fail/files), then `npm run typecheck` and `npm run build -w @pokemap/ui`. Expected counts are given per task as "baseline + N"; the orchestrator fills the running total in the ledger.

---

### Task 1: Characterisation tests for every "shells disagree" case

Tests only. Every test here must **pass on today's code** (they describe current behaviour) and keep passing, unchanged apart from the render call and tool-name renames, through Tasks 5-8. The reviewer proves each one is load-bearing with one mutation of the shell line it pins (listed per test), then restores.

**Files:**
- Modify (append tests): `packages/ui/test/App.test.tsx`, `packages/ui/test/gbc/GbcAppEditing.test.tsx`, `packages/ui/test/gbc/GbcAppWorldGuard.test.tsx`
- Modify (fixture, additive): the `vi.mock("../../src/gbc/GbcWorldCanvas.js", …)` factory at the top of `GbcAppWorldGuard.test.tsx` gains a third button. No existing test body changes.

**Interfaces:** Consumes the existing in-file helpers: `App.test.tsx` `makeEditFetchMock` (line 321), `renderAppInEditModeWithDirtySession` (375); `GbcAppEditing.test.tsx` `mockFetch`, `payload`, `openCity`, `paintOnce`; `GbcAppWorldGuard.test.tsx` `mockFetch`, `paintThenWorld`, `status`. Produces nothing for later tasks.

Already covered by existing tests (do not duplicate; cite in the report): GBC dirty switch confirm+discard ordering (`GbcAppEditing.test.tsx` "dirty guard…", "a failed discard keeps the user on the map…"), `switchError` shown in World (`GbcAppWorldGuard.test.tsx` "a failed discard from World is shown in World…"), GBC hover reset on a map switch (`GbcApp.test.tsx` "the palette highlight resets…"), GBC dungeon pan kept on rename (`GbcApp.test.tsx` "preserves dungeon pan on rename…"), GBA dirty tree switch confirm (`App.test.tsx` "in Map mode with a dirty session…"), GBA world click confirm (`App.test.tsx` "a world click on another map asks to discard first").

- [ ] **Step 1: GBA — dirty re-click of the selected map prompts; never discards on the server**

Append inside `describe("App -- Task 13 save flow", …)` in `packages/ui/test/App.test.tsx`:

```tsx
  // Plan 9 characterisation: App.tsx:96-102 -- selectMap -> changeSelection -> leave, so even the
  // ALREADY-selected map prompts while dirty. GBA never calls the server's discard before a switch.
  it("characterisation (Plan 9): re-clicking the selected map in the tree while dirty asks first; GBA never discards on the server", async () => {
    const fetchMock = makeEditFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderAppInEditModeWithDirtySession();

    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/discard"))).toBe(false);
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();

    confirmSpy.mockRestore();
    vi.unstubAllGlobals();
  });
```

Reviewer mutation: in `App.tsx` `selectMap`, skip `changeSelection` when `name === selected` → the first `toHaveBeenCalledTimes(1)` fails.

- [ ] **Step 2: GBA — tool and stamp survive Map → World → Map**

Append inside `describe("App -- metatile palette wiring", …)`:

```tsx
  // Plan 9 characterisation: useMapEditing lives at shell level (App.tsx:70), so the chosen tool and stamp
  // survive a mode round trip. FamilyApp keeps it in the GBA runtime, which lives as long as the shell.
  it("characterisation (Plan 9): the chosen tool and stamp survive a Map -> World -> Map round trip", async () => {
    vi.stubGlobal("fetch", makeEditFetchMock());
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
    fireEvent.click(await screen.findByRole("button", { name: "pencil" }));
    fireEvent.click(await screen.findByRole("button", { name: /metatile 0x1\b/i }));

    fireEvent.click(screen.getByRole("button", { name: "World" }));
    fireEvent.click(screen.getByRole("button", { name: "Map" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "pencil" }).getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByRole("button", { name: /metatile 0x1\b/i }).getAttribute("aria-pressed")).toBe("true");
    vi.unstubAllGlobals();
  });
```

If `makeEditFetchMock` rejects World-mode URLs and that breaks the test, extend **this test's** mock only, the way the test at `App.test.tsx:1053` answers `/api/world` (wrap: `const base = makeEditFetchMock(); vi.stubGlobal("fetch", vi.fn((u: string, i?: RequestInit) => u === "/api/world" ? <same response as line 1053> : base(u, i)))`). Do not edit the shared helper.

Reviewer mutation: move `useMapEditing` state into a component keyed by mode (or reset `activeToolKind` in `switchMode`) → fails.

- [ ] **Step 3: GBA — a dungeon rename re-mints the filter (refits)**

Port `GbcApp.test.tsx`'s "preserves dungeon pan on rename and refits after membership changes" (line 161) into `App.test.tsx` as `it("characterisation (Plan 9): a dungeon rename refits the GBA dungeon canvas (no filter cache, App.tsx:136-149)", …)`, against `<App />` and GBA's `WorldCanvas`, using App.test.tsx's own `makeFetchMock` world/dungeon routes (lines 53-110 show the `/api/world` and `/api/dungeons` handling). Keep the GBC test's mechanics (clientWidth/clientHeight stubs, PATCH handler, pan readout) and invert the rename expectation: after a pure rename the GBA canvas **refits** (pan returns to the fit value). Keep the membership-change refit assertion. The report must show this test failing under the mutation `useMemo(() => …, [openDungeon?.id, openDungeon?.maps.join()])` in `App.tsx:149` (a cache-like memo) and passing on the real code.

- [ ] **Step 4: GBC — dirty re-click of the selected map neither asks nor discards**

Append inside `describe("GbcApp editing (Plan 7 Task 5)", …)` in `packages/ui/test/gbc/GbcAppEditing.test.tsx`:

```tsx
  // Plan 9 characterisation: GbcApp.tsx:159 -- `if (name === selected) go()`: no confirm, no discard.
  it("characterisation (Plan 9): re-clicking the selected map while dirty neither asks nor discards", async () => {
    const { calls } = mockFetch({ OlivineCity: payload("OlivineCity"), OlivinePort: payload("OlivinePort") });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<GbcApp root="/x" />);
    await openCity();
    await paintOnce();

    fireEvent.click(screen.getByRole("button", { name: "OlivineCity" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(calls.some((c) => c.includes("/discard"))).toBe(false);
    expect(screen.getByTestId("dirty-indicator")).toBeTruthy();
    expect(document.querySelector(".app__status")!.textContent).toBe("OlivineCity");
  });
```

Reviewer mutation: `GbcApp.tsx:159` → `leave(go)` unconditionally → `confirm` called.

- [ ] **Step 5: GBC — a re-click of the selected map clears a discard error**

Append in the same describe:

```tsx
  // Plan 9 characterisation: GbcApp.tsx:152 -- selectMap's go() clears switchError first.
  it("characterisation (Plan 9): a tree re-click of the selected map clears a failed-discard error", async () => {
    const { f } = mockFetch({ OlivineCity: payload("OlivineCity"), OlivinePort: payload("OlivinePort") });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GbcApp root="/x" />);
    await openCity();
    await paintOnce();
    const base = f.getMockImplementation()!;
    f.mockImplementation((url: string, init?: RequestInit) => /\/discard$/.test(url) ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response) : base(url, init));

    fireEvent.click(screen.getByText("OlivinePort"));
    await waitFor(() => expect(screen.getByText(/discard -> 500/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "OlivineCity" }));
    await waitFor(() => expect(screen.queryByText(/discard -> 500/)).toBeNull());
    expect(document.querySelector(".app__status")!.textContent).toBe("OlivineCity");
  });
```

Reviewer mutation: delete `setSwitchError(null)` at `GbcApp.tsx:152` → fails.

- [ ] **Step 6: GBC — the chosen tool resets on Map → World → Map**

Append in the same describe:

```tsx
  // Plan 9 characterisation: GBC's tool lives in GbcMapEditing, which remounts between the Map branch and the
  // World host (GbcApp.tsx:297-335), so a mode round trip resets it. FamilyApp must keep that.
  it("characterisation (Plan 9): the chosen tool resets on a Map -> World -> Map round trip", async () => {
    mockFetch({ OlivineCity: payload("OlivineCity") });
    render(<GbcApp root="/x" />);
    await openCity();
    fireEvent.click(screen.getByRole("button", { name: "pencil" }));
    expect(screen.getByRole("button", { name: "pencil" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "World" }));
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "pencil" }).getAttribute("aria-pressed")).toBe("false"));
  });
```

Reviewer mutation: give the Map-view `<div className="app__map-editing">` at `GbcApp.tsx:324` the key `"world-host"` → tool survives → fails.

- [ ] **Step 7: GBC — Edit here on the selected map clears a discard error (the `enterContext` side effect)**

In `GbcAppWorldGuard.test.tsx`, add a third button to the `GbcWorldCanvas` mock factory (extend the props type with `onEditHere?: (n: string) => void`):

```tsx
        R.createElement("button", { type: "button", onClick: () => p.onEditHere?.("OlivineCity") }, "world-edit-city")),
```

(The closing `))` moves from the `world-open-port` line to this one.) Then append inside the describe:

```tsx
  // Plan 9 characterisation: GbcApp.tsx:194-197 -- entering context on the SELECTED map clears switchError first.
  it("characterisation (Plan 9): Edit here on the selected map clears a discard error shown in World", async () => {
    mockFetch({ discardFails: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GbcApp root="/x" />);
    await paintThenWorld();
    fireEvent.click(screen.getByText("world-select-port"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("discard -> 500"));

    fireEvent.click(screen.getByText("world-edit-city"));
    await waitFor(() => expect(screen.queryByText(/discard -> 500/)).toBeNull());
    expect(status()).toBe("OlivineCity");
  });
```

Reviewer mutation: delete the `if (name === selected) {…}` line at `GbcApp.tsx:195` → fails.

- [ ] **Step 8: Run the new tests, then the gate**

Run (repo root): `npx vitest run packages/ui/test/App.test.tsx packages/ui/test/gbc/GbcAppEditing.test.tsx packages/ui/test/gbc/GbcAppWorldGuard.test.tsx`
Expected: all pass (characterisation of current code). Then the full gate. Expected: **2,703 + 7 = 2,710 pass, 0 fail**, 171 files.

- [ ] **Step 9: Commit**

```bash
git add packages/ui/test/App.test.tsx packages/ui/test/gbc/GbcAppEditing.test.tsx packages/ui/test/gbc/GbcAppWorldGuard.test.tsx
git commit -m "test(ui): characterise where the GBA and GBC shells disagree (Plan 9 Task 1)"
```

---

### Task 2: Adapter types, capability constants and `useDungeonFilter`

**Files:**
- Create: `packages/ui/src/shell/adapter.ts`, `packages/ui/src/shell/useDungeonFilter.ts`
- Test: `packages/ui/test/shell/adapter.test.ts`, `packages/ui/test/shell/useDungeonFilter.test.tsx`

**Interfaces:** Produces every type and constant below; Tasks 3-10 import them by these exact names.

- [ ] **Step 1: Write the failing tests**

`packages/ui/test/shell/adapter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GBA_CAPABILITIES, GBC_CAPABILITIES, toolsFor, ALL_TOOLS } from "../../src/shell/adapter.js";

describe("capabilities (Plan 9)", () => {
  it("pins every GBA flag", () => {
    expect(GBA_CAPABILITIES).toEqual({
      collisionTool: true, elevationOverlay: true, addEvent: true, addSign: true, timeOfDay: false,
      defectsBanner: false, manualPlacements: false, dungeonFilterCache: false,
      worldBar: { dungeonAutoLayout: true, unplacedRail: true },
    });
  });
  it("pins every GBC flag", () => {
    expect(GBC_CAPABILITIES).toEqual({
      collisionTool: false, elevationOverlay: false, addEvent: false, addSign: false, timeOfDay: true,
      defectsBanner: true, manualPlacements: true, dungeonFilterCache: true,
      worldBar: { dungeonAutoLayout: false, unplacedRail: false },
    });
  });
  it("toolsFor keeps toolbar order and drops Collision without collisionTool", () => {
    expect(ALL_TOOLS).toEqual(["pencil", "rect", "bucket", "dropper", "shift", "collision"]);
    expect(toolsFor(GBA_CAPABILITIES)).toEqual(ALL_TOOLS);
    expect(toolsFor(GBC_CAPABILITIES)).toEqual(["pencil", "rect", "bucket", "dropper", "shift"]);
  });
});
```

`packages/ui/test/shell/useDungeonFilter.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDungeonFilter } from "../../src/shell/useDungeonFilter.js";
import type { Dungeon } from "../../src/hooks/useDungeons.js";

const d = (maps: string[], id = "d1") => ({ id, name: "D", maps }) as unknown as Dungeon;
const mount = (dungeon: Dungeon | null, cache: boolean) =>
  renderHook(({ dg, c }) => useDungeonFilter(dg, c), { initialProps: { dg: dungeon, c: cache } });

describe("useDungeonFilter (Plan 9)", () => {
  it("null dungeon gives null", () => {
    expect(mount(null, false).result.current).toBeNull();
    expect(mount(null, true).result.current).toBeNull();
  });
  it("without the cache, a new dungeon object re-mints the filter (GBA: a rename refits)", () => {
    const { result, rerender } = mount(d(["A", "B"]), false);
    const first = result.current;
    rerender({ dg: d(["A", "B"]), c: false });
    expect(result.current).not.toBe(first);
    expect([...result.current!].sort()).toEqual(["A", "B"]);
  });
  it("with the cache, the same id and members keep the filter identity, in any order", () => {
    const { result, rerender } = mount(d(["A", "B"]), true);
    const first = result.current;
    rerender({ dg: d(["B", "A"]), c: true });
    expect(result.current).toBe(first);
  });
  it("with the cache, a membership change or another id re-mints", () => {
    const { result, rerender } = mount(d(["A", "B"]), true);
    const first = result.current;
    rerender({ dg: d(["A", "B", "C"]), c: true });
    expect(result.current).not.toBe(first);
    const second = result.current;
    rerender({ dg: d(["A", "B", "C"], "d2"), c: true });
    expect(result.current).not.toBe(second);
  });
  it("with the cache, closing the dungeon drops the cache", () => {
    const { result, rerender } = mount(d(["A"]), true);
    const first = result.current;
    rerender({ dg: null, c: true });
    rerender({ dg: d(["A"]), c: true });
    expect(result.current).not.toBe(first);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run packages/ui/test/shell`
Expected: FAIL, cannot resolve `../../src/shell/adapter.js` / `useDungeonFilter.js`.

- [ ] **Step 3: Write `packages/ui/src/shell/adapter.ts`**

```ts
import type { ReactNode } from "react";
import type { ToolKind } from "../components/Toolbar.js";
import type { MapGroupsData } from "../components/MapTree.js";
import type { MapVisibilityInfo } from "../world/visibility.js";
import type { UseDungeonsResult } from "../hooks/useDungeons.js";
import type { UseContextEditingArgs, ContextEditing } from "../shared/useContextEditing.js";
import type { useStrokeChainRegistry } from "../shared/useStrokeChain.js";

export type Family = "gba" | "gbc";
export type Mode = "map" | "world" | "dungeon";

/** What only one engine does today (Plan 9). Flags marked "descriptive" have no reader yet; a test pins their values. */
export interface Capabilities {
  collisionTool: boolean;       // read: toolbar tool list (toolsFor)
  elevationOverlay: boolean;    // descriptive (MapCanvas owns the toggle); read from Plan 11
  addEvent: boolean;            // descriptive (the inspector is per family); read from Plan 10
  addSign: boolean;             // read: toolbar "Add Sign"
  timeOfDay: boolean;           // read: header slot
  defectsBanner: boolean;       // descriptive (GBC renderMap owns it); read from Plan 10 (D3)
  manualPlacements: boolean;    // read: tree visibility merge in FamilyApp
  dungeonFilterCache: boolean;  // read: FamilyApp's mapFilter (useDungeonFilter)
  worldBar: { dungeonAutoLayout: boolean; unplacedRail: boolean }; // descriptive (inside the world canvas); read from Plan 10
}

export const GBA_CAPABILITIES: Capabilities = {
  collisionTool: true, elevationOverlay: true, addEvent: true, addSign: true, timeOfDay: false,
  defectsBanner: false, manualPlacements: false, dungeonFilterCache: false,
  worldBar: { dungeonAutoLayout: true, unplacedRail: true },
};

export const GBC_CAPABILITIES: Capabilities = {
  collisionTool: false, elevationOverlay: false, addEvent: false, addSign: false, timeOfDay: true,
  defectsBanner: true, manualPlacements: true, dungeonFilterCache: true,
  worldBar: { dungeonAutoLayout: false, unplacedRail: false },
};

export const ALL_TOOLS: ToolKind[] = ["pencil", "rect", "bucket", "dropper", "shift", "collision"];

/** The toolbar's tool list for a family, in toolbar order. */
export const toolsFor = (caps: Capabilities): ToolKind[] => ALL_TOOLS.filter((k) => k !== "collision" || caps.collisionTool);

/** The runtime hook's only inputs. Everything else reaches the render slots as ShellSlots. */
export interface RuntimeArgs {
  selected: string | null;
  mode: Mode;
}

/** What FamilyApp hands the runtime's render slots on every render (never hook inputs). */
export interface ShellSlots {
  jumpTarget: string | null;
  jumpToken: number;
  selectMap(name: string): void;
  selectMapFromWorld(name: string): void;
  openMapFromWorld(name: string): void;
  enterContext(name: string): void;
  requestExitContext(): void;
  contextMap: string | null;
  tileVersions: ContextEditing["tileVersions"];
  onStrokeChain: ReturnType<typeof useStrokeChainRegistry>["onStrokeChain"];
  markManualPlacement(name: string): void;
}

export interface FamilyRuntime {
  groups: { data: MapGroupsData | null; error: string | null };
  /** The edit session for `selected` (beforeunload guard and context editing). */
  session: UseContextEditingArgs["session"];
  /** The family's switch policy. `sameMap` is true only for a tree click on the selected map. */
  leave(go: () => void, opts: { sameMap: boolean }): void;
  /** Family side effects of every selection change (after setSelected). */
  onSelected(name: string): void;
  /** Family side effects before entering in-context editing on `name`. */
  onEnterContext(name: string): void;
  /** Tree visibility before FamilyApp's manual-placement merge. */
  visibility: { placed: Map<string, MapVisibilityInfo> | null; error: string | null };
  hiddenMapTypes: ReadonlySet<string>;
  dungeons: UseDungeonsResult;
  /** Map view: error for `selected`, and whether its payload is ready to render. */
  map: { error: string | null; ready: boolean };
  renderMap(slots: ShellSlots): ReactNode;
  renderWorld(slots: ShellSlots): ReactNode;
  renderDungeon(mapFilter: Set<string>, slots: ShellSlots): ReactNode;
  headerExtras: ReactNode;
  /** At <main> level in every mode. */
  banners: ReactNode;
  /** Siblings after SaveDialog at <main> level. */
  modals: ReactNode;
  saveDialog: { open: boolean; setOpen(open: boolean): void; onCommitted(): void };
}

export interface EngineAdapter {
  family: Family;
  /** Shown after the title ("Crystal" for GBC); null renders nothing (GBA). */
  label: string | null;
  capabilities: Capabilities;
  /** Called once per render of FamilyApp. The adapter never changes within a mount (Root keys the shell on
   *  family:root:gen), so the hook order inside it is fixed. */
  useRuntime(args: RuntimeArgs): FamilyRuntime;
}
```

If `MapGroupsData`, `UseDungeonsResult` or the stroke registry type are not exported under these names, export them from their modules (type-only change) rather than redeclaring them.

- [ ] **Step 4: Write `packages/ui/src/shell/useDungeonFilter.ts`**

```ts
import { useMemo, useRef } from "react";
import type { Dungeon } from "../hooks/useDungeons.js";

/**
 * The open dungeon's map filter for the world canvas.
 * - cache off (GBA, App.tsx:136-149): re-minted whenever the dungeon object changes, so a pure rename refits the
 *   canvas (intended: "opened/switched/edited").
 * - cache on (GBC, GbcApp.tsx:133-143): the same id and sorted members keep the Set identity, so a rename keeps pan.
 */
export function useDungeonFilter(openDungeon: Dungeon | null, cache: boolean): Set<string> | null {
  const filterCache = useRef<{ id: string; members: string[]; filter: Set<string> } | null>(null);
  return useMemo(() => {
    if (!openDungeon) { filterCache.current = null; return null; }
    if (!cache) return new Set(openDungeon.maps);
    const members = [...openDungeon.maps].sort();
    const cached = filterCache.current;
    if (cached?.id === openDungeon.id && cached.members.length === members.length
      && members.every((name, index) => name === cached.members[index])) return cached.filter;
    const filter = new Set(openDungeon.maps);
    filterCache.current = { id: openDungeon.id, members, filter };
    return filter;
  }, [openDungeon, cache]);
}
```

- [ ] **Step 5: Run the tests, then typecheck**

Run: `npx vitest run packages/ui/test/shell` → PASS (8 tests). `npm run typecheck` → clean.

- [ ] **Step 6: Gate and commit**

Gate expected: **2,710 + 8 = 2,718 pass, 0 fail**, 173 files.

```bash
git add packages/ui/src/shell/adapter.ts packages/ui/src/shell/useDungeonFilter.ts packages/ui/test/shell/adapter.test.ts packages/ui/test/shell/useDungeonFilter.test.tsx
git commit -m "feat(ui): EngineAdapter types, capability flags and useDungeonFilter (Plan 9 Task 2)"
```

(Add any module whose type export Step 3 needed to the pathspec.)

---

### Task 3: GBA runtime (`useGbaRuntime`, `gbaAdapter`)

The GBA-only body of today's `App.tsx`, moved, not rewritten. `App.tsx` is untouched in this task (it still runs every test); the runtime is exercised from Task 5.

**Files:**
- Create: `packages/ui/src/gba/adapter.tsx`
- Test: `packages/ui/test/shell/adapter.test.ts` (append one test)

**Interfaces:**
- Consumes (Task 2): `EngineAdapter`, `FamilyRuntime`, `RuntimeArgs`, `ShellSlots`, `GBA_CAPABILITIES`.
- Produces: `export function useGbaRuntime(args: RuntimeArgs): FamilyRuntime`; `export const gbaAdapter: EngineAdapter`.

- [ ] **Step 1: Write the failing test** (append to `test/shell/adapter.test.ts`):

```ts
import { gbaAdapter } from "../../src/gba/adapter.js";

describe("gbaAdapter (Plan 9)", () => {
  it("is the GBA family with no label and GBA's capabilities", () => {
    expect(gbaAdapter.family).toBe("gba");
    expect(gbaAdapter.label).toBeNull();
    expect(gbaAdapter.capabilities).toBe(GBA_CAPABILITIES);
  });
});
```

(Merge the import with the file's existing imports.) Run `npx vitest run packages/ui/test/shell/adapter.test.ts` → FAIL (module missing).

- [ ] **Step 2: Write `packages/ui/src/gba/adapter.tsx`**

Copy the comments named below verbatim from `App.tsx` (they carry the reasons); do not paraphrase them.

```tsx
import { MapEditingWorkspace, type MapEditingCanvasProps } from "../components/MapEditingWorkspace.js";
import { MapCanvas, compositeOrigin } from "../components/MapCanvas.js";
import { WorldCanvas } from "../components/WorldCanvas.js";
import { SignComposer } from "../components/SignComposer.js";
import { useMapGroups } from "../hooks/useMapGroups.js";
import { useMapLayout } from "../hooks/useMapLayout.js";
import { useWorldVisibility } from "../hooks/useWorldVisibility.js";
import { useDungeons } from "../hooks/useDungeons.js";
import { useEditSession } from "../hooks/useEditSession.js";
import { useMapEditing } from "../hooks/useMapEditing.js";
import { HIDDEN_MAP_TYPES } from "../world/visibility.js";
import { GBA_CAPABILITIES, type EngineAdapter, type FamilyRuntime, type RuntimeArgs, type ShellSlots } from "../shell/adapter.js";

const GUARD_TEXT = "You have unsaved changes on this map. Discard them and switch maps?";

/** The GBA-only half of the shell (was App.tsx): data hooks, edit session, map editing state, switch policy, canvases. */
export function useGbaRuntime({ selected, mode }: RuntimeArgs): FamilyRuntime {
  const groups = useMapGroups();
  const layout = useMapLayout(selected);
  // <copy App.tsx:44-48 "Known limitation, accepted for now" comment>
  const { placed, error: visibilityError } = useWorldVisibility(mode === "world");
  const dungeons = useDungeons(mode === "dungeon");
  // <copy App.tsx:52-64 "Task 13: the edit session …" comment>
  const editSession = useEditSession(selected, layout.data?.blocks, layout.data?.map);
  // <copy App.tsx:67-69 "Plan 6c E2" comment>
  const editing = useMapEditing({ editSession, layoutData: layout.data, mapName: selected });

  // GBA's switch policy (App.tsx:76-79): confirm when dirty, then switch; the server session is never discarded here.
  // `sameMap` is ignored on purpose: a tree re-click of the selected map prompts too (App.tsx:96-102).
  const leave = (go: () => void) => {
    if (editSession.isDirty && !window.confirm(GUARD_TEXT)) return;
    go();
  };

  // The context map's layout, once loaded for THAT map (useMapLayout keeps the previous map's data until its fetch lands).
  const contextLayoutFor = (contextMap: string | null) =>
    contextMap !== null && layout.data && layout.data.map.name === contextMap ? layout.data : null;

  const renderWorld = (s: ShellSlots) => {
    const contextLayout = contextLayoutFor(s.contextMap);
    const world = (canvasProps: MapEditingCanvasProps | null) => (
      // <copy App.tsx:185-193 "key=world/dungeon" comment>
      <WorldCanvas
        key="world"
        jumpToMap={s.jumpTarget}
        jumpToken={s.jumpToken}
        onJumpToMap={s.selectMap}
        onSelectMap={s.selectMapFromWorld}
        onOpenMap={s.openMapFromWorld}
        onEditHere={s.enterContext}
        tileVersions={s.tileVersions}
        context={
          s.contextMap === null
            ? undefined
            : {
                map: s.contextMap,
                origin: contextLayout ? compositeOrigin(contextLayout.layout) : null,
                renderCanvas: (view, onViewChange) =>
                  canvasProps && contextLayout ? <MapCanvas {...canvasProps} chromeless view={view} onViewChange={onViewChange} /> : null,
                onExitRequest: s.requestExitContext,
              }
        }
      />
    );
    // The World view is hosted by MapEditingWorkspace at all times (one stable element and key), so the
    // WorldCanvas inside is never remounted when in-context editing turns the chrome on or off.
    return contextLayout ? (
      <MapEditingWorkspace onStrokeChain={s.onStrokeChain} key="world-host" mapName={contextLayout.map.name} data={contextLayout} editSession={editSession} editing={editing} renderCanvas={world} />
    ) : (
      <MapEditingWorkspace onStrokeChain={s.onStrokeChain} key="world-host" active={false} mapName={selected} data={layout.data} editSession={editSession} editing={editing} renderCanvas={world} />
    );
  };

  return {
    groups,
    session: editSession,
    leave: (go) => leave(go),
    onSelected: () => {},
    onEnterContext: () => {},
    visibility: { placed, error: visibilityError },
    hiddenMapTypes: HIDDEN_MAP_TYPES,
    dungeons,
    map: { error: layout.error, ready: Boolean(layout.data) },
    renderMap: (s) =>
      selected && layout.data ? (
        <MapEditingWorkspace onStrokeChain={s.onStrokeChain} mapName={selected} data={layout.data} editSession={editSession} editing={editing} />
      ) : null,
    renderWorld,
    renderDungeon: (mapFilter, s) => <WorldCanvas key="dungeon" mapFilter={mapFilter} onOpenMap={s.openMapFromWorld} />,
    headerExtras: null,
    banners: null,
    // <copy App.tsx:345-348 "Task 17: SignComposer owns its own modal shell" comment>
    modals:
      editing.signComposerOpen && selected ? (
        <SignComposer
          mapName={selected}
          onSessionUpdated={(map, isDirty) => editSession.applyExternalMapUpdate(map, isDirty)}
          onAdded={(scriptLabel) => {
            editing.setSignComposerOpen(false);
            editing.setSignAddedMessage(`Added wild sign: ${scriptLabel}`);
          }}
          onCancel={() => editing.setSignComposerOpen(false)}
        />
      ) : null,
    saveDialog: { open: editing.saveDialogOpen, setOpen: editing.setSaveDialogOpen, onCommitted: () => {} },
  };
}

export const gbaAdapter: EngineAdapter = {
  family: "gba",
  label: null,
  capabilities: GBA_CAPABILITIES,
  useRuntime: useGbaRuntime,
};
```

Notes for the implementer:
- `HIDDEN_MAP_TYPES` is `MapTree`'s own default (`MapTree.tsx:24`), so passing it explicitly is behaviour-identical. If `world/visibility.ts` does not export it under that name, import it from wherever `MapTree.tsx:2` imports it.
- If `useMapGroups()`'s result type is not assignable to `{ data: MapGroupsData | null; error: string | null }`, map it: `groups: { data: groups.data, error: groups.error }`.

- [ ] **Step 3: Run the test, then typecheck**

`npx vitest run packages/ui/test/shell/adapter.test.ts` → PASS. `npm run typecheck` → clean.

- [ ] **Step 4: Gate and commit**

Gate: **2,718 + 1 = 2,719 pass**, 173 files.

```bash
git add packages/ui/src/gba/adapter.tsx packages/ui/test/shell/adapter.test.ts
git commit -m "feat(ui): GBA runtime for the family shell (Plan 9 Task 3)"
```

---

### Task 4: GBC runtime (`useGbcRuntime`, `gbcAdapter`)

The GBC-only body of today's `GbcApp.tsx`, moved. `GbcApp.tsx` untouched in this task.

**Files:**
- Create: `packages/ui/src/gbc/adapter.tsx`
- Test: `packages/ui/test/shell/adapter.test.ts` (append)

**Interfaces:**
- Consumes (Task 2): as Task 3, plus `GBC_CAPABILITIES`.
- Produces: `export function useGbcRuntime(args: RuntimeArgs): FamilyRuntime`; `export const gbcAdapter: EngineAdapter`.

- [ ] **Step 1: Write the failing test** (append):

```ts
import { gbcAdapter } from "../../src/gbc/adapter.js";

describe("gbcAdapter (Plan 9)", () => {
  it("is the GBC family labelled Crystal with GBC's capabilities", () => {
    expect(gbcAdapter.family).toBe("gbc");
    expect(gbcAdapter.label).toBe("Crystal");
    expect(gbcAdapter.capabilities).toBe(GBC_CAPABILITIES);
  });
});
```

Run → FAIL (module missing).

- [ ] **Step 2: Write `packages/ui/src/gbc/adapter.tsx`**

```tsx
import { useMemo, useState } from "react";
import { GbcMapEditing, type GbcMapEditingCanvasProps } from "./GbcMapEditing.js";
import { GbcMapCanvas, GBC_COMPOSITE_ORIGIN } from "./GbcMapCanvas.js";
import { GbcWorldCanvas } from "./GbcWorldCanvas.js";
import { useGbcGroups } from "./hooks/useGbcGroups.js";
import { useGbcMap } from "./hooks/useGbcMap.js";
import { useGbcEditSession } from "./hooks/useGbcEditSession.js";
import { useGbcWorld } from "./hooks/useGbcWorld.js";
import { useGbcDungeons } from "./hooks/useGbcDungeons.js";
import type { GbcTimeOfDay } from "./time.js";
import { GBC_HIDDEN_MAP_TYPES } from "../world/visibility.js";
import { GBC_CAPABILITIES, type EngineAdapter, type FamilyRuntime, type RuntimeArgs, type ShellSlots } from "../shell/adapter.js";

const TIME_ORDER: readonly GbcTimeOfDay[] = ["morn", "day", "nite"];
const TIME_LABEL: Record<GbcTimeOfDay, string> = { morn: "Morn", day: "Day", nite: "Nite" };
const GUARD_TEXT = "You have unsaved changes on this map. Discard them and switch maps?";

/** The GBC-only half of the shell (was GbcApp.tsx): time of day, data hooks, edit session, discard-before-switch,
 *  switchError, defects banner, canvases. */
export function useGbcRuntime({ selected, mode }: RuntimeArgs): FamilyRuntime {
  const [time, setTime] = useState<GbcTimeOfDay>("day");
  // <copy GbcApp.tsx:77-80 hovered-metatile comment>
  const [hoveredMetatileId, setHoveredMetatileId] = useState<number | null>(null);
  const dungeons = useGbcDungeons(mode === "dungeon");
  const groups = useGbcGroups();
  const { data: world, error: worldError } = useGbcWorld(mode === "world");
  // Tree visibility before FamilyApp merges this session's manual placements (manualPlacements capability).
  const placed = useMemo(
    () => world && new Map(Object.entries(world.placements).map(([name, p]) => [name, { mapType: p.mapType, manual: p.manual }])),
    [world],
  );
  const map = useGbcMap(selected);
  // <copy GbcApp.tsx:93-100 "Fix round (spec review finding 3)" comment>
  const ready = map.data && map.data.map.name === selected ? map.data : null;
  // <copy GbcApp.tsx:102-104 "Plan 7 Task 5: the edit session …" comment>
  const session = useGbcEditSession(selected, ready?.blocks, ready?.events);
  const [saveOpen, setSaveOpen] = useState(false);
  // A failed discard-before-switch (or post-save reload): the switch is abandoned and this says why.
  const [switchError, setSwitchError] = useState<string | null>(null);

  // <copy GbcApp.tsx:113-118 "Every change of `selected` goes through this" comment>
  // `sameMap` (a tree click on the selected map, GbcApp.tsx:159): no prompt and no discard.
  const leave = (go: () => void, { sameMap }: { sameMap: boolean }) => {
    if (sameMap || !session.isDirty) { go(); return; }
    if (!window.confirm(GUARD_TEXT)) return;
    session.discard().then(go).catch((e: unknown) => setSwitchError(e instanceof Error ? e.message : "Could not discard the changes."));
  };

  const defectsBanner = ready && ready.defects.length > 0 && (
    // <copy GbcApp.tsx:205-207 "Non-dismissible" comment>
    <div className="app__event-op-error" role="alert">
      <ul className="gbc-app__defects-list">
        {ready.defects.map((d, i) => (
          <li key={i}>{d.message}</li>
        ))}
      </ul>
    </div>
  );

  const editingProps = {
    time, session, hoveredMetatileId,
    onHoverMetatile: setHoveredMetatileId,
    onOpenSave: () => setSaveOpen(true),
  };

  const renderWorld = (s: ShellSlots) => {
    // <copy GbcApp.tsx:217-219 "The World view is hosted by GbcMapEditing at all times" comment>
    const contextActive = s.contextMap !== null && ready !== null;
    const world = (canvasProps: GbcMapEditingCanvasProps | null) => (
      <GbcWorldCanvas
        key="world"
        time={time}
        jumpToMap={s.jumpTarget}
        jumpToken={s.jumpToken}
        onSelectMap={s.selectMapFromWorld}
        onOpenMap={s.openMapFromWorld}
        onEditHere={s.enterContext}
        onJumpToMap={s.selectMap}
        onPlacementSaved={s.markManualPlacement}
        tileVersions={s.tileVersions}
        context={
          s.contextMap === null
            ? undefined
            : {
                map: s.contextMap,
                origin: ready ? { x: GBC_COMPOSITE_ORIGIN, y: GBC_COMPOSITE_ORIGIN } : null,
                renderCanvas: (view, onViewChange) =>
                  canvasProps && ready ? <GbcMapCanvas {...canvasProps} chromeless view={view} onViewChange={onViewChange} /> : null,
                onExitRequest: s.requestExitContext,
              }
        }
      />
    );
    return (
      <div className="app__map-editing" key="world-host">
        {contextActive && defectsBanner}
        {s.contextMap !== null && !ready && (
          map.error ? <p className="app__event-op-error" role="alert">Could not load {s.contextMap}: {map.error}</p>
            : <p className="app__canvas-placeholder" role="status">Loading {s.contextMap}…</p>
        )}
        <GbcMapEditing onStrokeChain={s.onStrokeChain} active={contextActive} mapName={selected} data={ready} {...editingProps} renderCanvas={world} />
      </div>
    );
  };

  return {
    groups,
    session,
    leave,
    onSelected: () => { setSwitchError(null); setHoveredMetatileId(null); },
    onEnterContext: (name) => { if (name === selected) { setSwitchError(null); setHoveredMetatileId(null); } },
    visibility: { placed, error: worldError },
    hiddenMapTypes: GBC_HIDDEN_MAP_TYPES,
    dungeons,
    map: { error: map.error, ready: ready !== null },
    renderMap: (s) =>
      selected && ready ? (
        <div className="app__map-editing">
          {defectsBanner}
          <GbcMapEditing onStrokeChain={s.onStrokeChain} mapName={selected} data={ready} {...editingProps} />
        </div>
      ) : null,
    renderWorld,
    renderDungeon: (mapFilter, s) => (
      <GbcWorldCanvas key="dungeon" time={time} mapFilter={mapFilter} onOpenMap={s.openMapFromWorld} onPlacementSaved={s.markManualPlacement} />
    ),
    headerExtras: (
      <div className="app__mode gbc-app__time" role="group" aria-label="Time of day">
        {TIME_ORDER.map((t) => (
          <button key={t} type="button" className="map-canvas__btn" aria-pressed={time === t} onClick={() => setTime(t)}>
            {TIME_LABEL[t]}
          </button>
        ))}
      </div>
    ),
    // <copy GbcApp.tsx:287-288 "At <main> level so a failed discard-before-switch …" comment>
    banners: switchError && (
      <div className="app__event-op-error" role="alert">
        <span>{switchError}</span>
        <button type="button" className="app__event-op-error-dismiss" onClick={() => setSwitchError(null)} aria-label="Dismiss">
          ×
        </button>
      </div>
    ),
    modals: null,
    saveDialog: {
      open: saveOpen,
      setOpen: setSaveOpen,
      // After ctx.onCommitted(): re-read the payload so the canvas and palette show what is on disk (GbcApp.tsx:345-349).
      onCommitted: () => {
        map.reload().catch((e: unknown) => setSwitchError(`Saved, but could not reload the map: ${e instanceof Error ? e.message : String(e)}`));
      },
    },
  };
}

export const gbcAdapter: EngineAdapter = {
  family: "gbc",
  label: "Crystal",
  capabilities: GBC_CAPABILITIES,
  useRuntime: useGbcRuntime,
};
```

Notes for the implementer:
- `GbcApp.tsx` also exports `type TimeOfDay`. Grep `src/` and `test/` for imports of it (`grep -rn "TimeOfDay" packages/ui/src packages/ui/test`); any importer other than `GbcApp.tsx` switches to `GbcTimeOfDay` from `./time.js` in Task 6.
- `placed`'s type must be `Map<string, MapVisibilityInfo> | null`; if `world && …` widens it, write `world ? new Map(…) : null`.

- [ ] **Step 3: Run the test, typecheck, gate, commit**

Gate: **2,719 + 1 = 2,720 pass**, 173 files.

```bash
git add packages/ui/src/gbc/adapter.tsx packages/ui/test/shell/adapter.test.ts
git commit -m "feat(ui): GBC runtime for the family shell (Plan 9 Task 4)"
```

---

### Task 5: `FamilyApp`, Root swap, `App`/`GbcApp` as thin wrappers

After this task every one of the 13 shell test files runs, unedited, against `FamilyApp` through the wrappers. That is the merge's proof.

**Files:**
- Create: `packages/ui/src/shell/FamilyApp.tsx`
- Modify: `packages/ui/src/App.tsx` (whole body → wrapper), `packages/ui/src/gbc/GbcApp.tsx` (whole body → wrapper), `packages/ui/src/Root.tsx:3-4,59-63`
- Test: `packages/ui/test/gbc/Root.test.tsx` (append one test)

**Interfaces:**
- Consumes: Tasks 2-4 exports; `useContextEditing`, `useBeforeUnloadGuard`, `useStrokeChainRegistry`, `MapTree`, `DungeonSidebar`, `SaveDialog`.
- Produces: `export interface FamilyAppProps { adapter: EngineAdapter; switcher?: ReactNode }`; `export function FamilyApp(props: FamilyAppProps)`.

- [ ] **Step 1: Write the failing Root test** (append inside `describe("Root", …)` in `test/gbc/Root.test.tsx`)

```tsx
  // Plan 9: Root keys FamilyApp on family:root:gen, so switching family mounts a fresh shell with the other
  // adapter (a runtime hook is never swapped under a live mount).
  it("switching family through the switcher mounts a fresh shell for the other family", async () => {
    const ROOT_GBC = "/root/pokemap-corpus/pokecrystal-A";
    const { mock } = makeFetchMock(
      { family: "gbc", root: ROOT_GBC },
      { openResponses: { "/x": { family: "gba", root: "/x" } } },
    );
    vi.stubGlobal("fetch", mock);
    render(<Root />);
    await waitFor(() => expect(screen.getByRole("group", { name: "Time of day" })).toBeTruthy());
    expect(screen.getByText("Crystal")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /switch project/i }));
    const dialog = await screen.findByRole("dialog", { name: "Switch project" });
    fireEvent.change(within(dialog).getByLabelText("Folder path"), { target: { value: "/x" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Open" }));

    await waitFor(() => expect(screen.queryByRole("group", { name: "Time of day" })).toBeNull());
    expect(screen.queryByText("Crystal")).toBeNull();
    expect(screen.getAllByRole("group", { name: "View" })).toHaveLength(1);
  });
```

This test passes on today's code too (Root already keys); it is a regression pin for the merge. If `makeFetchMock`'s `openResponses` cannot answer a GBA project's `/api/groups`, the assertions above still hold (none reads the tree).

- [ ] **Step 2: Write `packages/ui/src/shell/FamilyApp.tsx`**

```tsx
import { useMemo, useState, type ReactNode } from "react";
import { MapTree } from "../components/MapTree.js";
import { DungeonSidebar } from "../components/DungeonSidebar.js";
import { SaveDialog } from "../components/SaveDialog.js";
import { useContextEditing } from "../shared/useContextEditing.js";
import { useBeforeUnloadGuard } from "../shared/useBeforeUnloadGuard.js";
import { useStrokeChainRegistry } from "../shared/useStrokeChain.js";
import { useDungeonFilter } from "./useDungeonFilter.js";
import type { EngineAdapter, Mode, ShellSlots } from "./adapter.js";

export interface FamilyAppProps {
  /** Fixed for the life of the mount: Root keys this component on family:root:gen. */
  adapter: EngineAdapter;
  /** Plan 6c A2: the header's project-switcher button, supplied by Root. */
  switcher?: ReactNode;
}

/**
 * The one app shell for both families (Plan 9). Owns what App.tsx and GbcApp.tsx shared: mode, selection, the jump
 * pair, the open dungeon, the stroke-chain registry, context editing, the beforeunload guard, header, sidebar and
 * SaveDialog. Everything family-specific comes from `adapter.useRuntime`; where the two shells disagreed, the
 * difference sits behind the runtime (leave, onSelected, onEnterContext, saveDialog.onCommitted) or a capability.
 */
export function FamilyApp({ adapter, switcher }: FamilyAppProps) {
  const caps = adapter.capabilities;
  const [mode, setMode] = useState<Mode>("map");
  const [selected, setSelected] = useState<string | null>(null);
  // <copy App.tsx:32-34 selectVersion comment>
  const [selectVersion, setSelectVersion] = useState(0);
  // <copy GbcApp.tsx:59-70 jumpTarget comment (spec review F1)>
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
  const [openDungeonId, setOpenDungeonId] = useState<string | null>(null);
  const [manualPlacementMaps, setManualPlacementMaps] = useState<ReadonlySet<string>>(new Set());

  const runtime = adapter.useRuntime({ selected, mode });

  // Shared browser-level half of I6's dirty-session guard; the in-app guard is runtime.leave.
  useBeforeUnloadGuard(runtime.session.isDirty);

  // Context entry and every non-tree switch: the family's policy, never the same-map shortcut.
  const leave = (go: () => void) => runtime.leave(go, { sameMap: false });
  // Every change of `selected` runs the family's side effects (GBC clears switchError and the hover id).
  const select = (name: string) => {
    setSelected(name);
    runtime.onSelected(name);
  };
  const { onStrokeChain, strokeSettled } = useStrokeChainRegistry();
  const ctx = useContextEditing({
    selected, session: runtime.session, leave, select,
    openSave: () => runtime.saveDialog.setOpen(true),
    strokeSettled,
  });

  // A tree click: GBA prompts even for the selected map; GBC does not (runtime.leave's sameMap).
  const selectMap = (name: string) =>
    runtime.leave(() => {
      select(name);
      ctx.leaveContext(); // a tree click leaves in-context editing (a jump would also move the world under the overlay)
      setJumpTarget(name);
      setSelectVersion((v) => v + 1);
    }, { sameMap: name === selected });

  // A world-view click selects (tree highlight + scroll) but is not a jump request. Re-clicking the selected map
  // must not raise the "discard and switch" confirm.
  const selectMapFromWorld = (name: string) => {
    if (name !== selected) leave(() => select(name));
  };

  // The world context menu's "Open in Map view" (and Shift+double-click, GBC double-click): select through the
  // family's guard, and switch to Map view only if the user did not cancel it.
  const openMapFromWorld = (name: string) => {
    const go = () => {
      select(name);
      ctx.leaveContext();
      setMode("map");
    };
    if (name === selected) go(); else leave(go);
  };

  const enterContext = (name: string) => {
    runtime.onEnterContext(name);
    ctx.enter(name);
  };
  const switchMode = (next: Mode) => {
    ctx.leaveContext();
    setMode(next);
  };

  // Entering World centres on the selected map, wherever the selection came from (tree, world click,
  // Map view). A world click itself never jumps (F1); this is a mode entry, not a click.
  const enterWorld = () => {
    if (mode === "world") return;
    setJumpTarget(selected);
    setSelectVersion((v) => v + 1);
    setMode("world");
  };

  const openDungeon = mode === "dungeon" ? (runtime.dungeons.data?.find((d) => d.id === openDungeonId) ?? null) : null;
  const mapFilter = useDungeonFilter(openDungeon, caps.dungeonFilterCache);
  const groupsData = runtime.groups.data;
  const allMapNames = useMemo(
    () => (groupsData ? groupsData.groupOrder.flatMap((g) => groupsData.groups[g] ?? []) : []),
    [groupsData],
  );

  // <copy App.tsx:156-167 "Review fix" comment and App.tsx:170-178 "Functional form" comment>
  const deleteDungeon = async (id: string) => {
    await runtime.dungeons.remove(id);
    setOpenDungeonId((cur) => (cur === id ? null : cur));
  };

  const markManualPlacement = (name: string) =>
    setManualPlacementMaps((previous) => (previous.has(name) ? previous : new Set(previous).add(name)));
  const placed = runtime.visibility.placed;
  const visibility = useMemo(
    () =>
      caps.manualPlacements && placed
        ? new Map([...placed].map(([name, info]) => [name, { ...info, manual: info.manual || manualPlacementMaps.has(name) }]))
        : placed,
    [caps.manualPlacements, placed, manualPlacementMaps],
  );

  const slots: ShellSlots = {
    jumpTarget, jumpToken: selectVersion, selectMap, selectMapFromWorld, openMapFromWorld, enterContext,
    requestExitContext: ctx.requestExit, contextMap: ctx.contextMap, tileVersions: ctx.tileVersions,
    onStrokeChain, markManualPlacement,
  };
  const { error, data } = runtime.groups;

  return (
    <div className="app">
      <header className="app__toolbar">
        <h1 className="app__title">PokeMap</h1>
        {adapter.label && <span className="gbc-app__family">{adapter.label}</span>}
        <div className="app__mode" role="group" aria-label="View">
          <button type="button" className="map-canvas__btn" aria-pressed={mode === "map"} onClick={() => switchMode("map")}>
            Map
          </button>
          <button type="button" className="map-canvas__btn" aria-pressed={mode === "world"} onClick={enterWorld}>
            World
          </button>
          <button type="button" className="map-canvas__btn" aria-pressed={mode === "dungeon"} onClick={() => switchMode("dungeon")}>
            Dungeon
          </button>
        </div>
        {caps.timeOfDay && runtime.headerExtras}
        {mode === "map" && selected && <span className="app__status">{selected}</span>}
        {switcher}
      </header>
      <div className="app__body">
        <aside className="app__sidebar">
          {/* <copy App.tsx:252-261 "Review fix: this used to live only inside the non-dungeon branch" comment> */}
          {error && <p className="map-tree__empty">Could not load map groups: {error}</p>}
          {mode === "world" && runtime.visibility.error && (
            <p className="map-tree__empty">Could not load world visibility: {runtime.visibility.error}</p>
          )}
          {mode === "dungeon" ? (
            <DungeonSidebar
              dungeons={runtime.dungeons.data}
              error={runtime.dungeons.error}
              openId={openDungeonId}
              onOpen={setOpenDungeonId}
              onCreate={runtime.dungeons.create}
              onRename={runtime.dungeons.rename}
              onSetMaps={runtime.dungeons.setMaps}
              onDelete={deleteDungeon}
              allMapNames={allMapNames}
            />
          ) : error ? null : data ? (
            <MapTree
              data={data}
              selected={selected}
              onSelect={selectMap}
              worldMode={mode === "world"}
              visibility={visibility}
              hiddenMapTypes={runtime.hiddenMapTypes}
            />
          ) : (
            <p className="map-tree__empty">Loading map groups…</p>
          )}
        </aside>
        <main className="app__canvas">
          {runtime.banners}
          {mode === "world" ? (
            runtime.renderWorld(slots)
          ) : mode === "dungeon" ? (
            openDungeon && mapFilter ? runtime.renderDungeon(mapFilter, slots) : <p className="app__canvas-placeholder">Select or create a dungeon</p>
          ) : !selected ? (
            <p className="app__canvas-placeholder">Select a map</p>
          ) : runtime.map.error ? (
            <p className="app__canvas-placeholder">Could not load {selected}: {runtime.map.error}</p>
          ) : runtime.map.ready ? (
            runtime.renderMap(slots)
          ) : (
            <p className="app__canvas-placeholder">Loading {selected}…</p>
          )}
          {/* <copy App.tsx:323-330 "Task 13: SaveDialog owns its own modal shell" comment> */}
          {runtime.saveDialog.open && selected && (
            <SaveDialog
              mapName={selected}
              // markClean first (ctx.onCommitted): the dialog's commit closes the server session behind the hook's
              // back. Then the family's own follow-up (GBC re-reads the map).
              onCommitted={() => {
                ctx.onCommitted();
                runtime.saveDialog.setOpen(false);
                runtime.saveDialog.onCommitted();
              }}
              onCancel={() => runtime.saveDialog.setOpen(false)}
            />
          )}
          {runtime.modals}
        </main>
      </div>
    </div>
  );
}
```

Reconciliation check (the implementer states it in the report): `<main>`'s children are always four slots — banners, content, SaveDialog, modals — so the world host keeps its slot and key (`"world-host"`) across in-context toggles, exactly as both old shells did.

- [ ] **Step 3: Turn `App.tsx` and `GbcApp.tsx` into wrappers**

`packages/ui/src/App.tsx` (entire file):

```tsx
import type { ReactNode } from "react";
import { FamilyApp } from "./shell/FamilyApp.js";
import { gbaAdapter } from "./gba/adapter.js";

export interface AppProps {
  switcher?: ReactNode;
}

/** Plan 9 Task 5: a transitional wrapper so the GBA shell tests run unchanged against FamilyApp. Deleted in Task 6. */
export function App({ switcher }: AppProps) {
  return <FamilyApp adapter={gbaAdapter} switcher={switcher} />;
}
```

`packages/ui/src/gbc/GbcApp.tsx` (entire file):

```tsx
import type { ReactNode } from "react";
import { FamilyApp } from "../shell/FamilyApp.js";
import { gbcAdapter } from "./adapter.js";
import type { GbcTimeOfDay } from "./time.js";

export type TimeOfDay = GbcTimeOfDay;

export interface GbcAppProps {
  /** Unused since Plan 6b (kept so the tests' `root` prop still type-checks until Task 6). */
  root: string;
  switcher?: ReactNode;
}

/** Plan 9 Task 5: a transitional wrapper so the GBC shell tests run unchanged against FamilyApp. Deleted in Task 6. */
export function GbcApp({ switcher }: GbcAppProps) {
  return <FamilyApp adapter={gbcAdapter} switcher={switcher} />;
}
```

`packages/ui/src/Root.tsx`: replace the `App`/`GbcApp` imports (lines 3-4) with

```tsx
import { FamilyApp } from "./shell/FamilyApp.js";
import { gbaAdapter } from "./gba/adapter.js";
import { gbcAdapter } from "./gbc/adapter.js";
```

and lines 59-63 with

```tsx
  return <FamilyApp key={key} adapter={family === "gbc" ? gbcAdapter : gbaAdapter} switcher={switcher} />;
```

Update Root's doc comment (lines 12-13) to say it mounts `FamilyApp` with the family's adapter.

- [ ] **Step 4: Run the 13 shell test files plus Root, unchanged**

Run: `npx vitest run packages/ui/test/App packages/ui/test/gbc/GbcApp packages/ui/test/gbc/Root.test.tsx`
Expected: every test passes, including all Task 1 characterisation tests. `git diff --stat -- packages/ui/test` shows only `Root.test.tsx` (+1 test). Any failure is a behaviour difference: fix `FamilyApp`/the runtime, never the test.

- [ ] **Step 5: Gate, typecheck, build, commit**

Gate: **2,720 + 1 = 2,721 pass, 0 fail**, 173 files.

```bash
git add packages/ui/src/shell/FamilyApp.tsx packages/ui/src/App.tsx packages/ui/src/gbc/GbcApp.tsx packages/ui/src/Root.tsx packages/ui/test/gbc/Root.test.tsx
git commit -m "feat(ui): one FamilyApp shell over per-family runtimes; App/GbcApp become wrappers (Plan 9 Task 5)"
```

---

### Task 6: Move the shell tests to `FamilyApp`; delete the wrappers

Mechanical. No assertion changes except Root.test's GBA-identity test (Step 3).

**Files:**
- Modify: `packages/ui/test/App.test.tsx`, `AppContextEdit.test.tsx`, `AppContextStroke.test.tsx`, `AppContextVisit.test.tsx`, `AppEditingWiring.test.tsx`, `AppVisitGuard.test.tsx`, `AppWorldContextMenu.test.tsx`, `test/gbc/GbcApp.test.tsx`, `GbcAppContext.test.tsx`, `GbcAppContextSelection.test.tsx`, `GbcAppContextStroke.test.tsx`, `GbcAppEditing.test.tsx`, `GbcAppWorldGuard.test.tsx`, `test/gbc/Root.test.tsx`
- Delete: `packages/ui/src/App.tsx`, `packages/ui/src/gbc/GbcApp.tsx`

**Interfaces:** Consumes `FamilyApp`, `gbaAdapter`, `gbcAdapter`.

- [ ] **Step 1: Rewrite imports and render calls**

Run from the repo root (Git Bash):

```bash
cd packages/ui/test
for f in App.test.tsx AppContextEdit.test.tsx AppContextStroke.test.tsx AppContextVisit.test.tsx AppEditingWiring.test.tsx AppVisitGuard.test.tsx AppWorldContextMenu.test.tsx; do
  sed -i 's#^import { App } from "../src/App.js";#import { FamilyApp } from "../src/shell/FamilyApp.js";\nimport { gbaAdapter } from "../src/gba/adapter.js";#; s#<App />#<FamilyApp adapter={gbaAdapter} />#g' "$f"
done
for f in gbc/GbcApp.test.tsx gbc/GbcAppContext.test.tsx gbc/GbcAppContextSelection.test.tsx gbc/GbcAppContextStroke.test.tsx gbc/GbcAppEditing.test.tsx gbc/GbcAppWorldGuard.test.tsx; do
  sed -i 's#^import { GbcApp } from "../../src/gbc/GbcApp.js";#import { FamilyApp } from "../../src/shell/FamilyApp.js";\nimport { gbcAdapter } from "../../src/gbc/adapter.js";#; s#<GbcApp root="[^"]*" />#<FamilyApp adapter={gbcAdapter} />#g' "$f"
done
cd ../../..
grep -rnE "<App\b|<GbcApp\b|src/App\.js|gbc/GbcApp\.js" packages/ui/test packages/ui/src
```

Expected: the final grep prints nothing. Anything it prints (a render with extra props, a `<StrictMode><GbcApp …/>` form) is fixed by hand the same way.

- [ ] **Step 2: Delete the wrappers; fix stale importers**

```bash
git rm packages/ui/src/App.tsx packages/ui/src/gbc/GbcApp.tsx
grep -rn "TimeOfDay\b" packages/ui/src packages/ui/test | grep -v GbcTimeOfDay
```

Any remaining `TimeOfDay` importer switches to `GbcTimeOfDay` from `gbc/time.js`.

- [ ] **Step 3: Retarget Root.test's GBA identity test to family markers**

In `test/gbc/Root.test.tsx`, the test `"gba renders App -- proven by App's own Dungeon button"` (line 79) no longer tells the families apart (both show Dungeon). Rename and strengthen it:

```tsx
  it("gba renders the GBA shell -- a View group, and no Crystal label or Time of day group", async () => {
    const { mock } = makeFetchMock({ family: "gba", root: "/x" });
    vi.stubGlobal("fetch", mock);
    render(<Root />);

    await waitFor(() => expect(screen.getByText("Dungeon")).toBeTruthy());
    expect(screen.queryByText("Crystal")).toBeNull();
    expect(screen.queryByRole("group", { name: "Time of day" })).toBeNull();
  });
```

Also reword comments in this file that name `App`/`GbcApp` as components to "the GBA/GBC shell"; comment rewording counts as removed lines and gets the reason "names the deleted components".

- [ ] **Step 4: Account for every removed line**

For each modified test file:

```bash
for f in $(git diff --name-only master -- packages/ui/test); do echo "$f $(git diff master -- "$f" | grep -c '^-[^-]')"; done
```

Expected per shell file = the lines master had that this task rewrites:

```bash
git show master:packages/ui/test/<file> | grep -cE '<App />|<GbcApp root=|^import \{ (App|GbcApp) \}'
```

(Lines Task 1 added exist only on this branch, so they never count as removed.) Extra, named exceptions: `GbcAppWorldGuard.test.tsx` +1 (Task 1 moved the mock factory's closing `))`, reason "mock gains Edit-here button"); `Root.test.tsx` = the retargeted test's title and body lines plus reworded comments. The report lists each file's count, the master grep count, and a reason class for every removed line ("import", "render call", "Root identity retarget", "comment names deleted component", "mock gains Edit-here button"). Any other removed line is a defect.

- [ ] **Step 5: Gate, typecheck, build, commit**

Gate: **2,721 pass, 0 fail** (no tests added or removed), 173 files.

```bash
git add packages/ui/test/App.test.tsx packages/ui/test/AppContextEdit.test.tsx packages/ui/test/AppContextStroke.test.tsx packages/ui/test/AppContextVisit.test.tsx packages/ui/test/AppEditingWiring.test.tsx packages/ui/test/AppVisitGuard.test.tsx packages/ui/test/AppWorldContextMenu.test.tsx packages/ui/test/gbc/GbcApp.test.tsx packages/ui/test/gbc/GbcAppContext.test.tsx packages/ui/test/gbc/GbcAppContextSelection.test.tsx packages/ui/test/gbc/GbcAppContextStroke.test.tsx packages/ui/test/gbc/GbcAppEditing.test.tsx packages/ui/test/gbc/GbcAppWorldGuard.test.tsx packages/ui/test/gbc/Root.test.tsx
git commit -m "test(ui): shell tests render FamilyApp; drop the App/GbcApp wrappers (Plan 9 Task 6)"
```

(`git rm` already staged the deletions.)

---

### Task 7: The shared edit rail (D4) and its CSS

**Files:**
- Modify: `packages/ui/src/shared/EditingWorkspace.tsx:5-22`, `packages/ui/src/components/MapEditingWorkspace.tsx:75-153`, `packages/ui/src/gbc/GbcMapEditing.tsx:169-194`, `packages/ui/src/styles.css` (remove 258-281 strip rules and 2744-2773 `.gbc-map-editing__rail` rules; add `.edit-rail` rules)
- Test: `packages/ui/test/MapEditingWorkspace.test.tsx`, `packages/ui/test/MapEditingWorkspaceActive.test.tsx:31`, `packages/ui/test/gbc/GbcAppContext.test.tsx:218,225,287`, `packages/ui/test/stylesContext.test.ts`, `packages/ui/test/AppContextEdit.test.tsx`

**Interfaces:** `WorkspaceSlots.side` keeps its name and type; its content is now the rail's children (a fragment), wrapped by `EditingWorkspace` in `<div className="edit-rail">`. `null` renders no rail.

- [ ] **Step 1: Write the failing tests**

Retarget (each a removed line with reason "strip → rail (D4)"):
- `MapEditingWorkspace.test.tsx:106-113` "renders the collision strip only while the collision tool is active" → rename to `"renders the collision palette in the rail only while the collision tool is active"`; selectors `.app__collision-strip` → `.edit-rail > .collision-palette`.
- `MapEditingWorkspace.test.tsx:139-146` "the metatile strip is keyed on data.layout.name, not mapName" → rename to `"the rail's metatile palette is keyed on data.layout.name, not mapName"`; selector `.app__metatile-strip img` → `.edit-rail .metatile-palette img`.
- `MapEditingWorkspaceActive.test.tsx:31` `CHROME`: `".app__metatile-strip"` → `".edit-rail"`.
- `GbcAppContext.test.tsx:218,225,287`: `.gbc-map-editing__rail` → `.edit-rail`.

New, in `MapEditingWorkspace.test.tsx` (use the file's `DATA`, `editSession`, `makeEditing`):

```tsx
  // Plan 9 (D4): one right-hand rail -- [collision palette] over the metatile palette over the inspector.
  const railOrder = (container: HTMLElement) =>
    [...container.querySelector(".edit-rail")!.children].map((el) => el.className.split(" ")[0]);

  it("rail order: collision palette (Collision only), then the metatile palette, then the inspector", () => {
    const { container, rerender } = render(
      <MapEditingWorkspace mapName="Foo" data={DATA} editSession={editSession} editing={makeEditing({ activeToolKind: "collision" })} />,
    );
    expect(railOrder(container)).toEqual(["collision-palette", "metatile-palette", "event-inspector"]);
    rerender(<MapEditingWorkspace mapName="Foo" data={DATA} editSession={editSession} editing={makeEditing({ activeToolKind: "shift" })} />);
    expect(railOrder(container)).toEqual(["metatile-palette", "event-inspector"]);
    expect(container.querySelector(".app__metatile-strip, .app__collision-strip")).toBeNull();
  });

  it("the GBA palette shows with no paint tool, and a pick only sets the stamp", () => {
    const editing = makeEditing({ activeToolKind: null });
    render(<MapEditingWorkspace mapName="Foo" data={DATA} editSession={editSession} editing={editing} />);
    fireEvent.click(screen.getByRole("button", { name: /metatile 0x1\b/i }));
    expect(editing.setCurrentStamp).toHaveBeenCalledWith({ width: 1, height: 1, cells: [{ metatileId: 1 }] });
    expect(editing.setActiveToolKind).not.toHaveBeenCalled();
  });
```

(If `DATA`'s palette range has no id 1, use the lowest in-range id the file's other palette test uses.)

New, in `stylesContext.test.ts` (reuses its `ruleBody` and `out`):

```ts
  it("the edit rail is a 260px column that cannot widen the page; the inspector takes at most half (Plan 9 D4)", () => {
    const rail = ruleBody(".edit-rail");
    expect(rail).toMatch(/width\s*:\s*260px/);
    expect(rail).toMatch(/min-width\s*:\s*0(px)?\s*(;|$)/);
    expect(rail).toMatch(/flex-direction\s*:\s*column/);
    expect(ruleBody(".edit-rail > .event-inspector")).toMatch(/max-height\s*:\s*50%/);
    expect(ruleBody(".edit-rail > .metatile-palette")).toMatch(/min-width\s*:\s*0(px)?\s*(;|$)/);
    expect(out).not.toMatch(/\.app__metatile-strip|\.app__collision-strip|\.gbc-map-editing__rail/);
  });
```

New, in `AppContextEdit.test.tsx`: copy the test "double-clicking a map in World shows the editing chrome around the SAME world canvas…" (line 118, same helpers `startApp`, `contextOverlay`, `chrome`), title `"in context, GBA editing gets the rail (palette + inspector) around the SAME world canvas, with no /api/world refetch (Plan 9 D4)"`, keep its node-identity and `/api/world` count assertions, and add after context entry:

```tsx
    const rail = document.querySelector(".edit-rail")!;
    expect(rail).toBeTruthy();
    expect(rail.querySelector(".metatile-palette")).toBeTruthy();
    expect(rail.querySelector(".event-inspector")).toBeTruthy();
    expect(document.querySelector(".app__metatile-strip")).toBeNull();
```

- [ ] **Step 2: Run to see failures**

`npx vitest run packages/ui/test/MapEditingWorkspace.test.tsx packages/ui/test/MapEditingWorkspaceActive.test.tsx packages/ui/test/stylesContext.test.ts packages/ui/test/AppContextEdit.test.tsx packages/ui/test/gbc/GbcAppContext.test.tsx` → the new/retargeted tests FAIL.

- [ ] **Step 3: `EditingWorkspace` renders the rail**

```tsx
export interface WorkspaceSlots<CanvasProps> {
  /** Rendered only while active, before the stable body (toolbar, banners). */
  top: ReactNode;
  /** The right-hand rail's children (Plan 9 D4), rendered only while active inside `.edit-rail` after the canvas.
   *  Null renders no rail. */
  side: ReactNode;
  /** Null while there is no map (inactive host before load). */
  canvasProps: CanvasProps | null;
  /** The family's own canvas, used when renderCanvas is absent. */
  Canvas: ComponentType<CanvasProps>;
}

export function EditingWorkspace<CanvasProps>({ active, top, side, canvasProps, Canvas, renderCanvas }: WorkspaceSlots<CanvasProps> & {
  active: boolean;
  renderCanvas?: (canvasProps: CanvasProps | null) => ReactNode;
}) {
  const canvas = renderCanvas ? renderCanvas(canvasProps) : canvasProps && <Canvas {...canvasProps} />;
  return <>{active && top}<div className="app__map-editing-body">{canvas}{active && side ? <div className="edit-rail">{side}</div> : null}</div></>;
}
```

The canvas stays the body's first child in every state (no remount).

- [ ] **Step 4: `MapEditingWorkspace` moves the palettes into the rail**

Delete the two strip blocks (`MapEditingWorkspace.tsx:95-111`) from `top`. Replace `side` (line 153) and its comment with:

```tsx
  /* Plan 9 (D4): one right-hand rail, as GBC has had since Plan 7 -- the collision palette while the Collision tool
     is active, the metatile palette always (a pick with another tool active only sets the stamp, as a dropper pick
     does), then EventInspector (always mounted: its empty state carries Add Event). */
  const side = (
    <>
      {activeToolKind === "collision" && <CollisionPalette selected={collisionValue} onSelect={setCollisionValue} />}
      {data && (
        <MetatilePalette
          layoutName={data.layout.name}
          split={data.split}
          primaryCount={data.primaryCount}
          secondaryCount={data.secondaryCount}
          onSelect={setCurrentStamp}
          selected={currentStamp}
        />
      )}
      <EventInspector selected={selectedEvent} onMove={onMoveEventFromInspector} onDelete={onDeleteEvent} onAdd={onAddEvent} />
    </>
  );
```

Update the component doc comment (line 50: "toolbar, tool strips, …") to "toolbar, banners, canvas + rail".

- [ ] **Step 5: `GbcMapEditing` drops its own wrapper**

`GbcMapEditing.tsx:169-194`: remove the `<div className="gbc-map-editing__rail">` wrapper (keep its two children inside a fragment `<>…</>`), and replace the comment at 169-170 with `// The shared rail (EditingWorkspace, .edit-rail): palette over inspector.`

- [ ] **Step 6: CSS**

Remove `.app__collision-strip`, `.app__metatile-strip` (with their comments, `styles.css:258-281`) and the three `.gbc-map-editing__rail` rules (with the comment, `2744-2773`). Fix any other comment that names a removed class (`grep -n "metatile-strip\|collision-strip\|gbc-map-editing__rail" packages/ui/src/styles.css` must print nothing). Add, where the GBC rail rules were:

```css
/* Plan 9 (D4): one 260px right-hand rail for both families -- [collision palette, Collision tool only] over the
   metatile palette (takes the spare height, scrolls inside) over the event inspector (at most half the height,
   scrolls inside); the canvas keeps the rest of the row. min-width: 0 on every flex child so long text cannot
   widen the rail (LESSONS: React / UI Patterns). */
.edit-rail {
  width: 260px;
  flex: 0 0 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border);
  background: var(--bg-panel);
}

.edit-rail > .collision-palette {
  flex: 0 0 auto;
  min-width: 0;
  border-bottom: 1px solid var(--border);
}

.edit-rail > .metatile-palette {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
}

.edit-rail > .gbc-metatile-palette {
  width: auto;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  border-left: none;
}

.edit-rail > .event-inspector {
  width: auto;
  flex: 0 1 auto;
  min-width: 0;
  max-height: 50%;
  border-left: none;
  border-top: 1px solid var(--border);
}
```

(The collision palette's swatch rows already `flex-wrap: wrap`, `styles.css:2240-2244`. The GBA grid is 8 × 24 px + 7 × 4 px gaps + 2 × 8 px padding = 236 px, inside 260.)

- [ ] **Step 7: Run the tests, then the gate**

Targeted run → PASS. Gate: **2,721 + 4 = 2,725 pass**, 173 files; typecheck; build. Per modified test file, removed-line accounting (reason "strip → rail (D4)").

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/shared/EditingWorkspace.tsx packages/ui/src/components/MapEditingWorkspace.tsx packages/ui/src/gbc/GbcMapEditing.tsx packages/ui/src/styles.css packages/ui/test/MapEditingWorkspace.test.tsx packages/ui/test/MapEditingWorkspaceActive.test.tsx packages/ui/test/gbc/GbcAppContext.test.tsx packages/ui/test/stylesContext.test.ts packages/ui/test/AppContextEdit.test.tsx
git commit -m "feat(ui): one right-hand edit rail for both families (Plan 9 Task 7, D4)"
```

---

### Task 8: Toolbar icons, capitalised labels and tooltips (D5)

**Files:**
- Create: `packages/ui/src/components/toolIcons.tsx`
- Modify: `packages/ui/src/components/Toolbar.tsx:76-104`, `packages/ui/src/gbc/GbcMapEditing.tsx:14-15`, `packages/ui/src/components/MapEditingWorkspace.tsx:87,93`, `packages/ui/src/styles.css` (toolbar button rules)
- Test: `packages/ui/test/Toolbar.test.tsx`, `packages/ui/test/gbc/ToolbarGbc.test.tsx`, plus the tool-name renames in every file the grep in Step 1 lists

**Interfaces:**
- Produces: `export const TOOL_LABEL: Record<ToolKind, string>`, `export const TOOL_KEY: Record<ToolKind, string>` (from `Toolbar.tsx`; Task 9 reads `TOOL_KEY`); `export const TOOL_ICONS: Record<ToolKind, ReactElement>` (from `toolIcons.tsx`).
- Consumes: `toolsFor`, `GBA_CAPABILITIES`, `GBC_CAPABILITIES` (Task 2).

- [ ] **Step 1: Rename the tool queries (tests only)**

Accessible names change from `pencil` to `Pencil` etc. From the repo root:

```bash
grep -rlE "name: ?\"(pencil|rect|bucket|dropper|shift|collision)\"" packages/ui/test | xargs sed -i -E 's/name: ?"pencil"/name: "Pencil"/g; s/name: ?"rect"/name: "Rect"/g; s/name: ?"bucket"/name: "Bucket"/g; s/name: ?"dropper"/name: "Dropper"/g; s/name: ?"shift"/name: "Shift"/g; s/name: ?"collision"/name: "Collision"/g'
grep -rnE "\b(pencil|rect|bucket|dropper|shift|collision)\b" packages/ui/test | grep -E "getByRole|queryByRole|findByRole|getAllByRole|name:" | grep -vE "ToolKind|activeToolKind|kind:"
```

The second grep lists the loop-driven queries left to fix by hand: `Toolbar.test.tsx:36,110` (loops over lowercase names), `ToolbarGbc.test.tsx`, `GbcAppEditing.test.tsx:152` (`{ name: tool }` over a lowercase array). Change those arrays to labels (`["Pencil", "Rect", "Bucket", "Dropper", "Shift", "Collision"]`); assertions on `onSelectTool` arguments stay lowercase kinds. Each changed line's reason: "label rename (D5)".

- [ ] **Step 2: Write the new failing tests** (append to `Toolbar.test.tsx`, reusing its `baseProps`)

```tsx
describe("Toolbar -- icon, label and tooltip (Plan 9 D5)", () => {
  it("each tool shows an aria-hidden icon and its capitalised label, tooltip names the shortcut", () => {
    render(<Toolbar {...baseProps} availableTools={ALL_TOOLS} />);
    const expected = [["Pencil", "P"], ["Rect", "R"], ["Bucket", "B"], ["Dropper", "I"], ["Shift", "S"], ["Collision", "C"]];
    for (const [label, key] of expected) {
      const btn = screen.getByRole("button", { name: label });
      expect(btn.getAttribute("title")).toBe(`${label} (${key})`);
      expect(btn.textContent).toBe(label);
      const svg = btn.querySelector("svg")!;
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });
  it("a disabled tool keeps its reason title instead of the shortcut", () => {
    render(<Toolbar {...baseProps} availableTools={[]} unavailableTitle="this map's .blk is flagged non-writable: x" />);
    expect(screen.getByRole("button", { name: "Pencil" }).getAttribute("title")).toBe("this map's .blk is flagged non-writable: x");
  });
  it("Undo and Redo tooltips name their shortcuts", () => {
    render(<Toolbar {...baseProps} />);
    expect(screen.getByRole("button", { name: "Undo" }).getAttribute("title")).toBe("Undo (Ctrl+Z)");
    expect(screen.getByRole("button", { name: "Redo" }).getAttribute("title")).toBe("Redo (Ctrl+Y)");
  });
});
```

Run `npx vitest run packages/ui/test/Toolbar.test.tsx` → FAIL.

- [ ] **Step 3: Write `packages/ui/src/components/toolIcons.tsx`**

```tsx
import type { ReactElement } from "react";
import type { ToolKind } from "./Toolbar.js";

// Plan 9 (D5): one 16px line icon per tool, inline so there is no icon dependency. Decorative: the label names the tool.
const svg = (children: ReactElement | ReactElement[]) => (
  <svg className="toolbar__icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

export const TOOL_ICONS: Record<ToolKind, ReactElement> = {
  pencil: svg(<path d="M11 2.5l2.5 2.5L5 13.5H2.5V11z" />),
  rect: svg(<rect x="2.5" y="3.5" width="11" height="9" />),
  bucket: svg([<path key="a" d="M3 7l5-5 5 5-5 5z" />, <path key="b" d="M13.5 10.5c0 1-.7 2-1.5 2s-1.5-1-1.5-2l1.5-2z" />]),
  dropper: svg([<path key="a" d="M10 2.5l3.5 3.5-1.5 1.5-3.5-3.5z" />, <path key="b" d="M9 6l-6 6v1.5h1.5l6-6" />]),
  shift: svg(<path d="M8 1.5v13M1.5 8h13M6 3.5l2-2 2 2M6 12.5l2 2 2-2M3.5 6l-2 2 2 2M12.5 6l2 2-2 2" />),
  collision: svg([<rect key="a" x="2.5" y="2.5" width="11" height="11" />, <path key="b" d="M2.5 13.5l11-11" />]),
};
```

- [ ] **Step 4: Toolbar labels, icons, tooltips**

In `Toolbar.tsx`, add after `TOOLS` (line 5) and import `TOOL_ICONS`:

```tsx
import { TOOL_ICONS } from "./toolIcons.js";

export const TOOL_LABEL: Record<ToolKind, string> = { pencil: "Pencil", rect: "Rect", bucket: "Bucket", dropper: "Dropper", shift: "Shift", collision: "Collision" };
/** Plan 9 (R1): the shortcut letter shown in each tool's tooltip; Toolbar's keydown listener reads the same table. */
export const TOOL_KEY: Record<ToolKind, string> = { pencil: "P", rect: "R", bucket: "B", dropper: "I", shift: "S", collision: "C" };
```

Replace the tool button (lines 83-94) with:

```tsx
            <button
              key={kind}
              type="button"
              aria-pressed={activeToolKind === kind}
              disabled={!available}
              title={available ? `${TOOL_LABEL[kind]} (${TOOL_KEY[kind]})` : unavailableTitle}
              className="map-canvas__btn toolbar__tool-btn"
              onClick={() => onSelectTool(kind)}
            >
              {TOOL_ICONS[kind]}
              <span>{TOOL_LABEL[kind]}</span>
            </button>
```

(`aria-label={kind}` goes: the accessible name is now the visible label.) Undo/Redo buttons gain `title="Undo (Ctrl+Z)"` / `title="Redo (Ctrl+Y)"`; their `aria-label`s and text stay.

`GbcMapEditing.tsx:14-15`:

```tsx
import { GBC_CAPABILITIES, toolsFor } from "../shell/adapter.js";
/** No collision button (Plan 7 Goal: GBC collision is per metatile, not per block) and no sign composer. */
export const GBC_TOOLS: ToolKind[] = toolsFor(GBC_CAPABILITIES);
```

`MapEditingWorkspace.tsx`: import `GBA_CAPABILITIES, toolsFor`; pass `tools={toolsFor(GBA_CAPABILITIES)}` and `availableTools={toolsFor(GBA_CAPABILITIES)}` (replacing the literal list at line 93; keep the comment), and `onOpenSignComposer={GBA_CAPABILITIES.addSign ? () => setSignComposerOpen(true) : undefined}`.

CSS (next to the existing `.toolbar__tool-btn` rules, or after `.toolbar__tools` if none exist):

```css
/* Plan 9 (D5): icon + capitalised label. */
.toolbar__tool-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.toolbar__icon {
  flex: none;
}
```

If `.toolbar__tool-btn` already has a rule, add the three declarations to it instead of a second rule.

- [ ] **Step 5: Run, gate, commit**

`npx vitest run packages/ui/test/Toolbar.test.tsx packages/ui/test/gbc/ToolbarGbc.test.tsx` → PASS. Gate: **2,725 + 3 = 2,728 pass**, 173 files; typecheck; build. Removed-line accounting for every renamed file (reason "label rename (D5)").

```bash
git add packages/ui/src/components/toolIcons.tsx packages/ui/src/components/Toolbar.tsx packages/ui/src/gbc/GbcMapEditing.tsx packages/ui/src/components/MapEditingWorkspace.tsx packages/ui/src/styles.css $(git diff --name-only -- packages/ui/test)
git commit -m "feat(ui): toolbar icons, capitalised labels and shortcut tooltips (Plan 9 Task 8, D5)"
```

---

### Task 9: Keyboard shortcuts (R1)

**Files:**
- Modify: `packages/ui/src/components/Toolbar.tsx` (one `useEffect`)
- Test: create `packages/ui/test/ToolbarShortcuts.test.tsx`; append one integration test to `packages/ui/test/App.test.tsx`

**Interfaces:** Consumes `TOOL_KEY` (Task 8). No new props: the listener reads the props `Toolbar` already has.

- [ ] **Step 1: Write the failing unit tests** — `packages/ui/test/ToolbarShortcuts.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { Toolbar, type ToolbarProps, type ToolKind } from "../src/components/Toolbar.js";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const ALL: ToolKind[] = ["pencil", "rect", "bucket", "dropper", "shift", "collision"];
const props = (over: Partial<ToolbarProps> = {}): ToolbarProps => ({
  activeToolKind: null, onSelectTool: vi.fn(), isDirty: false, onUndo: vi.fn(), onRedo: vi.fn(),
  canUndo: true, canRedo: true, onOpenSave: vi.fn(), onDiscard: vi.fn(), availableTools: ALL, ...over,
});
const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
};

describe("Toolbar keyboard shortcuts (Plan 9 R1)", () => {
  it.each([["p", "pencil"], ["r", "rect"], ["b", "bucket"], ["i", "dropper"], ["s", "shift"], ["c", "collision"]] as const)(
    "%s selects %s and is prevented", (key, kind) => {
      const p = props();
      render(<Toolbar {...p} />);
      expect(press(key).defaultPrevented).toBe(true);
      expect(p.onSelectTool).toHaveBeenCalledWith(kind);
    });

  it("upper-case letters without Shift (Caps Lock) select too", () => {
    const p = props();
    render(<Toolbar {...p} />);
    press("P");
    expect(p.onSelectTool).toHaveBeenCalledWith("pencil");
  });

  it("Ctrl+Z and Cmd+Z undo; Ctrl+Y, Ctrl+Shift+Z and Cmd+Shift+Z redo", () => {
    const p = props();
    render(<Toolbar {...p} />);
    expect(press("z", { ctrlKey: true }).defaultPrevented).toBe(true);
    press("z", { metaKey: true });
    expect(p.onUndo).toHaveBeenCalledTimes(2);
    press("y", { ctrlKey: true });
    press("Z", { ctrlKey: true, shiftKey: true });
    press("z", { metaKey: true, shiftKey: true });
    expect(p.onRedo).toHaveBeenCalledTimes(3);
  });

  it("ignored in an input, textarea, select or contenteditable", () => {
    const p = props();
    render(<><Toolbar {...p} /><input aria-label="i" /><textarea aria-label="t" /><select aria-label="s" /><div contentEditable suppressContentEditableWarning>x</div></>);
    for (const el of [...document.querySelectorAll("input, textarea, select, [contenteditable]")]) {
      expect(press("p", {}, el).defaultPrevented).toBe(false);
      press("z", { ctrlKey: true }, el);
    }
    expect(p.onSelectTool).not.toHaveBeenCalled();
    expect(p.onUndo).not.toHaveBeenCalled();
  });

  it("ignored while an aria-modal dialog is open", () => {
    const p = props();
    render(<><Toolbar {...p} /><div role="dialog" aria-modal="true" /></>);
    press("p");
    press("z", { ctrlKey: true });
    expect(p.onSelectTool).not.toHaveBeenCalled();
    expect(p.onUndo).not.toHaveBeenCalled();
  });

  it("a letter with any modifier is ignored", () => {
    const p = props();
    render(<Toolbar {...p} />);
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
      expect(press("p", mod).defaultPrevented).toBe(false);
    }
    expect(p.onSelectTool).not.toHaveBeenCalled();
  });

  it("an absent tool (GBC has no Collision) and a disabled tool are ignored", () => {
    const p = props({ tools: ["pencil", "rect", "bucket", "dropper", "shift"], availableTools: ["rect"] });
    render(<Toolbar {...p} />);
    expect(press("c").defaultPrevented).toBe(false);
    expect(press("p").defaultPrevented).toBe(false);
    expect(p.onSelectTool).not.toHaveBeenCalled();
    press("r");
    expect(p.onSelectTool).toHaveBeenCalledWith("rect");
  });

  it("Undo/Redo are ignored when unavailable", () => {
    const p = props({ canUndo: false, canRedo: false });
    render(<Toolbar {...p} />);
    expect(press("z", { ctrlKey: true }).defaultPrevented).toBe(false);
    press("y", { ctrlKey: true });
    expect(p.onUndo).not.toHaveBeenCalled();
    expect(p.onRedo).not.toHaveBeenCalled();
  });

  it("an already-prevented key is ignored", () => {
    const p = props();
    render(<Toolbar {...p} />);
    const ev = new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true });
    ev.preventDefault();
    window.dispatchEvent(ev);
    expect(p.onSelectTool).not.toHaveBeenCalled();
  });

  it("uses the latest props without re-subscribing, and unmount removes the listener", () => {
    const p = props({ availableTools: [] });
    const { rerender, unmount } = render(<Toolbar {...p} />);
    rerender(<Toolbar {...p} availableTools={ALL} />);
    press("p");
    expect(p.onSelectTool).toHaveBeenCalledTimes(1);
    unmount();
    press("p");
    expect(p.onSelectTool).toHaveBeenCalledTimes(1);
  });

  it("StrictMode: one key press selects exactly once", () => {
    const p = props();
    render(<Toolbar {...p} />, { reactStrictMode: true });
    press("p");
    expect(p.onSelectTool).toHaveBeenCalledTimes(1);
  });
});
```

If this RTL version rejects `render(…, { reactStrictMode: true })`, use `renderHook(() => null, { wrapper: () => <Toolbar {...p} />, reactStrictMode: true })` (LESSONS: Testing — never a `<StrictMode>` wrapper).

Run `npx vitest run packages/ui/test/ToolbarShortcuts.test.tsx` → FAIL (no listener).

- [ ] **Step 2: Implement the listener in `Toolbar.tsx`**

Add `import { useEffect, useRef } from "react";` and, at the top of the component body:

```tsx
  // Plan 9 (R1): one window keydown listener while the toolbar is mounted (editing chrome only: Map view or
  // in-context, so at most one exists). Subscribed once; reads the latest props through a ref.
  const latest = useRef({ tools, availableTools, onSelectTool, onUndo, onRedo, canUndo, canRedo });
  latest.current = { tools, availableTools, onSelectTool, onUndo, onRedo, canUndo, canRedo };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTextTarget(e.target) || document.querySelector('[aria-modal="true"]')) return;
      const p = latest.current;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && (key === "z" || (key === "y" && !e.shiftKey))) {
        const redo = key === "y" || e.shiftKey;
        if (!(redo ? p.canRedo : p.canUndo)) return;
        e.preventDefault();
        if (redo) p.onRedo(); else p.onUndo();
        return;
      }
      if (mod || e.altKey || e.shiftKey) return;
      const kind = p.tools.find((t) => TOOL_KEY[t].toLowerCase() === key);
      if (!kind || !p.availableTools.includes(kind)) return;
      e.preventDefault();
      p.onSelectTool(kind);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
```

and at module level:

```tsx
/** Typing never triggers a shortcut. */
const isTextTarget = (t: EventTarget | null) =>
  t instanceof Element && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null;
```

Bubble phase on purpose: the spec's `defaultPrevented` rule needs target handlers to have run first (unlike `useWorldContext`'s capture-phase Escape).

- [ ] **Step 3: Run the unit tests** → PASS.

- [ ] **Step 4: Write the GBA integration test** (append to `describe("App -- metatile palette wiring", …)` in `App.test.tsx`)

```tsx
  // Plan 9 (R1, Review Focus 1): shortcuts work in Map view; typing in the rail's palette search never switches tools.
  it("P selects Pencil in Map view; typing p in the palette search box does not", async () => {
    vi.stubGlobal("fetch", makeEditFetchMock());
    render(<FamilyApp adapter={gbaAdapter} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "PalletTown" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "PalletTown" }));
    const search = await screen.findByPlaceholderText(/search/i);

    fireEvent.keyDown(search, { key: "p" });
    expect(screen.getByRole("button", { name: "Pencil" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.keyDown(window, { key: "p" });
    expect(screen.getByRole("button", { name: "Pencil" }).getAttribute("aria-pressed")).toBe("true");
    vi.unstubAllGlobals();
  });
```

- [ ] **Step 5: Run, gate, commit**

Targeted runs → PASS. Gate: **2,728 + 17 = 2,745 pass** (16 unit, `it.each` counting 6, plus 1 integration), 174 files; typecheck; build.

```bash
git add packages/ui/src/components/Toolbar.tsx packages/ui/test/ToolbarShortcuts.test.tsx packages/ui/test/App.test.tsx
git commit -m "feat(ui): tool and undo/redo keyboard shortcuts (Plan 9 Task 9, R1)"
```

---

### Task 10: GBA palette hover-link (R2) and the follow-hover toggle for both families (R4)

**Files:**
- Modify: `packages/ui/src/components/MapCanvas.tsx` (props interface ~67-135; one effect near `hover` state at 363), `packages/ui/src/components/MetatilePalette.tsx` (props 5-35; cell className at 154), `packages/ui/src/components/MapEditingWorkspace.tsx` (props, `MapEditingCanvasProps` Pick at 16-19, canvasProps, palette), `packages/ui/src/gba/adapter.tsx` (hover state, `onSelected`, both `MapEditingWorkspace` usages), `packages/ui/src/styles.css`
- Create (R4): `packages/ui/src/shared/useFollowHover.ts`, `packages/ui/src/shared/FollowHoverSwitch.tsx`; modify `packages/ui/src/gbc/GbcMetatilePalette.tsx:46-64`
- Test: `packages/ui/test/MetatilePalette.test.tsx`, `packages/ui/test/MapCanvas.test.tsx`, `packages/ui/test/App.test.tsx`, `packages/ui/test/gbc/GbcMetatilePalette.test.tsx`, create `packages/ui/test/shared/useFollowHover.test.tsx`

**Interfaces:**
- `MapCanvasProps.onHoverMetatile?: (id: number | null) => void` — called with the hovered block's metatile id whenever it changes, `null` when nothing is hovered (leave, out of bounds, map switch).
- `MetatilePaletteProps.highlightId?: number | null` — marks that cell `metatile-palette__cell--hovered`.
- `MapEditingWorkspaceProps` gain `hoveredMetatileId?: number | null; onHoverMetatile?: (id: number | null) => void`.

- [ ] **Step 1: Write the failing tests**

`MetatilePalette.test.tsx` (use the file's existing render props):

```tsx
  it("highlightId marks exactly that cell as hovered (Plan 9 R2)", () => {
    const { container } = render(<MetatilePalette {...<the file's base props>} highlightId={1} />);
    const hovered = [...container.querySelectorAll(".metatile-palette__cell--hovered")];
    expect(hovered).toHaveLength(1);
    expect(hovered[0]!.getAttribute("aria-label")).toBe("metatile 0x1");
  });
```

`MapCanvas.test.tsx`: reuse the fixture and `getBoundingClientRect` stub of the file's existing hover/status-readout test (`grep -n "mouseMove" packages/ui/test/MapCanvas.test.tsx`):

```tsx
  it("reports the hovered block's metatile id, and null on leave (Plan 9 R2)", () => {
    const onHoverMetatile = vi.fn();
    // render MapCanvas exactly as the existing hover test does, plus onHoverMetatile
    fireEvent.mouseMove(canvas, { clientX: <same point as the existing hover test>, clientY: <same> });
    expect(onHoverMetatile).toHaveBeenLastCalledWith(<that block's metatileId from the fixture>);
    fireEvent.mouseLeave(canvas);
    expect(onHoverMetatile).toHaveBeenLastCalledWith(null);
  });
```

(The implementer fills the three `<…>` from the existing hover test and its fixture and quotes the source lines in the report.)

`App.test.tsx` — port `GbcApp.test.tsx`'s two hover tests (lines 517-565) to GBA:
- `"hovering the canvas highlights the matching palette cell (Plan 9 R2)"`: open PalletTown, stub the stage's `getBoundingClientRect` as the GBC test does, `mouseMove` over a block whose `metatileId` is known from `PALLET_TOWN_LAYOUT`, then `waitFor` `.metatile-palette__cell--hovered` with `aria-label` `metatile 0x<id>`.
- `"the palette highlight clears when switching to a different map (Plan 9 R2)"`: as above, then click `Route1` in the tree and, in ONE `waitFor` (as the GBC test does), assert the new map loaded and `.metatile-palette__cell--hovered` is null.

Run → FAIL.

- [ ] **Step 2: `MetatilePalette` highlight**

Add the prop (with a doc comment: "Plan 9 (R2): the metatile under the canvas cursor, marked like GBC's hover highlight") and destructure `highlightId = null`. Cell className (line 154) gains `${id === highlightId ? " metatile-palette__cell--hovered" : ""}`.

CSS (next to `.metatile-palette__cell--selected`):

```css
/* Plan 9 (R2): the cell under the canvas cursor -- GBC's hover pair (.gbc-metatile-palette__cell--selected). */
.metatile-palette__cell--hovered {
  background: var(--bg-selected);
  border-color: var(--border-strong);
}
```

- [ ] **Step 3: `MapCanvas` reports the hovered id**

Add to `MapCanvasProps`:

```tsx
  /** Plan 9 (R2): the hovered block's metatile id whenever it changes; null when nothing is hovered. */
  onHoverMetatile?: (id: number | null) => void;
```

Destructure it, and after `const [hover, setHover] = useState<Hover | null>(null);` (line 363):

```tsx
  // Driven by `hover` itself, so every path that sets or clears it (hoverAt, leave, a map switch) reports.
  const hoveredMetatileId = hover ? hover.metatileId : null;
  const onHoverMetatileRef = useRef(onHoverMetatile);
  onHoverMetatileRef.current = onHoverMetatile;
  useEffect(() => {
    onHoverMetatileRef.current?.(hoveredMetatileId);
  }, [hoveredMetatileId]);
```

(Same ref-mirror pattern as `onViewChangeRef`, `MapCanvas.tsx:353-359`.)

- [ ] **Step 4: Wire it through `MapEditingWorkspace` and the GBA runtime**

`MapEditingWorkspace.tsx`: add `"onHoverMetatile"` to the `MapEditingCanvasProps` `Pick`; add the two optional props to `MapEditingWorkspaceBase`; include `...(onHoverMetatile ? { onHoverMetatile } : {})` in `canvasProps`; pass `highlightId={hoveredMetatileId ?? null}` to `MetatilePalette`.

`gba/adapter.tsx`: add `import { useState } from "react";`, then after `useMapEditing`:

```tsx
  // Plan 9 (R2): the hovered block's metatile id, driving the palette highlight; cleared on every map switch
  // (onSelected) so the previous map's highlight never shows on the next one.
  const [hoveredMetatileId, setHoveredMetatileId] = useState<number | null>(null);
```

pass `hoveredMetatileId={hoveredMetatileId} onHoverMetatile={setHoveredMetatileId}` to all three `MapEditingWorkspace` elements, and set `onSelected: () => setHoveredMetatileId(null)`. `onEnterContext` stays a no-op (spec: GBA does not clear on context entry).

- [ ] **Step 5: Follow-hover tests (R4), failing first**

`packages/ui/test/shared/useFollowHover.test.tsx` (new):

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFollowHover, FOLLOW_HOVER_KEY } from "../../src/shared/useFollowHover.js";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useFollowHover (Plan 9 R4)", () => {
  it("defaults to on", () => {
    expect(renderHook(() => useFollowHover()).result.current[0]).toBe(true);
  });
  it("remembers off across mounts", () => {
    const first = renderHook(() => useFollowHover());
    act(() => first.result.current[1](false));
    expect(localStorage.getItem(FOLLOW_HOVER_KEY)).toBe("off");
    first.unmount();
    expect(renderHook(() => useFollowHover()).result.current[0]).toBe(false);
  });
  it("falls back to on, and still toggles, when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const { result } = renderHook(() => useFollowHover());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
```

Append to `test/gbc/GbcMetatilePalette.test.tsx` and to `test/MetatilePalette.test.tsx` (each with `afterEach(() => localStorage.clear())` and the file's own base props; stub `Element.prototype.scrollIntoView = vi.fn()` in a `beforeEach` if the file does not already):

```tsx
  it("scrolls the hovered cell into view while Follow hover is on (Plan 9 R4)", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { rerender } = render(<Palette {...base} highlightId={null} />);
    expect(screen.getByRole("switch", { name: "Follow hover" }).getAttribute("aria-checked")).toBe("true");
    rerender(<Palette {...base} highlightId={1} />);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("does not scroll once Follow hover is switched off, and the switch shows off (Plan 9 R4)", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { rerender } = render(<Palette {...base} highlightId={null} />);
    fireEvent.click(screen.getByRole("switch", { name: "Follow hover" }));
    expect(screen.getByRole("switch", { name: "Follow hover" }).getAttribute("aria-checked")).toBe("false");
    rerender(<Palette {...base} highlightId={1} />);
    expect(scroll).not.toHaveBeenCalled();
  });
```

(`Palette`/`base` = `GbcMetatilePalette` and its test props in the GBC file; `MetatilePalette` and its props in the GBA file.) Run → FAIL.

Before implementing, `grep -rn 'getAllByRole("switch"' packages/ui/test`: any test counting switches in a view that now shows a palette must be updated (reason "R4 adds a switch") — expected none, since the World bar's switches are counted only in World tests without the rail.

- [ ] **Step 6: Implement R4**

`packages/ui/src/shared/useFollowHover.ts`:

```ts
import { useState } from "react";

export const FOLLOW_HOVER_KEY = "pokemap.palette.followHover";

/** Plan 9 (R4): whether a metatile palette scrolls to the cell under the canvas cursor. One per-browser preference
 *  for both families; storage can be blocked (private mode, cleared site data), so it falls back to on. */
export function useFollowHover(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(FOLLOW_HOVER_KEY) !== "off"; } catch { return true; }
  });
  const set = (next: boolean) => {
    setOn(next);
    try { localStorage.setItem(FOLLOW_HOVER_KEY, next ? "on" : "off"); } catch { /* keep the in-memory choice */ }
  };
  return [on, set];
}
```

`packages/ui/src/shared/FollowHoverSwitch.tsx`:

```tsx
/** Plan 9 (R4): the palette header's "Follow hover" switch -- same switch pattern as the World bar's toggles. */
export function FollowHoverSwitch({ on, onChange }: { on: boolean; onChange(next: boolean): void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="world-canvas__switch palette__follow" onClick={() => onChange(!on)}>
      Follow hover
    </button>
  );
}
```

`GbcMetatilePalette.tsx`: `const [follow, setFollow] = useFollowHover();`; the scroll effect (lines 49-52) becomes `if (!follow || highlightId === null) return;` with deps `[highlightId, follow]`; the header (line 62-64) renders `<FollowHoverSwitch on={follow} onChange={setFollow} />` after the tileset text.

`MetatilePalette.tsx`: add `const cellRefs = useRef(new Map<number, HTMLButtonElement>());` and on each cell button `ref={(el) => { if (el) cellRefs.current.set(id, el); else cellRefs.current.delete(id); }}`; the same hook and effect as GBC (`cellRefs.current.get(highlightId)?.scrollIntoView({ block: "nearest" })`, a cell hidden by the search filter has no ref and is skipped); render `<FollowHoverSwitch on={follow} onChange={setFollow} />` above the search input.

CSS:

```css
/* Plan 9 (R4): the palette header's Follow hover switch sits on its own line, right-aligned. */
.palette__follow {
  align-self: flex-end;
}
```

(If `.world-canvas__switch` relies on a World-bar parent for its look, copy its declarations into `.palette__follow` instead and drop the `world-canvas__switch` class; say which in the report.)

- [ ] **Step 7: Run, gate, commit**

Targeted → PASS. Gate: **2,745 + 11 = 2,756 pass** (R2: 4; R4: 3 hook + 2 GBC + 2 GBA), 175 files; typecheck; build.

```bash
git add packages/ui/src/components/MapCanvas.tsx packages/ui/src/components/MetatilePalette.tsx packages/ui/src/gbc/GbcMetatilePalette.tsx packages/ui/src/shared/useFollowHover.ts packages/ui/src/shared/FollowHoverSwitch.tsx packages/ui/src/components/MapEditingWorkspace.tsx packages/ui/src/gba/adapter.tsx packages/ui/src/styles.css packages/ui/test/MetatilePalette.test.tsx packages/ui/test/gbc/GbcMetatilePalette.test.tsx packages/ui/test/shared/useFollowHover.test.tsx packages/ui/test/MapCanvas.test.tsx packages/ui/test/App.test.tsx
git commit -m "feat(ui): GBA palette hover-link and a shared Follow hover toggle for both palettes (Plan 9 Task 10, R2/R4)"
```

---

### Task 11: DESIGN.md

**Files:** Modify `packages/ui/DESIGN.md` (sections "Layout shape" at 226, "Shared modules (Plan 8)" at 465).

- [ ] **Step 1: Layout shape.** After the existing diagram's "What the canvas is owed" bullets, add a subsection `### Edit layout (Plan 9, D4/D5)` with the spec's diagram (spec lines 147-156, verbatim) and bullets: the rail (`.edit-rail`, 260 px, order, collision palette only with Collision, palette always and a pick with another tool only sets the stamp, inspector ≤ 50 %, `min-width: 0`); the toolbar (icon + capitalised label, tooltip `Label (Key)`, disabled tools keep their reason title, Undo/Redo tooltips); the shortcuts and their ignore rules (copy the Global Constraints lines); the GBA hover-link (`metatile-palette__cell--hovered`, GBC's hover token pair); the shared "Follow hover" switch (R4: both palettes, default on, remembered per browser). Add `shared/useFollowHover.ts` + `FollowHoverSwitch.tsx` as a Shared modules row (consumers `MetatilePalette` / `GbcMetatilePalette`). Update the first bullet of "What the canvas is owed" that mentions "whatever Task 21+ adds — an inspector, a metatile palette" to name the rail.
- [ ] **Step 2: Shared modules.** Add rows:

| Module | What it owns | GBA consumer | GBC consumer |
|---|---|---|---|
| `shell/FamilyApp.tsx` + `shell/adapter.ts` | the one app shell; `EngineAdapter`, `Capabilities`, `FamilyRuntime`, `ShellSlots`; `toolsFor` | `gba/adapter.tsx` (`useGbaRuntime`) | `gbc/adapter.tsx` (`useGbcRuntime`) |
| `shell/useDungeonFilter.ts` | the open dungeon's map filter (cached when `dungeonFilterCache`) | `FamilyApp` | `FamilyApp` |

In the existing rows, replace consumer `App`/`GbcApp` with `FamilyApp` (`useStrokeChain`, `useContextEditing`, `useBeforeUnloadGuard`), and `EditingWorkspace`'s "slots (`top`, `side`, canvas)" with "slots (`top`, the `.edit-rail` contents, canvas)". Rewrite the "Still per family, on purpose" paragraph: per family now means *behind the runtime or a capability* (switch policy in `runtime.leave`, `switchError`, time of day, defects banner, sign composer, `useMapEditing` vs `GbcMapEditing` state lifetimes), with D1-D3/D6/D8 moving them in Plan 10.
- [ ] **Step 3: Commit**

```bash
git add packages/ui/DESIGN.md
git commit -m "docs(ui): DESIGN.md for the family shell, edit rail, toolbar and shortcuts (Plan 9 Task 11)"
```

(Docs only: no test run.)

---

### Task 12: Live acceptance, both families (incl. issue #4)

Verification stays on Anthropic (delegate §3). Follow LESSONS "Live Browser Verification" and "Editing Sessions & Save Safety". Report: `docs/superpowers/task-reports/pokemap-plan-9-family-shell/task-12-live.md` with screenshots under the same folder.

- [ ] **Step 1: Snapshot every writable file** for the GBA subject and PerfPlus before anything: the maps you will paint (layout `map.bin` / `.blk`), their event/script sources, and every `.pokemap/*.json`. Copy to `<scratch>/live/snap/` and record `sha256sum`.
- [ ] **Step 2: Start the hub** on the branch (Vite root via `fileURLToPath(new URL(".", import.meta.url))`). Drive with the Playwright MCP's `browser_run_code_unsafe`, one check per call; if the MCP is held, use the CDP fallback in LESSONS.
- [ ] **Step 3: Each family, run spec "Live acceptance" items 1-7:**
  1. Rail at 1280 and 1024 px: `document.documentElement.scrollWidth === clientWidth` in Map view and in-context; GBA Collision tool shows the collision palette at the rail top.
  2. Every shortcut (P R B I S C; Ctrl+Z; Ctrl+Y; Ctrl+Shift+Z) and each ignore rule: typing in an event-inspector input and in the GBA palette search; with SaveDialog open.
  3. Paint + save in Map view and in-context; restore by reverse paint + save.
  4. Dirty switch: GBA confirm; GBC discard; GBC forced discard failure shows `switchError` (in the same `browser_run_code_unsafe` call: `await page.route("**/api/edit/*/discard", (r) => r.fulfill({ status: 500, body: "{}" }))`, trigger the switch, read the alert, then `page.unroute`).
  5. GBC Time of day; GBC defects banner on CeruleanCave2F; GBA Add Sign opens and cancels.
  6. GBA hover-link follows the cursor and clears on a map switch. Follow hover (both families): on, hovering a block whose cell is scrolled out of the palette brings it into view; off, the palette stays put; the choice survives a reload and a switch to the other family.
  7. Issue #4: World auto-shows major areas (GBA hides indoor/none, GBC indoor/gate); an unplaced map greys in the tree and drags onto the world. Screenshots.
- [ ] **Step 4: `cmp` every snapshot** against the live files. Any difference: restore from the snapshot (sidecars by copy; Porymap-stripped `layout_version` per LESSONS by splicing from `git show HEAD:…`, never `git checkout`), then record it as a finding.
- [ ] **Step 5: Stop the hub by port** (`Get-NetTCPConnection -LocalPort 5184`), remove your own `.playwright-mcp/` files, commit the report and screenshots with explicit pathspecs. Closing issue #4 with the evidence waits for the user's go-ahead.

---

### Finish

- [ ] Whole-branch review (Opus): spec coverage, every "disagree" case behind the runtime, test-count ledger (2,703 → 2,756, 171 → 175 files), removed-line accounting across all tasks.
- [ ] RESUME: Unified UI row → Plan 9 executed; new baseline; Plan 10 next.
- [ ] Stop for the user: push, PR, issue #4 closure are the user's calls (`superpowers:finishing-a-development-branch`).
