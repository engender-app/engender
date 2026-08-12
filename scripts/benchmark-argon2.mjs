/* Reports real derivation time for both Argon2id parameter sets (ticket
   12's acceptance), so ARCHIVE_ARGON2_PARAMS/PIN_ARGON2_PARAMS in
   src/lib/crypto/params.ts can be re-tuned against real hardware rather
   than guessed - ADR-0013 explicitly defers the exact numbers to this.
   Run with `npm run benchmark:argon2`.

   Timed on whatever machine runs this script, not the "mid-range 2020
   Android device" the archive path targets - use this to sanity-check the
   shape of the numbers, then re-run on real hardware before trusting them
   for a release. */
import { deriveKey, randomSalt } from '../src/lib/crypto/argon2id.ts';
import { ARCHIVE_ARGON2_PARAMS, JOURNAL_ARGON2_PARAMS, PIN_ARGON2_PARAMS } from '../src/lib/crypto/params.ts';

async function timeDerivation(label, params) {
  const salt = randomSalt();
  const start = performance.now();
  await deriveKey('benchmark-password', salt, params);
  const ms = performance.now() - start;
  console.log(`${label}: ${ms.toFixed(0)}ms`, params);
  return ms;
}

const archiveMs = await timeDerivation('archive path (target ~1000ms)', ARCHIVE_ARGON2_PARAMS);
const pinMs = await timeDerivation('PIN path (target ~50-100ms)', PIN_ARGON2_PARAMS);
const journalMs = await timeDerivation('journal passphrase (target ~half the archive path)', JOURNAL_ARGON2_PARAMS);

if (archiveMs < 500 || archiveMs > 2000) {
  console.log(`  note: archive path is ${archiveMs < 500 ? 'well under' : 'well over'} the ~1s target - consider re-tuning memorySize/iterations`);
}
if (pinMs < 25 || pinMs > 200) {
  console.log(`  note: PIN path is ${pinMs < 25 ? 'well under' : 'well over'} the ~50-100ms target - consider re-tuning memorySize/iterations`);
}
if (journalMs < archiveMs * 0.25 || journalMs > archiveMs) {
  console.log(`  note: journal passphrase is out of its band (between a quarter of and the whole archive cost) - consider re-tuning memorySize/iterations`);
}
