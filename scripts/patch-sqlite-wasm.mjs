import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

// Failed SAHPool initialization must not remove an existing database.
// Pin this patch to the browser entry shipped by @evolu/sqlite-wasm 2.2.4.
const file = new URL('../node_modules/@evolu/sqlite-wasm/sqlite-wasm/jswasm/sqlite3-bundler-friendly.mjs', import.meta.url);
const source = await readFile(file, 'utf8');
const hash = (text) => createHash('sha256').update(text).digest('hex');
const originalHash = '1d1cea8bbf10d173ab29d003e1197db2aca7f29a23a7a4320f5cfe77ce4e3243';
const patchedHash = '6bf90aa1ae7d8c670d8cd6a32de514927d86578fb04fb72aa8c83bccb7ff8947';
if (hash(source) !== patchedHash) {
  if (hash(source) !== originalHash) {
    throw new Error('The SQLite WASM browser entry changed; review its failed pool initialization before updating the patch');
  }
  const start = source.indexOf('          async acquireAccessHandles(clearFiles = false) {');
  const end = source.indexOf('          getAssociatedPath(sah) {', start);
  const acquire = `          // Engender modification: finish pending acquisitions before releasing handles.
          async acquireAccessHandles(clearFiles = false) {
            const files = [];
            for await (const [name, h] of this.#dhOpaque) {
              if ('file' === h.kind) files.push([name, h]);
            }
            const results = await Promise.allSettled(files.map(async ([name, h]) => {
              const ah = await h.createSyncAccessHandle();
              this.#mapSAHToName.set(ah, name);
              if (clearFiles) {
                ah.truncate(HEADER_OFFSET_DATA);
                this.setAssociatedPath(ah, '', 0);
              } else {
                const path = this.getAssociatedPath(ah);
                if (path) this.#mapFilenameToSAH.set(path, ah);
                else this.#availableSAH.add(ah);
              }
            }));
            const failed = results.find((result) => result.status === 'rejected');
            if (failed) {
              this.storeErr(failed.reason);
              this.releaseAccessHandles();
              throw failed.reason;
            }
          }

`;
  const patched = (source.slice(0, start) + acquire + source.slice(end)).replace(
    '                  await thePool.removeVfs().catch(() => {});',
    `                  // Engender modification: failed initialization must preserve pool files.
                  thePool.releaseAccessHandles();
                  const vfs = thePool.getVfs();
                  capi.sqlite3_vfs_unregister(vfs.pointer);
                  vfs.dispose();`
  );
  if (hash(patched) !== patchedHash) throw new Error('The SQLite WASM preservation patch did not produce its reviewed output');
  await writeFile(file, patched);
}
