# PokeMap user guide

This guide covers both engine families. GBA means a pokeemerald-family decomp project. GBC means a pokecrystal-family decomp project (Pokémon Crystal today). Anything that works for only one family is labelled.

## Install and start

You need Node.js 20.19 or later in the 20.x line, or 22.12 or later, and npm. Then, from the repo root:

```powershell
npm ci
```

To start PokeMap, double-click `PokeMap.cmd` at the repo root. It is being added alongside this guide and is not in the repo yet. Until it is, use the manual launch in [LAUNCH.md](../LAUNCH.md). That file is the source for every launch step, so this guide does not repeat them.

PokeMap runs in your browser, on your own machine. It needs no internet connection to open a project.

## Open a project

When no project is open, the app shows **Open a project**. With no arguments, PokeMap reopens the most recently used project if there is one.

The picker has three ways in:

- **Recent**: projects you opened before, each with a GBA or GBC badge and an Open button. The list is kept in `~/.pokemap/recent.json`.
- **Browse**: click folders to walk the disk. Folders PokeMap recognises show a family badge. The Open button works only for a folder it detects as GBA or GBC. Up goes to the parent folder.
- **Folder path**: type or paste the path to the project root and press Open.

PokeMap detects the family by itself. A GBA project is recognised by `include/fieldmap.h`. A GBC (Crystal) project is recognised by `data/maps/attributes.asm` and `constants/map_constants.asm`. If it cannot tell, it refuses and names the paths it looked at.

You can switch projects from inside the app. If the open project has unsaved changes, the app lists the maps with changes and asks you to confirm before it switches. See "Save and the diff preview" below.

## The three views

The header has a **View** group with **Map**, **World** and **Dungeon**. The map tree is on the left.

- **Map**: one map, editable.
- **World**: the maps stitched into one pannable world.
- **Dungeon**: dungeon maps laid out by their warps.

## The per-layout boundary

This is the part of PokeMap that is different from other editors, so read it once.

**A layout is shared.** The map's art, the grid of blocks, lives in a layout, and a layout can be used by more than one map. A tileset is used by many layouts. When you paint a block in a map, you change that map's layout. Every other map that uses the same layout changes too, because they all read the same blockdata file.

**Each layout has its own metatile boundary (GBA).** A GBA layout draws from a primary tileset and a secondary tileset. Metatile ids below the boundary come from the primary tileset. Ids from the boundary up come from the secondary tileset. In some projects this boundary is not the same for every layout. The `layout_version` field on each layout in `layouts.json` says which boundary applies. PokeMap looks it up for every layout it draws or writes and never uses one global value.

**How the UI shows it (GBA):**
- The status strip under the map shows `layout_version` and the split: `split metatiles N · tiles N · pals N`.
- The metatile palette draws a divider where the secondary tileset starts: `primary N · secondary starts here · <layout_version>`.
- The Save dialog lists every file that will change, so a layout shared by several maps appears as one file.
- The block editor shows how many times a block is used on this map and on other maps, and how many maps are affected.

TODO: evidence not found that the Map view lists the names of the other maps sharing a layout when you paint. The code I read does not show a per-layout map list for a plain paint. Check the Save dialog's file list before saving a paint on a layout you think is shared.

**What PokeMap does when the boundary is unknown or wrong (GBA):**
- A layout with no `layout_version`, in a project whose engine needs one, can be drawn but not saved. The refusal is `missing-layout-version`, and its fix text says to run `python tools/donors/classify_layout_versions.py --write` and reopen.
- A block whose metatile id is out of range for its layout's boundary does not save. The refusal is `metatile-out-of-range`.
- A border that is not the size `layouts.json` declares does not save (`border-size-mismatch`). PokeMap reads border size from each layout and has no setting to get it wrong.

**GBC.** A GBC map's blocks are in a `.blk` file, and several maps can point to the same one. There is no `layout_version`. The same rule holds: a paint changes the shared file, so it changes every map that uses it. A GBC save is refused if the block count changes (`blocks-length-changed`) or if a metatile id is out of range (`metatile-out-of-range`).

## Painting

The tool buttons are in the editing toolbar. The letter is the keyboard shortcut.

| Tool | Key | Notes |
|---|---|---|
| Pencil | P | Stamp the selected metatile (or a stamp from the palette). |
| Rect | R | Fill a rectangle. |
| Bucket | B | Flood fill. |
| Dropper | I | Pick up the block under the cursor, including its collision and elevation. |
| Shift | S | Shift the whole layout; blocks wrap around the edges. Events do not move. |
| Collision | C | GBA only. |
| Sign | G | Both families. Places a readable sign. |
| Edit block | K | Both families. Opens the block editor. |

Pick a metatile in the palette in the right rail, then paint. Undo is Ctrl+Z and Redo is Ctrl+Y. A small dot appears in the toolbar when there are unsaved changes. Painting stages the change in memory. Nothing is on disk until you save.

GBA shows an elevation overlay and a collision overlay. GBC has a time-of-day control (morning, day, night) that changes how the map is drawn.

The **Edit block** tool (and the map's right-click menu) opens the block editor for one block. It shows where the block is used. **Save as new** adds a new block instead of changing the shared one.

## Events

Events are the things on a map: objects, warps, coordinate triggers and background events (signs and hidden items).

- Click an event to select it. The inspector shows its fields. A warp shows **Dest Map** and **Dest Warp**.
- Drag an event to move it.
- The **Add events** bar has four buttons: Add Object, Add Warp, Add Coord Event and Add BG Event. Click a button, click a tile on the map, then fill in the dialog. Adding stages the event; nothing is written until you save.
- Both families have these. They differ underneath:

| | GBA | GBC |
|---|---|---|
| Event position unit | tile (16 px) | event step (16 px), which is half a block, because a GBC block is 32 px |
| Source written | `map.json` events and `scripts.inc` | `.asm` event macros and constants |
| Collision tool | yes | no |

The save preview lists every file an event change touches, including scripts and text added with a new event.

## Pokémon Indicator

The **Pokémon Indicator** button is in the toolbar. It was called a "wild sign" in older notes. It is not a sign. It adds an object event that shows the overworld sprite of a species that can be caught on the map. The sprite faces the player, plays the species' cry, and says one line of text.

1. Click **Pokémon Indicator**.
2. The dialog lists the species catchable on this map, best chance first, and prefills X and Y with a suggested spot next to grass. If the map has no wild encounters, it says so.
3. Enter the text and press **Place**. The text is wrapped to the game's text width, and a bad character is refused with a message that names it.
4. Move it with the normal event drag.
5. To change the species or text later, select it and press **Edit Indicator** in the inspector.

It works in both families:
- **GBA**: the sprite is the species' own overworld sprite.
- **GBC**: the species' own Crystal overworld sprite if the project has one, otherwise the generic `SPRITE_MONSTER`.

An object that only looks like an Indicator but was changed by hand shows Edit Indicator disabled, with the reason.

## The world view

The **World** view stitches the maps into one world. Overworld maps are placed by their connections. Dungeon maps are placed by their warps. You can move a map by hand; your manual placements are kept in the project's `.pokemap/` folder.

- Pan and zoom with the mouse and the zoom bar.
- Toolbar switches: **Dungeon auto-layout**, **Warps**, and **Connection lines** (when a map filter is on).
- **Coverage lenses** colour the world by encounter data: Level curve, Empty maps (maps with no wild encounters), Unused species (species in no encounter table), and Method (the encounter method, such as water, fishing or rock smash). Empty maps and Unused species can show a list.
- A species spotlight highlights the maps where a species can be caught.
- Right-click a map for **Open in Map view**. Placement conflict badges can be accepted or un-accepted from the same menu.
- Double-click a warp marker to open the destination map in a popup.

The world view reads the project; it does not write to it. Only the manual placements go to `.pokemap/`.

## Save and the diff preview

**Nothing is written until you confirm the diff preview.** This is invariant I6 (`docs/superpowers/plans/archive/plan-00-gba-roadmap.md`): no autosave, ever. Opening a map to look at it never writes.

1. Edit. The changes stay in memory and the toolbar shows the unsaved-changes dot.
2. Press **Save Changes**. The **Save Changes** dialog opens and shows every file that will change, with a summary of each change. It also shows refusals, each with a message and a fix.
3. Read it. **Cancel** closes the dialog and keeps all your changes. If there is a refusal, the save button is disabled until you fix the cause.
4. Press **Save Changes** in the dialog to write. All the files in the plan are written together, or none are.

Two safeguards sit behind the button:
- If the plan changed after you saw it, the save is refused, the dialog shows the new plan, and you review again.
- If a file changed on disk after the preview (for example you edited it in another tool), the save is refused with "changed on disk since the save was previewed; reopen Save to review".

**Discard Changes** in the toolbar throws away the session after it asks you to confirm. Switching maps with unsaved changes asks you to save or discard first.

## What PokeMap never does

- It does not use git and does not need your project to be in a git repository (decision D33). Its safety comes from the save preview, the all-or-nothing write and byte comparisons.
- It does not save on its own.
- It does not reserialize your JSON files. It edits the text it needs to change and leaves the rest as it was.
- It does not write outside your decomp data files and the `.pokemap/` folder.
- It does not edit `include/fieldmap.h`.
- It does not guess. When something is missing or wrong, it refuses and names the file and the fix.

## Migration note for the subject repo

This note is for the owner of the game project PokeMap was built for (the pokeemerald-based Heart & Soul repo). It is not applied by PokeMap. This repo does not edit that repo's docs.

`docs/human-porymap.md` in that repo tells you to swap the metatile constants in `include/fieldmap.h` before editing an `emerald` map in Porymap (its Step 2), and to swap them back before building (its Step 5). **Neither step is needed once you edit with PokeMap.** PokeMap resolves the boundary for each layout by itself and never touches `include/fieldmap.h`.

To apply it: when you start using PokeMap for map edits, update that worklist to say Step 2 and Step 5 do not apply to PokeMap, and keep them only for anyone who still opens the project in Porymap. Do not run Porymap and PokeMap on the same project at the same time: Porymap strips `layout_version` from `layouts.json` on save (docs/superpowers/LESSONS.md).
