import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AddEventForm, CopyPreview, EventKind, EventOptions, MapEventOptions, NameChoice, ObjectType, TextChoice } from "@pokemap/core/src/addEvent/types.js";
import type { AddEventContext, AddEventFieldAdapter, FieldSpec } from "../shell/adapter.js";
import { useEventOptions, type EventOptionsQuery } from "./useEventOptions.js";
import { useVisit } from "./useVisit.js";
import { trapDialogFocus, useRestoreFocus } from "./dialogFocus.js";

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const titles: Record<EventKind, string> = { object: "Object", warp: "Warp", coord: "Coord Event", bg: "BG Event" };
const stale = (error: unknown) => !!error && typeof error === "object" && "stale" in error && error.stale === true;
const errorText = (error: unknown) => error instanceof Error ? error.message : "Could not add event.";

// Save is a shell sibling of the workspace. A registration exposes only the live new warp
// destinations. Save rechecks return routes from staged server options, so undo/redo need no note history.
export interface ReturnWarpIdentity { dest: string; warp: string; x: number; y: number }
interface ReturnWarpSource { destinations: ReturnWarpIdentity[]; baseline: ReturnWarpIdentity[]; maps: string[] }
const returnWarpSources = new Map<string, ReturnWarpSource>();
const returnWarpListeners = new Set<() => void>();
export function subscribeReturnWarpSources(listener: () => void): () => void {
  returnWarpListeners.add(listener);
  return () => { returnWarpListeners.delete(listener); };
}
export function registerReturnWarpSource(mapName: string, destinations: ReturnWarpIdentity[], baseline: ReturnWarpIdentity[], maps: string[]): () => void {
  const source = { destinations, baseline, maps };
  returnWarpSources.set(mapName, source);
  for (const listener of returnWarpListeners) listener();
  return () => {
    if (returnWarpSources.get(mapName) !== source) return;
    returnWarpSources.delete(mapName);
    for (const listener of returnWarpListeners) listener();
  };
}
export async function loadReturnWarpNotes(mapName: string): Promise<string[]> {
  const source = returnWarpSources.get(mapName);
  if (!source) return [];
  const canonical = (name: string) => name.replace(/^MAP_/, "").replace(/_/g, "").toLowerCase();
  const identity = (warp: ReturnWarpIdentity) => JSON.stringify([warp.dest, warp.warp, warp.x, warp.y]);
  const baseline = source.baseline.map(identity);
  const added = source.destinations.filter(warp => {
    const i = baseline.indexOf(identity(warp));
    if (i < 0) return true;
    baseline.splice(i, 1); return false;
  });
  const notes = await Promise.all([...new Set(added.map(w => w.dest))].map(async destination => {
    const display = source.maps.find(name => canonical(name) === canonical(destination)) ?? destination;
    const r = await fetch(`/api/event-options/${encodeURIComponent(mapName)}?dest=${encodeURIComponent(display)}`);
    const body: unknown = await r.json();
    if (!r.ok || !body || typeof body !== "object" || !("returnsTo" in body) || typeof body.returnsTo !== "boolean") throw new Error("Could not check return warps.");
    return body.returnsTo ? null : `${display} has no warp back to ${mapName}; add one there`;
  }));
  // A changed/unmounted workspace invalidates the answer, including project reload and A -> B -> A.
  return returnWarpSources.get(mapName) === source ? notes.filter((n): n is string => n !== null) : [];
}

export interface AddEventDialogProps {
  adapter: AddEventFieldAdapter;
  mapName: string; kind: EventKind; x: number; y: number;
  initialFields?: Record<string, string>;
  createEvent(form: AddEventForm): Promise<{ kind: EventKind; index: number } | null>;
  onCreated(created: { kind: EventKind; index: number }): void;
  onCancel(): void;
  onBusyChange?(busy: boolean): void;
}

/** One dialog implementation for both engines; only field descriptions/defaults differ. */
export function AddEventDialog(props: AddEventDialogProps) {
  useRestoreFocus();
  const visit = useVisit(props.mapName);
  const optionsApi = useEventOptions(props.mapName, visit);
  const query = useRef<{ owner: string; value: EventOptionsQuery }>({ owner: "", value: {} });
  const queryOwner = JSON.stringify([props.mapName, props.x, props.y]);
  if (query.current.owner !== queryOwner) query.current = { owner: queryOwner, value: { x: props.x, y: props.y } };
  const load = useCallback((next = query.current.value) => {
    query.current.value = next;
    return optionsApi.load(next);
  }, [optionsApi.load]);
  const api = { ...optionsApi, load };
  // A successful create invalidates options before its promise resolves. Keep the form mounted
  // through that refresh so its submit continuation can close/select, and refusals keep typed fields.
  const loaded = useRef<{ mapName: string; options: EventOptions; map: MapEventOptions } | null>(null);
  if (loaded.current?.mapName !== props.mapName) loaded.current = null;
  if (api.project && api.map) loaded.current = { mapName: props.mapName, options: api.project, map: api.map };
  const context = loaded.current;
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const cancelRef = useRef(props.onCancel);
  cancelRef.current = props.onCancel;
  useLayoutEffect(() => {
    const element = panel.current;
    let active = true;
    const focus = (repairOnly: boolean) => {
      if (!active || !element || !visit.isCurrent() || [...document.querySelectorAll('[aria-modal="true"]')].at(-1) !== element) return;
      if (repairOnly && element.contains(document.activeElement)) return;
      const first = [...element.querySelectorAll<HTMLElement>("button,input,select,textarea,[tabindex]")].find(control => !control.matches(":disabled") && control.tabIndex >= 0 && !control.hidden);
      (first ?? element).focus();
    };
    focus(false);
    // A canvas pointer event can apply its native focus after React's layout effect.
    // Recheck after that event, and cancel the first StrictMode setup's queued work.
    queueMicrotask(() => focus(true));
    return () => { active = false; };
  }, [Boolean(context), props.mapName, props.kind, props.x, props.y]);
  useLayoutEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || [...document.querySelectorAll('[aria-modal="true"]')].at(-1) !== panel.current) return;
      event.preventDefault(); event.stopPropagation();
      if (!busy.current) cancelRef.current();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);
  useEffect(() => {
    if (api.project) return;
    let active = true;
    void api.load().catch((e: unknown) => { if (active && visit.isCurrent() && !stale(e)) setError(errorText(e)); });
    return () => { active = false; };
  }, [api.load, api.project, props.mapName, props.x, props.y]);
  const topmost = () => [...document.querySelectorAll('[aria-modal="true"]')].at(-1) === panel.current;
  const cancel = () => { if (!busy.current && topmost()) props.onCancel(); };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || !topmost()) return;
    if (event.key === "Tab" && panel.current && event.target === panel.current) {
      const controls = [...panel.current.querySelectorAll<HTMLElement>("button,input,select,textarea,[tabindex]")].filter(control => !control.matches(":disabled") && control.tabIndex >= 0 && !control.hidden);
      event.preventDefault(); (event.shiftKey ? controls.at(-1) : controls[0])?.focus(); return;
    }
    trapDialogFocus(event);
  };
  return <div className="warp-modal__backdrop add-event-dialog__backdrop" onMouseDown={e => { if (e.target === e.currentTarget) cancel(); }}>
    <div ref={panel} className="warp-modal__panel add-event-dialog" role="dialog" aria-modal="true" aria-label={`Add ${titles[props.kind]} at (${props.x}, ${props.y})`} tabIndex={-1} onKeyDown={keyDown}>
      <h2>Add {titles[props.kind]} at ({props.x}, {props.y})</h2>
      {context ? <EventForm key={`${props.mapName}:${props.kind}:${props.x}:${props.y}`} {...props} api={api} ctx={{ mapName: props.mapName, x: props.x, y: props.y, options: context.options, map: context.map }} isCurrent={visit.isCurrent} busyRef={busy} /> : <>
        {error ? <p role="alert">{error}</p> : <p role="status">Loading event options...</p>}
        <button type="button" className="map-canvas__btn" onClick={cancel}>Cancel</button>
      </>}
    </div>
  </div>;
}

function SelectField({ label, options, value, onChange, disabled, optionLabel }: { label: string; options: string[]; value: string; onChange(value: string): void; disabled: boolean; optionLabel?(value: string): string }) {
  const [query, setQuery] = useState("");
  if (!options.length) return <label>{label}<input aria-label={label} disabled={disabled} value={value} onChange={e => onChange(e.target.value)} /></label>;
  const matches = options.filter(option => (optionLabel?.(option) ?? option).toLowerCase().includes(query.toLowerCase()));
  return <div className="add-event-dialog__select">
    {options.length > 20 && <label>Search {label}<input aria-label={`Search ${label}`} value={query} disabled={disabled} onChange={e => {
      const next = e.target.value; setQuery(next);
      if (value && !(optionLabel?.(value) ?? value).toLowerCase().includes(next.toLowerCase())) onChange("");
    }} /></label>}
    <label>{label}<select aria-label={label} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      <option value="">Choose...</option>
      {matches.map(option => <option key={option} value={option}>{optionLabel?.(option) ?? option}</option>)}
    </select></label>
  </div>;
}

type OptionsApi = ReturnType<typeof useEventOptions>;
function EventForm(props: AddEventDialogProps & { api: OptionsApi; ctx: AddEventContext; isCurrent(): boolean; busyRef: { current: boolean } }) {
  const { adapter, kind, ctx, api } = props;
  const [objectType, setObjectType] = useState<ObjectType>("npc");
  const [values, setValues] = useState(() => ({ ...adapter.addEventDefaults(kind, "npc", ctx), ...props.initialFields }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<CopyPreview | null>(null);
  const sequence = useRef<Record<string, number>>({});
  const alive = useRef(true);
  const [destinationReady, setDestinationReady] = useState(kind !== "warp");
  const querySequence = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const current = () => alive.current && props.isCurrent();
  const fields = adapter.addEventFields(kind, objectType, ctx).filter(f => !f.showIf || f.showIf(values));
  const set = (key: string, value: string) => { setValues(v => ({ ...v, [key]: value })); setError(null); };
  const changeType = (type: ObjectType) => {
    sequence.current = Object.fromEntries(Object.entries(sequence.current).map(([key, n]) => [key, n + 1]));
    setPreviewing({}); setCopied(null); setObjectType(type); setValues({ ...adapter.addEventDefaults(kind, type, ctx), ...props.initialFields }); setError(null);
  };
  const retire = (key: string) => { sequence.current[key] = (sequence.current[key] ?? 0) + 1; setPreviewing(v => ({ ...v, [key]: false })); };
  const changeMode = (key: string, mode: string) => {
    retire(key);
    setValues(v => ({ ...v, [`${key}Mode`]: mode, [`${key}From`]: "",
      ...(mode === "new" && key !== "flag" && key !== "varName" ? { [`${key}Text`]: "", ...(key === "script" ? { scriptBody: "" } : {}) } : {}),
    }));
    setError(null); if (key === "script") setCopied(null);
  };
  const preview = async (key: string, from: string) => {
    const ticket = (sequence.current[key] ?? 0) + 1; sequence.current[key] = ticket;
    set(`${key}From`, from); if (key === "script") setCopied(null); else set(`${key}Text`, "");
    setPreviewing(v => ({ ...v, [key]: !!from })); if (!from) return;
    const valid = () => current() && sequence.current[key] === ticket;
    try {
      if (key === "script") {
        const result = await api.copy(from);
        if (!valid()) return;
        if (!result || typeof result.body !== "string" || typeof result.label !== "string" || !result.texts || typeof result.texts !== "object" || Array.isArray(result.texts) || Object.values(result.texts).some(t => typeof t !== "string")) throw new Error("Invalid script preview response");
        setCopied(result); setValues(v => ({ ...v, scriptBody: result.body, scriptLabel: v.scriptLabel || adapter.addEventDefaults(kind, objectType, ctx).scriptLabel! }));
      } else {
        const result = await api.text(from);
        if (!valid()) return;
        if (!result || typeof result.text !== "string" || typeof result.label !== "string") throw new Error("Invalid text preview response");
        setValues(v => ({ ...v, [`${key}Text`]: result.text }));
      }
    } catch (e) { if (valid() && !stale(e)) setError(errorText(e)); }
    finally { if (valid()) setPreviewing(v => ({ ...v, [key]: false })); }
  };
  // load() itself drops responses from older queries. Keep Add disabled until this destination's query settles.
  useEffect(() => {
    if (kind !== "warp") return;
    const ticket = ++querySequence.current; setDestinationReady(false);
    if (!values.destMap) return;
    void api.load({ x: props.x, y: props.y, dest: values.destMap }).then(() => {
      if (current() && querySequence.current === ticket) setDestinationReady(true);
    }).catch((e: unknown) => { if (current() && querySequence.current === ticket && !stale(e)) setError(errorText(e)); });
  }, [kind, values.destMap, api.load, props.x, props.y]);
  useEffect(() => {
    if (kind === "warp" && destinationReady && !ctx.map.warps.some(w => String(w.n) === values.destWarp)) setValues(v => ({ ...v, destWarp: String(ctx.map.warps[0]?.n ?? "") }));
  }, [kind, destinationReady, ctx.map, values.destWarp]);

  const textKeys = ["seen", "beaten", "after"] as const;
  const required = (field: FieldSpec): boolean => {
    const key = field.key, value = values[key] ?? "";
    if (field.kind !== "source") {
      if ((key === "objectConst" || key === "elevation") && !value) return true;
      if (!value.trim()) return false;
      if (["label", "objectConst"].includes(key)) return identifier.test(value);
      if (field.kind === "number") return /^-?\d+$/.test(value);
      if (field.options?.length) return field.options.includes(value);
      if (field.kind === "select") return key === "destWarp" ? /^-?\d+$/.test(value) : key === "trainer" && adapter.family === "gbc" ? /^[A-Za-z_]\w*,[A-Za-z_]\w*$/.test(value) : identifier.test(value) || (key === "palette" && /^\d+$/.test(value));
      return true;
    }
    const mode = values[`${key}Mode`] ?? "new";
    if (key === "flag" || key === "varName") return mode === "new" ? identifier.test(values[`${key}Name`] ?? "") : !!value && (field.options?.length ? field.options.includes(value) : identifier.test(value));
    if (key === "script") {
      if (mode === "existing") return !!value && (field.options?.length ? field.options.includes(value) : identifier.test(value));
      if (!identifier.test(values.scriptLabel ?? "")) return false;
      return mode === "new" ? !!values.scriptText?.trim() : !!values.scriptFrom && !!copied && !!values.scriptBody?.trim();
    }
    return !!values[`${key}Text`]?.trim() && (mode !== "copy" || !!values[`${key}From`]);
  };
  const invalid = fields.some(f => !required(f)) || Object.values(previewing).some(Boolean) || !destinationReady;
  const submit = async () => {
    if (props.busyRef.current || invalid) return;
    props.busyRef.current = true; setBusy(true); props.onBusyChange?.(true); setError(null);
    const form: AddEventForm = { kind, x: props.x, y: props.y, ...(kind === "object" ? { objectType } : {}), fields: {} };
    for (const f of fields) if (f.kind !== "source" && values[f.key] !== "" && values[f.key] !== undefined) form.fields[f.key] = values[f.key]!;
    const nameChoice = (key: string): NameChoice => values[`${key}Mode`] === "new" ? { mode: "new", name: values[`${key}Name`]! } : { mode: "existing", name: values[key]! };
    if (fields.some(f => f.key === "flag")) form.flag = nameChoice("flag");
    if (fields.some(f => f.key === "varName")) form.varName = nameChoice("varName");
    if (fields.some(f => f.key === "script")) {
      form.script = values.scriptMode === "existing" ? { mode: "existing", label: values.script! }
        : values.scriptMode === "copy" ? { mode: "copy", from: values.scriptFrom!, label: values.scriptLabel!, body: values.scriptBody!, texts: copied?.texts ?? {} }
        : { mode: "new", label: values.scriptLabel!, text: values.scriptText! };
    }
    if (objectType === "trainer" && kind === "object") {
      const text = (key: typeof textKeys[number]): TextChoice => values[`${key}Mode`] === "copy" ? { mode: "copy", from: values[`${key}From`]!, text: values[`${key}Text`]! } : { mode: "new", text: values[`${key}Text`]! };
      form.texts = { seen: text("seen"), beaten: text("beaten"), after: text("after") };
    }
    try {
      const created = await props.createEvent(form);
      if (!current() || !created) return;
      props.onCreated(created);
    } catch (e) { if (current() && !stale(e)) setError(errorText(e)); }
    finally { props.busyRef.current = false; if (current()) { setBusy(false); props.onBusyChange?.(false); } }
  };
  const renderSelect = (field: FieldSpec, label = field.label, key = field.key, options = field.options ?? []) => <SelectField label={label} options={options} value={values[key] ?? ""} disabled={busy} onChange={v => set(key, v)} optionLabel={field.key === "trainer" ? value => ctx.options.trainers.find(t => t.id === value)?.label ?? value : field.key === "destWarp" ? value => { const w = ctx.map.warps.find(w => String(w.n) === value); return w ? `#${w.n} (${w.x}, ${w.y})` : value; } : undefined} />;
  const textarea = (key: string, label: string) => <label>{label}<textarea aria-label={label} value={values[key] ?? ""} disabled={busy} onChange={e => set(key, e.target.value)} /></label>;
  const source = (f: FieldSpec) => {
    const mode = values[`${f.key}Mode`] ?? "new", name = f.key === "flag" || f.key === "varName";
    return <fieldset key={f.key} className="add-event-dialog__source"><legend>{f.label}</legend>
      <label>{f.label} source<select aria-label={`${f.label} source`} value={mode} disabled={busy} onChange={e => changeMode(f.key, e.target.value)}>
        {f.modes?.map(m => <option value={m} key={m}>{m === "existing" ? "Use existing" : m === "copy" ? "Copy from" : "New"}</option>)}
      </select></label>
      {mode === "existing" ? renderSelect(f) : name ? <label>{f.label} name<input aria-label={`${f.label} name`} value={values[`${f.key}Name`] ?? ""} disabled={busy} onChange={e => set(`${f.key}Name`, e.target.value)} /></label> : <>
        {mode === "copy" && <SelectField label={`${f.label} copy from`} options={f.key === "script" ? ctx.map.localScripts : ctx.map.localTexts} value={values[`${f.key}From`] ?? ""} disabled={busy} onChange={v => { void preview(f.key, v); }} />}
        {f.key === "script" ? <>
          <label>Script label<input aria-label="Script label" value={values.scriptLabel ?? ""} disabled={busy} onChange={e => set("scriptLabel", e.target.value)} /></label>
          {mode === "new" ? textarea("scriptText", "Script text") : <>
            {textarea("scriptBody", "Script body")}
            {copied && Object.entries(copied.texts).map(([label, body]) => <label key={label}>Copied text {label}<textarea aria-label={`Copied text ${label}`} value={body} disabled={busy} onChange={e => setCopied(v => v ? { ...v, texts: { ...v.texts, [label]: e.target.value } } : v)} /></label>)}
          </>}
        </> : textarea(`${f.key}Text`, `${f.label} text`)}
      </>}
      {previewing[f.key] && <p role="status">Loading {f.label.toLowerCase()}...</p>}
    </fieldset>;
  };
  return <form onSubmit={e => { e.preventDefault(); void submit(); }}>
    {kind === "object" && <label>Object type<select aria-label="Object type" value={objectType} disabled={busy} onChange={e => changeType(e.target.value as ObjectType)}><option value="npc">NPC</option><option value="itemball">Item ball</option><option value="trainer">Existing trainer</option></select></label>}
    <div className="add-event-dialog__fields">{fields.map(f => f.kind === "source" ? source(f) : <div key={f.key}>
      {f.kind === "select" ? renderSelect(f) : f.kind === "multiline" ? textarea(f.key, f.label) : <label>{f.label}<input aria-label={f.label} type={f.kind === "number" ? "number" : "text"} value={values[f.key] ?? ""} disabled={busy} onChange={e => set(f.key, e.target.value)} /></label>}
    </div>)}</div>
    {kind === "warp" && destinationReady && <>
      {ctx.map.tileInfo?.warpCapable === false && <p role="status">This tile cannot act as a warp in game.</p>}
      {ctx.map.returnsTo === false && <p role="status">{values.destMap} has no warp back to {props.mapName}; add one there</p>}
    </>}
    {error && <p className="save-dialog__refusal" role="alert">{error}</p>}
    <div className="save-dialog__actions"><button type="button" className="map-canvas__btn" disabled={busy} onClick={() => { if (!props.busyRef.current) props.onCancel(); }}>Cancel</button><button type="submit" className="map-canvas__btn save-dialog__btn--primary" disabled={busy || invalid}>Add</button></div>
  </form>;
}
