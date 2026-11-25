import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { placeGroup } from "@pokemap/core/blockEdit/placement";
import type { BlockEditorSpec } from "../shell/adapter.js";
import type { BlockEditSession } from "./useEditSessionCore.js";
import { trapDialogFocus, useRestoreFocus } from "./dialogFocus.js";
import { SelectField } from "./AddEventDialog.js";
import { useBlockEditor } from "./blockEditor/useBlockEditor.js";
import { TilePicker } from "./blockEditor/TilePicker.js";
import { BlockGrid } from "./blockEditor/BlockGrid.js";

interface Usage {
  files: string[]; tilesets: string[];
  maps: { map: string; interior: number; border: number; block0AsBorder: number }[];
  sharedGrids: { file: string; maps: string[] }[];
}
const total = (entry: Usage["maps"][number]) => entry.interior + entry.border + entry.block0AsBorder;
export function usageLine(usage: Usage, map: string): string {
  const own = usage.maps.find(entry => entry.map === map) ?? usage.maps.find(entry => usage.sharedGrids.some(group => group.maps.includes(map) && group.maps.includes(entry.map)));
  const others = usage.maps.filter(entry => entry !== own && total(entry) > 0);
  const affected = new Set(usage.maps.filter(entry => total(entry) > 0).flatMap(entry => usage.sharedGrids.find(group => group.maps.includes(entry.map))?.maps ?? [entry.map]));
  return `Used ${own?.interior ?? 0} times on this map${own && own.border + own.block0AsBorder > 0 ? " (+ border)" : ""}, ${others.reduce((sum, entry) => sum + total(entry), 0)} times on ${others.length} other maps${usage.tilesets.length > 1 ? `; files shared by tilesets ${usage.tilesets.join(", ")}` : ""}; ${affected.size} maps affected`;
}

type Entry = { tile: number; palette: number; xFlip: boolean; yFlip: boolean };
type Palette = { square: number; palName: string; scope: "all" | "local" };
interface Draft extends Record<string, unknown> { tiles: number[]; collision: string[]; tilePalettes: string[]; palettes: Palette[]; entries: Entry[]; behavior: number; layerType: number }
interface Info { blockId: number; viaBorder: boolean; block: Draft; sheet: { url: string; tileIds: (number | null)[]; reservedTiles?: number[]; tilePalettes?: string[] }; options: Record<string, string[] | { name: string; value: number }[]>; usage: Usage }

function RawField({ label, value, numeric, onChange }: { label: string; value: string; numeric: boolean; onChange(value: string): void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return <label>{label}<input aria-label={label} value={text} onChange={event => {
    const next = event.target.value; setText(next);
    if (!numeric || /^\d+$/.test(next)) onChange(next);
  }} /></label>;
}

export function BlockEditorDialog(props: {
  map: string; target: { block: number } | { x: number; y: number }; from: "map" | "palette";
  spec: BlockEditorSpec; session: BlockEditSession; time?: string; onClose(): void; onApplied(): void;
}) {
  useRestoreFocus();
  const editor = useBlockEditor(props);
  const info = editor.info as Info | null, draft = editor.draft as Draft | null;
  const panel = useRef<HTMLDivElement>(null), prompt = useRef<HTMLDivElement>(null);
  const paletteControl = useRef<HTMLSelectElement>(null);
  const applyButton = useRef<HTMLButtonElement>(null), okButton = useRef<HTMLButtonElement>(null);
  const previousStatus = useRef(editor.status);
  const lastFocused = useRef<Element | null>(null);
  const [pending, setPending] = useState<{ square: number; palName: string } | null>(null);
  const promptWasOpen = useRef(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [square, setSquare] = useState(0), [layer, setLayer] = useState(0);
  const [modifiers, setModifiers] = useState({ ctrl: false, shift: false });
  const latest = useRef({ editor, pending, onClose: props.onClose });
  latest.current = { editor, pending, onClose: props.onClose };
  const topmost = () => [...document.querySelectorAll('[aria-modal="true"]')].at(-1);
  useLayoutEffect(() => {
    const rememberFocus = (event: FocusEvent) => {
      if (panel.current?.contains(event.target as Node)) lastFocused.current = event.target as Element;
    };
    document.addEventListener("focusin", rememberFocus);
    return () => document.removeEventListener("focusin", rememberFocus);
  }, []);
  useLayoutEffect(() => {
    const previous = previousStatus.current;
    if (pending || topmost() !== panel.current) return;
    previousStatus.current = editor.status;
    if (editor.status === "confirming" && previous !== "confirming") applyButton.current?.focus();
    else if (previous === "confirming" && editor.status === "ready") okButton.current?.focus();
    else if (lastFocused.current && !lastFocused.current.isConnected) panel.current?.focus();
  }, [editor.status, pending]);
  useLayoutEffect(() => {
    const element = panel.current;
    let active = true;
    const focus = (repair = false) => {
      if (!active || !element || topmost() !== element || (repair && element.contains(document.activeElement))) return;
      const first = [...element.querySelectorAll<HTMLElement>("button,input,select,textarea,[tabindex]")].find(control => !control.matches(":disabled") && control.tabIndex >= 0 && !control.hidden);
      (first ?? element).focus();
    };
    focus(); queueMicrotask(() => focus(true));
    return () => { active = false; };
  }, [Boolean(info), editor.status === "error"]);
  useLayoutEffect(() => {
    if (pending && topmost() === prompt.current) prompt.current?.querySelector<HTMLButtonElement>("button")?.focus();
    else if (promptWasOpen.current && editor.status !== "confirming" && topmost() === panel.current) paletteControl.current?.focus();
    promptWasOpen.current = pending !== null;
  }, [pending]);
  const dismissPrompt = () => { setPending(null); };
  useLayoutEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || (topmost() !== panel.current && topmost() !== prompt.current)) return;
      event.preventDefault(); event.stopPropagation();
      const current = latest.current;
      if (current.pending) setPending(null);
      else if (current.editor.status === "confirming") current.editor.cancelConfirm();
      else if (current.editor.status !== "applying") current.onClose();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);
  useEffect(() => {
    const keys = (event: globalThis.KeyboardEvent) => setModifiers({ ctrl: event.ctrlKey, shift: event.shiftKey });
    const blur = () => setModifiers({ ctrl: false, shift: false });
    window.addEventListener("keydown", keys); window.addEventListener("keyup", keys); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", keys); window.removeEventListener("keyup", keys); window.removeEventListener("blur", blur); };
  }, []);
  const gbc = props.spec.family === "gbc", digits = gbc ? 2 : 3;
  const hex = (value: number, count = digits) => value.toString(16).toUpperCase().padStart(count, "0");
  const entryIndex = layer * 4 + square;
  const entry = draft?.entries?.[entryIndex];
  // Placed tile's sheet palette first, then the palette the loaded block had for this square.
  const paletteName = (index: number) => draft?.palettes.find(item => item.square === index)?.palName
    ?? (info?.sheet.tilePalettes?.[draft?.tiles[index] ?? -1] || info?.block.tilePalettes[index]);
  const tiles = draft ? gbc ? draft.tiles : draft.entries.slice(layer * 4, layer * 4 + 4).map(item => item.tile) : [];
  const updateEntry = (change: Partial<Entry>) => {
    if (draft) editor.setDraft({ ...draft, entries: draft.entries.map((item, index) => index === entryIndex ? { ...item, ...change } : item) });
  };
  const checkUsage = editor.check?.usage as Usage | undefined;
  const affected = checkUsage?.maps.filter(item => total(item) > 0) ?? [];
  return <div className="warp-modal__backdrop" onMouseDown={event => {
    if (event.target === event.currentTarget && topmost() === panel.current && editor.status !== "applying") props.onClose();
  }}>
    <div ref={panel} className="warp-modal__panel block-editor" role="dialog" aria-modal="true" aria-label={info ? `Edit ${gbc ? "block" : "metatile"} $${hex(info.blockId)}` : "Edit block"} tabIndex={-1} onKeyDown={event => {
      if (topmost() !== panel.current) return;
      if (event.key === "Tab" && event.target === event.currentTarget) {
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button,input,select,textarea,[tabindex]")].filter(control => !control.matches(":disabled") && control.tabIndex >= 0 && !control.hidden);
        event.preventDefault(); (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
      } else trapDialogFocus(event);
    }}>
      {editor.status === "loading" ? <p>Loading block...</p> : editor.status === "error" ? <><p role="alert">{editor.message}</p><button type="button" onClick={props.onClose}>Close</button></> : info && draft && <>
        <fieldset className="block-editor__editing" disabled={pending !== null}>
        {info.viaBorder && <p role="note">This cell is block 0; editing the border block ${hex(info.blockId, 2)}</p>}
        {editor.previewSrc !== null && <img className="block-editor__preview" alt="Block preview" src={editor.previewSrc} />}
        <p className="block-editor__usage" data-testid="block-editor-usage">{usageLine(info.usage, props.map)}</p>
        {editor.check?.warnings.map((warning, index) => <p role="status" key={index}>{warning}</p>)}
        {modifiers.ctrl && <p role="status" data-testid="block-editor-mode">Place {modifiers.shift && props.spec.modes.includes("4x4") ? "4x4" : "2x2"}</p>}
        <fieldset className="block-editor__editing" disabled={editor.status === "applying"}>
        <TilePicker url={`${info.sheet.url}${gbc ? "" : `&pal=${entry?.palette ?? 0}`}`} tileIds={info.sheet.tileIds} reservedTiles={gbc ? info.sheet.reservedTiles : undefined} digits={digits} selected={selected} onSelect={setSelected} disabled={editor.status === "applying" || pending !== null} />
        <div className="block-editor__squares">
          {!gbc && <div role="tablist" aria-label="Layers">{["Bottom", "Top"].map((name, index) => <button type="button" role="tab" key={name} aria-selected={layer === index} onClick={() => setLayer(index)}>{name}</button>)}</div>}
          <BlockGrid tiles={tiles} width={props.spec.width} digits={digits} current={square} onSquare={(index, event) => {
            setSquare(index);
            if (selected === null) return;
            const mode = event.ctrlKey && event.shiftKey && props.spec.modes.includes("4x4") ? "4x4" : event.ctrlKey ? "2x2" : "1x1";
            const next = placeGroup(tiles, props.spec.width, { x: index % props.spec.width, y: Math.floor(index / props.spec.width) }, selected, mode, info.sheet.tileIds.length, i => info.sheet.tileIds[i] ?? null);
            editor.setDraft(gbc ? { ...draft, tiles: next } : { ...draft, entries: draft.entries.map((item, i) => i >= layer * 4 && i < layer * 4 + 4 ? { ...item, tile: next[i - layer * 4]! } : item) });
          }} />
          <div className="block-editor__controls">
            {props.spec.squareControls.includes("palette") && <label>Palette<select ref={paletteControl} aria-label="Palette" value={gbc ? paletteName(square) : entry?.palette} onChange={event => {
              const value = event.target.value;
              if (gbc) { if (value !== paletteName(square)) setPending({ square, palName: value }); }
              else updateEntry({ palette: Number(value) });
            }}>{(gbc ? info.options.palettes as string[] : Array.from({ length: 13 }, (_, i) => String(i))).map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
            {props.spec.squareControls.includes("flip") && <>{(["xFlip", "yFlip"] as const).map((key, index) => <label key={key}><input type="checkbox" aria-label={index === 0 ? "X flip" : "Y flip"} checked={entry?.[key] ?? false} onChange={event => updateEntry({ [key]: event.target.checked })} />{index === 0 ? "X flip" : "Y flip"}</label>)}</>}
          </div>
        </div>
        <div className="block-editor__fields">{props.spec.blockFields.map(field => {
          const collisionIndex = Number(field.key.slice("collision".length));
          const value = gbc ? draft.collision[collisionIndex]! : draft[field.key] as number;
          const options = info.options[field.optionsKey]!;
          const values = gbc ? options as string[] : [...new Set((options as { name: string; value: number }[]).map(option => String(option.value)))];
          const initialValue = gbc ? info.block.collision[collisionIndex]! : info.block[field.key] as number;
          const change = (text: string, raw = false) => {
            if (!text && !raw) return;
            editor.setDraft(gbc ? { ...draft, collision: draft.collision.map((item, index) => index === collisionIndex ? text : item) } : { ...draft, [field.key]: Number(text) });
          };
          return <div key={field.key}>{values.includes(String(initialValue)) ? <SelectField label={field.label} options={values} value={String(value)} disabled={false} onChange={change} optionLabel={gbc ? undefined : text => (options as { name: string; value: number }[]).filter(option => String(option.value) === text).map(option => option.name).join(" / ") || text} /> : <RawField label={field.label} value={String(value)} numeric={!gbc} onChange={text => change(text, true)} />}</div>;
        })}</div>
        </fieldset>
        {editor.message && <p role="alert">{editor.message}</p>}
        {editor.status === "confirming" && checkUsage ? <section aria-label="Confirm edit">
          <p className="block-editor__usage">{usageLine(checkUsage, props.map)}</p>
          <ul className="block-editor__usage">{affected.slice(0, 8).map(item => <li key={item.map}>{item.map}: {item.interior} interior, {item.border + item.block0AsBorder} border</li>)}{affected.length > 8 && <li>and {affected.length - 8} more</li>}</ul>
          <button ref={applyButton} type="button" onClick={editor.confirm}>Apply</button><button type="button" onClick={editor.cancelConfirm}>Cancel</button>
        </section> : <div className="block-editor__actions">
          <button ref={okButton} type="button" disabled={editor.status !== "ready"} onClick={editor.ok}>OK</button>
          <button type="button" disabled={editor.status !== "ready" || editor.saveAsNewRefusal !== null} onClick={editor.saveAsNew}>Save as new</button>
          {editor.saveAsNewRefusal !== null && <span data-testid="block-editor-refusal">{editor.saveAsNewRefusal}</span>}
          <button type="button" disabled={editor.status === "applying"} onClick={props.onClose}>Cancel</button>
        </div>}
        </fieldset>
        {pending && <div ref={prompt} className="block-editor__prompt" role="dialog" aria-modal="true" aria-label="Palette scope" tabIndex={-1} onKeyDown={trapDialogFocus}>
          <p>Apply palette {pending.palName} to all uses, or only this square locally?</p>
          {(["all", "local"] as const).map(scope => <button type="button" key={scope} onClick={() => {
            editor.setDraft({ ...draft, palettes: [...draft.palettes.filter(item => item.square !== pending.square), { ...pending, scope }] }); dismissPrompt();
          }}>{scope === "all" ? "All" : "Local"}</button>)}
          <button type="button" onClick={dismissPrompt}>Cancel</button>
        </div>}
      </>}
    </div>
  </div>;
}
