/* The Day One fixture pair (phase 7 ticket 11).

   Built here rather than checked in as opaque binaries, for the reason
   test-support/daylio-backup.ts's own header gives: the real export this
   format was learned from has been deleted, so this fixture is the only
   written record of the shape besides the ticket, and a JS literal a
   reviewer can read and edit is worth more than a zip nobody can diff. It
   still produces a real zip, packed by the same library that reads one
   (fflate) - real deflate on the journal member, real photo files under
   `photos/`.

   Every uuid, date and byte is invented, in the shapes the ticket
   documents and the corrections section adds:

     - `metadata.version` is the string "1.0"
     - `uuid` is 32 uppercase hex, no dashes
     - `photos[].identifier` uppercase, `photos[].md5` lowercase - the
       same photo, two different values, verified against a real export
     - `tags` and `photos` absent entirely rather than `[]` when an entry
       has none
     - one entry's `text` is empty with `richText` carrying it all, the
       real export's own onboarding shape */

import { zipSync } from 'fflate';
import { md5 } from 'hash-wasm';

const enc = new TextEncoder();

/** Two distinct byte strings, not real JPEGs: the photo half of this
    import stays raw until a caller normalizes it (dayone.ts's own header),
    so nothing here ever reaches a decoder. */
export const PHOTO_1_BYTES = new Uint8Array(Array.from({ length: 40 }, (_, i) => i));
export const PHOTO_2_BYTES = new Uint8Array(Array.from({ length: 25 }, (_, i) => 255 - i));

export const PHOTO_1_IDENTIFIER = 'EDB1A0F6331C453C8D2F43EFEE47F4FD';
export const PHOTO_2_IDENTIFIER = 'AA11BB22CC33DD44EE55FF6600112233';

async function journalPayload(): Promise<Record<string, unknown>> {
  const photo1Md5 = await md5(PHOTO_1_BYTES);
  const photo2Md5 = await md5(PHOTO_2_BYTES);

  return {
    metadata: { version: '1.0' },
    entries: [
      {
        uuid: '5E2B69750D5248378592CC8DAE174009',
        creationDate: '2026-01-15T14:30:00Z',
        modifiedDate: '2026-01-15T14:35:00Z',
        timeZone: 'America/Denver',
        text:
          `# A good day\nToday felt really good\\. Walked by the river, mid\\-thought, and then\n\n![](dayone-moment://${PHOTO_1_IDENTIFIER})\n\nsaw the photo I took.`,
        richText: JSON.stringify({
          contents: [
            { text: 'A good day\n', attributes: { line: { header: 1 } } },
            { text: 'Today felt really good. Walked by the river, mid-thought, and then\n' },
            { type: 'photo', identifier: PHOTO_1_IDENTIFIER },
            { text: 'saw the photo I took.' }
          ]
        }),
        tags: ['exercise', 'good day'],
        starred: true,
        photos: [{ identifier: PHOTO_1_IDENTIFIER, md5: photo1Md5, type: 'jpg' }]
      },
      {
        // The real export's own onboarding entry: text empty, richText
        // carries it all, no tags key at all.
        uuid: '6A3C79860E6359489693DD9EBF285110',
        creationDate: '2026-01-16T08:00:00Z',
        modifiedDate: '2026-01-16T08:00:00Z',
        timeZone: 'Europe/Berlin',
        text: '',
        richText: JSON.stringify({
          contents: [
            { text: 'An onboarding entry\n', attributes: { line: { header: 1 } } },
            { text: 'Welcome to your journal, written entirely in richText.' }
          ]
        })
      },
      {
        // No heading, backslash-escaped punctuation, one matched + one new tag.
        uuid: '7B4D8A970F7460590794EEB0FC396221',
        creationDate: '2026-06-10T12:00:00Z',
        modifiedDate: '2026-06-10T12:00:00Z',
        timeZone: 'Europe/Berlin',
        text: 'Just a normal note about the day\\. Nothing fancy, just glad it happened\\.',
        richText: JSON.stringify({ contents: [{ text: 'Just a normal note about the day. Nothing fancy, just glad it happened.' }] }),
        tags: ['good day', 'reading']
      },
      {
        // A photo whose md5Thumbnail is a dangling reference - the real
        // export's own shape, and never required to resolve.
        uuid: '8C5E9BA810854671A895FFC1FD4A7332',
        creationDate: '2026-03-01T10:00:00Z',
        modifiedDate: '2026-03-01T10:00:00Z',
        timeZone: 'UTC',
        text: 'A day with a photo Day One thinks has a thumbnail.',
        richText: JSON.stringify({ contents: [{ text: 'A day with a photo Day One thinks has a thumbnail.' }] }),
        photos: [
          {
            identifier: PHOTO_2_IDENTIFIER,
            md5: photo2Md5,
            md5Thumbnail: '00000000000000000000000000000000',
            type: 'jpg'
          }
        ]
      }
    ]
  };
}

/** A well-formed export zip, fresh on every call. `overrides`, applied
    with a shallow spread over the top level, is how a test bends one
    field - a bad `metadata.version`, say - without hand-building the
    whole payload again. */
export async function makeDayOneExport(overrides: Record<string, unknown> = {}): Promise<Uint8Array> {
  const payload = { ...(await journalPayload()), ...overrides };
  const photo1Md5 = await md5(PHOTO_1_BYTES);
  const photo2Md5 = await md5(PHOTO_2_BYTES);

  return zipSync({
    'Journal.json': [enc.encode(JSON.stringify(payload)), { level: 6 }],
    [`photos/${photo1Md5}.jpg`]: [PHOTO_1_BYTES, { level: 0 }],
    [`photos/${photo2Md5}.jpg`]: [PHOTO_2_BYTES, { level: 6 }]
  });
}

/** The malformed half of the fixture pair the spec asks every source for:
    a real zip carrying a real top-level JSON file, whose bytes are not
    valid JSON - so it passes detection and fails on the record. */
export function makeMalformedDayOneExport(): Uint8Array {
  return zipSync({ 'Journal.json': enc.encode('{ not actually json') });
}
