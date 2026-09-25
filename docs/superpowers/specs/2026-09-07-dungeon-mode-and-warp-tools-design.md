# Dungeon mode and warp tools — Design Spec

**Date:** 2026-09-07
**Status:** Approved
**Target repo:** `C:\Programming Projects\PokeMap`
**Builds on:** Plan 1 (merged to `master`) and the already-approved
`2026-09-07-world-view-usability-design.md` plan (not yet executed at the time
this spec was written — this spec assumes it lands first, since Feature C's
canvas reuses that plan's multi-select/jump plumbing where convenient, though
nothing here hard-depends on it).

---

## 1. Goal

Three more additions, surfaced after reviewing the already-approved world-view
plan against a reference image showing warp connectivity drawn as lines
across a stitched dungeon:

1. **Default population + search grey-out** — the world view currently draws
   all 1,209 maps (or none of the unplaced singletons, via the existing
   dungeon-auto-layout toggle). Most `MAP_TYPE_INDOOR` maps (695 of 1,209 —
   houses, small interiors) read as noise at world scale. Hide them by
   default; keep them fully reachable via search + drag.
2. **Warp toggle + destination popup** — a toggle showing every warp among
   currently-visible maps as a marker; double-click one to preview its
   destination in a real, interactive embedded map view.
3. **Dungeon tab** — a third mode. Named, user-curated groups of maps (not
   auto-detected), viewed on a scoped canvas with warp-connection lines drawn
   between exact warp tiles, matching the reference image.

This is a bigger unit of work than the already-approved plan and is scoped as
its own plan once this spec is approved — not appended to that one.

---

## 2. Real data behind this spec

Measured directly against the subject decomp before writing this (not
assumed): `map_type` per map, from `data/maps/<name>/map.json`:

| `map_type` | count |
|---|---|
| `MAP_TYPE_INDOOR` | 695 |
| `MAP_TYPE_UNDERGROUND` | 260 |
| `MAP_TYPE_ROUTE` | 144 |
| `MAP_TYPE_TOWN` | 31 |
| `MAP_TYPE_SECRET_BASE` | 24 |
| `MAP_TYPE_CITY` | 20 |
| `MAP_TYPE_OCEAN_ROUTE` | 15 |
| `MAP_TYPE_UNDERWATER` | 14 |
| `MAP_TYPE_NONE` | 6 |

`mapType` is already parsed by `packages/core/src/load/maps.ts` (`MapData.mapType`)
but not currently exposed anywhere in the world API.

---

## 3. Feature A: Default population + search grey-out

### 3.1 Visibility rule

A new, independent-of-dungeon-auto-layout concept: **map-kind visibility**.

- **Hidden by default:** `MAP_TYPE_INDOOR`, `MAP_TYPE_NONE`.
- **Shown by default:** `MAP_TYPE_TOWN`, `MAP_TYPE_CITY`, `MAP_TYPE_ROUTE`,
  `MAP_TYPE_OCEAN_ROUTE`, `MAP_TYPE_UNDERGROUND`, `MAP_TYPE_UNDERWATER`,
  `MAP_TYPE_SECRET_BASE`.

This is orthogonal to the existing `dungeonAutoLayout` toggle, which still
controls whether singleton (no-planar-connection) maps get warp-clustered and
shown at all. The two combine: a map draws by default only if it has a real
placement (today's rule) **and** its type isn't in the hidden set.

**A map the user has ever manually dragged in (present in
`sidecar.manualPlacements`) always shows**, regardless of type — dragging it
in is the deliberate override, and it must survive a reload the same way any
other manual placement already does.

### 3.2 Wire changes

`/api/world`'s per-placement payload gains `mapType` (cheap — already in
memory via `project.map(name).mapType` when `buildWorld` walks the corpus).
This is a client-side filter, not a server-side removal: a hidden map keeps
its real computed position (already correct if it's part of a landmass, e.g.
a house next to its town), it just isn't drawn or fetched by default — so
revealing it later needs no recomputation.

### 3.3 Search grey-out and drag-on

The shared sidebar map list (already wired for World-mode jump by the
approved plan) gains a third visual state in World mode: entries not
currently drawn (filtered by type, or genuinely unplaced) render greyed out.
Greyed entries are `draggable`, reusing the exact drag-and-drop mechanism the
existing unplaced side rail already implements (`onDragStart` sets
`text/plain` to the map name; `WorldCanvas`'s existing `onDropOnCanvas`
already accepts a drop from anywhere, not just the rail).

**Click vs. drag on a greyed entry, deliberately different:**

- **Click** jumps to it (Task 2 of the approved plan) if it has a real
  placement, and additionally reveals it *temporarily* for that view (a
  session-local, unpersisted "show this one anyway" — otherwise panning to
  an invisible map is a confusing no-op). This temporary reveal does not
  survive a reload or leaving World mode; it's a look, not a commit.
- **Drag** onto the canvas is the deliberate, persistent add — same
  `POST /api/world/placement` every other drag already uses, which is what
  makes it survive a reload per §3.1's manual-override rule.

A map with no real placement at all (the "off" side of the existing dungeon
toggle) has nowhere to jump to; clicking it does nothing, matching the
already-approved plan's own stated edge case for jump-to-map. Dragging it
still works — `onDropOnCanvas` already handles an unknown-size drop via
`sizeByMap`.

---

## 4. Feature B: Warp toggle + destination popup

### 4.1 Toggle

A new World-view toolbar toggle, same visual family as the existing
dungeon-auto-layout switch and conflict/dive/emerge legend. When on, every
warp belonging to a **currently-visible (culled)** placement draws as a
marker at its exact tile position — consistent with how every other overlay
in this app already scopes to the culled `visible` set, not all 1,209 maps
at once.

### 4.2 Data

Warp events aren't in `/api/world`'s payload today (only placement geometry
is). New route: `GET /api/warps/:map` returning that map's `warpEvents`
(`x`, `y`, `destMap`, `destWarpId`) — already fully parsed by
`packages/core/src/load/maps.ts`, just not exposed. Fetched lazily per
visible map, cached by ref — the exact same shape `WorldCanvas`'s existing
encounter-fetch effect already uses for `/api/encounters/:map` (placeholder
written synchronously, cache-by-ref, version-bump-on-arrival). This same
route is reused by Feature C's connection lines (§5.4) — one warp data path,
two consumers.

### 4.3 Double-click → popup

Only active while the warp toggle is on (a marker must be visible to
double-click it). Hit-tests against the currently-drawn warp markers; on a
hit, opens a modal containing a **real, interactive embedded map view** of
`destMap` — reusing the existing `MapCanvas` component as-is (it already
does its own data fetching given just a map name), not a static image. A
close **×** button in the modal's corner returns to the world view; the
underlying world stays exactly as it was (pan/zoom/selection untouched).

---

## 5. Feature C: Dungeon tab

### 5.1 Data model

New file: `.pokemap/dungeons.json` — a separate concern from `world.json`
(layout/placement state), kept in its own file for the same single-
responsibility reason `sidecar.ts` and `resolve.ts` are already split apart.
Same I8-compliant `.pokemap/` scope every other PokeMap write already uses.

```ts
interface DungeonsFile {
  version: 1;
  dungeons: Array<{ id: string; name: string; maps: string[] }>;
}
```

A map may belong to more than one dungeon (no exclusivity constraint) — real
decomps sometimes share an entrance room between what a player would call two
different "dungeons," and enforcing exclusivity would be arbitrary policy
this tool has no basis to assert.

Full CRUD: create, rename, edit membership, delete. No versioning/history —
matches this tool's existing sidecar, which is also just "the current state,"
not an edit log.

### 5.2 New core: `warpConnectedMapsFrom`

A small, new, targeted function distinct from `warpGraph.ts`'s existing
corpus-wide clustering (`autoLayoutUnplaced`'s union-find groups *every*
unplaced map at once): given one seed map, a plain BFS over `warpEvents`
returns every map transitively reachable by warp from it. This is what
"create a new dungeon" auto-suggests from a single picked seed map, which the
user then adjusts by hand.

### 5.3 Server routes

- `GET /api/dungeons` — list.
- `POST /api/dungeons` — create. Body `{ name: string, seedMap?: string, maps?: string[] }` —
  `seedMap` triggers the warp-BFS suggestion server-side (so the client
  doesn't need its own copy of that traversal); `maps` lets the client submit
  an already-adjusted list directly (e.g. after the user edited the
  suggestion).
- `PATCH /api/dungeons/:id` — rename and/or replace `maps`.
- `DELETE /api/dungeons/:id`.

### 5.4 Viewing a dungeon

`Mode` gains a third value, `"dungeon"`. The dungeon canvas is **not** a
second implementation — `WorldCanvas` gains an optional prop restricting
which maps it draws/culls/interacts with:

```ts
interface WorldCanvasProps {
  jumpToMap?: string | null;
  jumpToken?: number;
  /** When set, only these maps are ever drawn, fetched, or hit-testable —
   *  everything else in WorldCanvas (pan/zoom/drag/multi-select/warp
   *  toggle) behaves exactly as in the full world view, just scoped. */
  mapFilter?: Set<string> | null;
}
```

A dedicated sidebar (not the shared map list) lists saved dungeons by name,
plus "**+ New Dungeon**" (opens the seed-map picker → adjustable suggested-map
list → save).

Because the dungeon canvas IS `WorldCanvas` (just filtered), Feature B's warp
toggle and destination popup come along for free and work identically here —
no separate implementation, and no reason to suppress them. A dungeon view
can have its own connection-lines toggle (§5.5) on independently of Feature
B's warp-marker toggle; both may be on at once (markers show every warp,
lines show only the subset connecting two of the dungeon's own maps), and
double-clicking a marker inside a dungeon view opens the same popup Feature B
defines, even if the destination lies outside the current dungeon.

### 5.5 Connection lines

Own toggle (confirmed: not always-on). When on, for every warp belonging to
a map in the open dungeon's `maps` list, reusing `/api/warps/:map` (§4.2), a
line draws from that warp's exact tile position to its destination's exact
tile position — **only when both the source and destination maps are members
of the currently-open dungeon** (a warp leading outside the dungeon draws no
line; nothing to connect to on this canvas). Matches the reference image:
lines run between precise points on different floors' art, not map centers.

**Color:** deterministic, not random or hashed — every connection is sorted
into a stable order (by source map name, then by the warp's own index within
that map) and assigned `PALETTE[i % PALETTE.length]` from a small fixed
color list. The same connection reads the same color across sessions and
reloads, without needing a hash function or any persisted color assignment.

---

## 6. Testing

Per this project's established practice:

- **Feature A**: a test that a fixture map with `mapType: "MAP_TYPE_INDOOR"`
  is absent from the default draw but present once dragged (i.e. once in
  `manualPlacements`); a test that the sidebar list marks it greyed and
  `draggable`; a test that clicking a greyed entry with a real placement
  reveals it for that view without writing anything (no POST fired).
- **Feature B**: a test that `/api/warps/:map` returns real warp data for a
  real fixture map; a test that the toggle only draws markers for currently-
  visible placements, not the whole corpus; a test that double-click opens
  the modal with the correct `destMap`, and that closing it restores the
  underlying canvas state unchanged.
- **Feature C**: a test for `warpConnectedMapsFrom` against a small synthetic
  warp graph (not the full corpus) proving it returns exactly the
  transitively-reachable set, no more, no less (the classic "prove the
  negative too" test-design rule this project already applies everywhere);
  a test that the connection-line color assignment is stable across two
  separate computations of the same dungeon's `maps` list in a different
  input order (proving it's order-of-membership-independent, keyed on the
  stable sort, not on insertion order); a test that a warp whose destination
  is outside the open dungeon draws no line.

---

## 7. Out of scope

- Dungeon exclusivity / hierarchy (a dungeon containing sub-dungeons) — flat,
  independent, possibly-overlapping named groups only.
- Any history/versioning of dungeon edits.
- A "suggest dungeons automatically across the whole corpus" bulk action —
  creation is always one seed map at a time, by design (§5.2).
- Warp markers/lines rendering in Map mode (single-map view) — both are
  World/Dungeon-view features only.
