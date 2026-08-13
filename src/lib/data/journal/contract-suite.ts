/* The checks a driver has to pass to be a driver, written once and run on
   every tier (ticket 11).

   The Node tier runs them over node:sqlite and the Android tier runs them
   over SQLCipher through the Capacitor bridge, against the same journal
   code and the same assertions. That is the point: ADR-0017's seam is only
   real if the thing above it cannot tell the platforms apart, and the way
   to know is to ask both the same questions rather than to write each tier
   its own probe and hope they stayed comparable.

   It is framework-free on purpose. vitest cannot run in a WebView on a
   phone, so a suite expressed in `test()` and `assert` could not be the
   same suite in both places - which is how the browser tier ended up with
   hand-written probes that resemble the Node tests without being them.

   Scope: the behaviours that depend on the SQLite build or on the driver
   contract, not the journal's whole surface. Business rules that are pure
   TypeScript above the driver are already covered by the Node tier and
   would run identically here by construction. What varies by platform is
   what this asks about - FTS5, window functions, folding, the change
   counts, transaction rollback, and preferences over the same table. */

import { foldText } from '../fold.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import { openPreferences } from '../prefs/preferences.ts';
import { LATEST_SCHEMA_VERSION } from '../sqlite/migrations.ts';
import { thumbFileName } from '../photos/names.ts';
import type { Journal, PhotoFileStore } from './journal.ts';
import { openJournal } from './journal.ts';
import { sweepOrphanPhotos } from './photos.ts';

export interface ContractCheck {
  name: string;
  ok: boolean;
  /** What went wrong, or what the value was when it was right. */
  detail: string;
}

const show = (value: unknown): string => JSON.stringify(value);

/** Collects checks without throwing, so one failure does not hide the rest -
    a phone run is expensive enough that it should report everything it found. */
function recorder() {
  const checks: ContractCheck[] = [];

  function check(name: string, ok: boolean, detail: string) {
    checks.push({ name, ok, detail });
  }

  return {
    checks,
    equal(name: string, actual: unknown, expected: unknown) {
      const ok = show(actual) === show(expected);
      check(name, ok, ok ? show(actual) : `expected ${show(expected)}, got ${show(actual)}`);
    },
    /** Runs `body`, recording a thrown error as a failed check rather than
        letting it end the run. */
    async section(name: string, body: () => Promise<void>) {
      try {
        await body();
      } catch (error) {
        check(name, false, String((error as Error)?.stack ?? error));
      }
    }
  };
}

/**
 * Runs the contract against an already-migrated driver.
 *
 * The caller supplies the journal's file store because the two tiers hold
 * photos differently and this suite is not about photos (ticket 12 is).
 */
export async function runJournalContract(
  driver: SqliteDriver,
  files: PhotoFileStore
): Promise<ContractCheck[]> {
  const r = recorder();
  const journal: Journal = openJournal(driver, files);
  await journal.reconcileBuiltIns();

  await r.section('migrations', async () => {
    r.equal('the database is migrated to the current schema', await driver.getUserVersion(), LATEST_SCHEMA_VERSION);
  });

  /* ADR-0002 and ADR-0017: the journal turns "changed nothing" into a throw
     on an unknown id, so a driver that reports changes loosely would make
     unknown-id writes succeed silently. */
  await r.section('run() reports changes', async () => {
    const uuid = 'contract-run-row';
    const insert = await driver.run(
      'INSERT INTO entry (uuid, epoch_day, timestamp, updated_at) VALUES (?, 1, 1000, 1000)',
      [uuid]
    );
    const [row] = await driver.query<{ id: number }>('SELECT id FROM entry WHERE uuid = ?', [uuid]);
    const update = await driver.run('UPDATE entry SET updated_at = 2000 WHERE uuid = ?', [uuid]);
    const miss = await driver.run("UPDATE entry SET updated_at = 2000 WHERE uuid = 'no-such-row'");

    r.equal('an insert reports one change', insert.changes, 1);
    r.equal('lastInsertRowid is the row just inserted', insert.lastInsertRowid, row?.id);
    r.equal('a matching update reports one change', update.changes, 1);
    r.equal('an update that matches nothing reports no changes', miss.changes, 0);

    await driver.run('DELETE FROM entry WHERE uuid = ?', [uuid]);
  });

  await r.section('transactions roll back', async () => {
    const before = await countEntries(driver);
    try {
      await driver.transaction(async () => {
        await driver.run(
          "INSERT INTO entry (uuid, epoch_day, timestamp, updated_at) VALUES ('contract-rollback', 2, 1, 1)"
        );
        throw new Error('deliberate');
      });
    } catch {
      // expected; what matters is what the database kept
    }
    r.equal('a failed transaction leaves nothing behind', await countEntries(driver), before);
  });

  /* The reason the fold exists (ADR-0005): ł has no Unicode decomposition,
     so neither NFD folding nor FTS5's remove_diacritics reaches it, and the
     app has to fold on both sides of the index. A native build that tokenized
     differently would show up here and nowhere else. */
  await r.section('folded search', async () => {
    const notes = [
      'spałem w łóżko',
      'zażółć gęślą jaźń',
      'ćwiczenia rano',
      'Müller kupił bilet',
      'naïve idea'
    ];
    const ids: number[] = [];
    for (const [i, note] of notes.entries()) {
      ids.push(await journal.entries.upsertEntry({ epochDay: 500 + i, mood: 3, note }));
    }
    const found = async (query: string) =>
      (await journal.entries.searchEntries(query, [])).map((e) => e.note);

    r.equal("'lozko' finds 'spałem w łóżko'", await found('lozko'), ['spałem w łóżko']);
    r.equal("'zazolc' finds 'zażółć gęślą jaźń'", await found('zazolc'), ['zażółć gęślą jaźń']);
    r.equal("'cwiczenia' finds 'ćwiczenia rano'", await found('cwiczenia'), ['ćwiczenia rano']);
    r.equal("the accented form finds it too ('ŁÓŻKO')", await found('ŁÓŻKO'), ['spałem w łóżko']);
    r.equal("'gęślą' finds its own note", await found('gęślą'), ['zażółć gęślą jaźń']);
    r.equal('a prefix finds the word it starts', await found('cwicz'), ['ćwiczenia rano']);

    /* The half of ADR-0005 the fold does not do. ü and ï are outside
       foldText, so they reach the index intact and unicode61 folds them
       there - and the query has to arrive as one token for the same thing to
       happen on its side. Both directions are asked, because a build whose
       tokenizer folded differently would answer one and not the other, and
       that asymmetry is exactly what a new SQLite build can change. */
    r.equal("'muller' finds 'Müller kupił bilet'", await found('muller'), ['Müller kupił bilet']);
    r.equal('the accented spelling finds it too', await found('Müller'), ['Müller kupił bilet']);
    r.equal("'naive' finds 'naïve idea'", await found('naive'), ['naïve idea']);
    r.equal("'naïve' as typed finds it too", await found('naïve'), ['naïve idea']);
    r.equal("'kupil' finds it by the app's fold, in the same note", await found('kupil'), [
      'Müller kupił bilet'
    ]);

    // Edits and deletes have to leave the index, which is migration v3's
    // contentless_delete - a build without it fails here.
    await journal.entries.upsertEntry({ id: ids[0], note: 'ćwiczenia rano' });
    r.equal('an edited note stops being findable by its old text', await found('lozko'), []);
    await journal.entries.deleteEntry(ids[1]);
    r.equal('a deleted entry stops being findable', await found('zazolc'), []);

    /* Against the entries that actually have note text rather than against a
       number written here: a literal would be asserting that the database was
       empty when the suite started, which is a precondition nothing gives it
       and which would fail as a search bug the first time it was not true. */
    const [indexed] = await driver.query<{ n: number }>('SELECT COUNT(*) AS n FROM entry_fts');
    const [noted] = await driver.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM entry WHERE note IS NOT NULL AND note != ''"
    );
    r.equal('the index holds one row per entry that has note text', indexed.n, noted.n);

    for (const id of ids) await journal.entries.deleteEntry(id).catch(() => {});
  });

  /* The fold is shared code, so this cannot differ between tiers - but a
     platform that mangled the source encoding would show up here rather than
     as a confusing search miss above. */
  await r.section('the fold itself', async () => {
    r.equal('foldText strips Polish letterforms', foldText('Zażółć Gęślą Jaźń ŁÓŻKO'), 'zazolc gesla jazn lozko');
  });

  /* ADR-0012's streak is the codebase's only window function. A build
     compiled with SQLITE_OMIT_WINDOWFUNC fails here and nowhere else. */
  await r.section('window functions', async () => {
    for (const day of [1000, 1001, 1002, 1004]) {
      await journal.entries.upsertEntry({ epochDay: day, mood: 3, note: `day ${day}` });
    }
    r.equal('the streak counts the run ending today', await journal.stats.streak(1002), 3);
    r.equal('a run that ended before yesterday is not a streak', await journal.stats.streak(1010), 0);
    r.equal('a single day after a gap counts as one', await journal.stats.streak(1004), 1);
  });

  await r.section('entries round-trip', async () => {
    const id = await journal.entries.upsertEntry({ epochDay: 2000, mood: 4, note: 'a note' });
    const entry = await journal.entries.getEntry(id);
    r.equal('an entry reads back as it was written', [entry?.mood, entry?.note], [4, 'a note']);
  });

  await r.section('photo store and orphan sweep', async () => {
    const full = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const thumb = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7]);

    const entryId = await journal.entries.upsertEntry({ epochDay: 2111, mood: 3, note: 'photo owner' });
    const photoId = await journal.photos.attach({ entryId }, { full, thumb });
    const entry = await journal.entries.getEntry(entryId);
    const fileName = entry?.photos[0]?.fileName ?? null;

    r.equal('the attached photo is listed on its owner', entry?.photos.map((p) => p.id), [photoId]);
    r.equal('an attached photo has a stored file name', fileName == null, false);
    if (fileName == null) return;

    r.equal('the full photo has a size for archive packing', await files.size(fileName), full.length);
    r.equal(
      'the thumbnail has a size for archive packing',
      await files.size(thumbFileName(fileName)),
      thumb.length
    );

    await files.write('orphan-photo.jpg', new Uint8Array([1, 2, 3]));
    await files.write('orphan-photo-thumb.jpg', new Uint8Array([4, 5, 6]));
    await sweepOrphanPhotos(driver, files);

    r.equal('the sweep keeps referenced photo files', await files.read(fileName).then((v) => v != null), true);
    r.equal('the sweep removes orphan files', await files.read('orphan-photo.jpg').then((v) => v == null), true);
    r.equal('the sweep removes orphan thumbnails', await files.read('orphan-photo-thumb.jpg').then((v) => v == null), true);
  });

  /* ADR-0009: preferences live in SQLite and the boot cache mirrors them.
     Asked here because the pref table is the first thing the app reads on a
     phone, and a driver that mangled the round trip would surface as a
     device that quietly forgot its theme. */
  await r.section('preferences', async () => {
    const preferences = await openPreferences(driver);
    await preferences.set('theme', 'dark');
    const reopened = await openPreferences(driver);
    r.equal('a preference survives a reopen', reopened.get('theme'), 'dark');
    r.equal('a table with rows in it is not an empty first run', reopened.openedEmpty(), false);
  });

  return r.checks;
}

async function countEntries(driver: SqliteDriver): Promise<number> {
  const [row] = await driver.query<{ n: number }>('SELECT COUNT(*) AS n FROM entry');
  return row.n;
}
