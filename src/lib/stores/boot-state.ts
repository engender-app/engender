import type { JournalAccessMode } from '../data/journal-access-mode.ts';
import type { Journal } from '../data/journal/journal.ts';
import type { AndroidKeyRefusal } from '../lock/android-key.ts';

type BootStatus =
  | 'booting'
  | 'needs-setup'
  | 'needs-unlock'
  | 'needs-authentication'
  | 'needs-device-recovery'
  | 'legacy-refused'
  | 'ready'
  | 'schema-too-new'
  | 'error';

/** Which failure a boot ended in, in the terms the failure screen speaks
    (after-release ticket 09). The raw text stays in `error`, which the screen
    shows only behind its bug-report control.

    - `unreadable`: the key does not read the journal file. SQLCipher reports a
      wrong key and a file that is not a database the same way, SQLITE_NOTADB
      (ADR-0020), and retrying cannot fix either (ux-carpet 210).
    - `below-baseline`: a development build's journal from before the
      squashed baseline (migrations.ts), which this build cannot carry forward.
    - `android-plaintext`: a phone still holding a journal from before Android
      encryption.
    - `engine`: the database itself never started - the worker or its wasm
      failed to load, or the SQLite build lacks FTS5.
    - `unknown`: anything nobody has named yet. */
export type BootFailure = 'unreadable' | 'below-baseline' | 'android-plaintext' | 'engine' | 'unknown';


interface BootShape {
  status: BootStatus;
  accessMode: JournalAccessMode;
  error: string | null;
  failure: BootFailure | null;
  persistDenied: boolean;
  recoverable: boolean;
  journal: Journal | null;
  androidKey: AndroidKeyRefusal | null;
}

type BootingState = BootShape & {
  status: 'booting';
  error: null;
  recoverable: false;
  persistDenied: false;
  journal: null;
  androidKey: null;
};

type NeedsSetupState = BootShape & {
  status: 'needs-setup';
  error: null;
  recoverable: false;
  persistDenied: false;
  journal: null;
  androidKey: null;
};

type NeedsUnlockState = BootShape & {
  status: 'needs-unlock';
  error: null;
  recoverable: false;
  persistDenied: false;
  journal: null;
  androidKey: null;
};

type NeedsAuthenticationState = BootShape & {
  status: 'needs-authentication';
  error: null;
  recoverable: false;
  persistDenied: false;
  journal: null;
};

type NeedsDeviceRecoveryState = BootShape & {
  status: 'needs-device-recovery';
  error: null;
  recoverable: false;
  persistDenied: false;
  journal: null;
  androidKey: null;
};

type LegacyRefusedState = BootShape & {
  status: 'legacy-refused';
  error: null;
  recoverable: false;
  persistDenied: false;
  journal: null;
  androidKey: null;
};

type ReadyState = BootShape & {
  status: 'ready';
  error: null;
  recoverable: false;
  /** Null while a web lock has the journal closed (after-release ticket 10). */
  journal: Journal | null;
  androidKey: null;
};

type SchemaTooNewState = BootShape & {
  status: 'schema-too-new';
  error: null;
  recoverable: false;
  persistDenied: false;
  journal: null;
  androidKey: null;
};

type ErrorState = BootShape & {
  status: 'error';
  error: string;
  failure: BootFailure;
  journal: null;
  persistDenied: false;
  androidKey: null;
};

export type BootState =
  | BootingState
  | NeedsSetupState
  | NeedsUnlockState
  | NeedsAuthenticationState
  | NeedsDeviceRecoveryState
  | LegacyRefusedState
  | ReadyState
  | SchemaTooNewState
  | ErrorState;

interface SetupUnlockOptions {
  accessMode?: JournalAccessMode;
}

type MutableTarget =
  | 'needs-setup'
  | 'needs-unlock'
  | 'needs-authentication'
  | 'needs-device-recovery'
  | 'legacy-refused'
  | 'schema-too-new'
  | 'ready';

function invalidTransition(state: BootState, target: MutableTarget): never {
  throw new Error(`Invalid transition: ${state.status} -> ${target}`);
}

function base() {
  return {
    error: null,
    failure: null,
    persistDenied: false,
    recoverable: false,
    journal: null,
    androidKey: null
  } as const;
}

function booting(accessMode: JournalAccessMode = null): BootingState {
  return {
    status: 'booting',
    accessMode,
    ...base()
  };
}

function needsUnlockState(accessMode: JournalAccessMode = null): NeedsUnlockState {
  return {
    status: 'needs-unlock',
    accessMode,
    ...base(),
  };
}

function needsSetup(state: BootState, options: SetupUnlockOptions = {}): NeedsSetupState {
  if (state.status !== 'booting' && state.status !== 'needs-unlock') invalidTransition(state, 'needs-setup');
  const accessMode = options.accessMode ?? state.accessMode;
  return {
    status: 'needs-setup',
    accessMode,
    ...base(),
  };
}

function needsUnlock(state: BootState, options: SetupUnlockOptions = {}): NeedsUnlockState {
  if (state.status !== 'booting' && state.status !== 'needs-unlock') invalidTransition(state, 'needs-unlock');
  const accessMode = options.accessMode ?? state.accessMode;
  return {
    status: 'needs-unlock',
    accessMode,
    ...base(),
  };
}

function needsAuthentication(state: BootState, androidKey: AndroidKeyRefusal | null = null): NeedsAuthenticationState {
  if (state.status !== 'booting' && state.status !== 'needs-unlock' && state.status !== 'needs-authentication') {
    invalidTransition(state, 'needs-authentication');
  }
  return {
    status: 'needs-authentication',
    accessMode: state.accessMode,
    ...base(),
    androidKey
  };
}

function needsDeviceRecovery(state: BootState): NeedsDeviceRecoveryState {
  if (state.status !== 'booting' && state.status !== 'needs-unlock') {
    invalidTransition(state, 'needs-device-recovery');
  }
  return {
    status: 'needs-device-recovery',
    accessMode: state.accessMode,
    ...base()
  };
}

function legacyRefused(state: BootState): LegacyRefusedState {
  if (state.status !== 'booting' && state.status !== 'needs-unlock') {
    invalidTransition(state, 'legacy-refused');
  }
  return { status: 'legacy-refused', accessMode: state.accessMode, ...base() };
}

function schemaTooNew(state: BootState): SchemaTooNewState {
  if (state.status !== 'booting') invalidTransition(state, 'schema-too-new');
  return {
    status: 'schema-too-new',
    accessMode: state.accessMode,
    ...base()
  };
}

function ready(state: BootState, payload: { journal: Journal }): ReadyState {
  if (state.status !== 'booting') invalidTransition(state, 'ready');
  return {
    status: 'ready',
    accessMode: state.accessMode,
    ...base(),
    journal: payload.journal
  };
}

/** Swaps the journal handle a ready boot holds: null when a web lock closes
    it, the reopened one after the unlock (after-release ticket 10). Any
    other state is left as it is. */
function withJournal(state: BootState, journal: Journal | null): BootState {
  if (state.status !== 'ready') return state;
  return { ...state, journal };
}

/** The persistence request's answer, arriving whenever the browser gets to
    it (ticket 202: no longer awaited before `ready`). A no-op once the
    journal has moved past `ready` - a late answer is still true, but there
    is no `persistDenied` left on a state whose type pins it to `false`. */
function markPersistDenied(state: BootState): BootState {
  if (state.status !== 'ready') return state;
  return { ...state, persistDenied: true };
}

function failure(state: BootState, error: string, kind: BootFailure): ErrorState {
  return {
    status: 'error',
    accessMode: state.accessMode,
    ...base(),
    error,
    failure: kind
  };
}

function errorRecoverable(state: BootState, recoverable: boolean): ErrorState {
  if (state.status !== 'error') throw new Error(`Invalid transition: ${state.status} -> error`);
  return {
    ...state,
    recoverable
  };
}

function accessMode(state: BootState, mode: JournalAccessMode): BootState {
  return {
    ...state,
    accessMode: mode
  };
}

function resetToBooting(state: BootState): BootingState {
  return booting(state.accessMode);
}

export function isReadyState(state: BootState): state is ReadyState {
  return state.status === 'ready';
}

export function isErrorState(state: BootState): state is ErrorState {
  return state.status === 'error';
}

type BootGate = 'none' | 'passphrase' | 'authentication' | 'device-recovery' | 'schema-too-new';

type PassphraseMode = 'setup' | 'unlock';
type PassphraseScreen = 'none' | 'form' | 'legacy-refused';

export function bootGate(state: BootState): BootGate {
  switch (state.status) {
    case 'needs-setup':
    case 'needs-unlock':
    case 'legacy-refused':
      return 'passphrase';
    case 'needs-authentication':
      return 'authentication';
    case 'needs-device-recovery':
      return 'device-recovery';
    case 'schema-too-new':
      return 'schema-too-new';
    case 'booting':
    case 'ready':
    case 'error':
      return 'none';
  }
}

/** Whether the mid-session lock may render at all.

    "Mid-session" is literally "the journal is open", and saying so here is
    load-bearing rather than pedantic. `bootGate` returns 'none' while a boot
    is still in flight, so nothing above the lock in the layout's chain claims
    the screen during `booting` - and the moment the survey records an access
    mode, that mode has a secret and the session has not been marked unlocked
    yet, so the lock would render *over a boot that was about to finish on its
    own*. Ticket 53 shipped exactly that for a moment: the old check read
    `prefs.pinHash`, which is null until the real preferences load, so the
    window existed and was never entered. Reading the access mode instead
    opened it, and a cold start flashed the re-entry screen. The walkthrough
    caught it as a draft lost across a reload. */
export function midSessionLockApplies(state: BootState): boolean {
  return state.status === 'ready';
}

export function passphraseMode(state: BootState): PassphraseMode | null {
  switch (state.status) {
    case 'needs-setup':
      return 'setup';
    case 'needs-unlock':
      return 'unlock';
    case 'booting':
    case 'needs-authentication':
    case 'needs-device-recovery':
    case 'legacy-refused':
    case 'ready':
    case 'schema-too-new':
    case 'error':
      return null;
  }
}

/** Onboarding renders only over an empty journal's setup gate. */
export function needsOnboardingAccessMode(state: BootState): boolean {
  return bootGate(state) === 'passphrase' && passphraseMode(state) === 'setup';
}

export function passphraseScreen(state: BootState): PassphraseScreen {
  switch (state.status) {
    case 'needs-setup':
    case 'needs-unlock':
      return 'form';
    case 'legacy-refused':
      return 'legacy-refused';
    case 'booting':
    case 'needs-authentication':
    case 'needs-device-recovery':
    case 'ready':
    case 'schema-too-new':
    case 'error':
      return 'none';
  }
}

export const bootStates = {
  booting,
  needsUnlock: needsUnlockState
};

export const bootTransitions = {
  setAccessMode: accessMode,
  toBooting: resetToBooting,
  toNeedsSetup: needsSetup,
  toNeedsUnlock: needsUnlock,
  toNeedsAuthentication: needsAuthentication,
  toNeedsDeviceRecovery: needsDeviceRecovery,
  toLegacyRefused: legacyRefused,
  toSchemaTooNew: schemaTooNew,
  toReady: ready,
  toError: failure,
  markErrorRecoverable: errorRecoverable,
  markPersistDenied,
  withJournal
};
