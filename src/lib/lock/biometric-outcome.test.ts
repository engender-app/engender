/* The four failure states, and the one success (ticket 13).

   This is the module the ticket's warning is about: "treating 'cancelled' or
   'unenrolled' as 'authenticated' would unlock the Journal for anyone holding
   the phone". So the tests are written the paranoid way round - the closed
   set is asserted, and the default for anything unrecognised is refusal,
   because the way this goes wrong in practice is a platform returning a code
   nobody mapped and a truthy check letting it through.

   Pure over a string: the platform call lives behind the bridge, and what it
   returned is all this needs to decide. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  interpretAuthentication,
  BIOMETRIC_OUTCOMES,
  type BiometricOutcome
} from './biometric-outcome.ts';

/** Every outcome the app knows how to react to. */
const ALL: BiometricOutcome[] = [
  'authenticated',
  'unavailable',
  'unenrolled',
  'cancelled',
  'failed',
  'lockedOut',
  'noDeviceCredential'
];

test('the set of outcomes is closed and known', () => {
  assert.deepEqual([...BIOMETRIC_OUTCOMES].sort(), [...ALL].sort());
});

test('only an explicit success authenticates', () => {
  assert.equal(interpretAuthentication('authenticated').outcome, 'authenticated');
  for (const outcome of ALL.filter((o) => o !== 'authenticated')) {
    assert.equal(
      interpretAuthentication(outcome).unlocksJournal,
      false,
      `${outcome} must not unlock the Journal`
    );
  }
});

test('an unrecognised result refuses rather than falls through', () => {
  for (const junk of ['', 'ok', 'SUCCESS', 'true', 'ERROR_NONE', 'undefined', '0']) {
    const result = interpretAuthentication(junk);
    assert.equal(result.unlocksJournal, false, `"${junk}" must not unlock the Journal`);
    assert.equal(result.outcome, 'failed', `"${junk}" should be reported as a plain failure`);
  }
});

test('every outcome says what to do next, so none is a dead end', () => {
  // The ticket's third box: "A biometric failure never traps the person
  // behind UI with no way forward."
  for (const outcome of ALL) {
    const result = interpretAuthentication(outcome);
    assert.ok(result.wayForward, `${outcome} has no way forward`);
  }
});

test('the ways forward differ, so the screen can say something specific', () => {
  const ways = new Map<string, string>();
  for (const outcome of ALL) ways.set(outcome, interpretAuthentication(outcome).wayForward);

  // Retrying the prompt is only sensible when the hardware is there and usable.
  assert.equal(ways.get('failed'), 'retry');
  assert.equal(ways.get('cancelled'), 'retry');
  // Hardware temporarily refusing more attempts is not something a retry fixes.
  assert.equal(ways.get('lockedOut'), 'deviceCredential');
  // No hardware, or nothing enrolled: the device's own credential is the route.
  assert.equal(ways.get('unavailable'), 'deviceCredential');
  assert.equal(ways.get('unenrolled'), 'deviceCredential');
  // Nothing to fall back to at all - the one case that asks for a setup change.
  assert.equal(ways.get('noDeviceCredential'), 'setDeviceLock');
  assert.equal(ways.get('authenticated'), 'none');
});

test('only the no-lock-screen case is a setup problem rather than an attempt problem', () => {
  const setup = ALL.filter((o) => interpretAuthentication(o).wayForward === 'setDeviceLock');
  assert.deepEqual(setup, ['noDeviceCredential']);
});
