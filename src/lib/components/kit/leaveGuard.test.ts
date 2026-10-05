import { describe, expect, it, vi } from 'vitest';

import { leaveGuardCore, type Departure, type LeaveGuardState } from './leaveGuard.ts';

function departure(over: Partial<Departure> = {}): Departure & { cancelled: boolean } {
  const nav = {
    cancelled: false,
    willUnload: false,
    type: 'link',
    delta: undefined,
    to: { url: new URL('https://app.test/settings') },
    cancel() {
      nav.cancelled = true;
    },
    ...over
  };
  return nav;
}

function setup(start: { holding?: boolean; busy?: boolean } = {}) {
  const flags = { holding: start.holding ?? true, busy: start.busy ?? false };
  const state: LeaveGuardState = { pendingDeparture: null };
  const onDiscard = vi.fn();
  const navigator = {
    go: vi.fn<(delta: number) => Promise<unknown>>(() => Promise.resolve()),
    goto: vi.fn<(url: URL) => Promise<unknown>>(() => Promise.resolve())
  };
  const guard = leaveGuardCore(
    { holding: () => flags.holding, busy: () => flags.busy, onDiscard },
    navigator,
    state
  );
  return { flags, state, onDiscard, navigator, guard };
}

describe('leaveGuardCore', () => {
  it('lets a navigation through while nothing has changed', () => {
    const { guard, state } = setup({ holding: false });
    const nav = departure();
    guard.beforeNavigate(nav);
    expect(nav.cancelled).toBe(false);
    expect(state.pendingDeparture).toBeNull();
  });

  it('holds a navigation away from a changed draft and asks', () => {
    const { guard, state } = setup();
    const nav = departure();
    guard.beforeNavigate(nav);
    expect(nav.cancelled).toBe(true);
    expect(state.pendingDeparture).not.toBeNull();
  });

  it('keep() closes the question and goes nowhere', () => {
    const { guard, state, navigator, onDiscard } = setup();
    guard.beforeNavigate(departure());
    guard.keep();
    expect(state.pendingDeparture).toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(navigator.goto).not.toHaveBeenCalled();
    expect(navigator.go).not.toHaveBeenCalled();
  });

  it('discard() drops the draft, then replays a link departure through goto', () => {
    const { guard, state, navigator, onDiscard } = setup();
    const nav = departure();
    guard.beforeNavigate(nav);
    guard.discard();
    expect(onDiscard).toHaveBeenCalledOnce();
    expect(navigator.goto).toHaveBeenCalledWith(nav.to!.url);
    expect(state.pendingDeparture).toBeNull();
  });

  it('replays a history move by the same delta', () => {
    const { guard, navigator } = setup();
    guard.beforeNavigate(departure({ type: 'popstate', delta: -1 }));
    guard.discard();
    expect(navigator.go).toHaveBeenCalledWith(-1);
    expect(navigator.goto).not.toHaveBeenCalled();
  });

  it('lets the replayed navigation itself through even if the draft still reads as changed', () => {
    const { guard, navigator } = setup();
    guard.beforeNavigate(departure({ type: 'popstate', delta: -1 }));
    guard.discard();
    expect(navigator.go).toHaveBeenCalledOnce();
    const replay = departure({ type: 'popstate', delta: -1 });
    guard.beforeNavigate(replay);
    expect(replay.cancelled).toBe(false);
  });

  it('re-arms after a replay that failed: the next departure is held again', async () => {
    const { guard, navigator, state } = setup();
    navigator.goto.mockImplementationOnce(() => Promise.reject(new Error('load failed')));
    guard.beforeNavigate(departure());
    guard.discard();
    await Promise.resolve();
    await Promise.resolve();
    const next = departure();
    guard.beforeNavigate(next);
    expect(next.cancelled).toBe(true);
    expect(state.pendingDeparture).not.toBeNull();
  });

  it('re-arms after a history move that went nowhere and never reached the check', async () => {
    const { guard, navigator, state } = setup();
    guard.beforeNavigate(departure({ type: 'popstate', delta: -5 }));
    guard.discard();
    expect(navigator.go).toHaveBeenCalledWith(-5);
    await Promise.resolve();
    await Promise.resolve();
    const next = departure();
    guard.beforeNavigate(next);
    expect(next.cancelled).toBe(true);
    expect(state.pendingDeparture).not.toBeNull();
  });

  it('re-arms after a goto that resolved without reaching the check', async () => {
    const { guard, state } = setup();
    guard.beforeNavigate(departure());
    guard.discard();
    await Promise.resolve();
    await Promise.resolve();
    const next = departure();
    guard.beforeNavigate(next);
    expect(next.cancelled).toBe(true);
    expect(state.pendingDeparture).not.toBeNull();
  });

  it('re-arms once the replay has gone through its own check, even before the load settles', () => {
    const { guard, navigator, state } = setup();
    navigator.goto.mockImplementationOnce(() => new Promise(() => {}));
    guard.beforeNavigate(departure());
    guard.discard();
    guard.beforeNavigate(departure());
    const later = departure();
    guard.beforeNavigate(later);
    expect(later.cancelled).toBe(true);
    expect(state.pendingDeparture).not.toBeNull();
  });

  it('cancels quietly while a save is in flight, without asking', () => {
    const { guard, state } = setup({ holding: false, busy: true });
    const nav = departure();
    guard.beforeNavigate(nav);
    expect(nav.cancelled).toBe(true);
    expect(state.pendingDeparture).toBeNull();
  });

  it('leaves an unload to the browser: cancelled, no sheet', () => {
    const { guard, state } = setup();
    const nav = departure({ willUnload: true, type: 'leave', to: null });
    guard.beforeNavigate(nav);
    expect(nav.cancelled).toBe(true);
    expect(state.pendingDeparture).toBeNull();
  });

  it('keeps the first question open when a second departure arrives under it', () => {
    const { guard, navigator } = setup();
    guard.beforeNavigate(departure({ to: { url: new URL('https://app.test/first') } }));
    const second = departure({ to: { url: new URL('https://app.test/second') } });
    guard.beforeNavigate(second);
    expect(second.cancelled).toBe(true);
    guard.discard();
    expect(navigator.goto).toHaveBeenCalledWith(new URL('https://app.test/first'));
  });

  describe('request(), for a departure that is not a navigation', () => {
    it('runs at once when nothing has changed', () => {
      const { guard } = setup({ holding: false });
      const after = vi.fn();
      guard.request(after);
      expect(after).toHaveBeenCalledOnce();
    });

    it('waits for discard() when the draft has changed', () => {
      const { guard, onDiscard } = setup();
      const after = vi.fn();
      guard.request(after);
      expect(after).not.toHaveBeenCalled();
      guard.discard();
      expect(onDiscard).toHaveBeenCalledOnce();
      expect(after).toHaveBeenCalledOnce();
    });

    it('does nothing while a save is in flight', () => {
      const { guard, state } = setup({ busy: true });
      const after = vi.fn();
      guard.request(after);
      expect(after).not.toHaveBeenCalled();
      expect(state.pendingDeparture).toBeNull();
    });
  });
});
