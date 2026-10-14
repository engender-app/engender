import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver';
import { boot } from '../../src/lib/data/sqlite/boot';
import { runBootHousekeepingContract } from '../../src/lib/data/journal/contract-suite';
import { sweepOrphanPhotos } from '../../src/lib/data/journal/photos';
import { opfsPhotoFiles } from '../../src/lib/data/photos/opfs-file-store';
import { encryptedFileStore } from '../../src/lib/data/photos/encrypted-file-store';
import { freshOrigin, PROBE_DATA_KEY } from './fresh-origin';
import { publish } from '../probe-handshake.mjs';

async function run() {
  await freshOrigin();
  const { driver, fileOps } = createEncryptedWebSqlite('housekeeping-probe.sqlite3', PROBE_DATA_KEY);
  try {
    const opened = await boot({ createDriver: () => driver, fileOps });
    if (opened.phase !== 'ready') throw opened.error;
    await opened.housekeeping;
    const files = encryptedFileStore(opfsPhotoFiles('housekeeping-photos'), PROBE_DATA_KEY);
    const before = await navigator.storage.estimate();
    const checks = await runBootHousekeepingContract(driver, files);
    // The shared fixture restores its baseline rows. Remove its resulting
    // temporary photo files after capturing the first-boot checks.
    await sweepOrphanPhotos(driver, files);
    const after = await navigator.storage.estimate();
    publish('housekeeping', {
      checks, remainingFixtureFiles: await files.list(),
      allocationBefore: before.usage, allocationAfter: after.usage
    });
  } finally {
    await driver.close();
  }
}

run().catch((error) => publish('housekeeping', { error: String(error) }));
