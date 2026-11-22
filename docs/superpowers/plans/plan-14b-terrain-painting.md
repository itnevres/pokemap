# Plan 14B: Terrain painting

Tileset-specific named brushes with thumbnails and editable tile assignments. First phase: water and paths with centers, inner/outer corners, narrow sections and junctions; painting and erasing repair neighboring edges, show a preview and form one undoable stroke. Define movement permissions per engine rather than silently retaining incorrect collision. Later phase: forests and cliffs with explicit elevation, directional-ledge and terrain-transition rules; that phase is specced and verified separately.

## Status

Open. Not started; needs a spec first.

## Depends on

- Plans 12, 14 and 14A (D17).
- Risk: high (shared canvas, terrain rules and collision semantics). Reuse brush selection and previews without making a large stamp library a prerequisite.

## Binding decisions

- D17, D23 (text in [decisions.md](decisions.md)).

## Traps and pitfalls

1. **GBC painting cannot set movement permissions.** A GBC block's collision is four `tilecoll` entries in the tileset's `*_collision.asm`, shared by every map (`specs/2026-11-08-pokemap-plan-14-2-block-editor-design.md`, "Data"); a GBA cell carries its own collision and elevation (`core/src/edit/paint.ts:3-8`). "Define movement permissions per engine" therefore means: a GBA brush role sets collision and elevation, a GBC brush role only chooses a block. The spec writes both rules down.
2. **Ledges and water are block properties in both families.** GBA ledges are metatile behaviours in the tileset attributes; GBC ledges are collision types (`HI_NYBBLE_LEDGES`, PerfPlus `constants/collision_constants.asm:127`). The cliff phase cannot paint a ledge onto a block that does not have it; it needs blocks made in the block editor first.
3. **A tileset may not have every transition block.** Roles (centre, edges, inner and outer corners, narrow, junction) map to blocks that exist only if the tileset's author drew them. A brush with missing roles needs a stated fallback, or painting produces holes that no test on a complete fixture shows.
4. **The neighbour-mask table is a hand-derived oracle.** That is a High trigger in `CLAUDE.md`: the fixtures are derived twice, independently, and the tests are mutation-checked.
5. **Repairs touch cells the pointer never crossed.** A stroke is begin, queued applies, end (`ui/src/shared/useStrokeChain.ts`), and the hub applies a stamp to targets. The repair is one pure core function called by both hubs inside paint apply, so one implementation serves both families, the preview and undo.
6. **The preview needs that core function in the browser.** The UI imports core by deep path and cannot bundle a module that imports `node:fs`; the terrain module stays free of node imports.
7. **Brush definitions are tileset data.** They have the same storage and identity questions as Plan 14A's patterns (files, not names; where the file lives).

## Questions

**Open, for the spec interview:**

1. Who authors a brush's role-to-block table: the user in an editor, or shipped defaults for the stock tilesets. Recommendation: the user, in a small table editor, with one worked example per family.
2. The role set for phase one: 13 roles (centre, four edges, four outer and four inner corners) or the full 47. Recommendation: 13 plus the narrow and junction cases the roadmap names.
3. What erasing paints (a per-brush base block). 
4. Whether a brush overwrites cells under events. Recommendation: yes; events are not terrain.
5. GBA: the collision and elevation each role writes, and whether the user can edit them per role.
6. Which tilesets are the acceptance fixtures in each subject.

## Subtasks

Provisional phases; each is split into subtasks in the plan the spec produces.

- 14B-1 core terrain model and mask fixtures (High, oracle).
- 14B-2 repair inside paint apply in both hubs (High, shared engine).
- 14B-3 brush storage and routes, one module (Medium).
- 14B-4 brush table editor in the rail (Medium).
- 14B-5 brush tool and preview on the map surface (High, canvas core).
- 14B-6 live acceptance.
- 14B-7 final review.

The cliff phase is a separate spec. Each phase is split to subtasks in the plan the spec produces.

## Acceptance

- The phase-one shapes (centres, inner and outer corners, narrow sections, junctions) and erase repairs work in both families.
- Live acceptance (phase 14B-6).
