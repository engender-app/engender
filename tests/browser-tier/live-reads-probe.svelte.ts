/* Browser-tier check for the phase 5 audit's deepening ticket 03: a live
   query resolves its own dependencies, so a screen the audit found showing
   a stale number updates when the data behind it changes.

   Here rather than in the Node tier because `liveQuery` is the rune-bearing
   half of the reactive layer (ADR-0017): what has to be proved is that the
   effect re-runs, which needs a real Svelte scheduler over a real journal.
   The registry side - which tables each read declares - is covered in
   writes.test.ts, and this is the other end of the same claim.

   The query is the one the screen makes, copied verbatim from
   settings/stock, so this fails if that screen's read stops resolving what
   it reads. The audit's other defect was settings/streak-goal, which phase 8
   UX ticket 01 deleted along with the streak. Rune-bearing, hence the
   .svelte.ts name: the plugin in browser-tier.vite.config.ts compiles
   this. */

import { flushSync } from 'svelte';
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { openJournal, type Journal } from '../../src/lib/data/journal/journal.ts';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import {
  attachJournal,
  journalIsOpen,
  liveQuery,
  liveQueryWatchingOnly,
  type LiveQuery
} from '../../src/lib/data/live/journal.svelte.ts';
import { readWhatIsWaiting, WAITING_TABLES } from '../../src/lib/data/comingBackReads.ts';
import { TRYOUT_FELT_SENSE_TABLES } from '../../src/lib/data/liveTiles.ts';
import { spanCoversDay } from '../../src/lib/data/span.ts';
import { freshOrigin, PROBE_DATA_KEY } from './fresh-origin.ts';

const publish = (value: unknown) => {
  (window as unknown as { __liveReadsProbeResult: unknown }).__liveReadsProbeResult = value;
  document.body.dataset.liveReadsProbeReady = 'true';
};

/** A fixed day rather than today's: every figure below is a fixture, and a
    projection that depends on the wall clock is a test that fails on a
    date. */
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

/** The timeout message, or null if the wait landed. A check that failed has to
    reach run.mjs as a reason rather than as a rejection: the other checks in
    this probe still have something to say. */
async function reasonIfNotReached(waiting: Promise<void>): Promise<string | null> {
  try {
    await waiting;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
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

  await journal.entries.upsertEntry({ epochDay: TODAY, mood: 4 });
  await journal.entries.upsertEntry({ epochDay: TODAY - 2, mood: 4 });

  // Stock: a count, and doses logged against it after it was recorded.
  await journal.stock.upsertEntry({ drug: 'estradiol', quantity: 10, unit: 'pills', recordedEpochDay: TODAY - 5 });
  await journal.doses.upsertDose({ timestamp: at(TODAY - 3), route: 'oral', dose: 2, doseUnit: 'mg' });

  // A tryout spanning TODAY, so the felt-sense loop below actually calls
  // `forTryout` rather than skipping every row.
  await journal.tryouts.upsertTryout({
    kind: 'name',
    label: 'Alicja',
    description: null,
    startEpochDay: TODAY - 10,
    endEpochDay: null
  });

  let projectionRuns = 0;
  let projectionQuery: LiveQuery<number>;
  let recapRuns = 0;
  let recapQuery: LiveQuery<number>;

  $effect.root(() => {
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

  await until(() => projectionRuns > 0, 'the stock projection query to answer');
  await until(() => recapRuns > 0, 'the narrowed recap query to answer');

  const projectionRunsBefore = projectionRuns;
  const recapRunsBefore = recapRuns;

  // The defect: the stock screen declared ['stock', 'dose'] for a projection
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
  const projectionError = await reasonIfNotReached(
    until(() => projectionRuns > projectionRunsBefore, 'the stock projection to be re-read after an episode edit')
  );

  /* And the escape still narrows: a milestone write is inside what a recap
     reads and outside what this query watches. Given a moment to be wrong in
     - a re-run would land within a flush and a round trip. */
  await journal.milestones.upsertMilestone({ name: 'HRT start', epochDay: TODAY - 20 });
  flushSync();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const recapRunsAfterMilestone = recapRuns;

  // Same query, a write it does watch: the narrowing is a narrowing, not a
  // query that stopped listening.
  await journal.entries.upsertEntry({ epochDay: TODAY - 1, mood: 3 });
  const recapError = await reasonIfNotReached(
    until(() => recapRuns > recapRunsAfterMilestone, 'the narrowed recap to be re-read after an entry write')
  );

  /* Ticket 14: a query whose reads all sit past its first `await` costs a
     wasted round trip unless seeded. `readWhatIsWaiting` is that shape only
     once something unrelated is awaited first, the way `/coming-back` awaits
     its gap before ever touching `j` - copied here rather than reduced away,
     since a direct `await readWhatIsWaiting(j, ...)` call is itself the
     query's first synchronous operation and never exhibits the bug at all.
     An unseeded run of the real shape should settle at two closure runs, a
     run seeded with WAITING_TABLES at one. */
  const gap = Promise.resolve(TODAY - 40);
  let unseededRuns = 0;
  let unseededQuery: LiveQuery<number>;
  let seededRuns = 0;
  let seededQuery: LiveQuery<number>;

  $effect.root(() => {
    unseededQuery = liveQuery(async (j) => {
      const since = await gap;
      const waiting = await readWhatIsWaiting(j, TODAY, since);
      unseededRuns += 1;
      return waiting?.items.length ?? 0;
    });
    seededQuery = liveQuery(async (j) => {
      const since = await gap;
      const waiting = await readWhatIsWaiting(j, TODAY, since);
      seededRuns += 1;
      return waiting?.items.length ?? 0;
    }, WAITING_TABLES);
  });

  await until(() => unseededQuery.value !== undefined, 'the unseeded waiting query to settle');
  await until(() => seededQuery.value !== undefined, 'the seeded waiting query to settle');
  // A second run, if one is coming, lands within a flush and a round trip -
  // the same margin the narrowing check above gives a write it does watch.
  flushSync();
  await new Promise((resolve) => setTimeout(resolve, 200));

  /* Home's per-tryout felt-sense read (liveTiles.svelte.ts): unlike
     `readWhatIsWaiting` above, its own first operation - `getTryouts` - is
     already synchronous, so it needs no unrelated await ahead of it to
     reproduce the late discovery; `forTryout`, called from inside the loop
     over the tryout list's own result, is what sits past the first await. */
  let unseededFeltSenseRuns = 0;
  let unseededFeltSenseQuery: LiveQuery<number>;
  let seededFeltSenseRuns = 0;
  let seededFeltSenseQuery: LiveQuery<number>;

  $effect.root(() => {
    const run = async (j: Journal) => {
      const rows = await j.tryouts.getTryouts();
      let seen = 0;
      for (const tryout of rows) {
        if (spanCoversDay(tryout, TODAY)) {
          await j.feltSense.forTryout(tryout.id);
          seen += 1;
        }
      }
      return seen;
    };
    unseededFeltSenseQuery = liveQuery(async (j) => {
      const seen = await run(j);
      unseededFeltSenseRuns += 1;
      return seen;
    });
    seededFeltSenseQuery = liveQuery(async (j) => {
      const seen = await run(j);
      seededFeltSenseRuns += 1;
      return seen;
    }, TRYOUT_FELT_SENSE_TABLES);
  });

  await until(() => unseededFeltSenseQuery.value !== undefined, 'the unseeded felt-sense query to settle');
  await until(() => seededFeltSenseQuery.value !== undefined, 'the seeded felt-sense query to settle');
  flushSync();
  await new Promise((resolve) => setTimeout(resolve, 200));

  /* /compare's sideStats (routes/compare/+page.svelte): `recap` is called
     synchronously as this closure's own first statement, so its declared
     tables - including 'dimension' - are registered before `dayAverages`
     runs past the `Promise.all` await, and `dayAverages` (writes.ts)
     declares no table `recap` doesn't already. No seed needed, left as a
     comment there rather than a change - this settles the claim with a
     real run count instead of a trace, and stands as the regression guard
     the by-hand reasoning alone cannot be: if a future edit ever widens
     `dayAverages`'s tables past `recap`'s, this starts failing. */
  let compareRuns = 0;
  let compareQuery: LiveQuery<number>;

  $effect.root(() => {
    compareQuery = liveQuery(async (j) => {
      const recap = await j.stats.recap(TODAY - 30, TODAY);
      const series = await j.stats.dayAverages('mood', TODAY - 30, TODAY);
      compareRuns += 1;
      return recap.entryCount + series.length;
    });
  });

  await until(() => compareQuery.value !== undefined, 'the compare-shaped query to settle');
  flushSync();
  await new Promise((resolve) => setTimeout(resolve, 200));

  publish({
    projection: { runsBefore: projectionRunsBefore, runsAfter: projectionRuns, error: projectionError },
    narrowed: {
      runsBefore: recapRunsBefore,
      afterMilestone: recapRunsAfterMilestone,
      afterEntry: recapRuns,
      error: recapError
    },
    seeding: { unseededRuns, seededRuns, unseededFeltSenseRuns, seededFeltSenseRuns, compareRuns }
  });
}

run().catch((e) => publish({ error: String((e as Error)?.stack ?? e) }));
