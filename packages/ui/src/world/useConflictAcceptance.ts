import { useEffect, useState } from "react";
import type { WireConflict } from "@pokemap/core/src/world/conflictAcceptance.js";
import { fetchGuarded } from "../hooks/useGuardedFetch.js";
import { isAcceptedConflictsResponse } from "./conflictAcceptance.js";

export interface ConflictActionState { key: string; accepted: boolean; x: number; y: number }

export function useConflictAcceptance(conflicts: readonly WireConflict[] | undefined) {
  const [acceptedKeys, setAcceptedKeys] = useState<string[] | null>(null);
  const [action, setAction] = useState<ConflictActionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!action) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setAction(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [action]);
  const isAccepted = (conflict: WireConflict) => acceptedKeys === null ? conflict.accepted : acceptedKeys.includes(conflict.key);
  const acceptedCount = conflicts?.filter(isAccepted).length ?? 0;
  const save = () => {
    if (!action) return;
    setError(null);
    fetchGuarded("/api/world/conflicts/accept", isAcceptedConflictsResponse, undefined, {
      method: "POST", body: JSON.stringify({ key: action.key, accepted: !action.accepted }),
    }).then((response) => {
      setAcceptedKeys(response.acceptedConflicts);
      setAction(null);
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  };
  return { action, setAction, error, setError, isAccepted, acceptedCount, acceptedKeys, save };
}
