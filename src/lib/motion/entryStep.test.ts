import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cssPart, footContinue, stepScrub, stepTravel } from './entryStep';
import type { ScrubClock } from './entryStep';

/* A stand-in for the element the transition runs on: 300px wide, nothing
   animating on it, nothing computed. */
const node = {
  getBoundingClientRect: () => ({ width: 300 }),
  getAnimations: () => []
} as unknown as Element;

function frames(css: (t: number, u: number) => string, ts: number[]) {
  return ts.map((t) => css(t, 1 - t));
}

const x = (css: string) => Number(/translateX\((-?[\d.]+)px\)/.exec(css)?.[1] ?? NaN);
const opacity = (css: string) => Number(/opacity: ([\d.]+)/.exec(css)?.[1] ?? NaN);

/* The Node tier has no document; the motion setting is all these read of one. */
const dataset: Record<string, string | undefined> = {};
beforeEach(() => {
  vi.stubGlobal('document', { documentElement: { dataset } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  dataset.a11yMotion = undefined;
});

describe('a new entry stepping forward and back', () => {
  it('on the axis, the leaving step goes the way the person is going and the arriving one comes from the far side', () => {
    const out = stepTravel(node, {}, { direction: 'out' });
    const into = stepTravel(node, {}, { direction: 'in' });
    // Svelte runs an outro's t from 1 to 0 and an intro's from 0 to 1.
    const [outStart, outEnd] = frames(out.css!, [1, 0]);
    const [inStart, inEnd] = frames(into.css!, [0, 1]);
    expect(x(outStart)).toBe(0);
    expect(x(outEnd)).toBeLessThan(0);
    expect(x(inStart)).toBeGreaterThan(0);
    expect(x(inEnd)).toBe(0);
    expect(opacity(inStart)).toBe(0);
    expect(opacity(outStart)).toBe(1);
  });

  it('runs the axis the other way for a step back', () => {
    const into = stepTravel(node, { back: true }, { direction: 'in' });
    expect(x(into.css!(0, 1))).toBeLessThan(0);
  });

  it('crossfades instead under reduced motion', () => {
    dataset.a11yMotion = 'reduce';
    const css = stepTravel(node, {}, { direction: 'in' }).css!(0.5, 0.5);
    expect(css).not.toContain('translate');
  });
});

/* The way on under the finish control (ticket 04): it opens and closes along
   the foot's own direction, so the finish control is carried continuously. */
describe('the foot\'s way on', () => {
  const foot = (flexDirection: string, size: { width: number; height: number }) => {
    vi.stubGlobal('getComputedStyle', () => ({ flexDirection, columnGap: '8px', getPropertyValue: () => '' }));
    return {
      getBoundingClientRect: () => size,
      parentElement: {}
    } as unknown as Element;
  };

  it('opens its height in a column, from nothing to its full size, fading with it', () => {
    const css = footContinue(foot('column', { width: 320, height: 56 })).css!;
    expect(css(0, 1)).toContain('height: 0px');
    expect(css(1, 0)).toContain('height: 56px');
    expect(css(0.5, 0.5)).toContain('height: 28px');
    expect(css(0.5, 0.5)).toContain('opacity: 0.5');
  });

  it('opens its width in a row, taking its gap with it', () => {
    const css = footContinue(foot('row', { width: 200, height: 48 })).css!;
    expect(css(0, 1)).toContain('width: 0px');
    expect(css(0, 1)).toContain('margin-inline-start: -8px');
    expect(css(1, 0)).toContain('width: 200px');
    expect(css(1, 0)).toContain('margin-inline-start: 0px');
  });

  it('crossfades instead under reduced motion', () => {
    dataset.a11yMotion = 'reduce';
    expect(footContinue(foot('column', { width: 1, height: 1 })).css!(0.5, 0.5)).not.toContain('height');
  });
});

/* The step back under Android's back gesture (ticket 04, box 5): the same
   motion as a tap on Back, driven by the gesture's progress instead of time. */
describe('a step back scrubbed by the back gesture', () => {
  class FakeClock implements ScrubClock {
    t = 0;
    queue: Array<{ id: number; run: () => void }> = [];
    id = 0;
    frame(run: () => void) {
      this.queue.push({ id: ++this.id, run });
      return this.id;
    }
    cancel(handle: number) {
      this.queue = this.queue.filter((q) => q.id !== handle);
    }
    now() {
      return this.t;
    }
    /** One animation frame, `ms` after the last. */
    tick(ms = 16) {
      this.t += ms;
      const due = this.queue;
      this.queue = [];
      for (const q of due) q.run();
    }
  }

  const el = () => {
    const props = new Map<string, string>();
    return {
      props,
      style: {
        setProperty: (k: string, v: string) => void props.set(k, v),
        removeProperty: (k: string) => void props.delete(k)
      }
    } as unknown as HTMLElement & { props: Map<string, string> };
  };
  const scene = () => {
    const leaving = el();
    const arriving = el();
    const leave = stepTravel(node, { back: true }, { direction: 'out' });
    const arrive = stepTravel(node, { back: true }, { direction: 'in' });
    const clock = new FakeClock();
    const scrub = stepScrub([cssPart(leaving, leave, false), cssPart(arriving, arrive, true)], clock);
    return { leaving, arriving, leave, arrive, clock, scrub };
  };
  const px = (e: { props: Map<string, string> }) => x(`transform: ${e.props.get('transform')}`);
  const op = (e: { props: Map<string, string> }) => Number(e.props.get('opacity'));

  it('at progress 0 the second step is at rest and the first is not yet drawn', () => {
    const { leaving, arriving } = scene();
    expect(op(leaving)).toBe(1);
    expect(px(leaving)).toBe(0);
    expect(op(arriving)).toBeLessThan(0.01);
    expect(px(arriving)).toBeLessThan(0);
  });

  it('at progress 0.5 both steps are drawn, each where the timed change puts it at t = 0.5', () => {
    const { leaving, arriving, leave, arrive, clock, scrub } = scene();
    scrub.progress(0.5);
    clock.tick();
    expect(op(leaving)).toBeCloseTo(0.5);
    expect(op(arriving)).toBeCloseTo(0.5);
    expect(`transform: ${leaving.props.get('transform')}`).toBe(leave.css!(0.5, 0.5).split('; ')[1]);
    expect(`transform: ${arriving.props.get('transform')}`).toBe(arrive.css!(0.5, 0.5).split('; ')[1]);
    expect(px(leaving)).toBeGreaterThan(0);
    expect(px(arriving)).toBeLessThan(0);
  });

  it('at progress 1 the first step is in place and the second gone', () => {
    const { leaving, arriving, clock, scrub } = scene();
    scrub.progress(1);
    clock.tick();
    expect(op(arriving)).toBe(1);
    expect(px(arriving)).toBe(0);
    expect(op(leaving)).toBe(0);
  });

  it('draws once per frame, the latest progress only', () => {
    const { arriving, clock, scrub } = scene();
    scrub.progress(0.2);
    scrub.progress(0.3);
    scrub.progress(0.4);
    expect(clock.queue).toHaveLength(1);
    clock.tick();
    expect(op(arriving)).toBeCloseTo(0.4);
  });

  const settleFrames = (s: ReturnType<typeof scene>, to: 0 | 1) => {
    const seen: Array<{ leaveOp: number; leaveX: number; arriveOp: number; arriveX: number }> = [];
    let done = false;
    void s.scrub.settle(to).then(() => (done = true));
    const record = () => seen.push({ leaveOp: op(s.leaving), leaveX: px(s.leaving), arriveOp: op(s.arriving), arriveX: px(s.arriving) });
    record();
    for (let i = 0; i < 100 && s.clock.queue.length; i++) {
      s.clock.tick();
      record();
    }
    return { seen, done: () => done };
  };
  const largestStep = (values: number[]) => Math.max(...values.slice(1).map((v, i) => Math.abs(v - values[i])));

  it('a release at 0.6 continues from where the finger left it to the first step, with no jump', async () => {
    const s = scene();
    s.scrub.progress(0.6);
    s.clock.tick();
    const before = { leaveOp: op(s.leaving), arriveOp: op(s.arriving), arriveX: px(s.arriving) };
    const { seen } = settleFrames(s, 1);
    // The first frame of the settle is the frame the finger left.
    expect(seen[0].arriveOp).toBeCloseTo(before.arriveOp);
    expect(seen[0].leaveOp).toBeCloseTo(before.leaveOp);
    expect(seen[0].arriveX).toBeCloseTo(before.arriveX);
    // It ends at rest on the first step...
    expect(seen.at(-1)!.arriveOp).toBe(1);
    expect(seen.at(-1)!.arriveX).toBe(0);
    expect(seen.at(-1)!.leaveOp).toBe(0);
    // ...in less time than the whole change, and no frame moves more than the change's whole distance would in one.
    expect(seen.length).toBeLessThan(240 / 16 + 2);
    expect(largestStep(seen.map((f) => f.arriveX))).toBeLessThan(24 * 0.4);
    expect(largestStep(seen.map((f) => f.arriveOp))).toBeLessThan(0.4);
    await Promise.resolve();
    expect(s.scrub.position).toBe(1);
  });

  it('a cancel at 0.6 returns the second step to rest and the first to nothing, with no jump', () => {
    const s = scene();
    s.scrub.progress(0.6);
    s.clock.tick();
    const { seen } = settleFrames(s, 0);
    expect(seen[0].leaveOp).toBeCloseTo(0.4);
    expect(seen.at(-1)!.leaveOp).toBe(1);
    expect(seen.at(-1)!.leaveX).toBe(0);
    expect(seen.at(-1)!.arriveOp).toBeLessThan(0.01);
    expect(largestStep(seen.map((f) => f.leaveX))).toBeLessThan(24 * 0.4);
    expect(largestStep(seen.map((f) => f.leaveOp))).toBeLessThan(0.4);
    expect(s.scrub.position).toBe(0);
  });

  it('a progress still waiting for its frame is drawn before a settle starts, and ignored after', () => {
    const s = scene();
    s.scrub.progress(0.6);
    void s.scrub.settle(0);
    expect(op(s.leaving)).toBeCloseTo(0.4);
    s.scrub.progress(0.9);
    expect(s.clock.queue).toHaveLength(1);
  });

  it('clear takes off every style it wrote', () => {
    const s = scene();
    s.scrub.progress(0.5);
    s.clock.tick();
    s.scrub.clear();
    expect(s.leaving.props.size).toBe(0);
    expect(s.arriving.props.size).toBe(0);
  });

  it('the swap after a scrub has nothing left to move', () => {
    expect(stepTravel(node, { back: true, instant: true }, { direction: 'in' }).duration).toBe(0);
    expect(footContinue(node, { instant: true }).duration).toBe(0);
  });
});
