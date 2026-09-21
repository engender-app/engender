import { afterEach, describe, expect, it } from 'vitest';

import { blindEdge } from './stepBlind';

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
  FakeResizeObserver.instances = [];
  if (hadResizeObserver) g.ResizeObserver = priorResizeObserver;
  else delete g.ResizeObserver;
});

describe('blindEdge, which box it watches', () => {
  it('subscribes to the border box, the one its callback reads', () => {
    g.ResizeObserver = FakeResizeObserver;
    const node = {} as HTMLElement;

    blindEdge(node);

    expect(FakeResizeObserver.instances).toHaveLength(1);
    const [[target, options]] = FakeResizeObserver.instances[0].observeCalls;
    expect(target).toBe(node);
    expect(options).toEqual({ box: 'border-box' });
  });
});
