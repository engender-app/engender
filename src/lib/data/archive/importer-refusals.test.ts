import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { zipSync, strToU8 } from 'fflate';
import { test } from 'vitest';
import { emptyArchiveJournal } from '../journal/archiveSections';
import { daylioBackupPreview, DaylioBackupError } from './daylioBackup';
import { daylioPayload, makeDaylioBackup } from './test-support/daylio-backup';

const naming = { tagLabels: () => [] };
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

test('Daylio owns damaged ZIP refusal', async () => {
  const truncated = zipSync({ 'a.txt': strToU8('synthetic') }).subarray(0, 20);
  for (const bytes of [new Uint8Array([1, 2, 3]), truncated, duplicateZip(), corruptDeflate('backup.daylio')]) {
    await assert.rejects(daylioBackupPreview(bytes, emptyArchiveJournal(), naming),
      error => error instanceof DaylioBackupError && error.kind === 'unreadable');
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

for (const collection of ['scales', 'milestones'] as const) {
  test(`Daylio refuses repeated ${collection} identities before commit`, async () => {
    const payload = daylioPayload();
    const rows = payload[collection] as Record<string, unknown>[];
    payload[collection] = [...rows, { ...rows[0], id: 99 }];
    await assert.rejects(daylioBackupPreview(await makeDaylioBackup(payload), emptyArchiveJournal(), naming),
      error => error instanceof DaylioBackupError && error.kind === 'record');
  });
}
