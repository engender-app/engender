import { afterEach, describe, expect, it, vi } from 'vitest';

import { holdFacesWhileStill } from './holdWhileStill';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function attachedFace() {
  const frames: FrameRequestCallback[] = [];
  let settleReady: () => void = () => {};
  let readyReads = 0;
  class FaceAnimation {
    animationName = 'face-glance';
    playState = 'running';
    startTime = 0;
    currentTime = 0;
    pause = vi.fn();
    effect = {
      getKeyframes: () => [
        { offset: 0, transform: 'translateX(0)' },
        { offset: 0.5, transform: 'translateX(0)' },
        { offset: 1, transform: 'translateX(1px)' }
      ],
      getComputedTiming: () => ({ duration: 1000 }),
      getTiming: () => ({ delay: 0 })
    };
    private pending = new Promise<void>((resolve) => { settleReady = resolve; });
    get ready() { readyReads++; return this.pending; }
  }
  const animation = new FaceAnimation();
  const getAnimations = vi.fn(() => [animation]);
  const face = { getAnimations, classList: { contains: () => false } };
  const row = { querySelectorAll: () => [face], closest: () => null } as unknown as HTMLElement;
  vi.stubGlobal('CSSAnimation', FaceAnimation);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  const cancelFrame = vi.fn();
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  vi.stubGlobal('MutationObserver', class {
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal('document', { documentElement: {} });
  vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, removeEventListener() {} }));
  const detach = holdFacesWhileStill(row);
  return {
    animation,
    getAnimations,
    cancelFrame,
    readyReads: () => readyReads,
    frame: () => frames.shift()?.(0),
    settleReady: async () => { settleReady(); await Promise.resolve(); await Promise.resolve(); },
    detach: () => { if (typeof detach === 'function') detach(); }
  };
}

describe('face motion teardown', () => {
  it('pauses a ready face during its hold and clears its next timer on detach', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const face = attachedFace();
    face.frame();
    await face.settleReady();
    expect(face.animation.pause).toHaveBeenCalledOnce();
    expect(face.animation.currentTime).toBe(100);
    expect(vi.getTimerCount()).toBe(1);
    face.detach();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not scan or await animations when its queued frame arrives after detach', () => {
    const face = attachedFace();
    face.detach();
    expect(face.cancelFrame).toHaveBeenCalledWith(1);
    face.frame();
    expect(face.getAnimations).not.toHaveBeenCalled();
    expect(face.readyReads()).toBe(0);
  });

  it('does not inspect or pause an animation becoming ready after detach', async () => {
    const face = attachedFace();
    face.frame();
    expect(face.readyReads()).toBe(1);
    face.detach();
    const scans = face.getAnimations.mock.calls.length;
    await face.settleReady();
    expect(face.getAnimations).toHaveBeenCalledTimes(scans);
    expect(face.animation.pause).not.toHaveBeenCalled();
  });
});
