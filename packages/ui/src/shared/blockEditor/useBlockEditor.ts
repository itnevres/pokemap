import { useEffect, useRef, useState } from "react";
import type { BlockEditorSpec } from "../../shell/adapter.js";
import { EditSessionError, type BlockCheckReply, type BlockEditSession } from "../useEditSessionCore.js";
import { errorMessage } from "@pokemap/core/errorMessage";

export type BlockEditorStatus = "loading" | "ready" | "checking" | "confirming" | "applying" | "error";

interface EditorArgs {
  map: string;
  target: { block: number } | { x: number; y: number };
  from: "map" | "palette";
  spec: BlockEditorSpec;
  session: BlockEditSession;
  time?: string;
  onClose(): void;
  onApplied(): void;
}
type Draft = Record<string, unknown>;
interface BlockInfo extends Record<string, unknown> {
  blockId: number;
  revision: string;
  block: Draft;
}
type Mode = "ok" | "saveAsNew";
const STALE = "The block changed since this editor opened; reopen it";
const editorErrorMessage = (error: unknown) => error instanceof EditSessionError && error.code === "STALE"
  ? STALE : errorMessage(error);

export function useBlockEditor(args: EditorArgs): {
  status: BlockEditorStatus; info: any | null; draft: Draft | null; previewSrc: string | null;
  check: BlockCheckReply | null; message: string | null; saveAsNewRefusal: string | null;
  setDraft(next: Draft): void; ok(): void; confirm(): void; cancelConfirm(): void; saveAsNew(): void;
} {
  const [status, setStatus] = useState<BlockEditorStatus>("loading");
  const [info, setInfo] = useState<BlockInfo | null>(null);
  const [draft, updateDraft] = useState<Draft | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [check, setCheck] = useState<BlockCheckReply | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saveAsNewRefusal, setSaveAsNewRefusal] = useState<string | null>(null);
  const latest = useRef({ args, info, draft });
  latest.current = { args, info, draft };
  const busy = useRef<BlockEditorStatus>("loading");
  const checkCounter = useRef(0);
  const previewCounter = useRef(0);
  const generation = useRef(0);
  const checkedRequest = useRef<{ payload: ReturnType<typeof request>; revision: string } | null>(null);
  const changeStatus = (next: BlockEditorStatus) => { busy.current = next; setStatus(next); };
  const target = "block" in args.target ? `block=${args.target.block}` : `x=${args.target.x}&y=${args.target.y}`;
  const url = `/api/edit/${encodeURIComponent(args.map)}/block?${target}${args.time === undefined ? "" : `&time=${encodeURIComponent(args.time)}`}`;

  useEffect(() => {
    let cancelled = false;
    changeStatus("loading");
    setInfo(null);
    updateDraft(null);
    latest.current.info = null;
    latest.current.draft = null;
    setMessage(null);
    setSaveAsNewRefusal(null);
    setCheck(null);
    setPreviewSrc(null);
    void (async () => {
      try {
        const reply = await fetch(url);
        const body = await reply.json().catch(() => null) as BlockInfo & { error?: unknown } | null;
        if (cancelled) return;
        if (reply.status !== 200) {
          setMessage(typeof body?.error === "string" ? body.error : `GET ${url} -> ${reply.status}`);
          changeStatus("error");
          return;
        }
        const loaded = body as BlockInfo;
        const initial = latest.current.args.spec.family === "gbc" ? { ...loaded.block, palettes: [] } : loaded.block;
        latest.current.info = loaded;
        latest.current.draft = initial;
        setInfo(loaded);
        updateDraft(initial);
        changeStatus("ready");
      } catch (error) {
        if (!cancelled) { setMessage(editorErrorMessage(error)); changeStatus("error"); }
      }
    })();
    return () => { cancelled = true; generation.current++; checkCounter.current++; previewCounter.current++; checkedRequest.current = null; };
  }, [url]);

  function request(mode: Mode) {
    const { args: current, info: loaded, draft: edited } = latest.current;
    const cell = current.from === "map" && "x" in current.target ? { cell: { x: current.target.x, y: current.target.y } } : {};
    return { request: current.spec.family === "gbc" ? {
      blockId: loaded!.blockId, mode, from: current.from, ...cell,
      draft: { tiles: edited!.tiles, collision: edited!.collision, palettes: edited!.palettes },
    } : {
      metatileId: loaded!.blockId, mode, from: current.from, ...cell,
      draft: { entries: edited!.entries, behavior: edited!.behavior, layerType: edited!.layerType },
    } };
  }

  useEffect(() => {
    if (info === null || draft === null) return;
    const timer = setTimeout(() => {
      const call = ++previewCounter.current;
      void latest.current.args.session.blockPreview(request("ok")).then((reply) => {
        if (call === previewCounter.current && reply !== null) setPreviewSrc(`data:image/png;base64,${reply.png}`);
      }).catch(() => undefined);
    }, 150);
    return () => { clearTimeout(timer); previewCounter.current++; };
  }, [draft, info, url]);

  async function apply(snapshot: { payload: ReturnType<typeof request>; revision: string }) {
    const owner = generation.current;
    checkedRequest.current = null;
    changeStatus("applying");
    try {
      const applied = await latest.current.args.session.blockApply(snapshot.payload, snapshot.revision);
      if (owner !== generation.current) return;
      if (applied) {
        latest.current.args.onApplied();
        latest.current.args.onClose();
      } else changeStatus("ready");
    } catch (error) {
      if (owner !== generation.current) return;
      setMessage(editorErrorMessage(error));
      changeStatus("ready");
    }
  }

  async function runCheck(mode: Mode) {
    if (busy.current !== "ready") return;
    changeStatus("checking");
    setMessage(null);
    const call = ++checkCounter.current;
    const snapshot = { payload: request(mode), revision: latest.current.info!.revision };
    checkedRequest.current = snapshot;
    try {
      const reply = await latest.current.args.session.blockCheck(snapshot.payload, snapshot.revision);
      if (call !== checkCounter.current) return;
      if (reply === null) { checkedRequest.current = null; changeStatus("ready"); }
      else if (reply.refusal) {
        checkedRequest.current = null;
        const refusal = reply.refusal.code === "STALE" ? STALE : reply.refusal.error;
        if (mode === "saveAsNew") setSaveAsNewRefusal(refusal);
        else setMessage(refusal);
        changeStatus("ready");
      } else if (mode === "ok" && reply.confirm) {
        setCheck(reply);
        changeStatus("confirming");
      } else await apply(snapshot);
    } catch (error) {
      if (call !== checkCounter.current) return;
      checkedRequest.current = null;
      setMessage(editorErrorMessage(error));
      changeStatus("ready");
    }
  }

  function cancelConfirm() {
    if (busy.current !== "checking" && busy.current !== "confirming") return;
    checkCounter.current++;
    checkedRequest.current = null;
    changeStatus("ready");
  }

  return {
    status, info, draft, previewSrc, check, message, saveAsNewRefusal,
    setDraft(next) { latest.current.draft = next; updateDraft(next); setSaveAsNewRefusal(null); cancelConfirm(); },
    ok() { void runCheck("ok"); },
    confirm() { if (busy.current === "confirming" && checkedRequest.current !== null) void apply(checkedRequest.current); },
    cancelConfirm,
    saveAsNew() { void runCheck("saveAsNew"); },
  };
}
