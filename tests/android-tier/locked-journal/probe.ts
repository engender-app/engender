import { appPrivatePhotoFiles } from '../../../src/lib/data/photos/android-file-store';
import { encryptedFileStore } from '../../../src/lib/data/photos/encrypted-file-store';
import { setupJournalPin } from '../../../src/lib/data/journal-pin';
import { createAndroidSqlite } from '../../../src/lib/data/sqlite/android-driver';
import { boot } from '../../../src/lib/data/sqlite/boot';
import { openJournal } from '../../../src/lib/data/journal/journal';
import { openPreferences } from '../../../src/lib/data/prefs/preferences';
import { localStorageCache, writeCachedAccessMode } from '../../../src/lib/data/prefs/boot-cache';

async function seed() {
  const key = await setupJournalPin('1234');
  const { driver, fileOps } = createAndroidSqlite('engender.sqlite3', key);
  try {
    const result = await boot({ createDriver: () => driver, fileOps });
    if (result.phase === 'error') throw result.error;
    const prefs = await openPreferences(driver, localStorageCache());
    await prefs.set('onboarded', true);
    await prefs.set('language', 'en');
    await prefs.set('lockAfter', 'immediately');
    await prefs.set('name', 'locked-journal-private-name-49');
    writeCachedAccessMode('pin');
    const journal = openJournal(driver, encryptedFileStore(appPrivatePhotoFiles('photos'), key));
    await journal.reconcileBuiltIns();
    const date = new Date();
    const today = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
    await journal.entries.upsertEntry({ epochDay: today, mood: 4, note: 'locked-journal-private-note-49', dims: {}, tags: [] });
  } finally { await driver.close(); key.fill(0); }
}
seed().then(() => { document.body.dataset.lockFixture = 'ready'; }).catch(error => {
  document.body.dataset.lockFixture = String(error);
});
