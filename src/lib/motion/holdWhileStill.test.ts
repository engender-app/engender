import { afterEach, describe, expect, it, vi } from 'vitest';

import { holdFacesWhileStill } from './holdWhileStill';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function attachedFace(name = 'face-glance', inHome = false) {
  const callbacks = new Map<object, () => void>();
  const home = { dataset: { homeAmbient: 'running' } };
  let gazeHeld = false;
  const frames: FrameRequestCallback[] = [];
  let settleReady: () => void = () => {};
  let readyReads = 0;
  class FaceAnimation {
    animationName = name;
    playState = 'running';
    private origin = 0;
    get startTime() { return this.origin; }
    set startTime(value: number) { this.origin = value; this.playState = 'running'; }
    currentTime = 0;
    pause = vi.fn(() => { this.playState = 'paused'; });
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
  const face = { getAnimations, classList: { contains: () => gazeHeld } };
  const row = { querySelectorAll: () => [face], closest: (selector: string) => inHome && selector === '[data-home-ambient]' ? home : null } as unknown as HTMLElement;
  vi.stubGlobal('CSSAnimation', FaceAnimation);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  const cancelFrame = vi.fn();
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  vi.stubGlobal('MutationObserver', class {
    constructor(private callback: () => void) {}
    observe(target: object) { callbacks.set(target, this.callback); }
    disconnect() {}
  });
  vi.stubGlobal('document', { documentElement: {} });
  vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, removeEventListener() {} }));
  const detach = holdFacesWhileStill(row);
  return {
    animation,
    setIdle(value: boolean) { home.dataset.homeAmbient = value ? 'paused' : 'running'; callbacks.get(home)?.(); },
    setGaze(value: boolean) { gazeHeld = value; callbacks.get(face)?.(); },
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

describe('Home face idle holds', () => {
  it.each(['face-glance', 'face-blink'])('freezes %s in motion and resumes from the same phase', async (name) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const clock = vi.spyOn(performance, 'now').mockReturnValue(750);
    const face = attachedFace(name, true);
    face.animation.currentTime = 750;
    face.frame();
    await face.settleReady();
    expect(vi.getTimerCount()).toBe(1);
    face.setIdle(true);
    expect(face.animation.playState).toBe('paused');
    expect(face.animation.currentTime).toBe(750);
    expect(vi.getTimerCount()).toBe(0);
    clock.mockReturnValue(10_750);
    face.setIdle(false);
    expect(face.animation.startTime).toBe(10_000);
    expect(face.animation.currentTime).toBe(750);
    expect(face.animation.playState).toBe('running');
    expect(vi.getTimerCount()).toBe(1);
    face.detach();
  });

  it('keeps a gaze-held glance paused when Home resumes, then releases its original phase', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const clock = vi.spyOn(performance, 'now').mockReturnValue(750);
    const face = attachedFace('face-glance', true);
    face.animation.currentTime = 750;
    face.frame();
    await face.settleReady();
    face.setGaze(true);
    face.setIdle(true);
    clock.mockReturnValue(10_750);
    face.setIdle(false);
    expect(face.animation.playState).toBe('paused');
    expect(vi.getTimerCount()).toBe(0);
    clock.mockReturnValue(11_750);
    face.setGaze(false);
    expect(face.animation.startTime).toBe(11_000);
    expect(face.animation.currentTime).toBe(750);
    face.detach();
  });
});
