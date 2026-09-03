/* Home's live-tile grid, as one read (phase 8 deepening ticket 07).

   The thirteen queries behind the eleven tiles, the preference each tile
   answers to, its snooze, and the writes its controls make. What comes out
   is the ordered list Home draws and nothing else - the composition, the
   order and the eleven tiles' own content are liveTiles.ts's, which is a
   plain module so the Node tier can test them (ADR-0016, ADR-0017).

   A `.svelte.ts` because the reads are runes: `liveQuery`/`liveList` are
   effects, and an effect has to be created while a component is
   initialising. `homeTiles()` is therefore called once from Home's script
   block, like activeFlag.svelte.ts and recordEditor.svelte.ts before it.

   Eight of these reads render nothing themselves. They existed on the route
   only to be arguments to a `shouldShow*` predicate whose answer the markup
   read, which is what kept the query and the rule from ever meeting. */

import { liveList, liveQuery, journal } from './live/journal.svelte';
import { prefs } from './prefs/store.svelte';
import { fmtDay, fmtTime } from './dates';
import { hairRemovalAreaName } from './vocabulary/labels';
import { isPausedOn } from './journalingPause';
import { isLetterSnoozed, snoozeLetterTile } from './letterStatus';
import { isTileSnoozed, snoozeTile } from './liveTilesSnooze';
import {
  LIVE_TILE_ORDER,
  LIVE_TILE_PREF_KEY,
  composeHomeTiles,
  type HomeTile,
  type LiveTileKind
} from './liveTiles';

export interface HomeTiles {
  /** Ordered, preference-gated, snooze-checked, uncapped. */
  readonly tiles: readonly HomeTile[];
  /** True until every read behind the grid has answered once. Home draws no
      loading state for the grid - a tile with no data does not qualify, so
      an unanswered read and a quiet one look the same on screen - and the
      field is here because the interface the spec settled declares it for
      the cap that follows. */
  readonly loading: boolean;
  /** Whether journaling is paused today, which is the pause tile's own
      trigger seen from outside: Home's streak line is hidden by it whether
      or not the tile is switched on, and reading it here saves a second
      subscription to the same table. */
  readonly pausedToday: boolean;
  /** Snoozes a tile for 24 hours. Home calls it for the ready letter, whose
      dismiss opens a sheet on the route rather than acting in place; the
      other ten dismiss themselves. */
  snooze(kind: LiveTileKind): void;
}

/** The letter tile keeps its own storage key, from before liveTilesSnooze.ts
    generalised the mechanism (letterStatus.ts). Nothing writes the other
    three unsnoozeable tiles' keys, so asking is always false for them and
    the gate can stay uniform. */
const snoozedAt = (kind: LiveTileKind, nowMs: number): boolean =>
  kind === 'ready-letter' ? isLetterSnoozed(nowMs) : isTileSnoozed(kind, nowMs);

export function homeTiles(
  todayEpochDay: number,
  handlers: {
    /** Home's own surface: the sheet offering a 24h snooze or a permanent
        off for the ready-letter tile. */
    onLetterDismiss: () => void;
  }
): HomeTiles {
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
  const letters = liveList((j) => j.letters.getLetters(100));
  const latestBadEntry = liveQuery((j) => j.entries.latestBadMomentEntry());
  const tryouts = liveList((j) => j.tryouts.getTryouts());
  /* The felt-sense read is per tryout and the tile needs the latest day of
     each, so it is one query answering a map rather than one query per
     tryout: the tile is deciding between them, and a screen cannot ask a
     variable number of questions. */
  const tryoutFeltSense = liveQuery(async (j) => {
    const rows = await j.tryouts.getTryouts();
    const latest = new Map<string, number | null>();
    for (const tryout of rows) {
      if (tryout.endEpochDay === null || tryout.endEpochDay >= todayEpochDay) {
        const entries = await j.feltSense.forTryout(tryout.id);
        latest.set(tryout.id, entries.length > 0 ? entries[0].epochDay : null);
      }
    }
    return latest;
  });
  const schedules = liveList((j) => j.doses.getSchedules());
  const dosePauses = liveList((j) => j.doses.getPauses());
  const todayDoses = liveList((j) => j.doses.getDoses(todayEpochDay, todayEpochDay));
  const voiceBenchmarks = liveList((j) => j.voiceBenchmarks.getBenchmarks());
  const journalingPauses = liveList((j) => j.journalingPauses.getPauses());
  const hairRemoval = liveList((j) => j.hairRemoval.getSessions());
  /* Counted and reduced in the query rather than on the way out: the nudge
     wants how many there are and the latest day, and holding every
     measurement in a derived to answer that would be a list nothing draws. */
  const measurements = liveQuery(async (j) => {
    const all = await j.measurements.getMeasurementsInRange(0, 999999);
    let latestDay: number | null = null;
    for (const measurement of all) {
      if (latestDay == null || measurement.epochDay > latestDay) latestDay = measurement.epochDay;
    }
    return { count: all.length, latestDay };
  });

  const reads = [
    runningWear,
    episodes,
    procedures,
    letters,
    latestBadEntry,
    tryouts,
    tryoutFeltSense,
    schedules,
    dosePauses,
    todayDoses,
    voiceBenchmarks,
    journalingPauses,
    hairRemoval,
    measurements
  ];

  function snooze(kind: LiveTileKind): void {
    if (kind === 'ready-letter') snoozeLetterTile();
    else snoozeTile(kind);
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
      snoozed[kind] = snoozedAt(kind, nowTick);
    }
    return { enabled, snoozed };
  });

  const tiles = $derived(
    composeHomeTiles({
      todayEpochDay,
      nowMs: nowTick,
      enabled: gates.enabled,
      snoozed: gates.snoozed,
      reads: {
        runningWear: runningWear.value ?? null,
        episodes: episodes.rows,
        procedures: procedures.rows,
        letters: letters.rows,
        latestBadEntryId: latestBadEntry.value?.id,
        safeSpaceDismissedEntryId: prefs.safeSpaceNudgeDismissedEntryId,
        tryouts: tryouts.rows,
        latestFeltSenseByTryoutId: tryoutFeltSense.value ?? new Map(),
        schedules: schedules.rows,
        dosePauses: dosePauses.rows,
        todayDoses: todayDoses.rows,
        voiceBenchmarks: voiceBenchmarks.rows,
        journalingPauses: journalingPauses.rows,
        hairRemovalSessions: hairRemoval.rows,
        measurements: measurements.value ?? { count: 0, latestDay: null }
      },
      actions: {
        stopWear: (session) => {
          void journal.wearSessions.upsertSession({
            id: session.id,
            startTimestamp: session.startTimestamp,
            durationMs: Date.now() - session.startTimestamp,
            note: session.note
          });
        },
        dismissSafeSpace: (entryId) => {
          prefs.safeSpaceNudgeDismissedEntryId = entryId;
        },
        openLetterDismiss: handlers.onLetterDismiss,
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

  const pausedToday = $derived(isPausedOn(journalingPauses.rows, todayEpochDay));
  const loading = $derived(reads.some((read) => read.loading));

  return {
    get tiles() {
      return tiles;
    },
    get loading() {
      return loading;
    },
    get pausedToday() {
      return pausedToday;
    },
    snooze
  };
}
