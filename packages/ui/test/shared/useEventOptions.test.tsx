import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useEventOptions } from "../../src/shared/useEventOptions.js";
import { useVisit } from "../../src/shared/useVisit.js";
import { useEditSession } from "../../src/hooks/useEditSession.js";
import { useGbcEditSession } from "../../src/gbc/hooks/useGbcEditSession.js";

const project = { family: "gba", sprites: ["SPRITE"] };
const mapOptions = { entryPoints: ["Script"], localScripts: [], localTexts: [], scenes: [], warps: [] };
const events = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };
const session = { blocks: [], border: [], map: { name: "A" }, events, isDirty: false, canUndo: false, canRedo: true };
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response;
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((yes) => { resolve = yes; });
  return { promise, resolve };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("useEventOptions", () => {
  for (const family of ["gba", "gbc"] as const) {
    it.each(["save", "discard", "undo", "redo"] as const)(`${family}: both caches refetch after %s`, async (action) => {
      const fetcher = vi.fn((url: string) => Promise.resolve(response(url === "/api/event-options" ? project : url.startsWith("/api/event-options/") ? mapOptions : session)));
      vi.stubGlobal("fetch", fetcher);
      const useSession = family === "gba" ? useEditSession : useGbcEditSession;
      const { result } = renderHook(() => {
        const visit = useVisit("A");
        return { options: useEventOptions("A", visit), session: useSession("A") };
      });
      await act(() => result.current.options.load());
      expect(result.current.options.project).toEqual(project);
      expect(result.current.options.map).toEqual(mapOptions);
      fetcher.mockClear();
      await act(async () => {
        if (action === "save") result.current.session.markClean();
        else await result.current.session[action]();
      });
      await act(() => result.current.options.load());
      expect(fetcher.mock.calls.filter(([url]) => url === "/api/event-options")).toHaveLength(1);
      expect(fetcher.mock.calls.filter(([url]) => url === "/api/event-options/A")).toHaveLength(1);
    });
  }
  it("encodes tile/destination queries and copy/text labels", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(mapOptions));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useEventOptions("A B", useVisit("A B")));
    await act(() => result.current.load({ x: 0, y: 3, dest: "C D" }));
    await result.current.copy("Label & one");
    await result.current.text("Label & two");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/event-options", "/api/event-options/A%20B?x=0&y=3&dest=C+D",
      "/api/event-options/A%20B/copy?label=Label%20%26%20one", "/api/event-options/A%20B/text?label=Label%20%26%20two",
    ]);
  });
  it("drops old option responses after A to B to A, even with a newer load pending", async () => {
    const old = deferred(); const fresh = deferred();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise).mockReturnValueOnce(fresh.promise));
    const { result, rerender } = renderHook(({ map }) => useEventOptions(map, useVisit(map)), { initialProps: { map: "A" } });
    const first = result.current.load();
    rerender({ map: "B" }); rerender({ map: "A" });
    const second = result.current.load();
    await act(async () => { old.resolve(response(project)); await first; });
    expect(result.current.project).toBeUndefined(); expect(result.current.map).toBeUndefined();
    await act(async () => { fresh.resolve(response(mapOptions)); await second; });
    expect(result.current.map).toEqual(mapOptions);
  });
  it("invalidate prevents an in-flight response from repopulating either cache", async () => {
    const old = deferred();
    vi.stubGlobal("fetch", vi.fn(() => old.promise));
    const { result } = renderHook(() => useEventOptions("A", useVisit("A")));
    const loading = result.current.load();
    act(() => result.current.invalidate());
    await act(async () => { old.resolve(response(project)); await loading; });
    expect(result.current.project).toBeUndefined(); expect(result.current.map).toBeUndefined();
  });
  it("clears already-loaded options immediately on a map switch and on returning to A", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(mapOptions)));
    const { result, rerender } = renderHook(({ map }) => useEventOptions(map, useVisit(map)), { initialProps: { map: "A" } });
    await act(() => result.current.load());
    expect(result.current.map).toEqual(mapOptions);
    rerender({ map: "B" });
    expect(result.current.project).toBeUndefined(); expect(result.current.map).toBeUndefined();
    rerender({ map: "A" });
    expect(result.current.project).toBeUndefined(); expect(result.current.map).toBeUndefined();
  });
  it.each(["copy", "text"] as const)("%s rejects stale previews instead of handing them to the new visit", async (kind) => {
    const pending = deferred();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const { result, rerender } = renderHook(({ map }) => useEventOptions(map, useVisit(map)), { initialProps: { map: "A" } });
    const caught = result.current[kind]("Label").catch((error: unknown) => error);
    rerender({ map: "B" }); rerender({ map: "A" });
    pending.resolve(response({ label: "Label", text: "old" }));
    expect(await caught).toMatchObject({ stale: true });
  });
  it("keeps the latest query visible when requests settle out of order", async () => {
    const old = deferred(); const fresh = deferred();
    const fetcher = vi.fn((url: string) => url === "/api/event-options" ? Promise.resolve(response(project)) : url.includes("x=1") ? old.promise : fresh.promise);
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useEventOptions("A", useVisit("A")));
    const first = result.current.load({ x: 1, y: 1 });
    const second = result.current.load({ x: 2, y: 2 });
    const newer = { ...mapOptions, tileInfo: { x: 2, y: 2, warpCapable: true } };
    await act(async () => { fresh.resolve(response(newer)); await second; });
    await act(async () => { old.resolve(response(mapOptions)); await first; });
    expect(result.current.map).toEqual(newer);
  });
  it("project reload starts with empty caches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(project)));
    const first = renderHook(() => useEventOptions("A", useVisit("A")));
    await act(() => first.result.current.load()); first.unmount();
    const next = renderHook(() => useEventOptions("A", useVisit("A")));
    expect(next.result.current.project).toBeUndefined(); expect(next.result.current.map).toBeUndefined();
  });
});

it("merges only the current map staged constants into displayed options", async () => {
  const base = { ...project, flags: ["FLAG_DISK"], vars: ["VAR_DISK"] };
  const fetcher = vi.fn((url: string) => Promise.resolve(response(url === "/api/event-options" ? base :
    url.endsWith("/A") ? { ...mapOptions, stagedFlags: ["FLAG_A"], stagedVars: ["VAR_A"] } : mapOptions)));
  vi.stubGlobal("fetch", fetcher);
  const { result, rerender } = renderHook(({ map }) => useEventOptions(map, useVisit(map)), { initialProps: { map: "A" } });
  await act(() => result.current.load());
  expect(result.current.project?.flags).toEqual(["FLAG_DISK", "FLAG_A"]);
  expect(result.current.project?.vars).toEqual(["VAR_DISK", "VAR_A"]);
  rerender({ map: "B" });
  await act(() => result.current.load());
  expect(result.current.project?.flags).toEqual(["FLAG_DISK"]);
  expect(result.current.project?.vars).toEqual(["VAR_DISK"]);
});

it("keeps merged project identity across repeat loads while staged constants exist", async () => {
  const base = { ...project, flags: ["FLAG_DISK"], vars: ["VAR_DISK"] };
  vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(response(url === "/api/event-options" ? base : { ...mapOptions, stagedFlags: ["FLAG_A"] }))));
  const { result } = renderHook(() => useEventOptions("A", useVisit("A")));
  await act(() => result.current.load());
  const first = result.current.project;
  await act(() => result.current.load());
  expect(first?.flags).toEqual(["FLAG_DISK", "FLAG_A"]);
  expect(result.current.project).toBe(first);
});
