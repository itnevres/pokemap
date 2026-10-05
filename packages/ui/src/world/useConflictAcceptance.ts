import { useState } from "react";
import type { WireConflict } from "@pokemap/core/src/world/conflictAcceptance.js";
import { fetchGuarded } from "../hooks/useGuardedFetch.js";
import { isAcceptedConflictsResponse } from "./conflictAcceptance.js";

/** Acceptance state only; the canvases own the context menu that triggers `toggle`. */
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
