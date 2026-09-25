# PokeMap UI — Design System

Established in Task 20 (`packages/ui`), for Plans 2–4 to read rather than
re-derive. Brief this was designed against: a desktop map editor for a
1,209-map ROM hack, wrapped in Electron, used for hours at a stretch, mostly
at night. The user is a decomp hacker, not a consumer — the audience is one
person staring at metatiles, not a landing page visitor. Dense information
density and a canvas that dominates the screen both win over any amount of
visual flourish.

Produced with `frontend-design` (aesthetic direction, motion/spacing
judgement) and `ui-ux-pro-max` (`--design-system` and domain searches against
`style`, `color`, `typography`, `ux` for "developer tool / IDE / dense
dashboard"). The tool's own default match for "map" data pulled a
consumer-marketplace pattern (search-hero, vibrant block colours) — wrong
audience entirely, discarded in favour of its "Data-Dense Dashboard" /
"Developer Tool IDE" / "Developer Mono" results, which is what follows.

## Aesthetic direction

**Instrument-panel, not showroom.** Porymap and every serious map/level editor
converges on the same shape for a reason: a tool you stare at for hours needs
to disappear into the work. No hero sections, no illustrative colour, no
motion for its own sake. Colour is reserved for meaning (selection, warning,
event kind) so it stays legible instead of decorative. The one place this
project gets to be *interesting* rather than merely neutral is monospaced
type used with intent — hex ids, coordinates and counts get a distinct
typographic voice from labels and prose, because that split *is* the
information architecture: "this is data, this is chrome."

## Colour tokens

Dark is the primary/default theme — this is a night-work tool — but light is
first-class, not an afterthought, because Electron will happily launch into
whatever OS theme is active.

```css
:root {
  /* Dark (default) */
  --bg-canvas: #0a0e16;       /* the canvas viewport itself: darkest surface,
                                  so rendered map art reads with maximum
                                  contrast and never fights a lighter frame */
  --bg-app: #0f172a;          /* app chrome background */
  --bg-panel: #161f33;        /* sidebar / inspector panel surface */
  --bg-panel-raised: #1e293b; /* list rows, cards, toolbar */
  --bg-hover: #253552;
  --bg-selected: #2c4470;
  --border: #293b5c;
  --border-strong: #3d5480;

  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --text-on-accent: #071019;

  --accent: #22c55e;          /* selection, primary action — "run green" */
  --accent-strong: #4ade80;
  --warn: #f59e0b;
  --danger: #ef4444;

  /* Overlay semantics (Task 21+): each overlay kind keeps one hue for its
     lifetime across the whole app — grid, collision, elevation, events. */
  --overlay-grid: rgba(255, 255, 255, 0.16);
  --overlay-collision: rgba(220, 40, 40, 0.55);
  --overlay-elevation-low: #3b82f6;
  --overlay-elevation-high: #f97316;
  --event-object: #3ccb5a;
  --event-warp: #f0be28;
  --event-coord: #c850f0;
  --event-bg: #3ca0f0;

  /* Encounter gutter (Task 28): one hue per wild-encounter method, its own
     small semantic group -- not a reuse of the event-kind colours above,
     which already mean something else (object/warp/coord/bg event) and
     could co-occur on screen with these in principle. Not overridden in
     light mode, matching the event-kind and elevation tokens' own
     precedent just above: these sit on small swatches/borders, not body
     text, so a single value clears contrast in both themes. */
  --encounter-land: #65a30d;
  --encounter-water: #06b6d4;
  --encounter-rock-smash: #a8763c;
  --encounter-fishing: #6366f1;

  /* Species spotlight (Task 29): darkens every non-matching map so the
     hits read as lit by contrast, not by a colour of their own. Overridden
     in light mode below, matching --overlay-grid/--overlay-collision's own
     precedent -- a plain rgba() literal with no light-mode value was this
     file's only unthemed overlay colour until this task's own review
     caught it. */
  --overlay-spotlight-dim: rgba(4, 8, 16, 0.72);

  /* Multi-select move: selection outlines and the live marquee rect share
     one cyan hue, distinct from every other overlay token above (accent
     green, warn amber, danger red, elevation blue/orange) so a selected
     map's outline never reads as a lens tint or a conflict badge. */
  --overlay-selection: #22d3ee;

  /* Dungeon connection lines (Feature C): deterministic per-connection
     colour, assigned by a stable sort order (source map name, then the
     warp's own index within it), not randomised or hashed -- so the same
     connection reads the same colour across sessions without persisting
     anything (spec §5.5). Eight visually distinct hues, none reused from
     any other overlay token above (selection cyan, conflict/danger red,
     dive/emerge blue/orange, warn amber) so a connection line never
     misreads as one of those existing meanings. */
  --connection-1: #e879f9;
  --connection-2: #34d399;
  --connection-3: #fb923c;
  --connection-4: #60a5fa;
  --connection-5: #facc15;
  --connection-6: #f472b6;
  --connection-7: #2dd4bf;
  --connection-8: #a78bfa;

  --focus-ring: #60a5fa;
}

[data-theme="light"] {
  --bg-canvas: #e2e8f0;       /* still the darkest of the light-mode surfaces,
                                  same reasoning as dark: art over chrome */
  --bg-app: #f8fafc;
  --bg-panel: #f1f5f9;
  --bg-panel-raised: #ffffff;
  --bg-hover: #e2e8f0;
  --bg-selected: #dbeafe;
  --border: #cbd5e1;
  --border-strong: #94a3b8;

  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #64748b;
  --text-on-accent: #052e16;

  --accent: #16a34a;
  --accent-strong: #15803d;
  --warn: #d97706;
  --danger: #dc2626;

  --overlay-grid: rgba(15, 23, 42, 0.14);
  --overlay-collision: rgba(200, 30, 30, 0.5);
  /* Same near-black-slate darkening approach as dark mode's own value, just
     proportioned for a light background -- --text-primary's own dark value
     (#0f172a) at high opacity, not literal black. */
  --overlay-spotlight-dim: rgba(15, 23, 42, 0.65);
  --overlay-selection: #0891b2;
  --focus-ring: #2563eb;
}
```

`--connection-1` through `--connection-8` (Feature C): the dungeon
connection-line palette, cycled by index (`PALETTE[i % 8]`) over a stable,
deterministically-sorted connection order -- see WorldCanvas.tsx's own
`connectionLines` memo.

Colour is never the only signal: every overlay kind above pairs with a
distinct shape or label in its legend (Task 21), not colour alone, for
colour-blind users and for grayscale screenshots in bug reports.

## Typography

**Developer Mono pairing**: JetBrains Mono for anything that is *data* —
map/group names, hex ids, coordinates, counts, the `layout_version` figure —
and IBM Plex Sans for UI chrome — button labels, section headers, empty-state
prose. The split is load-bearing: a user scanning the tree for `0x3F` vs
`Route29` should feel the difference between an identifier and a label
without reading either.

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

--font-ui: "IBM Plex Sans", system-ui, sans-serif;
--font-data: "JetBrains Mono", ui-monospace, "Cascadia Code", monospace;
```

Type ramp (dense UI: nothing here is a marketing headline, so the whole ramp
sits low):

| Token | Size | Weight | Use |
|---|---|---|---|
| `--text-2xs` | 11px | 500 | counts, badges |
| `--text-xs`  | 12px | 400 | secondary labels, hints |
| `--text-sm`  | 13px | 400 | default body / tree rows / table cells |
| `--text-base`| 14px | 500 | panel section headers |
| `--text-lg`  | 16px | 600 | page/app title only |

13px as the *default* (not 16px) is a deliberate departure from the general
"16px minimum for mobile body text" web guideline — this is a desktop-only,
mouse-and-keyboard, information-dense tool where Porymap's own UI runs this
small, and the audience is staring at it on a desktop monitor, not a phone.
Line height 1.4 throughout (not 1.5–1.75): dense list rows, not prose.

## Spacing scale

4px base unit, because 16px metatiles and 16px grid cells are the atomic unit
of every layout this tool will ever draw — a 4px scale divides them evenly at
every step, an 8px-only scale would not give a size between "none" and "half
a tile."

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;
--space-12: 48px;
```

Panel padding defaults to `--space-3` (12px); list rows default to
`--space-2` vertical / `--space-3` horizontal — dense enough that 1,209 map
names don't force excessive scrolling, loose enough that a 44px+ *click*
target still exists on the row as a whole even though the visible padding is
tighter (the row, not just the text, is the hit target).

## Layout shape

```
┌─────────────────────────────────────────────────────────┐
│ toolbar (--bg-panel-raised, --space-2 padding, 40px tall)│
├───────────────┬─────────────────────────────────────────┤
│               │                                         │
│  map tree     │              canvas                     │
│  (--bg-panel) │           (--bg-canvas)                  │
│  260px fixed, │     flex: 1, no upper bound,             │
│  resizable    │     min-width: 480px                     │
│  240–420px    │                                         │
│               ├─────────────────────────────────────────┤
│               │ status strip (--bg-panel-raised, 28px)   │
└───────────────┴─────────────────────────────────────────┘
```

**What the canvas is owed.** The canvas is the reason this tool exists —
every other panel is furniture around it. Concretely that means:

- The canvas region's width is `flex: 1` with no max-width; every other panel
  (tree, and whatever Task 21+ adds — an inspector, a metatile palette) is
  the one that gets a fixed or resizable-with-limits width, never the canvas.
- The canvas never shrinks to fit its content at a fractional CSS pixel — it
  gets a whole-pixel size from its flex box and then draws at an *integer*
  device-pixel zoom (1×/2×/4×) inside that box, because a blurred metatile
  misrepresents the art. `image-rendering: pixelated` and nearest-neighbour
  canvas scaling are non-negotiable (Task 21).
- Collapsing the tree (a later task, not this one) must never resize or
  reflow the canvas's internal render — only the layout box around it. The
  canvas owns its own zoom/pan state independent of how much screen it is
  currently given.
- The status strip is part of the canvas's contract, not the tree's: it
  always shows the current layout's `layout_version` and resolved split
  (Task 21 §9) because getting that number right is this entire project's
  reason to exist, and it must never be more than a glance away from the art
  it describes.

## Motion

Minimal and functional only: 150ms ease-out on hover/focus state changes,
nothing else animates by default. `<details>` open/close uses the browser's
native behaviour (instant) rather than a custom expand animation — with up to
28 groups and 1,209 rows, an animated reflow on every toggle would be a
performance tax during exactly the interaction (browsing the tree) this
screen exists to make fast. Respect `prefers-reduced-motion` throughout.

## Accessibility baseline

- Every interactive control reachable by keyboard in visual tab order; no
  keyboard traps.
- Visible focus ring (`--focus-ring`, 2px, `outline-offset: 2px`) on every
  focusable element — never `outline: none` without a replacement.
- Colour is never the sole carrier of meaning (see overlay note above).
- Contrast: body text against panel/app backgrounds targets at least 4.5:1 in
  both themes; the palette above was chosen to clear that bar directly
  rather than relying on opacity tricks that quietly fail it.
- Selection state (`aria-current`) is expressed in the DOM, not just via a
  CSS class, so assistive tech gets it for free — established by `MapTree`
  in this task and expected of every later selectable-list component.

## What this task actually built

`MapTree` renders `data-tree` as an accented list of `<details>` sections (one
per group, in `groupOrder`), a `data-tree__filter` text input that narrows
maps by substring match (case-insensitive, name only — see the plan-review
notes in Task 20's report for why group-name matching is deliberately out of
scope here), and a "no maps match" empty state per spec §9 rather than a
silently blank panel. Colours/spacing/type above are wired via CSS custom
properties in `src/App.tsx`'s stylesheet import; components consume the
tokens, never hard-coded hex.
