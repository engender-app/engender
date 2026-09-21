/* Browser-tier check for ticket 141: batching the demo seed's writes so a
   liveQuery watching the tables it touches re-runs once per seed rather than
   once per write.

   Here rather than the Node tier because `seedPersonaJournal`'s photos need
   a DOM (`journal-seed.ts`'s `demoPhoto`, `canvas.toBlob`) - the reason
   `returnGap.test.ts` gives for testing only its pure day-picking logic
   there. This drives the real seed against a real SQLite driver and a real
   Svelte scheduler, twice: once as the writes land unbatched (how
   `resetDemo` ran before ticket 141), once wrapped in `batchWrites` (how
   `reseed` runs it now) - counting how many times a Home-shaped liveQuery,
   watching only the table the seed's entry writes touch, re-runs each time. */
import { flushSync } from 'svelte';
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import { attachJournal, journalIsOpen, liveQuery, batchWrites, type LiveQuery } from '../../src/lib/data/live/journal.svelte.ts';
import { clearJournal, seedPersonaJournal } from '../../src/lib/data/demo/journal-seed.ts';
import { freshOrigin, PROBE_DATA_KEY } from './fresh-origin.ts';

const publish = (value: unknown) => {
  (window as unknown as { __demoSeedBatchingProbeResult: unknown }).__demoSeedBatchingProbeResult = value;
  document.body.dataset.demoSeedBatchingProbeReady = 'true';
};

/** A fixed day, the same reason `live-reads-probe.svelte.ts` picks one: the
    persona's own arc is relative to `today`, and nothing here should depend
    on the date the check happens to run. */
const TODAY = 19_000;

async function until(settled: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 3000; attempt++) {
    flushSync();
    if (settled()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function run() {
  await freshOrigin();
  const { driver, fileOps } = createEncryptedWebSqlite('demo-seed-batching-probe.sqlite3', PROBE_DATA_KEY);
  const booted = await boot({ createDriver: () => driver, fileOps });
  if (booted.phase === 'error') {
    publish({ error: String((booted.error as Error)?.stack ?? booted.error) });
    return;
  }

  const journal = attachJournal(openJournal(booted.driver, opfsPhotoFiles()));
  await journal.reconcileBuiltIns();

  let countRuns = 0;
  let countQuery!: LiveQuery<number>;
  $effect.root(() => {
    // Watches only 'entry' (the table `countAll` reads) - the same shape
    // Home's own entry count keys on, and precisely what the seed's entry
    // writes announce.
    countQuery = liveQuery(async (j) => {
      const count = await j.entries.countAll();
      countRuns += 1;
      return count;
    });
  });

  journalIsOpen();
  await until(() => countQuery.value !== undefined, 'the entry count query to answer the first time');

  // Unbatched: every write announces as it lands, the way `resetDemo` ran
  // before ticket 141.
  const runsBeforeUnbatched = countRuns;
  await seedPersonaJournal(journal, TODAY);
  const seededCount = await journal.entries.countAll();
  await until(() => countQuery.value === seededCount, 'the entry count query to catch up with the unbatched seed');
  const unbatchedRuns = countRuns - runsBeforeUnbatched;

  await clearJournal(journal);
  await until(() => countQuery.value === 0, 'the entry count query to see the clear');

  // Batched: the same seed, wrapped the way `reseed` wraps it now.
  const runsBeforeBatched = countRuns;
  await batchWrites(() => seedPersonaJournal(journal, TODAY));
  const reseededCount = await journal.entries.countAll();
  await until(() => countQuery.value === reseededCount, 'the entry count query to catch up with the batched seed');
  const batchedRuns = countRuns - runsBeforeBatched;

  publish({ seededCount, reseededCount, unbatchedRuns, batchedRuns });
}

run();
