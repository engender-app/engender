import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { AREA_GROUPS, AREA_GROUP_KEYS, FINISH_SUGGESTION_QUIET_DAYS } from './areaGroups.ts';
import type { AreaStates } from './areaState.ts';
import { PATHS } from '../components/icons.ts';
import { LAST_WRITE_ENTRIES } from './journal/lastWrite.ts';
import { ROW_FORWARD_KEYS } from './rowForward.ts';
import {
  AREA_GROUP_ROW_KEYS,
  HUB_GROUP_KEYS,
  HUB_ROWS,
  LAST_WRITE_WITHOUT_A_ROW,
  hubRowsMatching,
  hubSections,
  rowHidden,
  rowLine,
  rowReads,
  type HubReading,
  type HubRowSpec
} from './hubRows.ts';

const TODAY = 20000;

/** How many rows the hub itself draws: every row. */
const drawnRowCount = HUB_ROWS.length;

const spec = (key: string): HubRowSpec => {
  const found = HUB_ROWS.find((row) => row.key === key);
  if (!found) throw new Error(`no hub row called ${key}`);
  return found;
};

const reading = (over: Partial<HubReading> = {}): HubReading => ({
  todayEpochDay: TODAY,
  lastWrites: {},
  states: {},
  forward: {},
  /* On by default so the counts below are of every row; the gate's own
     tests turn it off. */
  cycleVisible: true,
  ...over
});

const finished = (epochDay: number) => ({ hidden: false, finishedEpochDay: epochDay, suspendedEpochDay: null });
const suspended = (epochDay: number) => ({ hidden: false, finishedEpochDay: null, suspendedEpochDay: epochDay });
const hidden = { hidden: true, finishedEpochDay: null, suspendedEpochDay: null };

// --- the registry is the only enumeration --------------------------------

/** Every production file that reads this module - phase 10 redesign ticket
    12's own proof, after `statsAreas.ts` was deleted as a second enumeration
    of areas kept alive by nothing since ticket 99 item 36. Named rather than
    globbed, the choice `feature-screens.test.ts` already made and for the
    same reason - a surface silently added to this list and a surface
    silently dropped from it read identically to a glob.

    What this proves and what it does not: every file that imports `hubRows`
    is one of these nine, so a tenth reader appearing anywhere fails here
    rather than passing silently. `TodayEditor.svelte` is the sixth, added
    by ticket 14 - it reads `HubReading` and `HubRowKey` to arrange the
    front page, and everything it draws about a row comes off the registry
    the way `pinnedRows.ts` next door does. It cannot see a second registry built
    without importing this module at all - no scan can - which is why the
    stronger claim is the deletion itself: `statsAreas.ts` was the one file
    doing that, confirmed by grep before it was removed, and nothing has
    replaced it.

    `dayRows.ts`, `searchHitRows.ts` and `rowIcon.ts` are the seventh,
    eighth and ninth, added by ticket 30: a search hit and a day row used to
    declare an icon and a route of their own for every screen the hub
    already named, an agreement the two files stated only in a comment.
    They now read a row's `icon` and `href` off `hubRow()` wherever a
    screen has one - the same reasoning `TodayEditor.svelte` already stood
    on - and keep their own words and local icons only where no hub row
    owns the screen at all. `rowIcon.ts` is the one call both files share
    for reading or declaring that icon, rather than each restating it. */
const REGISTRY_SURFACES = [
  'src/lib/components/FeatureVisibilityList.svelte',
  'src/lib/components/HostedRows.svelte',
  'src/lib/components/TodayEditor.svelte',
  'src/lib/components/dayRows.ts',
  'src/lib/components/rowIcon.ts',
  'src/lib/components/searchHitRows.ts',
  'src/lib/data/pinnedRows.ts',
  'src/lib/data/vocabulary/hubLabels.ts',
  /* The feature manifest (functional audit ticket 54) names each feature's
     rows by `HubRowKey`, a type-only import, and claims every row once. It
     draws nothing and a row it names that the registry lost stops the
     typecheck, so it is a check on this module rather than a second list. */
  'src/lib/features.ts',
  'src/lib/onboarding/features.ts',
  'src/routes/more/+page.svelte',
  'src/routes/onboarding/+page.svelte',
  'src/routes/settings/+page.svelte'
].sort();

/** Every file under `src` whose source imports `hubRows`, minus this file's
    own test and the tests that cross-check the registry rather than read
    it to draw something. A `.svelte` file's script block is where the
    import lives; reading the whole file catches it the same as reading a
    `.ts` file whole does. */
function filesReadingTheRegistry(): string[] {
  const found: string[] = [];
  for (const entry of readdirSync('src', { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!/\.(ts|svelte)$/.test(entry.name)) continue;
    if (/\.test\.ts$/.test(entry.name)) continue;
    const path = `${entry.parentPath}/${entry.name}`.replace(/^\.\//, '');
    if (path === 'src/lib/data/hubRows.ts') continue;
    const source = readFileSync(path, 'utf8');
    if (/from ['"][^'"]*\bhubRows(?:\.ts)?['"]/.test(source)) found.push(path);
  }
  return found.sort();
}

test('the registry is the only enumeration of areas, and these are the surfaces that read it', () => {
  assert.deepEqual(filesReadingTheRegistry(), REGISTRY_SURFACES);
});

test('one registration reaches exactly the surface a row names as its home, and search, for every row - not just a sample', () => {
  /* Not a fabricated row - HUB_ROWS is a `const` array and injecting one
     would need a second entry point this file does not have, which is
     itself part of the proof: there is nowhere else to register one. So
     this proves the general claim over every real row instead, each
     standing for the hypothetical one its own shape would be: a row whose
     `home` is a hub group is drawn there and nowhere else, and is found by
     search. One declaration in `ROWS`, checked against both surfaces, with
     nothing else to edit for either. */
  const onHub = new Set(hubSections(reading()).flatMap((section) => section.rows.map((row) => row.spec.key)));

  for (const row of HUB_ROWS) {
    assert.ok(onHub.has(row.key), `${row.key} names a hub group but the hub never draws it`);

    const matches = hubRowsMatching(reading(), row.key, (key) => key);
    assert.ok(matches.some((match) => match.spec.key === row.key), `${row.key} is registered but search cannot find it`);
  }
});

// --- the row list itself ----------------------------------------------------

test('every row has its own key, and every home it names is drawn somewhere', () => {
  const keys = HUB_ROWS.map((row) => row.key);
  const homes = HUB_GROUP_KEYS as readonly string[];

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
     row claims - proven by deleting `finishes: 'wear'` and watching
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

test('twelve rows can report a reading and seven never can', () => {
  const reads = HUB_ROWS.filter((row) => row.line === 'read');

  // The fifteenth is documents (phase 8 features ticket 52): the media
  // group's first row that fronts an area of its own. Twelve until redesign
  // ticket 51 took `presentations` and `entry-templates` - both 'written' -
  // off the registry entirely. Ten until ticket 59 deleted the
  // clinician-summary row outright rather than hosting it, and fourteen
  // since redesign ticket 61 folded the size log into the measurements row.
  // Thirteen since ticket 13 folded `side-effects` - a 'read' row - into
  // `effects` rather than giving it a row of its own; the written eight
  // are untouched by that one. Twelve since functional audit ticket 05
  // removed the measurements row. The written eight are nine less `words`,
  // which redesign ticket 62 took off with the screen it opened, and seven
  // since redesign ticket 16 took `eras` - also 'written' - off the same
  // way. Six since phase 11 ticket 17 folded `voice` - also 'written' -
  // into `voice-benchmark`'s own Recordings tab rather than giving it a
  // row of its own. Thirteen since pre-release-human 12 added
  // `progress-photos`, a reading row, and twelve since hair progress - also
  // 'read' - folded into progress photos (version 124). Seven written since
  // bug session 18 item 70 gave voice memos back a Media row, `recordings`.
  assert.equal(reads.length, 12);
  assert.equal(HUB_ROWS.length - reads.length, 7);
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
  assert.deepEqual(rowLine(spec('effects'), reading()), { kind: 'not-yet' });
});

test('a row that was written to recently says when', () => {
  assert.deepEqual(rowLine(spec('effects'), reading({ lastWrites: { personalEffects: TODAY - 3 } })), {
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

  assert.equal(rowLine(spec('wear'), reading({ lastWrites: { wearSessions: nearly } })).kind, 'last');
  assert.equal(rowLine(spec('wear'), reading({ lastWrites: { wearSessions: quiet } })).kind, 'quiet');
});

/* After-release 17 (UX-18): "Nothing logged for 2 years 1 month" on the
   Documents row read as a nag about a paperwork vault. Quiet is the
   observation the finish offer is made from, so a row with nothing to
   finish never turns quiet: it keeps saying when it was last written. */
test('a row with nothing to finish never reads as quiet', () => {
  const long = TODAY - FINISH_SUGGESTION_QUIET_DAYS - 400;
  assert.equal(rowLine(spec('documents'), reading({ lastWrites: { documents: long } })).kind, 'last');
  assert.equal(rowLine(spec('milestones'), reading({ lastWrites: { milestones: long } })).kind, 'last');
  assert.equal(rowLine(spec('wear'), reading({ lastWrites: { wearSessions: long } })).kind, 'quiet');
});

test('the quiet window is the one the finish offer already uses', () => {
  /* Not a second number. A row reading as quiet and the area's own screen
     offering the finish are the same observation, so they turn over on the
     same day. */
  assert.equal(FINISH_SUGGESTION_QUIET_DAYS, 180);
});

test('the merged effects row reports whichever half was written last (ticket 13)', () => {
  const line = rowLine(
    spec('effects'),
    reading({ lastWrites: { personalEffects: TODAY - 40, sideEffects: TODAY - 4 } })
  );

  assert.deepEqual(line, { kind: 'last', epochDay: TODAY - 4, daysAgo: 4 });
});

test('a side effect logged alone does not drag the effects row backwards', () => {
  const line = rowLine(
    spec('effects'),
    reading({ lastWrites: { personalEffects: null, sideEffects: TODAY - 2 } })
  );

  assert.deepEqual(line, { kind: 'last', epochDay: TODAY - 2, daysAgo: 2 });
});

test('voice-benchmark reports the later of a benchmark and a recording (ticket 17)', () => {
  const line = rowLine(
    spec('voice-benchmark'),
    reading({ lastWrites: { voiceBenchmarks: TODAY - 40 }, voiceMemoLastWriteEpochDay: TODAY - 4 })
  );

  assert.deepEqual(line, { kind: 'last', epochDay: TODAY - 4, daysAgo: 4 });
});

test('a recording alone does not leave voice-benchmark reporting no-stream', () => {
  const line = rowLine(spec('voice-benchmark'), reading({ voiceMemoLastWriteEpochDay: TODAY - 2 }));

  assert.deepEqual(line, { kind: 'last', epochDay: TODAY - 2, daysAgo: 2 });
});

test('a benchmark alone does not need a recording to report', () => {
  const line = rowLine(spec('voice-benchmark'), reading({ lastWrites: { voiceBenchmarks: TODAY - 2 } }));

  assert.deepEqual(line, { kind: 'last', epochDay: TODAY - 2, daysAgo: 2 });
});

test('neither a benchmark nor a recording reads as not-yet, same as any other row', () => {
  assert.deepEqual(rowLine(spec('voice-benchmark'), reading()), { kind: 'not-yet' });
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

  rowLine(spec('effects'), reading({ lastWrites: watched }));
  assert.deepEqual(asked, ['personalEffects', 'sideEffects']);

  asked.length = 0;
  rowLine(spec('care'), reading({ lastWrites: watched }));
  assert.deepEqual(asked, []);
});

test('a row that can never read states what is behind it whatever the journal holds', () => {
  /* `letters` is one of the seven rows that front a real archive section and
     still cannot report a recency: a letter is sealed until its unlock day, so
     the registry has no entry for it - which is also why `lastWrites` cannot
     be handed a `letters` key to try it with. A full read changes nothing. */
  const everything = reading({ lastWrites: { personalEffects: TODAY - 1, sideEffects: TODAY - 1 } });

  assert.deepEqual(rowReads(spec('letters')), []);
  assert.deepEqual(rowLine(spec('letters'), everything), { kind: 'no-stream' });
});

// --- what is next ----------------------------------------------------------

/* The choice rule this ticket exists for (phase 11 all-four-doors ticket 02,
   DIRECTION.md rule 16). What the fact itself is and where it is read from is
   `rowForward.test.ts`'s question; these are about which of two facts a row
   prints when it holds both. */

test('a forward fact beats a last write', () => {
  const line = rowLine(
    spec('milestones'),
    reading({
      lastWrites: { milestones: TODAY - 487 },
      forward: { milestones: { kind: 'next', epochDay: TODAY + 16, what: { area: 'milestone', name: 'Name-change hearing' } } }
    })
  );

  assert.deepEqual(line, {
    kind: 'next',
    epochDay: TODAY + 16,
    what: { area: 'milestone', name: 'Name-change hearing' }
  });
});

/* Care and letters report no reading at all - Care fronts no archive section
   and a letter is sealed until its day - so a standing sentence about what is
   behind the row is what a dated future replaces. */
test('a forward fact beats the standing line of a row that never reads', () => {
  const care = rowLine(
    spec('care'),
    reading({ forward: { care: { kind: 'next', epochDay: TODAY + 2, what: { area: 'dose', runOutEpochDay: TODAY + 19 } } } })
  );
  const letters = rowLine(
    spec('letters'),
    reading({ forward: { letters: { kind: 'next', epochDay: TODAY + 42, what: { area: 'letter', several: false } } } })
  );

  assert.equal(care.kind, 'next');
  assert.equal(letters.kind, 'next');
});

test('a running span is drawn as it arrives, whatever was last written', () => {
  const line = rowLine(
    spec('wear'),
    reading({
      lastWrites: { wearSessions: TODAY - 400 },
      forward: { wear: { kind: 'running', what: { area: 'wear', wearKind: 'binder', startTimestamp: 1_700_000_000_000 } } }
    })
  );

  assert.deepEqual(line, {
    kind: 'running',
    what: { area: 'wear', wearKind: 'binder', startTimestamp: 1_700_000_000_000 }
  });
});

/* A row the person has said is over does not announce what is next in it:
   the statement they made about the practice outranks anything still dated
   inside it. */
test('finished and suspended still win over a forward fact', () => {
  const forward = {
    wear: { kind: 'running', what: { area: 'wear', wearKind: 'binder', startTimestamp: 1_700_000_000_000 } }
  } as const;

  assert.deepEqual(rowLine(spec('wear'), reading({ forward, states: { wearSessions: finished(TODAY - 90) } })), {
    kind: 'finished',
    epochDay: TODAY - 90
  });
  assert.deepEqual(rowLine(spec('wear'), reading({ forward, states: { wearSessions: suspended(TODAY - 90) } })), {
    kind: 'suspended',
    epochDay: TODAY - 90
  });
});

/* Nothing forward to say is the common case - eight rows of twenty-one can
   carry a forward fact at all, and the other thirteen read exactly as they
   did before this ticket. */
test('with nothing forward, every row falls through to the reading it had', () => {
  const empty = reading({ lastWrites: { personalEffects: TODAY - 3 } });

  assert.deepEqual(rowLine(spec('effects'), empty), { kind: 'last', epochDay: TODAY - 3, daysAgo: 3 });
  assert.deepEqual(rowLine(spec('care'), empty), { kind: 'no-stream' });
  assert.deepEqual(rowLine(spec('milestones'), empty), { kind: 'not-yet' });
});

/* The forward registry names its own rows (`rowForward.ts`), so a key it
   answers for that is not a row here would assemble a fact nothing draws.
   `EveryForwardKeyIsARow` proves it at compile time; this proves the set is
   not silently empty, which a vacuous type assertion would also satisfy. */
test('every row the forward registry answers for is a row on the hub', () => {
  const rows = new Set(HUB_ROWS.map((row) => row.key as string));
  assert.equal(ROW_FORWARD_KEYS.length, 7);
  for (const key of ROW_FORWARD_KEYS) assert.equal(rows.has(key), true, `${key} is not a hub row`);
});

// --- finished ---------------------------------------------------------------

test('a finished row says the day it ended', () => {
  const line = rowLine(spec('wear'), reading({ states: { wearSessions: finished(TODAY - 90) } }));

  assert.deepEqual(line, { kind: 'finished', epochDay: TODAY - 90 });
});

test('a row fronting two sections reads as finished only when both are', () => {
  const half: AreaStates = { personalEffects: finished(TODAY - 90) };
  const whole: AreaStates = { personalEffects: finished(TODAY - 90), sideEffects: finished(TODAY - 80) };

  const written = { personalEffects: TODAY - 5 };

  assert.equal(rowLine(spec('effects'), reading({ states: half, lastWrites: written })).kind, 'last');
  assert.deepEqual(rowLine(spec('effects'), reading({ states: whole, lastWrites: written })), {
    kind: 'finished',
    epochDay: TODAY - 80
  });
});

test('finished wins over quiet, since the gap is no longer the observation', () => {
  const line = rowLine(
    spec('wear'),
    reading({
      lastWrites: { wearSessions: TODAY - 400 },
      states: { wearSessions: finished(TODAY - 300) }
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
  assert.equal(rowHidden(spec('wear'), { wearSessions: hidden }), true);
  assert.equal(rowHidden(spec('wear'), {}), false);
});

test('a row fronting two sections goes only when both are hidden', () => {
  assert.equal(rowHidden(spec('effects'), { personalEffects: hidden }), false);
  assert.equal(rowHidden(spec('effects'), { personalEffects: hidden, sideEffects: hidden }), true);
});

test('a row that fronts no area is a screen, and nothing hides it', () => {
  assert.equal(rowHidden(spec('care'), { personalEffects: hidden, sideEffects: hidden }), false);
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
    ['health', 'body', 'transition', 'support', 'media']
  );
});

test('a hosted row states the day its area ended, since the hub no longer can', () => {
  /* `HostedRows.svelte` calls `rowLine` with an empty `lastWrites`, which is
     what this passes too: finished and suspended are settled before the
     reading is consulted, so a hosted row shows an ending and otherwise its
     standing line. A reading would cost every host screen the hub's own
     assembled last-write call for a date the next screen opens on. */
  const noReads = { todayEpochDay: TODAY, lastWrites: {}, states: {}, forward: {} };

  assert.deepEqual(
    rowLine(spec('effects'), {
      ...noReads,
      states: { personalEffects: finished(TODAY - 90), sideEffects: finished(TODAY - 90) }
    }),
    { kind: 'finished', epochDay: TODAY - 90 }
  );
  assert.deepEqual(
    rowLine(spec('effects'), {
      ...noReads,
      states: { personalEffects: suspended(TODAY - 5), sideEffects: suspended(TODAY - 5) }
    }),
    { kind: 'suspended', epochDay: TODAY - 5 }
  );
  assert.equal(rowLine(spec('dilation'), noReads).kind, 'not-yet');
});

test('a finished row leaves its group for the finished set, and the set comes last', () => {
  const sections = hubSections(reading({ states: { wearSessions: finished(TODAY - 90) } }));

  assert.equal(sections.at(-1)?.key, 'finished');
  assert.deepEqual(
    sections.at(-1)?.rows.map((row) => row.spec.key),
    ['wear']
  );
  const transition = sections.find((section) => section.key === 'body');
  assert.ok(!transition?.rows.some((row) => row.spec.key === 'wear'), 'the row is in two places at once');
});

test('a suspended row stays under its own group, unlike a finished one - it is not done', () => {
  const sections = hubSections(reading({ states: { hairRemovalSessions: suspended(TODAY - 30) } }));

  assert.ok(
    !sections.some((section) => section.key === 'finished'),
    'nothing is finished, so there is no finished set at all'
  );
  const transition = sections.find((section) => section.key === 'body');
  assert.ok(transition?.rows.some((row) => row.spec.key === 'hair-removal'), 'the suspended row left its own group');
});

test('a finished row keeps its icon and its screen', () => {
  const sections = hubSections(reading({ states: { wearSessions: finished(TODAY - 90) } }));
  const row = sections.at(-1)?.rows[0];

  assert.equal(row?.spec.icon, 'watch');
  assert.equal(row?.spec.href, '/body/wear');
});

test('a hidden area is absent from the assembled hub rather than moved', () => {
  const sections = hubSections(reading({ states: { wearSessions: hidden } }));
  const keys = sections.flatMap((section) => section.rows.map((row) => row.spec.key));

  assert.ok(!keys.includes('wear'));
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

test('every group is in the order Alicja set in pre-release-human 12', () => {
  const sections = hubSections(reading());
  const group = (key: string) =>
    sections.find((section) => section.key === key)?.rows.map((row) => row.spec.key) ?? [];

  // Body came back in pre-release-human 12 to even out a seven-row Steps.
  assert.deepEqual(group('health'), ['care', 'cycle-events', 'appointments', 'surgery', 'dilation']);
  assert.deepEqual(group('body'), ['progress-photos', 'effects', 'hair-removal', 'wear', 'voice-benchmark']);
  assert.deepEqual(group('transition'), ['roadmap', 'milestones', 'tryouts']);
  assert.deepEqual(group('support'), ['letters', 'doubt', 'resources']);
  assert.deepEqual(group('media'), ['photos', 'recordings', 'documents']);
});

/* Ticket 15's search half. The words are paraglide's, so the matcher is
   handed the titles to match against rather than resolving them - the shape
   `tagIdsMatching` already uses for the same reason (searchQuery.ts). A
   made-up title per key here, so these tests hold the matching rule and not
   the catalogue. */
const TITLES: Record<string, string> = {
  effects: 'Changes you noticed',
  'hair-removal': 'Usuwanie włosów',
  wear: 'Wear log',
  photos: 'Progress photos',
  dilation: 'Dilation'
};
const titleOf = (key: string): string => TITLES[key] ?? key;

test('an empty query matches nothing, since the grouped list is what an empty box shows', () => {
  assert.deepEqual(hubRowsMatching(reading(), '', titleOf), []);
  assert.deepEqual(hubRowsMatching(reading(), '   ', titleOf), []);
});

test('a query matches an area by part of its name, whatever the case', () => {
  const rows = hubRowsMatching(reading(), 'CHANGES YOU', titleOf);

  assert.deepEqual(
    rows.map((row) => row.spec.key),
    ['effects']
  );
});

test('a query matches a Polish name typed without its diacritics, both sides folded', () => {
  const rows = hubRowsMatching(reading(), 'wlosow', titleOf);

  assert.deepEqual(
    rows.map((row) => row.spec.key),
    ['hair-removal']
  );
});

test('matches come back in the order the groups draw them, flat', () => {
  const rows = hubRowsMatching(reading(), 'log', titleOf);

  assert.deepEqual(
    rows.map((row) => row.spec.key),
    ['wear']
  );
});

test('a row keeps the second line and the place the sections gave it, so a match reads as the row does', () => {
  const rows = hubRowsMatching(reading({ states: { wearSessions: finished(TODAY - 90) } }), 'wear', titleOf);

  assert.deepEqual(
    rows.map((row) => [row.where, row.line.kind]),
    [['finished', 'finished']]
  );
});

test('a match that has not ended names the group it belongs to', () => {
  const rows = hubRowsMatching(reading(), 'wear', titleOf);

  assert.deepEqual(
    rows.map((row) => row.where),
    ['body']
  );
});

test('a hidden module cannot be searched up, while dilation follows surgery visibility', () => {
  /* Effects fronts two sections. Hiding one keeps its row searchable. */
  assert.equal(hubRowsMatching(reading({ states: { personalEffects: hidden } }), 'changes you', titleOf).length, 1);
  assert.deepEqual(
    hubRowsMatching(reading({ states: { personalEffects: hidden, sideEffects: hidden } }), 'changes you', titleOf),
    []
  );
  /* taperSessions hidden is `dilationGated`'s signal: no eligible procedure. */
  assert.deepEqual(hubRowsMatching(reading({ states: { taperSessions: hidden } }), 'dilation', titleOf), []);
  assert.deepEqual(hubRowsMatching(reading({ states: { procedures: hidden } }), 'dilation', titleOf), []);
});

/* The six rows drawn on a screen of their own are still areas of the app,
   and this is the only index with a box to type in: a person looking for
   dilation looks for it here. Each says which screen hosts it rather than a
   group, since no group draws it. */
test('a row drawn on another screen is searchable, and names its host', () => {
  const rows = hubRowsMatching(reading(), 'dilation', titleOf);

  assert.deepEqual(
    rows.map((row) => [row.spec.key, row.where, row.spec.href]),
    [['dilation', 'health', '/health/dilation']]
  );
});

test('a hosted row states the day its area ended, like any other match', () => {
  const rows = hubRowsMatching(reading({ states: { taperSessions: finished(TODAY - 10) } }), 'dilation', titleOf);

  assert.deepEqual(
    rows.map((row) => [row.where, row.line.kind]),
    [['finished', 'finished']]
  );
});

/* ADR-0043 through the hub and the box: the cycle row exists only where a
   screen has said cycle tracking is visible, and a search cannot type it
   into being either. */
test('the cycle row is on the hub and in search only while cycle tracking is visible', () => {
  const titles = (key: string): string => (key === 'cycle-events' ? 'Cycle events' : titleOf(key));
  const onHub = (over: Partial<HubReading>) =>
    hubSections(reading(over)).flatMap((section) => section.rows.map((row) => row.spec.key));

  for (const closed of [{ cycleVisible: false }, { cycleVisible: undefined }]) {
    assert.ok(!onHub(closed).includes('cycle-events'));
    assert.deepEqual(hubRowsMatching(reading(closed), 'cycle', titles), []);
    assert.deepEqual(hubRowsMatching(reading(closed), 'Cycle events', titles), []);
  }

  assert.ok(onHub({ cycleVisible: true }).includes('cycle-events'));
  assert.deepEqual(
    hubRowsMatching(reading({ cycleVisible: true }), 'cycle', titles).map((row) => [row.spec.key, row.where]),
    [['cycle-events', 'health']]
  );
});

test('the dilation row is on the hub and in search only once a procedure can carry it', () => {
  /* The screens build the area record through `dilationGated`, which hides
     `taperSessions` until then; this holds what the hub does with that. */
  const gated = { taperSessions: hidden };
  const onHub = (over: Partial<HubReading>) =>
    hubSections(reading(over)).flatMap((section) => section.rows.map((row) => row.spec.key));

  assert.ok(!onHub({ states: gated }).includes('dilation'));
  assert.deepEqual(hubRowsMatching(reading({ states: gated }), 'dilation', titleOf), []);
  assert.ok(onHub({ states: {} }).includes('dilation'));
  assert.deepEqual(
    hubRowsMatching(reading({ states: {} }), 'dilation', titleOf).map((row) => row.spec.key),
    ['dilation']
  );
});

test('a query nothing is called matches nothing', () => {
  assert.deepEqual(hubRowsMatching(reading(), 'zzzz', titleOf), []);
});
