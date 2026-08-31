/* "I forgot my PIN": the one way back into the app, and it costs the whole
   journal (ADR-0014). There is no data-preserving recovery to offer -
   the PIN is a hash - so the honest escape hatch is this one, clearly
   labeled, with the loss stated before it happens.

   It wipes what this installation holds, not what an archive holds: an
   export made earlier still restores everything, and the reset screen says
   so. Everything is injected so the destructive part can be tested against
   fakes rather than against a real OPFS. */

import { BOOT_CACHE_KEY } from './prefs/boot-cache.ts';
import type { ListableDirectory } from './photos/opfs-file-store.ts';

export interface LocalDataTargets {
  /** Lets go of the database file; OPFS will not delete a file whose sync
      access handle is still open. */
  closeDatabase: () => Promise<void>;
  /** Everything this installation stores lives under here - the database,
      its pre-migration copy, the photo directory - and everything under it
      goes. Emptied rather than deleted by name, so a reset does not have
      to be kept in step with whatever writes there next. */
  storageRoot: () => Promise<ListableDirectory>;
  /** What a platform holds outside that root, where it holds anything. On
      Android the journal itself is an app-private file and the data key is
      in the platform key store, and the WebView's storage reaches neither
      (ticket 13). Absent on the web, where the root is everything. */
  wipePlatformStorage?: () => Promise<void>;
  /** What a platform holds that is not the journal and not in that root
      either: on Android the reminder, auto-export and quick-exit preference
      files, the alarms scheduled off the first of them, and the Keystore
      alias the backup password is wrapped under. Absent on the web, which
      keeps none of it. */
  wipeDeviceState?: () => Promise<void>;
  /** The app's own localStorage keys, minus the boot mirror below. The
      draft one holds the note text, mood, tags and body regions of whatever
      entry the process died on, so it is journal content by any reading. */
  clearBrowserMirrors: () => void;
  clearBootCache: () => void;
}

/** Every key this app keeps in localStorage except the boot mirror, which
    the reset takes last and for its own reason. Swept by prefix rather than
    by name, for the same reason the storage root is emptied rather than
    deleted entry by entry: a reset should not have to be kept in step with
    whatever writes there next. */
export function clearBrowserMirrors(storage: Storage): void {
  const doomed: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key && key !== BOOT_CACHE_KEY && (key.startsWith('gender-diary-') || key === 'letter_tile_snooze_until')) doomed.push(key);
  }
  // Collected first: removing while enumerating by index skips keys.
  for (const key of doomed) storage.removeItem(key);
}

export async function wipeLocalData(targets: LocalDataTargets): Promise<void> {
  // A worker that is already gone is not a reason to abandon the reset;
  // the delete below will tell us soon enough if the file is still held.
  await targets.closeDatabase().catch((error) => {
    console.warn('could not close the database before resetting; deleting anyway', error);
  });

  // Not caught, unlike the close above: this one is the journal, and a
  // failure here has to stop the reset rather than be worked around.
  await targets.wipePlatformStorage?.();

  /* Before the journal goes rather than after, and uncaught for the same
     reason: a device store that will not clear should leave the journal
     there to try again on, not take it and leave the reminders posting the
     person's own titles on schedule. */
  await targets.wipeDeviceState?.();

  const root = await targets.storageRoot();
  for await (const name of root.keys()) {
    await root.removeEntry(name, { recursive: true });
  }

  targets.clearBrowserMirrors();

  /* Last, and only if the files really went. The mirror is what tells the
     next cold start there is a PIN at all: dropping it while the database
     survived would hand the app back with the journal intact and the lock
     gone, which is the one outcome a reset must not produce. */
  targets.clearBootCache();
}
