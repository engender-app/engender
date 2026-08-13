import type { ConversionProgress, ConversionRefusal } from '../data/conversion/conversion.ts';
import type { JournalAccessMode } from '../data/journal-access-mode.ts';
import type { Journal } from '../data/journal/journal.ts';
import type { AndroidKeyRefusal } from '../lock/android-key.ts';

export type BootStatus =
  | 'booting'
  | 'needs-setup'
  | 'needs-unlock'
  | 'needs-authentication'
  | 'needs-device-recovery'
  | 'converting'
  | 'conversion-refused'
  | 'ready'
  | 'schema-too-new'
  | 'error';

export type PendingConversion = { progress: null };
export type ConversionState = { progress: ConversionProgress | null };

interface BootShape {
  status: BootStatus;
  accessMode: JournalAccessMode;
  error: string | null;
  persistDenied: boolean;
  recoverable: boolean;
  journal: Journal | null;
  conversion: ConversionState | null;
  conversionRefusal: ConversionRefusal | null;
  androidKey: AndroidKeyRefusal | null;
}

export type BootingState = BootShape & {
  status: 'booting';
  error: null;
  recoverable: false;
  persistDenied: false;
  journal: null;
  conversion: null;
  conversionRefusal: null;
  androidKey: null;
};

export type NeedsSetupState = BootShape & {
  status: 'needs-setup';
  error: null;
  recoverable: false;
  persistDenied: false;
  journal: null;
  conversion: PendingConversion | null;
  conversionRefusal: null;
  androidKey: null;
};

export type NeedsUnlockState = BootShape & {
  status: 'needs-unlock';
  error: null;
  recoverable: false;
  persistDenied: false;
  journal: null;
  conversion: PendingConversion | null;
  conversionRefusal: null;
  androidKey: null;
};

export type NeedsAuthenticationState = BootShape & {
  status: 'needs-authentication';
  error: null;
  recoverable: false;
  persistDenied: false;
  journal: null;
  conversion: null;
  conversionRefusal: null;
};

export type NeedsDeviceRecoveryState = BootShape & {
  status: 'needs-device-recovery';
  error: null;
  recoverable: false;
  persistDenied: false;
  journal: null;
  conversion: null;
  conversionRefusal: null;
  androidKey: null;
};

export type ConvertingState = BootShape & {
  status: 'converting';
  error: null;
  recoverable: false;
  persistDenied: false;
  journal: null;
  conversion: ConversionState;
  conversionRefusal: null;
  androidKey: null;
};

export type ConversionRefusedState = BootShape & {
  status: 'conversion-refused';
  error: null;
  recoverable: false;
  persistDenied: false;
  journal: null;
  conversion: null;
  conversionRefusal: ConversionRefusal;
  androidKey: null;
};

export type ReadyState = BootShape & {
  status: 'ready';
  error: null;
  recoverable: false;
  journal: Journal;
  conversion: null;
  conversionRefusal: null;
  androidKey: null;
};

export type SchemaTooNewState = BootShape & {
  status: 'schema-too-new';
  error: null;
  recoverable: false;
  persistDenied: false;
  journal: null;
  conversion: null;
  conversionRefusal: null;
  androidKey: null;
};

export type ErrorState = BootShape & {
  status: 'error';
  error: string;
  journal: null;
  persistDenied: false;
  conversion: null;
  conversionRefusal: null;
  androidKey: null;
};

export type BootState =
  | BootingState
  | NeedsSetupState
  | NeedsUnlockState
  | NeedsAuthenticationState
  | NeedsDeviceRecoveryState
  | ConvertingState
  | ConversionRefusedState
  | ReadyState
  | SchemaTooNewState
  | ErrorState;

interface SetupUnlockOptions {
  accessMode?: JournalAccessMode;
  conversionRequired?: boolean;
}

type MutableTarget =
  | 'needs-setup'
  | 'needs-unlock'
  | 'needs-authentication'
  | 'needs-device-recovery'
  | 'conversion-refused'
  | 'converting'
  | 'schema-too-new'
  | 'ready';

function invalidTransition(state: BootState, target: MutableTarget): never {
  throw new Error(`Invalid transition: ${state.status} -> ${target}`);
}

function base() {
  return {
    error: null,
    persistDenied: false,
    recoverable: false,
    journal: null,
    conversion: null,
    conversionRefusal: null,
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

function needsSetup(state: BootState, options: SetupUnlockOptions = {}): NeedsSetupState {
  if (state.status !== 'booting') invalidTransition(state, 'needs-setup');
  const accessMode = options.accessMode ?? state.accessMode;
  return {
    status: 'needs-setup',
    accessMode,
    ...base(),
    conversion: options.conversionRequired ? { progress: null } : null
  };
}

function needsUnlock(state: BootState, options: SetupUnlockOptions = {}): NeedsUnlockState {
  if (state.status !== 'booting') invalidTransition(state, 'needs-unlock');
  const accessMode = options.accessMode ?? state.accessMode;
  return {
    status: 'needs-unlock',
    accessMode,
    ...base(),
    conversion: options.conversionRequired ? { progress: null } : null
  };
}

function needsAuthentication(state: BootState, androidKey: AndroidKeyRefusal | null = null): NeedsAuthenticationState {
  if (state.status !== 'booting' && state.status !== 'needs-authentication') invalidTransition(state, 'needs-authentication');
  return {
    status: 'needs-authentication',
    accessMode: state.accessMode,
    ...base(),
    androidKey
  };
}

function needsDeviceRecovery(state: BootState): NeedsDeviceRecoveryState {
  if (state.status !== 'booting') invalidTransition(state, 'needs-device-recovery');
  return {
    status: 'needs-device-recovery',
    accessMode: state.accessMode,
    ...base()
  };
}

function conversionRefused(state: BootState, refusal: ConversionRefusal): ConversionRefusedState {
  if (state.status !== 'booting') invalidTransition(state, 'conversion-refused');
  return {
    status: 'conversion-refused',
    accessMode: state.accessMode,
    ...base(),
    conversionRefusal: refusal
  };
}

function converting(state: BootState): ConvertingState {
  if ((state.status !== 'needs-setup' && state.status !== 'needs-unlock') || state.conversion === null) {
    invalidTransition(state, 'converting');
  }
  return {
    status: 'converting',
    accessMode: state.accessMode,
    ...base(),
    conversion: { progress: state.conversion.progress }
  };
}

function conversionProgress(state: BootState, progress: ConversionProgress): ConvertingState {
  if (state.status !== 'converting') invalidTransition(state, 'converting');
  return {
    ...state,
    conversion: { progress }
  };
}

function schemaTooNew(state: BootState): SchemaTooNewState {
  if (state.status !== 'booting') invalidTransition(state, 'schema-too-new');
  return {
    status: 'schema-too-new',
    accessMode: state.accessMode,
    ...base()
  };
}

function ready(state: BootState, payload: { journal: Journal; persistDenied: boolean }): ReadyState {
  if (state.status !== 'booting') invalidTransition(state, 'ready');
  return {
    status: 'ready',
    accessMode: state.accessMode,
    ...base(),
    journal: payload.journal,
    persistDenied: payload.persistDenied
  };
}

function failure(state: BootState, error: string): ErrorState {
  return {
    status: 'error',
    accessMode: state.accessMode,
    ...base(),
    error
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

export type BootGate = 'none' | 'passphrase' | 'authentication' | 'device-recovery' | 'schema-too-new';

export type PassphraseMode = 'setup' | 'unlock';
export type PassphraseScreen = 'none' | 'form' | 'converting' | 'conversion-refused';

export function bootGate(state: BootState): BootGate {
  switch (state.status) {
    case 'needs-setup':
    case 'needs-unlock':
    case 'converting':
    case 'conversion-refused':
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

export function passphraseMode(state: BootState): PassphraseMode | null {
  switch (state.status) {
    case 'needs-setup':
      return 'setup';
    case 'needs-unlock':
      return 'unlock';
    case 'booting':
    case 'needs-authentication':
    case 'needs-device-recovery':
    case 'converting':
    case 'conversion-refused':
    case 'ready':
    case 'schema-too-new':
    case 'error':
      return null;
  }
}

export function passphraseScreen(state: BootState): PassphraseScreen {
  switch (state.status) {
    case 'needs-setup':
    case 'needs-unlock':
      return 'form';
    case 'converting':
      return 'converting';
    case 'conversion-refused':
      return 'conversion-refused';
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
  booting
};

export const bootTransitions = {
  setAccessMode: accessMode,
  toBooting: resetToBooting,
  toNeedsSetup: needsSetup,
  toNeedsUnlock: needsUnlock,
  toNeedsAuthentication: needsAuthentication,
  toNeedsDeviceRecovery: needsDeviceRecovery,
  toConversionRefused: conversionRefused,
  toConverting: converting,
  updateConversionProgress: conversionProgress,
  toSchemaTooNew: schemaTooNew,
  toReady: ready,
  toError: failure,
  markErrorRecoverable: errorRecoverable
};
