import { expect, test } from 'vitest';
import { classifyBfcacheConsoleErrors } from './browser-tier/bfcache-error-policy.mjs';

const message = 'Access Handles cannot be created if there is another open Access Handle or Writable stream associated with the same file.';
const error = { index: 1, text: `opfs-sahpool: NoModificationAllowedError: Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': ${message}` };
const events = [
  { index: 2, type: 'failure', op: 'open', path: 'journal.sqlite3', error: message },
  { index: 3, type: 'open', path: 'journal.sqlite3' },
  { index: 4, type: 'ready', path: 'journal.sqlite3' },
  { index: 5, type: 'durable', path: 'journal.sqlite3' }
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
  expect(classifyBfcacheConsoleErrors([{ ...error, index: 6 }], events).unmatched).toHaveLength(1);
});

test('one failed response cannot account for two console errors', () => {
  expect(classifyBfcacheConsoleErrors([error, error], events).unmatched).toHaveLength(1);
});
