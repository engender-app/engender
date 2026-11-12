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
   also why the display formats arrive as callbacks - `fmtDay` reaches
   paraglide through `$lib`. */

import { m } from '../paraglide/messages';
import type {
  DoseEvent,
  DosePause,
  DoseSchedule,
  DoseScheduleAmount,
  Procedure,
  RegimenEpisode,
  WearSession
} from './types';
import { isDailySchedule } from './doseSchedule';
import { activeEpisodesAt, attributeDose, lastDayWithin } from './regimenEpisode';
import { epochDayFromTimestamp } from './epochDay';
import { binderCueShowing, hoursMinutesSecondsOf } from './journal/wearSessions';
import { wearTileTitle } from './vocabulary/wearLabels';
import { activeSurgeryProcedure, recoveryDay } from './recoveryDay';
import { SPINE_FORWARD_DAYS } from './careSpine';
import { AGENDA_DAYS } from './agenda';
import { pairDoseSchedule } from './journal/doses';
import { shouldShowSafeSpaceNudge } from './safeSpaceNudge';
import { unreadUnlockedLetters } from './letterStatus';
import type { SurfaceKind, UnpromptedKind } from '../unprompted/registry';
import { unpromptedQuiet } from '../unprompted/registry';
import type { AreaStates } from './areaState';
import type { LetterSeal } from './journal/letters';

/* ------------------------------------------------------------------------
   Home's grid (phase 8 deepening ticket 07)

   Eleven tiles used to be eleven `{#if}` blocks in a route, each holding its
   own reads, its own preference gate and its own answer to "how many
   siblings do I have" - which is how four of them ended up asking that
   question of only the original five tiles, so a journal showing several
   kinds could draw a partial count. What follows is the same
   eleven with one gate, one order and one count.

   No policy: no cap, no priority, no tier. The order below is the source
   order the route drew them in, moved rather than rewritten, and the UX
   spec's cap ticket is what changes it.
   --------------------------------------------------------------------- */

/** The kinds Home's grid draws, narrowed out of `UnpromptedKind`'s fifteen.

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
  | 'ready-letter';

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
  'ready-letter'
] as const satisfies readonly LiveTileKind[];

/** How much of the screen a tile is worth (phase 8 UX ticket 01, ADR-0055).

    Three bands rather than a number per kind, because the tier is what the
    ordering and the three visual weights are both read off - a per-kind
    priority would be a fourth thing to keep in step with them and would
    still have to be bucketed to draw.

    - `today` is true today and false tomorrow: a wear session running now.
      An appointment on today's date is the agenda's today row since
      functional-audit ticket 14, and a dose slot the day expects is the
      dose panel's since ticket 15, not a tile of its own.
    - `moment` is something that has happened and is waiting: a letter that
      unlocked, a bad moment Safe Space can answer, the days after a
      surgery.
    - `dormant` is a thing nothing is asking for. No live tile sits there
      since functional-audit tickets 05 and 14 cut the nudges and the tryout
      tile; the tier stays so the next quiet nudge has a place.

    The dose panel is a moment rather than bound to today on purpose. It
    qualifies for as long as an episode is active, which would make it a
    permanent full-width row. On a day a dose is due it rises to `today`,
    the one kind whose band moves with the day: it took over that day from
    the patch-schedule tile, which was a `today` tile of its own
    (functional-audit ticket 15), and a dose due now drawn below the agenda
    would be the screen's most urgent fact in its quietest place. */
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
  'dose-panel': 'moment',
  'surgery-countdown': 'moment',
  'safe-space-nudge': 'moment',
  'ready-letter': 'moment'
};

/** How many tiles Home draws at their own weight. The rest fold into one
    collapsed row in place - never a route, and never a true tile dropped
    (ADR-0039's amendment). */
/* HOME_TILE_CAP stays exported only for liveTiles.grid.test.ts, which
   cross-checks against it (AU-09 test-only review). */
export const HOME_TILE_CAP = 3;

/** The order Home actually draws them in: the bands outside, `LIVE_TILE_ORDER`
    inside each one.

    Derived rather than written out a second time, and read by both the grid
    and Today's editor (phase 11 ticket 04). The editor lists one switch per
    kind in draw order, so a hand-kept second list there would be the order
    stated twice with nothing holding the two together - and `composeHomeTiles`
    below walks this rather than nesting the same two loops it is made of. */
export const LIVE_TILE_DRAW_ORDER: readonly LiveTileKind[] = HOME_TILE_TIERS.flatMap((tier) =>
  LIVE_TILE_ORDER.filter((kind) => LIVE_TILE_TIER[kind] === tier)
);

/** Whether a registered kind is one of the grid's, which is how a screen
    tells a tile the editor arranges from a notice or a notification it does
    not (phase 11 ticket 04). Over the registry's own union rather than over
    `string`, so a caller cannot ask it about a kind that does not exist. */
export function isLiveTileKind(kind: UnpromptedKind): kind is LiveTileKind {
  return (LIVE_TILE_ORDER as readonly UnpromptedKind[]).includes(kind);
}

type Unordered = Exclude<LiveTileKind, (typeof LIVE_TILE_ORDER)[number]>;
type AssertNoneUnordered<Missing extends never> = Missing;
type EveryLiveTileOrdered = AssertNoneUnordered<Unordered>;

/** Every grid kind is a kind the unprompted registry gives a switch, which is
    what lets `surfaceOn` answer for it. A literal above that is not a
    `SurfaceKind` fails here. */
type AssertKindsHaveASurface<K extends SurfaceKind> = K;
type EveryLiveTileHasASurface = AssertKindsHaveASurface<LiveTileKind>;

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
  /** `prefs.acknowledgements.readLetterIds` - the letters already opened, a
      preference rather than a read like `wearDurationCue` above. */
  readLetterIds: readonly string[];
  latestBadEntryId: number | null | undefined;
  /** `prefs.safeSpaceNudgeDismissedEntryId` - a preference rather than a
      read, but it is the safe-space nudge's second input and belongs beside
      the first. */
  safeSpaceDismissedEntryId: number | null | undefined;
  schedules: readonly DoseSchedule[];
  dosePauses: readonly DosePause[];
  scheduleDoses: readonly DoseEvent[];
  /** Yesterday's logged timestamps, used only for the automatic-log notice.
      Schedule pairing reads its own tolerance-widened window above. */
  yesterdayDoses: readonly DoseEvent[];
}

/** What a tile's controls do. Everything a tile can start except opening the
    letter tile's dismiss sheet, which is Home's own surface. */
/* HomeTileActions stays exported only for liveTiles.grid.test.ts, which
   cross-checks against it (AU-09 test-only review). */
export interface HomeTileActions {
  stopWear: (session: WearSession) => void;
  dismissSafeSpace: (entryId: number) => void;
  openLetterDismiss: () => void;
}

/** The display formats, as callbacks: every one of them reaches
    paraglide through `$lib`, which the Node tier cannot resolve. */
/* HomeTileFormat stays exported only for liveTiles.grid.test.ts, which
   cross-checks against it (AU-09 test-only review). */
export interface HomeTileFormat {
  number?: (value: number) => string;
  /** A full date - the day a letter unlocked. */
  fullDay: (epochDay: number) => string;
  /** A weekday and a date - "Monday 21 September" - which is how the agenda
      band on the same screen writes a day still to come. Its own format
      rather than the band's `agendaWhen`, which says "Today" and "Tomorrow"
      for the two nearest days: the dose panel puts its day inside a
      sentence ("Next ..."), and today has a sentence of its own. */
  weekdayDay: (epochDay: number) => string;
  /** A wall-clock time - when a wear session started. */
  time: (timestamp: number) => string;
  /** How a dose goes in, in words - the dose panel's line for a dose due
      today names the route the way the dose log does. */
  doseRoute: (route: RegimenEpisode['route']) => string;
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
    each builder rather than checked for it, because five of the eight have
    no predicate to pass it to and would otherwise skip the gate. */
interface TileGate {
  enabled: boolean;
  snoozed: boolean;
}

/** A builder answers everything about a tile except its tier, which is
    `LIVE_TILE_TIER`'s to say and `composeHomeTiles` stamps on - so no
    builder can disagree with the table the ordering reads. The dose panel
    is the one exception, and only upward: `dueToday` moves it to `today`
    on a day its schedule expects a dose (functional-audit ticket 15). */
type TileBuilder = (gate: TileGate) => (Omit<HomeTile, 'tier'> & { dueToday?: boolean }) | null;

/** What the dose panel states about one regimen: the episode, and the
    next slot its schedule still expects nothing logged against. */
interface PanelDose {
  episode: RegimenEpisode;
  next: { epochDay: number; amount: DoseScheduleAmount | null } | null;
}

/** The regimens Today's dose panel states, the one it leads with first
    (functional-audit ticket 15).

    The panel stands for every regimen the agenda would have drawn a
    `doseSlot` row for, which is what lets Today withhold that kind whenever
    the panel is up (agendaReads.ts) with no drug left off the screen. That
    section reads every episode whose span meets the agenda's month and
    skips one with no schedule or a daily one (ADR-0067: a daily slot marks
    every day, which is wallpaper), so this reads the same set. The lead is
    the one whose next open slot comes first - a patch due today before an
    injection due on Sunday - and the rest are named after it.

    With none of those running, the panel names the first active episode,
    as it always has: an everyday pill draws no row anywhere else, and the
    panel is its one line on Today. */
function panelDoses(input: HomeTilesInput, active: readonly RegimenEpisode[]): PanelDose[] {
  const { todayEpochDay: today, reads } = input;
  const nextOf = (episode: RegimenEpisode): PanelDose => {
    const schedule = reads.schedules.find((s) => s.episodeId === episode.id);
    if (!schedule) return { episode, next: null };
    const slot = pairDoseSchedule(reads.episodes, reads.scheduleDoses, schedule, reads.dosePauses, today,
      today + SPINE_FORWARD_DAYS).rows.find((row) => row.dose === null)?.slot;
    return { episode, next: slot ? { epochDay: slot.epochDay, amount: slot.amount } : null };
  };
  const marking = reads.episodes.filter((episode) => {
    const schedule = reads.schedules.find((s) => s.episodeId === episode.id);
    return schedule !== undefined && !isDailySchedule(schedule) &&
      lastDayWithin(episode, today, today + AGENDA_DAYS - 1) !== null;
  });
  if (marking.length === 0) return [nextOf(active[0])];
  /* A stable sort, so two regimens due the same day keep episode order. */
  return marking.map(nextOf).sort((a, b) => (a.next?.epochDay ?? Infinity) - (b.next?.epochDay ?? Infinity));
}

/** Home's grid: every kind, gated, in `LIVE_TILE_ORDER`, with nothing
    dropped for being last. A `Record` keyed by `LiveTileKind` rather
    than an array, so a kind added to the union is a missing-property error
    here as well as a missing entry in the order. */
function buildersFor(input: HomeTilesInput): Record<LiveTileKind, TileBuilder> {
  const { todayEpochDay: today, nowMs, reads, actions, format } = input;

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
        href: '/body/wear',
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
      /* When the next one falls (phase 11 ticket 03), for every regimen the
         agenda would have drawn a row for. The panel is the dose's one home
         on Today - the agenda withholds its `doseSlot` rows while this tile
         is up (agendaReads.ts), and the patch-schedule tile that used to
         stand beside it on a due day is folded in here (functional-audit
         ticket 15) - so the day each schedule expects is stated here or
         nowhere.

         The dose owner pairs each episode's full tolerance window. An early
         dose can cover today, while another episode's dose cannot. */
      const [lead, ...others] = panelDoses(input, active);
      const { episode, next } = lead;
      /* What the app did on the person's behalf yesterday, which the panel
         states ahead of the next day it expects (phase 11 ticket 11,
         ADR-0086). Ahead, not beside: the line holds one sentence, and on
         the morning after an auto-logged slot the fact worth reading is the
         row that was written without them, not a date they can work out
         from the schedule they wrote. */
      const autoLoggedYesterday = reads.yesterdayDoses.some(
        (dose) =>
          dose.source === 'schedule' && attributeDose(reads.episodes, dose).episode?.id === episode.id
      );
      /* A dose due today says how much and how, which is what the patch
         tile carried: the slot's own amount where the schedule sets one,
         the episode's otherwise. */
      const amount = next?.amount ?? { dose: episode.dose, doseUnit: episode.doseUnit };
      const when = autoLoggedYesterday
        ? m.tile_dose_auto_logged_yesterday()
        : !next
          ? undefined
          : next.epochDay === today
            ? m.tile_dose_today_detail({
                dose: (format.number ?? String)(amount.dose),
                unit: amount.doseUnit,
                route: format.doseRoute(episode.route)
              })
            : m.tile_dose_next({ date: format.weekdayDay(next.epochDay) });
      /* A second regimen on a rhythm is named rather than left to the
         agenda, whose rows are withheld while the panel is up. Its own day
         is one tap away on the dose log. */
      const dueToday = next?.epochDay === today;
      const also = others.length > 0 ? m.tile_dose_also({ drugs: others.map((o) => o.episode.drug).join(', ') }) : undefined;
      return {
        key: 'dose-panel',
        tileKey: 'dose-panel',
        dueToday,
        attrs: { 'data-dose-panel-tile': true },
        title: m.tile_dose_title(),
        value: episode.drug,
        note: [when, also].filter(Boolean).join(' · ') || undefined,
        href: '/care/doses',
        action: {
          icon: 'plus',
          text: m.doses_add_aria(),
          label: m.doses_add_aria(),
          href: '/care/doses?add=1',
          attrs: { 'data-dose-add': '' }
        }
      };
    },

    /* The days after a surgery, and only those (functional-audit ticket
       14). The agenda states the date while it is ahead and on the day
       itself, so a countdown here said it twice. Procedures not yet behind
       today are left out before the nearest is picked, so an upcoming one
       closer to today cannot hide the recovery that is running. */
    'surgery-countdown': (gate) => {
      if (!gate.enabled || gate.snoozed) return null;
      const behind = reads.procedures.filter((p) => p.surgeryEpochDay !== null && p.surgeryEpochDay < today);
      const procedure = activeSurgeryProcedure(behind, today);
      if (!procedure) return null;
      const day = recoveryDay(procedure.surgeryEpochDay, today);
      if (day.type !== 'since') return null;
      return {
        key: 'surgery-countdown',
        tileKey: 'surgery-countdown',
        attrs: { 'data-surgery-tile': true },
        title: m.tile_surgery_title(),
        value: m.surgery_post_op_day({ days: String(day.days) }),
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
      const unread = unreadUnlockedLetters(reads.letters, today, reads.readLetterIds);
      const letter = unread[0];
      if (!letter) return null;
      const others = Math.max(0, unread.length - 1);
      return {
        key: 'ready-letter',
        tileKey: 'ready-letter',
        attrs: { 'data-letter-tile': true },
        title: m.tile_letter_title(),
        value: format.fullDay(letter.epochDay),
        note: others > 0 ? m.count_more({ count: String(others) }) : m.tile_letter_single_note(),
        href: `/transition/letters?read=${letter.id}`,
        dismiss: {
          label: m.tile_letter_dismiss_action(),
          attrs: { 'data-letter-dismiss': '' },
          onclick: () => actions.openLetterDismiss()
        }
      };
    }
  };
}

/** The grid, in tier order, with every qualifying tile in it.

    `LIVE_TILE_DRAW_ORDER` rather than a sort or a nested pair of loops: the
    tier bands outside and `LIVE_TILE_ORDER` inside is one order, and since
    ticket 04 the editor lists its switches in it too. Nothing is dropped
    here - the cap is `splitHomeTiles` below, so the fold has the tiles it is
    folding.

    A tile whose area is hidden or finished never reaches its builder (phase 8
    features ticket 04). Folded into `enabled` rather than added as a third
    field on the gate, because the two say the same thing to a builder - do
    not show - and the four builders with no predicate to pass a gate to would
    otherwise each need a second check. */
export function composeHomeTiles(input: HomeTilesInput): HomeTile[] {
  const builders = buildersFor(input);
  const tiles: HomeTile[] = [];
  for (const kind of LIVE_TILE_DRAW_ORDER) {
    const quiet = unpromptedQuiet(kind, input.areaStates, input.todayEpochDay);
    const built = builders[kind]({ enabled: input.enabled[kind] && !quiet, snoozed: input.snoozed[kind] });
    if (!built) continue;
    const { dueToday, ...tile } = built;
    tiles.push({ ...tile, tier: dueToday ? 'today' : LIVE_TILE_TIER[kind] });
  }
  /* No re-sort for the dose panel rising a band: it opens the moment band in
     the draw order, so it lands at the end of the today band either way. */
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
