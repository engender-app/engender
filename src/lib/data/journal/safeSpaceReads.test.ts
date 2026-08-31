/* Safe Space's read-only contract, held across every source the screen now
   draws from (phase 5 deepening ticket 14, ADR-0037, CONTEXT: "Safe space").

   ADR-0037 made opening this screen write nothing, and ticket 52 built the
   dashboard on that promise. This ticket adds three more reads (letters,
   starred photos, and later a voice benchmark) beside the pool, the
   streak, the day averages and the snapshot history the screen already
   read - every one of them a place a future edit could slip in a write
   without the screen itself changing shape. So the contract is pinned
   here at the driver, on every read `src/routes/doubt/+page.svelte`
   performs on mount, rather than trusted to a re-reading of the diff. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { openJournal } from './journal.ts';
import { countingDriver, journalWithBuiltIns } from './test-support.ts';
import { EUPHORIA_TAG_KEYS } from '../vocabulary/builtins.ts';

const COUNTEREVIDENCE_LIMIT = 20;
const HISTORY_LIMIT = 50;
const TIMELINE_DAYS = 30;
const LETTER_LOOKBACK = 200;
const TODAY = 20_000;

test('opening Safe Space performs zero writes, across the pool, stats, snapshots, letters and starred photos', async () => {
  // Seed one of everything the screen now draws from, through an
  // unwrapped journal - only the reads below are held to zero writes.
  const { journal, db } = await journalWithBuiltIns();
  const taggedEntry = await journal.entries.upsertEntry({ epochDay: TODAY - 1, mood: 4, tags: ['e-happy'] });
  await journal.doubtJournal.saveSnapshot(TODAY, [{ epochDay: TODAY - 1, mood: 4, note: 'good day' }]);
  await journal.letters.addLetter({ epochDay: TODAY - 10, text: 'you made it here', unlockEpochDay: TODAY - 1 });
  const entryId = await journal.entries.upsertEntry({ epochDay: TODAY - 2, mood: 3 });
  const photoId = await journal.photos.attach(
    { entryId },
    { full: new Uint8Array([1, 2, 3]), thumb: new Uint8Array([4, 5, 6]) }
  );
  await journal.photos.setStarred(photoId, true);
  void taggedEntry;

  const counting = countingDriver(db);
  const reading = openJournal(counting.driver, fakeFileStore());
  counting.resetRoundTrips();

  await reading.entries.counterevidencePool(EUPHORIA_TAG_KEYS, COUNTEREVIDENCE_LIMIT);
  await reading.stats.streak(TODAY);
  await reading.stats.dayAverages('mood', TODAY - TIMELINE_DAYS + 1, TODAY);
  await reading.doubtJournal.getSnapshots(HISTORY_LIMIT);
  await reading.letters.getLetters(LETTER_LOOKBACK);
  await reading.photos.starredPhotos();

  assert.equal(counting.roundTrips().run, 0, 'opening Safe Space must not run a single write statement');
});
