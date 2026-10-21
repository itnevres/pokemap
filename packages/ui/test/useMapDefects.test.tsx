import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useMapDefects } from "../src/hooks/useMapDefects.js";

const defect = { file: "map.bin", kind: "size", message: "wrong size", fix: "Fix map.bin." };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("fetches on map selection and successful-save token changes, with no stale defects", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ defects: [defect] }) });
  vi.stubGlobal("fetch", fetcher);
  const { result, rerender } = renderHook(({ name, token }) => useMapDefects(name, token), {
    initialProps: { name: "Old" as string | null, token: 0 },
  });
  await waitFor(() => expect(result.current).toEqual([defect]));
  let finish!: (r: unknown) => void;
  fetcher.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
  rerender({ name: "Next Map", token: 0 });
  expect(result.current).toEqual([]);
  expect(fetcher).toHaveBeenLastCalledWith("/api/defects/Next%20Map");
  rerender({ name: "Next Map", token: 1 });
  await waitFor(() => expect(result.current).toEqual([defect]));
  await act(async () => { finish({ ok: true, json: async () => ({ defects: [] }) }); });
  expect(result.current).toEqual([defect]);
  expect(fetcher).toHaveBeenCalledTimes(3);
  rerender({ name: null, token: 1 });
  expect(result.current).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("does not mislabel a request failure as a decomp data defect", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { result } = renderHook(() => useMapDefects("Test", 0));
  await waitFor(() => expect(error).toHaveBeenCalled());
  expect(result.current).toEqual([]);
});
