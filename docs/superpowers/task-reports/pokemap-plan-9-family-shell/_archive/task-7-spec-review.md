# Task 7 spec-compliance review (17be80b..e42cc2f)

### Spec Compliance
- ✅ EditingWorkspace.tsx:~22 rail only while active and side non-null: `{active && side ? <div className="edit-rail">{side}</div> : null}`; canvas slot and `.app__map-editing-body` unchanged in position (no remount). Covered by AppContextEdit (node identity + /api/world count) and GbcAppContext.
- ✅ MapEditingWorkspace.tsx side: collision palette (tool === collision) -> MetatilePalette (`data &&`, ungated by tool) -> EventInspector. Order asserted by new rail-order test.
- ✅ Palette no longer tool-gated; onSelect is plain setCurrentStamp (no tool switch). Asserted (activeToolKind null, setActiveToolKind not called).
- ✅ GBA in-context editing gets the rail (AppContextEdit new test: .edit-rail has .metatile-palette + .event-inspector, no .app__metatile-strip, same canvas node, same body, /api/world count unchanged).
- ✅ GbcMapEditing.tsx: `.gbc-map-editing__rail` wrapper dropped (fragment of palette + inspector); edit-state lifetimes and `error` banner location unchanged (in `top`).
- ✅ Banners: eventOpError / signAddedMessage stay in `top` of MapEditingWorkspace (diff only removed strips).
- ✅ styles.css: `.edit-rail` 260px, flex column, min-width 0, min-height 0; `.edit-rail > .collision-palette` min-width 0; `> .metatile-palette` flex 1 1 0 + min-width/height 0 (own overflow-y:auto scrolls); `> .gbc-metatile-palette` same; `> .event-inspector` width auto, max-height 50%, min-width 0. Strip rules and `.gbc-map-editing__rail` removed.
- ✅ Leftover grep (src + test + docs excl. reports): only negative assertions (AppContextEdit:163, MapEditingWorkspace.test:159, stylesContext.test:53) and plan text. No src leftovers.
- ✅ Review Focus 3: rail fixed 260px, flex:0 0 auto, min-width 0, children min-width 0, inspector <= 50%; CSS pinned by stylesContext test. Collision swatch strip wraps (flex-wrap), cannot widen. No sideways scroll expected at 1024 with tree + rail.
- ✅ No jest-dom matchers in added tests.
- ⚠️ Not run by me (instructed); relying on gate 2725/0/173.

### Removed test lines
| file | line (old) | reason | verdict |
|---|---|---|---|
| MapEditingWorkspace.test.tsx | title "renders the collision strip only while..." | strip -> rail (D4) rename | OK |
| same | `.app__collision-strip` not null | -> `.edit-rail > .collision-palette` | OK |
| same | `.app__collision-strip` null | -> `.edit-rail > .collision-palette` | OK |
| same | title "the metatile strip is keyed on..." | strip -> rail (D4) rename | OK |
| same | `.app__metatile-strip img` selector | -> `.edit-rail .metatile-palette img` | OK |
| MapEditingWorkspaceActive.test.tsx | CHROME `.app__metatile-strip` | -> `.edit-rail` | OK |
| GbcAppContext.test.tsx (x3) | `.gbc-map-editing__rail` | -> `.edit-rail` (wrapper -> shared rail) | OK (same assertions, same positions) |
| shared/EditingWorkspace.test.tsx | body children expectation ["canvas","side"] via tagName | side now wrapped; retarget to ["canvas","edit-rail"] + added `.edit-rail > [data-testid=side]` | OK (orchestrator-ruled; strictly stronger) |
| AppContextEdit / stylesContext | none removed | additions only | OK |

### Issues
Critical: none.
Important: none.
Minor:
- The new AppContextEdit test duplicates most of the preceding in-context test's tail assertions (context bar, tree aria-current, World pressed, chromeless overlay); harmless, not a spec issue.
- Cosmetic: `.edit-rail > .collision-palette` has no max-height; swatch strip wraps so height is bounded by content (fine).

### Assessment
Spec-compliant. All D4 constraints (rail structure/order/width, removals, min-width 0, inspector <= 50%, un-gated GBA palette with stamp-only pick, no remount, banner ownership, tests moved with reasons) are met. APPROVE.
