import { describe, expect, test, vi } from 'vitest';
import { registerStepBack, stepBack } from './stepBack';

describe('a mounted step machine owns Back', () => {
  test('a registered owner answers, and nothing answers once it is gone', () => {
    const previous = vi.fn(() => true);
    const unregister = registerStepBack(previous);
    expect(stepBack()).toBe(true);
    unregister();
    expect(stepBack()).toBe(false);
    expect(previous).toHaveBeenCalledTimes(1);
  });

  test('an owner on its first step declines, so Back leaves the screen as before', () => {
    const unregister = registerStepBack(() => false);
    expect(stepBack()).toBe(false);
    unregister();
  });

  test('cleanup of an older mount cannot unregister its replacement', () => {
    const old = registerStepBack(() => false);
    const current = registerStepBack(() => true);
    old();
    expect(stepBack()).toBe(true);
    current();
  });
});

/* The predictive step back: the owner says when a gesture may draw its step back, and that
   is the only thing that arms the native callback. */
describe('the step back drawn under the gesture', () => {
  const preview = () => ({ begin: vi.fn(() => true), progress: vi.fn(), cancel: vi.fn() });

  test('only the current owner with something to draw can arm it, and unmounting disarms it', async () => {
    const { armStepPreview, onStepPreviewArmed } = await import('./stepBack');
    const seen: boolean[] = [];
    const stop = onStepPreviewArmed((on) => seen.push(on));
    const back = () => true;
    const unregister = registerStepBack(back, preview());
    armStepPreview(back, true);
    armStepPreview(() => true, false); // not the owner: ignored
    unregister();
    const plain = () => true;
    const unregisterPlain = registerStepBack(plain);
    armStepPreview(plain, true); // nothing to draw: ignored
    unregisterPlain();
    stop();
    expect(seen).toEqual([false, true, false]);
  });

  test('a new owner starts disarmed, so a stale arm cannot carry over', async () => {
    const { armStepPreview, onStepPreviewArmed } = await import('./stepBack');
    const first = () => true;
    registerStepBack(first, preview());
    armStepPreview(first, true);
    const unregister = registerStepBack(() => true, preview());
    let now: boolean | undefined;
    onStepPreviewArmed((on) => (now = on))();
    expect(now).toBe(false);
    unregister();
  });

  test('a gesture draws only while armed, and progress and cancel reach the owner', async () => {
    const { armStepPreview, beginStepPreview, stepPreviewProgress, cancelStepPreview } = await import('./stepBack');
    const p = preview();
    const back = () => true;
    const unregister = registerStepBack(back, p);
    expect(beginStepPreview()).toBe(false);
    expect(p.begin).not.toHaveBeenCalled();
    armStepPreview(back, true);
    expect(beginStepPreview()).toBe(true);
    stepPreviewProgress(0.4);
    cancelStepPreview();
    expect(p.progress).toHaveBeenCalledWith(0.4);
    expect(p.cancel).toHaveBeenCalledTimes(1);
    unregister();
  });
});
