import { describe, expect, it } from 'vitest';

import { completeSetup, type SetupCompletion } from './complete';

/** Records what happened and in what order, and makes the flush take a real
    turn of the event loop - a flush that resolves synchronously would let a
    wrong order pass. */
function recorder(overrides: Partial<SetupCompletion> = {}) {
  const order: string[] = [];
  let flushed = false;
  const completion: SetupCompletion = {
    writeAnswers: () => void order.push('write'),
    flushWrites: async () => {
      await Promise.resolve();
      flushed = true;
      order.push('flush');
    },
    disguise: false,
    turnOnDisguise: async () => void order.push(flushed ? 'disguise' : 'disguise-before-the-writes-landed'),
    leaveSetup: () => void order.push('leave'),
    ...overrides
  };
  return { completion, order };
}

describe('finishing setup without turning disguise on', () => {
  it('writes the answers and goes, and never touches the launcher', async () => {
    const { completion, order } = recorder();
    await completeSetup(completion);
    expect(order).toEqual(['write', 'leave']);
  });

  it('does not wait on SQLite for a branch it is not taking', async () => {
    /* A flush that never settles. The un-disguised path has nothing to
       race, so it must not be holding a person on the finish screen while
       the pref table catches up. */
    const { completion, order } = recorder({ flushWrites: () => new Promise<void>(() => {}) });
    await completeSetup(completion);
    expect(order).toEqual(['write', 'leave']);
  });
});

describe('finishing setup with disguise turned on', () => {
  /* The whole ticket, in one assertion. On Android turnOnDisguise flips the
     launcher alias and DisguisePlugin kills the process, so anything not
     already in SQLite when it runs is gone - including `onboarded`, which
     is what would send the person back to step one behind a disguised
     icon. */
  it('lands every answer before the alias flips', async () => {
    const { completion, order } = recorder({ disguise: true });
    await completeSetup(completion);
    expect(order).toEqual(['write', 'flush', 'disguise', 'leave']);
  });

  it('waits for the flush rather than merely calling it', async () => {
    /* The failure this catches is `void flushWrites()` instead of `await`:
       the order above would still read write, flush, disguise, because a
       synchronous recorder cannot tell a started promise from a settled
       one. Here the flush settles a few turns late, and the disguise has
       to be behind it. */
    const order: string[] = [];
    let landed = false;
    await completeSetup({
      writeAnswers: () => void order.push('write'),
      flushWrites: async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
        landed = true;
      },
      disguise: true,
      turnOnDisguise: async () => void order.push(landed ? 'disguise' : 'disguise-too-early'),
      leaveSetup: () => void order.push('leave')
    });
    expect(order).toEqual(['write', 'disguise', 'leave']);
  });

  it('still leaves setup, because web has no restart to be interrupted by', async () => {
    const { completion, order } = recorder({ disguise: true });
    await completeSetup(completion);
    expect(order.at(-1)).toBe('leave');
  });
});
