/* Whether this journal has a recovery key, in one place (ADR-0054, ticket
   sec-02).

   Seven surfaces need this fact - three gates, the dead-end screen, the
   security list, the access-mode module and the two change-a-secret screens
   - and each of them read the file itself at first, which was wrong in three
   ways at once.

   It was a false sentence at first paint, which is the one thing
   docs/ui-copy.md forbids outright on a screen that carries risk. Each
   component started at "no recovery key" and swapped a frame later, so a
   journal that has one opened on "this copy cannot be reopened" and on "a
   recovery key would have opened this" before correcting itself. Hence
   `known`: nothing that depends on the answer draws until there is one.

   It was seven unhandled rejections. `recoveryKeyExists` swallows an
   unreadable file and rethrows everything else, and none of the seven
   callers had a catch.

   And it was the same four lines seven times, which is how the first two
   problems came to be in seven places rather than one.

   On an unexpected failure `known` deliberately stays false rather than
   settling on "no key". The screens that read this are the ones where being
   wrong means telling somebody their journal cannot be opened, and silence
   is the honest answer to a question this could not ask. */

import { recoveryKeyExists } from './recovery-key';

export const recoveryKeyPresence = $state({
  /** Whether the answer is in yet. Nothing conditional draws until it is. */
  known: false,
  exists: false
});

/** Re-reads the file. Called on mount by everything that shows the answer,
    and again by the screen that mints or revokes one - a file read is cheap
    enough that caching it would only be a way to go stale. */
export async function refreshRecoveryKeyPresence(): Promise<void> {
  try {
    const found = await recoveryKeyExists();
    recoveryKeyPresence.exists = found;
    recoveryKeyPresence.known = true;
  } catch (error) {
    console.error('could not tell whether this journal has a recovery key', error);
    recoveryKeyPresence.known = false;
  }
}
