import { useEffect, useRef, useState } from "react";
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
 *  the empty-state sentence -- display only. Every actual lookup goes
 *  through the raw typed text; the server does its own case-insensitive
 *  SPECIES_ prefixing (see /api/where/:species), so this never needs to
 *  duplicate that logic to be correct, only to be readable. */
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
 * Species spotlight (spec §9): type a species, the stitched world dims
 * except the maps containing it, each lit with its rate and level band.
 * Purely a control -- like LensPanel, it draws nothing on the canvas
 * itself; WorldCanvas owns turning `onHits`' payload into the actual
 * dim/highlight overlay, the same split EncounterGutter established.
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
  // True once the user has typed a real (non-whitespace) query at least
  // once -- see onHits' own "never called at all on mount" doc above.
  const startedRef = useRef(false);

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

    startedRef.current = true;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);

    const timer = setTimeout(() => {
      // No `r.ok` gate here, unlike this package's other fetch hooks
      // (useMapGroups, useMapLayout): /api/where/:species always answers
      // 200 -- an empty array IS the answer for "found nowhere" (see
      // onHits' own doc comment above), never a 404 -- so there is no
      // failure status this route can return for `.ok` to usefully gate.
      fetch(`/api/where/${encodeURIComponent(trimmed)}`)
        .then((r) => r.json() as Promise<SpeciesHit[]>)
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

  return (
    <div className="species-spotlight">
      <input
        type="search"
        className="species-spotlight__input"
        placeholder="Spotlight a species…"
        aria-label="Species spotlight"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
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
      {!loading && !fetchError && hits && hits.length > 0 && (
        <span className="species-spotlight__status">
          {hits.length} map{hits.length === 1 ? "" : "s"}
        </span>
      )}
      {!loading && !fetchError && hits && hits.length === 0 && (
        <p className="species-spotlight__empty" role="status">
          {displaySpecies(query)} appears in no encounter table anywhere in the project.
        </p>
      )}
    </div>
  );
}
