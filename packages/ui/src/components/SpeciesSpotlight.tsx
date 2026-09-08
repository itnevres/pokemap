import { useEffect, useMemo, useRef, useState } from "react";
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
  // True once the user has typed a real (non-whitespace) query at least
  // once -- see onHits' own "never called at all on mount" doc above.
  const startedRef = useRef(false);
  // Set by pick() right before it changes `query` -- lets the debounced
  // effect below recognise "this exact lookup already ran eagerly" and
  // skip redoing the identical network request 250ms later.
  const skipQueryRef = useRef<string | null>(null);

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

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setHits(null);
      setLoading(false);
      setFetchError(null);
      // Only notify the caller if there was ever a search to clear --
      // otherwise the very first render (query still "") would fire
      // onHits(null) before the user has done anything at all.
      if (startedRef.current) onHits(null);
      return;
    }

    if (skipQueryRef.current === trimmed) {
      // pick() (a dropdown click, or ArrowDown/Enter) just ran this exact
      // lookup immediately -- without this guard, this effect would still
      // fire DEBOUNCE_MS later and redo the identical request for nothing.
      skipQueryRef.current = null;
      return;
    }

    startedRef.current = true;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);

    const timer = setTimeout(() => {
      // Review fix: a pick() for this exact query can land AFTER this timer
      // was scheduled but BEFORE it fires -- if the box already held this
      // same bare/uppercase string, pick()'s own setQuery() is a same-value
      // no-op, so this effect never re-runs and its cleanup below (which
      // would normally cancel this timer) never gets the chance to. Without
      // this second check, that leaves this timer free to fire anyway and
      // redo pick()'s own eager fetch a second time. skipQueryRef.current
      // is still live at fire time in exactly that case (nothing has
      // cleared it since pick() set it -- the input's onChange only clears
      // it on the NEXT keystroke, and there hasn't been one), so re-testing
      // the same guard here catches it.
      if (skipQueryRef.current === trimmed) {
        skipQueryRef.current = null;
        return;
      }
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
      fetch(`/api/where/${encodeURIComponent(trimmed)}`)
        .then((r) => {
          if (!r.ok) throw new Error(`GET /api/where/${trimmed} -> ${r.status}`);
          return r.json() as Promise<SpeciesHit[]>;
        })
        .then((data) => {
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
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, onHits]);

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
  // choice -- skip the debounce rather than making the user wait 250ms
  // after they've already finished deciding. `species` is a raw
  // /api/species entry (e.g. "SPECIES_MARILL"); the box itself always
  // shows the bare form so it reads the same as anything the user typed
  // by hand and matches this component's own displaySpecies() convention.
  function pick(species: string) {
    const bare = species.replace(/^SPECIES_/i, "");
    skipQueryRef.current = bare;
    setQuery(bare);
    setDropdownOpen(false);
    startedRef.current = true;
    setLoading(true);
    setFetchError(null);
    fetch(`/api/where/${encodeURIComponent(bare)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/where/${bare} -> ${r.status}`);
        return r.json() as Promise<SpeciesHit[]>;
      })
      .then((data) => {
        setHits(data);
        setLoading(false);
        onHits(data);
      })
      .catch((e: unknown) => {
        setLoading(false);
        setFetchError(e instanceof Error ? e.message : String(e));
      });
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

  return (
    <div className="species-spotlight">
      <input
        type="search"
        className="species-spotlight__input"
        placeholder="Spotlight a species…"
        aria-label="Species spotlight"
        role="searchbox"
        value={query}
        onChange={(e) => {
          // The very next keystroke after a pick() must invalidate its
          // skip-guard -- otherwise a stale skipQueryRef.current can
          // survive into a later, unrelated search and get silently
          // swallowed by the debounced-search effect's `skipQueryRef.current
          // === trimmed` check below (see that effect's own comment).
          skipQueryRef.current = null;
          setQuery(e.target.value);
          setDropdownOpen(e.target.value.trim().length > 0);
        }}
        // A small delay, not an instant close: onMouseDown below already
        // preventDefault()s to stop an option click from blurring the
        // input at all, but this is a fallback for e.g. a mousedown that
        // lands on the dropdown's own padding rather than an option.
        onBlur={() => setTimeout(() => setDropdownOpen(false), 100)}
        onKeyDown={onKeyDown}
      />
      {dropdownOpen && matches.length > 0 && (
        <ul className="species-spotlight__dropdown" role="listbox">
          {matches.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                className={`species-spotlight__option${i === activeIndex ? " species-spotlight__option--active" : ""}`}
                // preventDefault on mousedown, not the click itself: this
                // stops the browser from shifting focus off the input (and
                // so from ever firing onBlur) when the option is pressed,
                // so the click handler below always gets to run against a
                // dropdown that is still mounted.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
              >
                {displaySpecies(s)}
              </button>
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
