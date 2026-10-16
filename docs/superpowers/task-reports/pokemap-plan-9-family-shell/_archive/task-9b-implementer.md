# Task 9b implementer report

Implementer: Codex gpt-5.6-terra (scratch worktree codex-t9b; edit + typecheck only), one resume retry for a failing test. Orchestrator fixed mojibake (`Ã—` -> `×`, 3 lines in copied tests: MapCanvas.test.tsx 1314/1324, GbcMapCanvas.test.tsx 758), ported, gated, committed.

## Codex's own account (unverified claims)
- Hook placement: MapCanvas and GbcMapCanvas directly after `fit`; WorldCanvas/GbcWorldCanvas directly after the combined context/world `fit`. No alternate placement needed.
- In-context fit uses `ZOOM_LEVELS` ([1,2,4]) from components/mapView.ts; claims these equal the overlay's steps. Reuses `fitWithBand` and `worldViewFromMapView` (world/contextView.ts). Passes `bandNative: 0, side: "left"`.
- Copied Fit-test sources: MapCanvas "fit resets zoom and pan after the user has zoomed and panned"; GbcMapCanvas "Fit resets zoom and pan after zoom/pan"; WorldCanvas "Fit world sets zoom/pan to the computed fit for the connected landmasses, not singleton rooms"; GbcWorldCanvas "Fit all fits every placement, including the far-away interior".

## Retry
First run: GBA in-context test failed at its zoom-away step (`keyDown(canvas, "+")` does not zoom GBA in-context; readout stayed 100%). Retry: zoom-away steps now `fireEvent.wheel(stage, deltaY -100)` on the overlay map stage, assertions compare against the fitWithBand-derived readout (`not.toBe(fitted)` after zoom-away, `toBe(fitted)` after F / Fit).

## Gate
Targeted 8 files: 422 pass after retry. Full: 175 files, 2761 pass, 0 fail (= 2745 + 16). typecheck 0, build 0. `grep "Fit to screen" test/gbc/Root.test.tsx`: none.

## Removed-line accounting (test files)
- packages/ui/test/App.test.tsx: 2 removed
    -      fireEvent.click(screen.getByRole("button", { name: "Fit world" }));
    -      fireEvent.click(screen.getByRole("button", { name: "Fit world" }));
- packages/ui/test/AppContextEdit.test.tsx: 0 removed
- packages/ui/test/MapCanvas.test.tsx: 0 removed
- packages/ui/test/WorldCanvas.test.tsx: 1 removed
    -    fireEvent.click(screen.getByRole("button", { name: "Fit world" }));
- packages/ui/test/gbc/GbcAppContext.test.tsx: 2 removed
    -    expect((screen.getByRole("button", { name: "Fit all" }) as HTMLButtonElement).disabled).toBe(true);
    -    expect((screen.getByRole("button", { name: "Fit all" }) as HTMLButtonElement).disabled).toBe(true);
- packages/ui/test/gbc/GbcMapCanvas.test.tsx: 0 removed
- packages/ui/test/gbc/GbcWorldCanvas.test.tsx: 2 removed
    -    fireEvent.click(screen.getByRole("button", { name: "Fit all" }));
    -    fireEvent.click(screen.getByRole("button", { name: "Fit all" }));

Reasons: `Fit world`/`Fit all` queries -> `Fit`: Fit label unified (R5). GbcAppContext in-context disabled===true -> false: R5: in-context Fit fits the context map.

## Fix round 1 (codex resume)

    Addressed all four findings in seven named files:
    
    1. `AppContextEdit.test.tsx:387` and `gbc/GbcAppContext.test.tsx:599`: both tests now fit at 2× and assert actual `drawImage` pan within 1 px, plus drawn dimensions, after both F and Fit.
    2. `shared/useWorldContext.ts:9`, `WorldCanvas.tsx:1451`, `GbcWorldCanvas.tsx:950`: replaced duplicated fitting with shared registration of the map canvas’s own Fit callback.
    3. `MapCanvas.tsx:452`, `GbcMapCanvas.tsx:446`: reuse their existing composite dimensions directly. Test inputs come from map payload fixtures, with explanatory comments.
    4. `shared/useWorldContext.ts:68`: Fit requires placement, origin, and a registered callback. Added encounter-band and viewport-fallback comments in both map canvases.
    
    The tests should kill both mutations: fitting the whole world produces the wrong zoom/dimensions; pan `-99999` fails the drawn-position assertions. These mutations were reasoned through, not run.
    
    `npm.cmd run typecheck` passed. No Vitest run or commit.
Orchestrator gate: AppContextEdit + GbcAppContext 38/38; full 175 files, 2761 pass, 0 fail; typecheck 0; build 0. Mutations reasoned by Codex, not run.
