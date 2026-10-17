import { useEffect, useState } from "react";
import "../styles.css";

type Mode = "free" | "name" | "species";
interface Refusal { message: string }
interface SignReply { kind: "empty" | "other" | "sign"; eventKind?: string; scriptLabel?: string; editable?: boolean; reason?: string; mode?: Mode | null; text?: string; handEdited?: boolean }

export interface SignEditorProps {
  mapName: string;
  x: number;
  y: number;
  anchor: DOMRect;
  hasObjectEvent?: boolean;
  onDone: () => void;
  onCancel: () => void;
  onSessionUpdated: (body: unknown) => void;
}

const SIGN_EDITOR_WIDTH = 300; // keep in sync with .sign-editor in styles.css
const isReply =(body: unknown): body is SignReply => !!body && typeof body === "object" && ["empty", "other", "sign"].includes((body as { kind?: string }).kind ?? "");
const refusals = (body: unknown): Refusal[] => body && typeof body === "object" && Array.isArray((body as { refusals?: unknown }).refusals) ? (body as { refusals: Refusal[] }).refusals : [];

/** Small, anchored editor for server-validated sign text. The server remains the source of truth for wrapping and character validation. */
export function SignEditor({ mapName, x, y, anchor, hasObjectEvent = false, onDone, onCancel, onSessionUpdated }: SignEditorProps) {
  const [reply, setReply] = useState<SignReply | null>(null);
  const [mode, setMode] = useState<Mode>("free");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/edit/${encodeURIComponent(mapName)}/sign/at?x=${x}&y=${y}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => null) }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok || !isReply(body)) { setError("Could not load this sign."); return; }
        setReply(body);
        if (body.kind === "sign") { setMode(body.mode ?? "free"); setText(body.text ?? ""); }
      })
      .catch(() => { if (!cancelled) setError("Could not load this sign."); });
    return () => { cancelled = true; };
  }, [mapName, x, y]);

  const submit = async (nextMode = mode, force = false) => {
    setSaving(true); setError(null);
    const body = { x, y, mode: nextMode, text: nextMode === "free" ? text : "", ...(reply?.kind === "sign" ? { scriptLabel: reply.scriptLabel } : {}), ...(force ? { force: true } : {}) };
    try {
      const r = await fetch(`/api/edit/${encodeURIComponent(mapName)}/sign/put`, { method: "POST", body: JSON.stringify(body) });
      const result: unknown = await r.json().catch(() => null);
      setSaving(false);
      const problems = refusals(result);
      if (!r.ok || problems.length > 0) { setError(problems[0]?.message ?? "Could not update sign."); return; }
      onSessionUpdated(result);
      onDone();
    } catch { setSaving(false); setError("Could not update sign."); }
  };

  const previewLines = (mode === "free" ? text : "Linked text preview").split(/\n\s*\n/).flatMap((paragraph, paragraphIndex) => {
    const lines = paragraph.split("\n").flatMap((sourceLine) => {
      const words = sourceLine.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) return [""];
      const wrapped: string[] = [];
      let line = "";
      for (const word of words) {
        if (line && line.length + word.length + 1 > 18) { wrapped.push(line); line = word; }
        else line = line ? `${line} ${word}` : word;
      }
      if (line) wrapped.push(line);
      return wrapped;
    });
    return paragraphIndex === 0 ? lines : ["", ...lines];
  });
  // Below the tile in the upper half of the window, above it in the lower half; max-height (CSS) keeps it on screen.
  const below = anchor.top < window.innerHeight / 2;
  const style = {
    left: Math.max(8, Math.min(anchor.left, window.innerWidth - SIGN_EDITOR_WIDTH - 8)),
    ...(below ? { top: anchor.bottom + 8 } : { bottom: window.innerHeight - anchor.top + 8 }),
    position: "fixed" as const, zIndex: 20,
  };
  const canEdit = reply?.kind === "empty" || (reply?.kind === "sign" && reply.editable);
  const action = reply?.kind === "sign" ? "Update" : "Place";
  return <div className="sign-editor" style={style} role="dialog" aria-modal="true" aria-label="Sign editor" onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
    <h2 className="sign-composer__title">Sign</h2>
    {error && <p role="alert" className="save-dialog__refusal-message">{error}</p>}
    {hasObjectEvent && <p>An object event is on this tile.</p>}
    {reply === null && !error ? <p>Loading sign...</p> : reply?.kind === "other" ? <p>This tile already has a {reply.eventKind} event</p> : reply?.kind === "sign" && !reply.editable ? <p>This sign's script is too complex to edit here: {reply.reason}</p> : canEdit && <>
      <fieldset><legend>Text mode</legend>
        {(["free", "name", "species"] as Mode[]).map((choice) => <label key={choice}><input type="radio" checked={mode === choice} onChange={() => setMode(choice)} /> {choice === "free" ? "Free text" : choice === "name" ? "Map name" : "Catchable species"}</label>)}
      </fieldset>
      {mode === "free" ? <label>Text<textarea aria-label="Text" value={text} onChange={(e) => setText(e.target.value)} /></label> : <p aria-label="Linked text preview">Linked {mode === "name" ? "map name" : "catchable species"} text is generated when saved.</p>}
      <pre aria-label="Preview">{previewLines.map((line, i) => <span key={i}>{line}{"\n"}</span>)}</pre>
      {reply?.kind === "sign" && reply.handEdited ? <div><button type="button" className="map-canvas__btn" disabled={saving} onClick={() => void submit(mode, true)}>Overwrite</button><button type="button" className="map-canvas__btn" disabled={saving} onClick={() => void submit("free", true)}>Free text</button></div> : <button type="button" className="map-canvas__btn sign-composer__btn--primary" disabled={saving} onClick={() => void submit()}>{saving ? "Saving..." : action}</button>}
    </>}
    <button type="button" className="map-canvas__btn" autoFocus onClick={onCancel}>Cancel</button>
  </div>;
}
