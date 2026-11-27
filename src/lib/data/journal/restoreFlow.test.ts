/* The failure paths, first, because this is the one flow where being wrong
   loses somebody's journal. The guard is what stands between an
   incomplete form and a decryption attempt, and it is the half of the flow a
   Node test can reach - the rest opens a real container and lives in the
   walkthrough. */

import { describe, expect, it } from 'vitest';

import { restoreFailureKind, restoreGuard, runVerify } from './restoreFlow.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { emptyArchiveJournal } from './archiveSections.ts';
import { portablePreferences } from '../archive/payload.ts';
import { collect } from '../archive/container.ts';
import { packArchive } from '../archive/pack.ts';
import { DecryptionFailedError } from '../../crypto/aesGcm.ts';
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

  it('tries an empty password, since an export may be made without one (bug session 18, item 80)', () => {
    expect(restoreGuard(file, '')).toBe(null);
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

describe('what an empty password that does not open the file is called', () => {
  it('asks for the password rather than calling an empty field wrong', () => {
    expect(restoreFailureKind(new DecryptionFailedError(null), '')).toBe('password-needed');
  });

  it('keeps wrong-password for a typed one', () => {
    expect(restoreFailureKind(new DecryptionFailedError(null), 'hunter2')).toBe('wrong-password');
  });
});

describe('an archive exported without a password', () => {
  async function packed(password: string): Promise<PickedArchive> {
    const bytes = await collect(packArchive({ journal: emptyArchiveJournal(),
      preferences: portablePreferences(PREFERENCE_DEFAULTS), files: [], readFile: async () => new Uint8Array() }, password));
    return { name: 'engender.ttbackup', bytes: async function* () { yield bytes; } };
  }

  it('opens with the field left empty', async () => {
    expect(await runVerify(await packed(''), '', () => {})).toEqual({ ok: true });
  });

  it('asks for the password when the field is empty and the archive has one', async () => {
    expect(await runVerify(await packed('archive password'), '', () => {})).toEqual({ ok: false, kind: 'password-needed' });
  });
});
