import { afterEach, expect, test, vi } from 'vitest';
import { chooseFiles } from './fileDialog';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function picker() {
  vi.useFakeTimers();
  const input = Object.assign(new EventTarget(), {
    type: '', accept: '', multiple: false, style: {}, files: [] as File[],
    remove: vi.fn(), click: vi.fn()
  });
  const window = new EventTarget();
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', { createElement: () => input, body: { append() {} } });
  return { input, window };
}

test('focus before change keeps the selected file', async () => {
  const { input, window } = picker();
  const answer = chooseFiles('image/*');
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(50);
  const file = new File(['photo'], 'photo.jpg');
  input.files = [file];
  input.dispatchEvent(new Event('change'));
  expect(await answer).toEqual([file]);
  expect(vi.getTimerCount()).toBe(0);
});

test('focus fallback reads files even when change never arrives', async () => {
  const { input, window } = picker();
  const answer = chooseFiles('image/*');
  window.dispatchEvent(new Event('focus'));
  const file = new File(['photo'], 'photo.jpg');
  input.files = [file];
  await vi.advanceTimersByTimeAsync(500);
  expect(await answer).toEqual([file]);
});

test('focus fallback settles an empty picker after 500ms', async () => {
  const { input, window } = picker();
  const answer = chooseFiles('image/*');
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(499);
  expect(input.remove).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(await answer).toEqual([]);
});
