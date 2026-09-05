/* What Home's grid holds, in what order, and what each tile says (phase 8
   deepening ticket 07).

   The rule this replaces was `tests/home-surfaces.test.ts:124`, which pinned
   the tiles' gating by matching the route's source for the text of five
   `$derived` lines. That passes on a broken screen that keeps the strings
   and fails on a correct move that does not, which is what this ticket is.
   So everything here goes through `composeHomeTiles` instead.

   One fixture qualifies all eleven at once, and each test switches off the
   one thing it is about. That is the shape the ordering and the absence of a
   cap need - both are claims about eleven tiles together - and it also means
   a tile that silently stops qualifying breaks every test rather than one. */

import { describe, expect, it, vi } from 'vitest';
import { m } from '../paraglide/messages';
import { startOfDayTimestamp } from './epochDay';
import { SURFACE_ROWS, UNPROMPTED_KINDS } from '../unprompted/registry';
import type { AreaStates } from './areaState';
import {
  HOME_TILE_CAP,
  LIVE_TILE_ORDER,
  LIVE_TILE_PREF_KEY,
  LIVE_TILE_TIER,
  composeHomeTiles,
  liveTilePrefKeys,
  splitHomeTiles,
  type HomeTileActions,
  type HomeTileFormat,
  type HomeTileReads,
  type HomeTilesInput,
  type LiveTileKind
} from './liveTiles';
import type { LetterSeal } from './journal/letters';
import type {
  DoseSchedule,
  HairRemovalSession,
  Revisit,
  Procedure,
  RegimenEpisode,
  Tryout,
  WearSession
} from './types';

const TODAY = 20_000;
/* Midday, so a timezone that moves the day boundary cannot move which day
   the dose panel thinks it is. */
const NOW = startOfDayTimestamp(TODAY) + 12 * 3600_000;
/* 1h 2m 3s of wear, which reads back as three distinct numbers. */
const WEAR_ELAPSED_MS = 3_723_000;

const wearSession: WearSession = {
  id: 'wear-1',
  kind: 'binder',
  startTimestamp: NOW - WEAR_ELAPSED_MS,
  durationMs: null,
  note: null
};

/* Every three days from fifteen days ago lands on today, and nothing is
   logged, which is what the patch tile is for. */
const episode: RegimenEpisode = {
  id: 'ep-1',
  drug: 'Estradiol patch',
  ester: null,
  dose: 100,
  doseUnit: 'mcg',
  route: 'patch',
  interval: '3.5 days',
  startEpochDay: TODAY - 15,
  endEpochDay: null,
  endReason: null
};

const schedule: DoseSchedule = {
  id: 'sched-1',
  episodeId: 'ep-1',
  recurrence: { kind: 'everyNDays', everyNDays: 3 },
  dosesPerDay: 1,
  doseAmounts: null
};

const procedure: Procedure = {
  id: 'proc-1',
  name: 'Vaginoplasty',
  surgeryEpochDay: TODAY + 10,
  consults: [],
  notes: ''
};

const letters: LetterSeal[] = [
  { id: 'letter-1', epochDay: TODAY - 40, unlockEpochDay: TODAY - 2 },
  { id: 'letter-2', epochDay: TODAY - 30, unlockEpochDay: TODAY - 1 }
];

const dueRevisits: Revisit[] = [
  { id: 'revisit-1', entryId: 101, entryEpochDay: TODAY - 60, createdEpochDay: TODAY - 61, targetEpochDay: TODAY }
];

const tryout: Tryout = {
  id: 'tryout-1',
  kind: 'name',
  label: 'Alicja',
  description: null,
  startEpochDay: TODAY - 10,
  endEpochDay: null
};

const hairRemovalSession: HairRemovalSession = {
  id: 'hr-1',
  epochDay: TODAY,
  area: 'upper_lip',
  method: 'laser',
  painRating: 3,
  cost: '',
  provider: ''
};

const allOn = <T>(value: T): Record<LiveTileKind, T> =>
  Object.fromEntries(LIVE_TILE_ORDER.map((kind) => [kind, value])) as Record<LiveTileKind, T>;

/* Node has no MouseEvent, and no tile handler reads anything off one beyond
   the two calls every in-place control makes. */
const CLICK = { stopPropagation() {}, preventDefault() {} } as unknown as MouseEvent;

interface Overrides {
  todayEpochDay?: number;
  nowMs?: number;
  enabled?: Record<LiveTileKind, boolean>;
  snoozed?: Record<LiveTileKind, boolean>;
  areaStates?: AreaStates;
  reads?: Partial<HomeTileReads>;
  actions?: Partial<HomeTileActions>;
  format?: Partial<HomeTileFormat>;
}

function input(overrides: Overrides = {}): HomeTilesInput {
  const base: HomeTilesInput = {
    todayEpochDay: TODAY,
    nowMs: NOW,
    enabled: allOn(true),
    snoozed: allOn(false),
    areaStates: {},
    reads: {
      wearDurationCue: true,
      runningWear: wearSession,
      episodes: [episode],
      procedures: [procedure],
      letters,
      dueRevisits,
      latestBadEntryId: 42,
      safeSpaceDismissedEntryId: null,
      tryouts: [tryout],
      latestFeltSenseByTryoutId: new Map(),
      schedules: [schedule],
      dosePauses: [],
      todayDoses: [],
      latestBenchmarkEpochDay: TODAY - 20,
      journalingPauses: [{ id: 'pause-1', startEpochDay: TODAY - 2, endEpochDay: TODAY + 2 }],
      latestHairRemovalSession: hairRemovalSession,
      measurements: { count: 3, latestDay: TODAY - 40 }
    },
    actions: {
      stopWear: vi.fn(),
      dismissSafeSpace: vi.fn(),
      openLetterDismiss: vi.fn(),
      dismissRevisit: vi.fn(),
      resumePause: vi.fn(),
      snooze: vi.fn()
    },
    format: {
      /* Deliberately not the app's formats: what is under test is that each
         tile asks for the right one about the right day, which a real date
         string would hide behind a locale. */
      fullDay: (epochDay) => `full:${epochDay}`,
      shortDay: (epochDay) => `short:${epochDay}`,
      time: (timestamp) => `time:${timestamp}`,
      hairRemovalArea: (area) => `area:${area}`
    }
  };
  return {
    ...base,
    ...overrides,
    reads: { ...base.reads, ...overrides.reads },
    actions: { ...base.actions, ...overrides.actions },
    format: { ...base.format, ...overrides.format }
  };
}

const keysOf = (overrides?: Overrides) => composeHomeTiles(input(overrides)).map((t) => t.key);
const tileNamed = (kind: LiveTileKind, overrides?: Overrides) =>
  composeHomeTiles(input(overrides)).find((t) => t.key === kind);
const ORDER: LiveTileKind[] = [...LIVE_TILE_ORDER];
/** The order the grid actually comes out in: tier first, LIVE_TILE_ORDER
    inside a tier (phase 8 UX ticket 01). Written out rather than derived
    from `LIVE_TILE_TIER`, which is the thing under test. */
const TIERED: LiveTileKind[] = [
  // Bound to today.
  'wear-timer',
  'patch-schedule-tile',
  'hair-removal-recovery',
  // A moment.
  'dose-panel',
  'surgery-countdown',
  'safe-space-nudge',
  'ready-letter',
  'revisit',
  'pause-active-banner',
  // Dormant.
  'active-tryout-tile',
  'voice-benchmark-nudge',
  'measurements-nudge'
];

describe('which kinds the grid is for', () => {
  it('draws the eleven live tiles and none of the registry\'s other seven', () => {
    /* The narrowing is the point: `UnpromptedKind` has eighteen members and
       seven of them are a notice, a look-back card or a notification, so an
       ordering keyed off the whole union would demand an entry for
       `export-failure`. */
    expect([...LIVE_TILE_ORDER].sort()).toEqual(
      [
        'active-tryout-tile',
        'dose-panel',
        'hair-removal-recovery',
        'measurements-nudge',
        'patch-schedule-tile',
        'pause-active-banner',
        'ready-letter',
        'revisit',
        'safe-space-nudge',
        'surgery-countdown',
        'voice-benchmark-nudge',
        'wear-timer'
      ].sort()
    );
    for (const kind of LIVE_TILE_ORDER) expect(UNPROMPTED_KINDS).toContain(kind);
    for (const notATile of ['stock-notice', 'wrapped', 'on-this-day', 'reminders', 'check-in', 'wear-elapsed', 'export-failure']) {
      expect(LIVE_TILE_ORDER as readonly string[]).not.toContain(notATile);
    }
  });

  it('takes each tile\'s preference from the registry that declares it', () => {
    for (const kind of LIVE_TILE_ORDER) {
      const row = SURFACE_ROWS.find((r) => r.key === kind);
      expect(row, `${kind} has a surfaces row`).toBeDefined();
      expect(LIVE_TILE_PREF_KEY[kind]).toBe(row!.surface.prefKey);
    }
  });

  it('refuses a registry that has stopped declaring one of them', () => {
    /* The rule run over a shortened registry rather than asserted never to
       fail on the real one: filtering a row out and then checking it is
       absent would restate `filter`. */
    const withoutMeasurements = SURFACE_ROWS.filter((row) => row.key !== 'measurements-nudge');
    expect(() => liveTilePrefKeys(withoutMeasurements)).toThrow(/measurements-nudge/);
  });
});

describe('the tier every kind is in', () => {
  /* Phase 8 UX ticket 01. The tier is the policy: it decides the order, and
     Home draws it as three weights so the difference is legible without
     reading either tile. */

  it('puts every kind in one of the three bands, and these are the bands', () => {
    const byTier = { today: [] as string[], moment: [] as string[], dormant: [] as string[] };
    for (const kind of LIVE_TILE_ORDER) byTier[LIVE_TILE_TIER[kind]].push(kind);

    expect(byTier.today).toEqual(['wear-timer', 'patch-schedule-tile', 'hair-removal-recovery']);
    expect(byTier.moment).toEqual([
      'dose-panel',
      'surgery-countdown',
      'safe-space-nudge',
      'ready-letter',
      'revisit',
      'pause-active-banner'
    ]);
    expect(byTier.dormant).toEqual([
      'active-tryout-tile',
      'voice-benchmark-nudge',
      'measurements-nudge'
    ]);
  });

  it('carries the tier on the tile, which is what Home draws the weight from', () => {
    for (const tile of composeHomeTiles(input())) expect(tile.tier).toBe(LIVE_TILE_TIER[tile.key]);
  });
});

describe('the order, and the cap', () => {
  it('orders by tier first, and by LIVE_TILE_ORDER inside a tier', () => {
    expect(keysOf()).toEqual(TIERED);
  });

  it('keeps the order when the ones before a tile drop out', () => {
    /* Order is the policy\'s, not the reads\': with the first six of the
       tiered order gone the remaining six come out in the same relative
       order. */
    const enabled = allOn(true);
    for (const kind of TIERED.slice(0, 6)) enabled[kind] = false;
    expect(keysOf({ enabled })).toEqual(TIERED.slice(6));
  });

  it('shows three and folds the rest, in place, with nothing dropped', () => {
    const tiles = composeHomeTiles(input());
    const { shown, folded } = splitHomeTiles(tiles);

    expect(shown.map((t) => t.key)).toEqual(TIERED.slice(0, HOME_TILE_CAP));
    expect(folded.map((t) => t.key)).toEqual(TIERED.slice(HOME_TILE_CAP));
    expect([...shown, ...folded]).toEqual(tiles);
  });

  it('folds nothing while the cap is not reached', () => {
    const enabled = allOn(false);
    for (const kind of ['revisit', 'measurements-nudge'] as const) enabled[kind] = true;
    const { shown, folded } = splitHomeTiles(composeHomeTiles(input({ enabled })));

    expect(shown.map((t) => t.key)).toEqual(['revisit', 'measurements-nudge']);
    expect(folded).toEqual([]);
  });

  it('folds nothing at exactly the cap, so three never becomes two and a row', () => {
    const enabled = allOn(false);
    for (const kind of ['wear-timer', 'revisit', 'measurements-nudge'] as const) enabled[kind] = true;
    const { shown, folded } = splitHomeTiles(composeHomeTiles(input({ enabled })));

    expect(shown).toHaveLength(HOME_TILE_CAP);
    expect(folded).toEqual([]);
  });
});

describe('the gate every tile answers to', () => {
  it.each(ORDER)('drops %s when its own preference is off, and nothing else', (kind) => {
    const enabled = allOn(true);
    enabled[kind] = false;
    expect(keysOf({ enabled })).toEqual(TIERED.filter((k) => k !== kind));
  });

  it.each(ORDER)('drops %s while it is snoozed, and nothing else', (kind) => {
    const snoozed = allOn(false);
    snoozed[kind] = true;
    expect(keysOf({ snoozed })).toEqual(TIERED.filter((k) => k !== kind));
  });

  it('draws nothing at all with every preference off', () => {
    expect(keysOf({ enabled: allOn(false) })).toEqual([]);
  });
});

describe('what each tile says', () => {
  it('the wear timer counts the running session and offers to stop it', () => {
    const tile = tileNamed('wear-timer')!;
    expect(tile.tileKey).toBe('wear-timer');
    expect(tile.attrs).toEqual({ 'data-wear-running-tile': true });
    expect(tile.href).toBe('/practice/wear');
    // 1h 2m 3s, off the one clock the whole grid reads.
    expect(tile.value).toBe(m.wear_session_duration_hms({ hours: '1', minutes: '2', seconds: '3' }));
    expect(tile.note).toBe(m.wear_session_running_since({ time: `time:${wearSession.startTimestamp}` }));
    expect(tile.action?.attrs).toEqual({ 'data-wear-stop': '' });
    expect(tile.dismiss).toBeUndefined();
    // Named by the kind, not by "wear" (ticket 50).
    expect(tile.title).toBe(m.tile_wear_title_binder());
  });

  /* The duration cue (ticket 50, ADR-0064). Nine hours in, which is past
     the eight-hour figure the binder rule reads. */
  const NINE_HOURS_IN = { nowMs: wearSession.startTimestamp + 9 * 3600_000 };

  it('a binder session past eight hours picks the cue up on the tile', () => {
    const tile = tileNamed('wear-timer', NINE_HOURS_IN)!;
    expect(tile.attrs).toEqual({ 'data-wear-running-tile': true, 'data-wear-duration-cue': true });
    // The cue takes the note's line, and says the figure is not clinical.
    expect(tile.note).toBe(m.wear_session_cue());
  });

  it('no cue fires for a tucking or compression session, however long it runs', () => {
    for (const kind of ['tucking', 'compression'] as const) {
      const tile = tileNamed('wear-timer', {
        ...NINE_HOURS_IN,
        reads: { runningWear: { ...wearSession, kind } }
      })!;
      expect(tile.attrs).toEqual({ 'data-wear-running-tile': true });
      expect(tile.title).toBe(kind === 'tucking' ? m.tile_wear_title_tucking() : m.tile_wear_title_compression());
    }
  });

  it('the cue preference silences the marker without hiding the tile', () => {
    const tile = tileNamed('wear-timer', { ...NINE_HOURS_IN, reads: { wearDurationCue: false } })!;
    expect(tile.attrs).toEqual({ 'data-wear-running-tile': true });
    expect(tile.note).toBe(m.wear_session_running_since({ time: `time:${wearSession.startTimestamp}` }));
  });

  it('the dose panel names the active episode and links the log sheet', () => {
    const tile = tileNamed('dose-panel')!;
    expect(tile.tileKey).toBe('dose-panel');
    expect(tile.attrs).toEqual({ 'data-dose-panel-tile': true });
    expect(tile.value).toBe('Estradiol patch');
    expect(tile.note).toBeUndefined();
    expect(tile.href).toBe('/doses');
    expect(tile.action?.href).toBe('/doses?add=1');
  });

  it('the surgery countdown reads the nearest procedure and carries no control', () => {
    const tile = tileNamed('surgery-countdown')!;
    expect(tile.tileKey).toBe('surgery-countdown');
    expect(tile.attrs).toEqual({ 'data-surgery-tile': true });
    expect(tile.value).toBe(m.surgery_day_upcoming({ days: m.n_days({ n: 10 }) }));
    expect(tile.note).toBe('Vaginoplasty');
    expect(tile.href).toBe('/health/surgery');
    expect(tile.action).toBeUndefined();
    expect(tile.dismiss).toBeUndefined();
  });

  it('the safe space nudge dismisses the entry it is about', () => {
    const actions = { dismissSafeSpace: vi.fn() };
    const tile = tileNamed('safe-space-nudge', { actions })!;
    expect(tile.tileKey).toBe('safe-space-nudge');
    expect(tile.attrs).toEqual({ 'data-safe-space-nudge-tile': true });
    expect(tile.href).toBe('/doubt');
    tile.action!.onclick!(CLICK);
    expect(actions.dismissSafeSpace).toHaveBeenCalledWith(42);
  });

  it('the safe space nudge goes when the entry it names has been dismissed', () => {
    expect(tileNamed('safe-space-nudge', { reads: { safeSpaceDismissedEntryId: 42 } })).toBeUndefined();
  });

  it('the ready letter names the oldest unread one and counts the rest', () => {
    const actions = { openLetterDismiss: vi.fn() };
    const tile = tileNamed('ready-letter', { actions })!;
    expect(tile.tileKey).toBe('ready-letter');
    expect(tile.attrs).toEqual({ 'data-letter-tile': true });
    expect(tile.href).toBe('/transition/letters?read=letter-1');
    expect(tile.value).toBe(`full:${TODAY - 40}`);
    // Two unread, so the note counts the other one.
    expect(tile.note).toBe(m.tile_letter_more({ count: '1' }));
    // Its dismiss is a sheet on Home rather than a snooze in place.
    tile.action!.onclick!(CLICK);
    expect(actions.openLetterDismiss).toHaveBeenCalled();
    expect(tile.dismiss).toBeUndefined();
  });

  it('the revisit tile names the entry due and deletes the row on dismiss', () => {
    const actions = { dismissRevisit: vi.fn() };
    const tile = tileNamed('revisit', { actions })!;
    expect(tile.tileKey).toBe('revisit');
    expect(tile.attrs).toEqual({ 'data-revisit-tile': true });
    expect(tile.href).toBe('/entry/101');
    expect(tile.value).toBe(`full:${TODAY - 60}`);
    // One due revisit, so the note names it rather than counting others.
    expect(tile.note).toBe(m.tile_revisit_single_note());
    tile.action!.onclick!(CLICK);
    expect(actions.dismissRevisit).toHaveBeenCalledWith('revisit-1');
    expect(tile.dismiss).toBeUndefined();
  });

  it('the revisit tile counts the rest when more than one is due', () => {
    const tile = tileNamed('revisit', {
      reads: {
        dueRevisits: [
          ...dueRevisits,
          { id: 'revisit-2', entryId: 102, entryEpochDay: TODAY - 5, createdEpochDay: TODAY - 6, targetEpochDay: TODAY }
        ]
      }
    })!;
    expect(tile.note).toBe(m.tile_revisit_more({ count: '1' }));
  });

  it('the revisit tile is absent with nothing due', () => {
    expect(tileNamed('revisit', { reads: { dueRevisits: [] } })).toBeUndefined();
  });

  it('the active tryout offers a felt-sense entry against the tryout it names', () => {
    const tile = tileNamed('active-tryout-tile')!;
    expect(tile.tileKey).toBe('active-tryout');
    expect(tile.attrs).toEqual({ 'data-active-tryout-tile': true });
    expect(tile.value).toBe('Alicja');
    expect(tile.note).toBe(m.tile_active_tryout_note({ days: '10' }));
    expect(tile.href).toBe('/transition/tryouts/tryout-1');
    expect(tile.action?.href).toBe('/transition/tryouts/tryout-1?feltSense=1');
  });

  it('the patch schedule names the dose that is due', () => {
    const tile = tileNamed('patch-schedule-tile')!;
    expect(tile.tileKey).toBe('patch-schedule');
    expect(tile.attrs).toEqual({ 'data-patch-schedule-tile': true });
    expect(tile.value).toBe('Estradiol patch');
    expect(tile.note).toBe('100 mcg · patch');
    expect(tile.action?.href).toBe('/doses?add=1');
  });

  it('the voice benchmark nudge counts the days and links the recorder', () => {
    const tile = tileNamed('voice-benchmark-nudge')!;
    expect(tile.tileKey).toBe('voice-benchmark');
    expect(tile.attrs).toEqual({ 'data-voice-benchmark-tile': true });
    expect(tile.note).toBe(m.tile_voice_benchmark_days_ago({ days: '20' }));
    expect(tile.href).toBe('/practice/voice?tab=compare');
    expect(tile.action?.href).toBe('/practice/voice?tab=record');
  });

  it('the pause banner says when the pause ends and offers to resume it', () => {
    const actions = { resumePause: vi.fn() };
    const tile = tileNamed('pause-active-banner', { actions })!;
    expect(tile.tileKey).toBe('pause-active');
    expect(tile.attrs).toEqual({ 'data-pause-active-tile': true });
    expect(tile.note).toBe(m.tile_pause_until_date({ date: `short:${TODAY + 2}` }));
    expect(tile.href).toBe('/settings/journaling-pause');
    tile.action!.onclick!(CLICK);
    expect(actions.resumePause).toHaveBeenCalledWith('pause-1', TODAY - 2);
  });

  it('the pause banner says so when the pause has no end', () => {
    const tile = tileNamed('pause-active-banner', {
      reads: { journalingPauses: [{ id: 'pause-1', startEpochDay: TODAY - 2, endEpochDay: null }] }
    })!;
    expect(tile.note).toBe(m.tile_pause_ongoing());
  });

  it('the hair removal tile names the area and carries no action', () => {
    const tile = tileNamed('hair-removal-recovery')!;
    expect(tile.tileKey).toBe('hair-removal-recovery');
    expect(tile.attrs).toEqual({ 'data-hair-removal-tile': true });
    expect(tile.value).toBe('area:upper_lip');
    expect(tile.href).toBe('/body/hair-removal');
    expect(tile.action).toBeUndefined();
    expect(tile.dismiss).toBeDefined();
  });

  it('the measurements nudge counts the days since the last one', () => {
    const tile = tileNamed('measurements-nudge')!;
    expect(tile.tileKey).toBe('measurements-nudge');
    expect(tile.attrs).toEqual({ 'data-measurements-tile': true });
    expect(tile.note).toBe(m.tile_measurements_note({ days: '40' }));
    expect(tile.href).toBe('/body/measurements');
    expect(tile.action?.href).toBe('/body/measurements');
  });
});

describe('the dismiss controls', () => {
  const SNOOZABLE = [
    'active-tryout-tile',
    'patch-schedule-tile',
    'voice-benchmark-nudge',
    'pause-active-banner',
    'hair-removal-recovery',
    'measurements-nudge'
  ] as const;

  it.each(SNOOZABLE)('%s snoozes itself and no other kind', (kind) => {
    const snooze = vi.fn();
    const tile = tileNamed(kind, { actions: { snooze } })!;
    tile.dismiss!.onclick(CLICK);
    expect(snooze).toHaveBeenCalledWith(kind);
  });

  it('gives no dismiss to the six that never had one', () => {
    /* Wear, dose, surgery, safe space, the ready letter and revisit each
       resolve themselves - a running session cannot be hidden while it runs
       (ADR-0039's amendment), the letter's dismiss opens a sheet, and a
       revisit's own action deletes the row outright rather than snoozing
       it. */
    for (const kind of [
      'wear-timer',
      'dose-panel',
      'surgery-countdown',
      'safe-space-nudge',
      'ready-letter',
      'revisit'
    ] as const) {
      expect(tileNamed(kind)!.dismiss).toBeUndefined();
    }
  });

  it('stops the session the wear tile is showing', () => {
    const stopWear = vi.fn();
    const tile = tileNamed('wear-timer', { actions: { stopWear } })!;
    tile.action!.onclick!(CLICK);
    expect(stopWear).toHaveBeenCalledWith(wearSession);
  });

  /* Phase 8 features ticket 04: the cascade. One decision takes every tile
     an area owns off the grid, and touches no other tile. */

  it('takes an area\'s tiles off the grid once it is finished', () => {
    const areaStates: AreaStates = { wearSessions: { hidden: false, finishedEpochDay: TODAY - 1, suspendedEpochDay: null } };

    expect(tileNamed('wear-timer', { areaStates })).toBeUndefined();
    expect(tileNamed('measurements-nudge', { areaStates })).toBeDefined();
  });

  it('takes them off while it is hidden too, and puts them back when it is not', () => {
    const hidden: AreaStates = { measurements: { hidden: true, finishedEpochDay: null, suspendedEpochDay: null } };

    expect(tileNamed('measurements-nudge', { areaStates: hidden })).toBeUndefined();
    expect(tileNamed('measurements-nudge', { areaStates: {} })).toBeDefined();
  });

  it('leaves a finish day that has not arrived alone', () => {
    const later: AreaStates = { wearSessions: { hidden: false, finishedEpochDay: TODAY + 1, suspendedEpochDay: null } };

    expect(tileNamed('wear-timer', { areaStates: later })).toBeDefined();
  });
});
