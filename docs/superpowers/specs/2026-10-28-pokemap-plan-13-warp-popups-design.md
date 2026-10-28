# Plan 13: warp destination popups (#5) and the dungeon-scope fix (#6) on the core (design)

Status: draft for builder check (2026-10-28). Tier: **High** (shared shell and canvas core, async fetch ordering,
hub I/O, subject-source writes through Save). Branch `plan-13-warp-popups` from master `0da6e5b`.

## Intent

Issue #5: double-clicking a warp marker opens the warp's destination map in a closeable popup that can do everything
Map view can (view and edit). Issue #6: dungeon mode lays out every map of a dungeon or city with warp connection lines;
on GBA it loses indoor maps when the user's "Dungeon auto-layout" is off. Both were built once, before the shell and
canvas core existed, as WIP `946bb61` on `issues-5-6-warp-popups` (base `ef248a3`, unverified: its gate collected 0
tests, no live check). This plan rebuilds that behaviour on the Plan 9 shell (`shell/FamilyApp.tsx`) and the Plan 12
`canvas/WorldSurface.tsx`, for both families at once. The WIP is a reference for behaviours and tests, not code to port
line by line (roadmap Plan 13). Its record: `task-reports/warp-dungeon-issues/coordinator.md` on that branch.

## Rulings (user, 2026-10-28; binding)

- **P13-1 Popup = the full map workspace.** The popup holds the same workspace Map view renders (rail, palette, tools,
  events, undo/redo, Save), built once in the shell for GBA and GBC. It replaces both read-only previews
  (`WarpDestinationModal`, `GbcWarpDestinationModal` as used by `adapter.renderWarpPopup`).
- **P13-2 Close returns to the source map.** Opening the popup makes the destination the selected map (through the
  usual unsaved-changes guard). Closing it selects again the map that was selected before it opened.
- **P12-4x Warp alert lifecycle** (recorded in the Plan 12 spec): the "Warp data unavailable" alert counts the maps whose
  latest warp fetch failed and clears itself once none is failing. Built in this plan.

## Design (conductor's calls unless marked as a ruling)

### Popup (#5)

1. **Owner.** FamilyApp owns the popup: state `{ destination, source }`. WorldSurface's double-click on a resolved warp
   marker (`canvas/WorldSurface.tsx` `onDoubleClick`) calls a new prop `onOpenWarpDestination(map)`, which each family's
   `renderWorld`/`renderDungeon` wires to a new `ShellSlots.openWarpDestination`, instead of its local `warpPopup` state;
   `WorldSurfaceAdapter.renderWarpPopup` (`canvas/worldSurfaceAdapter.ts`, implemented in `gba/worldSurface.tsx` and
   `gbc/worldSurface.tsx`) and WorldSurface's `warpPopup` state go away, and the two preview components are deleted if
   nothing else uses them (`WarpDestinationModal`'s backdrop/panel CSS stays: other dialogs reuse it). Unresolved
   markers keep today's alert (`adapter.unresolvedWarpError`). Works in World and Dungeon modes.
2. **Open.** `openWarpDestination(dest)`: ignored while a switch prompt, Save dialog or popup is already open. If
   `dest === selected`, open at once with `source = selected`. Otherwise run the family's `leave` guard (prompt
   Save / Discard / Cancel when the current map is dirty); on go: record `source = selected`, `select(dest)`, open.
   Cancel leaves everything as it was. In-context editing (`ctx`) ends on its own because `selected` changes; it is not
   restored on close.
3. **Body.** The modal renders `runtime.renderMap(slots)` for the destination once `runtime.map.ready` is true for it
   (else the same Loading / Could not load text Map view shows). It is the real Map view workspace, so strokes, events,
   undo, signs, Pokémon Indicator and Save behave exactly as in Map view; no popup-specific edit wrappers (the WIP's
   `trackPopupOperation`/busy bookkeeping is not carried over). The family's `banners` must be visible while the popup
   is open (render them inside the popup too, or above it): a post-save reload error (GBC `switchError`) must not hide
   behind the modal.
4. **Close** (X button, Escape on the popup, backdrop click is NOT a close): wait for `strokeSettled()`, then
   - `source` is null or equals the destination: close; selection stays.
   - otherwise: run the family's `leave` guard back to `source`. Clean → select source and close. Dirty → the existing
     SwitchPromptDialog: Save (SaveDialog; committed → select source, close), Discard (discard → select source, close),
     Cancel (popup stays open, edits intact).
   Escape and close never drop pending or dirty edits without that prompt.
5. **Stacking and keys.** SaveDialog, SwitchPromptDialog, the sign composer and other dialogs opened from the workspace
   paint above the popup and take Escape first (the popup ignores an Escape another dialog handled or that came from a
   text field). Focus: the close button on open; Tab stays inside the topmost dialog; on close, focus returns to the
   element that opened it (the world canvas) if still connected. The world's key handlers stay inert while the popup is
   open (`useWorldContext` already ignores keys while an `aria-modal` element exists; the WorldSurface key handler must
   do the same or never receive focus).
6. **After a save in the popup.** The world behind refreshes that map: `useContextEditing.onCommitted` bumps
   `tileVersions[selected]` when the popup is open as well as in context (one shell path; the popup state is passed in),
   and WorldSurface, on a changed `tileVersions[map]`, drops that map's warp-cache entry (and its in-flight request
   token) besides the tile it already drops, so markers and dungeon lines re-fetch. Other maps' warp entries stay.
   The Dungeon-mode surface receives `tileVersions` too (today only World does).
7. **Mode switch, tree clicks** are blocked by the modal backdrop while it is open; no extra guards needed.

### Dungeon scope (#6)

8. `GET /api/world?scope=dungeon` returns placements computed as if `dungeonAutoLayout` were on, without reading or
   writing a different sidecar (the returned `sidecar` is the saved one). Every other request is unchanged, including
   `?dungeons=`. GBA: `server/src/index.ts` (the WIP's two-line change). GBC: `gbcRoutes.ts`
   `buildGbcWorldPayload` keeps singletons for the scoped request. **Verify first:** a failing server test per family
   with auto-layout saved off and an indoor dungeon member; if GBC turns out unaffected, record the evidence and change
   GBA only.
9. `WorldSurfaceAdapter.useWorld(ledger)` gains a scope argument (`"world" | "dungeon"`), passed by WorldSurface
   from whether it has a `mapFilter` (the World and Dungeon surfaces are separate keyed mounts, so the scope is fixed
   per mount). `useGbaWorld` and `useGbcSurfaceWorld` append `?scope=dungeon` for the dungeon scope. The auto-layout
   switch is hidden in dungeon views (it has no effect there).

### Warp alert (P12-4x)

10. WorldSurface keeps a set of maps whose latest warp fetch failed. A failure adds the map, a success removes it. The
    alert reads `Warp data unavailable for N map(s): <latest error>` while the set is non-empty and disappears when it
    empties. Dismiss, the Warps or Lines toggle and opening a popup clear the set (today's triggers; the double-click handler
    in WorldSurface clears it before calling the shell slot). Stale responses
    (the existing request tokens) never add or remove.

## Goals

- #5 and #6 work in both families, World and Dungeon modes, through the shared shell and WorldSurface.
- Behaviours the WIP tested survive: dirty-switch protection before opening; Escape and close keep pending edits;
  a post-save reload failure is visible, never silent; focus restoration.
- One implementation per behaviour; nothing per family except engine facts (P12-4).

## Non-goals

- Opening a warp from inside the popup (chained popups). Map view's own warp handling is unchanged.
- New post-save Retry UI beyond what Map view has today (the popup shows the same error Map view shows).
- Closing GitHub issues #5/#6 without the user's go-ahead (posting is an outward action).
- Plan 14+ work (GBC Add Event, collision editor), RESUME's deferred lists.

## Anti-goals

- A second edit-session path for the popup. The popup is Map view in a modal, not a fork of it.
- Any write to the real subjects during tests or live checks. Live saves run on scratch copies of the subjects
  (the WIP's `scratch-gba.json` approach); real-subject manifests must match the baselines after the plan.

## Constraints

- Gate baselines: 3,821 pass / 0 fail / 234 files at `0da6e5b`'s code (`e39f372`), `--maxWorkers=4 --minWorkers=1`.
  Typecheck and UI build pass. Subjects: GBA HEAD 26a2e3d1e with 9 porcelain lines (the user's, untouched), manifest
  `0e3237e6ade2`; PerfPlus 81ededbe3 clean, no `.pokemap`, manifest `13a31cb654ff`; pret pokecrystal 3bc8daa41 clean.
- CRLF files; added lines at most 140 characters.
- Tests that pin the old read-only preview are replaced by tests of the new contract, never just deleted.

## Acceptance

- Gate green at or above baseline (new tests added), typecheck, UI build.
- Mutation checks (High tier): each new test fails when its logic is broken (open guard, close-to-source, dirty-close
  prompt, Escape ownership, tile/warp refresh after save, scope=dungeon placements, alert count/clear).
- Live (Playwright, both families, scratch subject copies): open a popup from World and from Dungeon; paint, undo,
  redo, save; close returns to the source map; dirty close shows the prompt and Cancel / Discard / Save each behave;
  Escape inside the Save dialog closes only the dialog; the world tile and dungeon lines refresh after a save;
  with auto-layout saved off, a dungeon with indoor members shows them all with lines; forced warp-fetch failures show
  the count and clear after a successful retry. Real-subject manifests unchanged afterwards.

## Left to the builder

- Component and file names; whether the popup shell reuses `WarpDestinationModal`'s markup with a children slot or a
  new shared component (`shared/`), as long as one exists for both families.
- How the dungeon adapters pass the scope (adapter flag vs. URL built from `mapFilter`).
- Test file layout.
