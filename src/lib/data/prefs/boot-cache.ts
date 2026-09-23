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
export const BOOT_ACCESS_MODE_KEY = 'engender-boot-access-mode';
/** Both boot mirrors, in one place: the keys a reset's browser-mirror sweep
    must step over and clear() must remove together, so the two lists this
    repo has always kept (one for "skip on the way past", one for "take
    these last") can't drift apart by a key added to only one of them. */
export const BOOT_MIRROR_KEYS = [BOOT_CACHE_KEY, BOOT_ACCESS_MODE_KEY] as const;

export type CachedAccessMode = 'pin' | 'passphrase';

export function readCachedAccessMode(): CachedAccessMode | null {
  try {
    const raw = localStorage.getItem(BOOT_ACCESS_MODE_KEY);
    if (raw === 'pin' || raw === 'passphrase') {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCachedAccessMode(mode: CachedAccessMode | null): void {
  try {
    if (mode === null) {
      localStorage.removeItem(BOOT_ACCESS_MODE_KEY);
    } else {
      localStorage.setItem(BOOT_ACCESS_MODE_KEY, mode);
    }
  } catch {
    /* storage full / private mode */
  }
}

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
      for (const key of BOOT_MIRROR_KEYS) localStorage.removeItem(key);
    }
  };
}
