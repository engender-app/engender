/* Ticket U08 (pre-production UI/UX), reshaped by lock-timing ticket 01:
   the Android key gate fires the platform prompt by itself, but only where
   the platform can actually honor it.

   U08's finding UX22 was that the "Open automatically?" question mounted
   over the two recovery states - a device with no screen lock and an
   invalidated key. Ticket 01 removed the question and its preference at
   Alicja's word: the prompt always fires on a healthy gate. What this
   still guards is the U08 half: on the recovery states nothing fires, and
   once the screen lock is back the prompt fires then, once.

   AndroidKeyGate itself, mounted per case, with bootState moved through the
   same transitions boot uses and Android Keystore stubbed at the Capacitor
   boundary (android-consent.html sets that stub up before this module
   loads). No case ever leaves the gate states: the journal field stays null
   and the status stays needs-authentication. */

import { bootState } from '../../src/lib/stores/boot.svelte';
import { bootStates, bootTransitions } from '../../src/lib/stores/boot-state';
import { revokeRecoveryKey } from '../../src/lib/data/recovery-key';
import AndroidKeyGate from '../../src/lib/components/AndroidKeyGate.svelte';
import { mountInto, publishFixture } from './mount.ts';
import { publish } from '../probe-handshake.mjs';
import '$lib/theme/fonts.css';
import '$lib/theme/base.css';
import '$lib/theme/palettes.css';
import '$lib/styles/app.css';
import '$lib/styles/components.css';
import '$lib/styles/screens.css';
import '$lib/styles/kit.css';

const NAME = 'android-consent-probe';

/* The fake the html page's nativePromise aims at. `unlockOutcome` is the
   dial each case turns: everything here is a refusal, because a success
   unmounts the gate (the journal opens) and the question this probe asks
    is what the gate does while it is still a gate. `unlockOutcome` is
    the dial the repair sequence turns: a dismissed prompt first, then a
    rejected finger, so both transient outcomes prove themselves
    distinguishable from the cliff. */
const fake = {
  calls: [] as string[],
  unlockOutcome: 'cancelled' as 'cancelled' | 'failed',
  status: async () => ({ hasKey: true, authRequired: true }),
  unlock: async () => {
    fake.calls.push('unlock');
    return { outcome: fake.unlockOutcome };
  },
  confirm: async () => {
    fake.calls.push('confirm');
    return { outcome: 'authenticated' };
  },
  erase: async () => {
    fake.calls.push('erase');
  }
};
(window as unknown as Record<string, unknown>).__fakeKeystore = fake;

const unlockCalls = () => fake.calls.filter((c) => c === 'unlock').length;
const frame = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Until `ready` returns truthy or the timeout eats the last of a
    transition's travel, whichever comes first. */
async function until(ready: () => boolean, ms = 2500): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (ready()) return true;
    await frame(60);
  }
  return ready();
}

/** Any sheet open over the gate: there is no question left to ask, so none
    may be. */
const sheetOpen = () => document.querySelector('[data-sheet]') !== null;

type GateState = 'healthy' | 'no-lock' | 'invalidated';

/** One case: the gate mounted into `state`, read back after the mount
    effect and any prompt it fired have settled. */
async function stateCell(state: GateState) {
  const gate = bootTransitions.toNeedsAuthentication(bootStates.booting());
  if (state === 'no-lock') {
    Object.assign(
      bootState,
      bootTransitions.toNeedsAuthentication(gate, {
        kind: 'refused',
        authentication: { outcome: 'noDeviceCredential', unlocksJournal: false, wayForward: 'setDeviceLock' }
      })
    );
  } else if (state === 'invalidated') {
    Object.assign(bootState, bootTransitions.toNeedsAuthentication(gate, { kind: 'invalidated' }));
  } else {
    Object.assign(bootState, gate);
  }

  fake.calls = [];
  fake.unlockOutcome = 'cancelled';
  const target = document.createElement('div');
  document.getElementById('gate')!.append(target);
  const mounted = mountInto(AndroidKeyGate, {}, target);
  await frame(600);

  const read = {
    sheet: sheetOpen(),
    unlockCalls: unlockCalls(),
    recoveryVisible:
      (state === 'no-lock' && document.querySelector('[data-check-again]') !== null) ||
      (state === 'invalidated' && document.querySelector('[data-open-reset]') !== null),
    status: bootState.status,
    journal: bootState.journal
  };
  await mounted.remove();
  target.remove();
  return read;
}

/** No lock, then one: nothing fires before the repair, the prompt fires
    once after it, and a cancel or a rejected finger leaves the retry gate
    rather than the cliff. */
async function repairSequence() {
  const gate = bootTransitions.toNeedsAuthentication(bootStates.booting());
  Object.assign(
    bootState,
    bootTransitions.toNeedsAuthentication(gate, {
      kind: 'refused',
      authentication: { outcome: 'noDeviceCredential', unlocksJournal: false, wayForward: 'setDeviceLock' }
    })
  );

  fake.calls = [];
  fake.unlockOutcome = 'cancelled';
  const target = document.createElement('div');
  document.getElementById('gate')!.append(target);
  const mounted = mountInto(AndroidKeyGate, {}, target);

  await frame(300);
  const firedBeforeRepair = unlockCalls();

  /* The screen lock gets set out in Settings; what the app sees is Check
     again leading to a prompt somebody dismisses. */
  document.querySelector<HTMLButtonElement>('[data-check-again]')?.click();
  const cancelledOfferedRetry = await until(() => document.querySelector('[data-key-retry]') !== null);
  await frame(500);
  /* Check again's own prompt and nothing after it: a cancel is an answer,
     not a cue to prompt again. */
  const firedAfterRepair = unlockCalls();

  fake.unlockOutcome = 'failed';
  const before = unlockCalls();
  document.querySelector<HTMLButtonElement>('[data-key-retry]')?.click();
  await until(() => unlockCalls() > before);
  await frame(500);
  const failedStayedRetryGate =
    document.querySelector('[data-key-retry]') !== null && document.querySelector('[data-open-reset]') === null;

  const result = {
    firedBeforeRepair,
    cancelledOfferedRetry,
    firedAfterRepair,
    failedStayedRetryGate,
    unlockCallsAfterRetry: unlockCalls(),
    sheet: sheetOpen(),
    status: bootState.status,
    journal: bootState.journal
  };
  await mounted.remove();
  target.remove();
  return result;
}

async function run() {
  /* The browser tier shares one page per run and the galleries mint keys
     into it: revoke so every invalidated mount reads the honest "no
     recovery key" body. */
  await revokeRecoveryKey();

  const cells: Record<string, Awaited<ReturnType<typeof stateCell>>> = {};
  for (const state of ['healthy', 'no-lock', 'invalidated'] as GateState[]) cells[state] = await stateCell(state);
  const repair = await repairSequence();
  return { cells, repair };
}

publishFixture(NAME, run);
