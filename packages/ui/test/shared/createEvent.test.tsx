import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useEditSession } from "../../src/hooks/useEditSession.js";
import { useGbcEditSession } from "../../src/gbc/hooks/useGbcEditSession.js";
import { SaveDialog } from "../../src/components/SaveDialog.js";
import { FamilyApp } from "../../src/shell/FamilyApp.js";
import { GBA_CAPABILITIES, GBC_CAPABILITIES, type EngineAdapter } from "../../src/shell/adapter.js";
import type { AddEventForm } from "@pokemap/core/src/addEvent/types.js";

const form: AddEventForm = { kind: "warp", x: 2, y: 3, fields: {} };
const created = { kind: "warp", index: 0 };
const initialBlocks = [{ metatileId: 7, collision: 0, elevation: 0 }];
const events = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };
const body = { blocks: [], border: [], map: { name: "A" }, events, isDirty: true, canUndo: true, canRedo: false, created };
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response;
function deferred() {
  let resolve!: (value: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

for (const family of ["gba", "gbc"] as const) {
  describe(`${family} createEvent`, () => {
    function mount() {
      const useSession = family === "gba" ? useEditSession : useGbcEditSession;
      return renderHook(({ map }) => useSession(map, initialBlocks), { initialProps: { map: "A" } });
    }
    it("posts once and resolves created", async () => {
      const nextEvents = { ...events, warps: [{ x: 2, y: 3, mapConst: "MAP_B", destWarp: 1, lineIndex: 4 }] };
      const payload = family === "gba"
        ? { map: body.map, isDirty: true, canUndo: true, canRedo: false, created }
        : { ...body, events: nextEvents };
      const fetcher = vi.fn().mockResolvedValue(response(payload));
      vi.stubGlobal("fetch", fetcher);
      const { result } = mount();
      await act(async () => { expect(await result.current.createEvent(form)).toEqual(created); });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledWith("/api/edit/A/event/create", { method: "POST", body: JSON.stringify(form) });
      expect(result.current).toMatchObject({ isDirty: true, canUndo: true, canRedo: false });
      if ("map" in result.current) {
        expect(result.current.map).toEqual(body.map);
        expect(result.current.blocks).toBe(initialBlocks);
      } else {
        expect(result.current.events).toEqual(nextEvents);
        expect(result.current.blocks).toEqual(body.blocks);
      }
    });
    it("rejects a 400 with the server error text and code", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: "A maps/A: name taken", code: "LABEL_TAKEN" }, 400)));
      const { result } = mount();
      await expect(result.current.createEvent(form)).rejects.toMatchObject({ message: "A maps/A: name taken", code: "LABEL_TAKEN", stale: false });
      expect(result.current.isDirty).toBe(false);
    });
    it.each(["undo", "redo", "discard"] as const)("%s waits for pending create before its POST", async (action) => {
      const pending = deferred();
      const fetcher = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response(body));
      vi.stubGlobal("fetch", fetcher);
      const { result } = mount();
      const create = result.current.createEvent(form);
      const operation = result.current[action]();
      await act(async () => { await Promise.resolve(); });
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/event/create"]);
      await act(async () => { pending.resolve(response(body)); await create; await operation; });
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/event/create", `/api/edit/A/${action}`]);
    });
    it("Save waits for create before loading its plan and sending commit", async () => {
      const pending = deferred();
      const plan = { changes: [{ path: "A", kind: "text", summary: "created" }], refusals: [], fingerprint: "fresh" };
      const fetcher = vi.fn((url: string) => url.endsWith("/event/create") ? pending.promise : Promise.resolve(response(plan)));
      vi.stubGlobal("fetch", fetcher);
      const { result } = mount();
      const create = result.current.createEvent(form);
      render(<SaveDialog mapName="A" onCommitted={vi.fn()} onCancel={vi.fn()} />);
      await act(async () => { await Promise.resolve(); });
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/event/create"]);
      await act(async () => { pending.resolve(response(body)); await create; });
      expect(fetcher.mock.calls.map(([url]) => url)).toContain("/api/edit/A/plan");
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Changes" })); });
      expect(fetcher.mock.calls.map(([url]) => url)).toContain("/api/edit/A/commit");
      // A second create can begin after the plan loaded: the commit itself must also await it.
      const second = deferred();
      fetcher.mockImplementation((url: string) => url.endsWith("/event/create") ? second.promise : Promise.resolve(response(plan)));
      const nextCreate = result.current.createEvent(form);
      fetcher.mockClear();
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Changes" })); });
      expect(fetcher).not.toHaveBeenCalled();
      await act(async () => { second.resolve(response(body)); await nextCreate; });
      expect(fetcher.mock.calls.map(([url]) => url)).toContain("/api/edit/A/commit");
    });
    it("map switch waits for create, then prompts using its new dirty state before discard", async () => {
      const pending = deferred();
      const fetcher = vi.fn((url: string) => url.endsWith("/event/create") ? pending.promise : Promise.resolve(response(body)));
      vi.stubGlobal("fetch", fetcher);
      let create!: Promise<unknown>;
      const dungeon = { id: "unused", name: "unused", maps: [] };
      const useSession = family === "gba" ? useEditSession : useGbcEditSession;
      const adapter: EngineAdapter = {
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
            renderMap: () => <button onClick={() => { create = session.createEvent(form); }}>Start create</button>,
            renderWorld: () => null, renderDungeon: () => null, headerExtras: null, banners: null, modals: null,
            saveDialog: { open: false, setOpen: vi.fn(), onCommitted: vi.fn() },
          };
        },
      };
      render(<FamilyApp adapter={adapter} />);
      fireEvent.click(screen.getByRole("button", { name: "A" }));
      fireEvent.click(screen.getByRole("button", { name: "Start create" }));
      fireEvent.click(screen.getByRole("button", { name: "B" }));
      await act(async () => { await Promise.resolve(); });
      expect(document.querySelector(".app__status")?.textContent).toBe("A");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/event/create"]);
      await act(async () => { pending.resolve(response(body)); await create; });
      expect(document.querySelector(".app__status")?.textContent).toBe("A");
      expect(screen.getByText("You have unsaved changes on A.")).toBeTruthy();
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Discard" })); });
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/event/create", "/api/edit/A/discard"]);
      expect(document.querySelector(".app__status")?.textContent).toBe("B");
    });
    it("barrier settles after a refused create and lets undo proceed", async () => {
      const pending = deferred();
      const fetcher = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response(body));
      vi.stubGlobal("fetch", fetcher);
      const { result } = mount();
      const caught = result.current.createEvent(form).catch((error: unknown) => error);
      const undo = result.current.undo();
      await act(async () => { await Promise.resolve(); });
      expect(fetcher).toHaveBeenCalledTimes(1);
      await act(async () => {
        pending.resolve(response({ error: "refused", code: "BAD_OPTION" }, 400));
        expect(await caught).toMatchObject({ message: "refused", stale: false });
        await undo;
      });
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/edit/A/event/create", "/api/edit/A/undo"]);
    });
    it("delayed success after A to B to A resolves null and applies nothing", async () => {
      const pending = deferred();
      vi.stubGlobal("fetch", vi.fn(() => pending.promise));
      const { result, rerender } = mount();
      const create = result.current.createEvent(form);
      rerender({ map: "B" }); rerender({ map: "A" });
      await act(async () => { pending.resolve(response(body)); expect(await create).toBeNull(); });
      expect(result.current).toMatchObject({ isDirty: false, canUndo: false, canRedo: false });
      if ("map" in result.current) expect(result.current.map).toBeUndefined();
      else expect(result.current.events).toEqual(events);
    });
    it.each(["refusal", "network"])("delayed %s after A to B to A rejects with a stale marker", async (failure) => {
      const pending = deferred();
      vi.stubGlobal("fetch", vi.fn(() => pending.promise));
      const { result, rerender } = mount();
      const caught = result.current.createEvent(form).catch((error: unknown) => error);
      rerender({ map: "B" }); rerender({ map: "A" });
      await act(async () => {
        if (failure === "network") pending.reject(new Error("offline"));
        else pending.resolve(response({ error: "A maps/A: refused", code: "BAD_OPTION" }, 400));
        expect(await caught).toMatchObject({ stale: true });
      });
      expect(result.current.isDirty).toBe(false);
    });
  });
}
