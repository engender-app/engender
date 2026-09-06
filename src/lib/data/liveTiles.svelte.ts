/* Home's live-tile grid, as one read (phase 8 deepening ticket 07).

   The eighteen queries behind the twelve tiles, the preference each tile
   answers to, its snooze, and the writes its controls make. What comes out
   is the ordered list Home draws and nothing else - the composition, the
   order and the twelve tiles' own content are liveTiles.ts's, which is a
   plain module so the Node tier can test them (ADR-0016, ADR-0017).

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

import { liveList, liveQuery, journal } from './live/journal.svelte';
import { prefs } from './prefs/store.svelte';
import { fmtDay, fmtTime } from './dates';
import { hairRemovalAreaName } from './vocabulary/labels';
import { spanCoversDay } from './span';
import { isLetterSnoozed, snoozeLetterTile } from './letterStatus';
import { isTileSnoozed, snoozeTile } from './liveTilesSnooze';
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
  todayEpochDay: number,
  handlers: {
    /** Home's own surface: the sheet offering a 24h snooze or a permanent
        off for the ready-letter tile. */
    onLetterDismiss: () => void;
  }
): HomeTileGrid {
  /* One clock for the grid. The wear timer needs a second hand, and every
     snooze comparison and the dose panel's "active now" ride the same tick
     rather than opening clocks of their own - which is also what makes a
     snooze taken here disappear the tile at once (ADR-0051: no second
     ambient loop, and this is not one; it moved off the route unchanged). */
  let nowTick = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (nowTick = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const runningWear = liveQuery((j) => j.wearSessions.getRunningSession());
  const episodes = liveList((j) => j.regimen.getEpisodes());
  const procedures = liveList((j) => j.procedures.getProcedures());
  const letters = liveList((j) => j.letters.getLetterSeals(100));
  const dueRevisits = liveList((j) => j.revisits.getDueRevisits(todayEpochDay));
  const latestBadEntryId = liveQuery((j) => j.entries.latestBadMomentEntryId());
  const tryouts = liveList((j) => j.tryouts.getTryouts());
  /* One statement for every active tryout at once, fed the list the line
     above already holds rather than reading it again. `tryouts.rows` is read
     synchronously, before the call, which is what makes this re-run when a
     tryout is added, ended or removed (journal.svelte.ts: reads after an
     await are invisible). */
  const tryoutFeltSense = liveQuery((j) =>
    j.feltSense.latestDaysForTryouts(
      tryouts.rows.filter((tryout) => spanCoversDay(tryout, todayEpochDay)).map((tryout) => tryout.id)
    )
  );
  const schedules = liveList((j) => j.doses.getSchedules());
  const dosePauses = liveList((j) => j.doses.getPauses());
  const todayDoses = liveList((j) => j.doses.getDoses(todayEpochDay, todayEpochDay));
  const latestBenchmarkDay = liveQuery((j) => j.voiceBenchmarks.lastWriteEpochDay(todayEpochDay));
  const journalingPauses = liveList((j) => j.journalingPauses.getPauses());
  /* Which areas are hidden or finished (phase 8 features ticket 04). One
     query for the whole grid rather than one per tile: the cascade is a
     property of the grid, and `unpromptedQuiet` is what spends this. */
  const areaStates = liveQuery((j) => j.areaStates.getAreaStates());
  const latestHairRemoval = liveQuery((j) => j.hairRemoval.latestSession(todayEpochDay));
  /* Two scalars asked as two scalars. The nudge wants how many measurements
     there are and the latest day, and the read used to fetch every
     measurement ever stored to reduce to exactly that. */
  const measurementCount = liveQuery((j) => j.measurements.countAll());
  const latestMeasurementDay = liveQuery((j) => j.measurements.lastWriteEpochDay(todayEpochDay));
  const todayAppointments = liveList((j) => j.appointments.getDayRecords(todayEpochDay));

  function snooze(kind: LiveTileKind): void {
    snoozeStoreOf(kind).snooze();
    nowTick = Date.now();
  }

  async function resumePause(pauseId: string, startEpochDay: number): Promise<void> {
    const endEpochDay = todayEpochDay - 1;
    if (endEpochDay < startEpochDay) {
      await journal.journalingPauses.deletePause(pauseId);
      return;
    }
    await journal.journalingPauses.upsertPause({ id: pauseId, startEpochDay, endEpochDay });
  }

  /* Which preference switches a tile off is the unprompted registry's to
     say - the same field /settings/live-tiles draws its switch from - so
     this indexes the store by it rather than naming eleven preferences. */
  const gates = $derived.by(() => {
    const enabled = {} as Record<LiveTileKind, boolean>;
    const snoozed = {} as Record<LiveTileKind, boolean>;
    for (const kind of LIVE_TILE_ORDER) {
      enabled[kind] = prefs[LIVE_TILE_PREF_KEY[kind]];
      snoozed[kind] = snoozeStoreOf(kind).snoozed(nowTick);
    }
    return { enabled, snoozed };
  });

  const tiles = $derived(
    composeHomeTiles({
      todayEpochDay,
      nowMs: nowTick,
      enabled: gates.enabled,
      snoozed: gates.snoozed,
      areaStates: areaStates.value ?? {},
      reads: {
        runningWear: runningWear.value ?? null,
        episodes: episodes.rows,
        procedures: procedures.rows,
        letters: letters.rows,
        dueRevisits: dueRevisits.rows,
        latestBadEntryId: latestBadEntryId.value,
        wearDurationCue: prefs.wearDurationCueEnabled,
        safeSpaceDismissedEntryId: prefs.safeSpaceNudgeDismissedEntryId,
        tryouts: tryouts.rows,
        latestFeltSenseByTryoutId: tryoutFeltSense.value ?? new Map(),
        schedules: schedules.rows,
        dosePauses: dosePauses.rows,
        todayDoses: todayDoses.rows,
        latestBenchmarkEpochDay: latestBenchmarkDay.value ?? null,
        journalingPauses: journalingPauses.rows,
        latestHairRemovalSession: latestHairRemoval.value ?? null,
        measurements: { count: measurementCount.value ?? 0, latestDay: latestMeasurementDay.value ?? null },
        todayAppointments: todayAppointments.rows
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
        openLetterDismiss: handlers.onLetterDismiss,
        dismissRevisit: (id) => void journal.revisits.deleteRevisit(id),
        resumePause: (pauseId, startEpochDay) => void resumePause(pauseId, startEpochDay),
        snooze
      },
      format: {
        fullDay: (epochDay) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' }),
        shortDay: (epochDay) => fmtDay(epochDay, { day: 'numeric', month: 'short' }),
        time: (timestamp) => fmtTime(timestamp),
        hairRemovalArea: hairRemovalAreaName
      }
    })
  );

  return {
    get tiles() {
      return tiles;
    },
    snooze
  };
}
