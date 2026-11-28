/* The backup password's two doors.

   "Back up now" used to save whatever was in the export password field as the password for
   every later backup, with no confirmation and no comparison with the saved one. A typo or
   an autofill therefore sealed every scheduled backup under a password nobody knew, and
   retention, which keeps five, pushed the last good one out after five of them.

   Now the two acts are apart. Running a backup only ever reads the saved password (behind
   the bridge, through deriveKey); a password typed into the export field is checked against
   it and a mismatch is refused, never adopted. Setting or changing the saved password is
   its own step, typed twice, and nothing else calls setPassword. */

import { archivePasswordProblem } from './password';
import { androidAutoExport } from './android-auto-export-bridge';

type BackupNowCheck = { ok: true } | { ok: false; problem: 'mismatch' | 'no-password' };

/** Whether "Back up now" may run with the saved password. An empty field is
    fine: the saved password is what the backup uses either way, and the
    field only matters when it disagrees. */
export async function checkBackupNow(typed: string): Promise<BackupNowCheck> {
  const { hasPassword } = await androidAutoExport.status();
  if (!hasPassword) return { ok: false, problem: 'no-password' };
  if (typed && !(await androidAutoExport.checkPassword({ password: typed })).matches) {
    return { ok: false, problem: 'mismatch' };
  }
  return { ok: true };
}

type PasswordChange = 'saved' | 'missing' | 'too-short' | 'mismatch';

/** The one place the saved backup password is written. The archive floor
    applies to the new one (password.ts); the repeat has to match it. */
export async function changeBackupPassword(next: string, repeat: string): Promise<PasswordChange> {
  const problem = archivePasswordProblem(next);
  if (problem) return problem;
  if (next !== repeat) return 'mismatch';
  await androidAutoExport.setPassword({ password: next });
  return 'saved';
}
