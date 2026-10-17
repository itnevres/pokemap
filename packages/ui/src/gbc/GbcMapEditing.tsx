import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import type { GbcStamp } from "@pokemap/core/src/gbc/edit/paint.js";
import type { GbcEventKind, GbcWarpRenumberWarning } from "@pokemap/core/src/gbc/edit/events.js";
import { Toolbar, type ToolKind } from "../components/Toolbar.js";
import { GbcMapCanvas, type GbcActiveTool, type GbcEventRef, type GbcMapCanvasProps } from "./GbcMapCanvas.js";
import { GbcMetatilePalette } from "./GbcMetatilePalette.js";
import { GbcEventInspector } from "./GbcEventInspector.js";
import type { UseGbcEditSessionResult } from "./hooks/useGbcEditSession.js";
import type { GbcTimeOfDay } from "./time.js";
import { EditingWorkspace } from "../shared/EditingWorkspace.js";
import { useVisit } from "../shared/useVisit.js";
import { GBC_CAPABILITIES, toolsFor } from "../shell/adapter.js";
import { SignEditor } from "../shared/SignEditor.js";

/** No collision button (Plan 7 Goal: GBC collision is per metatile, not per block) and no sign composer. */
export const GBC_TOOLS: ToolKind[] = toolsFor(GBC_CAPABILITIES);

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** The props this component builds for the canvas it hosts -- everything `GbcMapCanvas` needs for editing. The World
 *  view's in-context overlay (Plan 7 Task 5b) renders its own chromeless, controlled `GbcMapCanvas` from exactly these,
 *  through `renderCanvas`, so the prop assembly lives in one place. */
export type GbcMapEditingCanvasProps = Pick<
  GbcMapCanvasProps,
  "onStrokeChain" | "mapName" | "data" | "time" | "hoveredMetatile" | "editSession" | "activeTool" | "onSignPick" | "onDropperPick" | "selectedEvent" | "onSelectEvent" | "onMoveEvent" | "onEditError"
>;

export interface GbcMapEditingProps {
  onStrokeChain?: GbcMapCanvasProps["onStrokeChain"];
  /** Null only while `active` is false and no map is selected yet. */
  mapName: string | null;
  /** Null only while `active` is false (the World view before the context map's payload has loaded). */
  data: GbcMapPayload | null;
  time: GbcTimeOfDay;
  session: UseGbcEditSessionResult;
  hoveredMetatileId: number | null;
  onHoverMetatile: (id: number | null) => void;
  /** Opens `SaveDialog`, which `GbcApp` mounts at `<main>` level for stacking (as GBA's `App` does). */
  onOpenSave: () => void;
  /** After a successful toolbar Discard: the runtime clears its stale failed-discard-before-switch banner (Plan 9 O1). */
  onDiscarded?: () => void;
  /** Plan 7 Task 5b. False renders only `.app__map-editing-body` holding the canvas slot (no Toolbar, banner, palette or
   *  inspector), so the World view's canvas keeps its position in the tree and is NOT remounted when in-context editing
   *  switches the chrome on (GBA's `MapEditingWorkspace` `active={false}` seam). Default true. */
  active?: boolean;
  /** The seam for the World host: receives the canvas props built here (null while there is no map payload) and its
   *  output is rendered in the canvas slot. Omitted: `<GbcMapCanvas {...canvasProps} />`, the Map-view behaviour. */
  renderCanvas?: (canvasProps: GbcMapEditingCanvasProps | null) => ReactNode;
}

/**
 * The GBC counterpart of `components/MapEditingWorkspace.tsx`, without GBA types: toolbar, the metatile palette,
 * the event-op error banner, and canvas + inspector in `.app__map-editing-body`. The edit session itself lives in
 * `GbcApp` (always mounted); everything here is per-visit UI state, including in the persistent World host.
 *
 * Per-map state (the picked stamp, the selected event, the error banner, warnings) is held as `{ forMap, ... }`
 * and retired on a map visit change before children render. A committed visit identity guards deferred local
 * callbacks, including A -> B -> A. The chosen TOOL deliberately survives; tileset picks must not.
 *
 * Non-writable layout (`layout.writable === false`): the paint tools render disabled with the reason, and
 * `activeTool` resolves to null so the canvas cannot paint; event editing, undo/redo and save stay enabled.
 */
export function GbcMapEditing({ mapName, data, time, session, hoveredMetatileId, onHoverMetatile, onOpenSave, onDiscarded, active = true, renderCanvas, onStrokeChain }: GbcMapEditingProps) {
  const [toolKind, setToolKind] = useState<ToolKind | null>(null);
  const [signPick, setSignPick] = useState<{ x: number; y: number; anchor: DOMRect } | null>(null);
  // `key` is never a real map name when there is no map, so nothing reads as "mine" until one is selected.
  const key = mapName ?? "";
  const [pick, setPick] = useState<{ forMap: string; stamp: GbcStamp | null; event: GbcEventRef | null }>({ forMap: key, stamp: null, event: null });
  const [err, setErr] = useState<{ forMap: string; text: string } | null>(null);
  const [warn, setWarn] = useState<{ forMap: string; list: GbcWarpRenumberWarning[] } | null>(null);
  const visit = useVisit(mapName);
  // Adjust this component's state during render: React retries it before rendering children, so no old pick is exposed.
  if (visit.changed) {
    setPick({ forMap: key, stamp: null, event: null });
    setErr(null);
    setWarn(null);
  }
  const isCurrent = visit.isCurrent;

  const mine = pick.forMap === key;
  const stamp = mine ? pick.stamp : null;
  const selectedEvent = mine ? pick.event : null;
  const error = err && err.forMap === key ? err.text : null;
  const warnings = warn && warn.forMap === key ? warn.list : [];
  // Functional updaters: a deferred `setEvent(null)` (a delete resolving) must not overwrite a stamp picked meanwhile.
  const fresh = (p: typeof pick) => (p.forMap === key ? p : { forMap: key, stamp: null, event: null });
  const setStamp = (next: GbcStamp) => { if (isCurrent()) setPick((p) => ({ ...fresh(p), stamp: next })); };
  // The memoised palette gets one stable pick callback that runs the latest setStamp (Plan 9 follow-up O2).
  const setStampRef = useRef(setStamp);
  setStampRef.current = setStamp;
  const onPalettePick = useCallback((next: GbcStamp) => setStampRef.current(next), []);
  const setEvent = (ref: GbcEventRef | null) => { if (isCurrent()) setPick((p) => ({ ...fresh(p), event: ref })); };
  const fail = (e: unknown, fallback = "Edit failed.") => { if (isCurrent()) setErr({ forMap: key, text: message(e, fallback) }); };
  const ok = () => { if (isCurrent()) setErr(null); };

  const writable = data?.layout.writable ?? false;
  const nonWritableTitle = data
    ? `this map's .blk is flagged non-writable: ${data.defects.find((d) => d.message.includes("not writable"))?.message ?? data.layout.blkPath}`
    : "";

  const activeTool = useMemo<GbcActiveTool | null>(() => {
    if (!writable || toolKind === null) return null;
    if (toolKind === "shift" || toolKind === "dropper" || toolKind === "sign") return { kind: toolKind };
    if (toolKind === "pencil" || toolKind === "rect" || toolKind === "bucket") return stamp ? { kind: toolKind, stamp } : null; // inert until a cell is picked
    return null;
  }, [writable, toolKind, stamp]);

  const pickedId = stamp && stamp.cells.length === 1 ? stamp.cells[0]!.metatileId : null;

  const onMove = (next: { kind: GbcEventKind; index: number; x: number; y: number }) => {
    session.moveEvent(next.kind, next.index, next.x, next.y).then(ok).catch((e: unknown) => fail(e, "Failed to move event."));
  };
  const onDelete = (ref: GbcEventRef): Promise<void> =>
    session.deleteEvent(ref.kind, ref.index).then(({ warpRenumberWarnings }) => {
      if (!isCurrent()) return;
      ok();
      setEvent(null);
      setWarn(warpRenumberWarnings.length > 0 ? { forMap: key, list: warpRenumberWarnings } : null);
    }).catch((e: unknown) => fail(e, "Failed to delete event."));
  const onDuplicate = (kind: GbcEventKind, args: string[]): Promise<void> => {
    // add always appends, so the copy's index is the list's length BEFORE the call.
    const list = kind === "object" ? session.events.objects : kind === "warp" ? session.events.warps : kind === "coord" ? session.events.coords : session.events.bgs;
    const newIndex = list.length;
    return session.addEvent(kind, args).then(() => {
      if (!isCurrent()) return;
      ok();
      setEvent({ kind, index: newIndex });
    }).catch((e: unknown) => fail(e, "Failed to duplicate event."));
  };

  const onDiscard = () => {
    if (!window.confirm("Discard all unsaved changes on this map? This cannot be undone.")) return;
    session.discard().then(() => { ok(); onDiscarded?.(); }).catch((e: unknown) => fail(e, "Failed to discard."));
  };

  const canvasProps: GbcMapEditingCanvasProps | null =
    mapName !== null && data !== null
      ? {
          ...(onStrokeChain ? { onStrokeChain } : {}),
          mapName,
          data,
          time,
          hoveredMetatile: onHoverMetatile,
          editSession: session,
          activeTool,
          onDropperPick: setStamp,
          onSignPick: (x, y, anchor) => setSignPick({ x, y, anchor }),
          selectedEvent,
          onSelectEvent: setEvent,
          onMoveEvent: onMove,
          onEditError: (m) => fail(new Error(m)),
        }
      : null;
  const top = <>
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
          <button type="button" className="app__event-op-error-dismiss" onClick={ok} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </>;
  // The shared rail (EditingWorkspace, .edit-rail): palette over inspector.
  const side = mapName !== null && data !== null ? (
    <>
      <GbcMetatilePalette
        mapName={mapName}
        time={time}
        tilesetName={data.tileset.constName}
        metatileCount={data.metatileCount}
        highlightId={hoveredMetatileId}
        onSelect={writable ? onPalettePick : undefined}
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
        onDismissWarnings={() => { if (isCurrent()) setWarn(null); }}
      />
    </>
  ) : null;
  return <>
    <EditingWorkspace active={active} top={top} side={side} canvasProps={canvasProps} Canvas={GbcMapCanvas} renderCanvas={renderCanvas} />
    {signPick && mapName && <SignEditor mapName={mapName} x={signPick.x} y={signPick.y} anchor={signPick.anchor}
      hasObjectEvent={session.events.objects.some((event) => event.x === signPick.x && event.y === signPick.y)}
      onCancel={() => setSignPick(null)} onDone={() => setSignPick(null)} onSessionUpdated={(body) => session.applyExternalSession?.(body)} />}
  </>;
}
