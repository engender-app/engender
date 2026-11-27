/* A tryout's entry read depends on the record's date range. Exercise
   real query round trips (ADR-0017) to hold the empty state until the
   record arrives. Assert rawEmptyBeforeRecord as the control case so
   the test exercises the original race. detailDraft.test.ts covers
   answersFor and the fill decision in Node. */

import { flushSync } from 'svelte';
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import {
  attachJournal,
  journalIsOpen,
  liveList,
  liveListIn,
  liveQuery,
  type LiveList
} from '../../src/lib/data/live/journal.svelte.ts';
import { gateBranch } from '../../src/lib/components/kit/readGate.ts';
import { answersFor } from '../../src/lib/components/kit/detailDraft.ts';
import { freshOrigin, PROBE_DATA_KEY } from './fresh-origin.ts';
import { publish } from '../probe-handshake.mjs';

const TODAY = 19_000;

async function until(settled: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt++) {
    flushSync();
    if (settled()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const NOTHING_IN_RANGE = { hits: [] as { id: number }[], total: 0 };

async function run() {
  await freshOrigin();
  const { driver, fileOps } = createEncryptedWebSqlite('detail-draft-probe.sqlite3', PROBE_DATA_KEY);
  const booted = await boot({ createDriver: () => driver, fileOps });
  if (booted.phase === 'error') {
    publish('detail-draft-probe', { error: String((booted.error as Error)?.stack ?? booted.error) });
    return;
  }

  const journal = attachJournal(openJournal(booted.driver, opfsPhotoFiles()));
  await journal.reconcileBuiltIns();

  const tryoutId = await journal.tryouts.upsertTryout({
    kind: 'name',
    label: 'Alex',
    startEpochDay: TODAY - 30,
    endEpochDay: null
  });
  // Entries inside that range, so an empty answer can only be the race.
  for (let day = TODAY - 20; day <= TODAY; day += 5) {
    await journal.entries.upsertEntry({ epochDay: day, mood: 4 });
  }

  /* Every branch either read showed, in order, from the first flush after
     the queries are made until both have settled. The race is a branch, not
     a final value: both reads end up right, and what went wrong was what was
     on screen in between. */
  const rawBranches: string[] = [];
  const gatedBranches: string[] = [];
  let recordRead: LiveList<{ id: string; startEpochDay: number; endEpochDay: number | null }>;
  let rawEntries: LiveList<{ id: number }>;
  let settled = false;

  $effect.root(() => {
    // The tryout the route names, read the way the screen reads it.
    recordRead = liveList((j) => j.tryouts.getTryouts());
    const record = $derived(recordRead.rows.find((t) => t.id === tryoutId));

    /* The screen's read as it was written before this ticket: beside the
       record, with a branch for not having one yet. */
    const rawQuery = liveQuery((j) => {
      const tryout = record;
      if (!tryout) return Promise.resolve(NOTHING_IN_RANGE);
      const range = { startEpochDay: tryout.startEpochDay, endEpochDay: tryout.endEpochDay };
      return Promise.all([
        j.entries.searchEntries('', [], range, 30),
        j.entries.countSearchMatches('', [], range)
      ]).then(([hits, total]) => ({ hits, total }));
    });
    rawEntries = liveListIn(rawQuery, (answer) => answer.hits);

    /* And through detailDraft's rule: the same read, tagged with what it was
       read for, so an answer computed without the record is still loading.
       `detailDraft` itself reads the route parameter, which no probe page
       has, so the tag is the record's own id here. */
    const taggedQuery = liveQuery(async (j) => {
      const tryout = record;
      if (!tryout) return { for: null, value: undefined };
      const range = { startEpochDay: tryout.startEpochDay, endEpochDay: tryout.endEpochDay };
      const [hits, total] = await Promise.all([
        j.entries.searchEntries('', [], range, 30),
        j.entries.countSearchMatches('', [], range)
      ]);
      return { for: tryout.id, value: { hits, total } };
    });
    const gatedEntries = liveListIn(
      {
        get value() {
          return answersFor(taggedQuery.value, tryoutId) ? taggedQuery.value!.value : undefined;
        },
        get loading() {
          return !answersFor(taggedQuery.value, tryoutId) && !taggedQuery.failed;
        },
        get failed() {
          return taggedQuery.failed;
        },
        get stale() {
          return answersFor(taggedQuery.value, tryoutId) && taggedQuery.stale;
        },
        retry: () => taggedQuery.retry()
      },
      (answer) => answer.hits
    );

    $effect(() => {
      const raw = gateBranch(rawEntries);
      const gated = gateBranch(gatedEntries);
      rawBranches.push(raw);
      gatedBranches.push(gated);
      if (raw === 'rows' && gated === 'rows') settled = true;
    });
  });

  journalIsOpen();
  await until(() => settled, 'the entries in the tryout range to arrive');

  publish('detail-draft-probe', {
    rawBranches,
    gatedBranches,
    rawEmptyBeforeRecord: rawBranches.slice(0, rawBranches.lastIndexOf('rows')).includes('empty'),
    gatedEmptyBeforeRecord: gatedBranches.slice(0, gatedBranches.lastIndexOf('rows')).includes('empty'),
    entriesFound: rawEntries!.rows.length
  });
}

run().catch((e) => publish('detail-draft-probe', { error: String((e as Error)?.stack ?? e) }));
