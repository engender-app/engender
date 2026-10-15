import { describe, expect, it, vi } from 'vitest';

import { attemptWith, oneAtATime, oneAtATimeEach } from './writeOutcome.ts';

describe('attemptWith', () => {
  it('resolves true and says nothing when the write lands', async () => {
    const report = vi.fn();
    expect(await attemptWith(async () => {}, 'Could not save.', report)).toBe(true);
    expect(report).not.toHaveBeenCalled();
  });

  it('says the failure message and resolves false when the write rejects', async () => {
    const report = vi.fn();
    const refused = new Error('database is locked');
    const result = attemptWith(() => Promise.reject(refused), 'Could not save.', report);
    await expect(result).resolves.toBe(false);
    // The error goes along, so the toast can name a full disk (last-audit ui 37).
    expect(report).toHaveBeenCalledWith('Could not save.', refused);
  });

  it('treats a write that throws before returning a promise as a failure too', async () => {
    const report = vi.fn();
    expect(await attemptWith(() => { throw new Error('bad input'); }, 'Could not save.', report)).toBe(false);
    expect(report).toHaveBeenCalledOnce();
  });
});

describe('oneAtATime', () => {
  it('runs a second tap only after the first write settles', async () => {
    let finish!: () => void;
    const write = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const run = oneAtATime(vi.fn());

    const first = run(write, 'Could not save.');
    expect(await run(write, 'Could not save.')).toBe(false);
    expect(write).toHaveBeenCalledOnce();

    finish();
    expect(await first).toBe(true);
    const third = run(write, 'Could not save.');
    finish();
    expect(await third).toBe(true);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('reports busy while a write is in flight and clears it after a failure', async () => {
    const busy: boolean[] = [];
    const run = oneAtATime(vi.fn(), (value) => busy.push(value));
    expect(await run(() => Promise.reject(new Error('locked')), 'Could not save.')).toBe(false);
    expect(busy).toEqual([true, false]);
  });
});

describe('oneAtATimeEach', () => {
  it('refuses a second tap on the same row while its write is in flight, and lets another row write', async () => {
    let finishA!: () => void;
    const writeA = vi.fn(() => new Promise<void>((resolve) => { finishA = resolve; }));
    const writeB = vi.fn(async () => {});
    const run = oneAtATimeEach(vi.fn());

    const first = run('a', writeA, 'Could not save.');
    expect(await run('a', writeA, 'Could not save.')).toBe(false);
    expect(await run('b', writeB, 'Could not save.')).toBe(true);
    expect(writeA).toHaveBeenCalledOnce();
    expect(writeB).toHaveBeenCalledOnce();

    finishA();
    expect(await first).toBe(true);
    const again = run('a', writeA, 'Could not save.');
    finishA();
    expect(await again).toBe(true);
    expect(writeA).toHaveBeenCalledTimes(2);
  });

  it('says a failure and admits the same row again for a retry', async () => {
    const report = vi.fn();
    const run = oneAtATimeEach(report);
    const locked = new Error('locked');
    expect(await run('a', () => Promise.reject(locked), 'Could not save.')).toBe(false);
    expect(report).toHaveBeenCalledWith('Could not save.', locked);
    expect(await run('a', async () => {}, 'Could not save.')).toBe(true);
  });
});
