/* Ticket U08 (pre-production UI/UX): the automatic-unlock consent question
   may only appear where the platform can actually honor the answer.

   The audit's finding UX22, as a three-by-three: consent unanswered,
   accepted or declined, against a healthy key, a device with no screen
   lock, and an invalidated key. The last two rows are recovery states -
   "look again" and the cliff - and the bug was that the "Open
   automatically?" sheet mounted over them, because the gate's consent
   effect decided once, on mount, without asking whether authentication was
   even possible.

   This is the real-component gate fixture the ticket names: AndroidKeyGate
   itself, mounted per case, with bootState moved through the same
   transitions boot uses (the shape tests/browser-tier/gates-gallery.svelte
   established) and the one thing a browser cannot supply - Android
   Keystore - stubbed at the Capacitor boundary the real bridge talks to
   (android-consent.html sets that stub up before this module loads, which
   is when registerPlugin binds it).

   The nine matrix cells, then the repair sequence: on the no-lock screen
   nothing is asked, the screen lock gets set, Check again is pressed, and
   only then - on the healthy gate a cancelled prompt leaves behind - may
   the question be asked, once, with an existing choice still honored
   rather than re-asked. Focus lands inside the sheet when it opens, and no
   case ever leaves the gate states: the journal field stays null and the
   status stays needs-authentication, which is this tier's half of "no gate
   reveals journal contents" (gates-surfaces.test.ts holds the source-level
   half: a gate may not import a journal read at all). */

import { bootState } from '../../src/lib/stores/boot.svelte';
import { bootStates, bootTransitions } from '../../src/lib/stores/boot-state';
import { prefs } from '../../src/lib/data/prefs/store.svelte';
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

const consentSheetOpen = () => document.querySelector('[data-sheet] [data-bio-consent-yes]') !== null;
const focusInsideSheet = () =>
  document.activeElement instanceof HTMLElement && document.activeElement.closest('[data-sheet]') !== null;

type GateState = 'healthy' | 'no-lock' | 'invalidated';
type Consent = 'unanswered' | 'accepted' | 'declined';

/** One matrix cell: the gate mounted into `state` holding `consent`, read
    back after the mount effect and any auto-fire it caused have settled. */
async function matrixCell(state: GateState, consent: Consent) {
  prefs.bioOptIn = consent === 'unanswered' ? null : consent === 'accepted';

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
  const target = document.createElement('div');
  document.getElementById('gate')!.append(target);
  const mounted = mountInto(AndroidKeyGate, {}, target);

  /* Long enough for the mount effect, the auto-fire it may cause, the
     bridge round trip and the boot machine's answer - each is a microtask,
     but the sheet that may open rides a transition. */
  await frame(600);

  const read = {
    consentSheet: consentSheetOpen(),
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

/** The repair sequence: no lock, then one, then the question - once.
    `existingChoice` is what bioOptIn holds when the gate first mounts. */
async function repairSequence(existingChoice: Consent) {
  prefs.bioOptIn = existingChoice === 'unanswered' ? null : existingChoice === 'accepted';

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
  const askedBeforeRepair = consentSheetOpen();
  const autoBeforeRepair = unlockCalls();

  /* The screen lock gets set out in Settings; what the app sees is Check
     again leading to a prompt somebody dismisses - the cancelled refusal
     whose way forward is retry, which is the healthy gate. */
  const checkAgain = document.querySelector<HTMLButtonElement>('[data-check-again]');
  checkAgain?.click();
  /* A cancelled prompt must land on the retry gate, not the cliff: that
     distinction is the ticket's fourth acceptance line, and it is the
     difference between a bad finger and a destroyed key. */
  const cancelledOfferedRetry = await until(() => document.querySelector('[data-key-retry]') !== null);

  const askedAfterRepair = await until(consentSheetOpen);
  /* The sheet focuses itself when its entrance settles (Sheet.svelte's
     introend), so this waits for that rather than reading the instant the
     dialog exists. */
  const focusInSheet = askedAfterRepair && (await until(focusInsideSheet));

  let choicePreserved: boolean | null = null;
  let sheetClosedAfterAnswer = false;
  let askedAgainAfterDecline = true;
  let failedStayedRetryGate = false;
  if (consentSheetOpen() && existingChoice === 'unanswered') {
    document.querySelector<HTMLButtonElement>('[data-bio-consent-no]')?.click();
    await until(() => !consentSheetOpen());
    sheetClosedAfterAnswer = !consentSheetOpen();
    choicePreserved = prefs.bioOptIn === false;

    /* One more prompt, this time a rejected finger, must not re-ask either:
       once means once. And `failed` lands on the retry gate like cancelled
       did - the ticket's fourth acceptance line covers both transient
       outcomes, not just dismissal. */
    fake.unlockOutcome = 'failed';
    const unlocksBefore = unlockCalls();
    document.querySelector<HTMLButtonElement>('[data-key-retry]')?.click();
    await until(() => unlockCalls() > unlocksBefore);
    await frame(500);
    askedAgainAfterDecline = consentSheetOpen();
    failedStayedRetryGate =
      document.querySelector('[data-key-retry]') !== null &&
      document.querySelector('[data-open-reset]') === null;
  } else if (existingChoice === 'accepted') {
    /* A preserved yes is honored by firing, not by asking again. */
    choicePreserved = await until(() => unlockCalls() > 0) && prefs.bioOptIn === true;
  }

  const result = {
    askedBeforeRepair,
    autoBeforeRepair,
    cancelledOfferedRetry,
    askedAfterRepair,
    focusInSheet,
    sheetClosedAfterAnswer,
    choicePreserved,
    askedAgainAfterDecline,
    failedStayedRetryGate,
    unlockCalls: unlockCalls(),
    status: bootState.status,
    journal: bootState.journal
  };
  await mounted.remove();
  target.remove();
  return result;
}

async function run() {
  /* A fresh context has no wrap, but the browser tier shares one page per
     run and the galleries mint keys into it: revoke so every invalidated
     mount here reads the honest "no recovery key" body. */
  await revokeRecoveryKey();

  const states: GateState[] = ['healthy', 'no-lock', 'invalidated'];
  const consents: Consent[] = ['unanswered', 'accepted', 'declined'];
  const matrix: Record<string, Record<string, unknown>> = {};
  for (const state of states) {
    for (const consent of consents) {
      matrix[`${state}-${consent}`] = await matrixCell(state, consent);
    }
  }

  const repairUnanswered = await repairSequence('unanswered');
  const repairAccepted = await repairSequence('accepted');

  return { matrix, repairUnanswered, repairAccepted };
}

publishFixture(NAME, run);
