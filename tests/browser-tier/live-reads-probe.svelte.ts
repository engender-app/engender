/* Browser-tier check for the phase 5 audit's deepening ticket 03: a live
   query resolves its own dependencies, so the two screens the audit found
   showing a stale number update when the data behind them changes.

   Here rather than in the Node tier because `liveQuery` is the rune-bearing
   half of the reactive layer (ADR-0017): what has to be proved is that the
   effect re-runs, which needs a real Svelte scheduler over a real journal.
   The registry side - which tables each read declares - is covered in
   writes.test.ts, and this is the other end of the same claim.

   The two queries are the ones the screens make, copied verbatim from
   settings/streak-goal and settings/stock, so this fails if either screen's
   read stops resolving what it reads. Rune-bearing, hence the .svelte.ts
   name: the plugin in browser-tier.vite.config.ts compiles this. */

import { flushSync } from 'svelte';
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import {
  attachJournal,
  journalIsOpen,
  liveQuery,
  liveQueryWatchingOnly,
  type LiveQuery
} from '../../src/lib/data/live/journal.svelte.ts';
import { freshOrigin, PROBE_DATA_KEY } from './fresh-origin.ts';

const publish = (value: unknown) => {
  (window as unknown as { __liveReadsProbeResult: unknown }).__liveReadsProbeResult = value;
  document.body.dataset.liveReadsProbeReady = 'true';
};

/** A fixed day rather than today's: every figure below is a fixture, and a
    streak that depends on the wall clock is a test that fails on a date. */
const TODAY = 19_000;
const at = (epochDay: number) => epochDay * 86_400_000;

/** Flushes and waits until `settled` holds, so a check can say what it was
    waiting for instead of timing out anonymously. A query is a round trip, so
    the wait is real time rather than a flush. */
async function until(settled: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt++) {
    flushSync();
    if (settled()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function run() {
  await freshOrigin();
  const { driver, fileOps } = createEncryptedWebSqlite('live-reads-probe.sqlite3', PROBE_DATA_KEY);
  const booted = await boot({ createDriver: () => driver, fileOps });
  if (booted.phase === 'error') {
    publish({ error: String((booted.error as Error)?.stack ?? booted.error) });
    return;
  }

  // The wrapper boot hands back: writes through it announce their tables,
  // which is what a query re-runs on.
  const journal = attachJournal(openJournal(booted.driver, opfsPhotoFiles()));
  await journal.reconcileBuiltIns();

  /* A streak of one with a gap behind it: today has an entry, yesterday does
     not, the day before does. Declaring a pause over yesterday bridges the
     gap and the streak becomes 2 (CONTEXT: "Streak"). */
  await journal.entries.upsertEntry({ epochDay: TODAY, mood: 4 });
  await journal.entries.upsertEntry({ epochDay: TODAY - 2, mood: 4 });

  // Stock: a count, and doses logged against it after it was recorded.
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 10, unit: 'pills', recordedEpochDay: TODAY - 5 });
  await journal.doses.upsertDose({ timestamp: at(TODAY - 3), route: 'oral', dose: 2, doseUnit: 'mg' });

  let streakQuery: LiveQuery<number>;
  let projectionRuns = 0;
  let projectionQuery: LiveQuery<number>;
  let recapRuns = 0;
  let recapQuery: LiveQuery<number>;

  $effect.root(() => {
    // settings/streak-goal's own read.
    streakQuery = liveQuery((j) => j.stats.streak(TODAY));

    // settings/stock's own read, counting its runs: what the screen shows is
    // a projected date, and what this has to catch is the read happening
    // again at all.
    projectionQuery = liveQuery(async (j) => {
      const rows = await j.stock.getProjections(TODAY);
      projectionRuns += 1;
      return rows.length;
    });

    /* The narrowing escape, with WrappedHomeCard's own tables: a recap reads
       milestones too, and this deliberately does not watch them. */
    recapQuery = liveQueryWatchingOnly(['entry'], async (j) => {
      const recap = await j.stats.recap(TODAY - 30, TODAY);
      recapRuns += 1;
      return recap.entryCount;
    });
  });

  journalIsOpen();

  await until(() => streakQuery!.value !== undefined, 'the streak query to answer');
  await until(() => projectionRuns > 0, 'the stock projection query to answer');
  await until(() => recapRuns > 0, 'the narrowed recap query to answer');

  const streakBefore = streakQuery!.value;
  const projectionRunsBefore = projectionRuns;
  const recapRunsBefore = recapRuns;

  // The first defect: the streak-goal screen declared ['entry'] for a read
  // that also reads journaling pauses, so this write reached nothing.
  await journal.journalingPauses.upsertPause({ startEpochDay: TODAY - 1, endEpochDay: TODAY - 1, reason: null });
  let streakAfter: number | undefined;
  let streakError: string | null = null;
  try {
    await until(() => streakQuery!.value !== streakBefore, 'the streak to be re-read after a pause was declared');
    streakAfter = streakQuery!.value;
  } catch (e) {
    streakError = (e as Error).message;
    streakAfter = streakQuery!.value;
  }

  // The second: the stock screen declared ['stock', 'dose'] for a projection
  // that reads the regimen episode history too.
  await journal.regimen.upsertEpisode({
    drug: 'estradiol',
    ester: null,
    dose: 2,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: TODAY - 5,
    endEpochDay: null
  });
  let projectionError: string | null = null;
  try {
    await until(() => projectionRuns > projectionRunsBefore, 'the stock projection to be re-read after an episode edit');
  } catch (e) {
    projectionError = (e as Error).message;
  }

  /* And the escape still narrows: a milestone write is inside what a recap
     reads and outside what this query watches. Given a moment to be wrong in
     - a re-run would land within a flush and a round trip. */
  await journal.milestones.upsertMilestone({ name: 'HRT start', epochDay: TODAY - 20 });
  await until(() => true, 'a flush');
  await new Promise((resolve) => setTimeout(resolve, 200));
  const recapRunsAfterMilestone = recapRuns;

  // Same query, a write it does watch: the narrowing is a narrowing, not a
  // query that stopped listening.
  await journal.entries.upsertEntry({ epochDay: TODAY - 1, mood: 3 });
  let recapError: string | null = null;
  try {
    await until(() => recapRuns > recapRunsAfterMilestone, 'the narrowed recap to be re-read after an entry write');
  } catch (e) {
    recapError = (e as Error).message;
  }

  publish({
    streak: { before: streakBefore, after: streakAfter, error: streakError },
    projection: { runsBefore: projectionRunsBefore, runsAfter: projectionRuns, error: projectionError },
    narrowed: {
      runsBefore: recapRunsBefore,
      afterMilestone: recapRunsAfterMilestone,
      afterEntry: recapRuns,
      error: recapError
    }
  });
}

run().catch((e) => publish({ error: String((e as Error)?.stack ?? e) }));
