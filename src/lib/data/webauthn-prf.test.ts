import { test, expect, afterEach } from 'vitest';
import { BiometricUnavailableError, browserAuthenticator, prfAvailable } from './webauthn-prf.ts';

/* The two halves of "offered only where it actually works": what
   prfAvailable() answers before a row is drawn, and what the authenticator
   does when a platform advertised PRF and then did not deliver. Both are
   ticket 55's acceptance, and both are about a mode that must fail as
   unavailable rather than as a wrong secret. */

const withCapabilities = (capabilities: Record<string, boolean> | null, platformAuthenticator = true) => {
  Object.defineProperty(globalThis, 'PublicKeyCredential', {
    configurable: true,
    value:
      capabilities === null
        ? {}
        : {
            getClientCapabilities: async () => capabilities,
            isUserVerifyingPlatformAuthenticatorAvailable: async () => platformAuthenticator
          }
  });
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'PublicKeyCredential');
});

test('a browser with no WebAuthn at all is not offered the mode', async () => {
  expect(await prfAvailable()).toBe(false);
});

test('a browser that cannot be asked about the extension is not offered the mode', async () => {
  withCapabilities(null);
  expect(await prfAvailable()).toBe(false);
});

test('a browser that answers no to the PRF extension is not offered the mode', async () => {
  withCapabilities({ 'extension:prf': false });
  expect(await prfAvailable()).toBe(false);
});

test('PRF without a platform authenticator to run it is not offered either', async () => {
  withCapabilities({ 'extension:prf': true }, false);
  expect(await prfAvailable()).toBe(false);
});

test('PRF and a platform authenticator is what makes the mode available', async () => {
  withCapabilities({ 'extension:prf': true });
  expect(await prfAvailable()).toBe(true);
});

test('a browser that throws on being asked has answered the question', async () => {
  Object.defineProperty(globalThis, 'PublicKeyCredential', {
    configurable: true,
    value: {
      getClientCapabilities: async () => {
        throw new Error('not here');
      },
      isUserVerifyingPlatformAuthenticatorAvailable: async () => true
    }
  });
  expect(await prfAvailable()).toBe(false);
});

/* The failure ticket 55 names by hand: a create that succeeds, reports the
   extension enabled, and then hands back nothing. Enrolment falls through to
   an assertion in that case, so the stub refuses there too - which is the
   platform that advertised PRF and returned no output. */
const stubCredential = (extensionResults: unknown) => ({
  rawId: new Uint8Array([1, 2, 3]).buffer,
  getClientExtensionResults: () => extensionResults
});

test('an authenticator that does not enable PRF fails as unavailable, not as a wrong secret', async () => {
  const authenticator = browserAuthenticator({
    create: async () => stubCredential({ prf: { enabled: false } }),
    get: async () => stubCredential({ prf: { results: { first: new Uint8Array(32).buffer } } })
  } as unknown as CredentialsContainer);

  await expect(authenticator.enrol(new Uint8Array(32))).rejects.toThrow(BiometricUnavailableError);
});

test('an authenticator that advertises PRF and returns no output fails as unavailable', async () => {
  const authenticator = browserAuthenticator({
    create: async () => stubCredential({ prf: { enabled: true } }),
    get: async () => stubCredential({ prf: { results: {} } })
  } as unknown as CredentialsContainer);

  await expect(authenticator.enrol(new Uint8Array(32))).rejects.toThrow(BiometricUnavailableError);
});

test('a dismissed prompt is the same unavailable failure rather than a thrown DOMException', async () => {
  const authenticator = browserAuthenticator({
    create: async () => {
      throw new Error('NotAllowedError');
    },
    get: async () => null
  } as unknown as CredentialsContainer);

  await expect(authenticator.enrol(new Uint8Array(32))).rejects.toThrow(BiometricUnavailableError);
});

test('an enrolment whose output arrives at create time needs no second prompt', async () => {
  let assertions = 0;
  const first = crypto.getRandomValues(new Uint8Array(32));
  const authenticator = browserAuthenticator({
    create: async () => stubCredential({ prf: { enabled: true, results: { first: first.buffer } } }),
    get: async () => {
      assertions++;
      return stubCredential({ prf: { results: { first: first.buffer } } });
    }
  } as unknown as CredentialsContainer);

  const { credentialId, secret } = await authenticator.enrol(new Uint8Array(32));
  expect(assertions).toBe(0);
  expect(credentialId).toEqual(new Uint8Array([1, 2, 3]));
  expect(secret).toBe(Buffer.from(first).toString('base64'));
});

test('an enrolment whose platform only evaluates on an assertion still yields the secret', async () => {
  const first = crypto.getRandomValues(new Uint8Array(32));
  const authenticator = browserAuthenticator({
    create: async () => stubCredential({ prf: { enabled: true } }),
    get: async () => stubCredential({ prf: { results: { first: first.buffer } } })
  } as unknown as CredentialsContainer);

  expect((await authenticator.enrol(new Uint8Array(32))).secret).toBe(Buffer.from(first).toString('base64'));
});
