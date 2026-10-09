import { androidAutoExport } from '../../../src/lib/data/archive/android-auto-export-bridge';
import { runAndroidAutoExport } from '../../../src/lib/data/archive/android-auto-export';
import { openArchive } from '../../../src/lib/data/archive/pack';
import { emptyArchiveJournal } from '../../../src/lib/data/journal/archiveSections';
import { PREFERENCE_DEFAULTS } from '../../../src/lib/data/prefs/catalogue';
import type { ArchiveSnapshot } from '../../../src/lib/data/journal/archive';

const password = 'synthetic backup proof';
const journal = emptyArchiveJournal();
const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
journal.entries = Array.from({ length: 3300 }, (_, i) => ({
  uuid: uuid(i), epochDay: 17000 + i, timestamp: (17000 + i) * 86400000,
  mood: 4, note: `Journal day ${i}`, dims: { femininity: 60 }, tags: [],
  photos: [], recordings: [], videos: [], bodyRegions: {}, starred: false, presentationId: null
}));
const fileName = (index: number) => `${uuid(10000 + Math.floor(index / 2))}${index % 2 ? '-thumb' : ''}.jpg`;
const bytes = new Uint8Array(1024 * 1024);
for (let index = 0; index < bytes.length; index++) bytes[index] = (index * 31 + 17) % 256;
// A valid synthetic JPEG, padded to keep the streaming-size proof intact.
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 64;
const drawing = canvas.getContext('2d')!;
drawing.fillStyle = '#62749a';
drawing.fillRect(0, 0, 64, 64);
const jpeg = Uint8Array.from(atob(canvas.toDataURL('image/jpeg').split(',')[1]), c => c.charCodeAt(0));
bytes.set(jpeg);

const snapshot = (count: number): ArchiveSnapshot => {
  journal.entries[0].photos = Array.from({ length: Math.ceil(count / 2) }, (_, i) => ({
    id: uuid(10000 + i), fileName: fileName(i * 2), starred: false, epochDayOverride: null
  }));
  return {
    journal,
    files: Array.from({ length: count }, (_, i) => ({ name: fileName(i), length: bytes.length })),
    readFile: async () => bytes
  };
};
const preferences = { ...PREFERENCE_DEFAULTS, name: 'Backup proof' };

const probe = {
  result: null as unknown,
  ready: false,
  async run(count: number, scheduled = false) {
    probe.ready = false;
    let recorded: number | null = null;
    try {
      probe.result = { result: await runAndroidAutoExport(
        { snapshot: snapshot(count), snapshotAt: Date.now(), preferences },
        { scheduled, recordBackup: (at) => { recorded = at; } }
      ), recorded };
    } catch (error) { probe.result = { error: String(error) }; }
    probe.ready = true;
  },
  async recover(count: number) {
    probe.ready = false;
    try {
      const response = await fetch('./delivered.ttbackup');
      if (!response.ok || !response.body) throw new Error('archive not served');
      const reader = response.body.getReader();
      async function* source() {
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            yield part.value;
          }
        } finally { reader.releaseLock(); }
      }
      snapshot(count);
      const restored = await openArchive(source(), password);
      if (JSON.stringify(restored.payload.journal) !== JSON.stringify(journal)) throw new Error('rows differ');
      let recovered = 0;
      let decodedImage = false;
      for await (const file of restored.files) {
        if (file.name !== fileName(recovered) || file.bytes.length !== bytes.length) throw new Error('file differs');
        for (let i = 0; i < bytes.length; i++) {
          if (file.bytes[i] !== bytes[i]) throw new Error(`attachment byte differs: ${i}`);
        }
        if (recovered === 0) {
          const image = await createImageBitmap(new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }));
          if (image.width !== 64 || image.height !== 64) throw new Error('restored photo is not usable');
          image.close();
          decodedImage = true;
        }
        recovered++;
      }
      if (recovered !== count) throw new Error('attachment count differs');
      probe.result = { recovered, decodedImage, rows: restored.payload.journal.entries.length };
    } catch (error) { probe.result = { error: String(error) }; }
    probe.ready = true;
  },
  async prepareProtected() {
    probe.ready = false;
    try {
      const { setupJournalPassphrase } = await import('../../../src/lib/data/journal-passphrase');
      const { createAndroidSqlite } = await import('../../../src/lib/data/sqlite/android-driver');
      const { boot } = await import('../../../src/lib/data/sqlite/boot');
      const { openJournal } = await import('../../../src/lib/data/journal/journal');
      const { appPrivatePhotoFiles } = await import('../../../src/lib/data/photos/android-file-store');
      const { encryptedFileStore } = await import('../../../src/lib/data/photos/encrypted-file-store');
      const key = await setupJournalPassphrase('synthetic current journal credential');
      const sqlite = createAndroidSqlite('native-backup-protected.sqlite3', key);
      const opened = await boot({ createDriver: () => sqlite.driver, fileOps: sqlite.fileOps, requestPersistentStorage: sqlite.requestPersistentStorage });
      if (opened.phase === 'error') throw opened.error;
      const live = openJournal(sqlite.driver, encryptedFileStore(appPrivatePhotoFiles('native-backup-protected-photos'), key));
      const entryId = await live.entries.upsertEntry({ epochDay: 20000, mood: 4, note: 'Before cold deferral', dims: {}, tags: [] });
      await live.photos.attach({ entryId }, { full: jpeg, thumb: jpeg });
      const { openPreferences } = await import('../../../src/lib/data/prefs/preferences');
      const stored = await openPreferences(sqlite.driver);
      await stored.set('onboarded', true);
      const { writeCachedAccessMode } = await import('../../../src/lib/data/prefs/boot-cache');
      writeCachedAccessMode('passphrase');
      await sqlite.driver.close();
      key.fill(0);
      probe.result = { protectedClosed: true };
    } catch (error) { probe.result = { error: String(error) }; }
    probe.ready = true;
  },
  async catchUpProtected() {
    probe.ready = false;
    try {
      const { unlockJournalPassphrase } = await import('../../../src/lib/data/journal-passphrase');
      let rejectedWrongSecret = false;
      try { await unlockJournalPassphrase('wrong synthetic credential'); } catch { rejectedWrongSecret = true; }
      if (!rejectedWrongSecret) throw new Error('wrong journal credential accepted');
      const key = await unlockJournalPassphrase('synthetic current journal credential');
      const { createAndroidSqlite } = await import('../../../src/lib/data/sqlite/android-driver');
      const { openJournal } = await import('../../../src/lib/data/journal/journal');
      const { appPrivatePhotoFiles } = await import('../../../src/lib/data/photos/android-file-store');
      const { encryptedFileStore } = await import('../../../src/lib/data/photos/encrypted-file-store');
      const { attachJournal, journalIsOpen, journalIsClosing } = await import('../../../src/lib/data/live/journal.svelte');
      const { openPreferences } = await import('../../../src/lib/data/prefs/preferences');
      const { attachPreferences, prefs } = await import('../../../src/lib/data/prefs/store.svelte');
      const { startAutoExportScheduler, stopAutoExportScheduler } = await import('../../../src/lib/data/archive/auto-export-scheduler');
      const sqlite = createAndroidSqlite('native-backup-protected.sqlite3', key);
      const live = openJournal(sqlite.driver, encryptedFileStore(appPrivatePhotoFiles('native-backup-protected-photos'), key));
      await live.entries.upsertEntry({ epochDay: 20001, mood: 4, note: 'After authenticated unlock', dims: {}, tags: [] });
      await attachPreferences(await openPreferences(sqlite.driver));
      attachJournal(live);journalIsOpen();
      await androidAutoExport.setPassword({ password });
      const began = Date.now();
      startAutoExportScheduler();
      const deadline = began + 60000;
      let status = await androidAutoExport.status();
      while ((status.lastSnapshotAt ?? 0) < began && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 100));
        status = await androidAutoExport.status();
      }
      stopAutoExportScheduler();
      if ((status.lastSnapshotAt ?? 0) < began || status.deferredAt != null) throw new Error('production unlock scheduler did not catch up');
      const notes = (await live.archive.snapshot()).journal.entries.map(entry => entry.note);
      if (!notes.includes('Before cold deferral') || !notes.includes('After authenticated unlock')) throw new Error('live journal changed');
      await journalIsClosing();await sqlite.driver.close();key.fill(0);
      probe.result = { authenticated: true, wrongSecretRejected: true, liveJournalPreserved: true, capturedAt: status.lastSnapshotAt, deliveredAt: status.lastSuccessAt, backupAgeAt: prefs.lastBackupAt };
    } catch (error) { probe.result = { error: String(error) }; }
    probe.ready = true;
  },
  async recoverProtected() {
    probe.ready = false;
    try {
      const bytes = new Uint8Array(await (await fetch('./delivered.ttbackup')).arrayBuffer());
      const archive = await openArchive((async function*(){yield bytes;})(), password);
      const notes = archive.payload.journal.entries.map(entry => entry.note);
      if (!notes.includes('Before cold deferral') || !notes.includes('After authenticated unlock')) throw new Error('current journal rows absent from Archive');
      let attachments = 0;
      for await (const file of archive.files) {
        const image = await createImageBitmap(new Blob([file.bytes as Uint8Array<ArrayBuffer>], {type:'image/jpeg'}));
        if(image.width!==64||image.height!==64)throw new Error('protected photo not usable');image.close();attachments++;
      }
      if(attachments!==2)throw new Error('protected attachment count differs');
      const reopened = await openArchive((async function*(){yield bytes;})(), password);
      const { createAndroidSqlite } = await import('../../../src/lib/data/sqlite/android-driver');
      const { boot } = await import('../../../src/lib/data/sqlite/boot');
      const { openJournal } = await import('../../../src/lib/data/journal/journal');
      const { appPrivatePhotoFiles } = await import('../../../src/lib/data/photos/android-file-store');
      const { encryptedFileStore } = await import('../../../src/lib/data/photos/encrypted-file-store');
      const key = crypto.getRandomValues(new Uint8Array(32));
      const sqlite = createAndroidSqlite('native-backup-restored.sqlite3', key);
      const opened = await boot({ createDriver: () => sqlite.driver, fileOps: sqlite.fileOps, requestPersistentStorage: sqlite.requestPersistentStorage });
      if (opened.phase === 'error') throw opened.error;
      const restored = openJournal(sqlite.driver, encryptedFileStore(appPrivatePhotoFiles('native-backup-restored-photos'), key));
      await restored.archive.replace({ journal: reopened.payload.journal, files: reopened.files });
      const actual = await restored.archive.snapshot();
      if (JSON.stringify(actual.journal.entries) !== JSON.stringify(reopened.payload.journal.entries)) throw new Error('restored journal rows differ');
      if (actual.files.length !== 2) throw new Error('restored journal attachments absent');
      for (const file of actual.files) {
        const image = await createImageBitmap(new Blob([(await actual.readFile(file.name)) as Uint8Array<ArrayBuffer>], {type:'image/jpeg'}));
        if(image.width!==64||image.height!==64)throw new Error('restored journal photo not usable');image.close();
      }
      await sqlite.driver.close();key.fill(0);
      probe.result = { currentRows: true, attachments, decodedImage: true, publicRestore: true };
    } catch (error) { probe.result = { error: String(error) }; }
    probe.ready = true;
  },
  heldTransfer: null as string | null,
  async hold() {
    probe.ready = false;
    try {
      probe.heldTransfer = (await androidAutoExport.beginBackup({ fileName: 'auto-held.ttbackup', snapshotAt: Date.now() })).transferId;
      probe.result = { held: true };
    } catch (error) { probe.result = { error: String(error) }; }
    probe.ready = true;
  },
  async appendHeld() {
    probe.ready = false;
    try {
      await androidAutoExport.appendBackup({ transferId: probe.heldTransfer!, offset: 0, base64: btoa('GDIARY') });
      probe.result = { appended: true };
    } catch (error) { probe.result = { rejected: String(error) }; }
    probe.ready = true;
  },
  async abortHeld() {
    probe.ready = false;
    await androidAutoExport.abortBackup({ transferId: probe.heldTransfer! });
    probe.heldTransfer = null;
    probe.result = { aborted: true };
    probe.ready = true;
  },
  async disable() {
    probe.ready = false;
    try { probe.result = await androidAutoExport.configure({ enabled: false, schedule: 'weekly' }); }
    catch (error) { probe.result = { rejected: String(error) }; }
    probe.ready = true;
  },
  async concurrent() {
    probe.ready = false;
    const source = { snapshot: snapshot(2), snapshotAt: Date.now(), preferences };
    probe.result = { outcomes: await Promise.all([false, true].map(scheduled =>
      runAndroidAutoExport(source, { scheduled, recordBackup: () => {} }))) };
    probe.ready = true;
  },
  async invalid(kind: string) {
    probe.ready = false;
    const { transferId } = await androidAutoExport.beginBackup({ fileName: 'incomplete.ttbackup' });
    try {
      if (kind === 'interrupted') {
        await androidAutoExport.appendBackup({ transferId, offset: 0, base64: btoa('GDIARY') });
        await androidAutoExport.abortBackup({ transferId });
      } else if (kind === 'empty-piece') {
        await androidAutoExport.appendBackup({ transferId, offset: 0, base64: '' });
      }
      await androidAutoExport.finishBackup({ transferId, byteLength: 0, sha256: '0'.repeat(64) });
      probe.result = { error: 'invalid delivery accepted' };
    } catch (error) { probe.result = { rejected: String(error) }; }
    finally { await androidAutoExport.abortBackup({ transferId }); }
    probe.ready = true;
  }
};

Object.assign(window, { backupProbe: probe });
androidAutoExport.setPassword({ password }).then(() => { probe.ready = true; }).catch((error) => {
  probe.result = { error: String(error) };
  probe.ready = true;
});
