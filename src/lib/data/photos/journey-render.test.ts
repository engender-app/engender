import { afterEach, expect, test, vi } from 'vitest';
import { recordTimelapse, timelapseSupported } from './journey-render';

const frames = [{ fileName: null, caption: 'One' }, { fileName: null, caption: 'Two' }];
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function encoder(mode: 'empty' | 'error' | 'throws' | 'corrupt' | 'stalled' | 'decode-stalled') {
  vi.useFakeTimers();
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] };
  vi.stubGlobal('document', { createElement: (tag: string) => tag === 'video' ? {
    onerror: null as (() => void) | null, pause() {}, removeAttribute() {}, load() {},
    set src(_url: string) { if (mode !== 'decode-stalled') queueMicrotask(() => this.onerror?.()); }
  } : ({
    getContext: () => ({ fillRect() {}, fillText() {}, drawImage() {} }), captureStream: () => stream
  }) });
  vi.stubGlobal('HTMLCanvasElement', class { captureStream() {} });
  vi.stubGlobal('MediaRecorder', class {
    static isTypeSupported() { return true; }
    state = 'inactive';
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    constructor() { if (mode === 'throws') throw new Error('encoder refused'); }
    start() {
      this.state = 'recording';
      if (mode === 'corrupt' || mode === 'decode-stalled') this.ondataavailable?.({ data: new Blob(['not a video']) });
      if (mode === 'error') queueMicrotask(() => { this.state = 'inactive'; this.onerror?.(); this.onstop?.(); });
    }
    stop() { this.state = 'inactive'; if (mode !== 'stalled') this.onstop?.(); }
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

test('nonempty but undecodable output refuses success', async () => {
  const stopTrack = encoder('corrupt');
  const answer = recordTimelapse(frames, async () => null);
  const refusal = expect(answer).rejects.toThrow('not playable');
  await vi.runAllTimersAsync();
  await refusal;
  expect(stopTrack).toHaveBeenCalledOnce();
});

test('a recorder that never finishes refuses success within its deadline', async () => {
  const stopTrack = encoder('stalled');
  const answer = recordTimelapse(frames, async () => null);
  const refusal = expect(answer).rejects.toThrow('did not finish');
  await vi.runAllTimersAsync();
  await refusal;
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test('a decoder that never loads refuses success and releases its object URL', async () => {
  encoder('decode-stalled');
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  const answer = recordTimelapse(frames, async () => null);
  const refusal = expect(answer).rejects.toThrow('did not decode');
  await vi.runAllTimersAsync();
  await refusal;
  expect(revoke).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test('cancellation while validating the file releases its object URL', async () => {
  encoder('decode-stalled');
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  const controller = new AbortController();
  const answer = recordTimelapse(frames, async () => null, { signal: controller.signal });
  const refusal = expect(answer).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(1500);
  controller.abort();
  await refusal;
  expect(revoke).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
