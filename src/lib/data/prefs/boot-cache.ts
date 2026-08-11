/* The mirror outside SQLite (ADR-0009). Web only for now: Android gets a
   Capacitor Preferences adapter behind the same PreferenceCache interface
   when the shell lands, which is the whole reason the interface exists
   rather than openPreferences() calling localStorage itself.

   The key and the JSON shape are also read by the pre-paint script inlined
   in src/app.html, which runs before any module is parsed and so cannot
   import this file. Changing either means changing both. */

import type { BootPreferences, PreferenceCache } from './preferences.ts';

export const BOOT_CACHE_KEY = 'gender-diary-boot-prefs';

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
