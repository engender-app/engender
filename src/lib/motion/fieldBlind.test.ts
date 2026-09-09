import { describe, expect, it } from 'vitest';

import { blindVariables, carryBlind } from './fieldBlind';

type Styled = { style: Record<string, string> };
const el = (): Styled => ({ style: {} });

/** A field, as the four things the primitive asks it for: how tall it is,
    its blind, the elements painted on it, and the sun's rings. */
function field({
  height = 0,
  blind = el() as Styled | null,
  parts = [] as Styled[],
  rings = [] as Styled[]
} = {}) {
  return {
    style: {} as Record<string, string>,
    getBoundingClientRect: () => ({ height }),
    querySelector: () => blind,
    querySelectorAll: (selector: string) => (selector.includes('field-part') ? parts : rings)
  };
}

/** A document whose field list can be swapped out under the carry, which is
    what a navigation does to it. */
function fakeDocument(fields: ReturnType<typeof field>[], scrollTop = 0) {
  const root = {
    style: {
      props: new Map<string, string>(),
      setProperty(name: string, value: string) {
        this.props.set(name, value);
      },
      removeProperty(name: string) {
        this.props.delete(name);
      }
    }
  };
  const doc = { fields, root, region: { scrollTop } };
  return {
    doc,
    as: {
      querySelectorAll: () => doc.fields,
      /* The one thing the carry asks the document for beside its fields:
         how far the screen under them is scrolled. */
      querySelector: () => doc.region,
      documentElement: root
    } as unknown as Document
  };
}

describe('the blind, carried across a navigation', () => {
  it('names the outgoing blind before the old side is captured', () => {
    const blind = el();
    const { as } = fakeDocument([field({ height: 215, blind })]);
    expect(carryBlind(as)).not.toBeNull();
    expect(blind.style.viewTransitionName).toBe('blind');
  });

  /* The name has to be handed over rather than written as a rule: after the
     navigation completes the outgoing screen can still be in the DOM, and a
     rule that names both blinds at the new capture names two elements at
     once, which aborts the whole transition (redesign ticket 25). */
  it('hands the name to the incoming blind at the swap, never holding both', () => {
    const before = el();
    const after = el();
    const { doc, as } = fakeDocument([field({ height: 215, blind: before })]);
    const carry = carryBlind(as)!;
    doc.fields = [field({ height: 102, blind: after })];
    carry.swap();
    expect(before.style.viewTransitionName).toBe('');
    expect(after.style.viewTransitionName).toBe('blind');
  });

  it('publishes the two heights, the delta the content follows, and the settle', () => {
    const { doc, as } = fakeDocument([field({ height: 215 })]);
    const carry = carryBlind(as)!;
    doc.fields = [field({ height: 102 })];
    carry.swap();
    expect(doc.root.style.props.get('--blind-from')).toBe('215px');
    expect(doc.root.style.props.get('--blind-to')).toBe('102px');
    expect(doc.root.style.props.get('--blind-delta')).toBe('113px');
    expect(doc.root.style.props.get('--blind-ease')).toBe('var(--ease-out-soft)');
    /* Closing, so what is painted on the field leaves upwards and the next
       screen's arrives from below. */
    expect(doc.root.style.props.get('--part-travel')).toBe('-12px');
  });

  /* A collapsed field's blind is never named: it is the one field without
     the bleed that takes every other one to the window's edges, so its box
     is narrower and inset, and a group holding one box for both sides drew
     the whole blind 20px to the right for the length of the navigation. */
  it('leaves a collapsed field\'s blind unnamed, so the blind only ever moves up and down', () => {
    const blind = el();
    const { as } = fakeDocument([field({ height: 0, blind })]);
    carryBlind(as);
    expect(blind.style.viewTransitionName).toBeUndefined();
  });

  /* A scrolled screen's field is that far above the window, and the group
     holds one box for both sides - so naming it took the whole blind
     off-screen and the field vanished for the length of the navigation
     (Alicja, round one, on deep-back). */
  it('leaves a scrolled screen out, so the blind closes to what that screen shows', () => {
    const blind = el();
    const { doc, as } = fakeDocument([field({ height: 215, blind })]);
    const carry = carryBlind(as)!;
    doc.fields = [field({ height: 199 })];
    doc.region.scrollTop = 1200;
    carry.swap();
    expect(doc.root.style.props.get('--blind-to')).toBe('0px');
    expect(doc.root.style.props.get('--blind-from')).toBe('215px');
  });

  it('reads a screen with no field as the blind closed to nothing', () => {
    const { doc, as } = fakeDocument([field({ height: 215 })]);
    const carry = carryBlind(as)!;
    doc.fields = [];
    carry.swap();
    expect(doc.root.style.props.get('--blind-to')).toBe('0px');
    expect(doc.root.style.props.get('--blind-delta')).toBe('215px');
    /* A close that lands at nothing keeps its overshoot: it happens above
       the window's top edge, where there is nothing to uncover. */
    expect(doc.root.style.props.get('--blind-ease')).toMatch(/^linear\(/);
  });

  /* Each thing painted on the field leaves and arrives under its own
     animation, so no element may pair with one on the other screen: the two
     sides take names that cannot meet, and the browser fades each on its
     own instead of tweening one into the other. */
  it('names every painted element per side, so nothing morphs into anything', () => {
    const beforeParts = [el(), el()];
    const afterParts = [el(), el(), el()];
    const { doc, as } = fakeDocument([field({ height: 215, parts: beforeParts })]);
    const carry = carryBlind(as)!;
    doc.fields = [field({ height: 102, parts: afterParts })];
    carry.swap();
    expect(beforeParts.map((p) => p.style.viewTransitionName)).toEqual(['', '']);
    expect(afterParts.map((p) => p.style.viewTransitionName)).toEqual([
      'fp-b-0',
      'fp-b-1',
      'fp-b-2'
    ]);
  });

  it('gives the outgoing parts names of their own before the old capture', () => {
    const parts = [el(), el()];
    const { as } = fakeDocument([field({ height: 215, parts })]);
    carryBlind(as);
    expect(parts.map((p) => p.style.viewTransitionName)).toEqual(['fp-a-0', 'fp-a-1']);
  });

  /* The sun leaves as a movement rather than as part of a photograph, so
     every ring is its own group and the stylesheet can close them
     outermost first. */
  it('names each of the sun rings, in the order they are drawn', () => {
    const rings = [el(), el(), el()];
    const { as } = fakeDocument([field({ height: 215, rings })]);
    carryBlind(as);
    expect(rings.map((r) => r.style.viewTransitionName)).toEqual([
      'sun-a-0',
      'sun-a-1',
      'sun-a-2'
    ]);
  });

  it('gives every name back when the transition is over, and takes its variables with it', () => {
    const before = el();
    const after = el();
    const beforeParts = [el()];
    const afterRings = [el()];
    const { doc, as } = fakeDocument([
      field({ height: 215, blind: before, parts: beforeParts })
    ]);
    const carry = carryBlind(as)!;
    doc.fields = [field({ height: 102, blind: after, rings: afterRings })];
    carry.swap();
    carry.release();
    expect(before.style.viewTransitionName).toBe('');
    expect(after.style.viewTransitionName).toBe('');
    expect(beforeParts[0].style.viewTransitionName).toBe('');
    expect(afterRings[0].style.viewTransitionName).toBe('');
    expect(doc.root.style.props.size).toBe(0);
  });

  it('carries a navigation that starts on a screen with no field at all', () => {
    const { doc, as } = fakeDocument([]);
    const carry = carryBlind(as);
    expect(carry).not.toBeNull();
    doc.fields = [field({ height: 215 })];
    carry!.swap();
    expect(doc.root.style.props.get('--blind-from')).toBe('0px');
    expect(doc.root.style.props.get('--blind-to')).toBe('215px');
    expect(doc.root.style.props.get('--blind-delta')).toBe('-215px');
    expect(doc.root.style.props.get('--part-travel')).toBe('12px');
  });
});

describe('the five properties one moving edge is worth', () => {
  it('offsets the incoming content by what the edge gained, so it rides down with it', () => {
    const v = blindVariables({ from: 82, to: 183 });
    expect(v['--blind-from']).toBe('82px');
    expect(v['--blind-to']).toBe('183px');
    /* Negative: the field grew, so the content below starts higher than
       where it now sits and travels down onto it. */
    expect(v['--blind-delta']).toBe('-101px');
    expect(v['--part-travel']).toBe('12px');
  });

  it('sends a part the other way where the edge is being pulled up', () => {
    const v = blindVariables({ from: 183, to: 82 });
    expect(v['--blind-delta']).toBe('101px');
    expect(v['--part-travel']).toBe('-12px');
  });

  it('hands the stylesheet the settle for this travel and no other', () => {
    const small = blindVariables({ from: 100, to: 112 });
    /* Under the settle floor: a move, not a landing. */
    expect(small['--blind-ease']).toBe('var(--ease-out)');
    expect(blindVariables({ from: 82, to: 183 })['--blind-ease']).toMatch(/^linear\(/);
  });
});
