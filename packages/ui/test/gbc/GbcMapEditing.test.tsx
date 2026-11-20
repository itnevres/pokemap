import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { GbcMapEditing, type GbcMapEditingCanvasProps } from "../../src/gbc/GbcMapEditing.js";
import type { UseGbcEditSessionResult } from "../../src/gbc/hooks/useGbcEditSession.js";
import type { GbcMapPayload } from "@pokemap/core/src/gbc/wire.js";
import type { GbcMapEvents } from "@pokemap/core/src/gbc/model/types.js";
import { gbcAdapter } from "../../src/gbc/adapter.js";
import type { BlockEditSession } from "../../src/shared/useEditSessionCore.js";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// 3x2 blocks, origin (32,32): client (72,72) = block (1,1) = step (2,2); client (84,100) = step (3,4).
const OBJECT = { x: 2, y: 2, sprite: "SPRITE_TEACHER", moveData: "M", radiusX: 0, radiusY: 0, hour1: "-1", hour2: "-1", palette: "0", objectType: "OBJECTTYPE_SCRIPT", sightRange: 0, script: "S", eventFlag: "-1", lineIndex: 0 };
const WARP = { x: 3, y: 4, mapConst: "ELMS_HOUSE", destWarp: 1, lineIndex: 0 };
const EVENTS: GbcMapEvents = { warps: [WARP], coords: [], bgs: [], objects: [OBJECT], sceneScripts: [], callbacks: [], objectConsts: [] };
const BLOCKS = [0, 1, 2, 3, 4, 5].map((metatileId) => ({ metatileId }));

const DATA: GbcMapPayload = {
  family: "gbc",
  map: { name: "M", constName: "M", group: 1, number: 1, width: 3, height: 2, blkPath: "maps/M.blk", tileset: "T", environment: "E", landmark: "L", music: "X", phoneFlag: "0", palette: "P", fishGroup: "0", border: 1, connectionFlags: "0", connections: [] },
  layout: { blkPath: "maps/M.blk", width: 3, height: 2 },
  blocks: BLOCKS, metatileCount: 6, tileset: { constName: "T", name: "T" },
  collision: Array.from({ length: 6 }, () => ({ tl: 0, tr: 0, bl: 0, br: 0 })),
  collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
  events: EVENTS, defects: [], incomplete: [], paddingWidth: 3,
};

function stub(over: Partial<UseGbcEditSessionResult> = {}): UseGbcEditSessionResult {
  return {
    blocks: BLOCKS, events: EVENTS, isDirty: false, canUndo: false, canRedo: false,
    beginStroke: vi.fn(() => Promise.resolve()), applyPaint: vi.fn(() => Promise.resolve()), endStroke: vi.fn(() => Promise.resolve()),
    undo: vi.fn(() => Promise.resolve()), redo: vi.fn(() => Promise.resolve()), discard: vi.fn(() => Promise.resolve()), markClean: vi.fn(),
    moveEvent: vi.fn(() => Promise.resolve()), addEvent: vi.fn(() => Promise.resolve()),
    deleteEvent: vi.fn(() => Promise.resolve({ warpRenumberWarnings: [] })),
    ...over,
  };
}

function mount(session: UseGbcEditSessionResult, mapName = "M") {
  const el = (n: string) => <GbcMapEditing mapName={n} data={DATA} time="day" session={session} hoveredMetatileId={null} onHoverMetatile={() => {}} onOpenSave={() => {}} />;
  const u = render(el(mapName));
  const canvas = () => document.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
  return { ...u, canvas, switchTo: (n: string) => u.rerender(el(n)) };
}
const click = (c: HTMLElement, x: number, y: number) => {
  fireEvent.mouseDown(c, { clientX: x, clientY: y, button: 0 });
  fireEvent.mouseUp(c, { clientX: x, clientY: y, button: 0 });
};

describe("GbcMapEditing wiring (spec review F2/F5/F6, QR I1)", () => {
  it("a delete refusal shows the server's text in a role=alert, and the next success clears it", async () => {
    const s = stub({ deleteEvent: vi.fn(() => Promise.reject(new Error("M object[0]: const M_TEACHER is still referenced"))) });
    const m = mount(s);
    click(m.canvas(), 72, 72); // select the object
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("const M_TEACHER is still referenced"));
    // a later successful op (Duplicate) clears it
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(s.addEvent).toHaveBeenCalled();
  });

  it("the banner can be dismissed", async () => {
    const m = mount(stub({ deleteEvent: vi.fn(() => Promise.reject(new Error("nope"))) }));
    click(m.canvas(), 72, 72);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a warp delete lists the renumber warnings in a role=status and clears the selection", async () => {
    const s = stub({ deleteEvent: vi.fn(() => Promise.resolve({ warpRenumberWarnings: [{ fromMap: "Other", warpIndex: 2, destWarp: 3 }] })) });
    const m = mount(s);
    click(m.canvas(), 84, 100); // the warp at step (3,4)
    expect(screen.getByText("Warp event #0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Other warp[2] → 3"));
    expect(s.deleteEvent).toHaveBeenCalledWith("warp", 0);
    expect(screen.queryByText("Warp event #0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss warnings" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("Duplicate selects the new copy (index = list length before the call)", async () => {
    // addEvent appends to this session's list, as the server does
    const events: GbcMapEvents = { ...EVENTS, objects: [OBJECT] };
    const s = stub({ events, addEvent: vi.fn(() => { events.objects = [...events.objects, { ...OBJECT, x: 3 }]; return Promise.resolve(); }) });
    const m = mount(s);
    click(m.canvas(), 72, 72);
    expect(screen.getByText("Object event #0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(screen.getByText("Object event #1")).toBeTruthy());
    expect((s.addEvent as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe("object");
  });

  it("Discard asks GBA's exact question; cancel discards nothing, confirm does", async () => {
    const s = stub({ isDirty: true, canUndo: true });
    mount(s);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));
    expect(confirm).toHaveBeenCalledWith("Discard all unsaved changes on this map? This cannot be undone.");
    expect(s.discard).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));
    expect(s.discard).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it("a failed discard surfaces its message", async () => {
    mount(stub({ isDirty: true, discard: vi.fn(() => Promise.reject(new Error("POST /api/edit/M/discard -> 500"))) }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("discard -> 500"));
  });

  it("a paint request's failure text reaches the banner (not a generic message)", async () => {
    const s = stub({ beginStroke: vi.fn(() => Promise.reject(new Error("POST /api/edit/M/paint/begin -> 500"))) });
    const m = mount(s);
    fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
    fireEvent.click(screen.getByLabelText("metatile 0x3"));
    click(m.canvas(), 72, 72);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("paint/begin -> 500"));
  });

  it("the picked stamp is keyed by map: it does not survive a switch", async () => {
    const s = stub();
    const m = mount(s);
    fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
    fireEvent.click(screen.getByLabelText("metatile 0x3"));
    expect(screen.getByLabelText("metatile 0x3").className).toContain("--picked");
    m.switchTo("N");
    expect(document.querySelector(".gbc-metatile-palette__cell--picked")).toBeNull();
    click(m.canvas(), 72, 72); // pencil with no stamp is inert: no stroke
    expect(s.beginStroke).not.toHaveBeenCalled();
    m.switchTo("M");
    expect(document.querySelector(".gbc-metatile-palette__cell--picked")).toBeNull();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function localHost(session: UseGbcEditSessionResult) {
  let props!: GbcMapEditingCanvasProps;
  const el = (name: string) => <GbcMapEditing mapName={name} data={DATA} time="day" session={session}
    hoveredMetatileId={null} onHoverMetatile={() => {}} onOpenSave={() => {}}
    renderCanvas={(p) => { props = p!; return <div data-testid="persistent-canvas-slot" />; }} />;
  const view = render(el("M"));
  return { current: () => props, switchTo: (name: string) => view.rerender(el(name)) };
}

describe("GbcMapEditing per-visit local state", () => {
  it("retires stamp, event and error on an actual visit, including A to B to A without intervening picks", () => {
    const host = localHost(stub());
    const slot = screen.getByTestId("persistent-canvas-slot");
    fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
    fireEvent.click(screen.getByLabelText("metatile 0x3"));
    act(() => { host.current().onSelectEvent?.({ kind: "object", index: 0 }); host.current().onEditError?.("old error"); });
    host.switchTo("N");
    expect(screen.queryByRole("alert")).toBeNull();
    host.switchTo("M");
    expect(host.current().activeTool).toBeNull();
    expect(host.current().selectedEvent).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Pencil" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("persistent-canvas-slot")).toBe(slot);
  });

  it("retires warp warnings instead of hiding them for a return visit", async () => {
    const host = localHost(stub({ deleteEvent: vi.fn(async () => ({ warpRenumberWarnings: [{ fromMap: "Other", warpIndex: 2, destWarp: 3 }] })) }));
    act(() => host.current().onSelectEvent?.({ kind: "warp", index: 0 }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Other"));
    host.switchTo("N");
    host.switchTo("M");
    expect(screen.queryByRole("status")).toBeNull();
  });

  const cases = ["move", "delete", "duplicate", "undo", "redo", "discard"] as const;
  for (const op of cases) for (const aba of [false, true]) for (const failure of [false, true]) {
    it("ignores stale " + op + (failure ? " rejection" : " success") + (aba ? " after A to B to A" : " on B"), async () => {
      const pending = deferred<void>();
      const session = stub({ canUndo: true, canRedo: true, isDirty: true });
      const fn = vi.fn((..._args: unknown[]) => pending.promise);
      if (op === "move") session.moveEvent = fn;
      if (op === "delete") session.deleteEvent = (...args) => fn(...args).then(() => ({ warpRenumberWarnings: [{ fromMap: "Stale", warpIndex: 2, destWarp: 3 }] }));
      if (op === "duplicate") session.addEvent = fn;
      if (op === "undo") session.undo = fn;
      if (op === "redo") session.redo = fn;
      if (op === "discard") session.discard = fn;
      const host = localHost(session);
      act(() => host.current().onSelectEvent?.({ kind: "object", index: 0 }));
      if (op === "move") act(() => host.current().onMoveEvent?.({ kind: "object", index: 0, x: 3, y: 3 }));
      else if (op === "discard") {
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
        fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));
        confirm.mockRestore();
      } else fireEvent.click(screen.getByRole("button", { name: op === "duplicate" ? "Duplicate" : op === "delete" ? "Delete" : op === "undo" ? "Undo" : "Redo" }));
      expect(fn).toHaveBeenCalledTimes(1);
      host.switchTo("N");
      if (aba) host.switchTo("M");
      fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
      fireEvent.click(screen.getByLabelText("metatile 0x3"));
      act(() => { host.current().onSelectEvent?.({ kind: "warp", index: 0 }); host.current().onEditError?.("current visit error"); });
      await act(async () => {
        if (failure) pending.reject(new Error("stale error"));
        else pending.resolve();
      });
      expect(host.current().selectedEvent).toEqual({ kind: "warp", index: 0 });
      expect(screen.getByLabelText("metatile 0x3").className).toContain("--picked");
      expect(screen.getByRole("alert").textContent).toContain("current visit error");
      expect(screen.queryByRole("status")).toBeNull();
    });
  }

  it.each([false, true])("ignores a captured canvas error callback after a new visit (ABA=%s)", (aba) => {
    const host = localHost(stub());
    const old = host.current().onEditError!;
    host.switchTo("N");
    if (aba) host.switchTo("M");
    act(() => host.current().onEditError?.("current visit error"));
    act(() => old("stale canvas error"));
    expect(screen.getByRole("alert").textContent).toContain("current visit error");
  });
});

describe("GbcMapEditing block editor mount (Plan 14.2 Task 14a)", () => {
  const body = {
    blockId: 5, viaBorder: false, revision: "r1",
    block: {
      tiles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      collision: ["FLOOR", "WALL", "FLOOR", "WATER"],
      tilePalettes: Array.from({ length: 16 }, () => "GRAY"),
    },
    sheet: {
      url: "/api/block-sheet/A.png?tv=1&time=nite", tileCount: 64,
      tileIds: Array.from({ length: 64 }, (_, i) => 0x10 + i), reservedTiles: [],
    },
    options: { collision: ["FLOOR", "WALL", "WATER"], palettes: ["GRAY", "RED"] },
    usage: {
      files: ["blocks.bin"], tilesets: ["A"],
      maps: [{ map: "M", interior: 1, border: 0, block0AsBorder: 0 }], sharedGrids: [],
    },
    owner: null, limits: { nextId: 6, cap: 256 },
  };
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
    const previousFetch = globalThis.fetch;
    fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/edit/M/block" && (init?.method ?? "GET") === "GET") {
        return new Response(JSON.stringify(body), { status: 200 });
      }
      return previousFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  function sessionWithBlockEditor() {
    return {
      ...stub(),
      blockCheck: vi.fn<BlockEditSession["blockCheck"]>().mockResolvedValue(null),
      blockPreview: vi.fn<BlockEditSession["blockPreview"]>().mockResolvedValue(null),
      blockApply: vi.fn<BlockEditSession["blockApply"]>().mockResolvedValue(true),
    };
  }

  function workspace(session: ReturnType<typeof sessionWithBlockEditor>, mapName = "M", time: "day" | "nite" = "day") {
    return <GbcMapEditing mapName={mapName} data={DATA} time={time} session={session}
      hoveredMetatileId={null} onHoverMetatile={() => {}} onOpenSave={() => {}} blockEditorSpec={gbcAdapter.blockEditorSpec} />;
  }

  async function openDialog(container: HTMLElement) {
    const canvas = container.querySelector("canvas.map-canvas__stage") as HTMLCanvasElement;
    expect(canvas).not.toBeNull();
    const { width, height } = canvas;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON() {},
    });
    // Default zoom 1, pan (0,0); one 32px border ring gives origin (32,32).
    // source = ((112-0)/1,(80-0)/1) = (112,80); cell = floor((source-origin)/32) = (2,1).
    // A 16px event-step lookup would wrongly return (5,3), outside this 3x2 block map.
    expect(fireEvent.contextMenu(canvas, { clientX: 112, clientY: 80, button: 2 })).toBe(false);
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit block" }));
    await waitFor(() => {
      const panel = document.querySelector(".block-editor");
      expect(panel).not.toBeNull();
      expect(panel?.getAttribute("role")).toBe("dialog");
    });
    await screen.findByRole("button", { name: "OK" });
  }

  function blockRequests() {
    return fetchMock.mock.calls.map(([input]) => new URL(String(input), "http://localhost"))
      .filter(url => url.pathname === "/api/edit/M/block");
  }

  it("choosing Edit block renders the dialog for that block cell", async () => {
    const { container } = render(workspace(sessionWithBlockEditor()));
    await openDialog(container);
    const requests = blockRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0]!.searchParams.get("x")).toBe("2");
    expect(requests[0]!.searchParams.get("y")).toBe("1");
    // The GET identifies the map through its path; this API carries `from` in session requests only.
    if (requests[0]!.searchParams.has("from")) expect(requests[0]!.searchParams.get("from")).toBe("map");
  });

  it("a map switch closes the dialog", async () => {
    const session = sessionWithBlockEditor();
    const { container, rerender } = render(workspace(session));
    await openDialog(container);
    rerender(workspace(session, "N"));
    expect(document.querySelector(".block-editor")).toBeNull();
  });

  it("passes the current night time to the dialog's block request", async () => {
    const { container } = render(workspace(sessionWithBlockEditor(), "M", "nite"));
    await openDialog(container);
    const requests = blockRequests();
    expect(requests).toHaveLength(1);
    // useBlockEditor puts time on the GET that supplies preview sheet data, rather than blockPreview's body.
    expect(requests[0]!.searchParams.get("time")).toBe("nite");
  });
});
