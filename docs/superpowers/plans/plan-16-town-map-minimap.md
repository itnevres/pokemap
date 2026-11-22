# Plan 16: Town-map minimap (#8)

A minimap in the lower-right of the world view, drawn from the town map art, highlighting the area in view. World coordinates map to region-map squares through map sections; the highlight follows pan and zoom; both families through the canvas core.

## Status

Open. Not started; needs a spec first.

## Depends on

- Plan 15a's loaders (D13; D24b), not its tools.
- Plan 14C row 14C-0: warp fetch, encounter fetch and lens overlays extracted from `canvas/WorldSurface.tsx` as hooks (D24c).
- Risk: medium. The world-to-region mapping is approximate (the world layout is PokeMap's, the town map is the game's); the spec decides how a map with no section renders.

## Binding decisions

- D12, D13, D24b, D24c (text in [decisions.md](decisions.md)).

## Traps and pitfalls

1. **Never remount the world canvas to add the minimap** (LESSONS, React: "Never remount a heavy canvas to add chrome around it"). The minimap is mounted in every state and drawn on its own canvas from a view ref; a highlight held in React state re-renders the surface on every pan frame (an open lens list already re-renders with every pan frame).
2. **The two families map to the town map differently.** A GBA map names a section, and sections are cells; a Crystal map names a landmark (`data/maps/maps.asm`, fourth argument of `map`), and a landmark is a point. The GBA highlight is a set of cells; the GBC highlight is a set of points or a box around them.
3. **One view can span regions.** The GBA subject has three region layouts, and Kanto and Johto are separate world components in Crystal (RESUME, GBC facts). The spec says which art shows when the view spans two.
4. **It needs Plan 15a's loaders only,** not Plan 15b's tools.

## Questions

**Open, for the spec:** a map with no section; a view spanning regions; whether a click on the minimap moves the view (recommendation: yes); whether it shows in Dungeon mode (recommendation: no); its size and a toggle.

## Subtasks

| Id | What | Files | Tier | Verify | After |
|---|---|---|---|---|---|
| 16-2 | World-to-town-map mapping, one pure function per family | new `packages/core/src/world/regionView.ts`, `packages/core/src/gbc/world/regionView.ts` and tests | High (numeric oracle) | `npx vitest run --no-file-parallelism packages/core/test/world packages/core/test/gbc` | Plan 15 loaders |
| 16-3 | Minimap component and its adapter members | new `packages/ui/src/canvas/Minimap.tsx`; `canvas/{WorldSurface.tsx,worldSurfaceAdapter.ts}`, `gba/worldSurface.tsx`, `gbc/worldSurface.tsx` | High (canvas core) | `npx vitest run --no-file-parallelism packages/ui/test/canvas` | Plan 14C row 14C-0, 16-2 |
| 16-4 | Live acceptance, both families | report | - | live report | 16-3 |
| 16-5 | Final review | - | - | reviewer per the `delegate` skill | 16-4 |

## Acceptance

- The highlight follows pan and zoom in both families, and the world canvas is never remounted to add the minimap (trap 1).
- Live acceptance in both families (row 16-4).
