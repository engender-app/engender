/* The half of the reactive layer that has no runes in it, so it can be
   tested at all: which tables a journal mutation writes, and the wrapper
   that announces them (ticket 08). */

import assert from 'node:assert/strict';
import { expect, test } from 'vitest';
import { journalWithBuiltIns } from '../journal/test-support.ts';
import type { Journal } from '../journal/journal.ts';
import { journalIsBusy } from '../journal-busy.ts';
import { JOURNAL_WIDE, observeWrites, tablesReadBy, tablesWrittenBy, TABLE_NAMES, type TableName } from './writes.ts';

async function observed() {
  const { journal, db } = await journalWithBuiltIns();
  const announced: TableName[][] = [];
  return { journal: observeWrites(journal, (tables) => announced.push([...tables])), announced, db };
}

test('a write announces exactly the tables it touched, and hands its result back', async () => {
  const { journal, announced } = await observed();

  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 4 });

  assert.equal(typeof id, 'number');
  // Photos, recordings and video notes too, because a save carries
  // additions and removals of all three.
  assert.deepEqual(announced, [['entry', 'photo', 'voiceRecording', 'videoNote']]);
});

test('hiding or finishing an area announces it, and a read of the states announces nothing', async () => {
  const { journal, announced } = await observed();

  /* The features spec reads these states on the hub and on Home, so a hide
     that announced nothing would leave the row it hid on screen until the
     next unrelated write - the class of staleness this whole module exists
     for (phase 8 deepening ticket 13). */
  await journal.areaStates.setAreasHidden(['measurements'], true);
  await journal.areaStates.setAreasFinished(['hairStages', 'hairPhotos'], 19900);
  assert.deepEqual(announced, [['areaState'], ['areaState']]);

  announced.length = 0;
  await journal.areaStates.getAreaStates();
  assert.deepEqual(announced, []);
});

test('a photo write announces its owners, not just the photo table', async () => {
  const { journal, announced } = await observed();
  const entryId = await journal.entries.upsertEntry({ epochDay: 100, mood: 4 });
  announced.length = 0;

  /* An entry carries its photos on the shape it is read back as, so an entry
     list that watched only the entry table kept showing a photo indicator for
     a photo that had just been deleted. */
  const photoId = await journal.photos.attach(
    { entryId },
    { full: new Uint8Array([1]), thumb: new Uint8Array([2]) }
  );
  await journal.photos.remove(photoId);

  assert.deepEqual(announced, [
    ['photo', 'entry', 'milestone'],
    ['photo', 'entry', 'milestone']
  ]);
});

test('a milestone save announces photos because it can preserve, remove or replace one', async () => {
  const { journal, announced } = await observed();

  await journal.milestones.upsertMilestone({
    name: 'HRT start',
    epochDay: 90,
    photo: {
      action: 'replace',
      photo: { full: new Uint8Array([1]), thumb: new Uint8Array([2]) }
    }
  });

  assert.deepEqual(announced, [['milestone', 'photo']]);
});

test('a write that reaches into another area announces both', async () => {
  const { journal, announced } = await observed();
  const tag = await journal.tags.addTag('gender', 'voice practice');
  await journal.entries.upsertEntry({ epochDay: 100, mood: 3, tags: [tag.id] });
  announced.length = 0;

  // Deleting a custom tag unlinks it from every entry carrying it, so an
  // entry list that ignored the tag tables would still be stale.
  await journal.tags.deleteTag(tag.id);

  assert.deepEqual(announced, [['tag', 'entry']]);
});

test('deleting an entry or a milestone announces photos too, because it takes their rows', async () => {
  const { journal, announced } = await observed();
  const id = await journal.entries.upsertEntry({ epochDay: 100, mood: 4 });
  const milestoneId = await journal.milestones.upsertMilestone({ name: 'HRT start', epochDay: 90 });
  announced.length = 0;

  await journal.entries.deleteEntry(id);
  await journal.milestones.deleteMilestone(milestoneId);

  assert.deepEqual(announced, [
    ['entry', 'photo', 'voiceRecording', 'videoNote'],
    ['milestone', 'photo', 'feltSense']
  ]);
});

test('reads announce nothing at all', async () => {
  const { journal, announced } = await observed();
  await journal.entries.upsertEntry({ epochDay: 100, mood: 4 });
  announced.length = 0;

  await journal.entries.entriesForDay(100);
  await journal.entries.recentDays(5);
  await journal.stats.streak(100);
  await journal.tags.getTagGroups();
  await journal.milestones.getMilestones();
  await journal.labs.getAnalytes();
  await journal.sideEffects.getSideEffects();
  await journal.reminders.getReminders();
  await journal.dimensions.getPresets();
  await journal.photos.inJournal();

  assert.deepEqual(announced, []);
});

test('a rejected write announces nothing: nothing changed, so nothing is stale', async () => {
  const { journal, announced } = await observed();

  await assert.rejects(journal.entries.upsertEntry({ epochDay: 100, note: '   ' }), /needs a mood/);
  await assert.rejects(journal.milestones.upsertMilestone({ id: 'nope', name: 'x', epochDay: 1 }), /unknown/);

  assert.deepEqual(announced, []);
});

test('reconciling built-ins announces the reference tables it may have filled', async () => {
  const { journal, announced } = await observed();

  await journal.reconcileBuiltIns();

  assert.deepEqual(announced, [
    [
      'tag',
      'dimension',
      'affirmation',
      'bodyRegion',
      'measurementType',
      'effectCategory',
      'personalEffectType',
      'entryTemplate'
    ]
  ]);
});

test('an import announces every table, because a restore rewrites the journal', async () => {
  const { journal, announced } = await observed();
  const snapshot = await journal.archive.snapshot();

  await journal.archive.merge({ journal: snapshot.journal, files: (async function* () {})() });

  assert.deepEqual(announced, [TABLE_NAMES]);
});

test('a Daylio preview commits through the observed journal the screen uses', async () => {
  const { journal, announced } = await observed();
  const csv = [
    'full_date,date,weekday,time,mood,activities,note_title,note',
    '2026-01-15,January 15,Thursday,07:15,Rad,,,from Daylio'
  ].join('\n');
  const preview = await journal.archive.previewDaylioImport(csv, { tagLabels: () => [] });

  const result = await journal.archive.commitDaylioImport(preview);

  assert.deepEqual(result, { entriesAdded: 1, tagsAdded: 0 });
  assert.deepEqual(announced, [TABLE_NAMES]);
});

/* The update guard hangs off the same wrapper (ticket 04). The reason it is
   here rather than at the call sites is that this is the one place that knows
   what a write is: a journal operation added next month is covered by
   classifying it, and a service worker cannot activate under it. */

test('a write holds the update guard open until it lands', async () => {
  const { journal } = await observed();
  assert.equal(journalIsBusy(), false);

  const saving = journal.entries.upsertEntry({ epochDay: 100, mood: 4 });
  assert.equal(journalIsBusy(), true, 'a save in flight has to block an update');
  await saving;

  assert.equal(journalIsBusy(), false);
});

test('a write that throws lets the guard go too', async () => {
  const { journal } = await observed();

  // Not just tidiness: a guard left open by a rejected save would keep the
  // app on an old release for the rest of the session, and no screen would
  // have anything to show for it.
  await assert.rejects(journal.entries.upsertEntry({ epochDay: 100, note: '   ' }));

  assert.equal(journalIsBusy(), false);
});

test('an Archive import holds the guard, because that is a write like any other', async () => {
  const { journal } = await observed();
  const snapshot = await journal.archive.snapshot();

  const importing = journal.archive.merge({
    journal: snapshot.journal,
    files: (async function* () {})()
  });
  assert.equal(journalIsBusy(), true);
  await importing;

  assert.equal(journalIsBusy(), false);
});

test('a read never holds the guard: an update during one interrupts nothing', async () => {
  const { journal } = await observed();

  const reading = journal.entries.recentDays(5);
  assert.equal(journalIsBusy(), false);
  await reading;
});

test('an operation classified as neither read nor write is rejected on sight', async () => {
  const { journal } = await journalWithBuiltIns();
  (journal.entries as unknown as Record<string, unknown>).recountEverything = () => Promise.resolve();

  assert.throws(
    () => observeWrites(journal, () => {}),
    /entries\.recountEverything/,
    'a new journal method has to be classified, or the queries over it go stale in silence'
  );
});

test('every operation the journal actually has is classified', async () => {
  const { journal } = await journalWithBuiltIns();
  // The guard above, aimed at the real thing: this fails the moment an area
  // grows a method and writes.ts is not told about it.
  assert.doesNotThrow(() => observeWrites(journal, () => {}));

  // And the wrapper is a Journal, so nothing downstream needs to know it is
  // not the one openJournal() returned.
  const wrapped: Journal = observeWrites(journal, () => {});
  assert.deepEqual(Object.keys(wrapped).toSorted(), Object.keys(journal).toSorted());
});

/* Which members of the journal are operations rather than areas of them, and
   the reason it matters twice over: this module wraps them itself instead of
   looking them up in OPERATIONS, and journal.svelte.ts's lazy proxy has to
   call them rather than build a facade of operations around them.

   That proxy knew `reconcileBuiltIns` by name alone until phase 5 audit
   ticket 13 added `discardEverything`, and the miss showed up only as
   "discardEverything is not a function" in a walkthrough run - a rune module
   the Node tier cannot import. This is the half of it that can be checked
   here: the list and the journal agreeing on which members are functions. */
test('the journal-wide operations are exactly the journal members that are functions', async () => {
  const { journal } = await journalWithBuiltIns();

  const functions = Object.entries(journal)
    .filter(([, member]) => typeof member === 'function')
    .map(([name]) => name);

  assert.deepEqual(functions.toSorted(), [...JOURNAL_WIDE].toSorted());
});

test('a whole area this module does not know about is rejected too', async () => {
  const { journal } = await journalWithBuiltIns();
  (journal as unknown as Record<string, unknown>).exports = { toCsv: () => Promise.resolve('') };

  // Not just a nicer message: an unclassified area used to be dropped from
  // the wrapper silently, so `journal.exports` would have been undefined at
  // every call site that reached for it.
  assert.throws(() => observeWrites(journal, () => {}), /journal\.exports is an area/);
});

test('tablesWrittenBy answers with the classified tables, and refuses anything else', () => {
  // Boot's trash purge reads this rather than carrying its own copy of
  // deleteEntry's tables (phase 5 audit ticket 02).
  expect(tablesWrittenBy('entries', 'deleteEntry')).toEqual(['entry', 'photo', 'voiceRecording', 'videoNote']);
  expect(() => tablesWrittenBy('entries', 'getEntry')).toThrow(/not a classified write/);
  expect(() => tablesWrittenBy('nosuchArea', 'deleteEntry')).toThrow(/not a classified write/);
});

test('tablesReadBy answers with the tables a read depends on, and refuses anything else', () => {
  // What a liveQuery resolves its dependencies from, instead of asking the
  // screen to name tables (phase 5 audit ticket 03).
  expect(tablesReadBy('journalingPauses', 'getPauses')).toEqual(['journalingPause']);
  expect(() => tablesReadBy('entries', 'upsertEntry')).toThrow(/not a classified read/);
  expect(() => tablesReadBy('nosuchArea', 'getEntry')).toThrow(/not a classified read/);
});

/* The two live defects the audit found, as the invariant that catches the
   class rather than the two instances: a write's tables and the tables of
   every read whose answer that write changes have to overlap, or the screen
   holding that read shows its old number forever with nothing to see. */
test('editing a journaling pause re-runs the streak read, the number the streak-goal screen shows', () => {
  // The screen declared ['entry'] for this read while Home declared both
  // tables, so the same streak went stale on one screen and not the other.
  const dependsOn = new Set(tablesReadBy('stats', 'streak'));
  for (const operation of ['upsertPause', 'deletePause'] as const) {
    const written = tablesWrittenBy('journalingPauses', operation);
    assert.ok(
      written.some((table) => dependsOn.has(table)),
      `journalingPauses.${operation} leaves stats.streak stale: writes ${written.join(', ')}, read depends on ${[...dependsOn].join(', ')}`
    );
  }
});

test('editing a regimen episode re-runs the stock projection, the run-out date the stock screen shows', () => {
  // The screen declared ['stock', 'dose'], and the projection reads the
  // episode history too - so ending an episode left the old run-out date up.
  const dependsOn = new Set(tablesReadBy('stock', 'getProjections'));
  for (const operation of ['upsertEpisode', 'endEpisode'] as const) {
    const written = tablesWrittenBy('regimen', operation);
    assert.ok(
      written.some((table) => dependsOn.has(table)),
      `regimen.${operation} leaves stock.getProjections stale: writes ${written.join(', ')}, read depends on ${[...dependsOn].join(', ')}`
    );
  }
});

/* The class of stale copy the audit found next, and the reason "at least one
   table" below cannot catch it: several areas answer out of other areas'
   reads rather than out of SQL of their own, and each one retyped the union
   of their tables by hand. A hand-typed union goes wrong in both directions.
   Short of a table, the composing read never re-runs on a write to the area
   it composes and the screen holding it shows its old answer forever. Long of
   one, it carries a dependency nothing behind it reads any more, which is a
   re-query on every unrelated write and a lie about what the read does.

   So the rule is equality rather than overlap: a composing read declares
   exactly the tables of the reads it performs. That is also what makes the
   list below unforgettable - a section added to one of the registries brings
   a table with it, and the union here is short of that table until somebody
   adds the read that brought it. */
type Read = readonly [area: string, operation: string];

interface ComposingRead {
  read: Read;
  /** Every read it performs, through the areas openJournal hands it. */
  composes: readonly Read[];
  /** A table one of those reads declares that this one deliberately does
      not, with the reason. Checked both ways below, so a narrowing that has
      stopped being true fails rather than sitting here. */
  narrows?: Partial<Record<TableName, string>>;
}

const COMPOSING_READS: readonly ComposingRead[] = [
  {
    // Every counter recomputed from the dose log and the episode history
    // (exposure.ts); this area owns no table at all.
    read: ['exposure', 'getCounters'],
    composes: [
      ['doses', 'getDoses'],
      ['regimen', 'getEpisodes']
    ]
  },
  {
    read: ['hormoneCurve', 'getCurves'],
    composes: [
      ['doses', 'getDoses'],
      ['regimen', 'getEpisodes'],
      ['labs', 'getUsedAnalytes'],
      ['labs', 'getResults']
    ]
  },
  {
    read: ['chartAnnotations', 'getAnnotations'],
    composes: [
      ['milestones', 'getMilestones'],
      ['regimen', 'getEpisodes'],
      ['doses', 'getPauses'],
      ['journalingPauses', 'getPauses'],
      ['tryouts', 'getTryouts'],
      ['procedures', 'getProcedures'],
      ['eras', 'getEras']
    ],
    narrows: {
      photo: 'an annotation is a name and a day: the milestone read it comes through carries photos it never draws'
    }
  },
  {
    // The hormone curve's own markers (phase 8 features ticket 15). Two of
    // the four are records with a day on them and two are days that stood
    // out against the person's own recent spread, which is why the tally and
    // entry reads are here at all.
    read: ['chartAnnotations', 'getCurveMarkers'],
    composes: [
      ['sideEffects', 'getSideEffectsInRange'],
      ['doses', 'getDoses'],
      ['regimen', 'getEpisodes'],
      ['stats', 'tallyTrend'],
      ['stats', 'bodyRegionReadings']
    ]
  },
  {
    // Its declaration is the section registry's own union
    // (clinicianSummary.ts's CLINICIAN_SUMMARY_TABLES), so this entry checks
    // the registry's per-section tables rather than a copy in writes.ts.
    read: ['clinicianSummary', 'getSummary'],
    composes: [
      ['regimen', 'getEpisodes'],
      ['doses', 'getDoses'],
      ['labs', 'getUsedAnalytes'],
      ['labs', 'getResults'],
      ['exposure', 'getCounters'],
      ['sideEffects', 'getSideEffectsInRange'],
      ['procedures', 'getProcedures'],
      ['procedures', 'getChecklist'],
      ['procedures', 'getPhotos'],
      ['checklists', 'getStandaloneChecklist']
    ]
  },
  {
    // Its own registry's union too (day.ts's DAY_TABLES), checked the same
    // way: one entry here per registered section's read.
    read: ['day', 'getDay'],
    composes: [
      ['entries', 'entriesForDay'],
      ['milestones', 'getMilestonesOnDay'],
      ['doses', 'getDoses'],
      ['labs', 'getResultsOnDay'],
      ['voiceBenchmarks', 'getBenchmarksOnDay'],
      ['measurements', 'getMeasurementsInRange'],
      ['sizeRecords', 'getRecordsOnDay'],
      ['sideEffects', 'getSideEffectsInRange'],
      ['personalEffects', 'getMarkersFirstNoticedOn'],
      ['cycleEvents', 'getCycleEventsInRange'],
      ['tally', 'getEventsOnDay'],
      ['wearSessions', 'getSessions'],
      ['feltSense', 'onDay'],
      ['hairProgress', 'getStagesOnDay'],
      ['hairProgress', 'getPhotosOnDay'],
      ['hairRemoval', 'getSessionsOnDay'],
      ['procedures', 'getDayRecords'],
      ['tryouts', 'getPhotosOnDay']
    ]
  },
  {
    read: ['journalBook', 'getBook'],
    composes: [
      ['entries', 'searchEntries'],
      ['tags', 'getTagGroups'],
      ['milestones', 'getMilestones'],
      ['sideEffects', 'getSideEffectsInRange'],
      ['stats', 'recap']
    ]
  },
  {
    read: ['correlationCards', 'getCards'],
    composes: [
      ['dimensions', 'getDimensions'],
      ['doses', 'getDoses'],
      ['stats', 'tagInsights'],
      ['stats', 'dayAverages']
    ]
  },
  {
    read: ['intervalMoodPattern', 'dayOfInterval'],
    composes: [
      ['stats', 'dayAverages'],
      ['doses', 'getDoses']
    ]
  },
  {
    // The custom fold reads no dose log: it folds by the epoch day itself.
    read: ['intervalMoodPattern', 'byCustomInterval'],
    composes: [['stats', 'dayAverages']]
  }
];

/** The read-only areas that answer out of SQL of their own rather than out
    of another area's read, and so have nothing to compose. Written down for
    the reason day.ts's opt-outs are: the check below is a full sweep of the
    read-only areas, so a new one is a failure here until somebody either
    lists what it composes or states that it composes nothing. Keyed on
    `keyof Journal` for the other half of that reason - an area that goes
    away, or a key mistyped, is a compile error rather than a line sitting
    here writing off an area that no longer exists. */
const READS_ITS_OWN_SQL: Partial<Record<keyof Journal, string>> = {
  stats:
    "its own aggregate SQL, ad hoc CTEs and all, which is why the union rule cannot reach it and its thirteen declarations stay hand-written. Three of them are checked from above, by the areas that compose them - recap, dayAverages and tagInsights; the other ten have the rule below and nothing more",
  textSearch: 'its own registry of per-area queries, whose union it already derives (SEARCH_TABLES)',
  voice: 'the recording rows dated, read straight off the driver',
  videos: 'the video-note rows dated, read straight off the driver'
};

test('a composing read declares exactly the tables of the reads it composes', () => {
  for (const { read, composes, narrows } of COMPOSING_READS) {
    const [area, operation] = read;
    const declared = new Set(tablesReadBy(area, operation));
    const composed = new Set(composes.flatMap(([a, o]) => tablesReadBy(a, o)));

    for (const table of Object.keys(narrows ?? {})) {
      assert.ok(
        composed.has(table as TableName),
        `journal.${area}.${operation} narrows ${table}, which none of the reads it composes declares any more`
      );
      assert.ok(
        !declared.has(table as TableName),
        `journal.${area}.${operation} narrows ${table} and declares it too`
      );
      composed.delete(table as TableName);
    }

    assert.deepEqual(
      [...declared].toSorted(),
      [...composed].toSorted(),
      `journal.${area}.${operation} does not declare what it reads: it composes ${[...composed].toSorted().join(', ')}`
    );
  }
});

test('every read-only area either says what it composes or says it reads its own SQL', async () => {
  const { journal } = await journalWithBuiltIns();
  const listed = new Set(COMPOSING_READS.map(({ read }) => read.join('.')));

  for (const [areaName, area] of Object.entries(journal)) {
    if (typeof area === 'function') continue; // a journal-wide operation, not an area
    const operations = Object.entries(area as Record<string, unknown>)
      .filter(([, implementation]) => typeof implementation === 'function')
      .map(([operation]) => operation);
    // An area that owns rows reads them itself; only the views over other
    // areas' rows are what this rule is about.
    const ownsRows = operations.some((operation) => {
      try {
        tablesWrittenBy(areaName, operation);
        return true;
      } catch {
        return false;
      }
    });
    if (ownsRows || areaName in READS_ITS_OWN_SQL) continue;

    for (const operation of operations) {
      assert.ok(
        listed.has(`${areaName}.${operation}`),
        `journal.${areaName}.${operation} is a read-only area's read that names neither the reads it composes nor a reason it composes none`
      );
    }
  }
});

test('nothing sits in the own-SQL list that composes reads after all', () => {
  const composing = new Set(COMPOSING_READS.map(({ read: [area] }) => area));
  for (const areaName of Object.keys(READS_ITS_OWN_SQL)) {
    assert.ok(!composing.has(areaName), `journal.${areaName} composes reads, so it does not read its own SQL alone`);
  }
});

test('every read the journal actually has declares at least one table', async () => {
  const { journal } = await journalWithBuiltIns();
  for (const [areaName, area] of Object.entries(journal)) {
    if (areaName === 'reconcileBuiltIns') continue;
    for (const [operation, implementation] of Object.entries(area as Record<string, unknown>)) {
      if (typeof implementation !== 'function') continue;
      let tables: TableName[];
      try {
        tables = tablesReadBy(areaName, operation);
      } catch {
        continue; // a write; tablesWrittenBy covers those
      }
      assert.ok(tables.length > 0, `journal.${areaName}.${operation} declares no table, so nothing re-runs it`);
    }
  }
});
