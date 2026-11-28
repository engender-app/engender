import { afterEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => vi.useRealTimers());

describe('finishing setup without turning disguise on', () => {
  /* `onboarded` is written to the pref table without being awaited. A tab
     closed or reloaded in the next moments (Firefox, a stale bookmark opened
     at once) killed the worker mid-write, and the finished journal came back
     asking for setup again. The flush is what makes it durable first. */
  it('lands the answers before leaving, and never touches the launcher', async () => {
    const { completion, order } = recorder();
    await completeSetup(completion);
    expect(order).toEqual(['write', 'flush', 'leave']);
  });

  it('keeps completion pending until setup history has been replaced', async () => {
    let leave!: () => void;
    let completed = false;
    const { completion } = recorder({ leaveSetup: () => new Promise<void>(resolve => { leave = resolve; }) });
    const pending = completeSetup(completion).then(() => { completed = true; });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(completed).toBe(false);
    leave();
    await pending;
    expect(completed).toBe(true);
  });

  it('does not hold the finish screen for a flush that never settles', async () => {
    vi.useFakeTimers();
    const { completion, order } = recorder({ flushWrites: () => new Promise<void>(() => {}) });
    const done = completeSetup(completion);
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(order).toEqual(['write', 'leave']);
  });

  it('leaves setup when the flush fails', async () => {
    const { completion, order } = recorder({ flushWrites: () => Promise.reject(new Error('SQLite said no')) });
    await expect(completeSetup(completion)).resolves.toBeUndefined();
    expect(order).toEqual(['write', 'leave']);
  });

  it('waits for an area visibility write before leaving setup', async () => {
    const { completion, order } = recorder({
      writeAnswers: async () => {
        order.push('write-start');
        await Promise.resolve();
        order.push('write-landed');
      }
    });
    await completeSetup(completion);
    expect(order).toEqual(['write-start', 'write-landed', 'flush', 'leave']);
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

  /* The person pressed the last button of a first run. A preference that
     could not be written is not a reason to leave them on a screen whose
     only control has stopped answering - and it would, because the caller
     is a click handler with nowhere to put a rejection. */
  it('leaves setup even when the disguise cannot be applied', async () => {
    const { completion, order } = recorder({
      disguise: true,
      turnOnDisguise: () => Promise.reject(new Error('the pref table is gone'))
    });
    await expect(completeSetup(completion)).resolves.toBeUndefined();
    expect(order).toEqual(['write', 'flush', 'leave']);
  });

  it('leaves setup even when the writes never land', async () => {
    const { completion, order } = recorder({
      disguise: true,
      flushWrites: () => Promise.reject(new Error('SQLite said no'))
    });
    await expect(completeSetup(completion)).resolves.toBeUndefined();
    expect(order).toEqual(['write', 'leave']);
  });
});
