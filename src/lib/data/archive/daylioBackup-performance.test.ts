import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { test } from 'vitest';
import { daylioBackupPreview } from './daylioBackup';
import { daylioPayload, makeZip } from './test-support/daylio-backup';
import { emptyArchiveJournal } from '../journal/archiveSections';

// Run explicitly on a quiet host: DAYLIO_PREVIEW_BENCHMARK=1 npx vitest run
// src/lib/data/archive/daylioBackup-performance.test.ts. Fixture creation and
// complete attachment reads are outside the measured preview interval.
for (const count of [500, 1000, 2000]) {
  test.skipIf(process.env.DAYLIO_PREVIEW_BENCHMARK !== '1')(`preview ${count} stored 100 KiB JPEG members`, async () => {
    const payload = daylioPayload();
    const original = readFileSync(new URL('../../../../tests/archive-recovery-media/photo.jpg', import.meta.url));
    const photo = new Uint8Array(100 * 1024);
    photo.set(original.subarray(0, 2));
    let at = 2;
    let remaining = photo.length - original.length;
    // Legal JPEG comment segments retain the decodable image used by the audit.
    while (remaining > 0) {
      const segment = Math.min(remaining, 65537);
      photo.set([255, 254, (segment - 2) >> 8, (segment - 2) & 255], at);
      at += segment;
      remaining -= segment;
    }
    photo.set(original.subarray(2), at);
    const assets = Array.from({ length: count }, (_, id) => ({ id, checksum: id.toString(16).padStart(32, '0'), type: 1 }));
    payload.assets = assets;
    payload.milestones = [];
    payload.dayEntries = assets.map(({ id }) => ({
      id, year: 2026, month: 0, day: 1, hour: 8, minute: 30, mood: 1, assets: [id], note: `synthetic entry ${id}`
    }));
    const member = new TextEncoder().encode(Buffer.from(JSON.stringify(payload)).toString('base64'));
    const file = makeZip([
      { name: 'backup.daylio', bytes: member, deflate: true },
      ...assets.map(({ checksum }) => ({ name: `/assets/photos/2026/1/${checksum}`, bytes: photo }))
    ]);
    const elapsed: number[] = [];
    let expected: ReturnType<typeof emptyArchiveJournal> | undefined;
    for (let repeat = 0; repeat < 3; repeat++) {
      const start = performance.now();
      const result = await daylioBackupPreview(file, emptyArchiveJournal(), { tagLabels: () => [] });
      elapsed.push(performance.now() - start);
      assert.equal(result.photoCount, count);
      assert.equal(result.audioCount, 0);
      assert.equal(result.assets.length, count);
      assert.equal(result.journal.entries.length, count);
      if (expected) assert.deepEqual(result.journal, expected);
      expected = result.journal;
      for (const at of [0, Math.floor(count / 2), count - 1]) {
        assert.match(result.assets[at].fileName, /\.jpg$/);
        assert.deepEqual(await result.assets[at].read(), photo);
      }
    }
    const median = [...elapsed].sort((a, b) => a - b)[1];
    process.stdout.write(JSON.stringify({ photos: count, bytes: file.length, previewMs: elapsed, medianMs: median }) + '\n');
  }, 120_000);
}
