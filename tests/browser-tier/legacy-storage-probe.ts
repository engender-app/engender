import { legacyStoragePresent } from '../../src/lib/data/legacy-journal.ts';
import { initialBoot, reduce } from '../../src/lib/stores/boot-machine.ts';
import { freshOrigin } from './fresh-origin.ts';
import { publish } from '../probe-handshake.mjs';

const NAME = 'legacy-storage-probe';
async function run() {
  await freshOrigin('legacy-storage-probe-cleared');
  const root = await navigator.storage.getDirectory();
  const expected = new Map([
    ['engender.sqlite3', 'SQLite format 3\0legacy journal content'],
    ['engender.sqlite3.pre-migration-backup', 'old backup'],
    ['conversion.json', '{"stage":"retire"}']
  ]);
  for (const [name, text] of expected) {
    const file = await root.getFileHandle(name, { create: true });
    const write = await file.createWritable();
    await write.write(text);
    await write.close();
  }
  const event = {
    type: 'web-surveyed' as const,
    legacyStoragePresent: await legacyStoragePresent(root),
    keystoreSecretSource: 'passphrase' as const,
    deviceBoundKeystoreExists: true
  };
  const refused = reduce(initialBoot(), event);
  const demo = reduce(reduce(initialBoot(), { type: 'started', platform: 'web', demo: true }).machine, event);
  const beforeNames = [...expected.keys()].sort();
  const afterNames: string[] = [];
  for await (const [name] of (root as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) if (expected.has(name)) afterNames.push(name);
  let unchanged = JSON.stringify(beforeNames) === JSON.stringify(afterNames.sort());
  for (const [name, text] of expected) {
    unchanged &&= await (await (await root.getFileHandle(name)).getFile()).text() === text;
  }
  publish(NAME, {
    refused: refused.machine.boot.status === 'legacy-refused' && refused.effects.length === 0,
    demoRefused: demo.machine.boot.status === 'legacy-refused' && demo.effects.length === 0,
    unchanged
  });
}
run().catch(error => publish(NAME, { error: String(error?.stack ?? error) }));
