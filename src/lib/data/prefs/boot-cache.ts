/* The mirror outside SQLite (ADR-0009). Web only for now: Android gets a
   Capacitor Preferences adapter behind the same PreferenceCache interface
   when the shell lands, which is the whole reason the interface exists
   rather than openPreferences() calling localStorage itself.

   The key and the JSON shape are also read by the pre-paint script inlined
   in src/app.html, which runs before any module is parsed and so cannot
   import this file. Changing either means changing both, and that is
   asserted rather than only written down here: tests/app-html-chrome.test.ts
   runs that script over BOOT_CACHE_KEY and the fixture's preference shapes,
   so a key or a field name that drifts on one side leaves the script
   finding no mirror and painting defaults, which the fixture fails on. */

import type { BootPreferences, PreferenceCache } from './preferences.ts';

export const BOOT_CACHE_KEY = 'engender-boot-prefs';

export function localStorageCache(): PreferenceCache {
  return {
    read() {
      try {
        const raw = localStorage.getItem(BOOT_CACHE_KEY);
        return raw ? (JSON.parse(raw) as Partial<BootPreferences>) : {};
      } catch {
        // A damaged mirror is not worth failing a boot over: SQLite holds
        // the real values and is a few hundred milliseconds away.
        return {};
      }
    },
    write(boot) {
      try {
        localStorage.setItem(BOOT_CACHE_KEY, JSON.stringify(boot));
      } catch {
        /* storage full / private mode - the next cold start just waits for SQLite */
      }
    },
    clear() {
      localStorage.removeItem(BOOT_CACHE_KEY);
    }
  };
}
