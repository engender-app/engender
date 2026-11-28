/* The boot mirror's read, and the Android shell's hand-over of the live disguise. The
   mirror lives in localStorage, which Chromium flushes to disk after a delay; the disguise
   flip kills the process inside that delay, so the first start after a flip reads the old
   answer unless the shell's alias, written before the kill, outranks it. */

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOT_CACHE_KEY, localStorageCache, nativeDisguise } from './boot-cache.ts';

function mirror(boot: object | null) {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key === BOOT_CACHE_KEY && boot ? JSON.stringify(boot) : null)
  });
}

function shell(disguised: boolean) {
  vi.stubGlobal('androidDisguiseState', { isDisguised: () => disguised });
}

afterEach(() => vi.unstubAllGlobals());

describe('the boot mirror read under the Android shell', () => {
  it('reads disguise on after a flip on whose mirror write was lost to the kill', () => {
    mirror({ palette: 'trans', disguise: false });
    shell(true);
    expect(localStorageCache().read()).toMatchObject({ palette: 'trans', disguise: true });
  });

  it('reads disguise off after a flip off whose mirror write was lost to the kill', () => {
    mirror({ palette: 'trans', disguise: true });
    shell(false);
    expect(localStorageCache().read().disguise).toBe(false);
  });

  it('answers from the shell on a first-ever start with no mirror', () => {
    mirror(null);
    shell(true);
    expect(localStorageCache().read()).toEqual({ disguise: true });
  });

  it('still answers from the shell when the mirror is damaged or storage throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{not json' });
    shell(true);
    expect(localStorageCache().read()).toEqual({ disguise: true });
    vi.stubGlobal('localStorage', { getItem: () => 'null' });
    expect(localStorageCache().read()).toEqual({ disguise: true });
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage blocked');
      }
    });
    expect(localStorageCache().read()).toEqual({ disguise: true });
  });

  it('keeps the mirror when there is no shell', () => {
    mirror({ disguise: true });
    expect(nativeDisguise()).toBeNull();
    expect(localStorageCache().read().disguise).toBe(true);
  });

  it('keeps the mirror when the shell throws', () => {
    mirror({ disguise: true });
    vi.stubGlobal('androidDisguiseState', {
      isDisguised: () => {
        throw new Error('bridge gone');
      }
    });
    expect(localStorageCache().read().disguise).toBe(true);
  });
});

describe('the hand-over name', () => {
  it('is the one DisguiseState.java exposes, in both readers', () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
    const java = read('../../../../android/app/src/main/java/dev/engender/app/disguise/DisguiseState.java');
    const name = /INTERFACE_NAME = "(\w+)"/.exec(java)?.[1];
    expect(name).toBe('androidDisguiseState');
    expect(read('../../../app.html')).toContain(`window.${name}`);
    expect(read('./boot-cache.ts')).toContain(`${name}?:`);
  });
});
