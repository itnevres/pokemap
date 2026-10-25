import { useRef, useState, type RefObject } from "react";
import type { WireConflict } from "@pokemap/core/src/world/conflictAcceptance.js";
import { fetchGuarded } from "../hooks/useGuardedFetch.js";
import { isAcceptedConflictsResponse } from "./conflictAcceptance.js";
import { useWorldContextMenu } from "../components/WorldContextMenu.js";

/** Acceptance state only; `useConflictAcceptanceMenu` below wires it to the context menu that triggers `toggle`. */
export function useConflictAcceptance(conflicts: readonly WireConflict[] | undefined) {
  const [acceptedKeys, setAcceptedKeys] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAccepted = (conflict: WireConflict) => acceptedKeys === null ? conflict.accepted : acceptedKeys.includes(conflict.key);
  const acceptedCount = conflicts?.filter(isAccepted).length ?? 0;
  /** Resolves true once the server confirmed; on failure keeps the acknowledgement as it was, shows the error, resolves false. */
  const toggle = (key: string, accepted: boolean): Promise<boolean> => {
    setError(null);
    return fetchGuarded("/api/world/conflicts/accept", isAcceptedConflictsResponse, undefined, {
      method: "POST", body: JSON.stringify({ key, accepted }),
    }).then((response) => {
      setAcceptedKeys(response.acceptedConflicts);
      return true;
    }, (cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    });
  };
  return { error, setError, isAccepted, acceptedCount, acceptedKeys, toggle };
}

/** Shared conflict acceptance plus the context-menu wiring around it; canvases retain hit testing and their own tooltip copy. */
export function useConflictAcceptanceMenu({ conflicts, canvasRef, onOpenMap, onEditHere }: {
  conflicts: readonly WireConflict[] | undefined;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onOpenMap?: (name: string) => void;
  onEditHere?: (name: string) => void;
}) {
  const conflictAcceptance = useConflictAcceptance(conflicts);
  // The context menu (right-click or the ContextMenu key). "Edit here" calls the latest onEditHere through a ref: the
  // menu stays open across app renders, and an app-level handler closes over state that can change.
  const onEditHereRef = useRef(onEditHere);
  onEditHereRef.current = onEditHere;
  // Where the next in-context entry snaps the map's centre, in CLIENT px (the editing chrome mounts after the click and
  // moves the canvas, so a canvas-relative point would go stale): the double-click point, or where the menu opened.
  // Set just before onEditHere; the canvas's snap effect reads and clears it.
  const snapPointerRef = useRef<{ x: number; y: number } | null>(null);
  const menuPointRef = useRef<{ x: number; y: number } | null>(null);
  const requestEditHere = (map: string, point: { x: number; y: number } | null) => {
    snapPointerRef.current = point;
    onEditHereRef.current?.(map);
  };
  const contextMenu = useWorldContextMenu({
    canvasRef,
    onOpenMap,
    editItem: onEditHere ? (map) => ({ label: "Edit here", onSelect: () => requestEditHere(map, menuPointRef.current) }) : undefined,
    toggle: conflictAcceptance.toggle,
  });
  return { conflictAcceptance, contextMenu, snapPointerRef, menuPointRef, requestEditHere };
}
