/* Skip built-in reconciliation when the SQLite header's application_id
   matches this catalogue (ADR-0002). Reconciling unchanged rows previously
   added 64 ms on a Pixel cold launch. Hiding rows and replacing an Archive
   preserve built-ins.

   Stamp application_id inside the reconciliation transaction. The value
   travels with the database file, including a restored migration copy.
   Archives exclude it, and demo setup can still detect empty preferences.

   builtInsStamp.test.ts hashes catalogue data and comment-free reconcile.ts.
   Update the stamp when either changes to reconcile once on the next boot. */
import { LATEST_SCHEMA_VERSION } from '../sqlite/schema-version';

export const BUILT_INS_FINGERPRINT = '14211b067f622817';

/** The value a journal reconciled by this build carries in its header: the
    catalogue's fingerprint and the schema version, since a migration may
    rebuild a reference table. FNV-1a to 31 bits, never 0 - 0 is what a
    journal that has never been reconciled answers. */
export function builtInsStamp(fingerprint: string = BUILT_INS_FINGERPRINT, schema: number = LATEST_SCHEMA_VERSION): number {
  let hash = 0x811c9dc5;
  for (const char of `${fingerprint}:${schema}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash & 0x7fffffff) || 1;
}
