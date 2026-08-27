/* The floor under an archive password (phase 5 security ticket 02, F-03).

   Until this, export, scheduled backup and import all decided the same
   question with a falsy check on the field, so a one-character password
   packed a whole journal. The journal passphrase - the credential that
   never leaves the device - has had a floor since ticket 09; the archive
   password is the one that travels, through a share sheet into a cloud
   drive or into a backup folder that syncs, so it gets the same number
   from the same place rather than a second one of its own.

   Argon2id at the archive profile (ADR-0013) is real work per guess, and
   still not enough on its own: a four-character password falls in an
   afternoon and the whole journal is behind it.

   The floor sits on the two fields that CHOOSE a password. Opening an
   archive takes whatever it was made with, including one made before this
   existed, so nothing here is called on the import path. */

import { MIN_PASSPHRASE_LENGTH } from '../journal-passphrase';

/** Which refusal, not which sentence: the export field, the backup switch
    and the backup button each already have their own wording for an empty
    field, and only the floor is shared. */
export type ArchivePasswordProblem = 'missing' | 'too-short';

export function archivePasswordProblem(password: string): ArchivePasswordProblem | null {
  if (!password) return 'missing';
  if (password.length < MIN_PASSPHRASE_LENGTH) return 'too-short';
  return null;
}
