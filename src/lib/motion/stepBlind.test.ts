import { afterEach, describe, expect, it } from 'vitest';

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
