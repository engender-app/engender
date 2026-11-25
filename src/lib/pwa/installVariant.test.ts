import { describe, expect, test } from 'vitest';
import { installVariant, type InstallContext } from './installVariant';

/* Real user agents, as each browser sends them. LibreWolf sends Firefox's
   own string, so the Firefox desktop rows stand for it too. */
const UA = {
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  samsungInternet: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  // iPadOS asks for desktop sites by default and sends a Mac string.
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  firefoxWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  chromeLinux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
};

function context(over: Partial<InstallContext>): InstallContext {
  return { userAgent: '', touchPoints: 0, installed: false, promptReady: false, ...over };
}

describe('installVariant', () => {
  test.each([
    ['Chrome on Android', UA.chromeAndroid],
    ['Samsung Internet', UA.samsungInternet],
    ['Chrome on Linux', UA.chromeLinux],
    ['Edge on Windows', UA.edgeWindows]
  ])('%s with the deferred prompt gets the one-tap install', (_, userAgent) => {
    expect(installVariant(context({ userAgent, promptReady: true }))).toBe('prompt');
  });

  test.each([
    ['Safari on iPhone', UA.iphoneSafari, 0],
    ['Chrome on iPhone', UA.iphoneChrome, 0],
    ['an iPad asking for desktop sites', UA.ipadDesktopMode, 5]
  ])('%s gets the Share steps', (_, userAgent, touchPoints) => {
    expect(installVariant(context({ userAgent, touchPoints }))).toBe('ios');
  });

  test('a Mac with no touch screen is not taken for an iPad', () => {
    expect(installVariant(context({ userAgent: UA.macSafari }))).toBe('mac-safari');
  });

  test.each([
    ['Firefox on Android', UA.firefoxAndroid],
    // Already installed, or not offered: the menu is still where it lives.
    ['Chrome on Android without the prompt', UA.chromeAndroid]
  ])('%s gets the browser menu steps', (_, userAgent) => {
    expect(installVariant(context({ userAgent }))).toBe('android-menu');
  });

  test.each([
    ['Firefox or LibreWolf on Linux', UA.firefoxLinux],
    ['Firefox on Windows', UA.firefoxWindows]
  ])('%s gets the add-on recommendation', (_, userAgent) => {
    expect(installVariant(context({ userAgent }))).toBe('firefox-desktop');
  });

  test.each([
    ['Chrome on Linux', UA.chromeLinux],
    ['Chrome on a Mac', UA.macChrome],
    ['Edge on Windows', UA.edgeWindows]
  ])('%s without the prompt gets the desktop fallback', (_, userAgent) => {
    expect(installVariant(context({ userAgent }))).toBe('desktop-menu');
  });

  test.each(Object.entries(UA))('%s already running installed gets nothing', (_, userAgent) => {
    expect(installVariant(context({ userAgent, installed: true }))).toBeNull();
    expect(installVariant(context({ userAgent, installed: true, promptReady: true }))).toBeNull();
  });
});
