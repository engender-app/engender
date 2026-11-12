import { afterEach, describe, expect, test, vi } from 'vitest';

import { connectStepPreview, type StepBackBridge } from './step-preview';
import { armStepPreview, registerStepBack } from '../navigation/stepBack';

/* The handshake between the web's step machine and the native StepBack
   callback (ticket 04, box 5). The web is the source of truth; the native
   side only follows what it is told. */
function fakeBridge() {
  const listeners = new Map<string, (event?: { progress: number }) => void>();
  const removed: string[] = [];
  const armed: boolean[] = [];
  const bridge = {
    setArmed: vi.fn(async ({ armed: on }: { armed: boolean }) => void armed.push(on)),
    addListener: vi.fn(async (name: string, listener: (event?: { progress: number }) => void) => {
      listeners.set(name, listener);
      return { remove: async () => void removed.push(name) };
    })
  } as unknown as StepBackBridge;
  const fire = (name: string, event?: { progress: number }) => listeners.get(name)?.(event);
  return { bridge, armed, removed, fire };
}

const owner = () => {
  const preview = { begin: vi.fn(() => true), progress: vi.fn(), cancel: vi.fn() };
  const back = () => true;
  const unregister = registerStepBack(back, preview);
  return { preview, back, unregister };
};

let cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups) c();
  cleanups = [];
});

describe('the predictive step back handshake', () => {
  const guards = { isGateActive: () => false, hasActiveOverlay: () => false };

  test('the native callback follows the owner: off at first, on while armed, off when it unmounts', async () => {
    const { bridge, armed } = fakeBridge();
    const o = owner();
    cleanups.push(connectStepPreview(bridge, guards));
    armStepPreview(o.back, true);
    armStepPreview(o.back, true);
    o.unregister();
    expect(armed).toEqual([false, true, false]);
  });

  test('tearing down disarms and removes every listener', async () => {
    const { bridge, armed, removed } = fakeBridge();
    const o = owner();
    const stop = connectStepPreview(bridge, guards);
    armStepPreview(o.back, true);
    stop();
    await new Promise((r) => setTimeout(r));
    expect(armed.at(-1)).toBe(false);
    expect(removed.sort()).toEqual(['backCancelled', 'backProgress', 'backStarted']);
    armStepPreview(o.back, false);
    armStepPreview(o.back, true);
    expect(armed.at(-1)).toBe(false);
    o.unregister();
  });

  test('a gesture is drawn: started, progress, cancelled', async () => {
    const { bridge, fire } = fakeBridge();
    const o = owner();
    cleanups.push(connectStepPreview(bridge, guards), o.unregister);
    armStepPreview(o.back, true);
    await Promise.resolve();
    fire('backStarted');
    fire('backProgress', { progress: 0.3 });
    fire('backProgress', { progress: 0.6 });
    fire('backCancelled');
    expect(o.preview.begin).toHaveBeenCalledTimes(1);
    expect(o.preview.progress.mock.calls).toEqual([[0.3], [0.6]]);
    expect(o.preview.cancel).toHaveBeenCalledTimes(1);
  });

  test('nothing is drawn while the gate or an overlay owns Back, or while disarmed', async () => {
    for (const g of [
      { isGateActive: () => true, hasActiveOverlay: () => false },
      { isGateActive: () => false, hasActiveOverlay: () => true },
      guards
    ]) {
      const { bridge, fire } = fakeBridge();
      const o = owner();
      const stop = connectStepPreview(bridge, g);
      if (g !== guards) armStepPreview(o.back, true);
      fire('backStarted');
      fire('backProgress', { progress: 0.5 });
      fire('backCancelled');
      expect(o.preview.begin).not.toHaveBeenCalled();
      expect(o.preview.progress).not.toHaveBeenCalled();
      expect(o.preview.cancel).not.toHaveBeenCalled();
      stop();
      o.unregister();
    }
  });

  test('progress after a cancel is not drawn', async () => {
    const { bridge, fire } = fakeBridge();
    const o = owner();
    cleanups.push(connectStepPreview(bridge, guards), o.unregister);
    armStepPreview(o.back, true);
    fire('backStarted');
    fire('backCancelled');
    fire('backProgress', { progress: 0.5 });
    expect(o.preview.progress).not.toHaveBeenCalled();
  });
});
