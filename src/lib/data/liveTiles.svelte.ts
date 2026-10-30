/* Home's live-tile grid, as one read (phase 8 deepening ticket 07).

   The queries behind the tiles, the preference each tile answers to, its
   snooze, and the writes its controls make. What comes out is the ordered
   list Home draws and nothing else - the composition, the order and the
   tiles' own content are liveTiles.ts's, which is a plain module so the
   Node tier can test them (ADR-0016, ADR-0017).

   A `.svelte.ts` because the reads are runes: `liveQuery`/`liveList` are
   effects, and an effect has to be created while a component is
   initialising. `homeTiles()` is therefore called once from Home's script
   block, like activeFlag.svelte.ts and recordEditor.svelte.ts before it.

   Eight of these reads render nothing themselves. They existed on the route
   only to be arguments to a `shouldShow*` predicate whose answer the markup
   read, which is what kept the query and the rule from ever meeting.

   Every read here asks for the fact its tile draws (phase 8 audit ticket
   13). Six of them used to ask for a list and reduce it: every voice
   benchmark with its pitch track for one `MAX(epoch_day)`, every
   measurement ever stored for a count and a day, every letter with its body
   for three ids, the whole hair-removal table for its newest row, a
   hydrated bad-moment entry for its id, and one felt-sense query per active
   tryout. More subscriptions than that shape, and a small fraction of the
   bytes: eighteen narrow reads cost less to cross the worker boundary than
   sixteen wide ones, which is what this architecture actually pays for
   (tests/long-journal, `mount-home`). */

import { liveList, liveQuery, liveQueryWhen, journal } from './live/journal.svelte';
import { AREA_STATES_BEFORE_READ } from './areaState';
import { prefs } from './prefs/store.svelte';
import { fmtDay, fmtTime, fmtNumber } from './dates';
import { SPINE_FORWARD_DAYS } from './careSpine';
import { isLetterSnoozed, snoozeLetterTile } from './letterStatus';
import { isTileSnoozed, snoozeTile } from './liveTilesSnooze';
import { routeLabel } from './vocabulary/doseLabels';
import type { DoseRoute } from './types';
import { UNPROMPTED_ROWS, unpromptedQuiet } from '../unprompted/registry';
import {
  LIVE_TILE_ORDER,
  LIVE_TILE_PREF_KEY,
  composeHomeTiles,
  type HomeTile,
  type LiveTileKind
} from './liveTiles';

interface HomeTileGrid {
  /** Ordered, preference-gated, snooze-checked, uncapped. */
  readonly tiles: readonly HomeTile[];
  /** Whether every read behind the grid has answered, so `tiles` is the
      composition rather than the empty list it holds until then. One-way,
      like the `loading` it is made of. Home holds its reserve until this
      and its own reads agree (ticket 183). */
  readonly ready: boolean;
  /** The grid's own second hand, so a surface next to it that also counts
      up reads the same tick rather than starting a loop of its own. */
  readonly nowMs: number;
  /** Whether the dose panel is drawn, which is what Today withholds the
      agenda's `doseSlot` kind on (phase 11 ticket 03). Drawn is enough since
      functional-audit ticket 15: the panel names every regimen the agenda
      would have drawn a row for (`liveTiles.ts`, `panelDoses`). */
  readonly dosePanelDrawn: boolean;
  /** Snoozes a tile for 24 hours. Home calls it for the ready letter, whose
      dismiss opens a sheet on the route rather than acting in place; the
      other ten dismiss themselves. */
  snooze(kind: LiveTileKind): void;
}

/** Where a kind's snooze is kept, asked and written through one handle.

    The ready letter predates liveTilesSnooze.ts and kept a storage key of
    its own (letterStatus.ts), so it is the one kind read and written
    somewhere else - named once here rather than branched on at both the
    asking site and the writing site, which would be two places to fix if
    the letter ever adopted the general key. Nothing writes the four
    unsnoozeable tiles' keys, so asking is always false for them and the
    gate can stay uniform across all eleven. */
const snoozeStoreOf = (kind: LiveTileKind) =>
  kind === 'ready-letter'
    ? { snoozed: (nowMs: number) => isLetterSnoozed(nowMs), snooze: () => snoozeLetterTile() }
    : { snoozed: (nowMs: number) => isTileSnoozed(kind, nowMs), snooze: () => snoozeTile(kind) };

export function homeTiles(
  /** A getter, so the reads below follow the day across midnight. */
  today: () => number,
  handlers: {
    /** Home's own surface: the sheet offering a 24h snooze or a permanent
        off for the ready-letter tile. */
    onLetterDismiss: () => void;
  },
  active: () => boolean = () => true,
  /** Whether something else on the screen counts seconds and needs the
      clock to tick every second even when the wear tile reads nothing -
      Home's pinned wear row, which rides this clock (ADR-0051). */
  secondHand: () => boolean = () => false
): HomeTileGrid {
  const todayEpochDay = $derived(today());
  let nowTick = $state(Date.now());
  let snoozeRevision = $state(0);
  const snoozeMinute = $derived(Math.floor(nowTick / 60_000));

  /* Which areas are hidden or finished (phase 8 features ticket 04). One
     query for the whole grid rather than one per tile: the cascade is a
     property of the grid, and `unpromptedQuiet` is what spends this. */
  const areaStates = liveQuery((j) => j.areaStates.getAreaStates());

  /* A tile whose kind is switched off, or whose area is hidden or
     finished, issues no read at all (functional-audit ticket 14, the
     audit's architecture item 9). Each read below asks whether any tile it
     feeds is wanted before it touches the journal, and answers an empty
     value otherwise. The question is asked synchronously, before the
     read's first await, so switching a tile back on or unhiding its area
     re-runs the read (journal.svelte.ts: what a run reads before its first
     await is a dependency).

     A kind with an area waits for the area states to answer before its
     first run (`liveQueryWhen`): run early it would read a hidden area once
     and then go quiet, and run as "not wanted" it would answer empty and
     then arrive a round trip after the rest of the grid - a tile painting
     late on a cold open, which is what ticket 146's `composable` exists to
     prevent. Kinds with no area never read the states, so an area being
     hidden does not re-run them. */
  const AREA_OF = new Map(UNPROMPTED_ROWS.map((row) => [row.key, row.area]));
  const areaStatesAnswered = () => !areaStates.loading;
  function wanted(...kinds: LiveTileKind[]): boolean {
    return kinds.some((kind) => {
      if (!prefs[LIVE_TILE_PREF_KEY[kind]]) return false;
      if (AREA_OF.get(kind) == null) return true;
      return !unpromptedQuiet(kind, areaStates.value ?? AREA_STATES_BEFORE_READ, todayEpochDay);
    });
  }
  const none = <T,>(value: T) => Promise.resolve(value);

  const runningWear = liveQueryWhen(areaStatesAnswered, (j) =>
    wanted('wear-timer') ? j.wearSessions.getRunningSession() : none(null)
  );
  $effect(() => {
    if (!active()) return;
    nowTick = Date.now();
    const interval = runningWear.value || secondHand() ? 1000 : 60_000;
    const id = setInterval(() => (nowTick = Date.now()), interval);
    return () => clearInterval(id);
  });

  const episodes = liveList((j) => (wanted('dose-panel') ? j.regimen.getEpisodes() : none([])));
  const procedures = liveList((j) => (wanted('surgery-countdown') ? j.procedures.getProcedures() : none([])));
  const letters = liveList((j) => (wanted('ready-letter') ? j.letters.getLetterSeals(100) : none([])));
  const latestBadEntryId = liveQuery((j) =>
    wanted('safe-space-nudge') ? j.entries.latestBadMomentEntryId() : none(null)
  );
  const schedules = liveList((j) => (wanted('dose-panel') ? j.doses.getSchedules() : none([])));
  const dosePauses = liveList((j) => (wanted('dose-panel') ? j.doses.getPauses() : none([])));
  const scheduleDoses = liveList((j) =>
    wanted('dose-panel')
      ? j.doses.getDosesForSlots(todayEpochDay, todayEpochDay + SPINE_FORWARD_DAYS)
      : none([])
  );
  const yesterdayDoses = liveList((j) =>
    wanted('dose-panel') ? j.doses.getDoses(todayEpochDay - 1, todayEpochDay - 1) : none([])
  );

  function snooze(kind: LiveTileKind): void {
    snoozeStoreOf(kind).snooze();
    snoozeRevision += 1;
  }

  /* Which preference switches a tile off is the unprompted registry's to
     say - the same field Today's own editor draws its switch from - so
     this indexes the store by it rather than naming eleven preferences. */
  const gates = $derived.by(() => {
    snoozeRevision;
    snoozeMinute;
    const snoozeNow = Date.now();
    const enabled = {} as Record<LiveTileKind, boolean>;
    const snoozed = {} as Record<LiveTileKind, boolean>;
    for (const kind of LIVE_TILE_ORDER) {
      enabled[kind] = prefs[LIVE_TILE_PREF_KEY[kind]];
      snoozed[kind] = snoozeStoreOf(kind).snoozed(snoozeNow);
    }
    return { enabled, snoozed };
  });

  /* Every read behind the grid, named once so the composition below can wait
     for all of them. */
  const initialQueries = [
    runningWear,
    episodes,
    procedures,
    letters,
    latestBadEntryId,
    schedules,
    dosePauses,
    scheduleDoses,
    yesterdayDoses,
    areaStates
  ];
  /* Whether the grid may be composed yet (phase 11 ticket 146). Composed
     while the reads are still landing, it states an arrangement it does not
     mean: on a cold boot letters and tryouts answer before procedures, so the
     ready letter and the safe-space nudge take the top slots and the fold's
     label for a frame before the surgery countdown displaces them. Measured
     on the Home cold scene, that was the fold painting 243px wide against its
     resting 162px and then dropping its mark when the real label arrived, and
     the nudge painting 322x44 before snapping to 132x88 on the phone.

     A `$derived` rather than a latch. `loading` is one-way (readState.ts: a
     re-run after a write keeps the previous result rather than going pending
     again), so once the reads have answered this cannot fall back to false
     and take the whole grid off the screen again. */
  const composable = $derived(initialQueries.every((query) => !query.loading));

  const tiles = $derived.by(() => {
    if (!composable) return [];
    return composeHomeTiles({
      todayEpochDay,
      nowMs: nowTick,
      enabled: gates.enabled,
      snoozed: gates.snoozed,
      areaStates: areaStates.value ?? AREA_STATES_BEFORE_READ,
      reads: {
        runningWear: runningWear.value ?? null,
        episodes: episodes.rows,
        procedures: procedures.rows,
        letters: letters.rows,
        latestBadEntryId: latestBadEntryId.value,
        wearDurationCue: prefs.wearDurationCueEnabled,
        safeSpaceDismissedEntryId: prefs.safeSpaceNudgeDismissedEntryId,
        schedules: schedules.rows,
        dosePauses: dosePauses.rows,
        scheduleDoses: scheduleDoses.rows,
        yesterdayDoses: yesterdayDoses.rows
      },
      actions: {
        stopWear: (session) => {
          void journal.wearSessions.upsertSession({
            id: session.id,
            kind: session.kind,
            startTimestamp: session.startTimestamp,
            durationMs: Date.now() - session.startTimestamp,
            note: session.note
          });
        },
        dismissSafeSpace: (entryId) => {
          prefs.safeSpaceNudgeDismissedEntryId = entryId;
        },
        openLetterDismiss: handlers.onLetterDismiss
      },
      format: {
        number: fmtNumber,
        fullDay: (epochDay) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' }),
        /* The agenda band's own day format, so the dose panel's next slot
           and the rows under "Coming up" write a day the same way on the
           one screen that draws both. */
        weekdayDay: (epochDay) => fmtDay(epochDay, { weekday: 'long', day: 'numeric', month: 'long' }),
        time: (timestamp) => fmtTime(timestamp),
        /* An episode's route is free text in the type; routeLabel answers an
           unknown one with the text itself. */
        doseRoute: (route) => routeLabel(route as DoseRoute)
      }
    });
  });

  return {
    get tiles() {
      return tiles;
    },
    get ready() {
      return composable;
    },
    /* The grid's own clock, handed out so Home's pinned rows ride it rather
       than opening a second one (ADR-0051). The wear row counts up beside
       the wear tile and the two may not disagree by a second, which is only
       true while both read the same tick (phase 11 all-four-doors ticket
       02). */
    get nowMs() {
      return nowTick;
    },
    get dosePanelDrawn() {
      return tiles.some((tile) => tile.key === 'dose-panel');
    },
    snooze
  };
}
