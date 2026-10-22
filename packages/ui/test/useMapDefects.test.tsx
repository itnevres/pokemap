import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { DefectsBanner } from "../src/shared/DefectsBanner.js";
import { useMapDefects } from "../src/hooks/useMapDefects.js";

const defect = { file: "map.bin", kind: "size", message: "wrong size", fix: "Fix map.bin." };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("fetches on map selection and successful-save token changes, with no stale defects", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ defects: [defect], incomplete: [] }) });
  vi.stubGlobal("fetch", fetcher);
  const { result, rerender } = renderHook(({ name, token }) => useMapDefects(name, token), {
    initialProps: { name: "Old" as string | null, token: 0 },
  });
  await waitFor(() => expect(result.current).toEqual({ defects: [defect], error: null, incomplete: [] }));
  let finish!: (r: unknown) => void;
  fetcher.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
  rerender({ name: "Next Map", token: 0 });
  expect(result.current).toEqual({ defects: [], error: null, incomplete: [] });
  expect(fetcher).toHaveBeenLastCalledWith("/api/defects/Next%20Map");
  rerender({ name: "Next Map", token: 1 });
  await waitFor(() => expect(result.current).toEqual({ defects: [defect], error: null, incomplete: [] }));
  await act(async () => { finish({ ok: true, json: async () => ({ defects: [], incomplete: [] }) }); });
  expect(result.current).toEqual({ defects: [defect], error: null, incomplete: [] });
  expect(fetcher).toHaveBeenCalledTimes(3);
  rerender({ name: null, token: 1 });
  expect(result.current).toEqual({ defects: [], error: null, incomplete: [] });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

function Probe({ name = "Test", token = 0 }: { name?: string | null; token?: number }) {
  const result = useMapDefects(name, token);
  return <DefectsBanner defects={result.defects} error={result.error} incomplete={result.incomplete} />;
}

it.each([
  ["server error", () => Promise.resolve({ ok: false, status: 500, json: async () => ({ error: "data/maps/Test/map.json: invalid JSON" }) }), "data/maps/Test/map.json: invalid JSON"],
  ["network error", () => Promise.reject(new Error("offline")), "offline"],
  ["non-JSON error", () => Promise.resolve({ ok: false, status: 502, json: async () => { throw new Error("not JSON"); } }), "GET /api/defects/Test -> 502"],
])("shows a visible non-dismissible check failure for %s", async (_name, fetcher, reason) => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(fetcher as () => Promise<unknown>));
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<Probe />);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(`Could not check this map for defects: ${reason}`));
  expect(screen.queryByRole("button")).toBeNull();
});

it("clears check failures on selection and a successful retry after save", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { rerender } = render(<Probe />);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("offline"));
  rerender(<Probe name={null} />);
  expect(screen.queryByRole("alert")).toBeNull();
  rerender(<Probe />);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("offline"));
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ defects: [], incomplete: [] }) });
  rerender(<Probe token={1} />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each([{ defects: [] }, { defects: [defect] }])("shows the partial-check line alongside any defects: %j", async ({ defects }) => {
  const incomplete = [{ file: "data/maps/Other/map.json", reason: "invalid JSON" }, { file: "data/maps/Next/map.json", reason: "unreadable" }];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ defects, incomplete }) }));
  const { rerender } = render(<Probe />);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(
    "Some defect checks may be incomplete: data/maps/Other/map.json: invalid JSON, data/maps/Next/map.json: unreadable"));
  expect(screen.queryByRole("button")).toBeNull();
  if (defects.length) expect(screen.getByText("wrong size")).toBeTruthy();
  rerender(<Probe name={null} />);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("clears partial results when a successful save triggers a complete recheck", async () => {
  const incomplete = [{ file: "data/maps/Other/map.json", reason: "invalid JSON" }];
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ defects: [], incomplete }) });
  vi.stubGlobal("fetch", fetcher);
  const { result, rerender } = renderHook(({ token }) => useMapDefects("Test", token), { initialProps: { token: 0 } });
  await waitFor(() => expect(result.current).toEqual({ defects: [], incomplete, error: null }));
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ defects: [], incomplete: [] }) });
  rerender({ token: 1 });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current).toEqual({ defects: [], incomplete: [], error: null }));
});
