import { StrictMode, useState } from "react";
import { invalidateEventOptions } from "../../src/shared/useEventOptions.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AddEventForm, EventOptions, MapEventOptions } from "@pokemap/core/src/addEvent/types.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import type { MapLayoutData } from "../../src/hooks/useMapLayout.js";
import { AddEventDialog, loadReturnWarpNotes, registerReturnWarpSource } from "../../src/shared/AddEventDialog.js";
import { SaveDialog } from "../../src/components/SaveDialog.js";
import * as gba from "../../src/gba/addEventFields.js";
import * as gbc from "../../src/gbc/addEventFields.js";
import { MapEditingWorkspace, type MapEditingCanvasProps } from "../../src/components/MapEditingWorkspace.js";
import { GbcMapEditing, type GbcMapEditingCanvasProps } from "../../src/gbc/GbcMapEditing.js";
import { useMapEditing } from "../../src/hooks/useMapEditing.js";
import { useEditSession } from "../../src/hooks/useEditSession.js";
import { useGbcEditSession } from "../../src/gbc/hooks/useGbcEditSession.js";

const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const mapOptions: MapEventOptions = { entryPoints: ["ObjectEvent", "OldScript", "SecondScript"], localScripts: ["OldScript", "SecondScript"], localTexts: ["OldText", "SecondText"], scenes: ["SCENE_A_NOOP"], warps: [{ n: 1, x: 3, y: 4 }], tileInfo: { x: 2, y: 1, warpCapable: false }, returnsTo: false };
function options(family: "gba" | "gbc"): EventOptions { return {
  family, sprites: family === "gba" ? ["OBJ_EVENT_GFX_YOUNGSTER", "OBJ_EVENT_GFX_ITEM_BALL"] : ["SPRITE_YOUNGSTER"],
  movements: family === "gba" ? ["MOVEMENT_TYPE_FACE_DOWN"] : ["SPRITEMOVEDATA_STANDING_DOWN"],
  flags: family === "gba" ? ["FLAG_FOUND"] : ["EVENT_FOUND"], vars: family === "gba" ? ["VAR_TEMP"] : [], items: family === "gba" ? ["ITEM_POTION"] : ["POTION"],
  trainers: [{ id: family === "gba" ? "TRAINER_RICK" : "YOUNGSTER,JOEY1", label: "Joey" }],
  bgTypes: family === "gba" ? ["sign", "hidden_item", "secret_base"] : ["BGEVENT_READ", "BGEVENT_ITEM", "BGEVENT_IFSET", "BGEVENT_IFNOTSET"],
  facings: ["BG_EVENT_PLAYER_FACING_ANY"], secretBases: ["SECRET_BASE_RED_CAVE1"], palettes: ["0"], maps: ["B"], objectCap: family === "gba" ? 64 : 15, freeFlagSlots: 48, freeVarSlots: 9,
}; }
const blocks = Array.from({ length: 12 }, () => ({ metatileId: 0, collision: 0, elevation: 3, behavior: 0 }));
const gbaData: MapLayoutData = {
  map: { id: "MAP_A", name: "A", layout: "LAYOUT_A", music: "MUS_DUMMY", regionMapSection: "MAPSEC_NONE", mapType: "MAP_TYPE_TOWN", weather: "WEATHER_NONE", connections: [], objectEvents: [], warpEvents: [], coordEvents: [], bgEvents: [] },
  layout: { id: "LAYOUT_A", name: "A_Layout", width: 4, height: 3, borderWidth: 2, borderHeight: 2, primaryTileset: "T", secondaryTileset: "T2", borderFilepath: "border.bin", blockdataFilepath: "map.bin" },
  blocks, split: { version: "emerald", tiles: 512, metatiles: 512, pals: 6 }, primaryCount: 512, secondaryCount: 4,
};
const events = { objects: [], warps: [], coords: [], bgs: [], sceneScripts: [{ script: "Scene", sceneConst: "SCENE_A_NOOP", lineIndex: 1 }], callbacks: [], objectConsts: [] };
const gbcData: GbcMapPayload = {
  family: "gbc", map: { name: "A", constName: "A", group: 1, number: 1, width: 4, height: 3, blkPath: "A.blk", tileset: "T", environment: "E", landmark: "L", music: "M", phoneFlag: "0", palette: "P", fishGroup: "0", border: 1, connectionFlags: "0", connections: [] },
  layout: { blkPath: "A.blk", width: 4, height: 3 }, blocks, metatileCount: 1, tileset: { constName: "T", name: "T" }, collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }], collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } }, events, defects: [], incomplete: [], paddingWidth: 3,
};
vi.mock("../../src/components/MetatilePalette.js", () => ({ MetatilePalette: () => null }));
vi.mock("../../src/gbc/GbcMetatilePalette.js", () => ({ GbcMetatilePalette: () => null }));
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const add = () => screen.getByRole("button", { name: "Add" }) as HTMLButtonElement;
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const tick = async () => { await act(async () => { await Promise.resolve(); }); };

for (const family of ["gba", "gbc"] as const) describe(`${family} AddEventDialog`, () => {
  function network(extra?: (url: string, init?: RequestInit) => Promise<Response> | undefined, project = options(family)) {
    const fetcher = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = String(input); const custom = extra?.(url, init); if (custom) return custom;
      if (url === "/api/event-options") return Promise.resolve(response(project));
      if (url.startsWith("/api/event-options/")) return Promise.resolve(response({ ...mapOptions, warps: [{ n: family === "gba" ? 0 : 1, x: 3, y: 4 }] }));
      if (url.includes("/indicator/at?")) return Promise.resolve(response({ indicator: null }));
      if (url.endsWith("/plan")) return Promise.resolve(response({ changes: [{ path: "A", kind: "text", summary: "new event" }], refusals: [], fingerprint: "f" }));
      throw new Error(`Unexpected request ${url}`);
    }); vi.stubGlobal("fetch", fetcher); return fetcher;
  }
  function standalone(kind: "object" | "warp" | "coord" | "bg" = "object", createEvent = vi.fn(async (_form: AddEventForm) => ({ kind, index: 0 })), onCreated = vi.fn(), onCancel = vi.fn()) {
    const props = { adapter: family === "gba" ? gba : gbc, mapName: "A", kind, x: 2, y: 1, createEvent, onCreated, onCancel };
    return { host: render(<AddEventDialog {...props} />), props, createEvent, onCreated, onCancel };
  }
  it("validates required content and new identifier before enabling Add", async () => {
    network(); standalone(); await screen.findByLabelText("Script text");
    expect(add().disabled).toBe(true);
    change("Script text", "Hello"); expect(add().disabled).toBe(false);
    change("Script label", "1bad"); expect(add().disabled).toBe(true);
    change("Script label", "Valid_Name"); expect(add().disabled).toBe(false);
    change("Sprite", ""); expect(add().disabled).toBe(true);
  });
  it("searches selects over twenty options and uses a textbox for empty options", async () => {
    const project = { ...options(family), sprites: Array.from({ length: 25 }, (_, n) => `SPRITE_${n}`), movements: [] };
    network(undefined, project); standalone();
    await screen.findByLabelText("Search Sprite"); change("Search Sprite", "SPRITE_24");
    const select = screen.getByLabelText("Sprite") as HTMLSelectElement;
    expect([...select.options].map(o => o.value).filter(Boolean)).toEqual(["SPRITE_24"]);
    expect(screen.getByLabelText("Movement").tagName).toBe("INPUT");
  });
  it("filtering out the selected sprite clears its model value before Add can submit it", async () => {
    network(undefined, { ...options(family), sprites: Array.from({ length: 25 }, (_, n) => `SPRITE_${n}`) });
    const h = standalone(); await screen.findByLabelText("Script text"); change("Script text", "Hello"); expect(add().disabled).toBe(false);
    change("Search Sprite", "SPRITE_24"); expect((screen.getByLabelText("Sprite") as HTMLSelectElement).value).toBe("");
    expect(add().disabled).toBe(true); fireEvent.submit(add().closest("form")!); expect(h.createEvent).not.toHaveBeenCalled();
    change("Sprite", "SPRITE_24"); expect(add().disabled).toBe(false); fireEvent.click(add()); await tick();
    expect(h.createEvent.mock.calls[0]?.[0].fields.sprite).toBe("SPRITE_24");
  });
  it("empty existing script options validate identifier-shaped fallback text", async () => {
    network(url => url.startsWith("/api/event-options/") ? Promise.resolve(response({ ...mapOptions, entryPoints: [] })) : undefined);
    standalone(); await screen.findByLabelText("Script source"); change("Script source", "existing");
    for (const invalid of ["1bad", "two words", " "]) { change("Script", invalid); expect(add().disabled).toBe(true); }
    change("Script", "Valid_Script"); expect(add().disabled).toBe(false);
  });
  if (family === "gba") it("empty existing var options validate identifier-shaped fallback text", async () => {
    network(undefined, { ...options(family), vars: [] }); standalone("coord"); await screen.findByLabelText("Script text"); change("Script text", "Hello");
    for (const invalid of ["1bad", "two words", " "]) { change("Var", invalid); expect(add().disabled).toBe(true); }
    change("Var", "VAR_VALID"); expect(add().disabled).toBe(false);
  });
  it("switching trainer Copy to New empties its text box and requires new content", async () => {
    network(url => url.includes("/text?") ? Promise.resolve(response({ label: "OldText", text: "Copied words" })) : undefined);
    standalone(); await screen.findByLabelText("Object type"); change("Object type", "trainer");
    change("Seen source", "copy"); change("Seen copy from", "OldText"); await tick();
    expect((screen.getByLabelText("Seen text") as HTMLTextAreaElement).value).toBe("Copied words");
    change("Beaten text", "Beaten words"); change("After battle text", "After words"); expect(add().disabled).toBe(false);
    change("Seen source", "new"); expect((screen.getByLabelText("Seen text") as HTMLTextAreaElement).value).toBe(""); expect(add().disabled).toBe(true);
    change("Seen text", "New words"); expect(add().disabled).toBe(false);
  });
  it("switching back to a New NPC script empties the previous draft text", async () => {
    network(); standalone(); await screen.findByLabelText("Script text"); change("Script text", "Previous draft");
    change("Script source", "existing"); change("Script source", "new");
    expect((screen.getByLabelText("Script text") as HTMLTextAreaElement).value).toBe(""); expect(add().disabled).toBe(true);
  });
  it.each(["warp", "coord", "bg"] as const)("%s traps keyboard traversal while options load and from the first enabled form control", async kind => {
    const project = deferred<Response>(); const map = deferred<Response>();
    network(url => url === "/api/event-options" ? project.promise : url.startsWith("/api/event-options/") ? map.promise : undefined);
    standalone(kind); const loadingCancel = screen.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(loadingCancel); expect(fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true })).toBe(false); expect(document.activeElement).toBe(loadingCancel);
    await act(async () => { project.resolve(response(options(family))); map.resolve(response({ ...mapOptions, warps: [{ n: family === "gba" ? 0 : 1, x: 3, y: 4 }] })); });
    const dialog = screen.getByRole("dialog"); const controls = [...dialog.querySelectorAll<HTMLElement>("button,input,select,textarea")].filter(c => !c.matches(":disabled") && c.tabIndex >= 0);
    expect(document.activeElement).toBe(controls[0]);
    expect(fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true })).toBe(false); expect(document.activeElement).toBe(controls.at(-1));
    expect(fireEvent.keyDown(document.activeElement!, { key: "Tab" })).toBe(false); expect(document.activeElement).toBe(controls[0]);
  });
  it("two form submits in one batch synchronously latch a single deferred create", async () => {
    network(); const pending = deferred<{ kind: "object"; index: number }>(); const create = vi.fn((_form: AddEventForm) => pending.promise);
    standalone("object", create); await screen.findByLabelText("Script text"); change("Script text", "Hello");
    const form = add().closest("form")!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ kind: "object", index: 0 }); });
  });
  it("copy fills editable script body, text bodies and a default new label", async () => {
    const fetcher = network(url => url.includes("/copy?") ? Promise.resolve(response({ label: "OldScript", body: "end", texts: { OldText: "text body" } })) : undefined);
    standalone(); await screen.findByLabelText("Script source"); change("Script source", "copy"); change("Script copy from", "OldScript");
    await screen.findByLabelText("Copied text OldText");
    expect((screen.getByLabelText("Script body") as HTMLTextAreaElement).value).toBe("end");
    expect((screen.getByLabelText("Copied text OldText") as HTMLTextAreaElement).value).toBe("text body");
    expect((screen.getByLabelText("Script label") as HTMLInputElement).value).toMatch(/PokemapObject1$/);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/copy?label=OldScript"))).toBe(true);
  });
  it.each(["seen", "beaten", "after"])("trainer %s Copy from fills the matching text and keeps provenance", async slot => {
    const fetcher = network(url => url.includes("/text?") ? Promise.resolve(response({ label: "OldText", text: "Trainer words" })) : undefined);
    const h = standalone(); await screen.findByLabelText("Object type"); change("Object type", "trainer");
    const title = slot === "seen" ? "Seen" : slot === "beaten" ? "Beaten" : "After battle";
    change(`${title} source`, "copy"); change(`${title} copy from`, "OldText");
    await tick(); expect((screen.getByLabelText(`${title} text`) as HTMLTextAreaElement).value).toBe("Trainer words");
    for (const other of ["Seen", "Beaten", "After battle"]) if (other !== title) change(`${other} text`, "Other words");
    fireEvent.click(add()); await tick();
    expect(h.createEvent.mock.calls[0]?.[0].texts?.[slot as "seen" | "beaten" | "after"]).toEqual({ mode: "copy", from: "OldText", text: "Trainer words" });
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/text?label=OldText"))).toBe(true);
  });
  it("late copy/text previews cannot overwrite a newer same-visit selection or mode", async () => {
    const old = deferred<Response>(); const newer = deferred<Response>();
    network(url => url.includes("/copy?label=OldScript") ? old.promise : url.includes("/copy?label=SecondScript") ? newer.promise : undefined);
    standalone(); await screen.findByLabelText("Script source"); change("Script source", "copy"); change("Script copy from", "OldScript"); change("Script copy from", "SecondScript");
    await act(async () => { newer.resolve(response({ label: "SecondScript", body: "newer", texts: {} })); });
    await act(async () => { old.resolve(response({ label: "OldScript", body: "obsolete", texts: {} })); });
    expect((screen.getByLabelText("Script body") as HTMLTextAreaElement).value).toBe("newer");
    change("Script source", "new"); expect(screen.queryByRole("alert")).toBeNull();
  });
  it("double submit creates once; in-flight Escape, Cancel and backdrop do nothing", async () => {
    network(); const pending = deferred<{ kind: "object"; index: number }>(); const create = vi.fn((_form: AddEventForm) => pending.promise);
    const h = standalone("object", create); await screen.findByLabelText("Script text"); change("Script text", "Hello");
    fireEvent.click(add()); fireEvent.click(add());
    const dialog = screen.getByRole("dialog"); fireEvent.keyDown(dialog, { key: "Escape" }); fireEvent.click(screen.getByRole("button", { name: "Cancel" })); fireEvent.mouseDown(dialog.parentElement!);
    expect(create).toHaveBeenCalledTimes(1); expect(h.onCancel).not.toHaveBeenCalled(); expect(h.onCreated).not.toHaveBeenCalled();
    expect(add().disabled).toBe(true);
    await act(async () => { pending.resolve({ kind: "object", index: 2 }); });
    expect(h.onCreated).toHaveBeenCalledWith({ kind: "object", index: 2 });
  });
  it("option invalidation during create keeps the form mounted and its fields locked", async () => {
    network(); const pending = deferred<{ kind: "object"; index: number }>();
    const h = standalone("object", vi.fn((_form: AddEventForm) => pending.promise));
    await screen.findByLabelText("Script text"); change("Script text", "Keep during refresh"); fireEvent.click(add());
    await act(async () => { invalidateEventOptions(); });
    expect((screen.getByLabelText("Script text") as HTMLTextAreaElement).value).toBe("Keep during refresh");
    expect(add().disabled).toBe(true);
    await act(async () => { pending.resolve({ kind: "object", index: 3 }); });
    expect(h.onCreated).toHaveBeenCalledWith({ kind: "object", index: 3 });
  });
  it("400 message remains inline with entered fields intact", async () => {
    network(); const h = standalone("object", vi.fn(async (_form: AddEventForm) => { throw Object.assign(new Error("A maps/A: name taken"), { code: "LABEL_TAKEN", stale: false }); }));
    await screen.findByLabelText("Script text"); change("Script text", "Keep me"); fireEvent.click(add());
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "A maps/A: name taken");
    expect((screen.getByLabelText("Script text") as HTMLTextAreaElement).value).toBe("Keep me"); expect(h.onCreated).not.toHaveBeenCalled();
  });
  it("StrictMode loading focus repairs the canvas default-focus steal and restores the Add opener", async () => {
    const project = deferred<Response>(); const map = deferred<Response>();
    network(url => url === "/api/event-options" ? project.promise : url.startsWith("/api/event-options/") ? map.promise : undefined);
    const cancel = vi.fn();
    function Host() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Add opener</button>
        {open && <AddEventDialog adapter={family === "gba" ? gba : gbc} mapName="A" kind="warp" x={2} y={1} createEvent={vi.fn(async () => null)} onCreated={vi.fn()} onCancel={() => { cancel(); setOpen(false); }} />}
      </>;
    }
    render(<StrictMode><Host /></StrictMode>, { reactStrictMode: true });
    const opener = screen.getByRole("button", { name: "Add opener" }); opener.focus();
    fireEvent.pointerDown(opener); fireEvent.mouseDown(opener); fireEvent.click(opener);
    const dialog = screen.getByRole("dialog");
    // The browser can focus the canvas/opener after React's synchronous layout focus.
    opener.focus(); expect(document.activeElement).toBe(opener);
    await tick();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Loading event options...")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })); await tick();
    expect(cancel).toHaveBeenCalledTimes(1); expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(opener);
    await act(async () => { project.resolve(response(options(family))); map.resolve(response(mapOptions)); });
  });
  it("StrictMode loading Add owns document Escape from body and honors a child-consumed Escape", async () => {
    const project = deferred<Response>(); const map = deferred<Response>();
    network(url => url === "/api/event-options" ? project.promise : url.startsWith("/api/event-options/") ? map.promise : undefined);
    const cancel = vi.fn();
    render(<StrictMode><AddEventDialog adapter={family === "gba" ? gba : gbc} mapName="A" kind="warp" x={2} y={1} createEvent={vi.fn(async () => null)} onCreated={vi.fn()} onCancel={cancel} /></StrictMode>, { reactStrictMode: true });
    await tick(); const dialog = screen.getByRole("dialog"); expect(dialog.contains(document.activeElement)).toBe(true);
    const button = within(dialog).getByRole("button", { name: "Cancel" });
    button.addEventListener("keydown", event => event.preventDefault(), { once: true });
    fireEvent.keyDown(button, { key: "Escape" }); expect(cancel).not.toHaveBeenCalled();
    (document.activeElement as HTMLElement).blur(); expect(document.activeElement).toBe(document.body);
    expect(fireEvent.keyDown(document, { key: "Escape" })).toBe(false); expect(cancel).toHaveBeenCalledTimes(1);
    await act(async () => { project.resolve(response(options(family))); map.resolve(response(mapOptions)); });
  });
  it("StrictMode stacked Save owns body Escape without closing the loading Add dialog", async () => {
    const project = deferred<Response>(); const map = deferred<Response>();
    network(url => url === "/api/event-options" ? project.promise : url.startsWith("/api/event-options/") ? map.promise : undefined);
    const addCancel = vi.fn(); const saveCancel = vi.fn();
    function Host() {
      const [save, setSave] = useState(true);
      return <><AddEventDialog adapter={family === "gba" ? gba : gbc} mapName="A" kind="warp" x={2} y={1} createEvent={vi.fn(async () => null)} onCreated={vi.fn()} onCancel={addCancel} />
        {save && <SaveDialog mapName="A" onCommitted={vi.fn()} onCancel={() => { saveCancel(); setSave(false); }} />}
      </>;
    }
    render(<StrictMode><Host /></StrictMode>, { reactStrictMode: true }); await tick();
    const save = screen.getByRole("dialog", { name: "Save changes" });
    const button = within(save).getByRole("button", { name: "Cancel" });
    button.addEventListener("keydown", event => event.preventDefault(), { once: true });
    fireEvent.keyDown(button, { key: "Escape" }); expect(saveCancel).not.toHaveBeenCalled(); expect(addCancel).not.toHaveBeenCalled();
    (document.activeElement as HTMLElement).blur(); expect(document.activeElement).toBe(document.body);
    expect(fireEvent.keyDown(document, { key: "Escape" })).toBe(false);
    expect(saveCancel).toHaveBeenCalledTimes(1); expect(addCancel).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull(); expect(screen.getByRole("dialog").getAttribute("aria-label")).toMatch(/^Add Warp/);
    await act(async () => { project.resolve(response(options(family))); map.resolve(response({ ...mapOptions, warps: [{ n: family === "gba" ? 0 : 1, x: 3, y: 4 }] })); });
  });
  it("StrictMode creating Add consumes body Escape without canceling the deferred create", async () => {
    const project = deferred<Response>(); const map = deferred<Response>(); const pending = deferred<{ kind: "object"; index: number }>();
    network(url => url === "/api/event-options" ? project.promise : url.startsWith("/api/event-options/") ? map.promise : undefined);
    const cancel = vi.fn(); const created = vi.fn(); const create = vi.fn((_form: AddEventForm) => pending.promise);
    render(<StrictMode><AddEventDialog adapter={family === "gba" ? gba : gbc} mapName="A" kind="object" x={2} y={1} createEvent={create} onCreated={created} onCancel={cancel} /></StrictMode>, { reactStrictMode: true });
    await tick(); expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    await act(async () => { project.resolve(response(options(family))); map.resolve(response(mapOptions)); });
    await screen.findByLabelText("Script text"); change("Script text", "Hello"); fireEvent.click(add());
    (document.activeElement as HTMLElement).blur();
    expect(fireEvent.keyDown(document, { key: "Escape" })).toBe(false);
    expect(cancel).not.toHaveBeenCalled(); expect(created).not.toHaveBeenCalled(); expect(create).toHaveBeenCalledTimes(1); expect(add().disabled).toBe(true);
    await act(async () => { pending.resolve({ kind: "object", index: 0 }); }); expect(created).toHaveBeenCalledWith({ kind: "object", index: 0 });
  });
  it("Save stacks above Add: only topmost Escape closes and Tab is trapped; focus returns to Add button", async () => {
    network();
    function Host() { const [open, setOpen] = useState(false); const [save, setSave] = useState(false); return <>
      <button onClick={() => setOpen(true)}>Add button</button>
      {open && <AddEventDialog adapter={family === "gba" ? gba : gbc} mapName="A" kind="object" x={2} y={1} createEvent={vi.fn()} onCreated={vi.fn()} onCancel={() => setOpen(false)} />}
      {open && <button onClick={() => setSave(true)}>Open Save</button>}
      {save && <SaveDialog mapName="A" onCommitted={vi.fn()} onCancel={() => setSave(false)} />}
    </>; }
    render(<Host />); const opener = screen.getByRole("button", { name: "Add button" }); opener.focus(); fireEvent.click(opener); await screen.findByLabelText("Script text");
    fireEvent.click(screen.getByRole("button", { name: "Open Save" })); await tick();
    const save = screen.getByRole("dialog", { name: "Save changes" }); const buttons = within(save).getAllByRole("button"); buttons.at(-1)!.focus(); fireEvent.keyDown(buttons.at(-1)!, { key: "Tab" }); expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(save, { key: "Escape" }); expect(screen.queryByRole("dialog", { name: "Save changes" })).toBeNull();
    const dialog = screen.getByRole("dialog"); expect(dialog.getAttribute("aria-label")).toMatch(/^Add Object/);
    fireEvent.keyDown(dialog, { key: "Escape" }); await tick(); expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(opener);
  });
  it("warp tile and return warnings are advisory and use destination numbering", async () => {
    network(); standalone("warp"); await screen.findByText("B has no warp back to A; add one there");
    expect(screen.getByText(/tile cannot act as a warp/i)).toBeTruthy(); expect(add().disabled).toBe(false);
    expect((screen.getByLabelText("Destination warp") as HTMLSelectElement).value).toBe(family === "gba" ? "0" : "1");
  });

  function workspace(name = "A", project = options(family), readOnly = false, count = 0, noScenes = false) {
    const pending = deferred<Response>();
    const fetcher = network((_url, init) => init?.method === "POST" ? pending.promise : undefined, project);
    let canvas: MapEditingCanvasProps | GbcMapEditingCanvasProps | null = null;
    const data = { ...gbaData, map: { ...gbaData.map, objectEvents: Array.from({ length: count }, () => ({ x: 0, y: 0, elevation: 3, graphicsId: "OBJ_EVENT_GFX_YOUNGSTER", movementType: "MOVEMENT_TYPE_FACE_DOWN", movementRangeX: 0, movementRangeY: 0, trainerType: "TRAINER_TYPE_NONE", trainerSightOrBerryTreeId: "0", script: "0x0", flag: "0" })) } };
    const gbEvents = { ...events, sceneScripts: noScenes ? [] : events.sceneScripts, objects: Array.from({ length: count }, () => ({ x: 0, y: 0, sprite: "SPRITE_YOUNGSTER", moveData: "SPRITEMOVEDATA_STANDING_DOWN", radiusX: 0, radiusY: 0, hour1: "-1", hour2: "-1", palette: "0", objectType: "OBJECTTYPE_SCRIPT", sightRange: 0, script: "ObjectEvent", eventFlag: "-1", lineIndex: 1 })) };
    function GbaHost({ name }: { name: string }) { const session = useEditSession(name, blocks, data.map); const editing = useMapEditing({ editSession: session, layoutData: data, mapName: name }); return <MapEditingWorkspace mapName={readOnly ? "" : name} data={data} active={true} editSession={session} editing={editing} renderCanvas={p => { canvas = p; return <button onClick={() => p?.onEventPick?.(2, 1, new DOMRect())}>Canvas cell</button>; }} />; }
    function GbcHost({ name }: { name: string }) { const session = useGbcEditSession(name, blocks, gbEvents); return <GbcMapEditing mapName={name} data={readOnly ? null : { ...gbcData, events: gbEvents }} active={true} time="day" session={session} hoveredMetatileId={null} onHoverMetatile={vi.fn()} onOpenSave={vi.fn()} renderCanvas={p => { canvas = p; return <button onClick={() => p?.onEventPick?.(2, 1, new DOMRect())}>Canvas cell</button>; }} />; }
    const tree = (name: string) => family === "gba" ? <GbaHost name={name} /> : <GbcHost name={name} />;
    const host = render(tree(name)); return { host, pending, fetcher, switchTo: (next: string) => host.rerender(tree(next)), get canvas() { return canvas; } };
  }
  async function openWorkspace(kind: "object" | "warp" = "object") { const h = workspace(); await tick(); fireEvent.click(screen.getByRole("button", { name: kind === "object" ? /^Add Object:/ : /^Add Warp:/ })); expect(h.canvas?.placing).toBe(kind); fireEvent.click(screen.getByRole("button", { name: "Canvas cell" })); await screen.findByRole("dialog"); if (kind === "object") { await screen.findByLabelText("Script text"); change("Script text", "Hello"); } else await screen.findByText("B has no warp back to A; add one there"); return h; }
  const createdBody = (kind: "object" | "warp") => ({ blocks, border: [], map: { ...gbaData.map, objectEvents: kind === "object" ? [{ x: 2, y: 1, elevation: 3, graphicsId: "OBJ_EVENT_GFX_YOUNGSTER", movementType: "MOVEMENT_TYPE_FACE_DOWN", movementRangeX: 0, movementRangeY: 0, trainerType: "TRAINER_TYPE_NONE", trainerSightOrBerryTreeId: "0", script: "0x0", flag: "0" }] : [], warpEvents: kind === "warp" ? [{ x: 2, y: 1, elevation: 3, destMap: "MAP_B", destWarpId: "0" }] : [] }, events: { ...events, objects: kind === "object" ? [{ x: 2, y: 1, sprite: "SPRITE_YOUNGSTER", moveData: "SPRITEMOVEDATA_STANDING_DOWN", radiusX: 0, radiusY: 0, hour1: "-1", hour2: "-1", palette: "0", objectType: "OBJECTTYPE_SCRIPT", sightRange: 0, script: "ObjectEvent", eventFlag: "-1", lineIndex: 1 }] : [], warps: kind === "warp" ? [{ x: 2, y: 1, mapConst: "B", destWarp: 1, lineIndex: 1 }] : [] }, isDirty: true, canUndo: true, canRedo: false, created: { kind, index: 0 } });
  it("real workspace canvas pick opens dialog; POST success closes and selects created", async () => {
    const h = await openWorkspace(); fireEvent.click(add()); fireEvent.click(add()); expect(h.fetcher.mock.calls.filter(([url]) => String(url).endsWith("/event/create"))).toHaveLength(1);
    expect((screen.getByRole("button", { name: /^Add Warp:/ }) as HTMLButtonElement).title).toMatch(/request.*in flight/i);
    await act(async () => { h.pending.resolve(response(createdBody("object"))); }); expect(screen.queryByRole("dialog")).toBeNull();
    const selected = h.canvas && ("selectedEventRef" in h.canvas ? h.canvas.selectedEventRef : "selectedEvent" in h.canvas ? h.canvas.selectedEvent : null); expect(selected).toMatchObject({ kind: "object", index: 0 });
    const posted = JSON.parse(String(h.fetcher.mock.calls.find(([url]) => String(url).endsWith("/event/create"))?.[1]?.body)) as AddEventForm; expect(posted).toMatchObject({ kind: "object", x: 2, y: 1 });
  });
  it.each(["success", "failure"])("real workspace delayed %s after A to B to A neither selects nor errors on the new visit", async outcome => {
    const h = await openWorkspace(); fireEvent.click(add()); h.switchTo("B"); h.switchTo("A"); await tick();
    await act(async () => { h.pending.resolve(outcome === "success" ? response(createdBody("object")) : response({ error: "A maps/A: obsolete refusal", code: "BAD_OPTION" }, 400)); });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByText(/obsolete refusal/)).toBeNull();
    const selected = h.canvas && ("selectedEventRef" in h.canvas ? h.canvas.selectedEventRef : "selectedEvent" in h.canvas ? h.canvas.selectedEvent : null); expect(selected).toBeNull();
  });
  it.each(["success", "failure"])("dialog suppresses delayed %s callbacks after A to B to A", async outcome => {
    network();
    const pending = deferred<{ kind: "object"; index: number }>();
    const create = vi.fn((_form: AddEventForm) => pending.promise);
    const h = standalone("object", create);
    await screen.findByLabelText("Script text"); change("Script text", "Hello"); fireEvent.click(add());
    h.host.rerender(<AddEventDialog {...h.props} mapName="B" />);
    h.host.rerender(<AddEventDialog {...h.props} mapName="A" />);
    await screen.findByLabelText("Script text");
    await act(async () => {
      if (outcome === "success") pending.resolve({ kind: "object", index: 7 });
      else pending.reject(new Error("retired dialog refusal"));
    });
    expect(h.onCreated).not.toHaveBeenCalled();
    expect(screen.queryByText("retired dialog refusal")).toBeNull();
    expect((screen.getByLabelText("Script text") as HTMLTextAreaElement).value).toBe("");
  });
  it("real workspace preserves dialog on refused create and its typed fields", async () => {
    const h = await openWorkspace(); change("Script text", "Still here"); fireEvent.click(add()); await act(async () => { h.pending.resolve(response({ error: "A maps/A: refused", code: "BAD_OPTION" }, 400)); });
    expect(screen.getByRole("alert").textContent).toBe("A maps/A: refused"); expect((screen.getByLabelText("Script text") as HTMLTextAreaElement).value).toBe("Still here");
  });
  it("real workspace object cap uses project cap and disables with reason", async () => { workspace("A", { ...options(family), objectCap: 2 }, false, family === "gba" ? 2 : 15); await tick(); const button = screen.getByRole("button", { name: /^Add Object:/ }) as HTMLButtonElement; expect(button.disabled).toBe(true); expect(button.title).toMatch(/object/i); });
  it("real workspace not-editable state disables every Add button with its reason", async () => {
    workspace("A", options(family), true); await tick();
    for (const button of screen.getAllByRole("button", { name: /^Add (Object|Warp|Coord Event|BG Event):/ }) as HTMLButtonElement[]) { expect(button.disabled).toBe(true); expect(button.title).toBe("No editable map"); }
  });
  it("real workspace pending paint request disables every Add button until it settles", async () => {
    const h = workspace(); await tick(); let paint!: Promise<void>;
    act(() => { paint = h.canvas!.editSession!.beginStroke(); }); await tick();
    for (const button of screen.getAllByRole("button", { name: /^Add (Object|Warp|Coord Event|BG Event):/ }) as HTMLButtonElement[]) { expect(button.disabled).toBe(true); expect(button.title).toMatch(/request.*in flight/i); }
    await act(async () => { h.pending.resolve(response(createdBody("object"))); await paint; });
    expect((screen.getByRole("button", { name: /^Add Warp:/ }) as HTMLButtonElement).disabled).toBe(false);
  });
  it.each(["move", "delete", "duplicate", "undo", "redo"] as const)("real workspace pending %s disables all Add buttons until its POST settles", async action => {
    const h = workspace("A", options(family), false, 1); await tick();
    // Prime the real session flags so both toolbar history actions are available.
    let prime!: Promise<void>; act(() => { prime = h.canvas!.editSession!.undo(); });
    await act(async () => { h.pending.resolve(response({ ...createdBody("object"), canUndo: true, canRedo: true })); await prime; });
    act(() => { h.canvas!.onSelectEvent?.({ kind: "object", index: 0 }); }); await tick();
    const pending = deferred<Response>(); const previous = h.fetcher.getMockImplementation()!;
    h.fetcher.mockImplementation((input, init) => init?.method === "POST" ? pending.promise : previous(input, init));
    act(() => {
      if (action === "move") h.canvas!.onMoveEvent?.({ kind: "object", index: 0, x: 3, y: 2 });
      else fireEvent.click(screen.getByRole("button", { name: action === "delete" ? "Delete" : action === "duplicate" ? "Duplicate" : action === "undo" ? "Undo" : "Redo" }));
    }); await tick();
    const suffix = action === "move" ? "/event/move" : action === "delete" ? "/event/delete" : action === "duplicate" ? "/event/add" : `/${action}`;
    expect(h.fetcher.mock.calls.some(([url]) => String(url).endsWith(suffix))).toBe(true);
    for (const button of screen.getAllByRole("button", { name: /^Add (Object|Warp|Coord Event|BG Event):/ }) as HTMLButtonElement[]) { expect(button.disabled).toBe(true); expect(button.title).toMatch(/request.*in flight/i); }
    await act(async () => { pending.resolve(response({ ...createdBody("object"), warpRenumberWarnings: [] })); });
    expect((screen.getByRole("button", { name: /^Add Warp:/ }) as HTMLButtonElement).disabled).toBe(false);
  });
  if (family === "gbc") it("real GBC workspace without scenes disables Coord with the reason", async () => {
    workspace("A", options(family), false, 0, true); await tick(); const button = screen.getByRole("button", { name: /^Add Coord Event:/ }) as HTMLButtonElement; expect(button.disabled).toBe(true); expect(button.title).toMatch(/no scenes/i);
  });
  it("late trainer text success and failure cannot overwrite another source or a New mode", async () => {
    const first = deferred<Response>(); const second = deferred<Response>(); const third = deferred<Response>(); let calls = 0;
    network(url => url.includes("/text?") ? [first.promise, second.promise, third.promise][calls++] : undefined);
    standalone(); await screen.findByLabelText("Object type"); change("Object type", "trainer"); change("Seen source", "copy"); change("Seen copy from", "OldText"); change("Seen copy from", "SecondText");
    await act(async () => { second.resolve(response({ label: "SecondText", text: "Current words" })); });
    await act(async () => { first.resolve(response({ label: "OldText", text: "Old words" })); });
    expect((screen.getByLabelText("Seen text") as HTMLTextAreaElement).value).toBe("Current words");
    change("Seen copy from", "OldText"); change("Seen source", "new"); change("Seen text", "Typed new words");
    await act(async () => { third.resolve(response({ error: "obsolete preview error" }, 400)); });
    expect((screen.getByLabelText("Seen text") as HTMLTextAreaElement).value).toBe("Typed new words"); expect(screen.queryByText("obsolete preview error")).toBeNull();
  });
  it("Save notes follow live warp undo/redo and ignore a retired identical source", async () => {
    const warp = { dest: family === "gba" ? "MAP_B" : "B", warp: family === "gba" ? "0" : "1", x: 2, y: 1 };
    network();
    let unregister = registerReturnWarpSource("A", [warp], [], ["B"]);
    try {
      expect(await loadReturnWarpNotes("A")).toEqual(["B has no warp back to A; add one there"]);
      unregister(); unregister = registerReturnWarpSource("A", [], [], ["B"]);
      expect(await loadReturnWarpNotes("A")).toEqual([]);
      unregister(); unregister = registerReturnWarpSource("A", [warp], [], ["B"]);
      expect(await loadReturnWarpNotes("A")).toEqual(["B has no warp back to A; add one there"]);
      const pending = deferred<Response>();
      network(url => url.includes("?dest=") ? pending.promise : undefined);
      const old = loadReturnWarpNotes("A");
      unregister(); unregister = registerReturnWarpSource("A", [warp], [], ["B"]);
      pending.resolve(response({ ...mapOptions, returnsTo: false }));
      expect(await old).toEqual([]);
    } finally { unregister(); }
  });
  it("Save opened during create waits and shows the new warp note without losing focus", async () => {
    const h = await openWorkspace("warp"); fireEvent.click(add());
    render(<SaveDialog mapName="A" onCommitted={vi.fn()} onCancel={vi.fn()} />);
    const save = screen.getByRole("dialog", { name: "Save changes" });
    const cancel = within(save).getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(cancel);
    await tick(); expect(h.fetcher.mock.calls.some(([url]) => String(url).endsWith("/plan"))).toBe(false);
    await act(async () => { h.pending.resolve(response(createdBody("warp"))); });
    expect(await screen.findByText("B has no warp back to A; add one there")).toBeTruthy();
    expect(document.activeElement).toBe(cancel);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
  it("Save notes retain the unsaved one-way warp warning", async () => { const h = await openWorkspace("warp"); fireEvent.click(add()); await act(async () => { h.pending.resolve(response(createdBody("warp"))); }); render(<SaveDialog mapName="A" onCommitted={vi.fn()} onCancel={vi.fn()} />); expect(await screen.findByText("B has no warp back to A; add one there")).toBeTruthy(); expect(h.fetcher.mock.calls.some(([url]) => String(url) === "/api/event-options/A?dest=B")).toBe(true); });
});
