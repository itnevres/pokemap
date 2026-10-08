import { useMemo, useState } from "react";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import type { GbcStamp } from "@pokemap/core/src/gbc/edit/paint.js";
import type { GbcEventKind, GbcWarpRenumberWarning } from "@pokemap/core/src/gbc/edit/events.js";
import { Toolbar, type ToolKind } from "../components/Toolbar.js";
import { GbcMapCanvas, type GbcActiveTool, type GbcEventRef } from "./GbcMapCanvas.js";
import { GbcMetatilePalette } from "./GbcMetatilePalette.js";
import { GbcEventInspector } from "./GbcEventInspector.js";
import type { UseGbcEditSessionResult } from "./hooks/useGbcEditSession.js";
import type { GbcTimeOfDay } from "./time.js";

/** No collision button (Plan 7 Goal: GBC collision is per metatile, not per block) and no sign composer. */
export const GBC_TOOLS: ToolKind[] = ["pencil", "rect", "bucket", "dropper", "shift"];

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export interface GbcMapEditingProps {
  mapName: string;
  data: GbcMapPayload;
  time: GbcTimeOfDay;
  session: UseGbcEditSessionResult;
  hoveredMetatileId: number | null;
  onHoverMetatile: (id: number | null) => void;
  /** Opens `SaveDialog`, which `GbcApp` mounts at `<main>` level for stacking (as GBA's `App` does). */
  onOpenSave: () => void;
}

/**
 * The GBC counterpart of `components/MapEditingWorkspace.tsx`, without GBA types: toolbar, the metatile palette,
 * the event-op error banner, and canvas + inspector in `.app__map-editing-body`. The edit session itself lives in
 * `GbcApp` (always mounted); everything here is per-visit UI state and is rebuilt when the user comes back from
 * World, which is fine -- nothing here is server state.
 *
 * Per-map state (the picked stamp, the selected event, the error banner, warnings) is held as `{ forMap, ... }`
 * and read only while `forMap === mapName` (6c B4): a map switch reads as empty on the very first render, with no
 * reset effect and no one-tick window. The chosen TOOL deliberately survives a map switch; a stamp is a metatile
 * id of one tileset and must not.
 *
 * Non-writable layout (`layout.writable === false`): the paint tools render disabled with the reason, and
 * `activeTool` resolves to null so the canvas cannot paint; event editing, undo/redo and save stay enabled.
 */
export function GbcMapEditing({ mapName, data, time, session, hoveredMetatileId, onHoverMetatile, onOpenSave }: GbcMapEditingProps) {
  const [toolKind, setToolKind] = useState<ToolKind | null>(null);
  const [pick, setPick] = useState<{ forMap: string; stamp: GbcStamp | null; event: GbcEventRef | null }>({ forMap: mapName, stamp: null, event: null });
  const [err, setErr] = useState<{ forMap: string; text: string } | null>(null);
  const [warn, setWarn] = useState<{ forMap: string; list: GbcWarpRenumberWarning[] } | null>(null);

  const mine = pick.forMap === mapName;
  const stamp = mine ? pick.stamp : null;
  const selectedEvent = mine ? pick.event : null;
  const error = err && err.forMap === mapName ? err.text : null;
  const warnings = warn && warn.forMap === mapName ? warn.list : [];
  // Functional updaters: a deferred `setEvent(null)` (a delete resolving) must not overwrite a stamp picked meanwhile.
  const fresh = (p: typeof pick) => (p.forMap === mapName ? p : { forMap: mapName, stamp: null, event: null });
  const setStamp = (next: GbcStamp) => setPick((p) => ({ ...fresh(p), stamp: next }));
  const setEvent = (ref: GbcEventRef | null) => setPick((p) => ({ ...fresh(p), event: ref }));
  const fail = (e: unknown, fallback = "Edit failed.") => setErr({ forMap: mapName, text: message(e, fallback) });
  const ok = () => setErr(null);

  const writable = data.layout.writable;
  const nonWritableTitle = `this map's .blk is flagged non-writable: ${data.defects.find((d) => d.message.includes("not writable"))?.message ?? data.layout.blkPath}`;

  const activeTool = useMemo<GbcActiveTool | null>(() => {
    if (!writable || toolKind === null) return null;
    if (toolKind === "shift" || toolKind === "dropper") return { kind: toolKind };
    if (toolKind === "pencil" || toolKind === "rect" || toolKind === "bucket") return stamp ? { kind: toolKind, stamp } : null; // inert until a cell is picked
    return null;
  }, [writable, toolKind, stamp]);

  const pickedId = stamp && stamp.cells.length === 1 ? stamp.cells[0]!.metatileId : null;

  const onMove = (next: { kind: GbcEventKind; index: number; x: number; y: number }) => {
    session.moveEvent(next.kind, next.index, next.x, next.y).then(ok).catch((e: unknown) => fail(e, "Failed to move event."));
  };
  const onDelete = (ref: GbcEventRef): Promise<void> =>
    session.deleteEvent(ref.kind, ref.index).then(({ warpRenumberWarnings }) => {
      ok();
      setEvent(null);
      setWarn(warpRenumberWarnings.length > 0 ? { forMap: mapName, list: warpRenumberWarnings } : null);
    }).catch((e: unknown) => fail(e, "Failed to delete event."));
  const onDuplicate = (kind: GbcEventKind, args: string[]): Promise<void> => {
    // add always appends, so the copy's index is the list's length BEFORE the call.
    const list = kind === "object" ? session.events.objects : kind === "warp" ? session.events.warps : kind === "coord" ? session.events.coords : session.events.bgs;
    const newIndex = list.length;
    return session.addEvent(kind, args).then(() => {
      ok();
      setEvent({ kind, index: newIndex });
    }).catch((e: unknown) => fail(e, "Failed to duplicate event."));
  };

  const onDiscard = () => {
    if (!window.confirm("Discard all unsaved changes on this map? This cannot be undone.")) return;
    session.discard().then(ok).catch((e: unknown) => fail(e, "Failed to discard."));
  };

  return (
    <>
      <Toolbar
        activeToolKind={toolKind}
        onSelectTool={setToolKind}
        tools={GBC_TOOLS}
        availableTools={writable ? GBC_TOOLS : []}
        unavailableTitle={nonWritableTitle}
        isDirty={session.isDirty}
        onUndo={() => void session.undo().then(ok).catch((e: unknown) => fail(e, "Undo failed."))}
        onRedo={() => void session.redo().then(ok).catch((e: unknown) => fail(e, "Redo failed."))}
        canUndo={session.canUndo}
        canRedo={session.canRedo}
        onOpenSave={onOpenSave}
        onDiscard={onDiscard}
      />
      {error && (
        <div className="app__event-op-error" role="alert">
          <span>{error}</span>
          <button type="button" className="app__event-op-error-dismiss" onClick={() => setErr(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <div className="app__map-editing-body">
        <GbcMapCanvas
          mapName={mapName}
          data={data}
          time={time}
          hoveredMetatile={onHoverMetatile}
          editSession={session}
          activeTool={activeTool}
          onDropperPick={setStamp}
          selectedEvent={selectedEvent}
          onSelectEvent={setEvent}
          onMoveEvent={onMove}
          onEditError={(m) => setErr({ forMap: mapName, text: m })}
        />
        {/* One right-hand rail (palette over inspector), 260px: three fixed side panels left the canvas about 224px
            at 1024 wide (quality review I4). The rail and its children carry min-width: 0 in the stylesheet. */}
        <div className="gbc-map-editing__rail">
        <GbcMetatilePalette
          mapName={mapName}
          time={time}
          tilesetName={data.tileset.constName}
          metatileCount={data.metatileCount}
          highlightId={hoveredMetatileId}
          onSelect={writable ? setStamp : undefined}
          selected={pickedId}
        />
        <GbcEventInspector
          events={session.events}
          selected={selectedEvent}
          stepsW={2 * data.layout.width}
          stepsH={2 * data.layout.height}
          onMove={onMove}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          warnings={warnings}
          onDismissWarnings={() => setWarn(null)}
        />
        </div>
      </div>
    </>
  );
}
