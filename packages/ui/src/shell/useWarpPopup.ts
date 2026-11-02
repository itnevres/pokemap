import { useEffect, useRef, useState } from "react";
import type { Mode } from "./adapter.js";

interface WarpPopupState {
  destination: string;
  source: string | null;
}

interface UseWarpPopupArgs {
  selected: string | null;
  leave(go: () => void): void;
  select(name: string): void;
  strokeSettled(): Promise<void>;
  blocked(): boolean;
  onOpen(): void;
  mode: Mode;
}

export function useWarpPopup({ selected, leave, select, strokeSettled, blocked, onOpen, mode }: UseWarpPopupArgs): {
  popup: WarpPopupState | null;
  open(dest: string): void;
  requestClose(): void;
} {
  const [popup, setPopup] = useState<WarpPopupState | null>(null);
  const [openPending, setOpenPending] = useState(false);
  const [closePending, setClosePending] = useState(false);
  const openRequested = useRef<{ dest: string; selected: string | null; mode: Mode } | null>(null);
  const closeRequested = useRef<object | null>(null);

  useEffect(() => {
    const request = openRequested.current;
    if (request && (request.selected !== selected || request.mode !== mode)) openRequested.current = null;
  }, [selected, mode]);

  // Paint replies update React state: decide on the render after the chain settles, not its old closure.
  useEffect(() => {
    if (!openPending) return;
    setOpenPending(false);
    const request = openRequested.current;
    openRequested.current = null;
    if (!request || popup || blocked() || request.selected !== selected || request.mode !== mode) return;
    const go = () => {
      onOpen();
      if (request.dest !== selected) select(request.dest);
      setPopup({ destination: request.dest, source: selected });
    };
    if (request.dest === selected) go(); else leave(go);
  }, [openPending, selected, mode, popup, blocked, leave, select, onOpen]);

  useEffect(() => {
    if (!closePending) return;
    setClosePending(false);
    const request = closeRequested.current;
    closeRequested.current = null;
    if (!request || !popup || selected !== popup.destination || blocked()) return;
    const close = () => setPopup(null);
    const source = popup.source;
    if (source === null || source === popup.destination) close();
    else leave(() => { select(source); close(); });
  }, [closePending, popup, selected, mode, blocked, leave, select]);

  useEffect(() => {
    if (!popup || selected === popup.destination) return;
    closeRequested.current = null;
    setClosePending(false);
    setPopup(null);
  }, [popup, selected]);

  useEffect(() => () => {
    openRequested.current = null;
    closeRequested.current = null;
  }, []);

  return {
    popup,
    open(dest) {
      if (blocked() || popup || openRequested.current) return;
      const request = { dest, selected, mode };
      openRequested.current = request;
      strokeSettled().then(() => {
        if (openRequested.current === request) setOpenPending(true);
      });
    },
    requestClose() {
      if (blocked() || !popup || closeRequested.current) return;
      const request = {};
      closeRequested.current = request;
      strokeSettled().then(() => {
        if (closeRequested.current === request) setClosePending(true);
      });
    },
  };
}
