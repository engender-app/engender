import { afterEach, describe, expect, it, vi } from 'vitest';
import { homeAmbient } from './homeAmbient';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function attachHome() {
  vi.useFakeTimers();
  const doc = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('document', doc);
  let active = true;
  let doorChanged = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal('MutationObserver', class {
    constructor(callback: () => void) { doorChanged = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const door = { hasAttribute: () => active };
  const home = { dataset: { homeAmbient: 'running' }, closest: () => door } as unknown as HTMLElement;
  const detach = homeAmbient(home) as () => void;
  return { home, doc, detach, disconnect, setActive(value: boolean) { active = value; doorChanged(); } };
}

describe('Home ambient input policy', () => {
  it('pauses at 30 seconds and starts a fresh deadline after input', () => {
    const { home, doc, detach } = attachHome();
    vi.advanceTimersByTime(29_999);
    expect(home.dataset.homeAmbient).toBe('running');
    doc.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(29_999);
    expect(home.dataset.homeAmbient).toBe('running');
    vi.advanceTimersByTime(1);
    expect(home.dataset.homeAmbient).toBe('paused');
    doc.dispatchEvent(new Event('pointerdown'));
    expect(home.dataset.homeAmbient).toBe('running');
    vi.advanceTimersByTime(30_000);
    expect(home.dataset.homeAmbient).toBe('paused');
    detach();
  });

  it.each(['keydown', 'click', 'focusin', 'wheel', 'pointermove'])('resumes on %s, including accessible activation', (event) => {
    const { home, doc, detach } = attachHome();
    vi.advanceTimersByTime(30_000);
    doc.dispatchEvent(new Event(event));
    expect(home.dataset.homeAmbient).toBe('running');
    expect(vi.getTimerCount()).toBe(1);
    detach();
  });

  it('keeps a hidden retained Home paused despite input, then resumes its visit', () => {
    const { home, doc, detach, setActive } = attachHome();
    setActive(false);
    expect(home.dataset.homeAmbient).toBe('paused');
    expect(vi.getTimerCount()).toBe(0);
    doc.dispatchEvent(new Event('pointerdown'));
    expect(home.dataset.homeAmbient).toBe('paused');
    setActive(true);
    expect(home.dataset.homeAmbient).toBe('running');
    expect(vi.getTimerCount()).toBe(1);
    detach();
  });

  it('suspends while the document is hidden and removes listeners on teardown', () => {
    const { home, doc, detach, disconnect } = attachHome();
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(home.dataset.homeAmbient).toBe('paused');
    expect(vi.getTimerCount()).toBe(0);
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(home.dataset.homeAmbient).toBe('running');
    detach();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    doc.dispatchEvent(new Event('pointerdown'));
    expect(vi.getTimerCount()).toBe(0);
  });
});
