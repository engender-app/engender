import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { zipSync, strToU8 } from 'fflate';
import { test } from 'vitest';
import { emptyArchiveJournal } from '../journal/archiveSections';
import { dayonePreview, DayOneImportError } from './dayone';
import { daylioBackupPreview, DaylioBackupError } from './daylioBackup';
import { transTracksPreview, TransTracksBackupError } from './transtracks';
import { daylioPayload, makeDaylioBackup } from './test-support/daylio-backup';

const naming = { tagLabels: () => [] };
const jsonZip = (payload: unknown) => zipSync({ 'Journal.json': strToU8(JSON.stringify(payload)) });
const entry = { uuid: '5E2B69750D5248378592CC8DAE174009', creationDate: '2026-01-15T14:30:00Z', timeZone: 'UTC', text: 'synthetic' };

function duplicateZip(): Uint8Array {
  const bytes = zipSync({ 'a.txt': strToU8('first'), 'b.txt': strToU8('second') });
  const view = new DataView(bytes.buffer);
  const first = view.getUint32(bytes.length - 6, true);
  const second = first + 46 + view.getUint16(first + 28, true) + view.getUint16(first + 30, true) + view.getUint16(first + 32, true);
  bytes[second + 46] = 0x61;
  return bytes;
}

function corruptDeflate(name: string): Uint8Array {
  const bytes = zipSync({ [name]: strToU8('synthetic') });
  const view = new DataView(bytes.buffer);
  const start = 30 + view.getUint16(26, true) + view.getUint16(28, true);
  bytes[start] = 7;
  return bytes;
}

for (const [name, preview, ErrorType] of [
  ['Day One', (bytes: Uint8Array) => dayonePreview(bytes, emptyArchiveJournal(), naming), DayOneImportError],
  ['Daylio', (bytes: Uint8Array) => daylioBackupPreview(bytes, emptyArchiveJournal(), naming), DaylioBackupError],
  ['TransTracks', (bytes: Uint8Array) => transTracksPreview(bytes, emptyArchiveJournal()), TransTracksBackupError]
] as const) {
  test(`${name} owns damaged ZIP refusal`, async () => {
    const truncated = zipSync({ 'a.txt': strToU8('synthetic') }).subarray(0, 20);
    const member = name === 'Day One' ? 'Journal.json' : name === 'Daylio' ? 'backup.daylio' : 'data.json';
    for (const bytes of [new Uint8Array([1, 2, 3]), truncated, duplicateZip(), corruptDeflate(member)]) {
      await assert.rejects(preview(bytes), error => error instanceof ErrorType
        && (!(error instanceof DaylioBackupError) || error.kind === 'unreadable'));
    }
  });
}

for (const patch of [{ uuid: 123 }, { creationDate: 123 }, { timeZone: 123 }, { text: 123 }, { text: null }, { richText: 123 }, { richText: null }, { tags: 123 }, { tags: null }, { tags: [123] }, { photos: 123 }, { photos: null }, { photos: [null] }, { photos: [{ md5: 123, type: 'png' }] }, { photos: [{ md5: null, type: 'png' }] }, { photos: [{ md5: 'synthetic', type: 123 }] }, { photos: [{ md5: 'synthetic', type: null }] }, { richText: 'null', text: '' }]) {
  test(`Day One refuses invalid fields before string or collection operations: ${JSON.stringify(patch)}`, async () => {
    await assert.rejects(dayonePreview(jsonZip({ metadata: { version: '1.0' }, entries: [{ ...entry, ...patch }] }), emptyArchiveJournal(), naming), DayOneImportError);
  });
}

for (const contents of [null, {}, 'synthetic', 123, false, [null], [{ text: null }], [{ text: 123 }], [42]]) {
  test(`Day One refuses malformed consumed rich-text contents: ${JSON.stringify(contents)}`, async () => {
    const payload = { metadata: { version: '1.0' }, entries: [{ ...entry, text: '', richText: JSON.stringify({ contents }) }] };
    await assert.rejects(dayonePreview(jsonZip(payload), emptyArchiveJournal(), naming), DayOneImportError);
  });
}

test('Day One preserves omitted optional keys and missing-photo tolerance', async () => {
  for (const richText of ['{}', JSON.stringify({ contents: [{ type: 'photo', identifier: 'synthetic' }] })]) {
    const payload = { metadata: { version: '1.0' }, entries: [{ ...entry, text: '', richText, photos: [{}] }] };
    const result = await dayonePreview(jsonZip(payload), emptyArchiveJournal(), naming);
    assert.equal(result.entryCount, 1);
    assert.equal(result.journal.entries[0].note, '');
    assert.equal(result.photoCount, 0);
    assert.equal(result.unresolvedPhotoCount, 1);
  }
});

test('Daylio JSON refusals cannot retain a cleartext vendor PIN in diagnostics', async () => {
  const pin = '2468';
  const bytes = zipSync({ 'backup.daylio': strToU8(Buffer.from(`{"pin":x${pin}}`).toString('base64')) });
  await assert.rejects(daylioBackupPreview(bytes, emptyArchiveJournal(), naming), error => {
    assert.ok(error instanceof DaylioBackupError);
    assert.equal(error.kind, 'unreadable');
    assert.equal(inspect(error).includes(pin), false);
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('Day One owns null export and entry refusals', async () => {
  for (const payload of [null, { metadata: { version: '1.0' }, entries: [null] }]) {
    await assert.rejects(dayonePreview(jsonZip(payload), emptyArchiveJournal(), naming), DayOneImportError);
  }
});

test('TransTracks owns null row refusals', async () => {
  for (const payload of [{ photos: [null], milestones: [] }, { photos: [], milestones: [null] }]) {
    await assert.rejects(transTracksPreview(zipSync({ 'data.json': strToU8(JSON.stringify(payload)) }), emptyArchiveJournal()), TransTracksBackupError);
  }
});

for (const collection of ['photos', 'milestones'] as const) {
  for (const value of [null, {}, 'synthetic', 123, false]) {
    test(`TransTracks refuses a present non-array ${collection} collection: ${JSON.stringify(value)}`, async () => {
      const payload = { photos: [], milestones: [], [collection]: value };
      await assert.rejects(transTracksPreview(zipSync({ 'data.json': strToU8(JSON.stringify(payload)) }), emptyArchiveJournal()), TransTracksBackupError);
    });
  }
}

test('TransTracks preserves empty defaults for absent optional collections', async () => {
  const result = await transTracksPreview(zipSync({ 'data.json': strToU8(JSON.stringify({ settings: {} })) }), emptyArchiveJournal());
  assert.equal(result.milestoneCount, 0);
  assert.equal(result.photoCount, 0);
});

test('Daylio owns damaged deferred attachment reads', async () => {
  const bytes = await makeDaylioBackup();
  const result = await daylioBackupPreview(bytes, emptyArchiveJournal(), naming);
  assert.ok(result.assets.length);
  const view = new DataView(bytes.buffer);
  for (let at = 0; at + 46 < bytes.length; at++) {
    if (view.getUint32(at, true) !== 0x02014b50) continue;
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + view.getUint16(at + 28, true)));
    if (name.includes('assets/')) view.setUint16(at + 10, 99, true);
  }
  await assert.rejects(result.assets[0].read(), error => error instanceof DaylioBackupError && error.kind === 'unreadable');
});

test('Day One refuses repeated normalized entry identities before commit', async () => {
  const bytes = jsonZip({ metadata: { version: '1.0' }, entries: [entry, { ...entry, uuid: entry.uuid.toLowerCase() }] });
  await assert.rejects(dayonePreview(bytes, emptyArchiveJournal(), naming), DayOneImportError);
});

test('TransTracks refuses repeated milestone identities before commit', async () => {
  const row = { id: 'synthetic-milestone', epochDay: 20000, title: 'synthetic' };
  const bytes = zipSync({ 'data.json': strToU8(JSON.stringify({ milestones: [row, row], photos: [] })) });
  await assert.rejects(transTracksPreview(bytes, emptyArchiveJournal()), TransTracksBackupError);
});

test('TransTracks refuses repeated photo identities before commit', async () => {
  const row = { id: '00000000-0000-0000-0000-000000000ABC', epochDay: 20000, fileName: 'synthetic.jpg' };
  const bytes = zipSync({ 'data.json': strToU8(JSON.stringify({ milestones: [], photos: [row, { ...row, id: row.id.toLowerCase() }] })),
    'photos/synthetic.jpg': new Uint8Array([1]) });
  await assert.rejects(transTracksPreview(bytes, emptyArchiveJournal()), TransTracksBackupError);
});

for (const collection of ['scales', 'milestones'] as const) {
  test(`Daylio refuses repeated ${collection} identities before commit`, async () => {
    const payload = daylioPayload();
    const rows = payload[collection] as Record<string, unknown>[];
    payload[collection] = [...rows, { ...rows[0], id: 99 }];
    await assert.rejects(daylioBackupPreview(await makeDaylioBackup(payload), emptyArchiveJournal(), naming),
      error => error instanceof DaylioBackupError && error.kind === 'record');
  });
}
