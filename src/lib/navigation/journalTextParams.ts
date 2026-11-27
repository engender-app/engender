/* Query parameters that can carry journal text, kept out of the address.

   Care links have carried an episode UUID since ba7631d1e, and More hands its search over
   in memory, but an address written before either - a bookmark, a history entry, a link
   typed by hand - can still name a medication in `drug` or `lane`, or a search in `q`. The
   browser keeps whatever the address says in its history, and the lock screen keeps the
   address it locked on, so these come out of the address on arrival and again when the
   journal locks.

   What the old address asked for is not thrown away on arrival: a Care medication name and
   a search are held here in memory, for the screen to resolve once the journal is open (the
   name to its episode UUID, the query into the search box), and a lock forgets them with
   the rest of the journal's content. */

import { forgetOnLock } from '../lock/forget-content';

const TEXT_PARAMS = ['drug', 'lane', 'q'] as const;
/** In-app return paths, whose own query can carry the same text. */
const NESTED_PATHS = ['from', 'returnTo'] as const;

function scrubParams(params: URLSearchParams, origin: string): boolean {
  let changed = false;
  for (const key of TEXT_PARAMS) {
    if (params.has(key)) {
      params.delete(key);
      changed = true;
    }
  }
  for (const key of NESTED_PATHS) {
    const value = params.get(key);
    if (value === null || !value.startsWith('/')) continue;
    const nested = new URL(value, origin);
    if (scrubParams(nested.searchParams, origin)) {
      params.set(key, nested.pathname + nested.search + nested.hash);
      changed = true;
    }
  }
  return changed;
}

/** The address with every journal-text parameter removed, nested return
    paths included - or null when there was none to remove. */
export function withoutJournalText(url: URL): URL | null {
  const clean = new URL(url);
  return scrubParams(clean.searchParams, clean.origin) ? clean : null;
}

/* Held here rather than handed to searchReturn.ts: this module runs at
   boot (hooks.client.ts), and importing route code from it would add that
   code to the first load. */
let legacyCareDrug: string | null = null;
let legacyQuery: string | null = null;

forgetOnLock(() => {
  legacyCareDrug = null;
  legacyQuery = null;
});

/** An arriving address, cleaned: what it asked for is held in memory for
    the screen that will ask (`cold` when the router has not read it yet), and the address to replace it with comes
    back, or null when it was already clean. */
export function arriveWithoutJournalText(url: URL, { cold = false } = {}): URL | null {
  const clean = withoutJournalText(url);
  if (!clean) return null;
  const params = url.searchParams;
  if ((url.pathname === '/care' || url.pathname === '/care/doses') && !params.has('episode')) {
    legacyCareDrug = params.get('drug') ?? params.get('lane');
  }
  const query = params.get('q');
  /* Only on a cold arrival: an in-app one is cleaned after Search has
     mounted and read `?q=` itself, so a query held then would wait for
     the next visit and prefill it. */
  if (cold && url.pathname === '/search' && query) legacyQuery = query;
  return clean;
}

/** The medication an old Care address named, once: the screen resolves it
    to the episode it belongs to and puts that episode's UUID in the
    address instead. */
export function takeLegacyCareDrug(): string | null {
  const drug = legacyCareDrug;
  legacyCareDrug = null;
  return drug;
}

/** The search an old `/search?q=` address asked for, once. */
export function takeLegacyQuery(): string | null {
  const query = legacyQuery;
  legacyQuery = null;
  return query;
}
