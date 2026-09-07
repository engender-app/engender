import { test } from 'vitest';
import assert from 'node:assert/strict';
import { HUB_ROWS, type HubReading } from './hubRows.ts';
import { DAY_AHEAD_MARK_KINDS } from './journal/dayAhead.ts';
import {
  DEFAULT_ONBOARDING_AREAS,
  defaultPins,
  pinnedRows,
  shownAgendaKinds,
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
const arranged = (pinnedRows: string[] | null): PinPreferences => ({ pinnedRows, onboardingAreas: [] });

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
  assert.deepEqual(shownAgendaKinds(null), [...DAY_AHEAD_MARK_KINDS]);
});

test('a switched-off kind stays off, and the rest keep the ADR order', () => {
  assert.deepEqual(shownAgendaKinds(['doseSlot', 'appointment']), ['appointment', 'doseSlot']);
});

test('switching every kind off leaves no agenda at all', () => {
  assert.deepEqual(shownAgendaKinds([]), []);
});

test('a stored kind that is not one of the five cannot switch anything on', () => {
  /* ADR-0067's six refusals - a run-out day, a reminder, a daily dose slot,
     a taper session, the next hair photo, a revisit - are refusals about
     what earns a mark. A switch list is a person's answer about the five
     that do, and cannot be the back door that adds a sixth. */
  assert.deepEqual(shownAgendaKinds(['appointment', 'runOut', 'reminder']), ['appointment']);
});
