import { afterEach, describe, expect, it, vi } from 'vitest';

import { blindEdge, edgeShown, holdsDirection, rideShown } from './stepBlind';

/* The whole defect (ticket 156) is which box the observer subscribes to,
   not what the callback does with an entry - so the stub only needs to
   record the `observe()` call, never fire the callback. Simulating an
   actual resize here would test the stub's timing, not the contract. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observeCalls: [Element, ResizeObserverOptions | undefined][] = [];
  constructor(public callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe(target: Element, options?: ResizeObserverOptions) {
    this.observeCalls.push([target, options]);
  }
  unobserve() {}
  disconnect() {}
}

const g = globalThis as Record<string, unknown>;
const hadResizeObserver = 'ResizeObserver' in g;
const priorResizeObserver = g.ResizeObserver;

afterEach(() => {
  vi.unstubAllGlobals();
  FakeResizeObserver.instances = [];
  if (hadResizeObserver) g.ResizeObserver = priorResizeObserver;
  else delete g.ResizeObserver;
});

describe('blindEdge, which box it watches', () => {
  it('subscribes to the border box, the one its callback reads', () => {
    g.ResizeObserver = FakeResizeObserver;
    const node = { addEventListener() {}, removeEventListener() {} } as unknown as HTMLElement;

    blindEdge(node);

    expect(FakeResizeObserver.instances).toHaveLength(1);
    const [[target, options]] = FakeResizeObserver.instances[0].observeCalls;
    expect(target).toBe(node);
    expect(options).toEqual({ box: 'border-box' });
  });
});

/* The three readings an interrupting change continues from (ticket 285). */
describe('what a step change continues from', () => {
  it('holds the printed words\' direction while an edge is landing or a word is fading', () => {
    const base = { now: 1000, lastChange: 900, settleMs: 380, fading: false };
    expect(holdsDirection(base)).toBe(true);
    expect(holdsDirection({ ...base, lastChange: 500 })).toBe(false);
    expect(holdsDirection({ ...base, lastChange: 500, fading: true })).toBe(true);
    expect(holdsDirection({ ...base, lastChange: -Infinity })).toBe(false);
  });

  it('reads the edge as drawn, and falls back to the target when there is nothing to read', () => {
    expect(edgeShown('212.468px', 168)).toBe(212.468);
    expect(edgeShown('', 168)).toBe(168);
    expect(edgeShown('auto', 168)).toBe(168);
  });

  it('reads a rider\'s ride off its computed translate', () => {
    expect(rideShown('0px -1.53214px')).toBe(-1.53214);
    expect(rideShown('0px 44.4679px')).toBe(44.4679);
    expect(rideShown('none')).toBe(0);
    expect(rideShown('')).toBe(0);
    expect(rideShown(undefined)).toBe(0);
  });
});


describe('a heading returning before its departure ends', () => {
  it.each([false, true])('restores a revived heading, reduced motion %s', (reduced) => {
    class Element {
      parentElement: Element | null = null;
      children: Element[] = [];
      offsetTop = 0;
      offsetHeight = 40;
      textContent = 'Question';
      inert = false;
      dataset = {};
      properties = new Map<string, string>();
      style = {
        alignSelf: '',
        translate: '',
        getPropertyValue: (name: string) => this.properties.get(name) ?? '',
        setProperty: (name: string, value: string) => this.properties.set(name, value),
        removeProperty: (name: string) => this.properties.delete(name)
      };
      querySelector = vi.fn();
      addEventListener = vi.fn((_type: string, _listener: EventListener, _capture?: boolean) => {});
      removeEventListener = vi.fn();
      animate = vi.fn(() => ({ cancel: vi.fn(), finished: new Promise(() => {}) }));
    }
    let mutate: MutationCallback = () => {};
    vi.stubGlobal('HTMLElement', Element);
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('MutationObserver', class {
      constructor(callback: MutationCallback) { mutate = callback; }
      observe() {}
      disconnect() {}
    });
    vi.stubGlobal('document', { documentElement: { dataset: { a11yMotion: reduced ? 'reduce' : 'normal' } } });
    vi.stubGlobal('getComputedStyle', (element: Element) => ({
      paddingBottom: '16px', translate: element.style?.translate || '0px -94px',
      getPropertyValue: () => element instanceof Element ? '200px' : ''
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const host = new Element();
    const field = new Element();
    field.parentElement = host;
    const ask = new Element();
    const returning = new Element();
    returning.parentElement = ask;
    const incoming = new Element();
    incoming.parentElement = ask;
    ask.children = [returning, incoming];
    field.querySelector.mockReturnValue(ask);
    returning.style.setProperty('--own-rest', '294px');
    const action = blindEdge(field as unknown as HTMLElement);
    FakeResizeObserver.instances[0].callback([
      { borderBoxSize: [{ blockSize: 200 }] } as unknown as ResizeObserverEntry
    ], {} as ResizeObserver);
    mutate([{ addedNodes: [incoming], removedNodes: [] } as unknown as MutationRecord], {} as MutationObserver);
    expect(returning.style.translate).toBe('0px -94px');

    const resume = field.addEventListener.mock.calls.find(([type]) => type === 'introstart')?.[1];
    expect(resume, 'a reversed keyed heading resumes without a childList insertion').toBeTypeOf('function');
    returning.inert = true;
    resume?.({ target: returning } as unknown as Event);
    expect(returning.style.translate).toBe('0px -94px');
    expect(returning.animate).not.toHaveBeenCalled();
    returning.inert = false;
    resume?.({ target: returning } as unknown as Event);

    expect(returning.style.translate).toBe('');
    expect(returning.style.getPropertyValue('--own-rest')).toBe('56px');
    if (reduced) {
      expect(returning.animate).not.toHaveBeenCalled();
    } else {
      expect(returning.animate).toHaveBeenCalledWith([
        { translate: '0px -94px' },
        { translate: '0 calc(var(--blind-edge) - var(--own-rest))' }
      ], expect.objectContaining({ duration: 380 }));
      const next = new Element();
      next.parentElement = ask;
      ask.children.push(next);
      mutate([{ addedNodes: [next], removedNodes: [] } as unknown as MutationRecord], {} as MutationObserver);
      expect(returning.animate.mock.results[0].value.cancel).toHaveBeenCalledOnce();
      expect(returning.style.translate).toBe('0px -94px');
    }
    action?.destroy?.();
    expect(returning.style.translate).toBe('');
  });
});
