import { afterEach, expect, test, vi } from 'vitest';
vi.mock('$lib/audio/captureChain', () => ({ captureChainOf: () => 'chain', deviceFromUserAgent: () => 'device' }));
vi.mock('$lib/paraglide/messages', () => ({ m: { recording_mic_failed: () => 'microphone failed' } }));
vi.mock('./toasts.svelte', () => ({ toast: vi.fn() }));
vi.mock('$lib/data/fileDialog', () => ({ chooseFiles: vi.fn() }));
vi.mock('$lib/data/videoNotes/limits', () => ({ VIDEO_SIZE_CEILING: 100 }));
import { openMicrophone, recordStream, startRecording } from './voiceRecording';

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


for (const outcome of ['success', 'refusal'] as const) {
  test(`a cancelled late microphone ${outcome} starts no recorder or feedback`, async () => {
    const { toast } = await import('./toasts.svelte');
    vi.mocked(toast).mockClear();
    const construct = vi.fn();
    vi.stubGlobal('MediaRecorder', class {
      static isTypeSupported() { return true; }
      constructor() { construct(); }
    });
    let release!: (stream: MediaStream) => void;
    let refuse!: (error: Error) => void;
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => new Promise((resolve, reject) => {
      release = resolve; refuse = reject;
    }) } });
    const stop = vi.fn();
    const controller = new AbortController();
    const opened = startRecording(controller.signal);
    controller.abort();
    if (outcome === 'success') release({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    else refuse(new DOMException('synthetic permission refusal', 'NotAllowedError'));
    expect(await opened).toBeNull();
    expect(construct).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    if (outcome === 'success') expect(stop).toHaveBeenCalled();
  });
}

test('stopping closes microphone tracks before recorder completion arrives', async () => {
  let finish!: () => void;
  vi.stubGlobal('MediaRecorder', class {
    state = 'recording';
    set onstop(callback: () => void) { finish = callback; }
    start() {}
    stop() { this.state = 'inactive'; }
  });
  const stop = vi.fn();
  const active = recordStream({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  const result = active.stop();
  expect(stop).toHaveBeenCalled();
  finish();
  expect(await result).toBeNull();
});
