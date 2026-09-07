/* What a person put on the front page, and which of the agenda's kinds they
   left switched on (phase 10 redesign ticket 05, ADR-0073, CONTEXT: "Pinned
   row").

   The front page used to be a list the app decided. It pictured one reader -
   on HRT, under a clinician, logging most days, with a history that begins
   when the journal does - and every reader who differs met a screen
   describing somebody else. Nothing here ranks anything: a pinned row is on
   Today because the person put it there, in the place they put it, and the
   only pin this module ever produces without being asked is the default set
   derived from what onboarding chose.

   A **pinned row** is what a person put on Today. A **hub row** is
   navigation. They are drawn from one registry and they are not the same
   object, which is why `PinnedRow` below is its own type rather than a
   `HubSection` with a different heading: the hub groups its rows and sweeps
   a finished one into a set of its own, and neither of those things may
   happen to somewhere the person arranged by hand.

   Nothing is restated. A pin is a `hubRows.ts` key and nothing else; the
   icon, the route, which areas sit behind the row and what its second line
   says all come off the registry, and `areaState` answers hidden and
   finished. That is `statsAreas.ts`'s own lesson, which paid for four wrong
   fields on a shipped screen in one afternoon by restating five.

   Node-tier safe, like the two registries it reads: no clock, no driver, no
   paraglide, no runes. Today arrives inside `HubReading`, the same as it
   does for the hub. */

import { HUB_ROWS, rowHidden, rowLine, type HubLine, type HubReading, type HubRow, type HubRowKey } from './hubRows';
import { DAY_AHEAD_MARK_KINDS, type DayAheadMarkKind } from './journal/dayAhead';
import type { PreferenceValues } from './prefs/catalogue';

/** The set somebody who skipped onboarding's question meets, and the set the
    question itself arrives pre-ticked with - one list, so that skipping
    leaves the stored default alone in the way every other onboarding step
    already means it (`onboarding/steps.ts`).

    It is the one central guess in this module, and it is confined to a
    person who has not answered. Four rows, each of which reports a reading
    of its own, so day two says something: the transition's dated points, the
    body, the medication, and what is being tried out. Somebody
    self-managing removes the medication row; somebody who does not measure
    removes measurements. That removal is the feature.

    Typed `readonly HubRowKey[]` rather than left as strings so a row renamed
    out from under it is a compile error rather than four rows that quietly
    resolve to nothing. */
export const DEFAULT_ONBOARDING_AREAS = ['measurements', 'care', 'milestones', 'tryouts'] as const satisfies readonly HubRowKey[];

/** What the person has stored about their front page.

    `Pick` over the catalogue rather than a shape of its own: the two fields
    are both nullable lists of row keys, so a caller handing them over the
    wrong way round would otherwise compile, and a rename in the catalogue
    would leave this reading a key nobody writes. */
export type PinPreferences = Pick<PreferenceValues, 'pinnedRows' | 'onboardingAreas'>;

/** One row as the front page draws it: the registry's declaration, and the
    line the hub would have given it.

    The line is `rowLine`'s, unchanged and not reinterpreted. A pinned row
    that has gone quiet says the same thing about itself in both places,
    which is what stops the app having two opinions about one area. */
export interface PinnedRow {
  spec: HubRow;
  line: HubLine;
}

/** The default set: what onboarding chose, or the pre-ticked answer where it
    was never asked.

    In registry order rather than in the order somebody ticked a list of
    checkboxes, which is an artefact of reading down a page rather than an
    arrangement. The hub's order is one they have already met, and ticket 14
    is where an order of their own is made.

    Exported for that ticket's reset as much as for this one's resolution:
    "back to what I said at the start" has to stay computable after the front
    page has been rearranged, which is why the answer is held apart from the
    arrangement rather than flattened into it. */
export function defaultPins(
  onboardingAreas: readonly string[] | null,
  rows: readonly HubRow[] = HUB_ROWS
): HubRowKey[] {
  const chosen = new Set<string>(onboardingAreas ?? DEFAULT_ONBOARDING_AREAS);
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

/** The front page's rows, resolved: the person's pins, the area registry and
    area state, in the person's own order.

    Three ways a stored pin resolves to nothing, and all three are the same
    statement - a pin is about a row on a screen, so a pin with no row is not
    a pin:

      - a key the registry does not hold, which is what a renamed or retired
        row leaves behind. It resolves to nothing rather than to a guess:
        matching it against something similar would be the app deciding what
        somebody meant
      - a row whose areas the person has hidden, which is `areaState`'s rule
        and the hub's - a hidden area is out of the navigation, and a front
        page that kept drawing it would be a second navigation that never
        heard
      - the same key twice, which the editing surface cannot produce and an
        edited archive can. The first place it was put wins, because that is
        where they put it

    A finished area is **not** one of them. It keeps its row, carrying the
    day it ended, exactly the way its hub row does - finishing is a statement
    about a practice rather than a delete. It also keeps its place: the hub
    sweeps a finished row into a finished set, and doing that to somewhere
    the person arranged by hand would be the app reordering their front page,
    which is the one thing this module exists to refuse.

    `rows` is the registry, defaulted rather than reached for, so
    `pinnedRows.test.ts` can drive this same function over a registry one row
    short and watch the rule actually fail - the discipline `unregisteredKinds`
    holds itself to next door. */
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

/** Which of the agenda's kinds to draw: the ones left switched on, or all
    five while nobody has switched any off.

    A switch and not a dismissal, which is the whole of why it is stored -
    a kind somebody does not want is otherwise one they dismiss every week
    for the life of the journal.

    Filtered against `DAY_AHEAD_MARK_KINDS` and returned in its order, which
    is ADR-0067's. Both halves matter and neither is bookkeeping. The order
    is the ADR's rather than the order somebody switched things back on in,
    so the agenda reads the same way for everybody who has the same kinds on.
    The filter is what stops the switch list being a back door: ADR-0067
    refuses six kinds a mark - a run-out day, a reminder, a daily dose slot,
    a taper session, the next hair photo, a revisit - and a stored list is a
    person's answer about the five that earn one, never a way to register a
    sixth. Amending that list means amending the ADR. */
export function shownAgendaKinds(stored: readonly string[] | null): DayAheadMarkKind[] {
  if (stored === null) return [...DAY_AHEAD_MARK_KINDS];
  const on = new Set(stored);
  return DAY_AHEAD_MARK_KINDS.filter((kind) => on.has(kind));
}
