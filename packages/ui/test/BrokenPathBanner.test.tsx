import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FamilyApp } from "../src/shell/FamilyApp.js";
import { gbaAdapter } from "../src/gba/adapter.js";

/**
 * F1e: a map whose layout/tileset path leaves the project answers
 * `GET /api/map/<name>` with 409 `{ code: "broken-path", defect }`. The shell must show that
 * defect (file/message/fix) via DefectsBanner instead of the bare "Could not load ... -> 409".
 */

const GROUPS = { groupOrder: ["Kanto"], groups: { Kanto: ["Broken"] } };

const DEFECT = {
  file: "data/layouts/Broken/map.bin",
  line: 3,
  key: "blockdataFilepath",
  path: "../../outside.bin",
  message: "Tileset path leaves the project",
  fix: "Point blockdataFilepath inside data/",
};

/** One fetch mock routing every route the GBA tree can reach: groups, the map payload
 *  (the response under test), the defects check, and the edit-session hydration read. */
function makeFetchMock(mapResponse: () => Response) {
  return vi.fn((url: string) => {
    if (url === "/api/groups") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(GROUPS) } as Response);
    }
    if (url.startsWith("/api/map/")) return Promise.resolve(mapResponse());
    if (url.startsWith("/api/defects/")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ defects: [], incomplete: [] }) } as Response);
    }
    if (url.startsWith("/api/edit/")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ blocks: [], border: [], map: null, isDirty: false, canUndo: false, canRedo: false }) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("BrokenPathBanner", () => {
  it("shows the broken-path defect instead of the bare HTTP error", async () => {
    vi.stubGlobal("fetch", makeFetchMock(() => ({
      ok: false, status: 409,
      json: () => Promise.resolve({ error: DEFECT.message, code: "broken-path", defect: DEFECT }),
    } as Response)));

    render(<FamilyApp adapter={gbaAdapter} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Broken" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Broken" }));

    // The defect's message, its file (with the 1-based line) in a <code>, and the fix are all visible.
    await waitFor(() => expect(screen.getByText(DEFECT.message)).toBeTruthy());
    expect(screen.getByText("data/layouts/Broken/map.bin:3")).toBeTruthy();
    expect(screen.getByText(DEFECT.fix)).toBeTruthy();
    // A role="alert" banner, and the "cannot be opened" placeholder.
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/cannot be opened until this is fixed/)).toBeTruthy();
    // The bare HTTP error must NOT be shown.
    expect(screen.queryByText(/GET \/api\/map/)).toBeNull();
  });

  it("still shows 'Could not load' for a plain 500 (no broken-path body)", async () => {
    vi.stubGlobal("fetch", makeFetchMock(() => ({
      ok: false, status: 500, json: () => Promise.resolve({}),
    } as Response)));

    render(<FamilyApp adapter={gbaAdapter} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Broken" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Broken" }));

    await waitFor(() => expect(screen.getByText(/Could not load Broken/)).toBeTruthy());
    expect(screen.queryByText(/cannot be opened until this is fixed/)).toBeNull();
  });
});