/* What Home's grid holds, in what order, and what each tile says (phase 8
   deepening ticket 07).

   The rule this replaces was `tests/home-surfaces.test.ts:124`, which pinned
   the tiles' gating by matching the route's source for the text of five
   `$derived` lines. That passes on a broken screen that keeps the strings
   and fails on a correct move that does not, which is what this ticket is.
   So everything here goes through `composeHomeTiles` instead.

   One fixture qualifies all live tiles at once, and each test switches off the
   one thing it is about. That is the shape the ordering and the absence of a
   cap need - both are claims about all tiles together - and it also means
   a tile that silently stops qualifying breaks every test rather than one. */

import { describe, expect, it, vi } from 'vitest';
import { m } from '../paraglide/messages';
import { startOfDayTimestamp } from './epochDay';
import { SURFACE_ROWS, UNPROMPTED_KINDS } from '../unprompted/registry';
import type { AreaStates } from './areaState';
import {
  HOME_TILE_CAP,
  LIVE_TILE_DRAW_ORDER,
  LIVE_TILE_ORDER,
  LIVE_TILE_TIER,
  composeHomeTiles,
  isLiveTileKind,
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
  Procedure,
  RegimenEpisode,
  WearSession
} from './types';
import { NO_COST } from './cost';

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
   logged, so the dose panel has a dose due today to state. */
const episode: RegimenEpisode = {
  id: 'ep-1',
  drug: 'Estradiol patch',
  drugClass: 'hrt',
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
  doseAmounts: null,
  autoLogFromEpochDay: null
};

const procedure: Procedure = {
  id: 'proc-1',
  name: 'Vaginoplasty',
  surgeryEpochDay: TODAY - 10,
  consults: [],
  notes: '',
  kind: 'vaginoplasty',
  dilationOptIn: false,
  archived: false,
  cost: NO_COST
};

const letters: LetterSeal[] = [
  { id: 'letter-1', epochDay: TODAY - 40, unlockEpochDay: TODAY - 2 },
  { id: 'letter-2', epochDay: TODAY - 30, unlockEpochDay: TODAY - 1 }
];


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
      readLetterIds: [],
      latestBadEntryId: 42,
      safeSpaceDismissedEntryId: null,
      schedules: [schedule],
      dosePauses: [],
      scheduleDoses: [],
      yesterdayDoses: []
    },
    actions: {
      stopWear: vi.fn(),
      dismissSafeSpace: vi.fn(),
      openLetterDismiss: vi.fn()
    },
    format: {
      /* Deliberately not the app's formats: what is under test is that each
         tile asks for the right one about the right day, which a real date
         string would hide behind a locale. */
      fullDay: (epochDay) => `full:${epochDay}`,
      weekdayDay: (epochDay) => `weekday:${epochDay}`,
      time: (timestamp) => `time:${timestamp}`,
      doseRoute: (route) => `route:${route}`
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
  // A moment.
  'dose-panel',
  'surgery-countdown',
  'safe-space-nudge',
  'ready-letter'
];

describe('which kinds the grid is for', () => {
  it('draws only live tiles from the registry', () => {
    /* The narrowing is the point: `UnpromptedKind` has thirteen members and
       seven of them are a notice, a look-back card or a notification, so an
       ordering keyed off the whole union would demand an entry for
       `export-failure`. */
    expect([...LIVE_TILE_ORDER].sort()).toEqual(
      [
        'dose-panel',
        'ready-letter',
        'safe-space-nudge',
        'surgery-countdown',
        'wear-timer'
      ].sort()
    );
    for (const kind of LIVE_TILE_ORDER) expect(UNPROMPTED_KINDS).toContain(kind);
    for (const notATile of ['stock-notice', 'wrapped', 'on-this-day', 'reminders', 'check-in', 'wear-elapsed', 'export-failure']) {
      expect(LIVE_TILE_ORDER as readonly string[]).not.toContain(notATile);
    }
  });

  it('gives each tile a row in the registry, which is where its switch and default live', () => {
    for (const kind of LIVE_TILE_ORDER) {
      const row = SURFACE_ROWS.find((r) => r.key === kind);
      expect(row, `${kind} has a surfaces row`).toBeDefined();
      expect(typeof row!.surface.defaultOn).toBe('boolean');
    }
  });
});

describe('the tier every kind is in', () => {
  /* Phase 8 UX ticket 01. The tier is the policy: it decides the order, and
     Home draws it as three weights so the difference is legible without
     reading either tile. */

  it('puts every kind in one of the three bands, and these are the bands', () => {
    const byTier = { today: [] as string[], moment: [] as string[], dormant: [] as string[] };
    for (const kind of LIVE_TILE_ORDER) byTier[LIVE_TILE_TIER[kind]].push(kind);

    expect(byTier.today).toEqual(['wear-timer']);
    expect(byTier.moment).toEqual([
      'dose-panel',
      'surgery-countdown',
      'safe-space-nudge',
      'ready-letter'
    ]);
    expect(byTier.dormant).toEqual([]);
  });

  it('carries the tier on the tile, which is what Home draws the weight from', () => {
    /* Logged today, so no tile has risen out of its band. */
    const logged = [{ id: 1, timestamp: NOW, drug: 'Estradiol patch' }] as unknown as HomeTileReads['scheduleDoses'];
    for (const tile of composeHomeTiles(input({ reads: { scheduleDoses: logged } }))) {
      expect(tile.tier).toBe(LIVE_TILE_TIER[tile.key]);
    }
  });

  /* Functional-audit ticket 15: the patch-schedule tile was the `today`
     tile for a dose due now. Folded into the panel, the panel takes that
     band for that day and goes back to being a moment once it is logged. */
  it('lifts the dose panel to the today band on a day a dose is due, after the wear timer', () => {
    const due = composeHomeTiles(input());
    expect(due.filter((t) => t.tier === 'today').map((t) => t.key)).toEqual(['wear-timer', 'dose-panel']);
    const logged = [{ id: 1, timestamp: NOW, drug: 'Estradiol patch' }] as unknown as HomeTileReads['scheduleDoses'];
    expect(tileNamed('dose-panel', { reads: { scheduleDoses: logged } })!.tier).toBe('moment');
  });
});

describe('the order, and the cap', () => {
  it('orders by tier first, and by LIVE_TILE_ORDER inside a tier', () => {
    expect(keysOf()).toEqual(TIERED);
  });

  it('states that order once, for the grid and for the editor that arranges it', () => {
    /* Phase 11 ticket 04: Today's editor lists the switches in the order
       the grid draws them, and a second nested loop over the same two
       lists would be a copy of the order that nothing keeps in step. So
       `composeHomeTiles` and the editor read the same array, and this is
       what says the array is the tiered order rather than something that
       merely happens to agree with it today. */
    expect([...LIVE_TILE_DRAW_ORDER]).toEqual(TIERED);
  });

  it('knows a tile kind from the rest of the registry', () => {
    /* What the notifications screen filters its Home column by, so a kind
       the editor now arranges is not also switchable in Settings. */
    for (const kind of TIERED) expect(isLiveTileKind(kind)).toBe(true);
    for (const notATile of ['stock-notice', 'wrapped', 'on-this-day', 'reminders'] as const) {
      expect(isLiveTileKind(notATile)).toBe(false);
    }
  });

  it('keeps the order when the ones before a tile drop out', () => {
    /* Order is the policy\'s, not the reads\': with the first four of the
       tiered order gone the remaining four come out in the same relative
       order. */
    const enabled = allOn(true);
    for (const kind of TIERED.slice(0, 4)) enabled[kind] = false;
    expect(keysOf({ enabled })).toEqual(TIERED.slice(4));
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
    for (const kind of ['ready-letter', 'surgery-countdown'] as const) enabled[kind] = true;
    const { shown, folded } = splitHomeTiles(composeHomeTiles(input({ enabled })));

    expect(shown.map((t) => t.key)).toEqual(['surgery-countdown', 'ready-letter']);
    expect(folded).toEqual([]);
  });

  it('folds nothing at exactly the cap, so three never becomes two and a row', () => {
    const enabled = allOn(false);
    for (const kind of ['wear-timer', 'ready-letter', 'surgery-countdown'] as const) enabled[kind] = true;
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
    expect(tile.href).toBe('/body/wear');
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
    expect(tile.href).toBe('/care/doses');
    expect(tile.action?.href).toBe('/care/doses?add=1');
  });

  /* Phase 11 ticket 03: the panel is the dose's one home on Today, so it
     has to say when the next one falls - the agenda's doseSlot row is
     withheld while the panel is up (agendaReads.ts) and there is nowhere
     else on the screen the day is stated. The fixture's schedule falls
     every three days from fifteen days ago, which lands on today. */
  it('the dose panel says a dose the day expects is today, with how much and how', () => {
    /* What the patch-schedule tile used to say beside it (functional-audit
       ticket 15): the episode's amount, since the schedule sets none, and
       the route in words. */
    expect(tileNamed('dose-panel')!.note).toBe(
      m.tile_dose_today_detail({ dose: '100', unit: 'mcg', route: 'route:patch' })
    );
  });

  it('the dose panel takes a due day\'s amount from the schedule where it sets one', () => {
    const tile = tileNamed('dose-panel', {
      reads: { schedules: [{ ...schedule, doseAmounts: [{ dose: 50, doseUnit: 'mcg' }] }] },
      format: { number: (value) => `n${value}` }
    })!;
    expect(tile.note).toBe(m.tile_dose_today_detail({ dose: 'n50', unit: 'mcg', route: 'route:patch' }));
  });

  it('the dose panel names the next day once today has been logged', () => {
    const logged = [{ id: 1, timestamp: NOW, drug: 'Estradiol patch' }] as unknown as HomeTileReads['scheduleDoses'];
    const tile = tileNamed('dose-panel', { reads: { scheduleDoses: logged } })!;
    expect(tile.note).toBe(m.tile_dose_next({ date: `weekday:${TODAY + 3}` }));
  });

  it('the dose panel says yesterday\'s dose was logged for you, ahead of the next day', () => {
    /* Phase 11 ticket 11: on the morning after an auto-logged slot the fact
       worth reading is the row written without the person, not a date they
       can work out from their own schedule. */
    const written = [
      { id: 1, timestamp: NOW - 86_400_000, source: 'schedule', status: 'taken' }
    ] as unknown as HomeTileReads['yesterdayDoses'];
    expect(tileNamed('dose-panel', { reads: { yesterdayDoses: written } })!.note).toBe(
      m.tile_dose_auto_logged_yesterday()
    );
  });

  it('a dose the person logged yesterday themselves leaves the panel\'s forward line alone', () => {
    const byHand = [
      { id: 1, timestamp: NOW - 86_400_000, source: 'person', status: 'taken' }
    ] as unknown as HomeTileReads['yesterdayDoses'];
    expect(tileNamed('dose-panel', { reads: { yesterdayDoses: byHand } })!.note).toBe(
      m.tile_dose_today_detail({ dose: '100', unit: 'mcg', route: 'route:patch' })
    );
  });

  it('the dose panel skips a due day a pause covers', () => {
    /* What the patch tile's own test held before ticket 15 folded it in:
       a declared break is not a dose due. */
    const pause = { id: 'pause-1', episodeId: 'ep-1', startEpochDay: TODAY - 1, endEpochDay: TODAY + 1, reason: 'planned' } as const;
    expect(tileNamed('dose-panel', { reads: { dosePauses: [pause] } })!.note).toBe(
      m.tile_dose_next({ date: `weekday:${TODAY + 3}` })
    );
  });

  it('a regimen with no schedule gets a panel with no forward line', () => {
    expect(tileNamed('dose-panel', { reads: { schedules: [] } })!.note).toBeUndefined();
  });

  /* Functional-audit ticket 15. Today withholds the agenda's `doseSlot`
     rows whenever the panel is drawn (agendaReads.ts), so the panel names
     every regimen the agenda would have drawn a row for: the one whose next
     open slot comes first, and the others after it. A regimen taken daily
     draws no row (ADR-0067) and is not named beside one that does. */
  describe('which regimens the dose panel names', () => {
    const second: RegimenEpisode = { ...episode, id: 'ep-2', drug: 'Cyproterone', route: 'oral', startEpochDay: TODAY - 8 };
    const third: RegimenEpisode = { ...episode, id: 'ep-3', drug: 'Leuprorelin', route: 'im', startEpochDay: TODAY - 20 };
    const everyFor = (episodeId: string, everyNDays: number): DoseSchedule => ({
      id: `sched-${episodeId}`,
      episodeId,
      recurrence: { kind: 'everyNDays', everyNDays },
      dosesPerDay: 1,
      doseAmounts: null,
      autoLogFromEpochDay: null
    });
    const panel = (episodes: RegimenEpisode[], schedules: DoseSchedule[]) =>
      tileNamed('dose-panel', { reads: { episodes, schedules } })!;
    const dueToday = m.tile_dose_today_detail({ dose: '100', unit: 'mcg', route: 'route:patch' });

    it('names a regimen on a rhythm ahead of a daily one listed before it', () => {
      const tile = panel([second, episode], [everyFor('ep-2', 1), schedule]);
      expect(tile.value).toBe('Estradiol patch');
      expect(tile.note).toBe(dueToday);
    });

    it('leads with the regimen due first and names the other after it', () => {
      /* Leuprorelin every 28 days from twenty days ago falls in eight days;
         the patch falls today. */
      const tile = panel([third, episode], [everyFor('ep-3', 28), schedule]);
      expect(tile.value).toBe('Estradiol patch');
      expect(tile.note).toBe(`${dueToday} · ${m.tile_dose_also({ drugs: 'Leuprorelin' })}`);
    });

    it('names a regimen that starts inside the agenda\'s month, whose first dose the agenda would have drawn', () => {
      const starting = { ...third, startEpochDay: TODAY + 5 };
      const tile = panel([episode, starting], [schedule, everyFor('ep-3', 28)]);
      expect(tile.note).toBe(`${dueToday} · ${m.tile_dose_also({ drugs: 'Leuprorelin' })}`);
    });

    it('names only the first active episode when nothing runs on a rhythm', () => {
      const tile = panel([second, { ...episode, id: 'ep-4', drug: 'Spironolactone' }], [everyFor('ep-2', 1), everyFor('ep-4', 1)]);
      expect(tile.value).toBe('Cyproterone');
      expect(tile.note).toBe(m.tile_dose_today_detail({ dose: '100', unit: 'mcg', route: 'route:oral' }));
    });
  });

  it('the surgery tile says which day after surgery it is and carries no control', () => {
    const tile = tileNamed('surgery-countdown')!;
    expect(tile.tileKey).toBe('surgery-countdown');
    expect(tile.attrs).toEqual({ 'data-surgery-tile': true });
    expect(tile.value).toBe(m.tile_surgery_post_op_day({ days: '10' }));
    expect(tile.note).toBe('Vaginoplasty');
    expect(tile.href).toBe('/health/surgery');
    expect(tile.action).toBeUndefined();
    expect(tile.dismiss).toBeUndefined();
  });

  /* Functional-audit ticket 14: the agenda already states a surgery's date
     while it is ahead, so the tile counting down to it said the same thing
     twice. Only the days after it are the tile's. */
  it('the surgery tile is absent before the surgery day and on it', () => {
    for (const surgeryEpochDay of [TODAY + 10, TODAY + 1, TODAY]) {
      expect(tileNamed('surgery-countdown', { reads: { procedures: [{ ...procedure, surgeryEpochDay }] } })).toBeUndefined();
    }
    expect(tileNamed('surgery-countdown', { reads: { procedures: [{ ...procedure, surgeryEpochDay: null }] } })).toBeUndefined();
  });

  it('the surgery tile counts from the day after, and an upcoming one nearer today does not hide it', () => {
    const dayOne = tileNamed('surgery-countdown', { reads: { procedures: [{ ...procedure, surgeryEpochDay: TODAY - 1 }] } })!;
    expect(dayOne.value).toBe(m.tile_surgery_post_op_day({ days: '1' }));
    const behind = tileNamed('surgery-countdown', {
      reads: {
        procedures: [
          { ...procedure, id: 'proc-2', name: 'Top surgery', surgeryEpochDay: TODAY + 1 },
          { ...procedure, surgeryEpochDay: TODAY - 20 }
        ]
      }
    })!;
    expect(behind.value).toBe(m.tile_surgery_post_op_day({ days: '20' }));
    expect(behind.note).toBe('Vaginoplasty');
  });

  it('the safe space nudge dismisses the entry it is about', () => {
    const actions = { dismissSafeSpace: vi.fn() };
    const tile = tileNamed('safe-space-nudge', { actions })!;
    expect(tile.tileKey).toBe('safe-space-nudge');
    expect(tile.attrs).toEqual({ 'data-safe-space-nudge-tile': true });
    expect(tile.href).toBe('/doubt');
    tile.dismiss!.onclick(CLICK);
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
    // Its dismiss opens a sheet on Home rather than snoozing in place.
    tile.dismiss!.onclick(CLICK);
    expect(actions.openLetterDismiss).toHaveBeenCalled();
    expect(tile.action).toBeUndefined();
  });
});

describe('the dismiss controls', () => {
  it('gives no dismiss to the three that close nothing', () => {
    /* Wear, dose and surgery each resolve themselves - a running session
       cannot be hidden while it runs (ADR-0039's amendment), and the other
       two are facts about the day rather than nudges.

       Safe space and the ready letter left this list in phase 9
       carpet ticket 04 (ADR-0071). Both were closable all along - each
       carried an `action` whose icon was an x - and only the registry field
       said otherwise. The letter opens Home's sheet;
       safe space forgets the entry it was about. */
    for (const kind of ['wear-timer', 'dose-panel', 'surgery-countdown'] as const) {
      expect(tileNamed(kind)!.dismiss).toBeUndefined();
    }
  });

  it('draws every close as the tile\'s own dismiss, never as an action wearing an x', () => {
    /* The rule the three above were breaking, held over the whole registry
       so a fourth cannot quietly reintroduce it. An `action` is the tile's
       other control - log this dose, stop this session, open a letter -
       and none of those is a close. */
    for (const kind of LIVE_TILE_ORDER) {
      const tile = tileNamed(kind);
      expect(tile?.action?.icon, `${kind} states its close as an action`).not.toBe('x');
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
    expect(tileNamed('ready-letter', { areaStates })).toBeDefined();
  });

  it('takes them off while it is hidden too, and puts them back when it is not', () => {
    const hidden: AreaStates = { wearSessions: { hidden: true, finishedEpochDay: null, suspendedEpochDay: null } };

    expect(tileNamed('wear-timer', { areaStates: hidden })).toBeUndefined();
    expect(tileNamed('wear-timer', { areaStates: {} })).toBeDefined();
  });

  it('leaves a finish day that has not arrived alone', () => {
    const later: AreaStates = { wearSessions: { hidden: false, finishedEpochDay: TODAY + 1, suspendedEpochDay: null } };

    expect(tileNamed('wear-timer', { areaStates: later })).toBeDefined();
  });
});
