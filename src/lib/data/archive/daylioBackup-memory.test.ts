import { expect, test, vi } from 'vitest';
import { daylioAssetFiles, makeDaylioBackup } from './test-support/daylio-backup';
import { emptyArchiveJournal } from '../journal/archiveSections';

const inflated = vi.hoisted(() => [] as string[]);
vi.mock('fflate', async importOriginal => {
  const actual = await importOriginal<typeof import('fflate')>();
  return {
    ...actual,
    unzipSync: (bytes: Uint8Array, options: import('fflate').UnzipOptions = {}) => actual.unzipSync(bytes, {
      ...options,
      filter: entry => {
        const accepted = options.filter?.(entry) ?? true;
        if (accepted) inflated.push(entry.name);
        return accepted;
      }
    })
  };
});

test('Daylio preview sniffs prefixes without inflating or caching full attachments', async () => {
  const { daylioBackupPreview } = await import('./daylioBackup');
  const file = await makeDaylioBackup(undefined, daylioAssetFiles());
  inflated.length = 0;
  const preview = await daylioBackupPreview(file, emptyArchiveJournal(), { tagLabels: () => [] });
  expect(preview.assets.length).toBe(3);
  expect(inflated.every(name => name.endsWith('backup.daylio'))).toBe(true);
  await preview.assets[0].read();
  expect(inflated.filter(name => !name.endsWith('backup.daylio'))).toHaveLength(1);
});
