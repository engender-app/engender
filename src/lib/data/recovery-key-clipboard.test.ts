/* Which clipboard the recovery key's Copy button reaches for (phase 8 audit
   ticket 09). The web's clipboard is the browser's and nothing else reads
   it; Android's is shown to anyone who long-presses in any text field in any
   app, through the keyboard's own clipboard history, so that path has to go
   through the plugin that marks the clip sensitive and clears it again. */

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

/* The interval is a number in one place and a word in the catalogues, which
   cannot be typechecked against each other. Both say a minute. */
test('the interval is the minute both catalogues promise', () => {
  expect(RECOVERY_KEY_CLIPBOARD_CLEAR_MS).toBe(60_000);
});
