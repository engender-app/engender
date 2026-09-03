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
  Letter,
  Procedure,
  RegimenEpisode,
  Tryout,
  WearSession
} from './types';
import type { JournalingPauseRange } from './journalingPause';
import { pauseCoversDay as isJournalingPauseOn } from './journalingPause';
import { adherence, expectedAmountOn, expectedSlots, pauseCoversDay as isDosePauseOn } from './doseSchedule';
import { activeEpisodesAt, attributeDose } from './regimenEpisode';
import { epochDayFromTimestamp, startOfDayTimestamp } from './epochDay';
import { hoursMinutesSecondsOf } from './journal/wearSessions';
import { activeSurgeryProcedure, recoveryDay } from './recoveryDay';
import { shouldShowSafeSpaceNudge } from './safeSpaceNudge';
import { unreadUnlockedLetters } from './letterStatus';
import type { BooleanPrefKey, SurfaceRow, UnpromptedKind } from '../unprompted/registry';
import { SURFACE_ROWS } from '../unprompted/registry';

export interface ActiveTryoutTileResult {
  tryout: Tryout;
  daysElapsed: number;
}

export function shouldShowActiveTryoutTile(params: {
  tryouts: readonly Tryout[];
  latestFeltSenseByTryoutId: Map<string, number | null>;
  todayEpochDay: number;
  enabled: boolean;
  snoozed: boolean;
}): ActiveTryoutTileResult | null {
  if (!params.enabled || params.snoozed) return null;

  const activeTryouts = params.tryouts.filter(
    (t) => t.endEpochDay === null || t.endEpochDay >= params.todayEpochDay
  );

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

export interface PatchScheduleTileResult {
  episode: RegimenEpisode;
  schedule: DoseSchedule;
  doseAmount: string;
  route: string;
}

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

export interface VoiceBenchmarkNudgeResult {
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
export function shouldShowVoiceBenchmarkNudge(params: {
  benchmarks: readonly { epochDay: number }[];
  todayEpochDay: number;
  enabled: boolean;
  snoozed: boolean;
}): VoiceBenchmarkNudgeResult | null {
  if (!params.enabled || params.snoozed) return null;

  if (params.benchmarks.length === 0) return null;

  let latestDay = params.benchmarks[0].epochDay;
  for (const benchmark of params.benchmarks) {
    if (benchmark.epochDay > latestDay) latestDay = benchmark.epochDay;
  }

  const daysElapsed = params.todayEpochDay - latestDay;
  if (daysElapsed > 14) {
    return { daysElapsed };
  }

  return null;
}

export interface PauseActiveBannerResult {
  pause: JournalingPauseRange;
  resumeEpochDay: number | null;
}

export function shouldShowPauseActiveBanner(params: {
  pauses: readonly JournalingPauseRange[];
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

export interface HairRemovalRecoveryResult {
  session: HairRemovalSession;
  daysSince: number;
}

export function shouldShowHairRemovalRecovery(params: {
  sessions: readonly HairRemovalSession[];
  todayEpochDay: number;
  enabled: boolean;
  snoozed: boolean;
}): HairRemovalRecoveryResult | null {
  if (!params.enabled || params.snoozed) return null;
  if (params.sessions.length === 0) return null;

  let latestSession = params.sessions[0];
  for (const s of params.sessions) {
    if (s.epochDay > latestSession.epochDay) latestSession = s;
  }

  const daysSince = params.todayEpochDay - latestSession.epochDay;
  // 48 hours following session = today (0) or yesterday (1)
  if (daysSince >= 0 && daysSince < 2) {
    return { session: latestSession, daysSince };
  }

  return null;
}

export interface MeasurementsNudgeResult {
  daysSince: number;
}

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

/** The kinds Home's grid draws, narrowed out of `UnpromptedKind`'s eighteen.

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
  | 'active-tryout-tile'
  | 'patch-schedule-tile'
  | 'voice-benchmark-nudge'
  | 'pause-active-banner'
  | 'hair-removal-recovery'
  | 'measurements-nudge';

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
  'active-tryout-tile',
  'patch-schedule-tile',
  'voice-benchmark-nudge',
  'pause-active-banner',
  'hair-removal-recovery',
  'measurements-nudge'
] as const satisfies readonly LiveTileKind[];

type Unordered = Exclude<LiveTileKind, (typeof LIVE_TILE_ORDER)[number]>;
type AssertNoneUnordered<Missing extends never> = Missing;
export type EveryLiveTileOrdered = AssertNoneUnordered<Unordered>;

/** Every grid kind is a kind the unprompted registry knows, which is what
    lets the preference gate below be read off the registry instead of
    restated. A literal above that is not an `UnpromptedKind` fails here. */
type AssertKindsAreUnprompted<K extends UnpromptedKind> = K;
export type EveryLiveTileIsUnprompted = AssertKindsAreUnprompted<LiveTileKind>;

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

/** An in-place control on a tile (ADR-0039). Structurally what
    `Tile.svelte` takes; declared here because a `.svelte` file cannot be
    imported from the Node tier. */
export interface HomeTileAction {
  icon?: string;
  text?: string;
  label: string;
  onclick?: (e: MouseEvent) => void;
  href?: string;
  attrs?: Record<string, string>;
}

export interface HomeTileDismiss {
  label: string;
  onclick: (e: MouseEvent) => void;
  attrs?: Record<string, string>;
}

/** One tile, ready to draw. */
export interface HomeTile {
  /** The registry's own key, which is also the walkthrough's handle
      (ADR-0029) and the `{#each}` key. */
  key: LiveTileKind;
  /** The kit's slot name, which `Tile.svelte` renders as `data-tile`. Four
      of these are shorter than the registry key and have been since the
      tiles were written; they are kept as they are because this ticket's
      acceptance is that nothing about the rendered result changes. */
  tileKey: string;
  /** This tile's own walkthrough handle, which predates `data-live-tile`. */
  attrs: Record<string, string>;
  title: string;
  value?: string;
  note?: string;
  href: string;
  action?: HomeTileAction;
  dismiss?: HomeTileDismiss;
}

/** What the reads answered. One field per query `liveTiles.svelte.ts` runs. */
export interface HomeTileReads {
  runningWear: WearSession | null;
  episodes: readonly RegimenEpisode[];
  procedures: readonly Procedure[];
  letters: Letter[];
  latestBadEntryId: number | null | undefined;
  /** `prefs.safeSpaceNudgeDismissedEntryId` - a preference rather than a
      read, but it is the safe-space nudge's second input and belongs beside
      the first. */
  safeSpaceDismissedEntryId: number | null | undefined;
  tryouts: readonly Tryout[];
  latestFeltSenseByTryoutId: Map<string, number | null>;
  schedules: readonly DoseSchedule[];
  dosePauses: readonly DosePause[];
  todayDoses: readonly DoseEvent[];
  voiceBenchmarks: readonly { epochDay: number }[];
  journalingPauses: readonly JournalingPauseRange[];
  hairRemovalSessions: readonly HairRemovalSession[];
  measurements: { count: number; latestDay: number | null };
}

/** What a tile's controls do. Everything a tile can start except opening the
    letter tile's dismiss sheet, which is Home's own surface. */
export interface HomeTileActions {
  stopWear: (session: WearSession) => void;
  dismissSafeSpace: (entryId: number) => void;
  openLetterDismiss: () => void;
  resumePause: (pauseId: string, startEpochDay: number) => void;
  snooze: (kind: LiveTileKind) => void;
}

/** The four display formats, as callbacks: every one of them reaches
    paraglide through `$lib`, which the Node tier cannot resolve. */
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

export interface HomeTilesInput {
  todayEpochDay: number;
  /** One clock for the whole grid: the wear timer's reading, every snooze
      comparison and the dose panel's "active now" all read it. */
  nowMs: number;
  enabled: Record<LiveTileKind, boolean>;
  snoozed: Record<LiveTileKind, boolean>;
  reads: HomeTileReads;
  actions: HomeTileActions;
  format: HomeTileFormat;
}

/** The preference and the snooze, already resolved for one kind. Handed to
    each builder rather than checked for it, because four of the eleven have
    no predicate to pass it to and would otherwise skip the gate. */
interface TileGate {
  enabled: boolean;
  snoozed: boolean;
}

type TileBuilder = (gate: TileGate) => HomeTile | null;

/** Home's grid: the eleven kinds, gated, in `LIVE_TILE_ORDER`, with nothing
    dropped for being eleventh. A `Record` keyed by `LiveTileKind` rather
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
      return {
        key: 'wear-timer',
        tileKey: 'wear-timer',
        attrs: { 'data-wear-running-tile': '' },
        title: m.tile_wear_title(),
        value: m.wear_session_duration_hms({
          hours: String(elapsed.hours),
          minutes: String(elapsed.minutes),
          seconds: String(elapsed.seconds)
        }),
        note: m.wear_session_running_since({ time: format.time(session.startTimestamp) }),
        href: '/settings/wear',
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
        attrs: { 'data-dose-panel-tile': '' },
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
        attrs: { 'data-surgery-tile': '' },
        title: m.tile_surgery_title(),
        value,
        note: procedure.name,
        href: '/settings/surgery'
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
            attrs: { 'data-safe-space-nudge-tile': '' },
            title: m.safe_space_title(),
            note: m.tile_safe_space_nudge_sub(),
            href: '/doubt',
            action: {
              icon: 'x',
              label: m.tile_safe_space_nudge_dismiss(),
              attrs: { 'data-safe-space-nudge-dismiss': '' },
              onclick: (e) => {
                e.stopPropagation();
                e.preventDefault();
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
        attrs: { 'data-letter-tile': '' },
        title: m.tile_letter_title(),
        value: format.fullDay(letter.epochDay),
        note: others > 0 ? m.tile_letter_more({ count: String(others) }) : m.tile_letter_single_note(),
        href: `/settings/letters?read=${letter.id}`,
        action: {
          icon: 'x',
          label: m.tile_letter_dismiss_action(),
          attrs: { 'data-letter-dismiss': '' },
          onclick: (e) => {
            e.stopPropagation();
            e.preventDefault();
            actions.openLetterDismiss();
          }
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
        attrs: { 'data-active-tryout-tile': '' },
        title: m.tile_active_tryout_title(),
        value: qualifying.tryout.label,
        note: m.tile_active_tryout_note({ days: String(qualifying.daysElapsed) }),
        href: `/settings/tryouts/${qualifying.tryout.id}`,
        action: {
          icon: 'plus',
          text: m.tile_tryout_action(),
          label: m.tile_tryout_action(),
          href: `/settings/tryouts/${qualifying.tryout.id}?feltSense=1`
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
        attrs: { 'data-patch-schedule-tile': '' },
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
        benchmarks: reads.voiceBenchmarks,
        todayEpochDay: today,
        enabled: gate.enabled,
        snoozed: gate.snoozed
      });
      if (!qualifying) return null;
      return {
        key: 'voice-benchmark-nudge',
        tileKey: 'voice-benchmark',
        attrs: { 'data-voice-benchmark-tile': '' },
        title: m.tile_voice_benchmark_title(),
        value: m.tile_voice_benchmark_action(),
        note: m.tile_voice_benchmark_days_ago({ days: String(qualifying.daysElapsed) }),
        href: '/settings/voice',
        action: {
          icon: 'mic',
          text: m.tile_voice_benchmark_action(),
          label: m.tile_voice_benchmark_action(),
          href: '/settings/voice/record'
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
        attrs: { 'data-pause-active-tile': '' },
        title: m.tile_pause_active_title(),
        value: m.streak_protected(),
        note:
          pause.endEpochDay != null
            ? m.tile_pause_until_date({ date: format.shortDay(pause.endEpochDay) })
            : m.tile_pause_ongoing(),
        href: '/settings/journaling-pause',
        action: {
          icon: 'play',
          text: m.journaling_pause_resume(),
          label: m.journaling_pause_resume(),
          onclick: () => actions.resumePause(pause.id ?? '', pause.startEpochDay)
        },
        dismiss: dismissSnooze('pause-active-banner')
      };
    },

    'hair-removal-recovery': (gate) => {
      const qualifying = shouldShowHairRemovalRecovery({
        sessions: reads.hairRemovalSessions,
        todayEpochDay: today,
        enabled: gate.enabled,
        snoozed: gate.snoozed
      });
      if (!qualifying) return null;
      return {
        key: 'hair-removal-recovery',
        tileKey: 'hair-removal-recovery',
        attrs: { 'data-hair-removal-tile': '' },
        title: m.tile_hair_removal_title(),
        value: format.hairRemovalArea(qualifying.session.area),
        note: m.tile_hair_removal_guidance(),
        href: '/settings/hair-removal',
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
        attrs: { 'data-measurements-tile': '' },
        title: m.tile_measurements_title(),
        value: m.tile_measurements_prompt(),
        note: m.tile_measurements_note({ days: String(qualifying.daysSince) }),
        href: '/settings/measurements',
        action: {
          icon: 'plus',
          text: m.tile_measurements_action(),
          label: m.tile_measurements_action(),
          href: '/settings/measurements'
        },
        dismiss: dismissSnooze('measurements-nudge')
      };
    }
  };
}

/** The grid, in order, with every qualifying tile in it.

    Nothing is dropped: the count Home used to hand-roll as eleven ternaries
    is `tiles.length`, and there is no cap here for the same reason there is
    no priority - a cap is a policy, and this ticket moved the grid without
    changing what it shows. */
export function composeHomeTiles(input: HomeTilesInput): HomeTile[] {
  const builders = buildersFor(input);
  const tiles: HomeTile[] = [];
  for (const kind of LIVE_TILE_ORDER) {
    const tile = builders[kind]({ enabled: input.enabled[kind], snoozed: input.snoozed[kind] });
    if (tile) tiles.push(tile);
  }
  return tiles;
}
