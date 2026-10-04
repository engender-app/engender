/* Recovery-key copies share the system clipboard on both platforms. */

import { afterEach, expect, test, vi } from 'vitest';

const isAndroid = vi.fn<() => boolean>();
const sensitiveClipboard = {
  copy: vi.fn<(request: { value: string; clearAfterMs: number }) => Promise<void>>(),
};

vi.mock('$lib/platform', () => ({ isAndroid: () => isAndroid() }));
vi.mock('./recovery-key-clipboard-bridge', () => ({ sensitiveClipboard }));

const { copyRecoveryKey, RECOVERY_KEY_CLIPBOARD_CLEAR_MS } = await import(
  './recovery-key-clipboard.ts'
);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sensitiveClipboard.copy.mockReset();
});

test('the web writes the key with the browser clipboard API and never reaches for the plugin', async () => {
  isAndroid.mockReturnValue(false);
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
  vi.stubGlobal('navigator', { clipboard: { writeText } });

  await copyRecoveryKey('AAAA-BBBB-CCCC-DDDD-EEEE');

  expect(writeText).toHaveBeenCalledWith('AAAA-BBBB-CCCC-DDDD-EEEE');
  expect(sensitiveClipboard.copy).not.toHaveBeenCalled();
});

test('Android goes through the plugin, with the interval the copy beside the button names', async () => {
  isAndroid.mockReturnValue(true);
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  sensitiveClipboard.copy.mockResolvedValue();

  await copyRecoveryKey('AAAA-BBBB-CCCC-DDDD-EEEE');

  expect(sensitiveClipboard.copy).toHaveBeenCalledWith({
    value: 'AAAA-BBBB-CCCC-DDDD-EEEE',
    clearAfterMs: RECOVERY_KEY_CLIPBOARD_CLEAR_MS,
  });
  expect(writeText).not.toHaveBeenCalled();
});

test('a failing copy is not swallowed, since the screen tells the person it did not work', async () => {
  isAndroid.mockReturnValue(true);
  sensitiveClipboard.copy.mockRejectedValue(new Error('no clipboard service'));

  await expect(copyRecoveryKey('AAAA-BBBB-CCCC-DDDD-EEEE')).rejects.toThrow(
    'no clipboard service'
  );
});

/* The interval is a number here and a word in the catalogues, and nothing
   typechecks one against the other. This is what notices when one of the
   three moves without the other two. */
test('the interval is the minute both catalogues promise', async () => {
  const { readFileSync } = await import('node:fs');
  const root = new URL('../../../', import.meta.url);
  const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

  expect(RECOVERY_KEY_CLIPBOARD_CLEAR_MS).toBe(60_000);
  expect(JSON.parse(read('messages/en.json')).rk_copy_clears_android).toContain('a minute');
  expect(JSON.parse(read('messages/pl.json')).rk_copy_clears_android).toContain('po minucie');
});


test('the web clears an unchanged recovery key after a minute', async () => {
  vi.useFakeTimers();
  isAndroid.mockReturnValue(false);
  let text = '';
  const writeText = vi.fn(async (value: string) => { text = value; });
  const readText = vi.fn(async () => text);
  vi.stubGlobal('navigator', { clipboard: { writeText, readText } });
  await copyRecoveryKey('AAAA-BBBB-CCCC-DDDD-EEEE');
  await vi.advanceTimersByTimeAsync(59_999);
  expect(text).toBe('AAAA-BBBB-CCCC-DDDD-EEEE');
  await vi.advanceTimersByTimeAsync(1);
  expect(text).toBe('');
});


test('web cleanup leaves a later clipboard value alone', async () => {
  vi.useFakeTimers();
  isAndroid.mockReturnValue(false);
  let text = '';
  const writeText = vi.fn(async (value: string) => { text = value; });
  vi.stubGlobal('navigator', { clipboard: { writeText, readText: async () => text } });
  await copyRecoveryKey('AAAA-BBBB-CCCC-DDDD-EEEE');
  text = 'another copied value';
  await vi.advanceTimersByTimeAsync(60_000);
  expect(text).toBe('another copied value');
  expect(writeText).toHaveBeenCalledTimes(1);
});

test('web cleanup tolerates refused background clipboard access', async () => {
  vi.useFakeTimers();
  isAndroid.mockReturnValue(false);
  const writeText = vi.fn().mockResolvedValue(undefined);
  const readText = vi.fn().mockRejectedValue(new Error('permission denied'));
  vi.stubGlobal('navigator', { clipboard: { writeText, readText } });
  await copyRecoveryKey('AAAA-BBBB-CCCC-DDDD-EEEE');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(readText).toHaveBeenCalledTimes(1);
  expect(writeText).toHaveBeenCalledTimes(1);
});

test('both web explanations name the system clipboard and best-effort clearing', async () => {
  const { readFileSync } = await import('node:fs');
  const root = new URL('../../../', import.meta.url);
  const en = JSON.parse(readFileSync(new URL('messages/en.json', root), 'utf8'));
  const pl = JSON.parse(readFileSync(new URL('messages/pl.json', root), 'utf8'));
  expect(en.perm_clipboard_why_web).toContain('system clipboard');
  expect(en.perm_clipboard_why_web).toContain('tries');
  expect(pl.perm_clipboard_why_web).toContain('schowka systemowego');
  expect(pl.perm_clipboard_why_web).toContain('próbuje');
});
