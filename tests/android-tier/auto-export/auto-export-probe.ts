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
  async run(count: number) {
    probe.ready = false;
    let recorded: number | null = null;
    try {
      probe.result = { result: await runAndroidAutoExport(
        { snapshot: snapshot(count), preferences },
        { recordBackup: (at) => { recorded = at; } }
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
      const restored = await openArchive(source(), password);
      if (JSON.stringify(restored.payload.journal) !== JSON.stringify(journal)) throw new Error('rows differ');
      let recovered = 0;
      for await (const file of restored.files) {
        if (file.name !== fileName(recovered) || file.bytes.length !== bytes.length) throw new Error('file differs');
        for (let i = 0; i < bytes.length; i++) {
          if (file.bytes[i] !== bytes[i]) throw new Error(`attachment byte differs: ${i}`);
        }
        recovered++;
      }
      if (recovered !== count) throw new Error('attachment count differs');
      probe.result = { recovered, rows: restored.payload.journal.entries.length };
    } catch (error) { probe.result = { error: String(error) }; }
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
