import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { ProjectPicker } from "../../src/hub/ProjectPicker.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const HUB_STATE = {
  current: { family: "gba", root: "/tmp/pokeemerald" },
  recent: [
    { path: "/tmp/pokeemerald", family: "gba", openedAt: "2026-09-29T00:00:00.000Z" },
    { path: "/tmp/pokecrystal", family: "gbc", openedAt: "2026-09-28T00:00:00.000Z" },
  ],
};

const BROWSE_TMP = {
  dir: "/tmp",
  parent: "/",
  entries: [
    { name: "pokeemerald", path: "/tmp/pokeemerald", family: "gba" },
    { name: "pokecrystal", path: "/tmp/pokecrystal", family: "gbc" },
    { name: "notes", path: "/tmp/notes", family: "unsupported" },
    { name: "misc", path: "/tmp/misc", family: null },
  ],
};

const BROWSE_MISC = { dir: "/tmp/misc", parent: "/tmp", entries: [] };
const BROWSE_ROOT = { dir: "/", parent: null, entries: [{ name: "tmp", path: "/tmp", family: null }] };

/** Shared in-file fetch mock (per-file, per the spec's own convention) --
 *  routes `/api/hub`, `/api/hub/browse?dir=...` (from a `browse` map keyed
 *  by exact URL, entry either a plain body or a function returning a
 *  deferred Promise<body> for the stale-response test), and
 *  `POST /api/hub/open` (via `onOpen`, given the parsed body, returning
 *  `{status, body}`). An unmapped URL rejects loudly rather than hanging. */
function makeHubFetch(opts: {
  hub?: unknown;
  browse?: Record<string, unknown | (() => Promise<unknown>)>;
  onOpen?: (body: { path: string; force?: boolean }) => { status: number; body: unknown };
}) {
  const calls: string[] = [];
  const postBodies: Array<{ path: string; force?: boolean }> = [];
  const mock = vi.fn((url: string, init?: RequestInit) => {
    calls.push(url);
    if (url === "/api/hub") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.hub) });
    }
    if (url.startsWith("/api/hub/browse")) {
      const entry = opts.browse?.[url];
      if (entry === undefined) return Promise.reject(new Error(`unexpected browse url in test: ${url}`));
      const bodyPromise = typeof entry === "function" ? (entry as () => Promise<unknown>)() : Promise.resolve(entry);
      return bodyPromise.then((body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) }));
    }
    if (url === "/api/hub/open" && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { path: string; force?: boolean };
      postBodies.push(body);
      const { status, body: respBody } = opts.onOpen
        ? opts.onOpen(body)
        : { status: 500, body: { error: "no onOpen handler configured" } };
      return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(respBody) });
    }
    return Promise.reject(new Error(`unexpected fetch in test: ${url}`));
  });
  return { mock, calls, postBodies };
}

describe("ProjectPicker", () => {
  it("renders recent entries with a family badge + path; clicking Open posts { path } and calls onOpened", async () => {
    const onOpened = vi.fn();
    const { mock, postBodies } = makeHubFetch({
      hub: HUB_STATE,
      browse: { "/api/hub/browse?dir=%2Ftmp": BROWSE_TMP },
      onOpen: (body) => ({ status: 200, body: { family: "gba", root: body.path } }),
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={onOpened} />);

    await waitFor(() => expect(screen.getByText("/tmp/pokeemerald")).toBeTruthy());
    const row = screen.getByText("/tmp/pokeemerald").closest("li")!;
    expect(within(row).getByText("GBA")).toBeTruthy();

    fireEvent.click(within(row).getByRole("button", { name: "Open" }));
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith({ family: "gba", root: "/tmp/pokeemerald" }));
    expect(postBodies).toEqual([{ path: "/tmp/pokeemerald" }]);
  });

  it("browse: initial fetch uses the parent of current.root", async () => {
    const { mock, calls } = makeHubFetch({
      hub: HUB_STATE,
      browse: { "/api/hub/browse?dir=%2Ftmp": BROWSE_TMP },
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={vi.fn()} />);

    await waitFor(() => expect(calls).toContain("/api/hub/browse?dir=%2Ftmp"));
  });

  it("clicking a folder name fetches its dir; Up fetches parent", async () => {
    const { mock, calls } = makeHubFetch({
      hub: HUB_STATE,
      browse: {
        "/api/hub/browse?dir=%2Ftmp": BROWSE_TMP,
        "/api/hub/browse?dir=%2Ftmp%2Fmisc": BROWSE_MISC,
      },
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("misc")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "misc" }));
    await waitFor(() => expect(calls).toContain("/api/hub/browse?dir=%2Ftmp%2Fmisc"));

    fireEvent.click(screen.getByRole("button", { name: "Up" }));
    await waitFor(() => expect(calls.filter((u) => u === "/api/hub/browse?dir=%2Ftmp").length).toBe(2));
  });

  it("the Open button is disabled for unsupported/null entries and enabled for gba/gbc; opening a gbc entry calls onOpened", async () => {
    const onOpened = vi.fn();
    const { mock } = makeHubFetch({
      hub: HUB_STATE,
      browse: { "/api/hub/browse?dir=%2Ftmp": BROWSE_TMP },
      onOpen: (body) => ({ status: 200, body: { family: "gbc", root: body.path } }),
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={onOpened} />);

    await waitFor(() => expect(screen.getByText("notes")).toBeTruthy());

    const notesRow = screen.getByText("notes").closest("li")!;
    const miscRow = screen.getByText("misc").closest("li")!;
    const crystalRow = screen.getByText("pokecrystal").closest("li")!;
    const emeraldRow = screen.getByText("pokeemerald").closest("li")!;

    expect((within(notesRow).getByRole("button", { name: "Open" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(miscRow).getByRole("button", { name: "Open" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(crystalRow).getByRole("button", { name: "Open" }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(emeraldRow).getByRole("button", { name: "Open" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(within(crystalRow).getByRole("button", { name: "Open" }));
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith({ family: "gbc", root: "/tmp/pokecrystal" }));
  });

  it("a stale browse response arriving after a newer one does not overwrite it", async () => {
    let resolveMisc: (v: unknown) => void = () => {};
    let resolveRoot: (v: unknown) => void = () => {};
    const { mock } = makeHubFetch({
      hub: HUB_STATE,
      browse: {
        "/api/hub/browse?dir=%2Ftmp": BROWSE_TMP,
        "/api/hub/browse?dir=%2Ftmp%2Fmisc": () => new Promise((r) => { resolveMisc = r; }),
        "/api/hub/browse?dir=%2F": () => new Promise((r) => { resolveRoot = r; }),
      },
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("misc")).toBeTruthy());

    // Two navigations fired back-to-back, both still in flight: "misc"
    // (started first, req N) then "Up" -> root (started second, req N+1;
    // `browseResult` is still `BROWSE_TMP` at the moment Up is clicked, so
    // its target is BROWSE_TMP's own `parent`, "/"). Resolving the SECOND-
    // started one (root) FIRST and the FIRST-started one (misc) SECOND is
    // exactly the out-of-order arrival the request-counter ref guards
    // against -- misc's late arrival must not clobber root's result.
    fireEvent.click(screen.getByRole("button", { name: "misc" }));
    fireEvent.click(screen.getByRole("button", { name: "Up" }));

    // Scoped to the entries list specifically, NOT `screen` at large --
    // after navigating into "/tmp/misc", the breadcrumb legitimately shows
    // "tmp" too (as a path segment), so an unscoped `getByText("tmp")` would
    // stay truthy in BOTH the correct and the buggy (guard-removed) outcome
    // and never actually catch a regression here.
    const entries = () => document.querySelector(".hub-picker__entries") as HTMLElement;

    await act(async () => {
      resolveRoot(BROWSE_ROOT);
    });
    await waitFor(() => expect(within(entries()).getByText("tmp")).toBeTruthy());

    await act(async () => {
      resolveMisc(BROWSE_MISC);
    });
    // The stale (misc) response must not have overwritten root's -- the
    // entries list still shows root's own single "tmp" entry, not misc's
    // empty listing.
    expect(within(entries()).getByText("tmp")).toBeTruthy();
    expect(within(entries()).queryByText("pokeemerald")).toBeNull();
  });

  it("typed path: a 422 shows the server's message in an alert and does not call onOpened", async () => {
    const onOpened = vi.fn();
    const { mock } = makeHubFetch({
      hub: HUB_STATE,
      browse: { "/api/hub/browse?dir=%2Ftmp": BROWSE_TMP },
      onOpen: () => ({ status: 422, body: { error: "not a pokeemerald-family directory" } }),
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={onOpened} />);

    await waitFor(() => expect(screen.getByText("misc")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Folder path"), { target: { value: "/tmp/junk" } });
    fireEvent.click((() => { const btns = screen.getAllByRole("button", { name: "Open" }); return btns[btns.length - 1]!; })());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/not a pokeemerald-family directory/);
    expect(onOpened).not.toHaveBeenCalled();
  });

  it("typed path: a 404 shows the server's message in an alert and does not call onOpened", async () => {
    const onOpened = vi.fn();
    const { mock } = makeHubFetch({
      hub: HUB_STATE,
      browse: { "/api/hub/browse?dir=%2Ftmp": BROWSE_TMP },
      onOpen: () => ({ status: 404, body: { error: "no such directory /tmp/junk" } }),
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={onOpened} />);

    await waitFor(() => expect(screen.getByText("misc")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Folder path"), { target: { value: "/tmp/junk" } });
    fireEvent.click((() => { const btns = screen.getAllByRole("button", { name: "Open" }); return btns[btns.length - 1]!; })());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/no such directory \/tmp\/junk/);
    expect(onOpened).not.toHaveBeenCalled();
  });

  it("409: shows SwitchConfirmDialog with the dirty map names; Cancel returns to the picker with exactly one POST made", async () => {
    const onOpened = vi.fn();
    const { mock, postBodies } = makeHubFetch({
      hub: HUB_STATE,
      browse: { "/api/hub/browse?dir=%2Ftmp": BROWSE_TMP },
      onOpen: () => ({ status: 409, body: { error: "unsaved edits in 2 map(s)", dirtyMaps: ["Route1", "Route2"] } }),
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={onOpened} />);

    await waitFor(() => expect(screen.getByText("/tmp/pokeemerald")).toBeTruthy());
    const row = screen.getByText("/tmp/pokeemerald").closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Open" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Unsaved edits" });
    expect(within(dialog).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Route1", "Route2"]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByText("Open a project")).toBeTruthy();
    expect(postBodies).toEqual([{ path: "/tmp/pokeemerald" }]);
    expect(onOpened).not.toHaveBeenCalled();
  });

  it("409: Discard and switch posts { path, force: true } and calls onOpened", async () => {
    const onOpened = vi.fn();
    const { mock, postBodies } = makeHubFetch({
      hub: HUB_STATE,
      browse: { "/api/hub/browse?dir=%2Ftmp": BROWSE_TMP },
      onOpen: (body) =>
        body.force
          ? { status: 200, body: { family: "gba", root: body.path } }
          : { status: 409, body: { error: "unsaved edits in 2 map(s)", dirtyMaps: ["Route1", "Route2"] } },
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={onOpened} />);

    await waitFor(() => expect(screen.getByText("/tmp/pokeemerald")).toBeTruthy());
    const row = screen.getByText("/tmp/pokeemerald").closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Open" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Unsaved edits" });
    fireEvent.click(within(dialog).getByRole("button", { name: /discard and switch/i }));

    await waitFor(() => expect(onOpened).toHaveBeenCalledWith({ family: "gba", root: "/tmp/pokeemerald" }));
    expect(postBodies).toEqual([{ path: "/tmp/pokeemerald" }, { path: "/tmp/pokeemerald", force: true }]);
  });
});
