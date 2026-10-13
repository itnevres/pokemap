import { useEffect, useRef, useState } from "react";

export interface UseContextEditingArgs {
  selected: string | null;
  session: { isDirty: boolean; markClean(): void };
  leave(go: () => void): void;
  select(map: string): void;
  openSave(): void;
  strokeSettled(): Promise<void>;
}

export interface ContextEditing {
  contextMap: string | null;
  tileVersions: Record<string, number>;
  enter(map: string): void;
  requestExit(): void;
  onCommitted(): void;
  leaveContext(): void;
}

export function useContextEditing({ selected, session, leave, select, openSave, strokeSettled }: UseContextEditingArgs): ContextEditing {
  const [contextMap, setContextMap] = useState<string | null>(null);
  const [tileVersions, setTileVersions] = useState<Record<string, number>>({});
  const [exitPending, setExitPending] = useState(false);
  const exitRequested = useRef<object | null>(null);
  const leaveContext = () => {
    exitRequested.current = null;
    setExitPending(false);
    setContextMap(null);
  };

  useEffect(() => {
    if (contextMap !== null && selected !== contextMap) leaveContext();
  }, [selected, contextMap]);

  // Paint responses update React state: decide on the render after the chain settles, not its old closure.
  useEffect(() => {
    if (!exitPending) return;
    setExitPending(false);
    exitRequested.current = null;
    if (contextMap === null || selected !== contextMap) return;
    if (session.isDirty) openSave();
    else setContextMap(null);
  }, [exitPending, session.isDirty, contextMap, selected, openSave]);

  return {
    contextMap,
    tileVersions,
    enter(map) {
      const go = () => {
        if (map !== selected) select(map);
        setContextMap(map);
      };
      if (map === selected) go(); else leave(go);
    },
    requestExit() {
      if (exitRequested.current || contextMap === null) return;
      const request = {};
      exitRequested.current = request;
      strokeSettled().then(() => {
        if (exitRequested.current === request) setExitPending(true);
      });
    },
    onCommitted() {
      session.markClean();
      if (contextMap !== null && contextMap === selected) {
        setTileVersions((t) => ({ ...t, [contextMap]: (t[contextMap] ?? 0) + 1 }));
      }
    },
    leaveContext,
  };
}
