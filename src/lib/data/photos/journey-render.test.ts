import { afterEach, expect, test, vi } from 'vitest';
import { recordTimelapse, timelapseSupported } from './journey-render';

const frames = [{ fileName: null, caption: 'One' }, { fileName: null, caption: 'Two' }];
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function encoder(mode: 'empty' | 'error' | 'throws') {
  vi.useFakeTimers();
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] };
  vi.stubGlobal('document', { createElement: () => ({
    getContext: () => ({ fillRect() {}, fillText() {}, drawImage() {} }), captureStream: () => stream
  }) });
  vi.stubGlobal('HTMLCanvasElement', class { captureStream() {} });
  vi.stubGlobal('MediaRecorder', class {
    static isTypeSupported() { return true; }
    state = 'inactive';
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() { if (mode === 'throws') throw new Error('encoder refused'); }
    start() {
      this.state = 'recording';
      if (mode === 'error') queueMicrotask(() => { this.state = 'inactive'; this.onerror?.(); this.onstop?.(); });
    }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  });
  return stopTrack;
}

test('an empty encode refuses success and releases the capture track', async () => {
  const stopTrack = encoder('empty');
  const answer = recordTimelapse(frames, async () => null);
  const refusal = expect(answer).rejects.toThrow('no video');
  await vi.runAllTimersAsync();
  await refusal;
  expect(stopTrack).toHaveBeenCalledOnce();
});

test('an encoder error rejects promptly and releases the capture track', async () => {
  const stopTrack = encoder('error');
  const answer = recordTimelapse(frames, async () => null);
  const refusal = expect(answer).rejects.toThrow('encode');
  await vi.advanceTimersByTimeAsync(1);
  await refusal;
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test('an encoder constructor refusal releases the capture track', async () => {
  const stopTrack = encoder('throws');
  await expect(recordTimelapse(frames, async () => null)).rejects.toThrow('encoder refused');
  expect(stopTrack).toHaveBeenCalledOnce();
});

test('cancellation during the final photo refuses success', async () => {
  const stopTrack = encoder('empty');
  const controller = new AbortController();
  const answer = recordTimelapse(frames.slice(0, 1), async () => null, { signal: controller.signal });
  const refusal = expect(answer).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  await vi.runAllTimersAsync();
  await refusal;
  expect(stopTrack).toHaveBeenCalledOnce();
});

test('a recorder without canvas capture is unsupported', () => {
  encoder('empty');
  vi.stubGlobal('HTMLCanvasElement', class {});
  expect(timelapseSupported()).toBe(false);
});
