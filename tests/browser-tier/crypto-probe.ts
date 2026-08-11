/* Browser-tier check for ticket 12: hash-wasm claims to bundle its WASM as
   base64 rather than fetch it, unlike the Rive runtime, which defaults to
   a CDN - the ticket's own Notes say to re-verify that claim once wired
   in rather than trust the README. run.mjs records every request made
   while this page loads and asserts none of them happened at all (base64
   means no request, not just no *external* request). */
import { deriveKey, randomSalt } from '../../src/lib/crypto/argon2id.ts';
import { encrypt, decrypt } from '../../src/lib/crypto/aesGcm.ts';
import { ARCHIVE_ARGON2_PARAMS, PIN_ARGON2_PARAMS } from '../../src/lib/crypto/params.ts';

async function run() {
  const archiveKey = await deriveKey('archive password', randomSalt(), ARCHIVE_ARGON2_PARAMS);
  const pinKey = await deriveKey('1234', randomSalt(), PIN_ARGON2_PARAMS);

  const plaintext = new TextEncoder().encode('folded and tagged, then packed');
  const { nonce, ciphertext } = await encrypt(archiveKey, plaintext);
  const decrypted = await decrypt(archiveKey, nonce, ciphertext);
  const roundTripOk = new TextDecoder().decode(decrypted) === 'folded and tagged, then packed';

  (window as unknown as { __cryptoProbeResult: unknown }).__cryptoProbeResult = {
    archiveKeyLength: archiveKey.length,
    pinKeyLength: pinKey.length,
    roundTripOk
  };
  document.body.dataset.cryptoProbeReady = 'true';
}

run().catch((err) => {
  (window as unknown as { __cryptoProbeResult: unknown }).__cryptoProbeResult = {
    error: String(err?.stack ?? err)
  };
  document.body.dataset.cryptoProbeReady = 'true';
});
