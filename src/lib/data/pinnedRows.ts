/* Resolve the pins a person chose for Today (ADR-0073). Use the saved
   onboarding choice or defaults when there is no saved arrangement.
   A pin carries only a hub row key. DrawnRow and the registry supply
   its icon, route, areas and description.

   Preserve the person's order when a row is finished. areaState
   supplies hidden and finished state. HubReading supplies today,
   so there is no separate clock or journal read here. */

import { HUB_ROWS, rowHidden, rowLine, rowReads, type DrawnRow, type HubReading, type HubRow, type HubRowKey } from './hubRows';
import { ROW_FORWARD_KEYS } from './rowForward';
import { AREA_STATES_BEFORE_READ } from './areaState';
import type { PreferenceValues } from './prefs/catalogue';

/** Default pins for a new journal and an older journal without an areas answer.
    Older journals with `onboardingAreas` set keep their chosen pins.

    It is the one central guess in this module, and it is confined to a
    person who has not arranged pins. Three rows: the transition's dated points,
    medication, and what is being tried out.

    Typed `readonly HubRowKey[]` rather than left as strings so a row renamed
    out from under it is a compile error rather than rows that quietly
    resolve to nothing. */
export const DEFAULT_ONBOARDING_AREAS = ['care', 'milestones', 'tryouts'] as const satisfies readonly HubRowKey[];
const LEGACY_UNANSWERED_AREAS = DEFAULT_ONBOARDING_AREAS;

/** What the person has stored about their front page.

    `Pick` over the catalogue rather than a shape of its own: the two fields
    are both nullable lists of row keys, so a caller handing them over the
    wrong way round would otherwise compile, and a rename in the catalogue
    would leave this reading a key nobody writes. */
export type PinPreferences = Pick<PreferenceValues, 'pinnedRows' | 'onboardingAreas'>;

/** The front page draws a pinned row as a hubRows.ts DrawnRow. Use the
    same rowLine reading that the hub shows, including when it goes quiet. */
export type PinnedRow = DrawnRow;

/** The default set: saved onboarding choices for older journals, or the
    three-row default when no choice was stored.

    In registry order rather than in the order somebody ticked a list of
    checkboxes, which is an artefact of reading down a page rather than an
    arrangement. The hub's order is one they have already met, and ticket 14
    is where an order of their own is made.

    Held apart from the arrangement rather than flattened into it so that
    "back to what I said at the start" stays computable after the front page
    has been rearranged. */
/* defaultPins stays exported only for its own test (AU-09 test-only
   review). */
export function defaultPins(
  onboardingAreas: readonly string[] | null,
  rows: readonly HubRow[] = HUB_ROWS
): HubRowKey[] {
  const chosen = new Set<string>(onboardingAreas ?? LEGACY_UNANSWERED_AREAS);
  return rows.filter((row) => chosen.has(row.key)).map((row) => row.key);
}

/** The keys to draw: the arrangement the person made, or the default while
    they have made none.

    Null and empty are different answers and the difference is the rule
    "nothing pinned means nothing shown": an empty list is somebody who
    unpinned everything and gets a front page with no rows, while null is
    somebody who has never arranged it at all. Unpinning the last row may
    not read as a fresh install. */
function pinKeys(prefs: PinPreferences, rows: readonly HubRow[]): readonly string[] {
  return prefs.pinnedRows ?? defaultPins(prefs.onboardingAreas, rows);
}

/** A quiet reading for initial render before SQLite queries settle.
    Every row reports its standing line ('not-yet' or 'no-stream'),
    so screens can render their pinned list without a cold-mount pop.
    */
export function fallbackReading(todayEpochDay: number): HubReading {
  return {
    todayEpochDay,
    lastWrites: {},
    states: AREA_STATES_BEFORE_READ,
    forward: {},
    voiceMemoLastWriteEpochDay: null
  };
}

/**
 * Resolve stored pins in the person's order against the row registry
 * and area visibility. Skip unknown or hidden rows. The first occurrence
 * wins if an Archive repeats a key.
 *
 * Rows hosted outside the hub can still be pinned (ADR-0072). Apply
 * the cycle visibility gate when offering pins. A saved cycle pin
 * already records the person's choice (ADR-0043). Finished rows keep
 * their place and date. The injected registry lets tests exercise
 * a missing row.
 */
export function pinnedRows(
  prefs: PinPreferences,
  reading: HubReading,
  rows: readonly HubRow[] = HUB_ROWS
): PinnedRow[] {
  const byKey = new Map(rows.map((row) => [row.key as string, row]));
  const drawn: PinnedRow[] = [];
  const seen = new Set<string>();

  for (const key of pinKeys(prefs, rows)) {
    if (seen.has(key)) continue;
    seen.add(key);

    const spec = byKey.get(key);
    if (!spec) continue;
    if (rowHidden(spec, reading.states)) continue;

    drawn.push({ spec, line: rowLine(spec, reading) });
  }

  return drawn;
}

/* ---------- editing it ----------

   The five functions below are the whole of what the editing surface may
   do, and they are here rather than in the screen for the reason the
   resolution is: what a pin is stays one file's answer. Each takes the
   arrangement and returns the next one, so the surface holds no rule of
   its own and the writes are testable without a DOM.

   None of them sorts. Adding puts a row last, removing closes the gap,
   moving does exactly what the person dragged, and the add list comes back
   in the hub's order because that is an order they have already met -
   `pinnedRows` above refuses to rank and so does everything here. */

/** The arrangement an edit starts from: what is stored, or the resolved
    default written down.

    The default is resolved and never stored (ADR-0073), so the first edit
    is the moment it becomes an arrangement. Materialising it is not
    bookkeeping: storing only the row somebody just added would unpin the
    other three, since a list is a complete answer.

    A key the registry does not hold goes here rather than being carried
    forever - a pin with no row is not a pin, and an edit is where the
    arrangement stops pretending otherwise. A pin whose area is *hidden*
    stays: hiding is reversible, so it is still what the person said, and
    it draws nothing only for as long as the area is out of the
    navigation. */
export function pinArrangement(prefs: PinPreferences, rows: readonly HubRow[] = HUB_ROWS): HubRowKey[] {
  const byKey = new Map(rows.map((row) => [row.key as string, row]));
  const seen = new Set<string>();
  const arrangement: HubRowKey[] = [];

  for (const key of pinKeys(prefs, rows)) {
    if (seen.has(key)) continue;
    seen.add(key);
    const spec = byKey.get(key);
    if (spec) arrangement.push(spec.key);
  }

  return arrangement;
}

/** Read the current pins on arrival; the editor needs every available row. */
export function pinReadScope(prefs: PinPreferences, editing: boolean) {
  const chosen = new Set(pinArrangement(prefs));
  const rows = HUB_ROWS.filter((row) => editing || chosen.has(row.key));
  const keys = rows.map((row) => row.key);
  return {
    rows: keys,
    lastWrites: [...new Set(rows.flatMap(rowReads))],
    forward: ROW_FORWARD_KEYS.filter((key) => keys.includes(key))
  };
}

/** The arrangement with one more row on the end.

    Last, because where a new pin goes is the one answer that would be a
    ranking: the app may not decide that a row somebody has just asked for
    belongs above one they arranged earlier. Already there is a no-op, so a
    double tap on an add row cannot produce the same pin twice. */
export function withPin(keys: readonly string[], key: HubRowKey): string[] {
  return keys.includes(key) ? [...keys] : [...keys, key];
}

/** The arrangement without a row.

    Emptying it stores the empty list rather than falling back to null: an
    unpinned last row may not read as a fresh install (catalogue:
    `pinnedRows`). Every occurrence goes, so an arrangement that arrived
    from an edited archive holding the same key twice loses both. */
export function withoutPin(keys: readonly string[], key: string): string[] {
  return keys.filter((pin) => pin !== key);
}

/** The arrangement with one row moved into the place another one holds.

    Stated as two row keys rather than as an index because the arrangement
    and what is on screen are not the same list: a pin whose area is hidden
    sits in the arrangement and draws nothing, so the row above the one
    being moved may not be the previous element. The surface names the two
    rows the person can see - dragging one onto another, or a keyboard move
    onto its visible neighbour - and a pin nobody can see keeps its place.

    Moving up lands before the target and moving down lands after it, which
    is what a drop onto a row means in both directions. A key either side
    that is not in the arrangement is not a move. */
export function movedPin(keys: readonly string[], key: string, targetKey: string): string[] {
  const from = keys.indexOf(key);
  const to = keys.indexOf(targetKey);
  if (from === -1 || to === -1 || from === to) return [...keys];

  const rest = keys.filter((pin) => pin !== key);
  const at = rest.indexOf(targetKey);
  rest.splice(from < to ? at + 1 : at, 0, key);
  return rest;
}

/** What the add list may offer, each with its own line.

    Three exclusions and one gate. A row already pinned is not offered
    twice; a row whose areas are hidden cannot be added at all, which is
    `pinnedRows`'s second resolution rule read forwards - an area out of the
    navigation may not be walked back in through the front page; and the
    cycle log is offered only where `cycleTrackingVisible` already says so
    (ADR-0043), which is the note `pinnedRows` above says this list
    inherits. The gate arrives as an answer rather than being computed here,
    because it needs the regimen episodes and a clock and this module has
    neither.

    A finished area is offered like any other and carries the day it ended
    in its line, for the reason a finished pin keeps its row: finishing is
    a statement about a practice, not a delete. */
export function addablePins(
  prefs: PinPreferences,
  reading: HubReading,
  gate: { cycleVisible: boolean },
  rows: readonly HubRow[] = HUB_ROWS
): PinnedRow[] {
  const pinned = new Set<string>(pinArrangement(prefs, rows));

  return rows
    .filter((spec) => !pinned.has(spec.key))
    .filter((spec) => !rowHidden(spec, reading.states))
    .filter((spec) => spec.key !== 'cycle-events' || gate.cycleVisible)
    .map((spec) => ({ spec, line: rowLine(spec, reading) }));
}
