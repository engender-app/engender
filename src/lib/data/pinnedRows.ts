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
   navigation. One row has one shape - `hubRows.ts`'s `DrawnRow`, which both
   surfaces use - and the two are still not the same object, because what
   may be done to them differs: the hub groups its rows and sweeps a
   finished one into a set of its own, and neither of those may happen to
   somewhere the person arranged by hand. So this module resolves an order
   and never touches it again.

   Nothing is restated. A pin is a `hubRows.ts` key and nothing else; the
   icon, the route, which areas sit behind the row and what its second line
   says all come off the registry, and `areaState` answers hidden and
   finished. That is `statsAreas.ts`'s own lesson, which paid for four wrong
   fields on a shipped screen in one afternoon by restating five.

   Node-tier safe, like the two registries it reads: no clock, no driver, no
   paraglide, no runes. Today arrives inside `HubReading`, the same as it
   does for the hub. */

import { HUB_ROWS, rowHidden, rowLine, type DrawnRow, type HubReading, type HubRow, type HubRowKey } from './hubRows';
import { DAY_AHEAD_MARK_KINDS, type DayAheadMarkKind } from './journal/dayAhead';
import type { PreferenceValues } from './prefs/catalogue';

/** The set somebody who skipped onboarding's question meets, and the set the
    question itself arrives pre-ticked with - one list, so that skipping
    leaves the stored default alone in the way every other onboarding step
    already means it (`onboarding/steps.ts`).

    It is the one central guess in this module, and it is confined to a
    person who has not answered. Four rows: the transition's dated points,
    the body, the medication, and what is being tried out. Three of the four
    report a reading of their own, so day two says something. `care` is the
    fourth and never reports one - it fronts four medication surfaces and no
    archive section, so its line is a sentence about what is behind it - and
    it is here anyway, because a person on HRT meeting no way to their doses
    on the front page is the thing this default is for. Somebody
    self-managing removes it; somebody who does not measure removes
    measurements. That removal is the feature.

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

/** The switch list, the same way and for the same reason. All three of the
    front page's preferences are nullable lists of strings, so a function
    taking one of them raw would accept any of the other two: passing the
    pins to the agenda would have compiled and quietly switched every kind
    off. */
export type AgendaSwitches = Pick<PreferenceValues, 'agendaKinds'>;

/** One row as the front page draws it - `hubRows.ts`'s `DrawnRow` under the
    name `CONTEXT.md` gives it, because a pinned row is the domain object
    and a drawn row is the shape.

    The line is `rowLine`'s, unchanged and not reinterpreted. A pinned row
    that has gone quiet says the same thing about itself as its hub row
    does, which is what stops the app having two opinions about one area. */
export type PinnedRow = DrawnRow;

/** The default set: what onboarding chose, or the pre-ticked answer where it
    was never asked.

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

    A row the hub does not draw is not one of them either. Seven rows are
    hosted on a screen of their own rather than listed on the hub
    (ADR-0072), and all seven are pinnable: where the hub draws a row is the
    hub's own ranking of itself, and somebody with a dilation log or a hair
    progression they check daily is exactly the reader who should be able to
    put it in front of them. The one row this needs saying about is the
    cycle log, which ADR-0043 gates one-directionally: pinning it is the
    person asking for it, but the list they pick from has to apply that gate
    so it is never *offered* cold. That list is ticket 14's, and this is the
    note it inherits.

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
/** A quiet reading for initial render before SQLite queries settle.
    Every row reports its standing line ('not-yet' or 'no-stream'),
    so screens can render their pinned list without a cold-mount pop
    (phase 10 UX carpet ticket 106). */
export function fallbackReading(todayEpochDay: number): HubReading {
  return {
    todayEpochDay,
    lastWrites: {},
    states: {},
    forward: {},
    voiceMemoLastWriteEpochDay: null
  };
}

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
export function shownAgendaKinds(switches: AgendaSwitches): DayAheadMarkKind[] {
  if (switches.agendaKinds === null) return [...DAY_AHEAD_MARK_KINDS];
  const on = new Set(switches.agendaKinds);
  return DAY_AHEAD_MARK_KINDS.filter((kind) => on.has(kind));
}

/* ---------- editing it (ticket 14) ----------

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

/** The switch list after one kind was switched on or off.

    Materialised the same way an arrangement is, and for the same reason:
    null is "nobody has switched anything off", so the first switch has to
    write the other four down. The result is `DAY_AHEAD_MARK_KINDS`'s order
    rather than the order somebody switched things back on in, which is the
    order `shownAgendaKinds` reads it in anyway. Switching the last one off
    stores the empty list - the agenda goes quiet, which is what they
    asked for. */
export function withAgendaKind(
  switches: AgendaSwitches,
  kind: DayAheadMarkKind,
  on: boolean
): DayAheadMarkKind[] {
  const next = new Set(shownAgendaKinds(switches));
  if (on) next.add(kind);
  else next.delete(kind);
  return DAY_AHEAD_MARK_KINDS.filter((each) => next.has(each));
}
