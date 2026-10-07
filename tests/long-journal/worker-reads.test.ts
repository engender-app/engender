import { afterEach, expect, test, vi } from 'vitest';
import { installWorkerReadRecorder } from './worker-reads';

class ProbeWorker extends EventTarget {
  postMessage(_message: unknown, _transfer?: Transferable[]) {}
}

afterEach(() => vi.unstubAllGlobals());

function recorder() {
  const browser = { Worker: ProbeWorker };
  vi.stubGlobal('window', browser);
  const recording = installWorkerReadRecorder();
  return { browser, recording, worker: new browser.Worker() };
}

test('worker crossings distinguish parameters and wait for pending replies', async () => {
  const { worker, recording } = recorder();
  const measured = await recording.record(async () => {
    for (const [id, value] of [[1, 'one'], [2, 'two'], [3, 'one']] as const) {
      worker.postMessage({ id, op: 'query', args: { sql: 'SELECT ?', params: [value] } });
      setTimeout(() => worker.dispatchEvent(new MessageEvent('message', { data: { id, result: [{ value }] } })), 0);
    }
    return 'screen finished';
  });
  expect(measured.result).toBe('screen finished');
  expect(measured.crossings.statements).toBe(3);
  expect(measured.crossings.duplicates).toBe(1);
  expect(measured.crossings.bytes).toBe(3 * new TextEncoder().encode(JSON.stringify([{ value: 'one' }])).byteLength);
  recording.restore();
});

test('recording excludes bootstrap calls and restores worker plumbing', async () => {
  const { browser, worker, recording } = recorder();
  worker.postMessage({ id: 1, op: 'query', args: { sql: 'SELECT bootstrap' } });
  const measured = await recording.record(async () => {
    worker.postMessage({ id: 2, op: 'query', args: { sql: 'SELECT home' } });
    worker.dispatchEvent(new MessageEvent('message', { data: { id: 2, result: [] } }));
  });
  expect(measured.crossings.statements).toBe(1);
  expect(browser.Worker).not.toBe(ProbeWorker);
  recording.restore();
  expect(browser.Worker).toBe(ProbeWorker);
  expect((await recording.record(async () => worker.postMessage({ id: 3, op: 'query' }))).crossings.statements).toBe(0);
});

test('a stopped worker releases pending replies and fails the measurement', async () => {
  const { worker, recording } = recorder();
  await expect(recording.record(async () => {
    worker.postMessage({ id: 1, op: 'query', args: { sql: 'SELECT home' } });
    worker.dispatchEvent(new Event('error'));
  })).rejects.toThrow('Recorded journal SQL failed');
  recording.restore();
});
