import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useWorldVisibility } from "../src/hooks/useWorldVisibility.js";

afterEach(() => vi.unstubAllGlobals());

/** No renderHook in this project's testing-library setup elsewhere -- a
 *  tiny host component is the established way to exercise a hook here too
 *  (mirrors how useMapGroups/useCoverage are exercised indirectly through
 *  the components that use them; this hook has no such component yet). */
function Host({ enabled, onResult }: { enabled: boolean; onResult: (r: ReturnType<typeof useWorldVisibility>) => void }) {
  const result = useWorldVisibility(enabled);
  onResult(result);
  return null;
}

describe("useWorldVisibility", () => {
  it("fetches nothing when disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let last: ReturnType<typeof useWorldVisibility> | undefined;
    render(<Host enabled={false} onResult={(r) => { last = r; }} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(last?.placed).toBeNull();
  });

  it("fetches /api/world once enabled and exposes mapType/manual per placed map", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            placements: {
              Town: { map: "Town", x: 0, y: 0, width: 10, height: 10, component: 0, mapType: "MAP_TYPE_TOWN", manual: false },
            },
          }),
      } as Response),
    );
    vi.stubGlobal("fetch", fetchMock);
    let last: ReturnType<typeof useWorldVisibility> | undefined;
    render(<Host enabled={true} onResult={(r) => { last = r; }} />);
    await waitFor(() => expect(last?.placed).not.toBeNull());
    expect(last!.placed!.get("Town")).toEqual({ mapType: "MAP_TYPE_TOWN", manual: false });
    expect(last!.placed!.has("NotPlaced")).toBe(false);
  });
});
