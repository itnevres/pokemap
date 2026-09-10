import { useState } from "react";
import type { Dungeon } from "../hooks/useDungeons.js";

export interface DungeonSidebarProps {
  dungeons: Dungeon[] | null;
  error: string | null;
  openId: string | null;
  onOpen(id: string): void;
  onCreate(input: { name: string; seedMap?: string; maps?: string[] }): Promise<Dungeon>;
  onRename(id: string, name: string): void;
  onSetMaps(id: string, maps: string[]): void;
  onDelete(id: string): void;
  allMapNames: string[];
}

/**
 * Feature C's own sidebar (spec §5.4: "not the shared map list"). Lists
 * saved dungeons, a "+ New Dungeon" seed-picker/create form, and -- for
 * whichever dungeon is currently open -- its name (editable inline) and
 * member maps as removable rows, plus a small add-map input. Native
 * `<datalist>`-backed text inputs stand in for a full autocomplete
 * component here (unlike SpeciesSpotlight's own combobox, this is a
 * one-off picker over a list the browser can already filter for free, not
 * a live-typing search UX this project has invested a dedicated component
 * in).
 */
export function DungeonSidebar({
  dungeons, error, openId, onOpen, onCreate, onRename, onSetMaps, onDelete, allMapNames,
}: DungeonSidebarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSeed, setNewSeed] = useState("");
  const [addMapName, setAddMapName] = useState("");

  const open = dungeons?.find((d) => d.id === openId) ?? null;

  const submitCreate = async () => {
    if (!newName.trim()) return;
    const created = await onCreate(newSeed.trim() ? { name: newName.trim(), seedMap: newSeed.trim() } : { name: newName.trim(), maps: [] });
    setCreating(false);
    setNewName("");
    setNewSeed("");
    onOpen(created.id);
  };

  const removeMap = (map: string) => {
    if (!open) return;
    onSetMaps(open.id, open.maps.filter((m) => m !== map));
  };

  const addMap = () => {
    if (!open || !addMapName.trim() || open.maps.includes(addMapName.trim())) return;
    onSetMaps(open.id, [...open.maps, addMapName.trim()]);
    setAddMapName("");
  };

  return (
    <nav className="dungeon-sidebar" aria-label="Dungeons">
      {error && <p className="map-tree__empty">Could not load dungeons: {error}</p>}

      <ul className="dungeon-sidebar__list">
        {(dungeons ?? []).map((d) => (
          <li key={d.id}>
            <button
              type="button"
              className="dungeon-sidebar__item"
              aria-current={openId === d.id ? "true" : undefined}
              onClick={() => onOpen(d.id)}
            >
              <span className="dungeon-sidebar__item-name">{d.name}</span>
              <span className="dungeon-sidebar__item-count">{d.maps.length}</span>
            </button>
          </li>
        ))}
      </ul>

      {!creating ? (
        <button type="button" className="dungeon-sidebar__new" onClick={() => setCreating(true)}>
          + New Dungeon
        </button>
      ) : (
        <div className="dungeon-sidebar__create">
          <input
            className="dungeon-sidebar__input"
            placeholder="Dungeon name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="dungeon-sidebar__input"
            placeholder="Seed map (optional)"
            list="dungeon-sidebar-all-maps"
            value={newSeed}
            onChange={(e) => setNewSeed(e.target.value)}
          />
          <div className="dungeon-sidebar__create-actions">
            <button type="button" className="map-canvas__btn" onClick={submitCreate}>
              Create
            </button>
            <button type="button" className="map-canvas__btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="dungeon-sidebar__edit">
          <input
            className="dungeon-sidebar__input"
            value={open.name}
            onChange={(e) => onRename(open.id, e.target.value)}
            aria-label="Dungeon name"
          />
          <ul className="dungeon-sidebar__maps">
            {open.maps.map((m) => (
              <li key={m} className="dungeon-sidebar__map-row">
                <span>{m}</span>
                <button type="button" aria-label={`Remove ${m}`} onClick={() => removeMap(m)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="dungeon-sidebar__add-map">
            <input
              className="dungeon-sidebar__input"
              placeholder="Add map…"
              list="dungeon-sidebar-all-maps"
              value={addMapName}
              onChange={(e) => setAddMapName(e.target.value)}
            />
            <button type="button" className="map-canvas__btn" onClick={addMap}>
              Add
            </button>
          </div>
          <button type="button" className="dungeon-sidebar__delete" onClick={() => onDelete(open.id)}>
            Delete dungeon
          </button>
        </div>
      )}

      <datalist id="dungeon-sidebar-all-maps">
        {allMapNames.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </nav>
  );
}
