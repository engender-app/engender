/* Which way of installing the journal to offer, for a visitor the landing
   site sent here with `?install` (installRequest.ts reads that).

   Only a page's own origin can be installed, so the landing cannot do it
   and hands the visitor over. Browsers differ in what they let a page do:
   Chromium hands over a deferred `beforeinstallprompt` that a tap can
   replay, Safari and Firefox on Android only install from their own menus,
   and desktop Firefox (LibreWolf included, which sends Firefox's string)
   cannot install at all without an add-on. The deferred prompt decides
   first, whatever the user agent says, because it is the browser's own
   word that one tap will work; the user agent only picks which steps to
   show when it is missing.

   Pure, with every input passed in, so the tests never depend on the
   browser running them. */

export type InstallVariant = 'prompt' | 'ios' | 'android-menu' | 'firefox-desktop' | 'mac-safari' | 'desktop-menu';

export interface InstallContext {
  userAgent: string;
  /** navigator.maxTouchPoints: the one thing that tells an iPad asking
      for desktop sites, which sends a Mac string, from a Mac. */
  touchPoints: number;
  /** Already running as the installed app, on any platform. */
  installed: boolean;
  /** A deferred `beforeinstallprompt` is held. */
  promptReady: boolean;
}

export function installVariant({ userAgent, touchPoints, installed, promptReady }: InstallContext): InstallVariant | null {
  if (installed) return null;
  if (promptReady) return 'prompt';
  const mac = /Macintosh/.test(userAgent);
  if (/iPhone|iPad|iPod/.test(userAgent) || (mac && touchPoints > 1)) return 'ios';
  if (/Android/.test(userAgent)) return 'android-menu';
  if (/Firefox\//.test(userAgent)) return 'firefox-desktop';
  if (mac && /Version\/[\d.]+ Safari\//.test(userAgent)) return 'mac-safari';
  return 'desktop-menu';
}
