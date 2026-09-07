import { test } from 'vitest';
import assert from 'node:assert/strict';
import { AREA_GROUPS, AREA_GROUP_KEYS, FINISH_SUGGESTION_QUIET_DAYS } from './areaGroups.ts';
import type { AreaStates } from './areaState.ts';
import { PATHS } from '../components/icons.ts';
import { LAST_WRITE_ENTRIES } from './journal/lastWrite.ts';
import {
  AREA_GROUP_ROW_KEYS,
  HUB_GROUP_KEYS,
  HUB_ROWS,
  HUB_ROW_HOSTS,
  LAST_WRITE_WITHOUT_A_ROW,
  hubSections,
  isHubGroup,
  rowHidden,
  rowLine,
  rowReads,
  rowsHostedBy,
  type HubReading,
  type HubRowSpec
} from './hubRows.ts';

const TODAY = 20000;

/** How many rows the hub itself draws, which is every row minus the seven
    drawn on a screen of their own (ticket 16). */
const drawnRowCount = HUB_ROWS.filter((row) => isHubGroup(row.home)).length;

const spec = (key: string): HubRowSpec => {
  const found = HUB_ROWS.find((row) => row.key === key);
  if (!found) throw new Error(`no hub row called ${key}`);
  return found;
};

const reading = (over: Partial<HubReading> = {}): HubReading => ({
  todayEpochDay: TODAY,
  lastWrites: {},
  states: {},
  ...over
});

const finished = (epochDay: number) => ({ hidden: false, finishedEpochDay: epochDay, suspendedEpochDay: null });
const suspended = (epochDay: number) => ({ hidden: false, finishedEpochDay: null, suspendedEpochDay: epochDay });
const hidden = { hidden: true, finishedEpochDay: null, suspendedEpochDay: null };

// --- the row list itself ----------------------------------------------------

test('every row has its own key, and every home it names is drawn somewhere', () => {
  const keys = HUB_ROWS.map((row) => row.key);
  const homes = [...HUB_GROUP_KEYS, ...Object.keys(HUB_ROW_HOSTS)] as readonly string[];

  assert.equal(new Set(keys).size, keys.length);
  for (const row of HUB_ROWS) {
    assert.ok(homes.includes(row.home), `${row.key} is drawn nowhere`);
  }
});

test('no two rows anywhere on the hub share an icon', () => {
  /* Stronger than the ticket's "no two adjacent rows", and deliberately:
     hubRows.ts records that none of the three duplicated pairs was adjacent,
     so an adjacency test would have passed over all three. */
  const icons = HUB_ROWS.map((row) => row.icon);

  assert.equal(new Set(icons).size, icons.length, 'two rows draw the same icon');
});

test('every icon a row names is one the app can draw', () => {
  for (const row of HUB_ROWS) {
    assert.ok(row.icon in PATHS, `${row.key} names an icon that does not exist: ${row.icon}`);
  }
});

test('every finishable area group is fronted by exactly one row', () => {
  /* Both directions. The type-level check in hubRows.ts refuses a group no
     row claims - proven by deleting `finishes: 'sizes'` and watching
     `Unfronted` stop being `never` - and this catches the half it cannot see:
     two rows claiming one group, where the second silently overwrites the
     first in the record. */
  assert.deepEqual(Object.keys(AREA_GROUP_ROW_KEYS).sort(), [...AREA_GROUP_KEYS].sort());

  const fronting = HUB_ROWS.filter((row) => row.finishes !== null);
  assert.equal(fronting.length, Object.keys(AREA_GROUPS).length);
});

test('a row carries a reading exactly where its own areas have one', () => {
  /* The invariant behind the two-way split, so a row cannot be declared
     `read` with nothing to read or `written` while sitting on a registered
     area. Seven rows front an area that opted out of the last-write registry
     on purpose - a sealed letter, a span, reference data - and those never
     report a reading, for the same reason the four view-only rows do not. */
  for (const row of HUB_ROWS) {
    assert.equal(
      row.line === 'read',
      rowReads(row).length > 0,
      `${row.key} is declared ${row.line} but has ${rowReads(row).length} area(s) with a last write`
    );
  }
});

test('fifteen rows can report a reading and twelve never can', () => {
  const reads = HUB_ROWS.filter((row) => row.line === 'read');

  // The fifteenth is documents (phase 8 features ticket 52): the media
  // group's first row that fronts an area of its own.
  assert.equal(reads.length, 15);
  assert.equal(HUB_ROWS.length - reads.length, 12);
});

test('every area a row names is one the archive knows, and every registered read is claimed or excused', () => {
  /* The excused set is `LAST_WRITE_WITHOUT_A_ROW`, which is a compile error
     until somebody either points a row at a registered area or writes down
     why no row does - proven by deleting its `entries` line. What is left for
     a test is the arithmetic: the rows and the excuses together cover the
     registry once. */
  const claimed = new Set(HUB_ROWS.flatMap((row) => rowReads(row)));
  const registered = LAST_WRITE_ENTRIES.map((entry) => entry.key);
  const excused = Object.keys(LAST_WRITE_WITHOUT_A_ROW);

  assert.equal(claimed.size + excused.length, registered.length);
  for (const area of claimed) assert.ok(registered.includes(area), `${area} is not in the last-write registry`);
});

// --- what a row says --------------------------------------------------------

test('a row whose areas have never been written to says what is behind it', () => {
  /* Not nothing, and not "nothing yet": the spec's user story 13 wants each
     row to tell the person what is behind it, so a reading row with an empty
     area falls back to the same line a row that never reads shows. */
  assert.deepEqual(rowLine(spec('measurements'), reading()), { kind: 'not-yet' });
});

test('a row that was written to recently says when', () => {
  assert.deepEqual(rowLine(spec('measurements'), reading({ lastWrites: { measurements: TODAY - 3 } })), {
    kind: 'last',
    epochDay: TODAY - 3,
    daysAgo: 3
  });
});

test('written today is a reading like any other, not a special case', () => {
  assert.deepEqual(rowLine(spec('wear'), reading({ lastWrites: { wearSessions: TODAY } })), {
    kind: 'last',
    epochDay: TODAY,
    daysAgo: 0
  });
});

test('a whole quiet window with nothing written reads as quiet', () => {
  const quiet = TODAY - FINISH_SUGGESTION_QUIET_DAYS;
  const nearly = quiet + 1;

  assert.equal(rowLine(spec('sizes'), reading({ lastWrites: { sizeRecords: nearly } })).kind, 'last');
  assert.equal(rowLine(spec('sizes'), reading({ lastWrites: { sizeRecords: quiet } })).kind, 'quiet');
});

test('the quiet window is the one the finish offer already uses', () => {
  /* Not a second number. A row reading as quiet and the area's own screen
     offering the finish are the same observation, so they turn over on the
     same day. */
  assert.equal(FINISH_SUGGESTION_QUIET_DAYS, 180);
});

test('a row fronting two sections reports whichever was written last', () => {
  const line = rowLine(
    spec('hair-progress'),
    reading({ lastWrites: { hairStages: TODAY - 40, hairPhotos: TODAY - 4 } })
  );

  assert.deepEqual(line, { kind: 'last', epochDay: TODAY - 4, daysAgo: 4 });
});

test('an empty half does not drag a row backwards', () => {
  /* Somebody can log hair stages for two years and never photograph one, and
     an empty half is not a quiet half - `groupLastWrite`'s own reasoning. */
  const line = rowLine(spec('hair-progress'), reading({ lastWrites: { hairStages: TODAY - 2, hairPhotos: null } }));

  assert.deepEqual(line, { kind: 'last', epochDay: TODAY - 2, daysAgo: 2 });
});

test('a row only reads the areas it fronts, and asks for nothing else', () => {
  /* The ticket's "renders its quiet state without issuing a wasted read", at
     the level this module decides it: the assembled read answers for every
     area at once, and a row must not go rummaging in another one's answer. */
  const asked: string[] = [];
  const watched = new Proxy({} as Record<string, number | null>, {
    get(_target, area: string) {
      asked.push(area);
      return null;
    },
    has: () => true
  });

  rowLine(spec('sizes'), reading({ lastWrites: watched }));
  assert.deepEqual(asked, ['sizeRecords']);

  asked.length = 0;
  rowLine(spec('care'), reading({ lastWrites: watched }));
  assert.deepEqual(asked, []);
});

test('a row that can never read states what is behind it whatever the journal holds', () => {
  /* `letters` is one of the seven rows that front a real archive section and
     still cannot report a recency: a letter is sealed until its unlock day, so
     the registry has no entry for it - which is also why `lastWrites` cannot
     be handed a `letters` key to try it with. A full read changes nothing. */
  const everything = reading({ lastWrites: { measurements: TODAY - 1, sizeRecords: TODAY - 1 } });

  assert.deepEqual(rowReads(spec('letters')), []);
  assert.deepEqual(rowLine(spec('letters'), everything), { kind: 'no-stream' });
});

// --- finished ---------------------------------------------------------------

test('a finished row says the day it ended', () => {
  const line = rowLine(spec('wear'), reading({ states: { wearSessions: finished(TODAY - 90) } }));

  assert.deepEqual(line, { kind: 'finished', epochDay: TODAY - 90 });
});

test('a row fronting two sections reads as finished only when both are', () => {
  const half: AreaStates = { hairStages: finished(TODAY - 90) };
  const whole: AreaStates = { hairStages: finished(TODAY - 90), hairPhotos: finished(TODAY - 80) };

  const written = { hairStages: TODAY - 5 };

  assert.equal(rowLine(spec('hair-progress'), reading({ states: half, lastWrites: written })).kind, 'last');
  assert.deepEqual(rowLine(spec('hair-progress'), reading({ states: whole, lastWrites: written })), {
    kind: 'finished',
    epochDay: TODAY - 80
  });
});

test('finished wins over quiet, since the gap is no longer the observation', () => {
  const line = rowLine(
    spec('sizes'),
    reading({
      lastWrites: { sizeRecords: TODAY - 400 },
      states: { sizeRecords: finished(TODAY - 300) }
    })
  );

  assert.deepEqual(line, { kind: 'finished', epochDay: TODAY - 300 });
});

test('a finish dated in the future has not happened yet', () => {
  /* `areaQuiet` compares a finish day against today rather than trusting a
     flag (ADR-0049's clamp reasoning), and `groupFinishedOn` does not, so
     this pins which of the two the hub follows: the stored day is what the
     person named, and a row does not move until it arrives. */
  const line = rowLine(spec('wear'), reading({ states: { wearSessions: finished(TODAY + 10) } }));

  assert.deepEqual(line, { kind: 'not-yet' });
});

// --- suspended ----------------------------------------------------------------

test('a suspended row says the day it was paused', () => {
  const line = rowLine(spec('hair-removal'), reading({ states: { hairRemovalSessions: suspended(TODAY - 30) } }));

  assert.deepEqual(line, { kind: 'suspended', epochDay: TODAY - 30 });
});

test('a row fronting two sections reads as suspended only when both are', () => {
  const half: AreaStates = { voiceBenchmarks: suspended(TODAY - 30) };
  const whole: AreaStates = { voiceBenchmarks: suspended(TODAY - 30), voicePracticeTakes: suspended(TODAY - 20) };

  assert.equal(rowLine(spec('voice-benchmark'), reading({ states: half })).kind, 'not-yet');
  assert.deepEqual(rowLine(spec('voice-benchmark'), reading({ states: whole })), {
    kind: 'suspended',
    epochDay: TODAY - 20
  });
});

test('finished wins over suspended - a row cannot read both, but if it ever did, finished is the one that shows', () => {
  const line = rowLine(
    spec('hair-removal'),
    reading({ states: { hairRemovalSessions: { hidden: false, finishedEpochDay: TODAY - 10, suspendedEpochDay: TODAY - 30 } } })
  );

  assert.deepEqual(line, { kind: 'finished', epochDay: TODAY - 10 });
});

test('a suspend day dated in the future has not happened yet', () => {
  const line = rowLine(spec('hair-removal'), reading({ states: { hairRemovalSessions: suspended(TODAY + 10) } }));

  assert.deepEqual(line, { kind: 'not-yet' });
});

// --- hidden -----------------------------------------------------------------

test('a hidden area takes its row off the hub', () => {
  assert.equal(rowHidden(spec('sizes'), { sizeRecords: hidden }), true);
  assert.equal(rowHidden(spec('sizes'), {}), false);
});

test('a row fronting two sections goes only when both are hidden', () => {
  assert.equal(rowHidden(spec('hair-progress'), { hairStages: hidden }), false);
  assert.equal(rowHidden(spec('hair-progress'), { hairStages: hidden, hairPhotos: hidden }), true);
});

test('a row that fronts no area is a screen, and nothing hides it', () => {
  assert.equal(rowHidden(spec('care'), { measurements: hidden, sizeRecords: hidden }), false);
});

test('nothing in the area record can hide the cycle row (ADR-0043)', () => {
  /* One-directional by construction rather than by a special case: the row
     fronts `cycleEvents` alone, `cycleEvents` is outside `HideableArea`, so
     the every-section test cannot pass for it. A `hidden` row for it cannot
     even be typed, and `areaStates.ts` drops one arriving in an archive. */
  const smuggled = { cycleEvents: hidden } as unknown as AreaStates;

  assert.equal(rowHidden(spec('cycle-events'), smuggled), false);
});

// --- the assembled hub ------------------------------------------------------

test('the hub draws its groups in order and leaves out the ones with nothing in them', () => {
  const sections = hubSections(reading());

  assert.deepEqual(
    sections.map((section) => section.key),
    ['body', 'health', 'transition', 'support', 'media']
  );
});

test('a hidden area takes a hosted row out of its host, the way it took it off the hub', () => {
  /* ADR-0052's own consequence - "hiding takes an area out of the
     navigation" - and the case a hosted row could quietly lose: it is not in
     `hubSections` any more, so nothing on the hub can answer for it.
     `HostedRows.svelte` applies exactly this filter over the area record. */
  const hosted = rowsHostedBy('effects').map((row) => row.key);
  assert.deepEqual(hosted, ['side-effects', 'hair-progress']);

  const left = rowsHostedBy('effects')
    .filter((row) => !rowHidden(row, { sideEffects: hidden }))
    .map((row) => row.key);
  assert.deepEqual(left, ['hair-progress']);

  /* Both sections behind hair progress, or the row stays - the same
     every-section rule the hub applies. */
  assert.equal(rowHidden(spec('hair-progress'), { hairStages: hidden }), false);
  assert.equal(rowHidden(spec('hair-progress'), { hairStages: hidden, hairPhotos: hidden }), true);
});

test('a hosted row states the day its area ended, since the hub no longer can', () => {
  /* `HostedRows.svelte` calls `rowLine` with an empty `lastWrites`, which is
     what this passes too: finished and suspended are settled before the
     reading is consulted, so a hosted row shows an ending and otherwise its
     standing line. A reading would cost every host screen the hub's own
     assembled last-write call for a date the next screen opens on. */
  const noReads = { todayEpochDay: TODAY, lastWrites: {}, states: {} };

  assert.deepEqual(rowLine(spec('effects'), { ...noReads, states: { personalEffects: finished(TODAY - 90) } }), {
    kind: 'finished',
    epochDay: TODAY - 90
  });
  assert.deepEqual(rowLine(spec('side-effects'), { ...noReads, states: { sideEffects: suspended(TODAY - 5) } }), {
    kind: 'suspended',
    epochDay: TODAY - 5
  });
  assert.equal(rowLine(spec('dilation'), noReads).kind, 'not-yet');
  assert.equal(rowLine(spec('words'), noReads).kind, 'no-stream');
});

test('every host draws something, or is the one that writes its row by hand', () => {
  /* `rowsHostedBy` empty for a host means `HostedRows.svelte` renders
     nothing there, which is right for exactly one of them and a dead host
     for any other. */
  const empty = Object.keys(HUB_ROW_HOSTS).filter(
    (host) => rowsHostedBy(host as keyof typeof HUB_ROW_HOSTS).length === 0
  );

  assert.deepEqual(empty, []);
});

test('a hosted row is not on the hub at all, and its screen is named (ticket 16)', () => {
  const drawn = hubSections(reading()).flatMap((section) => section.rows.map((row) => row.spec.key));

  for (const row of HUB_ROWS) {
    if (isHubGroup(row.home)) continue;
    assert.ok(!drawn.includes(row.key), `${row.key} is hosted and still on the hub`);
    assert.ok(HUB_ROW_HOSTS[row.home], `${row.key} names a host that draws nothing`);
  }
  assert.deepEqual(
    HUB_ROWS.filter((row) => !isHubGroup(row.home)).map((row) => row.key),
    ['effects', 'side-effects', 'hair-progress', 'cycle-events', 'dilation', 'words', 'entry-templates']
  );
});

test('a hosted row stays on its host once it is finished, rather than joining the finished set', () => {
  /* The finished set is the hub's, and the hub does not draw this row. Its
     host still does, and the day the person named is on the area's own
     screen where they said it. */
  const sections = hubSections(reading({ states: { personalEffects: finished(TODAY - 90) } }));

  assert.ok(!sections.some((section) => section.key === 'finished'));
});

test('a finished row leaves its group for the finished set, and the set comes last', () => {
  const sections = hubSections(reading({ states: { wearSessions: finished(TODAY - 90) } }));

  assert.equal(sections.at(-1)?.key, 'finished');
  assert.deepEqual(
    sections.at(-1)?.rows.map((row) => row.spec.key),
    ['wear']
  );
  const transition = sections.find((section) => section.key === 'transition');
  assert.ok(!transition?.rows.some((row) => row.spec.key === 'wear'), 'the row is in two places at once');
});

test('a suspended row stays under its own group, unlike a finished one - it is not done', () => {
  const sections = hubSections(reading({ states: { hairRemovalSessions: suspended(TODAY - 30) } }));

  assert.ok(
    !sections.some((section) => section.key === 'finished'),
    'nothing is finished, so there is no finished set at all'
  );
  const transition = sections.find((section) => section.key === 'transition');
  assert.ok(transition?.rows.some((row) => row.spec.key === 'hair-removal'), 'the suspended row left its own group');
});

test('a finished row keeps its icon and its screen', () => {
  const sections = hubSections(reading({ states: { wearSessions: finished(TODAY - 90) } }));
  const row = sections.at(-1)?.rows[0];

  assert.equal(row?.spec.icon, 'clock');
  assert.equal(row?.spec.href, '/practice/wear');
});

test('a hidden area is absent from the assembled hub rather than moved', () => {
  const sections = hubSections(reading({ states: { sizeRecords: hidden } }));
  const keys = sections.flatMap((section) => section.rows.map((row) => row.spec.key));

  assert.ok(!keys.includes('sizes'));
  assert.equal(keys.length, drawnRowCount - 1);
});

test('a fresh journal draws every row the hub owns, each saying what is behind it', () => {
  const sections = hubSections(reading());
  const rows = sections.flatMap((section) => section.rows);

  assert.equal(rows.length, drawnRowCount);
  for (const row of rows) {
    assert.ok(['not-yet', 'no-stream'].includes(row.line.kind), `${row.spec.key} has a reading on an empty journal`);
  }
});

test('every group is the list phase 9 carpet ticket 16 asked for', () => {
  const sections = hubSections(reading());
  const group = (key: string) =>
    sections.find((section) => section.key === key)?.rows.map((row) => row.spec.key) ?? [];

  assert.deepEqual(group('body'), ['measurements', 'sizes']);
  assert.deepEqual(group('health'), ['care', 'surgery', 'appointments', 'clinician-summary']);
  assert.deepEqual(group('transition'), [
    'eras',
    'milestones',
    'tryouts',
    'voice-benchmark',
    'wear',
    'hair-removal',
    'roadmap',
    'letters',
    'presentations'
  ]);
  assert.deepEqual(group('support'), ['doubt', 'resources']);
  assert.deepEqual(group('media'), ['photos', 'voice', 'documents']);
});
