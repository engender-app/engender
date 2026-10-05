// Count actual acquisitions without changing their timing, results, or errors.
let acquisitions = 0;
const fileHandle = FileSystemFileHandle.prototype as FileSystemFileHandle & {
  createSyncAccessHandle(): Promise<{ close(): void }>;
};
const acquire = fileHandle.createSyncAccessHandle;
fileHandle.createSyncAccessHandle = function () {
  if (!this.name.startsWith('.opfs-sahpool-sync-check-')) acquisitions++;
  return acquire.call(this);
};
const send = postMessage.bind(globalThis);
globalThis.postMessage = (message: Record<string, unknown>) => send({ ...message, acquisitions });
await import('../../src/lib/data/sqlite/mc-worker');
postMessage({ ready: true });
export {};
