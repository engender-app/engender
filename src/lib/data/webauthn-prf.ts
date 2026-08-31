/* The web's biometric mechanism (ADR-0041, ticket 55), the sibling of
   device-secret.ts: where PIN mode's secret half comes from a key in this
   browser's own store, biometric mode's whole secret comes from a platform
   authenticator - Touch ID, Windows Hello, the phone's own unlock - through
   WebAuthn's PRF extension.

   What PRF gives that plain WebAuthn does not: a *stable* 32-byte value,
   deterministic in (credential, salt), released only after the platform has
   verified who is present. That is a secret in the sense the wrap pipeline
   needs, which an assertion signature is not.

   Nothing here authenticates anybody to anything. There is no server, so the
   challenge is random bytes nobody checks and the signature is discarded
   unread - the security claim is not "the assertion is valid", it is "the
   authenticator would not have produced this value without a user
   verification it performed itself". Saying that plainly matters, because
   the same API shape used against a server would be broken without the
   check.

   Two decisions worth their reasons, both asked for by ticket 55:

   - **Non-discoverable.** The credential id is kept in the keystore, so it
     can be handed back at get time and the credential needs no storage slot
     on the authenticator. Discoverable credentials are a scarce resource on
     security keys and put the journal in the browser's own passkey list,
     which is a disclosure this app has no reason to make.
   - **`userVerification: 'required'`.** The mode is called biometric because
     a person's presence is what releases the key. A silently-satisfied
     assertion would still yield the same PRF output, which would make this
     device-bound mode wearing a fingerprint icon.

   Losing the authenticator loses the journal, exactly as device-bound and
   PIN mode do: nothing the person knows reconstructs a PRF output. The setup
   copy says so, and an archive export is the only copy that survives it. */

/** Raised when this platform will not produce a PRF output - no support, no
    output where support was advertised, or a person who dismissed the
    prompt. Deliberately not a decryption failure: nothing was wrong with a
    secret, and the screens say "not available here" rather than sending
    somebody to try again at a wall. */
export class BiometricUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BiometricUnavailableError';
  }
}

/** The seam journal-biometric.ts is written against, so the Node tier can
    round-trip the whole mode against a fake authenticator. */
export interface PrfAuthenticator {
  /** Mints a credential and returns its id with the PRF output for `salt`. */
  enrol(salt: Uint8Array<ArrayBuffer>): Promise<{ credentialId: Uint8Array<ArrayBuffer>; secret: string }>;
  /** The same output again, from the credential the keystore recorded. */
  evaluate(credentialId: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>): Promise<string>;
}

const RP_NAME = 'enGender';
/** Not an identity. The credential is non-discoverable and never appears in
    a chooser, so this is only what the platform files it under; the journal
    holds the person's name and this module cannot read it anyway. */
const USER_NAME = 'enGender journal';

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

/** A PRF output arrives as either half of BufferSource depending on the
    browser, and both spellings are the same 32 bytes. */
const toBytes = (source: BufferSource): Uint8Array<ArrayBuffer> =>
  ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer)
    : new Uint8Array(source.slice(0));

/** 32 bytes, minted once per journal and kept beside the keystore: the PRF
    output is a function of it, so it can never be regenerated. */
export function randomPrfSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** Whether this browser and device can do PRF *before* anything is offered.

    A real capability check rather than a user-agent guess, and a
    conservative one: `getClientCapabilities` is the only way to ask about
    the extension without creating a credential, so a browser that supports
    PRF but not that call reads as unavailable here. That is the right way
    round for ticket 55's rule - an unavailable mode is one that is not
    offered, never one that is offered and fails - and it costs a person on
    such a browser nothing but a choice they still have three of.

    Support at the time of writing (2026-08-31): PRF is in Chrome, Edge,
    Safari and Firefox on the desktop platforms with a platform
    authenticator, and `getClientCapabilities` shipped later than PRF itself
    in each. Both move; this asks the browser rather than trusting the note. */
export async function prfAvailable(): Promise<boolean> {
  try {
    const pkc = globalThis.PublicKeyCredential as typeof PublicKeyCredential | undefined;
    if (
      typeof pkc?.getClientCapabilities !== 'function' ||
      typeof pkc.isUserVerifyingPlatformAuthenticatorAvailable !== 'function'
    ) {
      return false;
    }
    const [capabilities, platformAuthenticator] = await Promise.all([
      pkc.getClientCapabilities(),
      pkc.isUserVerifyingPlatformAuthenticatorAvailable()
    ]);
    return capabilities['extension:prf'] === true && platformAuthenticator === true;
  } catch {
    /* A browser that throws on being asked has answered the question. */
    return false;
  }
}

/** The real thing. `credentials` is a parameter so the Node tier can drive
    this against a stub authenticator: the two failure rules below - PRF
    advertised but not enabled, PRF enabled but nothing returned - are the
    ones ticket 55's acceptance names, and testing them through a fake
    PrfAuthenticator would have tested the fake. */
export function browserAuthenticator(credentials: CredentialsContainer = navigator.credentials): PrfAuthenticator {
  return {
    async enrol(salt) {
      const credential = (await credentials.create({
        publicKey: {
          rp: { name: RP_NAME },
          user: { id: crypto.getRandomValues(new Uint8Array(16)), name: USER_NAME, displayName: USER_NAME },
          /* Nobody verifies this, and the comment at the top says why. It is
             random anyway, because a fixed one would be the sort of thing a
             reader has to stop and work out. */
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 }
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            residentKey: 'discouraged',
            requireResidentKey: false,
            userVerification: 'required'
          },
          attestation: 'none',
          extensions: { prf: { eval: { first: salt } } }
        }
      }).catch(refused)) as PublicKeyCredential | null;

      if (credential === null) throw new BiometricUnavailableError('this device did not create an authenticator credential');

      const prf = credential.getClientExtensionResults().prf;
      /* The honest signal, and the one ticket 55 named: a platform that
         advertises PRF and then does not enable it has to fail here, as a
         mode this device cannot do, rather than later as a secret that never
         opens anything. */
      if (prf?.enabled !== true) {
        throw new BiometricUnavailableError('this authenticator does not release a stable secret (no PRF)');
      }

      const credentialId = toBytes(credential.rawId);
      /* Some platforms evaluate during creation and some only on a later
         assertion. Where the output is already here it costs one prompt;
         where it is not, asking again is the whole difference. */
      const secret = prf.results?.first ? toBase64(toBytes(prf.results.first)) : await this.evaluate(credentialId, salt);
      return { credentialId, secret };
    },

    async evaluate(credentialId, salt) {
      const assertion = (await credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: credentialId }],
          userVerification: 'required',
          extensions: { prf: { eval: { first: salt } } }
        }
      }).catch(refused)) as PublicKeyCredential | null;

      if (assertion === null) throw new BiometricUnavailableError('this device did not answer with the journal credential');

      const first = assertion.getClientExtensionResults().prf?.results?.first;
      if (!first) {
        throw new BiometricUnavailableError('this authenticator returned no secret for the journal credential');
      }
      return toBase64(toBytes(first));
    }
  };
}

/* Every way a WebAuthn call ends badly is one sentence for the screen: a
   cancelled prompt, a device with nothing enrolled, an origin the browser
   will not do this on. None of them is a wrong secret, and none of them is
   worth diagnosing at the person - what they can do about it is the same in
   every case. */
function refused(error: unknown): never {
  throw new BiometricUnavailableError(`the authenticator did not release a secret: ${String((error as Error)?.message ?? error)}`);
}
