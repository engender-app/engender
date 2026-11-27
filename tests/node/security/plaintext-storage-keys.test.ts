/* What the app may leave in plaintext browser storage.

   localStorage is readable without unlocking the journal, so a key there is
   a fact about the journal that anyone with the device's files can read.
   The tile snoozes, the opened and greeted letter ids and the "has entries"
   hint used to be such keys and now live in the encrypted `acknowledgements`
   preference. This test lists every key literal the source names, says why
   each one that stays is allowed to, and fails on a new one nobody decided
   about. A key spelled through a template is listed by its prefix.

   It reads the source rather than a running app on purpose: the writers sit
   in screens, stores and a pre-paint script, and the question is which names
   exist at all. */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));

/** Every plaintext localStorage key that may stay, and the reason. */
const PLAINTEXT_LOCAL_STORAGE: Record<string, string> = {
  'engender-boot-prefs': 'the boot mirror: theme, language, lock flags and, while disguised, only the default palette',
  'engender-boot-access-mode': 'the boot mirror: whether the lock screen asks for a PIN or a passphrase',
  PARAGLIDE_LOCALE: 'the locale strategy, read before any module loads',
  'engender-pin-attempts': 'PIN throttling, which has to count before the journal can be opened',
  'engender-entry-draft': 'an encrypted blob, not plaintext',
  'engender-home-reserve': "Home's three layout heights, per device, read before the journal answers; they name no screen",
  'engender-orphan-sweep': 'FA 51 install-local housekeeping stamp; its -retry and -handled keys derive from it',
  'yank-sweep-profile': 'the demo and the yank sweep only'
};

/** Names `engender-` also carries that are not localStorage keys. */
const NOT_LOCAL_STORAGE: Record<string, string> = {
  'engender-journal-initialization': 'a Web Lock name',
  'engender-device-key': 'an IndexedDB database name',
  'engender-search-return': 'a legacy sessionStorage key, only ever removed',
  'engender-shell': 'the offline shell cache name prefix and its client-count URL',
  'engender-app': 'the GitHub organisation in a source link',
  'engender-recent-searches': 'a legacy key, only ever removed'
};

/** The keys the acknowledgements preference replaced. Only the move out of
    them, and the reset's sweep, may still name them. */
const REPLACED: Record<string, string[]> = {
  'engender-has-entries': ['src/lib/data/acknowledgements.ts'],
  'engender-read-letter-ids': ['src/lib/data/acknowledgements.ts'],
  'engender-greeted-letter-ids': ['src/lib/data/acknowledgements.ts'],
  'engender-tile-snooze': ['src/lib/data/acknowledgements.ts'],
  letter_tile_snooze_until: ['src/lib/data/acknowledgements.ts', 'src/lib/data/reset.ts'],
  /* Security-scan ticket 08: the stock notice snooze is the stock-notice
     tile's, and every screen's height but Home's is `layoutReserves`. */
  'engender-stock-notice-snooze-until': ['src/lib/data/acknowledgements.ts'],
  stock_notice_snooze_until: ['src/lib/data/acknowledgements.ts'],
  'engender-reserve': ['src/lib/data/homeReserve.ts']
};

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'paraglide' || name === 'node_modules') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.(ts|svelte|html)$/.test(name) && !/\.test\.ts$/.test(name)) found.push(path);
  }
  return found;
}

const KEY_LITERAL = /engender-[a-z0-9-]*[a-z0-9]|letter_tile_snooze_until|stock_notice_snooze_until|PARAGLIDE_LOCALE|yank-sweep-profile/g;

function literals(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const file of [...sourceFiles(join(root, 'src')), join(root, 'src/app.html')]) {
    const text = readFileSync(file, 'utf8');
    for (const [key] of text.matchAll(KEY_LITERAL)) {
      const files = found.get(key) ?? new Set<string>();
      files.add(relative(root, file));
      found.set(key, files);
    }
  }
  return found;
}

describe('plaintext storage keys', () => {
  const named = literals();

  it('names no key nobody has decided about', () => {
    const decided = new Set([
      ...Object.keys(PLAINTEXT_LOCAL_STORAGE),
      ...Object.keys(NOT_LOCAL_STORAGE),
      ...Object.keys(REPLACED)
    ]);
    // A key that only appears inside a comment is still a name, so a prose
    // mention counts: keep the decided list in step with the prose.
    const undecided = [...named.keys()].filter((key) => ![...decided].some((d) => key === d || key.startsWith(d + '-')));
    expect(undecided).toEqual([]);
  });

  it('no longer writes the snoozes, the letter ids, the entries hint or a screen height to plaintext', () => {
    const stray: string[] = [];
    for (const [key, allowedIn] of Object.entries(REPLACED)) {
      for (const [name, files] of named) {
        if (name !== key && !name.startsWith(key + '-')) continue;
        for (const file of files) if (!allowedIn.includes(file)) stray.push(`${name} in ${file}`);
      }
    }
    expect(stray).toEqual([]);
  });

  it('keeps the three FA 51 sweep keys out of the portable acknowledgements', () => {
    const acknowledgements = readFileSync(join(root, 'src/lib/data/acknowledgements.ts'), 'utf8');
    expect(acknowledgements).not.toContain('orphan-sweep');
    expect(readFileSync(join(root, 'src/lib/data/sqlite/orphan-sweep-schedule.ts'), 'utf8')).toContain(
      "const KEY = 'engender-orphan-sweep'"
    );
  });
});
