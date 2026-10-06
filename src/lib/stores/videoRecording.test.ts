import { afterEach, expect, test, vi } from 'vitest';
vi.mock('$lib/data/fileDialog', () => ({ chooseFiles: vi.fn() }));
vi.mock('$lib/paraglide/messages', () => ({ m: { video_unsupported: () => 'unsupported' } }));
vi.mock('./toasts.svelte', () => ({ toast: vi.fn() }));
vi.mock('$lib/data/videoNotes/reencode', () => ({ reencodeVideo: vi.fn() }));
vi.mock('$lib/data/videoNotes/limits', () => ({}));
import { startVideoRecording } from './videoRecording';
afterEach(() => vi.unstubAllGlobals());
test('a missing MediaRecorder refuses video without throwing', async () => {
  vi.stubGlobal('MediaRecorder', undefined);
  expect(await startVideoRecording()).toBeNull();
});
