# Task 11 review (d4fada7..9d117df, packages/ui/DESIGN.md)

Spec ✅ | Quality Approved | C0 I0 m1

Brief items: all present (Edit layout subsection with rail, palette pick, toolbar, shortcuts, hover-link, Follow hover, Fit bullets; new rows for useFollowHover/FollowHoverSwitch, shortcutGuard/useFitShortcut, FamilyApp/adapter, useDungeonFilter; App/GbcApp -> FamilyApp; EditingWorkspace slots; "Still per family" rewritten; first "canvas is owed" bullet names the rail).
Diagram: fenced block diffed against the spec's D4 block, identical.
Diff scope: 36+/10-, only those hunks; no unrelated DESIGN.md change.

Claims checked against HEAD:
- Module consumers: useFollowHover/FollowHoverSwitch used by MetatilePalette + GbcMetatilePalette; shortcutGuard by Toolbar (shared by GBC via GbcMapEditing) and useFitShortcut; useFitShortcut by MapCanvas/WorldCanvas/GbcMapCanvas/GbcWorldCanvas; useDungeonFilter, useStrokeChain, useContextEditing, useBeforeUnloadGuard consumed by shell/FamilyApp.tsx; EditingWorkspace used by MapEditingWorkspace and GbcMapEditing. True.
- Rail: styles.css .edit-rail 260px, collision palette first, metatile palette flex 1 1 0, inspector max-height 50%, min-width 0 on children; collision palette rendered only when activeToolKind === "collision"; removed class names have no non-test hits. True.
- Palette pick: both families' onSelect sets only the stamp. True.
- Toolbar: icons from toolIcons.tsx, title `${label} (${key})` else unavailableTitle (default "Not yet available"), Undo/Redo titles exact. True.
- Hover-link: metatile-palette__cell--hovered exists; GBC uses gbc-metatile-palette__cell--selected as its hover token pair. True.
- Follow hover: hook in both palettes, key pokemap.palette.followHover. True.
- Fit: all four buttons labelled Fit with title "Fit to screen (F)"; no "Fit world"/"Fit all" left; World canvases register the chromeless map canvas's fit via useContextMapFit/ContextMapFit/registerFit in useWorldContext, fitEnabled gates the button. True.

Minor (m1): the Fit bullet says "Map, World, Dungeon" views; I did not trace the Dungeon view's Fit separately (copied from the Global Constraints, so spec-faithful). No action.
