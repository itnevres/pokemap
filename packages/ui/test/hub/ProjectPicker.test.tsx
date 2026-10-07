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
type OpenReply = { status: number; body: unknown };

function makeHubFetch(opts: {
  hub?: unknown;
  browse?: Record<string, unknown | (() => Promise<unknown>)>;
  /** Set to make `GET /api/hub` fail with this status. */
  hubStatus?: number;
  onOpen?: (body: { path: string; force?: boolean }) => OpenReply | Promise<OpenReply>;
}) {
  const calls: string[] = [];
  const postBodies: Array<{ path: string; force?: boolean }> = [];
  const mock = vi.fn((url: string, init?: RequestInit) => {
    calls.push(url);
    if (url === "/api/hub") {
      if (opts.hubStatus) return Promise.resolve({ ok: false, status: opts.hubStatus, json: () => Promise.resolve({}) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.hub) });
    }
    if (url.startsWith("/api/hub/browse")) {
      const entry = opts.browse?.[url];
      if (entry === undefined) return Promise.reject(new Error(`unexpected browse url in test: ${url}`));
      const bodyPromise = typeof entry === "function" ? (entry as () => Promise<unknown>)() : Promise.resolve(entry);
      // `{ __status: N }` = a failing browse (e.g. a 403), body irrelevant.
      return bodyPromise.then((body) => {
        const failed = (body as { __status?: number } | null)?.__status;
        return failed
          ? { ok: false, status: failed, json: () => Promise.resolve({ error: "refused" }) }
          : { ok: true, status: 200, json: () => Promise.resolve(body) };
      });
    }
    if (url === "/api/hub/open" && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { path: string; force?: boolean };
      postBodies.push(body);
      return Promise.resolve(opts.onOpen ? opts.onOpen(body) : { status: 500, body: { error: "no onOpen handler configured" } }).then(
        ({ status, body: respBody }) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(respBody) }),
      );
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

it("in-flight guard: two rapid typed-path submits post once and call onOpened once", async () => {
    let finish: (r: OpenReply) => void = () => {};
    const onOpened = vi.fn();
    const { mock, postBodies } = makeHubFetch({
      hub: HUB_STATE,
      browse: { "/api/hub/browse?dir=%2Ftmp": BROWSE_TMP },
      onOpen: () => new Promise<OpenReply>((r) => { finish = r; }),
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={onOpened} />);
    await waitFor(() => expect(screen.getByText("misc")).toBeTruthy());

    const input = screen.getByLabelText("Folder path");
    fireEvent.change(input, { target: { value: "/tmp/pokeemerald" } });
    // fireEvent.submit bypasses the (disabled) submit button, so this is the
    // ref guard on its own, not the disabled attribute.
    fireEvent.submit(input.closest("form")!);
    fireEvent.submit(input.closest("form")!);
    await act(async () => {
      finish({ status: 200, body: { family: "gba", root: "/tmp/pokeemerald" } });
    });

    await waitFor(() => expect(onOpened).toHaveBeenCalledTimes(1));
    expect(postBodies).toEqual([{ path: "/tmp/pokeemerald" }]);
  });

  it("in-flight guard: every Open button and the submit are disabled while an open is pending, re-enabled after a failure", async () => {
    let finish: (r: OpenReply) => void = () => {};
    const { mock } = makeHubFetch({
      hub: HUB_STATE,
      browse: { "/api/hub/browse?dir=%2Ftmp": BROWSE_TMP },
      onOpen: () => new Promise<OpenReply>((r) => { finish = r; }),
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("notes")).toBeTruthy());

    const row = screen.getByText("/tmp/pokeemerald").closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Open" }));

    const opens = () => screen.getAllByRole("button", { name: "Open" }) as HTMLButtonElement[];
    expect(opens().every((b) => b.disabled)).toBe(true);

    await act(async () => {
      finish({ status: 422, body: { error: "not a project" } });
    });
    await screen.findByRole("alert");
    // The enabled ones are back (unsupported/null entries stay disabled by family).
    expect(opens().filter((b) => !b.disabled).length).toBeGreaterThan(0);
  });

  // ---- fix round: SR-F4 / SR-F5 / SR-F6 / QR-F2 + survivor tests ----

  const hubWith = (root: string | null, recentPaths: string[] = []) => ({
    current: root ? { family: "gba", root } : null,
    recent: recentPaths.map((path) => ({ path, family: "gba", openedAt: "2026-09-29T00:00:00.000Z" })),
  });
  const entriesList = () => document.querySelector(".hub-picker__entries") as HTMLElement;

  it("a failed browse clears the stale listing and a re-click of the same folder (its breadcrumb) refetches", async () => {
    let tries = 0;
    const { mock, calls } = makeHubFetch({
      hub: HUB_STATE,
      browse: {
        "/api/hub/browse?dir=%2Ftmp": BROWSE_TMP,
        "/api/hub/browse?dir=%2Ftmp%2Fmisc": () => Promise.resolve(tries++ === 0 ? { __status: 403 } : BROWSE_MISC),
      },
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={vi.fn()} />);
    await waitFor(() => expect(within(entriesList()).getByText("pokeemerald")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "misc" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/403/);
    expect(within(entriesList()).queryByText("pokeemerald")).toBeNull();

    // The folder's own breadcrumb is what is left to re-click (same `dir`).
    fireEvent.click(screen.getByRole("button", { name: "misc" }));
    await waitFor(() => expect(calls.filter((u) => u === "/api/hub/browse?dir=%2Ftmp%2Fmisc").length).toBe(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("a project at a drive top level seeds the drive ROOT (C:/), not the drive-relative C:", async () => {
    const { mock, calls } = makeHubFetch({
      hub: hubWith("C:/pokeemerald"),
      browse: { "/api/hub/browse?dir=C%3A%2F": { dir: "C:/", parent: null, entries: [] } },
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={vi.fn()} />);
    await waitFor(() => expect(calls).toContain("/api/hub/browse?dir=C%3A%2F"));
    expect(calls).not.toContain("/api/hub/browse?dir=C%3A");
  });

  it("when /api/hub fails the alert shows AND a null-dir browse still starts so the folder browser works", async () => {
    const { mock, calls } = makeHubFetch({
      hubStatus: 500,
      browse: { "/api/hub/browse": { dir: null, parent: null, entries: [{ name: "Drive", path: "C:/", family: null }] } },
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Could not load projects:", { exact: false })).toBeTruthy());
    await waitFor(() => expect(within(entriesList()).getByText("Drive")).toBeTruthy());
    expect(calls).toContain("/api/hub/browse");
  });

  it("a browse resolving after unmount does not throw or log", async () => {
    let resolveTmp: (v: unknown) => void = () => {};
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { mock } = makeHubFetch({
      hub: HUB_STATE,
      browse: { "/api/hub/browse?dir=%2Ftmp": () => new Promise((r) => { resolveTmp = r; }) },
    });
    vi.stubGlobal("fetch", mock);
    const view = render(<ProjectPicker onOpened={vi.fn()} />);
    await waitFor(() => expect(mock).toHaveBeenCalledWith("/api/hub/browse?dir=%2Ftmp"));
    view.unmount();
    await act(async () => {
      resolveTmp(BROWSE_TMP);
    });
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("M10: the initial browse dir comes from current.root, not recent[0], when their parents differ", async () => {
    const { mock, calls } = makeHubFetch({
      hub: hubWith("/a/x/proj", ["/b/y/other"]),
      browse: { "/api/hub/browse?dir=%2Fa%2Fx": { dir: "/a/x", parent: "/a", entries: [] } },
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={vi.fn()} />);
    await waitFor(() => expect(calls).toContain("/api/hub/browse?dir=%2Fa%2Fx"));
    expect(calls.filter((u) => u.startsWith("/api/hub/browse"))).toEqual(["/api/hub/browse?dir=%2Fa%2Fx"]);
  });

  it("with no current and no recent, the browse starts at the root list and Up is disabled there (M16)", async () => {
    const { mock } = makeHubFetch({
      hub: hubWith(null),
      browse: { "/api/hub/browse": { dir: null, parent: null, entries: [{ name: "D", path: "C:/", family: null }] } },
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={vi.fn()} />);
    await waitFor(() => expect(within(entriesList()).getByText("D")).toBeTruthy());
    expect((screen.getByRole("button", { name: "Up" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Up from a dir whose parent is null (a drive root) fetches the root list, exact URL (M17)", async () => {
    const { mock, calls } = makeHubFetch({
      hub: hubWith("C:/x"),
      browse: {
        "/api/hub/browse?dir=C%3A%2F": { dir: "C:/", parent: null, entries: [] },
        "/api/hub/browse": { dir: null, parent: null, entries: [] },
      },
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={vi.fn()} />);
    await waitFor(() => expect(calls).toContain("/api/hub/browse?dir=C%3A%2F"));
    const up = screen.getByRole("button", { name: "Up" }) as HTMLButtonElement;
    expect(up.disabled).toBe(false);
    fireEvent.click(up);
    await waitFor(() => expect(calls).toContain("/api/hub/browse"));
  });

  it("a win32-shaped dir's breadcrumb is C: / a / b and its crumbs browse to C:/, C:/a, C:/a/b exactly (M18)", async () => {
    const { mock, calls } = makeHubFetch({
      hub: hubWith("C:/a/b/proj"),
      browse: {
        "/api/hub/browse?dir=C%3A%2Fa%2Fb": { dir: "C:/a/b", parent: "C:/a", entries: [] },
        "/api/hub/browse?dir=C%3A%2Fa": { dir: "C:/a", parent: "C:/", entries: [] },
        "/api/hub/browse?dir=C%3A%2F": { dir: "C:/", parent: null, entries: [] },
      },
    });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={vi.fn()} />);
    const crumbs = () => Array.from(document.querySelectorAll(".hub-picker__breadcrumb button")).map((b) => b.textContent);
    await waitFor(() => expect(crumbs()).toEqual(["C:", "a", "b"]));

    fireEvent.click(screen.getByRole("button", { name: "a" }));
    await waitFor(() => expect(calls).toContain("/api/hub/browse?dir=C%3A%2Fa"));
    await waitFor(() => expect(crumbs()).toEqual(["C:", "a"]));

    fireEvent.click(screen.getByRole("button", { name: "C:" }));
    await waitFor(() => expect(calls).toContain("/api/hub/browse?dir=C%3A%2F"));

    // The seeded dir itself (C:/a/b) is the first request, exact.
    expect(calls.filter((u) => u.startsWith("/api/hub/browse"))[0]).toBe("/api/hub/browse?dir=C%3A%2Fa%2Fb");
  });

  it("each browse entry shows its family badge text; a null-family entry shows none (M27)", async () => {
    const { mock } = makeHubFetch({ hub: HUB_STATE, browse: { "/api/hub/browse?dir=%2Ftmp": BROWSE_TMP } });
    vi.stubGlobal("fetch", mock);
    render(<ProjectPicker onOpened={vi.fn()} />);
    await waitFor(() => expect(within(entriesList()).getByText("notes")).toBeTruthy());
    const badge = (name: string) =>
      within(entriesList()).getByText(name).closest("li")!.querySelector(".hub-picker__badge")?.textContent ?? null;
    expect(badge("pokeemerald")).toBe("GBA");
    expect(badge("pokecrystal")).toBe("GBC");
    expect(badge("notes")).toBe("Unsupported");
    expect(badge("misc")).toBeNull();
  });
});
