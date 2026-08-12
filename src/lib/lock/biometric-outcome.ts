/* What the platform said, and what it means (ticket 13, ADR-0018).

   The Journal's data key is held by Android Keystore under a key that cannot
   be used until someone authenticates (ADR-0018: "Android protects that key
   through Android Keystore"). So this module is not deciding whether to show
   the journal - the Keystore has already decided, by refusing to unwrap. It
   is deciding what to say and what to offer next.

   That distinction is what keeps the ticket's warning from coming true. A bug
   here cannot unlock anything on its own, because a wrong answer still leaves
   the key wrapped. What a bug here can do is strand someone: tell them to
   retry a sensor that has no fingerprints on it, or offer nothing at all.
   Hence a closed set of outcomes, each with a way forward, and an unknown
   string treated as a failure rather than as a success. */

/** Every result the app knows how to react to. Anything else is a failure. */
export const BIOMETRIC_OUTCOMES = [
  'authenticated',
  /** No biometric hardware on this device. */
  'unavailable',
  /** Hardware is present, nothing is enrolled on it. */
  'unenrolled',
  /** Dismissed - the back button, the negative button, or a tap outside. */
  'cancelled',
  /** Presented and rejected: a finger that is not the enrolled one. */
  'failed',
  /** Too many rejections; the sensor refuses more attempts for a while. */
  'lockedOut',
  /** No lock screen at all, so there is nothing to fall back to. */
  'noDeviceCredential'
] as const;

export type BiometricOutcome = (typeof BIOMETRIC_OUTCOMES)[number];

/** What the screen offers next. Never empty: the ticket's third box is that
    no failure leaves someone with nothing to do. */
export type WayForward =
  /** Nothing to offer - they are in. */
  | 'none'
  /** Ask again; the sensor is there and willing. */
  | 'retry'
  /** Go straight to the device PIN, pattern or password. */
  | 'deviceCredential'
  /** The device has no lock screen; the Journal cannot be protected without one. */
  | 'setDeviceLock';

export interface AuthenticationResult {
  outcome: BiometricOutcome;
  /** True only for an explicit success. Everything else is false, including
      anything this module did not recognise. */
  unlocksJournal: boolean;
  wayForward: WayForward;
}

const WAYS_FORWARD: Record<BiometricOutcome, WayForward> = {
  authenticated: 'none',
  /* Retrying is offered only where a retry could work. Sending someone back
     to a sensor with nothing enrolled on it is the trap the ticket names. */
  cancelled: 'retry',
  failed: 'retry',
  unavailable: 'deviceCredential',
  unenrolled: 'deviceCredential',
  /* A lockout is the sensor refusing more attempts, so the way through is
     the credential the lockout does not cover, not another finger. */
  lockedOut: 'deviceCredential',
  noDeviceCredential: 'setDeviceLock'
};

const KNOWN = new Set<string>(BIOMETRIC_OUTCOMES);

/**
 * Reads the bridge's answer.
 *
 * Anything unrecognised becomes `failed` rather than an error or a pass. A
 * platform that grows a result nobody mapped should leave the person looking
 * at "that didn't work, try again", which is true, rather than at a crash or
 * at their journal.
 */
export function interpretAuthentication(result: string): AuthenticationResult {
  const outcome: BiometricOutcome = KNOWN.has(result) ? (result as BiometricOutcome) : 'failed';
  return {
    outcome,
    unlocksJournal: outcome === 'authenticated',
    wayForward: WAYS_FORWARD[outcome]
  };
}
