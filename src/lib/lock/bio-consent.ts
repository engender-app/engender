/* Whether biometrics get offered before the person has said yes (ticket 18).

   `prefs.bioOptIn` is one flag read from two places - the device-bound boot
   gate (AndroidKeyGate) and the mid-session PIN pad (LockScreen) - and both
   ask the same three-way question of it: never answered, said yes, or said
   no. Pulled out as a plain function so that question is testable without
   either component, the way android-key.ts pulls the boot gate's own
   decision out of the bridge it reads. */

export type BioConsent = boolean | null;

export type BioGateDecision =
  /** Consent given: fire the prompt, or show the key on the pad, without
      asking again. */
  | 'auto'
  /** Never answered: ask once, before anything biometric happens. */
  | 'ask'
  /** Declined: no prompt, no key on the pad, until re-enabled in Settings. */
  | 'manual';

export function bioGateDecision(consent: BioConsent): BioGateDecision {
  if (consent === null) return 'ask';
  return consent ? 'auto' : 'manual';
}
