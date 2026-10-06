import { afterEach, expect, test, vi } from 'vitest';
import { reencodeVideo } from './reencode';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function source(options: { loads?: boolean; ends?: boolean; plays?: boolean; stops?: boolean } = {}) {
  vi.useFakeTimers();
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }], addTrack() {} };
  const revoke = vi.fn();
  const video = {
    onloadeddata: null as (() => void) | null, onerror: null as (() => void) | null,
    onended: null as (() => void) | null, videoWidth: 1920, videoHeight: 1080,
    duration: 1, ended: false, pause: vi.fn(),
    set src(value: string) { if (value && options.loads !== false) queueMicrotask(() => this.onloadeddata?.()); },
    play() {
      if (options.plays === false) return new Promise<void>(() => {});
      if (options.ends) queueMicrotask(() => { this.ended = true; this.onended?.(); });
      return Promise.resolve();
    }
  };
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:video', revokeObjectURL: revoke });
  vi.stubGlobal('document', { createElement: (tag: string) => tag === 'video' ? video : {
    getContext: () => ({ drawImage() {} }), captureStream: () => stream
  } });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('MediaRecorder', class {
    state = 'inactive';
    onstop: (() => void) | null = null;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    start() { this.state = 'recording'; this.ondataavailable?.({ data: new Blob(['encoded']) }); }
    stop() { this.state = 'inactive'; if (options.stops !== false) this.onstop?.(); }
  });
  return { video, stop, revoke };
}

const encode = () => reencodeVideo(new Blob(['original']), { videoBitsPerSecond: 100, audioBitsPerSecond: 10 }, 'video/webm');

test('a source that never loads settles into the original-capture fallback', async () => {
  const { revoke, video } = source({ loads: false });
  const answer = encode();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(await answer).toBeNull();
  expect(revoke).toHaveBeenCalledWith('blob:video');
  expect(video.onloadeddata).toBeNull();
});

for (const options of [{}, { plays: false }, { ends: true, stops: false }]) {
  test(`a stalled re-encode cleans up and keeps the original: ${JSON.stringify(options)}`, async () => {
    const { stop, revoke, video } = source(options);
    const answer = encode();
    await vi.advanceTimersByTimeAsync(7000);
    expect(await answer).toBeNull();
    expect(stop).toHaveBeenCalled();
    expect(video.pause).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
}

test('a completed re-encode returns its bytes and clears the deadline', async () => {
  const { stop } = source({ ends: true });
  const encoded = await encode();
  expect(await encoded?.text()).toBe('encoded');
  expect(stop).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
