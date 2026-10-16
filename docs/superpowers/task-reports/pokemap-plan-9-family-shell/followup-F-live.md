# Plan 9F live acceptance (2026-10-15)

Branch `plan-9-family-shell` at `f147388` (+ DESIGN.md). Hub on 5184 (one project at a time), Vite on 5183, headless
Chromium 1208 launched by the step script `scratchpad/live/f9.mjs` (playwright-core). Nothing was saved.

## Hashes (before = after)

| What | sha256 (first 16) |
|---|---|
| GBA game `git status --porcelain` | c1ee1933373fd5e0 |
| PerfPlus `git status --porcelain` | e3b0c44298fc1c14 (clean) |
| GBA `data/layouts/Route29/map.bin` | bcf8388e595fafff |
| PerfPlus `maps/Route29.blk` | c64074bce43b16b1 |

## Results

All 12 runs: no page overflow (`scrollWidth === clientWidth` at 1280 and 1024), two `.palette__column`, left column
128 px, `.edit-rail` 272 px, `.palette__scroll` has no horizontal overflow (271 = 271), rail and page `scrollTop` 0,
`.palette__pinned` top unchanged by Follow hover.

`.palette__grid` measures 271 px, not the plan's 258: it is a block-level flex row filling the scroller; its content is
128 + 2 + 128 = 258 px, left-aligned. No overflow, so not a defect.

| Family / map | Width | View | Fold (first right id, row / rows) | Follow hover: hovered id, scroller scrollTop, inside scroller | Selection |
|---|---|---|---|---|---|
| GBA Route29 | 1280 | Map | 0x280, 80 / 98 (boundary) | 0x275, 730, yes | `2x2 from 0x0`, 4 imgs |
| GBA Route29 | 1024 | Map | 0x280, 80 / 98 | 0x19C, 331, yes | `2x2 from 0x0`, 4 imgs |
| GBA Route29 | 1280 | In-context | 0x280, 80 / 98 | 0x211, 538, yes | `2x2 from 0x0`, 4 imgs |
| GBA Route29 | 1024 | In-context | 0x280, 80 / 98 | 0x183, 283, yes | `2x2 from 0x0`, 4 imgs |
| GBC GoldenrodCity | 1280 | Map | 0x40, 16 / 32 | 0x7f, 38, yes | `0x0`, 1 img |
| GBC GoldenrodCity | 1024 | Map | 0x40, 16 / 32 | 0x7f, 38, yes | `0x0`, 1 img |
| GBC GoldenrodCity | 1280 | In-context | 0x40, 16 / 32 | 0x7f, 38, yes | `0x0`, 1 img |
| GBC GoldenrodCity | 1024 | In-context | 0x40, 16 / 32 | 0x7a, 6, yes | `0x0`, 1 img |
| GBC Route29 | 1280 | Map | 0x40, 16 / 32 | 0x66, 0 (already in view), yes | `0x0`, 1 img |
| GBC Route29 | 1024 | Map | 0x40, 16 / 32 | 0x66, 0, yes | `0x0`, 1 img |
| GBC Route29 | 1280 | In-context | 0x40, 16 / 32 | 0x65, 0, yes | `0x0`, 1 img |
| GBC Route29 | 1024 | In-context | 0x40, 16 / 32 | 0x66, 0, yes | `0x0`, 1 img |

Fold choices: GBA always cuts at the primary/secondary boundary (row 80 of 98: 640 primary ids, 144 secondary). It is the
only candidate (no uniform primary row), so R-F3 picks it however far from the middle: the right column is short.
GBC (128 blocks, 32 rows) cuts at the middle, row 16.

Screenshots: `followup-F-<family>[-<map>]-<width>-<map|ctx>.png`. GBA buildings and the GBC Radio Tower are whole within
one column; GBA's split divider tops the right column.

Script notes: in-context entry (double-click the World viewport centre) missed once per family and was rerun; the
in-context canvas is `canvas.world-canvas__stage`, and the hover scan reads the palette's hovered cell after a 120 ms
settle (reading it immediately gave the previous point's id). The two GBA Map-view rows ran before that fix: their id
is the scan's target, not a read-back label (scrollTop > 0 and the hovered cell inside the scroller still hold).
