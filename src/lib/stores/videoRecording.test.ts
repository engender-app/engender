import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('$lib/data/fileDialog', () => ({ chooseFiles: vi.fn() }));
vi.mock('$lib/paraglide/messages', () => ({ m: {
  video_unsupported: () => 'unsupported', video_camera_failed: () => 'camera failed'
} }));
vi.mock('./toasts.svelte', () => ({ toast: vi.fn() }));
vi.mock('$lib/data/videoNotes/reencode', () => ({ reencodeVideo: vi.fn() }));
vi.mock('$lib/data/videoNotes/limits', async () => import('../data/videoNotes/limits'));
import { startVideoRecording } from './videoRecording';
import { VIDEO_MAX_DURATION_MS } from '../data/videoNotes/limits';
import { toast } from './toasts.svelte';

let failure: 'constructor' | 'start' | 'stop' | undefined;
let recorder: FakeRecorder;
class FakeRecorder {
  static isTypeSupported() { return true; }
  state = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: { error: Error }) => void) | null = null;
  constructor() {
    if (failure === 'constructor') throw new Error('synthetic constructor failure');
    recorder = this;
  }
  start() {
    if (failure === 'start') throw new Error('synthetic start failure');
    this.state = 'recording';
  }
  stop() {
    if (failure === 'stop') throw new Error('synthetic stop failure');
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['captured']) });
    this.onstop?.();
  }
}
const tracks = [vi.fn(), vi.fn()];
const stream = { getTracks: () => tracks.map(stop => ({ stop })) } as unknown as MediaStream;
const getUserMedia = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  failure = undefined;
  getUserMedia.mockResolvedValue(stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const expectReleased = () => {
  for (const stop of tracks) expect(stop).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
};

test('a missing MediaRecorder refuses video without throwing', async () => {
  vi.stubGlobal('MediaRecorder', undefined);
  expect(await startVideoRecording()).toBeNull();
});

for (const phase of ['constructor', 'start', 'stop'] as const) {
  test(`a video recorder ${phase} failure releases every track and timer`, async () => {
    failure = phase;
    await expect((async () => {
      const active = await startVideoRecording();
      if (phase === 'stop') await active!.stop();
    })()).rejects.toThrow(`synthetic ${phase} failure`);
    expectReleased();
  });
}

test('a throwing duration cap releases tracks and preserves the stop error', async () => {
  failure = 'stop';
  const active = (await startVideoRecording())!;
  vi.advanceTimersByTime(VIDEO_MAX_DURATION_MS);
  await active.capped;
  expectReleased();
  await expect(active.stop()).rejects.toThrow('synthetic stop failure');
});

test('a recorder error releases tracks and preserves the error for its owner', async () => {
  const active = (await startVideoRecording())!;
  const error = new Error('synthetic recording failure');
  recorder.onerror!({ error });
  await active.capped;
  expectReleased();
  await expect(active.stop()).rejects.toBe(error);
});

test('stop returns one collection promise and retains captured bytes', async () => {
  const active = (await startVideoRecording())!;
  const first = active.stop();
  expect(active.stop()).toBe(first);
  expect(await first).toEqual(new TextEncoder().encode('captured'));
  expectReleased();
});

test('the duration cap stops tracks before its owner collects bytes', async () => {
  const active = (await startVideoRecording())!;
  vi.advanceTimersByTime(VIDEO_MAX_DURATION_MS);
  await active.capped;
  expectReleased();
  expect(await active.stop()).toEqual(new TextEncoder().encode('captured'));
});

for (const outcome of ['success', 'refusal'] as const) {
  test(`a cancelled late video ${outcome} starts no recorder or feedback`, async () => {
    let release!: (stream: MediaStream) => void;
    let refuse!: (error: Error) => void;
    getUserMedia.mockImplementation(() => new Promise((resolve, reject) => { release = resolve; refuse = reject; }));
    const controller = new AbortController();
    const active = startVideoRecording(controller.signal);
    controller.abort();
    if (outcome === 'success') release(stream);
    else refuse(new DOMException('synthetic permission refusal', 'NotAllowedError'));
    expect(await active).toBeNull();
    expect(toast).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    if (outcome === 'success') expectReleased();
  });
}

test('a cancelled request acquires no camera', async () => {
  const controller = new AbortController();
  controller.abort();
  expect(await startVideoRecording(controller.signal)).toBeNull();
  expect(getUserMedia).not.toHaveBeenCalled();
});
