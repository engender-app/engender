import { flushSync } from 'svelte';
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { openJournal } from '../../src/lib/data/journal/journal.ts';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store.ts';
import { attachJournal, journalIsOpen } from '../../src/lib/data/live/journal.svelte.ts';
import { hydrateReference } from '../../src/lib/data/live/reference.svelte.ts';
import { openPreferences } from '../../src/lib/data/prefs/preferences.ts';
import { attachPreferences } from '../../src/lib/data/prefs/store.svelte.ts';
import { localStorageCache } from '../../src/lib/data/prefs/boot-cache.ts';
import { refreshActiveFlag } from '../../src/lib/theme/activeFlag.svelte.ts';
import EntryEditor from '../../src/lib/components/EntryEditor.svelte';
import { mountInto, publishFixture } from './mount.ts';
import { freshOrigin, PROBE_DATA_KEY } from './fresh-origin.ts';

import '../../src/lib/theme/fonts.css';
import '../../src/lib/theme/base.css';
import '../../src/lib/theme/palettes.css';
import '../../src/lib/styles/app.css';
import '../../src/lib/styles/components.css';
import '../../src/lib/styles/screens.css';
import '../../src/lib/styles/kit.css';
import '../../src/lib/motion/press.css';
import '../../src/lib/motion/materials.css';

// Mount the real editor; Playwright supplies native key events and reads SQLite after Save.
async function run() {
  await freshOrigin();
  refreshActiveFlag();
  const { driver, fileOps } = createEncryptedWebSqlite('entry-contextual-text.sqlite3', PROBE_DATA_KEY);
  const booted = await boot({ createDriver: () => driver, fileOps });
  if (booted.phase === 'error') throw booted.error;
  const journal = attachJournal(openJournal(booted.driver, opfsPhotoFiles()));
  await journal.reconcileBuiltIns();
  await hydrateReference(journal);
  await attachPreferences(await openPreferences(booted.driver, localStorageCache()));
  journalIsOpen();
  const day = 19010;
  const tryoutId = await journal.tryouts.upsertTryout({ kind: 'name', label: 'Robin', startEpochDay: day - 2, endEpochDay: null });
  const procedureId = await journal.procedures.upsertProcedure({ name: 'Recovery', surgeryEpochDay: day - 1 });
  let screen: ReturnType<typeof mountInto> | undefined;
  const fixture = {
    async open(existing: boolean) {
      await screen?.remove();
      const entryId = existing ? await journal.entries.upsertEntry({ epochDay: day, mood: 4, note: 'Existing entry' }) : undefined;
      screen = mountInto(EntryEditor, { epochDay: day, entryId, seedMood: 4 }, document.querySelector('#editor')!);
      flushSync();
    },
    async saved() {
      return {
        felt: (await journal.feltSense.forTryout(tryoutId))[0]?.note ?? null,
        recovery: (await journal.procedures.getProcedures()).find((p) => p.id === procedureId)?.notes
      };
    },
    async clearSaved() {
      await journal.procedures.setNotes(procedureId, '');
    }
  };
  Object.assign(window, { contextualText: fixture });
  await fixture.open(false);
}
publishFixture('entry-contextual-text', run);
