import { afterEach, expect, test, vi } from 'vitest';
const { stream, stop, recordStream } = vi.hoisted(() => {
  const stop = vi.fn();
  return { stop, stream: { getTracks: () => [{ stop }] }, recordStream: vi.fn() };
});
vi.mock('./voiceRecording', () => ({
  openMicrophone: async () => stream, captureChainOfStream: async () => 'chain', recordStream
}));
vi.mock('$lib/audio/decode', () => ({ decodeToMono: vi.fn() }));
vi.mock('$lib/audio/live', () => ({ makeLiveGauge: vi.fn() }));
import { startTake } from './voiceBenchmark';
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

test('an AudioContext startup failure closes tracks before any recording starts', async () => {
  vi.stubGlobal('AudioContext', class { constructor() { throw new Error('audio failed'); } });
  await expect(startTake({} as never)).rejects.toThrow('audio failed');
  expect(stop).toHaveBeenCalled();
  expect(recordStream).not.toHaveBeenCalled();
});
