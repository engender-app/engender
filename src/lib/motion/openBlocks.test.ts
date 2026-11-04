import { describe, expect, it } from 'vitest';

import { followersAfter, openingShifts } from './openBlocks';

/* The geometry of the roadmap's opening: at progress e (0 to 1) the
   followers stand at from + travel * e, the section's clip must end where
   the followers begin less the gap, and its contents must stay `packSpace *
   (1 - e)` above where layout put them. */
const at = (pair: [number, number], e: number) => pair[0] + (pair[1] - pair[0]) * e;

describe('openingShifts', () => {
  const cases = [
    { added: 3200, travel: 600, packSpace: 70 },
    { added: 300, travel: 300, packSpace: 70 },
    { added: 300, travel: 300, packSpace: 0 }
  ];

  it('starts every piece where the old layout had it and lets go on the final layout', () => {
    for (const g of cases) {
      const s = openingShifts(g);
      expect(s.followers[0]).toBe(-g.added);
      // The followers end where the screen's bottom edge is, or in place.
      expect(s.followers[1]).toBe(g.travel - g.added);
      // A box and its children cancel at the end of the travel.
      expect(s.sectionBox[1] + s.sectionKids[1]).toBe(0);
      expect(s.packBox[1] + s.packKids[1]).toBe(0);
    }
  });

  it('keeps the section clipped to the followers and its contents under the pack', () => {
    for (const g of cases) {
      const s = openingShifts(g);
      for (const e of [0, 0.1, 0.5, 0.9, 1]) {
        // The clip's bottom edge rides the followers' top.
        expect(at(s.sectionBox, e)).toBeCloseTo(at(s.followers, e), 9);
        // The contents sit below the pack's visible part: layout position
        // less the part of the pack's room not yet open.
        expect(at(s.sectionBox, e) + at(s.sectionKids, e)).toBeCloseTo(-g.packSpace * (1 - e), 9);
        // The pack's own contents stay where layout put them.
        expect(at(s.packBox, e) + at(s.packKids, e)).toBeCloseTo(0, 9);
      }
    }
  });
});

/* The opening's clock must start on a presented frame. The first frame after
   the switch lays the new rows out and takes 70 to 124 ms on a phone; an
   animation started there is already half through when it is first shown. */
describe('openBlocks start', () => {
  type Fake = { animate: (...args: unknown[]) => unknown; getBoundingClientRect: () => { top: number }; children: unknown[]; style: Record<string, string>; isConnected: boolean };
  const make = (top: number, log: string[], name: string): Fake => ({
    animate: (keyframes: Array<{ translate: string }>) => {
      let id = `${name}${log.length}`;
      log.push(`create ${id}`);
      log.push(`kf ${name} ${keyframes.map((k) => k.translate).join(' > ')}`);
      return {
        pause: () => log.push(`pause ${id}`),
        play: () => log.push(`play ${id}`),
        reverse: () => log.push(`reverse ${id}`),
        cancel: () => log.push(`cancel ${id}`),
        finished: new Promise(() => {}),
        currentTime: 0
      };
    },
    getBoundingClientRect: () => ({ top }),
    children: [],
    style: {},
    isConnected: true
  });

  async function run(withBetween = false) {
    const g = globalThis as Record<string, unknown>;
    const frames: Array<() => void> = [];
    g.innerHeight = 800;
    g.requestAnimationFrame = (cb: () => void) => frames.push(cb);
    const { openBlocks } = await import('./openBlocks');
    const log: string[] = [];
    const section = make(500, log, 's');
    const follower = make(1500, log, 'f');
    const social = make(900, log, 'b');
    const opening = openBlocks({
      pack: null,
      section: section as unknown as HTMLElement,
      between: withBetween ? [social as unknown as HTMLElement] : [],
      followers: [follower as unknown as HTMLElement],
      before: new Map<unknown, number>([[follower, 500], [social, 700]]) as unknown as Map<Element, number>,
      onSettled: () => {}
    });
    const flush = () => frames.splice(0).forEach((cb) => cb());
    return { opening, log, flush, frames };
  }

  it('creates every animation paused and plays them only from the second frame', async () => {
    const { opening, log, flush } = await run();
    expect(opening).not.toBeNull();
    const created = log.filter((l) => l.startsWith('create')).length;
    expect(created).toBeGreaterThan(0);
    expect(log.filter((l) => l.startsWith('pause')).length).toBe(created);
    expect(log.some((l) => l.startsWith('play'))).toBe(false);
    flush();
    expect(log.some((l) => l.startsWith('play'))).toBe(false);
    flush();
    expect(log.filter((l) => l.startsWith('play')).length).toBe(created);
  });

  it('does not start, or reverse, an opening played back while still held', async () => {
    const { opening, log, flush } = await run();
    opening!.retreat();
    flush();
    flush();
    expect(log.some((l) => l.startsWith('play'))).toBe(false);
    // Reversing at progress 0 would seek to the end first.
    expect(log.some((l) => l.startsWith('reverse'))).toBe(false);
  });

  it('reverses an opening that is already running', async () => {
    const { opening, log, flush } = await run();
    flush();
    flush();
    opening!.retreat();
    expect(log.some((l) => l.startsWith('reverse'))).toBe(true);
  });

  it('moves what sits between the pack and the section by the pack\'s room alone', async () => {
    const { log } = await run(true);
    // Stood at 700, now at 900 (the pack's 200px moved it): starts 200px up, ends in place.
    expect(log).toContain('kf b 0 -200px > 0 0px');
  });
});

/* Which elements the opening moves. A fake with DOM's contract:
   a.compareDocumentPosition(b) has PRECEDING (2) set when b is before a, and
   FOLLOWING (4) when b is after a. */
describe('followersAfter', () => {
  const order = ['pack', 'section', 'category', 'new-category'];
  const node = (name: string) => ({
    name,
    compareDocumentPosition: (other: { name: string }) =>
      order.indexOf(other.name) < order.indexOf(name) ? 2 : order.indexOf(other.name) > order.indexOf(name) ? 4 : 0
  });
  it('picks what comes after the section, never the pack above it or the section itself', () => {
    const nodes = order.map(node);
    const section = nodes[1];
    const names = followersAfter(section as unknown as Element, nodes as unknown as Element[]).map(
      (el) => (el as unknown as { name: string }).name
    );
    expect(names).toEqual(['category', 'new-category']);
  });
});
