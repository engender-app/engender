/* State-dependent live tile trigger predicates (phase 5 deepening ticket 03,
   ADR-0039, ADR-0036), and - since phase 8 deepening ticket 07 - what Home's
   grid is made of.

   Pure functions evaluating when Home's live tiles qualify to mount.
   Free of UI and platform dependencies so the Node tier tests them 100%.

   The second half is `composeHomeTiles`, which turns the predicates above
   plus the reads behind them into the ordered list Home draws. It lives here
   rather than in the `.svelte.ts` beside it for the reason ADR-0016 gives:
   the rule wants a Node test, and a rune module cannot have one. So the
   split is reads there, composition here - `liveTiles.svelte.ts` runs the
   queries, resolves the preferences and the snoozes, and hands the answers
   to this file.

   Relative imports rather than $lib for the same reason registry.ts uses
   them: this file is read by the Node tier, where no alias exists. That is
   also why the four display formats arrive as callbacks - `fmtDay` and
   `hairRemovalAreaName` both reach paraglide through `$lib`. */

import { m } from '../paraglide/messages';
import type {
  DoseEvent,
  DosePause,
  DoseSchedule,
  HairRemovalSession,
  JournalingPause,
  Letter,
  Procedure,
  RegimenEpisode,
  Revisit,
  Tryout,
  WearSession
} from './types';
import { pauseCoversDay as isJournalingPauseOn } from './journalingPause';
import { adherence, expectedAmountOn, expectedSlots, pauseCoversDay as isDosePauseOn } from './doseSchedule';
import { activeEpisodesAt, attributeDose } from './regimenEpisode';
import { epochDayFromTimestamp, startOfDayTimestamp } from './epochDay';
import { spanCoversDay } from './span';
import { binderCueShowing, hoursMinutesSecondsOf } from './journal/wearSessions';
import { wearTileTitle } from './vocabulary/wearLabels';
import { activeSurgeryProcedure, recoveryDay } from './recoveryDay';
import { shouldShowSafeSpaceNudge } from './safeSpaceNudge';
import { unreadUnlockedLetters } from './letterStatus';
import type { AppointmentDayRecord } from './journal/appointments';
import type { BooleanPrefKey, SurfaceRow, UnpromptedKind } from '../unprompted/registry';
import { SURFACE_ROWS, unpromptedQuiet } from '../unprompted/registry';
import type { AreaStates } from './areaState';
import type { LetterSeal } from './journal/letters';

interface ActiveTryoutTileResult {
  tryout: Tryout;
  daysElapsed: number;
}

/* shouldShowActiveTryoutTile stays exported only for its own test (AU-09
   test-only review). */
export function shouldShowActiveTryoutTile(params: {
  tryouts: readonly Tryout[];
  /** A tryout with no felt-sense history is absent, which reads the same as
      one whose latest day is unknown: both fall back to its start day
      (feltSense.ts states the convention). */
  latestFeltSenseByTryoutId: ReadonlyMap<string, number>;
  todayEpochDay: number;
  enabled: boolean;
  snoozed: boolean;
}): ActiveTryoutTileResult | null {
  if (!params.enabled || params.snoozed) return null;

  const activeTryouts = params.tryouts.filter((t) => spanCoversDay(t, params.todayEpochDay));

  for (const tryout of activeTryouts) {
    const lastFeltDay = params.latestFeltSenseByTryoutId.get(tryout.id);
    const referenceDay = lastFeltDay != null ? lastFeltDay : tryout.startEpochDay;
    const daysElapsed = params.todayEpochDay - referenceDay;

    if (daysElapsed >= 3) {
      return { tryout, daysElapsed };
    }
  }

  return null;
}

interface PatchScheduleTileResult {
  episode: RegimenEpisode;
  schedule: DoseSchedule;
  doseAmount: string;
  route: string;
}

/* shouldShowPatchScheduleTile stays exported only for its own test (AU-09
   test-only review). */
export function shouldShowPatchScheduleTile(params: {
  episodes: readonly RegimenEpisode[];
  schedules: readonly DoseSchedule[];
  doses: readonly DoseEvent[];
  pauses: readonly DosePause[];
  todayEpochDay: number;
  enabled: boolean;
  snoozed: boolean;
}): PatchScheduleTileResult | null {
  if (!params.enabled || params.snoozed) return null;

  const active = activeEpisodesAt(params.episodes, startOfDayTimestamp(params.todayEpochDay));

  for (const episode of active) {
    const schedule = params.schedules.find((s) => s.episodeId === episode.id);
    if (!schedule) continue;

    const isNonDaily =
      schedule.recurrence.kind === 'everyNDays'
        ? schedule.recurrence.everyNDays > 1
        : schedule.recurrence.weekdays.length < 7;

    if (!isNonDaily) continue;

    const slotsToday = expectedSlots(
      schedule,
      episode.startEpochDay,
      params.todayEpochDay,
      params.todayEpochDay
    );
    if (slotsToday.length === 0) continue;

    const isPaused = params.pauses.some(
      (p) => p.episodeId === episode.id && isDosePauseOn(p, params.todayEpochDay)
    );
    if (isPaused) continue;

    const episodeDoses = params.doses.filter(
      (d) =>
        epochDayFromTimestamp(d.timestamp) === params.todayEpochDay &&
        attributeDose(params.episodes, d).episode?.id === episode.id
    );

    const adh = adherence(slotsToday, episodeDoses, params.pauses);
    const unloggedSlot = adh.rows.find((r) => r.slot.epochDay === params.todayEpochDay && r.dose === null);

    if (unloggedSlot) {
      const expAmount = expectedAmountOn(adh, params.todayEpochDay);
      const doseAmount = expAmount
        ? `${expAmount.dose} ${expAmount.doseUnit}`
        : `${episode.dose} ${episode.doseUnit}`;

      return {
        episode,
        schedule,
        doseAmount,
        route: episode.route
      };
    }
  }

  return null;
}

interface VoiceBenchmarkNudgeResult {
  daysElapsed: number;
}

/* Benchmarks, not an entry's voice memos (phase 5 deepening ticket 15). The
   tile was written against `voice.inJournal()` while voice_benchmark did not
   exist yet, which made it measure the age of the last memo somebody attached
   to an entry - a different record with a different cadence, and the one
   thing a benchmark reminder must not be counting.

   A journal with no benchmark in it gets no tile at all, which is ADR-0039's
   own rule - the live-tile area is gated on live data, never on a preference
   - and is what stops the tile being an advert for a feature nobody has
   started. The flow is reached from the More hub until then. */
/* shouldShowVoiceBenchmarkNudge stays exported only for its own test (AU-09
   test-only review). */
export function shouldShowVoiceBenchmarkNudge(params: {
  /** The day of the newest benchmark at or before today, or null when there
      is none - one bounded `MAX`, not a table reduced here (lastWrite.ts). */
  latestBenchmarkEpochDay: number | null;
  todayEpochDay: number;
  enabled: boolean;
  snoozed: boolean;
}): VoiceBenchmarkNudgeResult | null {
  if (!params.enabled || params.snoozed) return null;

  if (params.latestBenchmarkEpochDay == null) return null;

  const daysElapsed = params.todayEpochDay - params.latestBenchmarkEpochDay;
  if (daysElapsed > 14) {
    return { daysElapsed };
  }

  return null;
}

interface PauseActiveBannerResult {
  pause: JournalingPause;
  resumeEpochDay: number | null;
}

/* shouldShowPauseActiveBanner stays exported only for its own test (AU-09
   test-only review). */
export function shouldShowPauseActiveBanner(params: {
  pauses: readonly JournalingPause[];
  todayEpochDay: number;
  enabled: boolean;
  snoozed: boolean;
}): PauseActiveBannerResult | null {
  if (!params.enabled || params.snoozed) return null;

  const activePause = params.pauses.find((p) => isJournalingPauseOn(p, params.todayEpochDay));
  if (!activePause) return null;

  return {
    pause: activePause,
    resumeEpochDay: activePause.endEpochDay != null ? activePause.endEpochDay + 1 : null
  };
}

interface HairRemovalRecoveryResult {
  session: HairRemovalSession;
  daysSince: number;
}

/* shouldShowHairRemovalRecovery stays exported only for its own test (AU-09
   test-only review). */
export function shouldShowHairRemovalRecovery(params: {
  /** The newest session at or before today, which is the read's own job to
      find (hairRemoval.ts): the tile needs one row, not the table. */
  latestSession: HairRemovalSession | null;
  todayEpochDay: number;
  enabled: boolean;
  snoozed: boolean;
}): HairRemovalRecoveryResult | null {
  if (!params.enabled || params.snoozed) return null;
  if (!params.latestSession) return null;

  const daysSince = params.todayEpochDay - params.latestSession.epochDay;
  // 48 hours following session = today (0) or yesterday (1)
  if (daysSince >= 0 && daysSince < 2) {
    return { session: params.latestSession, daysSince };
  }

  return null;
}

interface MeasurementsNudgeResult {
  daysSince: number;
}

/* shouldShowMeasurementsNudge stays exported only for its own test (AU-09
   test-only review). */
export function shouldShowMeasurementsNudge(params: {
  measurementsCount: number;
  latestMeasurementEpochDay: number | null;
  todayEpochDay: number;
  enabled: boolean;
  snoozed: boolean;
}): MeasurementsNudgeResult | null {
  if (!params.enabled || params.snoozed) return null;
  if (params.measurementsCount < 1 || params.latestMeasurementEpochDay == null) return null;

  const daysSince = params.todayEpochDay - params.latestMeasurementEpochDay;
  if (daysSince >= 30) {
    return { daysSince };
  }

  return null;
}

/* ------------------------------------------------------------------------
   Home's grid (phase 8 deepening ticket 07)

   Eleven tiles used to be eleven `{#if}` blocks in a route, each holding its
   own reads, its own preference gate and its own answer to "how many
   siblings do I have" - which is how four of them ended up asking that
   question of only the original five tiles, so a journal showing wear and
   measurements slid one in and not the other. What follows is the same
   eleven with one gate, one order and one count.

   No policy: no cap, no priority, no tier. The order below is the source
   order the route drew them in, moved rather than rewritten, and the UX
   spec's cap ticket is what changes it.
   --------------------------------------------------------------------- */

/** The kinds Home's grid draws, narrowed out of `UnpromptedKind`'s nineteen.

    Written out rather than derived from `LIVE_TILE_ORDER` below, for the
    reason registry.ts gives about its own `UnpromptedKind`: a union read off
    the list it is meant to check cannot catch a missing entry, because
    dropping one shrinks both sides at once. The seven kinds deliberately not
    here are `stock-notice` (a notice, drawn above the grid), `wrapped` and
    `on-this-day` (the look-back tiles, gated on their own preference alone),
    and the four notification-only kinds. */
export type LiveTileKind =
  | 'wear-timer'
  | 'dose-panel'
  | 'surgery-countdown'
  | 'safe-space-nudge'
  | 'ready-letter'
  | 'revisit'
  | 'active-tryout-tile'
  | 'patch-schedule-tile'
  | 'voice-benchmark-nudge'
  | 'pause-active-banner'
  | 'hair-removal-recovery'
  | 'measurements-nudge'
  | 'appointment-today';

/** The order Home draws them in, and the only place that order is written.

    `as const satisfies` rather than a `readonly LiveTileKind[]` annotation:
    the annotation would widen the tuple to the whole union, and
    `EveryLiveTileOrdered` below would then compare the union against itself
    and pass on anything. Demonstrated by deleting an entry: `Unordered`
    stops being `never` and that line refuses to compile. */
export const LIVE_TILE_ORDER = [
  'wear-timer',
  'dose-panel',
  'surgery-countdown',
  'safe-space-nudge',
  'ready-letter',
  'revisit',
  'active-tryout-tile',
  'patch-schedule-tile',
  'voice-benchmark-nudge',
  'pause-active-banner',
  'hair-removal-recovery',
  'measurements-nudge',
  /* Appended rather than slotted into the historical route order above:
     this kind never lived on the route (phase 8 features ticket 63), so
     there is no prior position to preserve - only where it lands in its own
     tier, which `LIVE_TILE_TIER` below decides. */
  'appointment-today'
] as const satisfies readonly LiveTileKind[];

/** How much of the screen a tile is worth (phase 8 UX ticket 01, ADR-0055).

    Three bands rather than a number per kind, because the tier is what the
    ordering and the three visual weights are both read off - a per-kind
    priority would be a fourth thing to keep in step with them and would
    still have to be bucketed to draw.

    - `today` is true today and false tomorrow: a wear session running now,
      a dose slot the day expects, the two days of hair-removal aftercare,
      an appointment on today's date (phase 8 features ticket 63).
    - `moment` is something that has happened and is waiting: a letter that
      unlocked, a bad moment Safe Space can answer, a surgery whose day is
      approaching, a break that is running.
    - `dormant` is a thing nothing is asking for: it has been a while since
      a benchmark, a measurement, a felt sense on a tryout.

    The dose panel is a moment rather than bound to today on purpose. It
    qualifies for as long as an episode is active, which would make it a
    permanent full-width row; what says a dose is actually due today is the
    patch-schedule tile beside it. */
type HomeTileTier = 'today' | 'moment' | 'dormant';

/** The three bands, in the order Home draws them. */
const HOME_TILE_TIERS = ['today', 'moment', 'dormant'] as const satisfies readonly HomeTileTier[];

/** Which band each kind is in.

    A mapped type over `LiveTileKind` rather than three arrays: a kind added
    to the union is a missing-property error here, which three arrays could
    not give - a kind absent from all of them would just never be drawn.
    Demonstrated by deleting a line: the object stops satisfying the
    `Record` and this file refuses to compile, naming the kind. */
/* LIVE_TILE_TIER stays exported only for liveTiles.grid.test.ts, which
   cross-checks against it (AU-09 test-only review). */
export const LIVE_TILE_TIER: Record<LiveTileKind, HomeTileTier> = {
  'wear-timer': 'today',
  'patch-schedule-tile': 'today',
  'hair-removal-recovery': 'today',
  'dose-panel': 'moment',
  'surgery-countdown': 'moment',
  'safe-space-nudge': 'moment',
  'ready-letter': 'moment',
  'revisit': 'moment',
  'pause-active-banner': 'moment',
  'active-tryout-tile': 'dormant',
  'voice-benchmark-nudge': 'dormant',
  'measurements-nudge': 'dormant',
  'appointment-today': 'today'
};

/** How many tiles Home draws at their own weight. The rest fold into one
    collapsed row in place - never a route, and never a true tile dropped
    (ADR-0039's amendment). */
/* HOME_TILE_CAP stays exported only for liveTiles.grid.test.ts, which
   cross-checks against it (AU-09 test-only review). */
export const HOME_TILE_CAP = 3;

type Unordered = Exclude<LiveTileKind, (typeof LIVE_TILE_ORDER)[number]>;
type AssertNoneUnordered<Missing extends never> = Missing;
type EveryLiveTileOrdered = AssertNoneUnordered<Unordered>;

/** Every grid kind is a kind the unprompted registry knows, which is what
    lets the preference gate below be read off the registry instead of
    restated. A literal above that is not an `UnpromptedKind` fails here. */
type AssertKindsAreUnprompted<K extends UnpromptedKind> = K;
type EveryLiveTileIsUnprompted = AssertKindsAreUnprompted<LiveTileKind>;

/** Which preference switches each tile off, taken from the registry that
    already declares it (`/settings/live-tiles` draws its switch from the
    same field). Exported as a function over the rows so registry.test.ts's
    trick works here too: the rule can be run over a shortened registry and
    seen to fail, rather than only asserted never to. */
export function liveTilePrefKeys(rows: readonly SurfaceRow[]): Record<LiveTileKind, BooleanPrefKey> {
  const declared = new Map(rows.map((row) => [row.key, row.surface.prefKey]));
  const table = {} as Record<LiveTileKind, BooleanPrefKey>;
  for (const kind of LIVE_TILE_ORDER) {
    const prefKey = declared.get(kind);
    if (!prefKey) throw new Error(`the unprompted registry declares no preference for the ${kind} tile`);
    table[kind] = prefKey;
  }
  return table;
}

export const LIVE_TILE_PREF_KEY = liveTilePrefKeys(SURFACE_ROWS);

/** A handle a tile stamps on itself, valued the way the markup that used to
    write it rendered it: `true`, which is what a bare `data-letter-tile`
    means. A control's own handles below are `''` instead, because the route
    wrote those with an explicit empty value and Svelte renders the two
    differently (`=""` against `="true"`) - this ticket's acceptance is that
    the grid's markup does not change. `Tile.svelte`'s `TileAction.attrs` is
    a `Record<string, string>` and would refuse `true` anyway, so the split
    is the component's rather than a choice made here. */
type TileHandles = Record<string, true>;

/** An in-place control on a tile (ADR-0039). Structurally what
    `Tile.svelte` takes; declared here rather than imported from it because
    a `.svelte` file is unreachable from the Node tier. The two staying in
    step is not a convention - Home passes `action={tile.action}` straight
    into the component, so a field that drifts is a `svelte-check` error at
    that line. */
interface HomeTileAction {
  icon?: string;
  text?: string;
  label: string;
  onclick?: (e: MouseEvent) => void;
  href?: string;
  attrs?: Record<string, string>;
}

interface HomeTileDismiss {
  label: string;
  onclick: (e: MouseEvent) => void;
  attrs?: Record<string, string>;
}

/** One tile, ready to draw. */
export interface HomeTile {
  /** The registry's own key, which is also the walkthrough's handle
      (ADR-0029) and the `{#each}` key. */
  key: LiveTileKind;
  /** `LIVE_TILE_TIER[key]`, carried on the tile so the screen draws the
      weight off what it is rendering rather than looking the kind up a
      second time. */
  tier: HomeTileTier;
  /** The kit's slot name, which `Tile.svelte` renders as `data-tile`. Four
      of these are shorter than the registry key and have been since the
      tiles were written; they are kept as they are because this ticket's
      acceptance is that nothing about the rendered result changes. */
  tileKey: string;
  /** This tile's own walkthrough handle, which predates `data-live-tile`. */
  attrs: TileHandles;
  title: string;
  value?: string;
  note?: string;
  href: string;
  action?: HomeTileAction;
  dismiss?: HomeTileDismiss;
}

/** What the reads answered. One field per query `liveTiles.svelte.ts` runs. */
/* HomeTileReads stays exported only for liveTiles.grid.test.ts, which
   cross-checks against it (AU-09 test-only review). */
export interface HomeTileReads {
  runningWear: WearSession | null;
  /** `prefs.wearDurationCueEnabled` - a preference rather than a read, the
      same exception `safeSpaceDismissedEntryId` below is, and beside the
      running session it qualifies. Not `gate.enabled`: that switches the
      whole tile off, and this only decides whether the tile picks up the
      eight-hour marker (ticket 50, ADR-0064). */
  wearDurationCue: boolean;
  episodes: readonly RegimenEpisode[];
  procedures: readonly Procedure[];
  letters: LetterSeal[];
  dueRevisits: Revisit[];
  latestBadEntryId: number | null | undefined;
  /** `prefs.safeSpaceNudgeDismissedEntryId` - a preference rather than a
      read, but it is the safe-space nudge's second input and belongs beside
      the first. */
  safeSpaceDismissedEntryId: number | null | undefined;
  tryouts: readonly Tryout[];
  latestFeltSenseByTryoutId: ReadonlyMap<string, number>;
  schedules: readonly DoseSchedule[];
  dosePauses: readonly DosePause[];
  todayDoses: readonly DoseEvent[];
  latestBenchmarkEpochDay: number | null;
  journalingPauses: readonly JournalingPause[];
  latestHairRemovalSession: HairRemovalSession | null;
  measurements: { count: number; latestDay: number | null };
  /** Today's own appointment rows (phase 8 features ticket 63) - `getDayRecords`
      asked for today rather than the whole table, the same reason
      `todayDoses` above is bounded rather than every dose ever logged. */
  todayAppointments: readonly AppointmentDayRecord[];
}

/** What a tile's controls do. Everything a tile can start except opening the
    letter tile's dismiss sheet, which is Home's own surface. */
/* HomeTileActions stays exported only for liveTiles.grid.test.ts, which
   cross-checks against it (AU-09 test-only review). */
export interface HomeTileActions {
  stopWear: (session: WearSession) => void;
  dismissSafeSpace: (entryId: number) => void;
  openLetterDismiss: () => void;
  /** Deletes the revisit row outright rather than snoozing it, unlike the
      letter tile's dismiss sheet: a revisit fires once (the ticket's own
      "one day, chosen once"), so there is no later instance a snooze would
      need to leave alone. */
  dismissRevisit: (id: string) => void;
  resumePause: (pauseId: string, startEpochDay: number) => void;
  snooze: (kind: LiveTileKind) => void;
}

/** The four display formats, as callbacks: every one of them reaches
    paraglide through `$lib`, which the Node tier cannot resolve. */
/* HomeTileFormat stays exported only for liveTiles.grid.test.ts, which
   cross-checks against it (AU-09 test-only review). */
export interface HomeTileFormat {
  /** A full date - the day a letter unlocked. */
  fullDay: (epochDay: number) => string;
  /** A day and a short month - when a pause ends. */
  shortDay: (epochDay: number) => string;
  /** A wall-clock time - when a wear session started. */
  time: (timestamp: number) => string;
  /** A hair removal area's own name. */
  hairRemovalArea: (area: string) => string;
}

/* HomeTilesInput stays exported only for liveTiles.grid.test.ts, which
   cross-checks against it (AU-09 test-only review). */
export interface HomeTilesInput {
  todayEpochDay: number;
  /** One clock for the whole grid: the wear timer's reading, every snooze
      comparison and the dose panel's "active now" all read it. */
  nowMs: number;
  enabled: Record<LiveTileKind, boolean>;
  snoozed: Record<LiveTileKind, boolean>;
  /** Which areas are hidden or finished (phase 8 features ticket 04). The
      grid takes the states rather than a third resolved `Record`, because
      which tile belongs to which area is the unprompted registry's to say
      and `unpromptedQuiet` is where that is read. */
  areaStates: AreaStates;
  reads: HomeTileReads;
  actions: HomeTileActions;
  format: HomeTileFormat;
}

/** The preference and the snooze, already resolved for one kind. Handed to
    each builder rather than checked for it, because five of the twelve have
    no predicate to pass it to and would otherwise skip the gate. */
interface TileGate {
  enabled: boolean;
  snoozed: boolean;
}

/** A builder answers everything about a tile except its tier, which is
    `LIVE_TILE_TIER`'s to say and `composeHomeTiles` stamps on - so no
    builder can disagree with the table the ordering reads. */
type TileBuilder = (gate: TileGate) => Omit<HomeTile, 'tier'> | null;

/** Home's grid: the twelve kinds, gated, in `LIVE_TILE_ORDER`, with nothing
    dropped for being twelfth. A `Record` keyed by `LiveTileKind` rather
    than an array, so a kind added to the union is a missing-property error
    here as well as a missing entry in the order. */
function buildersFor(input: HomeTilesInput): Record<LiveTileKind, TileBuilder> {
  const { todayEpochDay: today, nowMs, reads, actions, format } = input;
  const dismissSnooze = (kind: LiveTileKind): HomeTileDismiss => ({
    label: m.dismiss(),
    onclick: () => actions.snooze(kind)
  });

  return {
    'wear-timer': (gate) => {
      if (!gate.enabled || gate.snoozed) return null;
      const session = reads.runningWear;
      if (!session) return null;
      const elapsed = hoursMinutesSecondsOf(nowMs - session.startTimestamp);
      /* The cue takes the note's line rather than crowding in beside the
         start time: the elapsed reading above it already says how long,
         and a tile has one line to say anything in. */
      const cueShowing = binderCueShowing(session, nowMs, reads.wearDurationCue);
      const attrs: TileHandles = { 'data-wear-running-tile': true };
      if (cueShowing) attrs['data-wear-duration-cue'] = true;
      return {
        key: 'wear-timer',
        tileKey: 'wear-timer',
        attrs,
        title: wearTileTitle(session.kind),
        value: m.wear_session_duration_hms({
          hours: String(elapsed.hours),
          minutes: String(elapsed.minutes),
          seconds: String(elapsed.seconds)
        }),
        note: cueShowing
          ? m.wear_session_cue()
          : m.wear_session_running_since({ time: format.time(session.startTimestamp) }),
        href: '/practice/wear',
        action: {
          icon: 'stop',
          text: m.wear_session_stop_action(),
          label: m.wear_session_stop_action(),
          attrs: { 'data-wear-stop': '' },
          onclick: (e) => {
            e.stopPropagation();
            e.preventDefault();
            actions.stopWear(session);
          }
        }
      };
    },

    'dose-panel': (gate) => {
      if (!gate.enabled || gate.snoozed) return null;
      const active = activeEpisodesAt(reads.episodes, nowMs);
      if (active.length === 0) return null;
      return {
        key: 'dose-panel',
        tileKey: 'dose-panel',
        attrs: { 'data-dose-panel-tile': true },
        title: m.tile_dose_title(),
        value: active[0].drug,
        href: '/doses',
        action: {
          icon: 'plus',
          text: m.doses_add_aria(),
          label: m.doses_add_aria(),
          href: '/doses?add=1',
          attrs: { 'data-dose-add': '' }
        }
      };
    },

    'surgery-countdown': (gate) => {
      if (!gate.enabled || gate.snoozed) return null;
      const procedure = activeSurgeryProcedure(reads.procedures, today);
      if (!procedure) return null;
      const day = recoveryDay(procedure.surgeryEpochDay, today);
      const value =
        day.type === 'unscheduled'
          ? m.surgery_day_unscheduled()
          : day.type === 'upcoming'
            ? m.surgery_day_upcoming({ days: m.n_days({ n: day.days }) })
            : day.type === 'surgeryDay'
              ? m.surgery_day_of()
              : m.surgery_day_since({ days: m.n_days({ n: day.days }) });
      return {
        key: 'surgery-countdown',
        tileKey: 'surgery-countdown',
        attrs: { 'data-surgery-tile': true },
        title: m.tile_surgery_title(),
        value,
        note: procedure.name,
        href: '/health/surgery'
      };
    },

    'safe-space-nudge': (gate) => {
      if (!gate.snoozed) {
        const showing = shouldShowSafeSpaceNudge({
          latestBadEntryId: reads.latestBadEntryId,
          dismissedEntryId: reads.safeSpaceDismissedEntryId,
          enabled: gate.enabled
        });
        if (showing) {
          const entryId = reads.latestBadEntryId;
          return {
            key: 'safe-space-nudge',
            tileKey: 'safe-space-nudge',
            attrs: { 'data-safe-space-nudge-tile': true },
            title: m.safe_space_title(),
            note: m.tile_safe_space_nudge_sub(),
            href: '/doubt',
            dismiss: {
              label: m.tile_safe_space_nudge_dismiss(),
              attrs: { 'data-safe-space-nudge-dismiss': '' },
              onclick: () => {
                if (entryId != null) actions.dismissSafeSpace(entryId);
              }
            }
          };
        }
      }
      return null;
    },

    'ready-letter': (gate) => {
      if (!gate.enabled || gate.snoozed) return null;
      const unread = unreadUnlockedLetters(reads.letters, today);
      const letter = unread[0];
      if (!letter) return null;
      const others = Math.max(0, unread.length - 1);
      return {
        key: 'ready-letter',
        tileKey: 'ready-letter',
        attrs: { 'data-letter-tile': true },
        title: m.tile_letter_title(),
        value: format.fullDay(letter.epochDay),
        note: others > 0 ? m.tile_letter_more({ count: String(others) }) : m.tile_letter_single_note(),
        href: `/transition/letters?read=${letter.id}`,
        dismiss: {
          label: m.tile_letter_dismiss_action(),
          attrs: { 'data-letter-dismiss': '' },
          onclick: () => actions.openLetterDismiss()
        }
      };
    },

    revisit: (gate) => {
      if (!gate.enabled || gate.snoozed) return null;
      const [revisit, ...rest] = reads.dueRevisits;
      if (!revisit) return null;
      return {
        key: 'revisit',
        tileKey: 'revisit',
        attrs: { 'data-revisit-tile': true },
        title: m.tile_revisit_title(),
        value: format.fullDay(revisit.entryEpochDay),
        note: rest.length > 0 ? m.tile_revisit_more({ count: String(rest.length) }) : m.tile_revisit_single_note(),
        href: `/entry/${revisit.entryId}`,
        dismiss: {
          label: m.dismiss(),
          attrs: { 'data-revisit-dismiss': '' },
          onclick: () => actions.dismissRevisit(revisit.id)
        }
      };
    },

    'active-tryout-tile': (gate) => {
      const qualifying = shouldShowActiveTryoutTile({
        tryouts: reads.tryouts,
        latestFeltSenseByTryoutId: reads.latestFeltSenseByTryoutId,
        todayEpochDay: today,
        enabled: gate.enabled,
        snoozed: gate.snoozed
      });
      if (!qualifying) return null;
      return {
        key: 'active-tryout-tile',
        tileKey: 'active-tryout',
        attrs: { 'data-active-tryout-tile': true },
        title: m.tile_active_tryout_title(),
        value: qualifying.tryout.label,
        note: m.tile_active_tryout_note({ days: String(qualifying.daysElapsed) }),
        href: `/transition/tryouts/${qualifying.tryout.id}`,
        action: {
          icon: 'plus',
          text: m.tile_tryout_action(),
          label: m.tile_tryout_action(),
          href: `/transition/tryouts/${qualifying.tryout.id}?feltSense=1`
        },
        dismiss: dismissSnooze('active-tryout-tile')
      };
    },

    'patch-schedule-tile': (gate) => {
      const qualifying = shouldShowPatchScheduleTile({
        episodes: reads.episodes,
        schedules: reads.schedules,
        doses: reads.todayDoses,
        pauses: reads.dosePauses,
        todayEpochDay: today,
        enabled: gate.enabled,
        snoozed: gate.snoozed
      });
      if (!qualifying) return null;
      return {
        key: 'patch-schedule-tile',
        tileKey: 'patch-schedule',
        attrs: { 'data-patch-schedule-tile': true },
        title: m.tile_patch_schedule_title(),
        value: qualifying.episode.drug,
        note: `${qualifying.doseAmount} · ${qualifying.route}`,
        href: '/doses',
        action: {
          icon: 'plus',
          text: m.tile_dose_log_action(),
          label: m.tile_dose_log_action(),
          href: '/doses?add=1'
        },
        dismiss: dismissSnooze('patch-schedule-tile')
      };
    },

    'voice-benchmark-nudge': (gate) => {
      const qualifying = shouldShowVoiceBenchmarkNudge({
        latestBenchmarkEpochDay: reads.latestBenchmarkEpochDay,
        todayEpochDay: today,
        enabled: gate.enabled,
        snoozed: gate.snoozed
      });
      if (!qualifying) return null;
      return {
        key: 'voice-benchmark-nudge',
        tileKey: 'voice-benchmark',
        attrs: { 'data-voice-benchmark-tile': true },
        title: m.tile_voice_benchmark_title(),
        value: m.tile_voice_benchmark_action(),
        note: m.tile_voice_benchmark_days_ago({ days: String(qualifying.daysElapsed) }),
        href: '/practice/voice?tab=compare',
        action: {
          icon: 'mic',
          text: m.tile_voice_benchmark_action(),
          label: m.tile_voice_benchmark_action(),
          href: '/practice/voice?tab=record'
        },
        dismiss: dismissSnooze('voice-benchmark-nudge')
      };
    },

    'pause-active-banner': (gate) => {
      const qualifying = shouldShowPauseActiveBanner({
        pauses: reads.journalingPauses,
        todayEpochDay: today,
        enabled: gate.enabled,
        snoozed: gate.snoozed
      });
      if (!qualifying) return null;
      const { pause } = qualifying;
      return {
        key: 'pause-active-banner',
        tileKey: 'pause-active',
        attrs: { 'data-pause-active-tile': true },
        title: m.tile_pause_active_title(),
        value: m.tile_pause_value(),
        note:
          pause.endEpochDay != null
            ? m.tile_pause_until_date({ date: format.shortDay(pause.endEpochDay) })
            : m.tile_pause_ongoing(),
        href: '/settings/journaling-pause',
        action: {
          icon: 'play',
          text: m.journaling_pause_resume(),
          label: m.journaling_pause_resume(),
          onclick: () => actions.resumePause(pause.id, pause.startEpochDay)
        },
        dismiss: dismissSnooze('pause-active-banner')
      };
    },

    'hair-removal-recovery': (gate) => {
      const qualifying = shouldShowHairRemovalRecovery({
        latestSession: reads.latestHairRemovalSession,
        todayEpochDay: today,
        enabled: gate.enabled,
        snoozed: gate.snoozed
      });
      if (!qualifying) return null;
      return {
        key: 'hair-removal-recovery',
        tileKey: 'hair-removal-recovery',
        attrs: { 'data-hair-removal-tile': true },
        title: m.tile_hair_removal_title(),
        value: format.hairRemovalArea(qualifying.session.area),
        note: m.tile_hair_removal_guidance(),
        href: '/body/hair-removal',
        dismiss: dismissSnooze('hair-removal-recovery')
      };
    },

    'measurements-nudge': (gate) => {
      const qualifying = shouldShowMeasurementsNudge({
        measurementsCount: reads.measurements.count,
        latestMeasurementEpochDay: reads.measurements.latestDay,
        todayEpochDay: today,
        enabled: gate.enabled,
        snoozed: gate.snoozed
      });
      if (!qualifying) return null;
      return {
        key: 'measurements-nudge',
        tileKey: 'measurements-nudge',
        attrs: { 'data-measurements-tile': true },
        title: m.tile_measurements_title(),
        value: m.tile_measurements_prompt(),
        note: m.tile_measurements_note({ days: String(qualifying.daysSince) }),
        href: '/body/measurements',
        action: {
          icon: 'plus',
          text: m.tile_measurements_action(),
          label: m.tile_measurements_action(),
          href: '/body/measurements'
        },
        dismiss: dismissSnooze('measurements-nudge')
      };
    },

    /* An appointment on today's date (phase 8 features ticket 63, ADR-0067).
       No snooze: unlike the recurring nudges beside it in this tier, the
       fact is true for exactly one day and gone on its own tomorrow, so
       there is nothing a snooze would buy that waiting for tomorrow does
       not already give for free. More than one appointment today still
       produces the one tile the acceptance asks for - the rest are counted
       the same way a second unread letter is. */
    'appointment-today': (gate) => {
      if (!gate.enabled || gate.snoozed) return null;
      const [appointment, ...rest] = reads.todayAppointments;
      if (!appointment) return null;
      return {
        key: 'appointment-today',
        tileKey: 'appointment-today',
        attrs: { 'data-appointment-today-tile': true },
        title: m.tile_appointment_title(),
        // Same fallback chain the appointments screen's own `titleOf` uses:
        // a consult with no kind typed in still names the journey it
        // belongs to before falling back to the untitled label.
        value: appointment.kind ?? appointment.procedureName ?? m.appointments_untitled(),
        note:
          rest.length > 0
            ? m.tile_appointment_more({ count: String(rest.length) })
            : (appointment.place ?? undefined),
        href: '/health/appointments'
      };
    }
  };
}

/** The grid, in tier order, with every qualifying tile in it.

    Two loops rather than a sort: the tier bands are the outer order and
    `LIVE_TILE_ORDER` is the order inside a band, which is exactly what
    nesting the two lists says. Nothing is dropped here - the cap is
    `splitHomeTiles` below, so the fold has the tiles it is folding.

    A tile whose area is hidden or finished never reaches its builder (phase 8
    features ticket 04). Folded into `enabled` rather than added as a third
    field on the gate, because the two say the same thing to a builder - do
    not show - and the four builders with no predicate to pass a gate to would
    otherwise each need a second check. */
export function composeHomeTiles(input: HomeTilesInput): HomeTile[] {
  const builders = buildersFor(input);
  const tiles: HomeTile[] = [];
  for (const tier of HOME_TILE_TIERS) {
    for (const kind of LIVE_TILE_ORDER) {
      if (LIVE_TILE_TIER[kind] !== tier) continue;
      const quiet = unpromptedQuiet(kind, input.areaStates, input.todayEpochDay);
      const tile = builders[kind]({ enabled: input.enabled[kind] && !quiet, snoozed: input.snoozed[kind] });
      if (tile) tiles.push({ ...tile, tier });
    }
  }
  return tiles;
}

/** The cap: the first `HOME_TILE_CAP` at their own weight, the rest folded
    into one collapsed row in place.

    Both halves come back, because the fold is a disclosure and not a
    suppression - the row has to be able to draw what it is holding. At or
    under the cap nothing is folded, so three tiles are three tiles rather
    than two and a row saying "1 more". */
export function splitHomeTiles(
  tiles: readonly HomeTile[],
  cap: number = HOME_TILE_CAP
): { shown: HomeTile[]; folded: HomeTile[] } {
  if (tiles.length <= cap) return { shown: [...tiles], folded: [] };
  return { shown: tiles.slice(0, cap), folded: tiles.slice(cap) };
}
