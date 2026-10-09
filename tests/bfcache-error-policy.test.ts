import { expect, test } from 'vitest';
import { classifyBfcacheConsoleErrors } from './browser-tier/bfcache-error-policy.mjs';

const message = 'Access Handles cannot be created if there is another open Access Handle or Writable stream associated with the same file.';
const error = { index: 1, source: 'http://localhost/mc-worker.js', text: `opfs-sahpool: NoModificationAllowedError: Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': ${message}` };
const events = [
  { index: 0, type: 'request', op: 'open', id: 1, path: 'journal.sqlite3', worker: 'failed', token: 'document', source: error.source },
  { index: 2, type: 'failure', op: 'open', id: 1, path: 'journal.sqlite3', error: message, worker: 'failed', token: 'document', source: error.source },
  { index: 3, type: 'retired', worker: 'failed', token: 'document' },
  { index: 4, type: 'open', path: 'journal.sqlite3', worker: 'replacement', token: 'document', source: error.source },
  { index: 5, type: 'ready', path: 'journal.sqlite3', token: 'document' },
  { index: 6, type: 'durable', path: 'journal.sqlite3' }
];

test('classifies only a matched conflict followed by open, ready and durable readback', () => {
  expect(classifyBfcacheConsoleErrors([error], events).handled).toHaveLength(1);
});

test('rejects unmatched console errors and unrelated worker failures', () => {
  expect(classifyBfcacheConsoleErrors([error], []).unmatched).toEqual([error]);
  expect(classifyBfcacheConsoleErrors([{ ...error, text: 'Unrelated error' }], events).handled).toEqual([]);
});

test('rejects an unrecovered conflict or readback from a different journal', () => {
  expect(classifyBfcacheConsoleErrors([error], events.slice(0, 3)).unmatched).toEqual([error]);
  expect(classifyBfcacheConsoleErrors([error], events.map(event => event.type === 'durable' ? { ...event, path: 'other.sqlite3' } : event)).unmatched).toEqual([error]);
});

test('rejects recovery or durable readback that happened before the conflict', () => {
  expect(classifyBfcacheConsoleErrors([{ ...error, index: 7 }], events).unmatched).toHaveLength(1);
});

test('one failed response cannot account for two console errors', () => {
  expect(classifyBfcacheConsoleErrors([error, error], events).unmatched).toHaveLength(1);
});

test('rejects an older failure followed by unrelated main-thread error and recovery', () => {
  expect(classifyBfcacheConsoleErrors([{ ...error, index: 3, source: 'http://localhost/app.js' }], events).unmatched).toHaveLength(1);
  expect(classifyBfcacheConsoleErrors([{ ...error, index: 3 }], events).unmatched).toHaveLength(1);
});

test('rejects missing provenance, another document, and an unretired failed worker', () => {
  expect(classifyBfcacheConsoleErrors([{ ...error, source: undefined }], events).unmatched).toHaveLength(1);
  expect(classifyBfcacheConsoleErrors([error], events.map(event => event.type === 'open' ? { ...event, token: 'other document' } : event)).unmatched).toHaveLength(1);
  expect(classifyBfcacheConsoleErrors([error], events.filter(event => event.type !== 'retired')).unmatched).toHaveLength(1);
});
