/* The lock step's own two screens (ticket 30, ADR-0041).

   AccessModeSetup used to run choosing a mode and typing its secret together:
   the list, then a consequence paragraph, a device-tie warning, an
   instruction, a pad and a status line, all inside one container that was
   allowed to grow - which is why the screen scrolled with a keyboard raised.
   This is the machine behind the split, framework-free and unit-testable on
   its own the same way kit/recordEditor.ts is split from its component.

   Three states carry two screens. `list` and `detail` are both screen one:
   choosing, and then reading what the choice costs. `secret` is screen two,
   reached only from a `detail` whose mode has something to type - a mode
   with nothing to type is confirmed from its own detail screen, and this
   machine never puts anything on a screen with nothing on it. */

export type AccessSetupMode = 'device-bound' | 'pin' | 'passphrase' | 'biometric' | 'unlocked';

export type SecretMode = 'pin' | 'passphrase';

export function needsSecret(mode: AccessSetupMode): mode is SecretMode {
  return mode === 'pin' || mode === 'passphrase';
}

export type AccessModeScreen =
  | { screen: 'list' }
  | { screen: 'detail'; mode: AccessSetupMode }
  | { screen: 'secret'; mode: SecretMode };

/** Selecting a row: every mode's consequence is read on its own detail
    screen before anything is confirmed, whether or not there is a secret to
    type next. */
export function chooseMode(mode: AccessSetupMode): AccessModeScreen {
  return { screen: 'detail', mode };
}

/** Screen one to screen two. A no-op off a mode with nothing to type, or off
    any screen but a detail one - neither is a button this machine's own
    caller ever renders, so this only has to be a safe default rather than a
    reachable one. */
export function continueToSecret(current: AccessModeScreen): AccessModeScreen {
  if (current.screen !== 'detail' || !needsSecret(current.mode)) return current;
  return { screen: 'secret', mode: current.mode };
}

/** Screen two back to screen one - the mode still chosen, not the bare
    list. */
export function backToDetail(current: AccessModeScreen): AccessModeScreen {
  if (current.screen !== 'secret') return current;
  return { screen: 'detail', mode: current.mode };
}

/** "Pick another way": screen one's own detail back to its bare list. */
export function backToList(): AccessModeScreen {
  return { screen: 'list' };
}
