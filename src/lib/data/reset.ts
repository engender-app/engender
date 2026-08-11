/* "I forgot my PIN": the one way back into the app, and it costs the whole
   journal (ADR-0014). There is no data-preserving recovery to offer -
   the PIN is a hash - so the honest escape hatch is this one, clearly
   labeled, with the loss stated before it happens.

   It wipes what this installation holds, not what an archive holds: an
   export made earlier still restores everything, and the reset screen says
   so. Everything is injected so the destructive part can be tested against
   fakes rather than against a real OPFS. */

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
  clearBootCache: () => void;
}

export async function wipeLocalData(targets: LocalDataTargets): Promise<void> {
  // A worker that is already gone is not a reason to abandon the reset;
  // the delete below will tell us soon enough if the file is still held.
  await targets.closeDatabase().catch((error) => {
    console.warn('could not close the database before resetting; deleting anyway', error);
  });

  const root = await targets.storageRoot();
  for await (const name of root.keys()) {
    await root.removeEntry(name, { recursive: true });
  }

  /* Last, and only if the files really went. The mirror is what tells the
     next cold start there is a PIN at all: dropping it while the database
     survived would hand the app back with the journal intact and the lock
     gone, which is the one outcome a reset must not produce. */
  targets.clearBootCache();
}
