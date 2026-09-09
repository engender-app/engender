/* The failure paths, first, because this is the one flow where being wrong
   loses somebody's journal (ticket 36). The guard is what stands between an
   incomplete form and a decryption attempt, and it is the half of the flow a
   Node test can reach - the rest opens a real container and lives in the
   walkthrough. */

import { describe, expect, it } from 'vitest';

import { restoreGuard } from './restoreFlow.ts';
import type { PickedArchive } from '../archive/pick.ts';

const file: PickedArchive = {
  name: 'engender.ttbackup',
  bytes: async function* () {}
};

describe('what a restore refuses before it opens anything', () => {
  it('asks for the file first, since a password with nothing to open is not a restore', () => {
    expect(restoreGuard(null, 'hunter2')).toBe('pick-first');
  });

  it('asks for the file before the password when neither is there', () => {
    /* One refusal at a time, and the file is the one to name: a screen that
       says "and also the password" about a form nobody has started reading
       is telling somebody off. */
    expect(restoreGuard(null, '')).toBe('pick-first');
  });

  it('refuses an empty password rather than deriving a key from one', () => {
    expect(restoreGuard(file, '')).toBe('password-needed');
  });

  it('lets a complete form through', () => {
    expect(restoreGuard(file, 'hunter2')).toBe(null);
  });

  it('takes a password of one character, which is the archive password rule, not this one', () => {
    /* The floor for an archive password belongs to whoever wrote the file
       (archive/password.ts) and cannot be re-litigated at the door: a person
       restoring is typing back something they already chose, and a guard
       that second-guesses it would refuse a real archive. */
    expect(restoreGuard(file, ' ')).toBe(null);
  });
});
