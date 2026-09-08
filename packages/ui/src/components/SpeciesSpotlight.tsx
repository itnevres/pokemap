import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SpeciesHit } from "@pokemap/core/src/analyse/coverage.js";

export interface SpeciesSpotlightProps {
  /**
   * Called whenever a real, debounced lookup resolves -- never on mount
   * with the box still empty, so a caller (WorldCanvas) doesn't have to
   * special-case its own initial render just because this component
   * exists.
   *
   *  - `null` means "no active search": the untouched box, or one the
   *    user has cleared after searching. The world should draw undimmed.
   *  - `[]` means "searched, found nowhere" -- a real, meaningful result
   *    (the empty-state message below renders the same fact), distinct
   *    from `null` so a caller can still dim the whole world to say so,
   *    rather than leaving it looking like no search happened at all.
   *  - otherwise the hit array itself, straight from `/api/where/:species`
   *    (whereSpecies' own contract: sorted by percent, descending).
   */
  onHits: (hits: SpeciesHit[] | null) => void;
}

/** Long enough that ordinary typing ("PIKA...CHU") collapses to one
 *  request, short enough that the result still feels immediate -- the same
 *  order of magnitude as this app's own hover-tooltip/focus-ring motion
 *  budget in DESIGN.md, just applied to a network round trip instead of a
 *  CSS transition. */
const DEBOUNCE_MS = 250;

/** A submitted spotlight lookup -- built fresh (a new object) on every
 *  submission, whether from typing or from picking a dropdown option, so
 *  that React always sees a changed effect dependency and re-runs the
 *  fetch below. This is what lets typing and pick() share a single fetch
 *  site with no extra coordination: even an exact-match pick (the box
 *  already holds the bare form pick() is about to set) still produces a
 *  distinct request object, so there is no same-value bail-out case to
 *  guard against -- unlike the old keyed-on-`query` design this replaces,
 *  which needed a whole skipQueryRef mechanism (and two review rounds to
 *  get it right) purely because a same-value setQuery() is a React no-op
 *  that never re-runs a `[query]`-keyed effect. */
interface PendingRequest {
  species: string;
  /** true for a dropdown pick -- fire on the next tick, no debounce wait,
   *  since a pick is a complete, deliberate choice already. false for
   *  typed input -- wait out DEBOUNCE_MS in case more keystrokes are
   *  coming. */
  immediate: boolean;
}

/** "PIKACHU" / "pikachu" / "SPECIES_PIKACHU" all read back as "Pikachu" for
 *  the empty-state sentence and the dropdown's own option labels. */
function displaySpecies(query: string): string {
  const bare = query.trim().replace(/^SPECIES_/i, "");
  return bare
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Species spotlight (spec §9), now with a type-ahead dropdown: type a
 * species, the stitched world dims except the maps containing it, each lit
 * with its rate and level band. Purely a control -- like LensPanel, it
 * draws nothing on the canvas itself; WorldCanvas owns turning `onHits`'
 * payload into the actual dim/highlight overlay, the same split
 * EncounterGutter established.
 *
 * The dropdown's data source (`GET /api/species`) is fetched once on mount
 * and filtered CLIENT-SIDE as you type (prefix match, case insensitive) --
 * the full roster is a few hundred to ~1,000 short strings, cheap enough
 * that no per-keystroke network round trip is worth it, unlike the real
 * search below which genuinely needs the server's own encounter data. A
 * failed /api/species fetch just means no dropdown ever appears; the plain
 * typed-and-submitted search is entirely independent of this list and is
 * unaffected.
 *
 * Debounced (see DEBOUNCE_MS) and fully asynchronous: typing never blocks
 * the canvas, which stays pannable and interactive through every fetch --
 * there is simply nothing here that could block it, since a React state
 * update and a `fetch()` are both non-blocking by construction.
 */
export function SpeciesSpotlight({ onHits }: SpeciesSpotlightProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SpeciesHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [allSpecies, setAllSpecies] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [request, setRequest] = useState<PendingRequest | null>(null);
  // True once the user has typed a real (non-whitespace) query at least
  // once -- see onHits' own "never called at all on mount" doc above.
  const startedRef = useRef(false);
  // Stable ids for the combobox/listbox ARIA wiring below -- unique per
  // mounted instance, in case this component is ever rendered more than
  // once (useId, not a literal string, for exactly that reason).
  const listboxId = useId();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/species")
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/species -> ${r.status}`);
        return r.json() as Promise<string[]>;
      })
      .then((list) => {
        if (!cancelled) setAllSpecies(list);
      })
      .catch(() => {
        // Best-effort: no dropdown, plain search still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const withPrefix = q.startsWith("SPECIES_") ? q : `SPECIES_${q}`;
    return allSpecies.filter((s) => s.startsWith(withPrefix)).slice(0, 50);
  }, [query, allSpecies]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [matches]);

  // The sole fetch site for `/api/where/:species` -- both typing (via the
  // input's onChange below) and picking a dropdown option (via pick())
  // just call setRequest() with a fresh object and let this effect do the
  // rest. Keyed on `request` itself (an object, not the bare species
  // string) specifically so a same-species resubmission is never a
  // same-value no-op that React bails out of re-running -- see
  // PendingRequest's own doc comment for why that matters.
  //
  // Review fix: this used to be two independent fetch sites (this effect,
  // plus a second, separate fetch inside pick() itself), coordinated by a
  // skipQueryRef flag so pick()'s eager fetch wouldn't get redone here
  // 250ms later. That flag needed two rounds of review fixes to get right
  // (a same-value setQuery() bypassing the effect's own cleanup, and a
  // stale flag surviving to wrongly swallow a later, unrelated search) --
  // and, separately, pick()'s own fetch had no `cancelled` guard on its
  // `.then`/`.catch` the way this effect's always did, so an abandoned
  // pick (box cleared before the response lands) could still revive a
  // search the user had already moved past. Collapsing to one fetch site
  // removes both problems at once: there is no second place left to fall
  // out of sync with this one, and every submission -- typed or picked --
  // now gets the same cancellation guard for free.
  useEffect(() => {
    if (!request) {
      setHits(null);
      setLoading(false);
      setFetchError(null);
      // Only notify the caller if there was ever a search to clear --
      // otherwise the very first render (request still null) would fire
      // onHits(null) before the user has done anything at all.
      if (startedRef.current) onHits(null);
      return;
    }

    startedRef.current = true;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);

    const timer = setTimeout(() => {
      // Review fix: this used to skip the `!r.ok` gate every other fetch
      // in this package uses (useCoverage, useMapGroups, useMapLayout) on
      // the theory that /api/where/:species always answers 200. That is
      // wrong -- the server's outer catch answers 500 with an error body
      // on any thrown exception, and an unmatched route answers 404 with
      // one too (packages/server/src/index.ts's own outer catch and final
      // `not found` fallback) -- and a 500/404 body still parses as valid
      // JSON (`{ error: "..." }`), so without this gate it would reach
      // `onHits` typed as `SpeciesHit[]` while actually being a plain
      // object. WorldCanvas's own `for (const h of spotlightHits)` is not
      // Array.isArray-guarded (it trusts this component's own contract),
      // so that non-array value would throw "not iterable" mid-render and
      // unmount the whole world view -- a reachable crash, not a
      // hypothetical one, and the exact class of bug the `as
      // Promise<SpeciesHit[]>` cast just below was silently hiding from
      // TypeScript.
      fetch(`/api/where/${encodeURIComponent(request.species)}`)
        .then((r) => {
          if (!r.ok) throw new Error(`GET /api/where/${request.species} -> ${r.status}`);
          return r.json() as Promise<SpeciesHit[]>;
        })
        .then((data) => {
          // Review fix: without this guard, a response for a request the
          // user has since abandoned (cleared the box, or typed something
          // new) would still land and call onHits/setHits -- reviving a
          // search that, from the box's own visible contents, no longer
          // looks like it's happening. `cancelled` is set true by this
          // same effect's own cleanup below, which runs the instant
          // `request` changes to anything else (including null), so this
          // fires only for the request that is still current when the
          // response actually arrives.
          if (cancelled) return;
          setHits(data);
          setLoading(false);
          onHits(data);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setLoading(false);
          // A failed lookup is not "found nowhere" -- leave the world
          // exactly as it was rather than dimming everything over a
          // network error the user cannot fix by looking harder.
          setFetchError(e instanceof Error ? e.message : String(e));
        });
    }, request.immediate ? 0 : DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [request, onHits]);

  // Review fix: this used to render `hits.length` directly. `whereSpecies`
  // returns one hit per (map, method, rod, variant) combination it finds,
  // not one per map -- 125 of the corpus's 227 encounter-carrying maps
  // have more than one table (spec §9's own "day/night and further
  // variants" lesson), so a species reachable through several of a map's
  // tables, or through several methods on the same map, inflates
  // `hits.length` well past the number of maps that actually light up.
  // Measured against the real corpus: MAGIKARP showed "614 maps" here
  // while only 114 distinct maps were actually lit on the canvas (5.4x
  // over); TENTACOOL 415 vs 58; ZUBAT 78 vs 48. `mapCount` mirrors
  // spotlightByMap's own dedupe in WorldCanvas.tsx exactly (a `Set` of
  // `mapName`, skipping any hit missing one) so this label can never
  // disagree with what the canvas actually shows next to it.
  const mapCount = hits ? new Set(hits.map((h) => h.mapName).filter((n): n is string => !!n)).size : 0;

  // A dropdown pick (click, or ArrowDown+Enter) is a complete, deliberate
  // choice -- `immediate: true` skips the debounce rather than making the
  // user wait 250ms after they've already finished deciding. `species` is
  // a raw /api/species entry (e.g. "SPECIES_MARILL"); the box itself
  // always shows the bare form so it reads the same as anything the user
  // typed by hand and matches this component's own displaySpecies()
  // convention. No fetch happens here directly -- setRequest() below
  // hands off to the single effect above, which does the actual work.
  function pick(species: string) {
    const bare = species.replace(/^SPECIES_/i, "");
    setQuery(bare);
    setDropdownOpen(false);
    setRequest({ species: bare, immediate: true });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(matches[activeIndex >= 0 ? activeIndex : 0]!);
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
    }
  }

  // The listbox is only ever actually in the DOM under this same
  // condition -- reused below for aria-expanded/aria-controls so those
  // attributes never claim a dropdown is open (or point `aria-controls`
  // at an id) when nothing is actually rendered.
  const listboxVisible = dropdownOpen && matches.length > 0;
  // id of the currently keyboard-highlighted option, for
  // aria-activedescendant -- unset (not just empty-string) when nothing is
  // highlighted, so a screen reader doesn't announce a stale selection.
  const activeOptionId =
    listboxVisible && activeIndex >= 0 && matches[activeIndex] !== undefined
      ? `${listboxId}-option-${matches[activeIndex]}`
      : undefined;

  return (
    <div className="species-spotlight">
      <input
        type="search"
        className="species-spotlight__input"
        placeholder="Spotlight a species…"
        aria-label="Species spotlight"
        // No explicit role="searchbox" -- input[type="search"] already has
        // that as its implicit role, and the combobox pattern below (an
        // editable input that owns a popup listbox, per WAI-ARIA 1.2's
        // combobox-with-list-autocomplete pattern) needs role="combobox"
        // here instead, which an explicit role always wins over the
        // implicit one anyway.
        role="combobox"
        aria-expanded={listboxVisible}
        aria-controls={listboxVisible ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        value={query}
        onChange={(e) => {
          const value = e.target.value;
          const trimmed = value.trim();
          setQuery(value);
          setDropdownOpen(trimmed.length > 0);
          setRequest(trimmed ? { species: trimmed, immediate: false } : null);
        }}
        // A small delay, not an instant close: onMouseDown below already
        // preventDefault()s to stop an option click from blurring the
        // input at all, but this is a fallback for e.g. a mousedown that
        // lands on the dropdown's own padding rather than an option.
        onBlur={() => setTimeout(() => setDropdownOpen(false), 100)}
        onKeyDown={onKeyDown}
      />
      {listboxVisible && (
        <ul id={listboxId} className="species-spotlight__dropdown" role="listbox">
          {matches.map((s, i) => (
            // The option itself, not a <button> wrapped in a plain <li> --
            // an ARIA listbox's options must be the listbox's own direct
            // children (role="option" interposed behind a wrapper element
            // breaks that ownership), and a focusable control here would
            // sit in the tab order between the input and whatever comes
            // after it in the toolbar. Keyboard "focus" is instead purely
            // virtual, tracked by activeIndex/aria-activedescendant above
            // while real DOM focus never leaves the input -- the standard
            // combobox pattern, and why this <li> carries no tabIndex.
            <li
              key={s}
              id={`${listboxId}-option-${s}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`species-spotlight__option${i === activeIndex ? " species-spotlight__option--active" : ""}`}
              // preventDefault on mousedown, not the click itself: this
              // stops the browser from shifting focus off the input (and
              // so from ever firing onBlur) when the option is pressed,
              // so the click handler below always gets to run against a
              // dropdown that is still mounted. (A non-focusable <li>
              // can't itself steal focus on mousedown, but this still
              // guards a mousedown that lands on, e.g., selected text
              // inside the option.)
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
            >
              {displaySpecies(s)}
            </li>
          ))}
        </ul>
      )}
      {loading && (
        <span className="species-spotlight__status" role="status">
          Searching…
        </span>
      )}
      {!loading && fetchError && (
        <span className="species-spotlight__status species-spotlight__status--error" role="alert">
          {fetchError}
        </span>
      )}
      {!loading && !fetchError && hits && mapCount > 0 && (
        <span className="species-spotlight__status">
          {mapCount} map{mapCount === 1 ? "" : "s"}
        </span>
      )}
      {!loading && !fetchError && hits && mapCount === 0 && (
        <p className="species-spotlight__empty" role="status">
          {displaySpecies(query)} appears in no encounter table anywhere in the project.
        </p>
      )}
    </div>
  );
}
