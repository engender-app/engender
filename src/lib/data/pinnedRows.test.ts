import { test } from 'vitest';
import assert from 'node:assert/strict';
import { HUB_ROWS, type HubReading } from './hubRows.ts';
import { DAY_AHEAD_MARK_KINDS } from './journal/dayAhead.ts';
import {
  addablePins,
  DEFAULT_ONBOARDING_AREAS,
  defaultPins,
  movedPin,
  pinArrangement,
  pinnedRows,
  shownAgendaKinds,
  withAgendaKind,
  withoutPin,
  withPin,
  type PinPreferences
} from './pinnedRows.ts';

const TODAY = 20000;

const reading = (over: Partial<HubReading> = {}): HubReading => ({
  todayEpochDay: TODAY,
  lastWrites: {},
  states: {},
  ...over
});

const finished = (epochDay: number) => ({ hidden: false, finishedEpochDay: epochDay, suspendedEpochDay: null });
const hidden = { hidden: true, finishedEpochDay: null, suspendedEpochDay: null };

/** The two preferences the resolution reads, as somebody who has arranged
    their own front page holds them. */
const arranged = (pins: string[] | null): PinPreferences => ({ pinnedRows: pins, onboardingAreas: [] });

const keysOf = (rows: ReturnType<typeof pinnedRows>) => rows.map((row) => row.spec.key);

// --- the person's own order -------------------------------------------------

test('rows come back in the order the person put them in, not the registry order', () => {
  /* `sizes` is declared after `measurements` on the hub, so a resolution
     that quietly sorted by the registry would come back the other way
     round. That is the whole claim of the feature: the app ranks nothing. */
  const rows = pinnedRows(arranged(['sizes', 'measurements']), reading());

  assert.deepEqual(keysOf(rows), ['sizes', 'measurements']);
});

test('a pinned row carries its own reading and the day of that reading', () => {
  const rows = pinnedRows(
    arranged(['measurements']),
    reading({ lastWrites: { measurements: TODAY - 3 } })
  );

  assert.deepEqual(rows[0].line, { kind: 'last', epochDay: TODAY - 3, daysAgo: 3 });
});

test('a pinned row with nothing written yet says so rather than showing a blank', () => {
  const rows = pinnedRows(arranged(['measurements']), reading());

  assert.deepEqual(rows[0].line, { kind: 'not-yet' });
});

test('a pinned row that can never report a reading says what is behind it', () => {
  /* `care` fronts four medication surfaces and no archive section of its
     own, so its line is a sentence about what is behind the row - the same
     answer the hub gives it. */
  const rows = pinnedRows(arranged(['care']), reading());

  assert.deepEqual(rows[0].line, { kind: 'no-stream' });
});

test('a pin naming a finished area carries the day it ended', () => {
  const rows = pinnedRows(
    arranged(['measurements']),
    reading({ states: { measurements: finished(TODAY - 40) } })
  );

  assert.deepEqual(rows[0].line, { kind: 'finished', epochDay: TODAY - 40 });
});

test('a finished pin stays where the person put it rather than moving to the end', () => {
  /* The hub sweeps a finished row into a finished set of its own. A pinned
     row is somewhere the person put it, so finishing an area may not move
     it - the hub's grouping is the hub's, and this is not the hub. */
  const rows = pinnedRows(
    arranged(['measurements', 'sizes']),
    reading({ states: { measurements: finished(TODAY - 40) } })
  );

  assert.deepEqual(keysOf(rows), ['measurements', 'sizes']);
});

// --- what resolves to nothing -----------------------------------------------

test('a stale pin naming a hidden area resolves to nothing', () => {
  const rows = pinnedRows(
    arranged(['measurements', 'sizes']),
    reading({ states: { sizeRecords: hidden } })
  );

  assert.deepEqual(keysOf(rows), ['measurements']);
});

test('a pin naming a row the registry has never held resolves to nothing', () => {
  const rows = pinnedRows(arranged(['measurements', 'a-row-from-a-newer-build']), reading());

  assert.deepEqual(keysOf(rows), ['measurements']);
});

test('a row pinned twice is drawn once, at the first place it was put', () => {
  const rows = pinnedRows(arranged(['measurements', 'sizes', 'measurements']), reading());

  assert.deepEqual(keysOf(rows), ['measurements', 'sizes']);
});

test('pinning nothing shows nothing, which is not the same as never having arranged it', () => {
  /* An empty arrangement is somebody who unpinned every row and gets a
     front page with none. Null is somebody who has never arranged it, and
     falls back to what onboarding chose - so unpinning the last row may not
     read as a fresh install. */
  const chose: PinPreferences = { pinnedRows: [], onboardingAreas: ['measurements'] };

  assert.deepEqual(keysOf(pinnedRows(chose, reading())), []);
  assert.deepEqual(keysOf(pinnedRows({ ...chose, pinnedRows: null }, reading())), ['measurements']);
});

// --- the rule, run over a shortened registry --------------------------------

test('the resolution can be run over a shortened registry and seen to drop the row it is missing', () => {
  /* Not a restatement of the filter: what is asserted is the resolution's
     own output over a registry one row short, which is the same function
     the screen calls. A pin that resolved a line ago resolves to nothing
     here, which is what a renamed or retired row does to a stored pin. */
  const pins = arranged(['measurements', 'sizes']);
  const shortened = HUB_ROWS.filter((row) => row.key !== 'sizes');

  assert.deepEqual(keysOf(pinnedRows(pins, reading())), ['measurements', 'sizes']);
  assert.deepEqual(keysOf(pinnedRows(pins, reading(), shortened)), ['measurements']);
});

// --- the default set --------------------------------------------------------

test('the default set is what onboarding chose', () => {
  const rows = pinnedRows({ pinnedRows: null, onboardingAreas: ['tryouts', 'measurements'] }, reading());

  assert.deepEqual(keysOf(rows), ['measurements', 'tryouts']);
});

test('the default set is drawn in registry order rather than in ticking order', () => {
  /* Which order somebody happened to tick a list of checkboxes in is an
     artefact of reading down the page, not an arrangement. The hub's order
     is one they have already met; ticket 14 is where they change it. */
  assert.deepEqual(defaultPins(['tryouts', 'measurements']), defaultPins(['measurements', 'tryouts']));
});

test('a skipped onboarding still produces a set', () => {
  const skipped = pinnedRows({ pinnedRows: null, onboardingAreas: null }, reading());

  assert.deepEqual(keysOf(skipped), [...DEFAULT_ONBOARDING_AREAS]);
  assert.ok(skipped.length > 0);
});

test('unticking every area at onboarding means a front page with no pinned rows', () => {
  const rows = pinnedRows({ pinnedRows: null, onboardingAreas: [] }, reading());

  assert.deepEqual(keysOf(rows), []);
});

test('the default set names only rows the registry holds, and no bad-hour row', () => {
  const keys = HUB_ROWS.map((row) => row.key);
  for (const key of DEFAULT_ONBOARDING_AREAS) assert.ok(keys.includes(key), `${key} is not a hub row`);

  /* The counterevidence check, the letters and the resource list are what
     somebody reaches for on a bad hour. Ticket 14 makes all three pinnable;
     none of them is on the front page until somebody asks for it. */
  for (const key of ['doubt', 'letters', 'resources']) {
    assert.ok(!(DEFAULT_ONBOARDING_AREAS as readonly string[]).includes(key), `${key} is pinned by default`);
  }
});

test('the default set answers to a hidden area the same way any other pin does', () => {
  const states = Object.fromEntries(
    HUB_ROWS.filter((row) => row.key === DEFAULT_ONBOARDING_AREAS[0])
      .flatMap((row) => row.areas)
      .map((area) => [area, hidden])
  );
  const rows = pinnedRows({ pinnedRows: null, onboardingAreas: null }, reading({ states }));

  assert.ok(!keysOf(rows).includes(DEFAULT_ONBOARDING_AREAS[0]));
});

// --- the agenda's switches --------------------------------------------------

test('every one of the five kinds is on until somebody switches one off', () => {
  assert.deepEqual(shownAgendaKinds({ agendaKinds: null }), [...DAY_AHEAD_MARK_KINDS]);
});

test('a switched-off kind stays off, and the rest keep the ADR order', () => {
  assert.deepEqual(shownAgendaKinds({ agendaKinds: ['doseSlot', 'appointment'] }), ['appointment', 'doseSlot']);
});

test('switching every kind off leaves no agenda at all', () => {
  assert.deepEqual(shownAgendaKinds({ agendaKinds: [] }), []);
});

test('a stored kind that is not one of the five cannot switch anything on', () => {
  /* ADR-0067's six refusals - a run-out day, a reminder, a daily dose slot,
     a taper session, the next hair photo, a revisit - are refusals about
     what earns a mark. A switch list is a person's answer about the five
     that do, and cannot be the back door that adds a sixth. */
  assert.deepEqual(shownAgendaKinds({ agendaKinds: ['appointment', 'runOut', 'reminder'] }), ['appointment']);
});

// --- the editing surface's own rules (ticket 14) ----------------------------

test('a person who has never arranged anything starts editing from the default set', () => {
  /* The default is resolved and never stored (ADR-0073), so the first edit
     has to write the whole set down: an arrangement that stored only the
     row somebody just added would silently unpin the other three. */
  assert.deepEqual(pinArrangement({ pinnedRows: null, onboardingAreas: null }), [...DEFAULT_ONBOARDING_AREAS]);
});

test('an arrangement keeps a pin whose area is hidden and drops one the registry lost', () => {
  /* Hiding an area is reversible, so its pin is still the person's
     statement and survives an edit - it just draws nothing while the area
     is hidden. A key no row answers to is not a pin at all, and an edit is
     where the arrangement stops carrying it. */
  const kept = pinArrangement(arranged(['measurements', 'sizes', 'no-such-row']));

  assert.deepEqual(kept, ['measurements', 'sizes']);
});

test('a row added lands at the end rather than in registry order', () => {
  /* Where a new pin goes is the only answer that is not a ranking: last,
     because the app may not decide that a row somebody just asked for
     belongs above one they arranged earlier. */
  assert.deepEqual(withPin(['tryouts', 'measurements'], 'sizes'), ['tryouts', 'measurements', 'sizes']);
});

test('adding a row that is already pinned changes nothing', () => {
  assert.deepEqual(withPin(['sizes', 'measurements'], 'sizes'), ['sizes', 'measurements']);
});

test('removing a row takes it out and leaves the rest in place', () => {
  assert.deepEqual(withoutPin(['sizes', 'measurements', 'tryouts'], 'measurements'), ['sizes', 'tryouts']);
});

test('removing the last row leaves an empty arrangement, which is not the default', () => {
  /* Null and empty are different answers (catalogue: `pinnedRows`). An
     edit that emptied the list has to store the empty list, or unpinning
     the last row reads as a fresh install and the default comes back. */
  assert.deepEqual(withoutPin(['sizes'], 'sizes'), []);
});

test('a row moved up takes the place of the one above it', () => {
  assert.deepEqual(movedPin(['a', 'b', 'c'], 'c', 'b'), ['a', 'c', 'b']);
});

test('a row moved down takes the place of the one below it', () => {
  assert.deepEqual(movedPin(['a', 'b', 'c'], 'a', 'b'), ['b', 'a', 'c']);
});

test('a row dropped several places away lands where it was dropped', () => {
  assert.deepEqual(movedPin(['a', 'b', 'c', 'd'], 'd', 'a'), ['d', 'a', 'b', 'c']);
  assert.deepEqual(movedPin(['a', 'b', 'c', 'd'], 'a', 'd'), ['b', 'c', 'd', 'a']);
});

test('a move over a pin nobody can see steps past it rather than swapping with it', () => {
  /* A hidden area's pin stays in the arrangement and draws nothing, so the
     row above `c` on screen is `a`, not `b`. The move is stated as the two
     rows the person can see and the invisible one keeps its place. */
  assert.deepEqual(movedPin(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b']);
});

test('a move naming a row that is not in the arrangement changes nothing', () => {
  assert.deepEqual(movedPin(['a', 'b'], 'a', 'z'), ['a', 'b']);
  assert.deepEqual(movedPin(['a', 'b'], 'z', 'a'), ['a', 'b']);
});

// --- what the add list may offer --------------------------------------------

const addable = (
  prefs: PinPreferences,
  over: Partial<HubReading> = {},
  cycleVisible = false
) => addablePins(prefs, reading(over), { cycleVisible }).map((row) => row.spec.key as string);

test('the add list offers every row the person has not pinned, in the hub order', () => {
  const offered = addable(arranged(['measurements']));
  const expected = HUB_ROWS.map((row) => row.key).filter(
    (key) => key !== 'measurements' && key !== 'cycle-events'
  );

  /* The hub's order rather than a ranking of its own: it is an order the
     person has already met, and any other one would be the app saying
     which area matters. */
  assert.deepEqual(offered, expected);
});

test('a row already pinned is not offered a second time', () => {
  assert.ok(!addable(arranged(['sizes'])).includes('sizes'));
});

test('a hidden area cannot be added', () => {
  const states = Object.fromEntries(
    (HUB_ROWS.find((row) => row.key === 'sizes')?.areas ?? []).map((area) => [area, hidden])
  );

  assert.ok(!addable(arranged([]), { states }).includes('sizes'));
});

test('the cycle log is offered only where its own gate is already open', () => {
  /* ADR-0043 one-directionally: pinning it is the person asking for it, so
     the pin resolves either way, but a list that offered it cold would be
     the app putting a cycle prompt in front of somebody who will never
     have one. */
  assert.ok(!addable(arranged([])).includes('cycle-events'));
  assert.ok(addable(arranged([]), {}, true).includes('cycle-events'));
});

test('the three bad-hour rows are all in the add list', () => {
  const offered = addable(arranged([]));

  for (const key of ['doubt', 'letters', 'resources']) {
    assert.ok(offered.includes(key), `${key} cannot be pinned`);
  }
});

test('a finished area can still be added, and says the day it ended', () => {
  /* Finishing is a statement about a practice rather than a delete
     (hubRows.ts), so the row keeps its place in the list to pick from and
     carries its own line into it. */
  const spec = HUB_ROWS.find((row) => row.key === 'wear');
  const states = Object.fromEntries((spec?.areas ?? []).map((area) => [area, finished(TODAY - 20)]));
  const offered = addablePins(arranged([]), reading({ states }), { cycleVisible: false });
  const wear = offered.find((row) => row.spec.key === 'wear');

  assert.deepEqual(wear?.line, { kind: 'finished', epochDay: TODAY - 20 });
});

// --- the switches, written back ---------------------------------------------

test('switching one kind off writes the other four down', () => {
  /* Null is "nobody has switched anything off", so the first switch has to
     materialise the five the way the first pin materialises the default
     set. */
  assert.deepEqual(withAgendaKind({ agendaKinds: null }, 'doseSlot', false), [
    'appointment',
    'surgery',
    'milestone',
    'letterUnlock'
  ]);
});

test('switching a kind back on keeps the ADR order rather than the order it was switched in', () => {
  assert.deepEqual(withAgendaKind({ agendaKinds: ['letterUnlock'] }, 'surgery', true), [
    'surgery',
    'letterUnlock'
  ]);
});

test('switching the last kind off leaves an empty list, not a null', () => {
  assert.deepEqual(withAgendaKind({ agendaKinds: ['surgery'] }, 'surgery', false), []);
});

