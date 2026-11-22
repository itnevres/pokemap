import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useEditSession } from "../../src/hooks/useEditSession.js";
import { useGbcEditSession } from "../../src/gbc/hooks/useGbcEditSession.js";
import { SaveDialog } from "../../src/components/SaveDialog.js";
import { FamilyApp } from "../../src/shell/FamilyApp.js";
import { GBA_CAPABILITIES, GBC_CAPABILITIES, type EngineAdapter } from "../../src/shell/adapter.js";
import { EditSessionError, hasPendingSessionMutations, sessionMutationBarrier, useEditSessionCore } from "../../src/shared/useEditSessionCore.js";
import * as core from "../../src/shared/useEditSessionCore.js";
import { invalidateEventOptions } from "../../src/shared/useEventOptions.js";

vi.mock("../../src/shared/useEventOptions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/shared/useEventOptions.js")>();
  return { ...actual, invalidateEventOptions: vi.fn(actual.invalidateEventOptions) };
});

const initialBlocks = [{ metatileId: 7, collision: 0, elevation: 0 }];
const events = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };
const body = {
  blocks: [{ metatileId: 19, collision: 1, elevation: 2 }], border: [],
  map: {
    id: "MAP_A", name: "A", layout: "LAYOUT_A", music: "MUS_DUMMY",
    regionMapSection: "MAPSEC_NONE", mapType: "MAP_TYPE_TOWN", weather: "WEATHER_NONE",
    connections: [], objectEvents: [], warpEvents: [], coordEvents: [], bgEvents: [],
  },
  events, isDirty: true, canUndo: true, canRedo: false,
};
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response;
function deferred() {
  let resolve!: (value: Response) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Keep mutation fixtures and call-order assertions scoped to their routes; hydration has no open session.
function stubMutationFetch(fetcher: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", (url: string, ...args: [RequestInit?]) => url.endsWith("/session")
    ? Promise.resolve({ ok: true, status: 200, json: async () => ({ blocks: [], border: [], map: null, events: null, isDirty: false, canUndo: false, canRedo: false }) } as Response)
    : fetcher(url, ...args));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

for (const family of ["gba", "gbc"] as const) {
  describe(`${family} block edit`, () => {
    function mount() {
      const useSession = family === "gba" ? useEditSession : useGbcEditSession;
      return renderHook(({ map, blocks }) => useSession(map, blocks), { initialProps: { map: "A", blocks: initialBlocks } });
    }

    it.each(["undo", "redo", "discard"] as const)("%s waits for a pending block apply", async (action) => {
      const pending = deferred();
      const fetcher = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response(body));
      stubMutationFetch(fetcher);
      const { result } = mount();
      const apply = result.current.blockApply({ mode: "ok" }, "rev1");
      const operation = result.current[action]();
      await act(async () => { await Promise.resolve(); });
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/block/apply"]);
      await act(async () => { pending.resolve(response(body)); await apply; await operation; });
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/block/apply", `/api/edit/A/${action}`]);
    });

    it("Save waits for block apply before plan and commit", async () => {
      const pending = deferred();
      const plan = { changes: [{ path: "A", kind: "text", summary: "block edited" }], refusals: [], fingerprint: "fresh" };
      const fetcher = vi.fn((url: string) => url.endsWith("/block/apply") ? pending.promise : Promise.resolve(response(plan)));
      stubMutationFetch(fetcher);
      const { result } = mount();
      const apply = result.current.blockApply({ mode: "ok" }, "rev1");
      render(<SaveDialog mapName="A" onCommitted={vi.fn()} onCancel={vi.fn()} />);
      await act(async () => { await Promise.resolve(); });
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/block/apply"]);
      await act(async () => { pending.resolve(response(body)); await apply; });
      expect(fetcher.mock.calls.map(([url]) => url)).toContain("/api/edit/A/plan");
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Changes" })); });
      expect(fetcher.mock.calls.map(([url]) => url)).toContain("/api/edit/A/commit");
      // The plan has loaded; a later apply must still hold the commit itself.
      const second = deferred();
      fetcher.mockImplementation((url: string) => url.endsWith("/block/apply") ? second.promise : Promise.resolve(response(plan)));
      const nextApply = result.current.blockApply({ mode: "ok" }, "rev1");
      fetcher.mockClear();
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Changes" })); });
      expect(fetcher).not.toHaveBeenCalled();
      await act(async () => { second.resolve(response(body)); await nextApply; });
      expect(fetcher.mock.calls.map(([url]) => url)).toContain("/api/edit/A/commit");
    });

    it("map switch waits for block apply", async () => {
      const pending = deferred();
      const fetcher = vi.fn((url: string) => url.endsWith("/block/apply") ? pending.promise : Promise.resolve(response(body)));
      stubMutationFetch(fetcher);
      let apply!: Promise<boolean>;
      const dungeon = { id: "unused", name: "unused", maps: [] };
      const useSession = family === "gba" ? useEditSession : useGbcEditSession;
      const adapter: EngineAdapter = {
        addEventFields: () => [],
        addEventDefaults: () => ({}),
        family, label: null, capabilities: family === "gba" ? GBA_CAPABILITIES : GBC_CAPABILITIES,
        useRuntime({ selected, requestPrompt }) {
          const session = useSession(selected);
          return {
            session,
            groups: { data: { groupOrder: ["Maps"], groups: { Maps: ["A", "B"] } }, error: null },
            leave: (go, { sameMap }) => { if (sameMap || !session.isDirty) go(); else requestPrompt(go); },
            setSwitchError: vi.fn(), onSelected: vi.fn(), onEnterContext: vi.fn(),
            visibility: { placed: null, error: null }, hiddenMapTypes: new Set<string>(),
            dungeons: { data: [], error: null, create: async () => dungeon, rename: async () => dungeon, setMaps: async () => dungeon, remove: async () => {} },
            map: { error: null, ready: true, name: selected },
            renderMap: () => <button onClick={() => { apply = session.blockApply({ mode: "ok" }, "rev1"); }}>Start apply</button>,
            renderWorld: () => null, renderDungeon: () => null, headerExtras: null, banners: null, modals: null,
            saveDialog: { open: false, setOpen: vi.fn(), onCommitted: vi.fn() },
          };
        },
      };
      render(<FamilyApp adapter={adapter} />);
      fireEvent.click(screen.getByRole("button", { name: "A" }));
      fireEvent.click(screen.getByRole("button", { name: "Start apply" }));
      fireEvent.click(screen.getByRole("button", { name: "B" }));
      await act(async () => { await Promise.resolve(); });
      expect(document.querySelector(".app__status")?.textContent).toBe("A");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/block/apply"]);
      await act(async () => { pending.resolve(response(body)); await apply; });
      expect(document.querySelector(".app__status")?.textContent).toBe("A");
      expect(screen.getByText("You have unsaved changes on A.")).toBeTruthy();
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Discard" })); });
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/block/apply", "/api/edit/A/discard"]);
      expect(document.querySelector(".app__status")?.textContent).toBe("B");
    });

    it("a pending block check delays none of them", async () => {
      const pendingCheck = deferred();
      const pendingApply = deferred();
      const fetcher = vi.fn((url: string) => {
        if (url.endsWith("/block/check")) return pendingCheck.promise;
        if (url.endsWith("/block/apply")) return pendingApply.promise;
        return Promise.resolve(response(body));
      });
      stubMutationFetch(fetcher);
      const { result } = mount();
      const check = result.current.blockCheck({ mode: "ok" }, "rev1");
      expect(hasPendingSessionMutations("A")).toBe(false);
      const undo = result.current.undo();
      await act(async () => { await Promise.resolve(); });
      expect(fetcher.mock.calls.map(([url]) => url)).toContain("/api/edit/A/undo");
      const redo = result.current.redo();
      await act(async () => { await Promise.resolve(); });
      expect(fetcher.mock.calls.map(([url]) => url)).toContain("/api/edit/A/redo");
      const discard = result.current.discard();
      await act(async () => { await Promise.resolve(); });
      expect(fetcher.mock.calls.map(([url]) => url)).toContain("/api/edit/A/discard");
      expect(hasPendingSessionMutations("A")).toBe(false);
      const apply = result.current.blockApply({ mode: "ok" }, "rev1");
      expect(hasPendingSessionMutations("A")).toBe(true);
      await act(async () => { pendingApply.resolve(response(body)); await apply; });
      expect(hasPendingSessionMutations("A")).toBe(false);
      await act(async () => {
        pendingCheck.resolve(response({ usage: {}, confirm: false, warnings: [] }));
        await check; await undo; await redo; await discard;
      });
    });

    it("a 409 on block apply rejects with EditSessionError code and error", async () => {
      const fetcher = vi.fn()
        .mockResolvedValueOnce(response({ error: "revision: block edit is stale", code: "STALE" }, 409))
        .mockResolvedValueOnce(response({ error: "mode: bad", code: "BAD_VALUE" }, 400));
      stubMutationFetch(fetcher);
      const { result } = mount();
      await act(async () => {
        const apply = result.current.blockApply({ mode: "ok" }, "rev1");
        await expect(apply).rejects.toMatchObject({ message: "revision: block edit is stale", code: "STALE" });
        await expect(apply).rejects.toBeInstanceOf(EditSessionError);
        const check = result.current.blockCheck({ mode: "bad" }, "rev1");
        await expect(check).rejects.toMatchObject({ message: "mode: bad", code: "BAD_VALUE" });
        await expect(check).rejects.toBeInstanceOf(EditSessionError);
      });
    });

    it("a refused block preview rejects with EditSessionError code and error", async () => {
      stubMutationFetch(vi.fn().mockResolvedValue(response({ error: "mode: bad", code: "BAD_VALUE" }, 400)));
      const { result } = mount();
      await act(async () => {
        const preview = result.current.blockPreview({ mode: "bad" });
        await expect(preview).rejects.toMatchObject({ message: "mode: bad", code: "BAD_VALUE" });
        await expect(preview).rejects.toBeInstanceOf(EditSessionError);
      });
    });

    it("a block apply reply arriving after a map switch is not applied", async () => {
      const pending = deferred();
      stubMutationFetch(vi.fn(() => pending.promise));
      const { result, rerender } = mount();
      const apply = result.current.blockApply({ mode: "ok" }, "rev1");
      rerender({ map: "B", blocks: [{ metatileId: 31, collision: 2, elevation: 3 }] });
      await act(async () => { pending.resolve(response(body)); expect(await apply).toBe(false); });
      expect(result.current.isDirty).toBe(false);
      expect(result.current.blocks).toEqual([{ metatileId: 31, collision: 2, elevation: 3 }]);
    });

    it("a refused pending block apply releases undo and clears the registry", async () => {
      const pending = deferred();
      const fetcher = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response(body));
      stubMutationFetch(fetcher);
      const { result, unmount } = mount();
      const apply = result.current.blockApply({ mode: "ok" }, "rev1").catch((error: unknown) => error);
      const undo = result.current.undo().catch((error: unknown) => error);
      try {
        await act(async () => { await Promise.resolve(); });
        expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/block/apply"]);
        expect(hasPendingSessionMutations("A")).toBe(true);
        let refusal: unknown;
        let undoResult: unknown;
        await act(async () => {
          pending.resolve(response({ error: "revision: block edit is stale", code: "STALE" }, 409));
          refusal = await apply;
          undoResult = await undo;
        });
        expect(refusal).toBeInstanceOf(EditSessionError);
        expect(refusal).toMatchObject({ message: "revision: block edit is stale", code: "STALE" });
        expect(undoResult).toBeUndefined();
        expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/block/apply", "/api/edit/A/undo"]);
        expect(hasPendingSessionMutations("A")).toBe(false);
      } finally {
        await act(async () => {
          pending.resolve(response({ error: "revision: block edit is stale", code: "STALE" }, 409));
          unmount();
          await apply; await undo;
        });
      }
    });

    it("a block apply started while undo is already waiting also holds undo", async () => {
      const a = deferred();
      const b = deferred();
      const fetcher = vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockResolvedValue(response(body));
      stubMutationFetch(fetcher);
      const { result } = mount();
      const first = result.current.blockApply({ mode: "ok" }, "rev1");
      const undo = result.current.undo();
      await act(async () => { await Promise.resolve(); });
      const second = result.current.blockApply({ mode: "ok" }, "rev1");
      await act(async () => {
        a.resolve(response(body)); await first;
        for (let i = 0; i < 5; i++) await Promise.resolve();
      });
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/block/apply", "/api/edit/A/block/apply"]);
      await act(async () => { b.resolve(response(body)); await second; await undo; });
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/block/apply", "/api/edit/A/block/apply", "/api/edit/A/undo"]);
    });

    it("a block apply that fails on the network releases the registry and undo", async () => {
      const pending = deferred();
      const fetcher = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response(body));
      stubMutationFetch(fetcher);
      const { result } = mount();
      const apply = result.current.blockApply({ mode: "ok" }, "rev1");
      await act(async () => {
        pending.reject(new Error("socket hang up"));
        await expect(apply).rejects.toBeInstanceOf(EditSessionError);
        await expect(apply).rejects.toMatchObject({ message: "socket hang up" });
      });
      expect(hasPendingSessionMutations("A")).toBe(false);
      expect(result.current.isDirty).toBe(false);
      expect(result.current.blocks).toEqual(initialBlocks);
      await act(async () => { await result.current.undo(); });
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/block/apply", "/api/edit/A/undo"]);
    });

    it("a non-JSON error reply on block apply rejects with the status message", async () => {
      const fetcher = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new SyntaxError("bad json"); } })
        .mockResolvedValue(response(body));
      stubMutationFetch(fetcher);
      const { result } = mount();
      await act(async () => {
        const apply = result.current.blockApply({ mode: "ok" }, "rev1");
        await expect(apply).rejects.toBeInstanceOf(EditSessionError);
        await expect(apply).rejects.toMatchObject({ code: undefined, message: "POST /api/edit/A/block/apply -> 500" });
      });
      expect(hasPendingSessionMutations("A")).toBe(false);
      expect(result.current.isDirty).toBe(false);
      expect(result.current.blocks).toEqual(initialBlocks);
      await act(async () => { await result.current.undo(); });
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/block/apply", "/api/edit/A/undo"]);
    });

    it("a pending block check delays neither Save nor the map switch: Save", async () => {
      const pending = deferred();
      const plan = { changes: [{ path: "A", kind: "text", summary: "block edited" }], refusals: [], fingerprint: "fresh" };
      const fetcher = vi.fn((url: string) => url.endsWith("/block/check") ? pending.promise : Promise.resolve(response(plan)));
      stubMutationFetch(fetcher);
      const { result } = mount();
      const check = result.current.blockCheck({ mode: "ok" }, "rev1");
      render(<SaveDialog mapName="A" onCommitted={vi.fn()} onCancel={vi.fn()} />);
      await act(async () => { await Promise.resolve(); });
      expect(fetcher.mock.calls.map(([url]) => url)).toContain("/api/edit/A/plan");
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Changes" })); });
      expect(fetcher.mock.calls.map(([url]) => url)).toContain("/api/edit/A/commit");
      await act(async () => { pending.resolve(response({ usage: {}, confirm: false, warnings: [] })); await check; });
    });

    it("a pending block check delays neither Save nor the map switch: map switch", async () => {
      const pending = deferred();
      const fetcher = vi.fn((url: string) => url.endsWith("/block/check") ? pending.promise : Promise.resolve(response(body)));
      stubMutationFetch(fetcher);
      let apply!: Promise<boolean>;
      let check!: ReturnType<ReturnType<typeof useEditSession>["blockCheck"]>;
      const dungeon = { id: "unused", name: "unused", maps: [] };
      const useSession = family === "gba" ? useEditSession : useGbcEditSession;
      const adapter: EngineAdapter = {
        addEventFields: () => [], addEventDefaults: () => ({}),
        family, label: null, capabilities: family === "gba" ? GBA_CAPABILITIES : GBC_CAPABILITIES,
        useRuntime({ selected, requestPrompt }) {
          const session = useSession(selected);
          return {
            session,
            groups: { data: { groupOrder: ["Maps"], groups: { Maps: ["A", "B"] } }, error: null },
            leave: (go, { sameMap }) => { if (sameMap || !session.isDirty) go(); else requestPrompt(go); },
            setSwitchError: vi.fn(), onSelected: vi.fn(), onEnterContext: vi.fn(),
            visibility: { placed: null, error: null }, hiddenMapTypes: new Set<string>(),
            dungeons: { data: [], error: null, create: async () => dungeon, rename: async () => dungeon, setMaps: async () => dungeon, remove: async () => {} },
            map: { error: null, ready: true, name: selected },
            renderMap: () => <><button onClick={() => { apply = session.blockApply({ mode: "ok" }, "rev1"); }}>Start apply</button><button onClick={() => { check = session.blockCheck({ mode: "ok" }, "rev1"); }}>Start check</button></>,
            renderWorld: () => null, renderDungeon: () => null, headerExtras: null, banners: null, modals: null,
            saveDialog: { open: false, setOpen: vi.fn(), onCommitted: vi.fn() },
          };
        },
      };
      render(<FamilyApp adapter={adapter} />);
      fireEvent.click(screen.getByRole("button", { name: "A" }));
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Start apply" })); await apply; });
      fireEvent.click(screen.getByRole("button", { name: "Start check" }));
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "B" })); await Promise.resolve(); });
      expect(screen.getByText("You have unsaved changes on A.")).toBeTruthy();
      await act(async () => { pending.resolve(response({ usage: {}, confirm: false, warnings: [] })); await check; });
    });

    it("block calls with no map do nothing", async () => {
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      const useSession = family === "gba" ? useEditSession : useGbcEditSession;
      const { result } = renderHook(() => useSession(null, initialBlocks));
      await act(async () => {
        expect(await result.current.blockCheck({ mode: "ok" }, "rev1")).toBeNull();
        expect(await result.current.blockPreview({ mode: "ok" })).toBeNull();
        expect(await result.current.blockApply({ mode: "ok" }, "rev1")).toBe(false);
      });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("blockApply posts the revision in the body", async () => {
      const fetcher = vi.fn((url: string) => Promise.resolve(response(
        url.endsWith("/block/check") ? { usage: { blocks: 1 }, confirm: false, warnings: [] }
          : url.endsWith("/block/preview") ? { png: "data:image/png;base64,AAAA" } : body,
      )));
      stubMutationFetch(fetcher);
      const { result } = mount();
      await act(async () => { expect(await result.current.blockApply({ mode: "ok" }, "rev1")).toBe(true); });
      expect(fetcher).toHaveBeenCalledWith("/api/edit/A/block/apply", { method: "POST", body: JSON.stringify({ mode: "ok", revision: "rev1" }) });
      await act(async () => {
        expect(await result.current.blockCheck({ mode: "ok" }, "rev1")).toEqual({ usage: { blocks: 1 }, confirm: false, warnings: [] });
      });
      expect(fetcher).toHaveBeenCalledWith("/api/edit/A/block/check", { method: "POST", body: JSON.stringify({ mode: "ok", revision: "rev1" }) });
      await act(async () => {
        expect(await result.current.blockPreview({ mode: "ok" })).toEqual({ png: "data:image/png;base64,AAAA" });
      });
      expect(fetcher).toHaveBeenCalledWith("/api/edit/A/block/preview", { method: "POST", body: JSON.stringify({ mode: "ok" }) });
      expect(fetcher).toHaveBeenCalledTimes(3);
      const request = { mode: "ok", tileset: "primary", tile: { index: 4, palette: 2 } };
      await act(async () => { expect(await result.current.blockApply(request, "rev2")).toBe(true); });
      expect(fetcher).toHaveBeenCalledWith("/api/edit/A/block/apply", {
        method: "POST", body: JSON.stringify({ mode: "ok", tileset: "primary", tile: { index: 4, palette: 2 }, revision: "rev2" }),
      });
      await act(async () => { await result.current.blockCheck(request, "rev2"); });
      expect(fetcher).toHaveBeenCalledWith("/api/edit/A/block/check", {
        method: "POST", body: JSON.stringify({ mode: "ok", tileset: "primary", tile: { index: 4, palette: 2 }, revision: "rev2" }),
      });
      await act(async () => { await result.current.blockPreview(request); });
      expect(fetcher).toHaveBeenCalledWith("/api/edit/A/block/preview", {
        method: "POST", body: JSON.stringify({ mode: "ok", tileset: "primary", tile: { index: 4, palette: 2 } }),
      });
      expect(fetcher).toHaveBeenCalledTimes(6);
    });
  });
}

describe("GBC block apply replies", () => {
  it("gbc blockApply rejects a malformed success reply and leaves state", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ blocks: "nope" })).mockResolvedValue(response(body));
    stubMutationFetch(fetcher);
    const { result } = renderHook(() => useGbcEditSession("A", initialBlocks));
    await act(async () => {
      const apply = result.current.blockApply({ mode: "ok" }, "rev1");
      await expect(apply).rejects.toBeInstanceOf(Error);
      await expect(apply).rejects.toThrow("unexpected shape");
    });
    expect(hasPendingSessionMutations("A")).toBe(false);
    expect(result.current.blocks).toEqual(initialBlocks);
    expect(result.current.isDirty).toBe(false);
    await act(async () => { await result.current.undo(); });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/block/apply", "/api/edit/A/undo"]);
  });

  it("gbc blockApply resolves false when the server has no open session", async () => {
    stubMutationFetch(vi.fn().mockResolvedValue(response({ blocks: [], events: null, isDirty: false, canUndo: false, canRedo: false })));
    const { result } = renderHook(() => useGbcEditSession("A", initialBlocks));
    await act(async () => { expect(await result.current.blockApply({ mode: "ok" }, "rev1")).toBe(false); });
    expect(result.current.blocks).toEqual(initialBlocks);
  });
});

describe("block edit core registry and tickets", () => {
  it("two block checks get increasing ticket seq", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ usage: {}, confirm: false, warnings: [] })));
    const seed = { n: 1 };
    const { result } = renderHook(() => useEditSessionCore("/api/edit", "A", seed));
    const first = await result.current.post("/block/check", { mode: "ok", revision: "rev1" });
    const second = await result.current.post("/block/check", { mode: "ok", revision: "rev1" });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.ticket.seq).toBeGreaterThan(first!.ticket.seq);
  });

  it("block check and preview never register", async () => {
    const check = deferred();
    const preview = deferred();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(check.promise).mockReturnValueOnce(preview.promise));
    const seed = { n: 1 };
    const { result } = renderHook(() => useEditSessionCore("/api/edit", "A", seed));
    const checked = result.current.post("/block/check", { mode: "ok", revision: "rev1" });
    expect(hasPendingSessionMutations("A")).toBe(false);
    const previewed = result.current.post("/block/preview", { mode: "ok" });
    expect(hasPendingSessionMutations("A")).toBe(false);
    let crossed = false;
    const barrier = (async () => { await sessionMutationBarrier("A"); crossed = true; })();
    await act(async () => { await Promise.resolve(); });
    expect(crossed).toBe(true);
    await act(async () => {
      check.resolve(response({ usage: {}, confirm: false, warnings: [] }));
      preview.resolve(response({ png: "data:image/png;base64,AAAA" }));
      await checked; await previewed; await barrier;
    });
  });

  it("paint requests never register", async () => {
    const begin = deferred();
    const apply = deferred();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(begin.promise).mockReturnValueOnce(apply.promise));
    const seed = { n: 1 };
    const { result } = renderHook(() => useEditSessionCore("/api/edit", "A", seed));
    const started = result.current.post("/paint/begin");
    const painted = result.current.post("/paint/apply", {});
    expect(hasPendingSessionMutations("A")).toBe(false);
    await act(async () => { begin.resolve(response({})); apply.resolve(response({})); await started; await painted; });
  });

  it("block requests never invalidate event options", async () => {
    vi.mocked(invalidateEventOptions).mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({})));
    const seed = { n: 1 };
    const { result } = renderHook(() => useEditSessionCore("/api/edit", "A", seed));
    await act(async () => {
      await result.current.post("/block/check", {});
      await result.current.post("/block/preview", {});
      await result.current.post("/block/apply", {});
    });
    expect(invalidateEventOptions).not.toHaveBeenCalled();
    await act(async () => { await result.current.post("/undo"); });
    expect(invalidateEventOptions).toHaveBeenCalledTimes(1);
  });

  it("the old names are gone", () => {
    expect("eventCreateBarrier" in core).toBe(false);
    expect("hasPendingEventCreates" in core).toBe(false);
    expect(typeof core.sessionMutationBarrier).toBe("function");
  });
});
