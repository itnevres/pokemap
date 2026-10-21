import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { memo, type ReactElement } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { MapTreeProps } from "../../src/components/MapTree.js";

// Plan 9 follow-up O2: every edit-session reply (begin, apply, end) and every hover re-rendered the whole shell,
// including the map tree (391 GBC / 1,209 GBA rows): 60-400 ms per reply in the dev build. The tree must not
// re-render when only the session changes. Counts renders of the real tree body behind the real memo boundary.
const counter = vi.hoisted(() => ({ renders: 0 }));
vi.mock("../../src/components/MapTree.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/components/MapTree.js")>();
  const real = actual.MapTree as unknown as { type?: (p: MapTreeProps) => ReactElement };
  const body = real.type ?? (actual.MapTree as unknown as (p: MapTreeProps) => ReactElement);
  return { ...actual, MapTree: memo((p: MapTreeProps) => { counter.renders++; return body(p); }) };
});

const { FamilyApp } = await import("../../src/shell/FamilyApp.js");
const { gbcAdapter } = await import("../../src/gbc/adapter.js");
const { MapTree: RealTreeModule } = await vi.importActual<typeof import("../../src/components/MapTree.js")>("../../src/components/MapTree.js");

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const EMPTY_EVENTS = { warps: [], coords: [], bgs: [], objects: [], sceneScripts: [], callbacks: [], objectConsts: [] };
const PAYLOAD = {
  family: "gbc",
  map: {
    name: "OlivineCity", constName: "OLIVINECITY", group: 1, number: 1, width: 2, height: 1, blkPath: "maps/OlivineCity.blk",
    tileset: "TILESET_OLIVINE", environment: "E", landmark: "L", music: "M", phoneFlag: "0", palette: "P",
    fishGroup: "0", border: 3, connectionFlags: "0", connections: [],
  },
  layout: { blkPath: "maps/OlivineCity.blk", width: 2, height: 1 },
  blocks: [{ metatileId: 0 }, { metatileId: 1 }],
  metatileCount: 2,
  tileset: { constName: "TILESET_OLIVINE", name: "TilesetOlivine" },
  collision: [{ tl: 0, tr: 0, bl: 0, br: 0 }, { tl: 7, tr: 7, bl: 7, br: 7 }],
  collisionInfo: { "0": { name: "COLL_FLOOR", category: "land", talk: false } },
  events: EMPTY_EVENTS, defects: [], paddingWidth: 3,
};
const ok = (b: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) } as Response);

describe("map tree render isolation (Plan 9 follow-up O2)", () => {
  it("the real MapTree export is memoised", () => {
    expect((RealTreeModule as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for("react.memo"));
  });

  it("a paint stroke's session replies do not re-render the map tree", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/api/groups") return ok({ groupOrder: ["OLIVINE"], groups: { OLIVINE: ["OlivineCity", "OlivinePort"] } });
      if (url === "/api/world") return ok({ family: "gbc", blockPx: 32, placements: {}, components: [], conflicts: [], sidecar: { dungeonAutoLayout: true } });
      if (url === "/api/map/OlivineCity") return ok(PAYLOAD);
      // Each reply is a new object, as the real server's are.
      if (url.startsWith("/api/edit/")) return ok({ blocks: [{ metatileId: 1 }, { metatileId: ++n % 2 }], events: EMPTY_EVENTS, isDirty: url.endsWith("/end"), canUndo: true, canRedo: false });
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }));
    render(<FamilyApp adapter={gbcAdapter} />);
    await waitFor(() => expect(screen.getByText("OlivineCity")).toBeTruthy());
    fireEvent.click(screen.getByText("OlivineCity"));
    await waitFor(() => expect(screen.getByText(/tileset TILESET_OLIVINE/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
    fireEvent.click(screen.getByLabelText("metatile 0x1"));
    const before = counter.renders;

    const canvas = document.querySelector("canvas.map-canvas__stage")!;
    fireEvent.mouseDown(canvas, { clientX: 40, clientY: 40, button: 0 });
    fireEvent.mouseUp(canvas, { clientX: 40, clientY: 40, button: 0 });
    await waitFor(() => expect(screen.getByTestId("dirty-indicator")).toBeTruthy());

    expect(n).toBeGreaterThanOrEqual(3); // begin, apply, end all replied
    expect(counter.renders).toBe(before);
  });
});
