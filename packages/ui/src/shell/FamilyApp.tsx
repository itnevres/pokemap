import { useMemo, useState, type ReactNode } from "react";
import { MapTree } from "../components/MapTree.js";
import { DungeonSidebar } from "../components/DungeonSidebar.js";
import { SaveDialog } from "../components/SaveDialog.js";
import { useContextEditing } from "../shared/useContextEditing.js";
import { useBeforeUnloadGuard } from "../shared/useBeforeUnloadGuard.js";
import { useStrokeChainRegistry } from "../shared/useStrokeChain.js";
import { useDungeonFilter } from "./useDungeonFilter.js";
import type { EngineAdapter, Mode, ShellSlots } from "./adapter.js";

export interface FamilyAppProps {
  /** Fixed for the life of the mount: Root keys this component on family:root:gen. */
  adapter: EngineAdapter;
  /** Plan 6c A2: the header's project-switcher button, supplied by Root. */
  switcher?: ReactNode;
}

/**
 * The one app shell for both families (Plan 9). Owns what App.tsx and GbcApp.tsx shared: mode, selection, the jump
 * pair, the open dungeon, the stroke-chain registry, context editing, the beforeunload guard, header, sidebar and
 * SaveDialog. Everything family-specific comes from `adapter.useRuntime`; where the two shells disagreed, the
 * difference sits behind the runtime (leave, onSelected, onEnterContext, saveDialog.onCommitted) or a capability.
 */
export function FamilyApp({ adapter, switcher }: FamilyAppProps) {
  const caps = adapter.capabilities;
  const [mode, setMode] = useState<Mode>("map");
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped on every sidebar click, even a re-click of the same map name --
  // see WorldCanvas's own jumpToken doc comment for why jumpToMap alone
  // can't carry that signal.
  const [selectVersion, setSelectVersion] = useState(0);
  // The map a TREE click last asked GbcWorldCanvas to jump to -- separate
  // from `selected` (fix round, spec review F1). `selected` also changes on
  // a plain CANVAS click (selectMapFromWorld below), and passing `selected`
  // itself as `jumpToMap` meant the canvas's own click silently changed
  // GbcWorldCanvas's jump TARGET too: the jump effect's "retry once world
  // itself changes" guard only records a token as applied once it has a
  // real `jumpToMap` to act on, so the very FIRST canvas click (with
  // `selected` still null beforehand) turned `jumpToMap` non-null for the
  // first time and triggered a full jump -- confirmed live (spec review
  // probe P3: a single canvas click on a fresh load re-zoomed and flashed
  // the jump outline). Keeping this as its own state, set ONLY by tree
  // clicks (selectMap below), means a canvas click can never touch it.
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
  const [openDungeonId, setOpenDungeonId] = useState<string | null>(null);
  const [manualPlacementMaps, setManualPlacementMaps] = useState<ReadonlySet<string>>(new Set());

  const runtime = adapter.useRuntime({ selected, mode });

  // Shared browser-level half of I6's dirty-session guard; the in-app guard is runtime.leave.
  useBeforeUnloadGuard(runtime.session.isDirty);

  // Context entry and every non-tree switch: the family's policy, never the same-map shortcut.
  const leave = (go: () => void) => runtime.leave(go, { sameMap: false });
  // Every change of `selected` runs the family's side effects (GBC clears switchError and the hover id).
  const select = (name: string) => {
    setSelected(name);
    runtime.onSelected(name);
  };
  const { onStrokeChain, strokeSettled } = useStrokeChainRegistry();
  const ctx = useContextEditing({
    selected, session: runtime.session, leave, select,
    openSave: () => runtime.saveDialog.setOpen(true),
    strokeSettled,
  });

  // A tree click: GBA prompts even for the selected map; GBC does not (runtime.leave's sameMap).
  const selectMap = (name: string) =>
    runtime.leave(() => {
      select(name);
      ctx.leaveContext(); // a tree click leaves in-context editing (a jump would also move the world under the overlay)
      setJumpTarget(name);
      setSelectVersion((v) => v + 1);
    }, { sameMap: name === selected });

  // A world-view click selects (tree highlight + scroll) but is not a jump request. Re-clicking the selected map
  // must not raise the "discard and switch" confirm.
  const selectMapFromWorld = (name: string) => {
    if (name !== selected) leave(() => select(name));
  };

  // The world context menu's "Open in Map view" (and Shift+double-click, GBC double-click): select through the
  // family's guard, and switch to Map view only if the user did not cancel it.
  const openMapFromWorld = (name: string) => {
    const go = () => {
      select(name);
      ctx.leaveContext();
      setMode("map");
    };
    if (name === selected) go(); else leave(go);
  };

  const enterContext = (name: string) => {
    runtime.onEnterContext(name);
    ctx.enter(name);
  };
  const switchMode = (next: Mode) => {
    ctx.leaveContext();
    setMode(next);
  };

  // Entering World centres on the selected map, wherever the selection came from (tree, world click,
  // Map view). A world click itself never jumps (F1); this is a mode entry, not a click.
  const enterWorld = () => {
    if (mode === "world") return;
    setJumpTarget(selected);
    setSelectVersion((v) => v + 1);
    setMode("world");
  };

  const openDungeon = mode === "dungeon" ? (runtime.dungeons.data?.find((d) => d.id === openDungeonId) ?? null) : null;
  const mapFilter = useDungeonFilter(openDungeon, caps.dungeonFilterCache);
  const groupsData = runtime.groups.data;
  const allMapNames = useMemo(
    () => (groupsData ? groupsData.groupOrder.flatMap((g) => groupsData.groups[g] ?? []) : []),
    [groupsData],
  );

  // Review fix: the plan's own draft inline arrow (`(id) => { dungeons.remove(id); if (...) setOpenDungeonId(null); }`)
  // discarded the Promise remove() returns and cleared openDungeonId
  // unconditionally, even on a rejected delete (e.g. a 404 if the dungeon
  // was already gone, or a network failure) -- that would desync the UI
  // (sidebar still lists the dungeon, but the canvas already fell back to
  // the placeholder) and the rejection would be an uncaught promise
  // rejection with zero user feedback. This awaits it explicitly and only
  // clears openDungeonId -- and thus mapFilter, via openDungeon above --
  // once the delete has actually succeeded, and rethrows on failure so
  // DungeonSidebar's own deleteDungeon (which awaits onDelete and reports
  // into its existing actionError slot) surfaces the rejection instead of
  // wrongly clearing its error state as if the delete had gone through.
  const deleteDungeon = async (id: string) => {
    await runtime.dungeons.remove(id);
    // Functional form, not `if (openDungeonId === id) setOpenDungeonId(null)`:
    // this runs after an `await`, so the plain closed-over `openDungeonId`
    // could be stale by the time the DELETE resolves -- e.g. open dungeon A,
    // click Delete, then (before the request resolves) switch to open
    // dungeon B instead. The stale comparison would still see "A" === "A"
    // from when this function was called and incorrectly clear
    // openDungeonId, closing dungeon B even though B was never deleted.
    // Comparing against the CURRENT state at the moment the setter actually
    // runs closes that race.
    setOpenDungeonId((cur) => (cur === id ? null : cur));
  };

  const markManualPlacement = (name: string) =>
    setManualPlacementMaps((previous) => (previous.has(name) ? previous : new Set(previous).add(name)));
  const placed = runtime.visibility.placed;
  const visibility = useMemo(
    () =>
      caps.manualPlacements && placed
        ? new Map([...placed].map(([name, info]) => [name, { ...info, manual: info.manual || manualPlacementMaps.has(name) }]))
        : placed,
    [caps.manualPlacements, placed, manualPlacementMaps],
  );

  const slots: ShellSlots = {
    jumpTarget, jumpToken: selectVersion, selectMap, selectMapFromWorld, openMapFromWorld, enterContext,
    requestExitContext: ctx.requestExit, contextMap: ctx.contextMap, tileVersions: ctx.tileVersions,
    onStrokeChain, markManualPlacement,
  };
  const { error, data } = runtime.groups;

  return (
    <div className="app">
      <header className="app__toolbar">
        <h1 className="app__title">PokeMap</h1>
        {adapter.label && <span className="gbc-app__family">{adapter.label}</span>}
        <div className="app__mode" role="group" aria-label="View">
          <button type="button" className="map-canvas__btn" aria-pressed={mode === "map"} onClick={() => switchMode("map")}>
            Map
          </button>
          <button type="button" className="map-canvas__btn" aria-pressed={mode === "world"} onClick={enterWorld}>
            World
          </button>
          <button type="button" className="map-canvas__btn" aria-pressed={mode === "dungeon"} onClick={() => switchMode("dungeon")}>
            Dungeon
          </button>
        </div>
        {caps.timeOfDay && runtime.headerExtras}
        {mode === "map" && selected && <span className="app__status">{selected}</span>}
        {switcher}
      </header>
      <div className="app__body">
        <aside className="app__sidebar">
          {/* Review fix: this used to live only inside the non-dungeon
              branch below, so a failed /api/groups fetch was invisible in
              Dungeon mode -- yet DungeonSidebar's add-map input hard-
              requires allMapNames.includes(...), so allMapNames silently
              degrading to [] on that same failure turned every add-map
              attempt into a silent no-op with zero explanation. Hoisted
              here so the error is surfaced regardless of which mode is
              active; the ternary below still renders it (and only it, as
              before) for Map/World mode via its own `error ? null` branch,
              so that behaviour is unchanged. */}
          {error && <p className="map-tree__empty">Could not load map groups: {error}</p>}
          {mode === "world" && runtime.visibility.error && (
            <p className="map-tree__empty">Could not load world visibility: {runtime.visibility.error}</p>
          )}
          {mode === "dungeon" ? (
            <DungeonSidebar dungeons={runtime.dungeons.data} error={runtime.dungeons.error} openId={openDungeonId}
              onOpen={setOpenDungeonId} onCreate={runtime.dungeons.create} onRename={runtime.dungeons.rename}
              onSetMaps={runtime.dungeons.setMaps} onDelete={deleteDungeon} allMapNames={allMapNames} />
          ) : error ? null : data ? (
            <MapTree data={data} selected={selected} onSelect={selectMap} worldMode={mode === "world"}
              visibility={visibility} hiddenMapTypes={runtime.hiddenMapTypes} />
          ) : (
            <p className="map-tree__empty">Loading map groups…</p>
          )}
        </aside>
        <main className="app__canvas">
          {runtime.banners}
          {mode === "world" ? runtime.renderWorld(slots) : mode === "dungeon" ? (
            openDungeon && mapFilter ? runtime.renderDungeon(mapFilter, slots) : <p className="app__canvas-placeholder">Select or create a dungeon</p>
          ) : !selected ? <p className="app__canvas-placeholder">Select a map</p> : runtime.map.error ? (
            <p className="app__canvas-placeholder">Could not load {selected}: {runtime.map.error}</p>
          ) : runtime.map.ready ? runtime.renderMap(slots) : <p className="app__canvas-placeholder">Loading {selected}…</p>}
          {/* Task 13: SaveDialog owns its own modal shell (backdrop, Escape-
              to-cancel, autofocus -- mirrors WarpDestinationModal's own
              established pattern exactly, see that component's own "Review
              fix" comment). Rendered as a sibling of the branches above, at
              this level, for the same stacking-context reason
              WarpDestinationModal documents on its own backdrop: a modal
              nested inside a lower box could never paint above its
              siblings regardless of z-index. */}
          {runtime.saveDialog.open && selected && (
            <SaveDialog mapName={selected}
              // markClean first (ctx.onCommitted): the dialog's commit closes the server session behind the hook's
              // back. Then the family's own follow-up (GBC re-reads the map).
              onCommitted={() => { ctx.onCommitted(); runtime.saveDialog.setOpen(false); runtime.saveDialog.onCommitted(); }}
              onCancel={() => runtime.saveDialog.setOpen(false)} />
          )}
          {runtime.modals}
        </main>
      </div>
    </div>
  );
}
