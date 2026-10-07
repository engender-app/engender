import { afterEach, expect, test, vi } from 'vitest';
vi.mock('$lib/audio/captureChain', () => ({ captureChainOf: () => 'chain', deviceFromUserAgent: () => 'device' }));
vi.mock('$lib/paraglide/messages', () => ({ m: {} }));
vi.mock('./toasts.svelte', () => ({ toast: vi.fn() }));
vi.mock('$lib/data/fileDialog', () => ({ chooseFiles: vi.fn() }));
vi.mock('$lib/data/videoNotes/limits', () => ({ VIDEO_SIZE_CEILING: 100 }));
import { openMicrophone, recordStream } from './voiceRecording';

afterEach(() => vi.unstubAllGlobals());

test('an inactive recorder keeps captured chunks and closes its microphone', async () => {
  let recorder: FakeRecorder;
  class FakeRecorder {
    state = 'inactive';
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor() { recorder = this; }
    start() { this.state = 'recording'; }
    stop() { throw new Error('inactive'); }
  }
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  const stop = vi.fn();
  const active = recordStream({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  recorder!.ondataavailable!({ data: new Blob(['captured']) });
  recorder!.state = 'inactive';
  recorder!.onstop!();
  expect(await active.stop()).toEqual(new TextEncoder().encode('captured'));
  expect(stop).toHaveBeenCalled();
});

test('a missing MediaRecorder is an ordinary unsupported refusal', async () => {
  vi.stubGlobal('MediaRecorder', undefined);
  expect(await openMicrophone()).toBe('unsupported');
});

test('a recorder that cannot start closes its microphone', () => {
  vi.stubGlobal('MediaRecorder', class {
    start() { throw new Error('encoder failed'); }
  });
  const stop = vi.fn();
  expect(() => recordStream({ getTracks: () => [{ stop }] } as unknown as MediaStream)).toThrow('encoder failed');
  expect(stop).toHaveBeenCalled();
});
