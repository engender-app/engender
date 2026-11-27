/* Collect Home tile queries, preferences, snoozes and writes here.
   liveTiles.ts owns the pure composition, ordering and contents
   (ADR-0016, ADR-0017). Call homeTiles() once while Home initializes to
   create the liveQuery and liveList effects.

   Read only the fact each tile displays. Eighteen narrow reads cross
   the worker boundary with fewer bytes than the previous sixteen wide
   reads (tests/long-journal, mount-home). */

import { liveList, liveQuery, liveQueryWhen, journal } from './live/journal.svelte';
import { AREA_STATES_BEFORE_READ } from './areaState';
import { prefs } from './prefs/store.svelte';
import { fmtDay, fmtTime, fmtNumber } from './dates';
import { SPINE_FORWARD_DAYS } from './careSpine';
import { isLetterSnoozed, snoozeLetterTile } from './letterStatus';
import { isTileSnoozed, snoozeTile } from './liveTilesSnooze';
import { acknowledgementStore } from './prefs/acknowledgementStore.svelte';
import { routeLabel } from './vocabulary/doseLabels';
import type { DoseRoute } from './types';
import { UNPROMPTED_ROWS, surfaceOn, unpromptedQuiet } from '../unprompted/registry';
import {
  LIVE_TILE_ORDER,
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
      and its own reads agree. */
  readonly ready: boolean;
  /** The grid's own second hand, so a surface next to it that also counts
      up reads the same tick rather than starting a loop of its own. */
  readonly nowMs: number;
  /** Whether the dose panel is drawn, which is what Today withholds the agenda's `doseSlot`
      kind on. Drawn is enough the panel names every regimen the agenda would have drawn a
      row for (`liveTiles.ts`, `panelDoses`). */
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
    ? { snoozed: (nowMs: number) => isLetterSnoozed(acknowledgementStore, nowMs), snooze: () => snoozeLetterTile(acknowledgementStore) }
    : { snoozed: (nowMs: number) => isTileSnoozed(kind, acknowledgementStore, nowMs), snooze: () => snoozeTile(kind, acknowledgementStore) };

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
      Home's pinned wear row, which rides this clock. */
  secondHand: () => boolean = () => false
): HomeTileGrid {
  const todayEpochDay = $derived(today());
  let nowTick = $state(Date.now());
  let snoozeRevision = $state(0);
  const snoozeMinute = $derived(Math.floor(nowTick / 60_000));

  /* Which areas are hidden or finished. One
     query for the whole grid rather than one per tile: the cascade is a
     property of the grid, and `unpromptedQuiet` is what spends this. */
  const areaStates = liveQuery((j) => j.areaStates.getAreaStates());

  /* Skip journal reads when every tile they feed is disabled, hidden or
     finished. Check preferences and area state before the first await so
     the live query sees those dependencies and reruns when needed.

     Use liveQueryWhen to wait for area state before the first query.
     This avoids reading hidden data or painting a late tile after an
     initial empty result. Tiles with no area do not depend on area state. */
  const AREA_OF = new Map(UNPROMPTED_ROWS.map((row) => [row.key, row.area]));
  const areaStatesAnswered = () => !areaStates.loading;
  function wanted(...kinds: LiveTileKind[]): boolean {
    return kinds.some((kind) => {
      if (!surfaceOn(prefs.surfaceOverrides, kind)) return false;
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

  /* Whether a tile is switched on is the unprompted registry's to say - its
     default and the person's `surfaceOverrides`, the same answer Today's own
     editor draws its switch from. */
  const gates = $derived.by(() => {
    snoozeRevision;
    snoozeMinute;
    const snoozeNow = Date.now();
    const enabled = {} as Record<LiveTileKind, boolean>;
    const snoozed = {} as Record<LiveTileKind, boolean>;
    for (const kind of LIVE_TILE_ORDER) {
      enabled[kind] = surfaceOn(prefs.surfaceOverrides, kind);
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
  /* Whether the grid may be composed yet. Composed
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
        readLetterIds: prefs.acknowledgements.readLetterIds,
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
    /* The grid's own clock, handed out so Home's pinned rows ride it rather than opening a
       second one. The wear row counts up beside the wear tile and the two may not disagree
       by a second, which is only true while both read the same tick. */
    get nowMs() {
      return nowTick;
    },
    get dosePanelDrawn() {
      return tiles.some((tile) => tile.key === 'dose-panel');
    },
    snooze
  };
}
