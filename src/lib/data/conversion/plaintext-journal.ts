/* The pre-encryption Journal's name and the two questions boot asks of it on
   every web launch - is it still there, and take away what is left of it -
   kept apart from the conversion's own ports (web-ports.ts) so that asking
   them does not load SQLocal (ux-carpet ticket 223). SQLocal is only needed
   to read that old file, which happens during a conversion and nowhere else,
   and it was ~23 KB of every first load for it. */

/** The database SQLocal wrote, and the name the encrypted Journal takes
    inside the pool. The same string on purpose: one Journal, one name, two
    containers that cannot see each other's files. */
export const JOURNAL_DATABASE = 'engender.sqlite3';

/** Everything this app has ever written in plaintext at the OPFS root. Not
    a wildcard sweep: the person's photo directory, the keystore and the
    SAHPool directory live at the same root, and an Archive they exported is
    a download that was never here at all. */
const PLAINTEXT_REMNANTS = [
  JOURNAL_DATABASE,
  `${JOURNAL_DATABASE}.pre-migration-backup`,
  // SQLocal's own side files, if a killed write left any behind.
  `${JOURNAL_DATABASE}-journal`,
  `${JOURNAL_DATABASE}-wal`,
  `${JOURNAL_DATABASE}-shm`
];

/** Whether the pre-encryption Journal is still there. Named for what it
    means rather than for the file, because that is what boot asks. */
export async function plaintextJournalPresent(): Promise<boolean> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.getFileHandle(JOURNAL_DATABASE);
    return true;
  } catch {
    return false;
  }
}

export async function removePlaintextRemnants(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  for (const name of PLAINTEXT_REMNANTS) {
    try {
      await root.removeEntry(name);
    } catch (error) {
      if ((error as DOMException)?.name !== 'NotFoundError') throw error;
    }
  }
}
