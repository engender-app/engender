/* Which print path each platform takes (phase 5 ticket 17). The bug this
   guards is silent by nature: window.print() in the Android WebView returns
   normally and prints nothing, so nothing anywhere failed for the whole time
   the clinician summary's button was dead there. */

import { afterEach, expect, test, vi } from 'vitest';

const isAndroid = vi.fn<() => boolean>();
const androidPrint = { print: vi.fn<(job: { jobName: string }) => Promise<void>>() };

vi.mock('$lib/platform', () => ({ isAndroid: () => isAndroid() }));
vi.mock('./android-bridge', () => ({ androidPrint }));

const { printCurrentPage } = await import('./print.ts');

afterEach(() => {
  vi.restoreAllMocks();
  androidPrint.print.mockReset();
});

test('the web prints through the browser, and never reaches for the Android plugin', async () => {
  isAndroid.mockReturnValue(false);
  const print = vi.fn();
  vi.stubGlobal('window', { print });

  await printCurrentPage('Journal book');

  expect(print).toHaveBeenCalledOnce();
  expect(androidPrint.print).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

test('Android goes through the plugin instead, which is the only path that prints there', async () => {
  isAndroid.mockReturnValue(true);
  const print = vi.fn();
  vi.stubGlobal('window', { print });
  androidPrint.print.mockResolvedValue();

  await printCurrentPage('Journal book');

  expect(androidPrint.print).toHaveBeenCalledWith({ jobName: 'Journal book' });
  expect(print).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
