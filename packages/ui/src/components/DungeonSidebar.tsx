import { useMemo, useState } from "react";
import type { Dungeon } from "../hooks/useDungeons.js";

export interface DungeonSidebarProps {
  dungeons: Dungeon[] | null;
  error: string | null;
  openId: string | null;
  onOpen(id: string): void;
  onCreate(input: { name: string; seedMap?: string; maps?: string[] }): Promise<Dungeon>;
  // Review fix: these three used to be typed `void`, while the hook they're
  // actually wired to (useDungeons) returns Promise<Dungeon>/Promise<void> --
  // an asymmetry that let every floating-promise bug below go unnoticed,
  // since a discarded Promise return satisfies a `void`-typed prop silently.
  // Widened to the real return type, matching onCreate's own honest typing
  // above, so future wiring/test code that forgets to await/catch a promise
  // fails typecheck instead of swallowing the rejection.
  onRename(id: string, name: string): Promise<unknown>;
  onSetMaps(id: string, maps: string[]): Promise<unknown>;
  onDelete(id: string): Promise<unknown>;
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
  // Review fix: submitCreate used to await onCreate with no try/catch, so a
  // rejected create (e.g. a duplicate-name 400) vanished with zero user
  // feedback -- the form just sat there having silently done nothing. busy
  // additionally guards against a double-submit firing two concurrent
  // creates while the first is still in flight.
  const [busy, setBusy] = useState(false);
  // Review fix: a dedicated slot for "your last create/rename/etc failed",
  // distinct from the `error` prop's own "couldn't load the list at all" --
  // mirrors WorldCanvas.tsx's own loadError/saveError split. Rendered via
  // its own .dungeon-sidebar__error class, not borrowed from
  // .map-tree__empty (that class means "the list itself is empty/unloaded").
  const [actionError, setActionError] = useState<string | null>(null);
  // Review fix (Critical): the rename input used to be `value={open.name}`
  // with `onChange={(e) => onRename(open.id, e.target.value)}` -- fully
  // server-controlled with no local draft, so React snapped the DOM value
  // back to the stale prop on every keystroke while N concurrent PATCHes
  // raced (confirmed empirically: typing produced "Mt Moon" -> "Mt Moon " ->
  // "Mt Moon C" -> ... -> "", the empty string 400ing on the server). A
  // local draft, committed on blur/Enter, replaces that: `null` means "no
  // pending edit, show the server's own name".
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  const open = dungeons?.find((d) => d.id === openId) ?? null;

  // Review fix (Minor, repeat pattern): this list can run to ~1,209 entries
  // in the real corpus. Un-memoized, every <option> was recreated on every
  // render -- including renders triggered by unrelated keystrokes elsewhere
  // in this component, and even while neither the create form nor the edit
  // panel that reference this datalist are open.
  const mapOptions = useMemo(() => allMapNames.map((m) => <option key={m} value={m} />), [allMapNames]);

  const submitCreate = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      const created = await onCreate(
        newSeed.trim() ? { name: newName.trim(), seedMap: newSeed.trim() } : { name: newName.trim(), maps: [] },
      );
      setCreating(false);
      setNewName("");
      setNewSeed("");
      setActionError(null);
      onOpen(created.id);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const commitRename = () => {
    const next = nameDraft?.trim();
    setNameDraft(null);
    if (!open || next === undefined || next === "" || next === open.name) return;
    onRename(open.id, next)
      .then(() => setActionError(null))
      .catch((e: unknown) => setActionError(e instanceof Error ? e.message : String(e)));
  };

  const removeMap = (map: string) => {
    if (!open) return;
    onSetMaps(open.id, open.maps.filter((m) => m !== map))
      .then(() => setActionError(null))
      .catch((e: unknown) => setActionError(e instanceof Error ? e.message : String(e)));
  };

  const addMap = () => {
    const trimmed = addMapName.trim();
    // Review fix (Minor, data-integrity): this used to skip only the
    // already-a-member check, so a typo created a phantom member that
    // persisted to dungeons.json and showed as a sidebar row while never
    // drawing on the canvas (mapFilter silently drops unresolvable names).
    // Now also requires the typed name to actually resolve against
    // allMapNames -- a non-matching name is a silent no-op, the same as the
    // existing duplicate-name no-op just below it.
    if (!open || !trimmed || open.maps.includes(trimmed) || !allMapNames.includes(trimmed)) return;
    onSetMaps(open.id, [...open.maps, trimmed])
      .then(() => setActionError(null))
      .catch((e: unknown) => setActionError(e instanceof Error ? e.message : String(e)));
    setAddMapName("");
  };

  const deleteDungeon = () => {
    if (!open) return;
    onDelete(open.id)
      .then(() => setActionError(null))
      .catch((e: unknown) => setActionError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <nav className="dungeon-sidebar" aria-label="Dungeons">
      {error && <p className="map-tree__empty">Could not load dungeons: {error}</p>}

      {dungeons === null && !error ? (
        <p className="map-tree__empty">Loading dungeons…</p>
      ) : (
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
      )}

      {actionError && <p className="dungeon-sidebar__error">{actionError}</p>}

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
            <button type="button" className="map-canvas__btn" onClick={submitCreate} disabled={busy}>
              Create
            </button>
            <button type="button" className="map-canvas__btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {open && (
        // key={open.id}: without this, nameDraft (local state above) would
        // survive a switch to a different open dungeon, showing the
        // PREVIOUS dungeon's unsaved rename draft on the newly-opened one.
        <div className="dungeon-sidebar__edit" key={open.id}>
          <input
            className="dungeon-sidebar__input"
            value={nameDraft ?? open.name}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setNameDraft(null);
            }}
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
          <button type="button" className="dungeon-sidebar__delete" onClick={deleteDungeon}>
            Delete dungeon
          </button>
        </div>
      )}

      <datalist id="dungeon-sidebar-all-maps">{mapOptions}</datalist>
    </nav>
  );
}
