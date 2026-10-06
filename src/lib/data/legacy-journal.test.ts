import { expect, test, vi } from 'vitest';
import { legacyStoragePresent } from './legacy-journal';

for (const name of ['engender.sqlite3', 'engender.sqlite3.pre-migration-backup', 'engender.sqlite3-wal', 'conversion.json']) {
  test(`legacy ${name} is detected without opening its contents or deleting it`, async () => {
    const getFileHandle = vi.fn(async (candidate: string, options?: FileSystemGetFileOptions) => {
      expect(options).toBeUndefined();
      if (candidate !== name) throw new DOMException('missing', 'NotFoundError');
      return {} as FileSystemFileHandle;
    });
    expect(await legacyStoragePresent({ getFileHandle })).toBe(true);
  });
}

test('no legacy file permits normal boot; permission failures cannot masquerade as absence', async () => {
  expect(await legacyStoragePresent({ getFileHandle: async () => { throw new DOMException('missing', 'NotFoundError'); } })).toBe(false);
  await expect(legacyStoragePresent({ getFileHandle: async () => { throw new DOMException('denied', 'SecurityError'); } })).rejects.toMatchObject({ name: 'SecurityError' });
});
