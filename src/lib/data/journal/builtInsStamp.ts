/* Which built-in catalogue a journal was last reconciled against (ux-carpet
   ticket 208).

   Reconciling the built-ins by key (ADR-0002, reconcile.ts) is idempotent and
   used to run as a transaction on every boot, behind a module fetch: on the
   Pixel that was 64 ms between the database opening and the first read, every
   cold launch, to insert nothing. Built-in rows are never deleted - a person
   hides one, every discard in archiveSections.ts spares them - so once a
   journal holds the whole catalogue, it keeps holding it until the catalogue
   itself changes or a migration touches those tables. Boot therefore asks the
   journal which catalogue it was reconciled against and skips the work when
   the answer is this build's.

   The answer lives in the database header, `PRAGMA application_id`, written
   inside the reconcile's own transaction. Not in `pref`: an empty preferences
   table is how the demo knows to seed its persona. Not in a table of its own:
   a header field travels with the file (a restored pre-migration copy brings
   its own), never with an archive, and needs no migration.

   BUILT_INS_FINGERPRINT is written by hand rather than computed at runtime,
   because computing it means loading the whole catalogue on every boot, which
   is the cost this exists to remove. builtInsStamp.test.ts recomputes it from
   the catalogue and from reconcile.ts's own source and fails on any
   difference, printing the value to put here - so a new tag, a changed
   default or a change to what reconcile seeds cannot ship without every
   journal reconciling once on its next boot. */
import { LATEST_SCHEMA_VERSION } from '../sqlite/schema-version';

export const BUILT_INS_FINGERPRINT = '005d05dd4d8d9f67';

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
