import { useEffect, useRef, useState } from "react";
import type { ProjectInfo, EngineFamily } from "@pokemap/core/src/family.js";
import type { BrowseResult } from "@pokemap/core/src/hub/wire.js";
import { isHubState, isBrowseResult, openProject } from "./guards.js";
import { SwitchConfirmDialog } from "./SwitchConfirmDialog.js";
import { useGuardedFetch } from "../hooks/useGuardedFetch.js";
import { fetchGuarded } from "../hooks/useGuardedFetch.js";
import "../styles.css";

export interface ProjectPickerProps {
  onOpened: (info: ProjectInfo) => void;
  /** Present only when this picker is used as a modal's content
   *  (`ProjectSwitcher`) -- absent for `Root`'s own no-project-open case,
   *  which has nothing to close back to. */
  onClose?: () => void;
}

/** Chops the last `/`-separated segment off a path, for seeding the
 *  browser's initial `dir` from `current.root`/`recent[0].path` -- a
 *  client-side guess only (the server's own `parentOf` in `hub.ts` is the
 *  canonical one; this never has to match it exactly, `dir` just needs to
 *  start somewhere sensible). Backslashes are normalised first so a win32
 *  path either style produces the same guess. */
function guessParent(path: string): string | null {
  const norm = path.replace(/\\/g, "/");
  const trimmed = norm.length > 1 && norm.endsWith("/") ? norm.slice(0, -1) : norm;
  const idx = trimmed.lastIndexOf("/");
  if (idx < 0) return null;
  if (idx === 0) return "/";
  return trimmed.slice(0, idx);
}

interface Crumb {
  label: string;
  path: string;
}

/** Splits a browse-confirmed `dir` into clickable breadcrumb segments. On
 *  win32 the first segment is the drive itself (`C:/`, not `C:`) -- every
 *  later segment accumulates onto it with a single `/` joiner. */
function breadcrumbOf(dir: string): Crumb[] {
  const isWin32Drive = /^[A-Za-z]:\//.test(dir);
  const parts = dir.split("/").filter((p) => p.length > 0);
  const crumbs: Crumb[] = [];
  let acc = "";
  parts.forEach((part, i) => {
    if (i === 0 && isWin32Drive) {
      acc = `${part}/`;
    } else {
      acc = acc.endsWith("/") ? `${acc}${part}` : `${acc}/${part}`;
    }
    crumbs.push({ label: part, path: acc });
  });
  return crumbs;
}

function FamilyBadge({ family }: { family: EngineFamily | "unsupported" }) {
  const label = family === "gba" ? "GBA" : family === "gbc" ? "GBC" : "Unsupported";
  return <span className={`hub-picker__badge hub-picker__badge--${family}`}>{label}</span>;
}

/**
 * Plan 6c A2: the project-open UI -- recent projects, a directory browser,
 * and a typed-path fallback, all funnelled through `openProject` (the one
 * POST this app makes outside `useGuardedFetch`/`fetchGuarded`'s own GET
 * path). Used two ways: directly under `Root` when no project is open yet
 * (no modal shell at all -- there is nothing to close back to), and inside
 * `ProjectSwitcher`'s own modal shell once one is (`onClose` present).
 *
 * A 409 (unsaved edits) swaps this component's own body for
 * `SwitchConfirmDialog`. That component owns no backdrop/panel, so the
 * invariant is: at most one `.warp-modal__backdrop` / `aria-modal` in the
 * document -- `ProjectSwitcher`'s, or none when standalone.
 */
export function ProjectPicker({ onOpened, onClose }: ProjectPickerProps) {
  const { data: hub, error: hubError } = useGuardedFetch("/api/hub", isHubState);

  // `undefined` = "not yet decided" (waiting on `hub` to seed it from
  // current/recent) -- distinct from `null` (a real decision: browse the
  // drive list / POSIX root). Set exactly once, the first time `hub`
  // resolves; every later `dir` change comes from the browser's own
  // navigation (folder click / Up / breadcrumb), never recomputed from `hub`
  // again even if it refetches.
  const [dir, setDir] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (hub && dir === undefined) {
      setDir(hub.current ? guessParent(hub.current.root) : hub.recent[0] ? guessParent(hub.recent[0].path) : null);
    }
  }, [hub, dir]);

  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);
  // A version counter, not state (spec: "use a request counter ref, not
  // state") -- a stale browse response (a later browse already started)
  // must never overwrite a newer one's result, and comparing against a ref
  // read at resolution time needs no extra render to take effect the way a
  // state-based id would.
  const browseReqRef = useRef(0);

  useEffect(() => {
    if (dir === undefined) return;
    const reqId = ++browseReqRef.current;
    const url = dir === null ? "/api/hub/browse" : `/api/hub/browse?dir=${encodeURIComponent(dir)}`;
    setBrowseError(null);
    fetchGuarded(url, isBrowseResult)
      .then((result) => {
        if (browseReqRef.current !== reqId) return;
        setBrowseResult(result);
      })
      .catch((e: unknown) => {
        if (browseReqRef.current !== reqId) return;
        setBrowseError(e instanceof Error ? e.message : String(e));
      });
  }, [dir]);

  const [typedPath, setTypedPath] = useState("");
  const [openError, setOpenError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ path: string; dirtyMaps: string[] } | null>(null);

  // In-flight guard shared by every open path (recent/entry Open, typed-path
  // submit, the confirm's forced open). The ref is what actually stops a second
  // attempt (a rapid double-click, or a form submit that bypasses a disabled
  // button, reads it synchronously before any re-render); `opening` state only
  // drives the disabled buttons.
  const openingRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const guarded = async <T,>(fn: () => Promise<T>, whenBusy: T): Promise<T> => {
    if (openingRef.current) return whenBusy;
    openingRef.current = true;
    setOpening(true);
    try {
      return await fn();
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  };

  const attemptOpen = (path: string) =>
    guarded(async () => {
      setOpenError(null);
      const result = await openProject(path);
      if (result.kind === "opened") {
        onOpened(result.info);
      } else if (result.kind === "conflict") {
        setConflict({ path, dirtyMaps: result.dirtyMaps });
      } else {
        setOpenError(result.error);
      }
    }, undefined);

  // Passed to SwitchConfirmDialog as `onConfirm` -- resolves to an error
  // message on failure (the dialog shows it inline and stays open), or
  // `null` on success, after which THIS component calls `onOpened` (the
  // dialog itself never sees that callback).
  const confirmForceOpen = (): Promise<string | null> =>
    guarded(async () => {
      if (!conflict) return null;
      const result = await openProject(conflict.path, true);
      if (result.kind === "opened") {
        onOpened(result.info);
        return null;
      }
      return result.error;
    }, null);

  // The confirm REPLACES this component's body (never rendered beside it),
  // and owns no backdrop of its own -- inside `ProjectSwitcher` the switcher's
  // backdrop/panel is the only shell in the document; standalone (`Root`) there
  // is none, and no 409 can occur there anyway (nothing open means nothing
  // dirty). Still wrapped in `.hub-picker` so padding/scroll match the body.
  if (conflict) {
    return (
      <div className="hub-picker">
        <SwitchConfirmDialog dirtyMaps={conflict.dirtyMaps} onCancel={() => setConflict(null)} onConfirm={confirmForceOpen} />
      </div>
    );
  }

  const crumbs = browseResult?.dir ? breadcrumbOf(browseResult.dir) : [];

  return (
    <div className="hub-picker">
      <div className="hub-picker__header">
        <h2 className="hub-picker__title">Open a project</h2>
        {onClose && (
          <button type="button" className="map-canvas__btn hub-picker__close" onClick={onClose} autoFocus>
            Close
          </button>
        )}
      </div>

      {hubError && (
        <p className="hub-picker__error" role="alert">
          Could not load projects: {hubError}
        </p>
      )}

      {hub && hub.recent.length > 0 && (
        <section className="hub-picker__recent">
          <h3 className="hub-picker__section-title">Recent</h3>
          <ul className="hub-picker__list">
            {hub.recent.map((r) => (
              <li key={r.path} className="hub-picker__row">
                <FamilyBadge family={r.family} />
                <span className="hub-picker__path">{r.path}</span>
                <button type="button" className="map-canvas__btn" disabled={opening} onClick={() => void attemptOpen(r.path)}>
                  Open
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="hub-picker__browse">
        <h3 className="hub-picker__section-title">Browse</h3>
        {browseError && (
          <p className="hub-picker__error" role="alert">
            {browseError}
          </p>
        )}
        <div className="hub-picker__breadcrumb">
          {crumbs.map((c) => (
            <button key={c.path} type="button" className="map-canvas__btn" onClick={() => setDir(c.path)}>
              {c.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="map-canvas__btn hub-picker__up"
          onClick={() => setDir(browseResult?.parent ?? null)}
          disabled={dir === null}
        >
          Up
        </button>
        <ul className="hub-picker__list hub-picker__entries">
          {browseResult?.entries.map((e) => (
            <li key={e.path} className="hub-picker__row">
              <button type="button" className="map-canvas__btn hub-picker__entry-name" onClick={() => setDir(e.path)}>
                {e.name}
              </button>
              {e.family && <FamilyBadge family={e.family} />}
              <button
                type="button"
                className="map-canvas__btn"
                disabled={opening || (e.family !== "gba" && e.family !== "gbc")}
                onClick={() => void attemptOpen(e.path)}
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      </section>

      <form
        className="hub-picker__form"
        onSubmit={(e) => {
          e.preventDefault();
          void attemptOpen(typedPath);
        }}
      >
        <label className="hub-picker__form-label">
          Folder path
          <input
            type="text"
            className="hub-picker__form-input"
            value={typedPath}
            onChange={(e) => setTypedPath(e.target.value)}
          />
        </label>
        <button type="submit" className="map-canvas__btn" disabled={opening}>
          Open
        </button>
      </form>

      {openError && (
        <p className="hub-picker__error" role="alert">
          {openError}
        </p>
      )}
    </div>
  );
}
