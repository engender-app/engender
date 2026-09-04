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
  hubSections,
  rowHidden,
  rowLine,
  rowReads,
  type HubReading,
  type HubRowSpec
} from './hubRows.ts';

const TODAY = 20000;

const spec = (key: string): HubRowSpec => {
  const found = HUB_ROWS.find((row) => row.key === key);
  if (!found) throw new Error(`no hub row called ${key}`);
  return found;
};

const reading = (over: Partial<HubReading> = {}): HubReading => ({
  todayEpochDay: TODAY,
  lastWrites: {},
  states: {},
  cycleShown: true,
  ...over
});

const finished = (epochDay: number) => ({ hidden: false, finishedEpochDay: epochDay });
const hidden = { hidden: true, finishedEpochDay: null };

// --- the row list itself ----------------------------------------------------

test('every row has its own key, and every group it names is drawn', () => {
  const keys = HUB_ROWS.map((row) => row.key);

  assert.equal(new Set(keys).size, keys.length);
  for (const row of HUB_ROWS) {
    assert.ok((HUB_GROUP_KEYS as readonly string[]).includes(row.group), `${row.key} is in no drawn group`);
  }
});

test('no two rows anywhere on the hub share an icon', () => {
  /* Stronger than the ticket's "no two adjacent rows", and deliberately: the
     three pairs it names - the two voice-ish rows, roadmap and resources,
     milestones and surgery - were never adjacent to begin with, so an
     adjacency test would have passed over all three. */
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
     on purpose - a sealed letter, a span, reference data - and those read as
     `written` for the same reason the five view-only rows do. */
  for (const row of HUB_ROWS) {
    assert.equal(
      row.line === 'read',
      rowReads(row).length > 0,
      `${row.key} is declared ${row.line} but has ${rowReads(row).length} area(s) with a last write`
    );
  }
});

test('thirteen rows read and thirteen state what is behind them', () => {
  const reads = HUB_ROWS.filter((row) => row.line === 'read');

  assert.equal(reads.length, 13);
  assert.equal(HUB_ROWS.length - reads.length, 13);
});

test('every area a row names is one the archive knows, and every registered read is claimed or excused', () => {
  /* The excused set is `LAST_WRITE_WITHOUT_A_ROW`, which is a compile error
     until somebody either points a row at a registered area or writes down
     why no row does - proven by deleting its `entries` line. What is left for
     a test is the arithmetic: the rows and the excuses together cover the
     registry once. */
  const claimed = new Set(HUB_ROWS.flatMap((row) => rowReads(row)));
  const registered = LAST_WRITE_ENTRIES.map((entry) => entry.key);

  assert.equal(claimed.size + 5, registered.length);
  for (const area of claimed) assert.ok(registered.includes(area), `${area} is not in the last-write registry`);
});

// --- what a row says --------------------------------------------------------

test('a row whose areas have never been written to says nothing at all', () => {
  /* Rather than "nothing yet" repeated down a fresh journal. The hub fills in
     as somebody uses the app. */
  assert.deepEqual(rowLine(spec('measurements'), reading()), { kind: 'silent' });
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

test('a written row states what is behind it whatever the journal holds', () => {
  /* `letters` is one of the seven rows that front a real archive section and
     still cannot report a recency: a letter is sealed until its unlock day, so
     the registry has no entry for it - which is also why `lastWrites` cannot
     be handed a `letters` key to try it with. A full read changes nothing. */
  const everything = reading({ lastWrites: { measurements: TODAY - 1, sizeRecords: TODAY - 1 } });

  assert.deepEqual(rowReads(spec('letters')), []);
  assert.deepEqual(rowLine(spec('letters'), everything), { kind: 'written' });
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

  assert.deepEqual(line, { kind: 'silent' });
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
  const sections = hubSections(reading({ cycleShown: false }));

  assert.deepEqual(
    sections.map((section) => section.key),
    ['body', 'health', 'transition', 'practice', 'media']
  );
});

test('a finished row leaves its group for the finished set, and the set comes last', () => {
  const sections = hubSections(reading({ states: { wearSessions: finished(TODAY - 90) } }));

  assert.equal(sections.at(-1)?.key, 'finished');
  assert.deepEqual(
    sections.at(-1)?.rows.map((row) => row.spec.key),
    ['wear']
  );
  const practice = sections.find((section) => section.key === 'practice');
  assert.ok(!practice?.rows.some((row) => row.spec.key === 'wear'), 'the row is in two places at once');
});

test('a finished row keeps its icon and its screen', () => {
  const sections = hubSections(reading({ states: { wearSessions: finished(TODAY - 90) } }));
  const row = sections.at(-1)?.rows[0];

  assert.equal(row?.spec.icon, 'clock');
  assert.equal(row?.spec.href, '/settings/wear');
});

test('the cycle row is drawn only behind its own gate', () => {
  const shown = hubSections(reading({ cycleShown: true }));
  const not = hubSections(reading({ cycleShown: false }));
  const keys = (sections: ReturnType<typeof hubSections>) => sections.flatMap((s) => s.rows.map((r) => r.spec.key));

  assert.ok(keys(shown).includes('cycle-events'));
  assert.ok(!keys(not).includes('cycle-events'));
});

test('a hidden area is absent from the assembled hub rather than moved', () => {
  const sections = hubSections(reading({ states: { personalEffects: hidden } }));
  const keys = sections.flatMap((section) => section.rows.map((row) => row.spec.key));

  assert.ok(!keys.includes('effects'));
  assert.equal(keys.length, HUB_ROWS.length - 1);
});

test('a fresh journal draws every row, each with nothing under it', () => {
  const sections = hubSections(reading());
  const rows = sections.flatMap((section) => section.rows);

  assert.equal(rows.length, HUB_ROWS.length);
  for (const row of rows) {
    assert.ok(['silent', 'written'].includes(row.line.kind), `${row.spec.key} has a reading on an empty journal`);
  }
});

test('the media group is photos and voice memos, and body keeps the other four', () => {
  const sections = hubSections(reading());
  const group = (key: string) =>
    sections.find((section) => section.key === key)?.rows.map((row) => row.spec.key) ?? [];

  assert.deepEqual(group('media'), ['photos', 'voice']);
  assert.deepEqual(group('body'), ['measurements', 'sizes', 'hair-progress', 'hair-removal']);
});
