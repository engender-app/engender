/* Where the web keeps the conversion marker (ticket 10): one small JSON
   file in the OPFS root, beside the keystore whose ordering against it is
   the whole recovery story (conversion.ts).

   It holds a stage name and nothing else. There is no Journal content in
   it, nothing derived from the passphrase and nothing worth protecting -
   which is just as well, because it has to be readable before the database
   can be opened, and readable by a boot that may never get a data key at
   all. Its own existence is not a secret either: an unfinished conversion
   is visible from the plaintext file sitting beside it regardless.

   An unreadable or unrecognised file reads as "no conversion in progress".
   That is the safe answer: with a plaintext Journal present the app offers
   the conversion again from the start, and the source it would convert is
   untouched either way. */

import type { ConversionMarkerStore, ConversionStage } from './conversion';

export const CONVERSION_MARKER_FILE = 'conversion.json';

const STAGES: ConversionStage[] = ['preparing', 'database', 'photos', 'retire'];

const isNotFound = (error: unknown): boolean => (error as DOMException)?.name === 'NotFoundError';

export function opfsConversionMarker(): ConversionMarkerStore {
  return {
    async read() {
      const root = await navigator.storage.getDirectory();
      try {
        const handle = await root.getFileHandle(CONVERSION_MARKER_FILE);
        const { stage } = JSON.parse(await (await handle.getFile()).text()) as { stage?: unknown };
        return STAGES.find((known) => known === stage) ?? null;
      } catch (error) {
        if (isNotFound(error)) return null;
        // Damaged or written by a build that spelled this differently.
        console.warn('unreadable conversion marker; treating it as no conversion in progress', error);
        return null;
      }
    },

    async write(stage) {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(CONVERSION_MARKER_FILE, { create: true });
      const writable = await handle.createWritable();
      try {
        await writable.write(JSON.stringify({ stage }));
      } finally {
        await writable.close();
      }
    },

    async clear() {
      const root = await navigator.storage.getDirectory();
      try {
        await root.removeEntry(CONVERSION_MARKER_FILE);
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
  };
}
