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
import {
  LIVE_TILE_ORDER,
  LIVE_TILE_PREF_KEY,
  composeHomeTiles,
  liveTilePrefKeys,
  type HomeTileActions,
  type HomeTileFormat,
  type HomeTileReads,
  type HomeTilesInput,
  type LiveTileKind
} from './liveTiles';
import type {
  DoseSchedule,
  HairRemovalSession,
  Letter,
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
  endEpochDay: null
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

const letters: Letter[] = [
  { id: 'letter-1', epochDay: TODAY - 40, text: 'hello', unlockEpochDay: TODAY - 2 },
  { id: 'letter-2', epochDay: TODAY - 30, text: 'again', unlockEpochDay: TODAY - 1 }
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
    reads: {
      runningWear: wearSession,
      episodes: [episode],
      procedures: [procedure],
      letters,
      latestBadEntryId: 42,
      safeSpaceDismissedEntryId: null,
      tryouts: [tryout],
      latestFeltSenseByTryoutId: new Map(),
      schedules: [schedule],
      dosePauses: [],
      todayDoses: [],
      voiceBenchmarks: [{ epochDay: TODAY - 20 }],
      journalingPauses: [{ id: 'pause-1', startEpochDay: TODAY - 2, endEpochDay: TODAY + 2 }],
      hairRemovalSessions: [hairRemovalSession],
      measurements: { count: 3, latestDay: TODAY - 40 }
    },
    actions: {
      stopWear: vi.fn(),
      dismissSafeSpace: vi.fn(),
      openLetterDismiss: vi.fn(),
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

describe('the order, and the absence of a cap', () => {
  it('draws every qualifying tile in LIVE_TILE_ORDER', () => {
    expect(keysOf()).toEqual(ORDER);
  });

  it('caps nothing: eleven qualify and eleven are drawn', () => {
    const tiles = composeHomeTiles(input());
    expect(tiles).toHaveLength(11);
    expect(new Set(tiles.map((t) => t.key)).size).toBe(11);
  });

  it('keeps the order when the ones before a tile drop out', () => {
    /* Order is the list's, not the reads': with the first five gone the
       remaining six still come out in the same relative order. */
    const enabled = allOn(true);
    for (const kind of ['wear-timer', 'dose-panel', 'surgery-countdown', 'safe-space-nudge', 'ready-letter'] as const) {
      enabled[kind] = false;
    }
    expect(keysOf({ enabled })).toEqual([
      'active-tryout-tile',
      'patch-schedule-tile',
      'voice-benchmark-nudge',
      'pause-active-banner',
      'hair-removal-recovery',
      'measurements-nudge'
    ]);
  });
});

describe('the gate every tile answers to', () => {
  it.each(ORDER)('drops %s when its own preference is off, and nothing else', (kind) => {
    const enabled = allOn(true);
    enabled[kind] = false;
    expect(keysOf({ enabled })).toEqual(ORDER.filter((k) => k !== kind));
  });

  it.each(ORDER)('drops %s while it is snoozed, and nothing else', (kind) => {
    const snoozed = allOn(false);
    snoozed[kind] = true;
    expect(keysOf({ snoozed })).toEqual(ORDER.filter((k) => k !== kind));
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
    expect(tile.href).toBe('/settings/wear');
    // 1h 2m 3s, off the one clock the whole grid reads.
    expect(tile.value).toBe(m.wear_session_duration_hms({ hours: '1', minutes: '2', seconds: '3' }));
    expect(tile.note).toBe(m.wear_session_running_since({ time: `time:${wearSession.startTimestamp}` }));
    expect(tile.action?.attrs).toEqual({ 'data-wear-stop': '' });
    expect(tile.dismiss).toBeUndefined();
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
    expect(tile.href).toBe('/settings/surgery');
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
    expect(tile.href).toBe('/settings/letters?read=letter-1');
    expect(tile.value).toBe(`full:${TODAY - 40}`);
    // Two unread, so the note counts the other one.
    expect(tile.note).toBe(m.tile_letter_more({ count: '1' }));
    // Its dismiss is a sheet on Home rather than a snooze in place.
    tile.action!.onclick!(CLICK);
    expect(actions.openLetterDismiss).toHaveBeenCalled();
    expect(tile.dismiss).toBeUndefined();
  });

  it('the active tryout offers a felt-sense entry against the tryout it names', () => {
    const tile = tileNamed('active-tryout-tile')!;
    expect(tile.tileKey).toBe('active-tryout');
    expect(tile.attrs).toEqual({ 'data-active-tryout-tile': true });
    expect(tile.value).toBe('Alicja');
    expect(tile.note).toBe(m.tile_active_tryout_note({ days: '10' }));
    expect(tile.href).toBe('/settings/tryouts/tryout-1');
    expect(tile.action?.href).toBe('/settings/tryouts/tryout-1?feltSense=1');
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
    expect(tile.href).toBe('/settings/voice');
    expect(tile.action?.href).toBe('/settings/voice/record');
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
    expect(tile.href).toBe('/settings/hair-removal');
    expect(tile.action).toBeUndefined();
    expect(tile.dismiss).toBeDefined();
  });

  it('the measurements nudge counts the days since the last one', () => {
    const tile = tileNamed('measurements-nudge')!;
    expect(tile.tileKey).toBe('measurements-nudge');
    expect(tile.attrs).toEqual({ 'data-measurements-tile': true });
    expect(tile.note).toBe(m.tile_measurements_note({ days: '40' }));
    expect(tile.href).toBe('/settings/measurements');
    expect(tile.action?.href).toBe('/settings/measurements');
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

  it('gives no dismiss to the five that never had one', () => {
    /* Wear, dose, surgery, safe space and the ready letter each resolve
       themselves - a running session cannot be hidden while it runs
       (ADR-0039's amendment), and the letter's dismiss opens a sheet. */
    for (const kind of ['wear-timer', 'dose-panel', 'surgery-countdown', 'safe-space-nudge', 'ready-letter'] as const) {
      expect(tileNamed(kind)!.dismiss).toBeUndefined();
    }
  });

  it('stops the session the wear tile is showing', () => {
    const stopWear = vi.fn();
    const tile = tileNamed('wear-timer', { actions: { stopWear } })!;
    tile.action!.onclick!(CLICK);
    expect(stopWear).toHaveBeenCalledWith(wearSession);
  });
});
