import { mount, unmount, flushSync } from 'svelte';
import { boot } from '../src/lib/data/sqlite/boot';
import { createEncryptedWebSqlite } from '../src/lib/data/sqlite/mc-driver';
import { createAndroidSqlite } from '../src/lib/data/sqlite/android-driver';
import { setupJournalPassphrase, unlockJournalPassphrase } from '../src/lib/data/journal-passphrase';
import { readKeystoreFile, readKeystoreSource } from '../src/lib/data/keystore-file';
import { sweepOrphanPhotos } from '../src/lib/data/journal/photos';
import { openJournal } from '../src/lib/data/journal/journal';
import { opfsPhotoFiles } from '../src/lib/data/photos/opfs-file-store';
import { appPrivatePhotoFiles } from '../src/lib/data/photos/android-file-store';
import { encryptedFileStore } from '../src/lib/data/photos/encrypted-file-store';
import { openPreferences } from '../src/lib/data/prefs/preferences';
import { attachPreferences, flushPreferences, prefs } from '../src/lib/data/prefs/store.svelte';
import { attachJournal, journalIsOpen, journalIsClosing } from '../src/lib/data/live/journal.svelte';
import { runRestore } from '../src/lib/data/journal/restoreFlow';
import { setPhotoFiles } from '../src/lib/stores/photoFiles';
import { packArchive, openArchive } from '../src/lib/data/archive/pack';
import { collect } from '../src/lib/data/archive/container';
import { portablePreferences, type PortablePreferences } from '../src/lib/data/archive/payload';
import { PREFERENCE_DEFAULTS } from '../src/lib/data/prefs/catalogue';
import { seedRecoveryJournal, journalEvidence, reconcileRecovery, RECOVERY_PASSWORD, digest, type RecoveryEvidence } from './archive-recovery-fixture';
import PhotoViewer from '../src/lib/components/PhotoViewer.svelte';
import VoicePlayer from '../src/lib/components/VoicePlayer.svelte';
import VideoNotePlayer from '../src/lib/components/VideoNotePlayer.svelte';
import DocumentPage from '../src/routes/media/documents/[id]/+page.svelte';
import { page } from './browser-tier/screen-router.svelte';
import { runAndroidAutoExport } from '../src/lib/data/archive/android-auto-export';
import { androidAutoExport } from '../src/lib/data/archive/android-auto-export-bridge';

const encode = (bytes: Uint8Array) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
};
const decode = (text: string) => Uint8Array.from(atob(text), (letter) => letter.charCodeAt(0));
async function* oneShot(bytes: Uint8Array) { yield bytes; }
const ensure = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };

export function installRecoveryProbe(kind: 'web' | 'android') {
  // Keys stay inside each installation. Only ciphertext and expected invented data leave.
  let key: Uint8Array<ArrayBuffer>;
  const identity = crypto.randomUUID();
  let files: import('../src/lib/data/journal/journal').PhotoFileStore;
  const create = () => kind === 'web' ? createEncryptedWebSqlite('recovery.sqlite3', key) : createAndroidSqlite('recovery.sqlite3', key);
  let opened: Awaited<ReturnType<typeof open>>;
  async function open() {
    const sqlite = create();
    const booted = await boot({ createDriver: () => sqlite.driver, fileOps: sqlite.fileOps });
    if (booted.phase === 'error') throw booted.error;
    const journal = openJournal(booted.driver, files);
    await journal.reconcileBuiltIns();
    await sweepOrphanPhotos(booted.driver, files);
    attachJournal(journal);
    journalIsOpen();
    setPhotoFiles(files);
    const preferences = await openPreferences(booted.driver);
    await attachPreferences(preferences);
    return { driver: booted.driver, journal, preferences };
  }
  const probe = {
    ready: true, result: null as unknown,
    async command(name: string, input?: { archive: string; expected: RecoveryEvidence; portable: PortablePreferences }) {
      probe.ready = false;
      try { probe.result = await execute(name, input); }
      catch (error) { probe.result = { error: String((error as Error).stack ?? error) }; }
      probe.ready = true;
    }
  };
  async function execute(name: string, input?: { archive: string; expected: RecoveryEvidence; portable: PortablePreferences }) {
    if (!key) {
      key = await setupJournalPassphrase(`independent installation ${identity}`);
      files = encryptedFileStore(kind === 'web' ? opfsPhotoFiles('recovery-photos') : appPrivatePhotoFiles('recovery-photos'), key);
    }
    opened ??= await open();
    if (name === 'source' || name === 'automatic') {
      await seedRecoveryJournal(opened.driver, opened.journal);
      Object.assign(prefs, { name: 'Recovery source', theme: 'dark', palette: 'lesbian', voiceComfortLowHz: 130 });
      await flushPreferences();
      const portable = portablePreferences(prefs);
      const expected = await journalEvidence(opened.journal, files);
      const snapshot = await opened.journal.archive.snapshot();
      if (name === 'automatic') {
        await androidAutoExport.setPassword({ password: RECOVERY_PASSWORD });
        const result = await runAndroidAutoExport({ snapshot, snapshotAt: Date.now(), preferences: prefs }, { scheduled: true, recordBackup: () => {} });
        ensure(result.outcome === 'staged', `automatic producer did not stage: ${JSON.stringify(result)}`);
        return { identity, expected, portable, staged: true };
      }
      const archive = await collect(packArchive({ ...snapshot, preferences: portable }, RECOVERY_PASSWORD));
      await journalIsClosing();
      await opened.driver.close();
      return { identity, archive: encode(archive), archiveSha256: await digest(archive), expected, portable, sourceClosed: true };
    }
    ensure(input, 'missing recovery input');
    const archive = decode(input!.archive);
    await opened.preferences.set('lockAfter', 'immediately');
    await opened.preferences.set('disguise', true);
    await opened.preferences.set('autoExportEnabled', true);
    await opened.preferences.set('autoExportSchedule', 'monthly');
    Object.assign(prefs, opened.preferences.all());
    // Real destination credentials are deliberately independent of the Archive password.
    localStorage.setItem('recovery-destination-access-marker', identity);
    const local = () => ({ lockAfter: prefs.lockAfter, disguise: prefs.disguise, enabled: prefs.autoExportEnabled, schedule: prefs.autoExportSchedule, access: localStorage.getItem('recovery-destination-access-marker') });
    const beforeLocal = JSON.stringify(local());
    const accessBefore = JSON.stringify(await readKeystoreFile());
    ensure(await readKeystoreSource() === 'passphrase', 'destination access mode was not configured');
    const nativeBefore = kind === 'android' ? await androidAutoExport.status() : null;
    await opened.journal.entries.upsertEntry({ epochDay: 22000, mood: 2, note: 'destination sentinel' });
    const before = await journalEvidence(opened.journal, files);
    const picked = (bytes: Uint8Array) => ({ name: 'recovery.ttbackup', bytes: () => oneShot(bytes) });
    const failures: string[] = [];
    const corrupt = archive.slice(); corrupt[corrupt.length - 1] ^= 1;
    const tooNew = archive.slice(); tooNew[7] = 99;
    for (const [label, bytes, password] of [
      ['wrong password', archive, 'source recovery key cannot open Archive'],
      ['truncated', archive.subarray(0, archive.length - 7), RECOVERY_PASSWORD],
      ['authentication', corrupt, RECOVERY_PASSWORD],
      ['too-new', tooNew, RECOVERY_PASSWORD]
    ] as const) {
      const result = await runRestore(picked(bytes), password, 'replace', () => {});
      ensure(!result.ok, `rejected import falsely succeeded: ${label}`);
      reconcileRecovery(await journalEvidence(opened.journal, files), before);
      ensure(JSON.stringify(local()) === beforeLocal, `local preferences changed after ${label}`);
      failures.push(label);
    }
    const interrupted = await openArchive(oneShot(archive), RECOVERY_PASSWORD);
    async function* interruptedFiles() {
      for await (const file of interrupted.files) { yield file; throw new Error('recovery interrupted after first file'); }
    }
    try { await opened.journal.archive.replace({ journal: interrupted.payload.journal, files: interruptedFiles() }); throw new Error('interrupted restore succeeded'); }
    catch (error) { ensure(String(error).includes('recovery interrupted'), String(error)); }
    await journalIsClosing(); await opened.driver.close(); opened = await open();
    reconcileRecovery(await journalEvidence(opened.journal, files), before);
    const restored = await runRestore(picked(archive), RECOVERY_PASSWORD, 'replace', () => {});
    ensure(restored.ok, `restore failed: ${JSON.stringify(restored)}`);
    await flushPreferences();
    reconcileRecovery(await journalEvidence(opened.journal, files), input!.expected);
    ensure(JSON.stringify(local()) === beforeLocal, 'destination-local settings changed');
    for (const [name, value] of Object.entries(input!.portable)) ensure(JSON.stringify(prefs[name as keyof typeof prefs]) === JSON.stringify(value), `portable preference differs: ${name}`);
    await journalIsClosing(); await opened.driver.close(); opened = await open();
    reconcileRecovery(await journalEvidence(opened.journal, files), input!.expected);
    await opened.journal.entries.upsertEntry({ epochDay: 22000, mood: 2, note: 'merge sentinel' });
    const merge = await runRestore(picked(archive), RECOVERY_PASSWORD, 'merge', () => {});
    ensure(merge.ok && (await opened.journal.entries.entriesForDay(22000))[0]?.note === 'merge sentinel', 'Merge lost existing destination entry');
    const entries = await opened.journal.entries.entriesForDay(20000);
    ensure(entries[0]?.dims.femininity === 60 && entries[0].tags.length === 2, 'entry relationship reads differ');
    ensure(JSON.stringify(await readKeystoreFile()) === accessBefore, 'destination access keystore changed');
    const unlocked = await unlockJournalPassphrase(`independent installation ${identity}`);
    ensure(unlocked.every((byte, index) => byte === key[index]), 'destination access credential stopped opening its key');
    if (nativeBefore) {
      const after = await androidAutoExport.status();
      ensure(after.destinationUri === nativeBefore.destinationUri && after.schedule === nativeBefore.schedule && after.enabled === nativeBefore.enabled, 'native backup destination or schedule changed');
    }
    const media = await openMedia(entries[0], input!.expected.journal.documents[0]);
    return { identity, failures, interruptedRestart: true, sections: Object.keys(input!.expected.journal).length, attachments: Object.keys(input!.expected.attachments).length, localPreserved: true, accessMode: 'passphrase', destinationCredentialVerified: true, portableApplied: true, restarted: true, merge: true, media, archiveSha256: await digest(archive) };
  }
  Object.assign(window, { recoveryProbe: probe });
}

async function waitFor<T>(read: () => T | false | null | undefined): Promise<T> {
  for (let i = 0; i < 300; i++) { flushSync(); const value = read(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error('restored media did not become usable');
}
async function openMedia(entry: Awaited<ReturnType<import('../src/lib/data/journal/journal').Journal['entries']['entriesForDay']>>[number], document: import('../src/lib/data/archive/payload').ArchiveJournal['documents'][number]) {
  const target = window.document.querySelector('#screens') ?? window.document.body.appendChild(window.document.createElement('div'));
  const photo = mount(PhotoViewer, { target, props: { photo: entry.photos[0], onClose: () => {} } });
  await waitFor(() => target.querySelector<HTMLImageElement>('[data-photo-viewer] img')?.naturalWidth === 64);
  await unmount(photo);
  for (const [Component, fileName, selector] of [[VoicePlayer, entry.recordings[0].fileName, 'audio'], [VideoNotePlayer, entry.videos[0].fileName, 'video']] as const) {
    const mounted = mount(Component, { target, props: { fileName } });
    const element = await waitFor(() => target.querySelector<HTMLMediaElement>(selector));
    element.load();
    await waitFor(() => element.readyState >= 2 && Number.isFinite(element.duration) && element.duration > 0);
    if (element instanceof HTMLVideoElement) ensure(element.videoWidth === 64 && element.videoHeight === 64, 'restored video dimensions differ');
    await element.play();
    await waitFor(() => element.currentTime > 0.05);
    element.pause();
    await unmount(mounted);
  }
  page.params = { id: document.id };
  page.url = new URL(`/media/documents/${document.id}`, location.origin);
  const mounted = mount(DocumentPage, { target });
  await waitFor(() => [...target.querySelectorAll('img')].some((image) => image.naturalWidth === 64));
  await unmount(mounted);
  return { image: true, audioPlayback: true, videoPlayback: true, documentRendered: true };
}
