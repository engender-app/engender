import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';

import { blindVariables, carryBlind, CARRIED_PARTS, CARRIED_RINGS } from './fieldBlind';

/** A live style object's own two methods, alongside `view-transition-name`
    and `clip-path` set as plain properties the same way real code does -
    `view-transition-group` is set/cleared through these instead, since
    TypeScript's DOM lib does not know that property by name yet. */
type Style = Record<string, string> & { setProperty: (name: string, value: string) => void; removeProperty: (name: string) => void };
function makeStyle(): Style {
  const store = {} as Style;
  store.setProperty = (name: string, value: string) => {
    store[name] = value;
  };
  store.removeProperty = (name: string) => {
    delete store[name];
  };
  return store;
}

type Styled = { style: Style };
const el = (): Styled => ({ style: makeStyle() });

/** A field, as the four things the primitive asks it for: how tall it is,
    its blind, the elements painted on it, and the sun's rings. */
function field({
  height = 0,
  top = 0,
  blind = el() as Styled | null,
  parts = [] as Styled[],
  rings = [] as Styled[]
} = {}) {
  return {
    style: makeStyle(),
    getBoundingClientRect: () => ({ height, top }),
    querySelector: () => blind,
    querySelectorAll: (selector: string) => (selector.includes('field-part') ? parts : rings)
  };
}

/** A document whose field list can be swapped out under the carry, which is
    what a navigation does to it. */
function fakeDocument(
  fields: ReturnType<typeof field>[],
  scrollTop = 0,
  regionTop = 0,
  /** What the pseudo elements of a transition in flight answer, by pseudo. */
  pseudo: Record<string, Record<string, string>> = {}
) {
  const root = {
    dataset: {} as Record<string, string>,
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
  const doc = { fields, root, region: { scrollTop, getBoundingClientRect: () => ({ top: regionTop }) } };
  return {
    doc,
    as: {
      querySelectorAll: () => doc.fields,
      /* The one thing the carry asks the document for beside its fields:
         how far the screen under them is scrolled. */
      querySelector: () => doc.region,
      documentElement: root,
      defaultView: { getComputedStyle: (_: unknown, name: string) => pseudo[name] ?? {} }
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

  it('moves a visible field out intact when arriving on a scrolled screen', () => {
    const blind = el();
    const { doc, as } = fakeDocument([field({ height: 215, top: 59, blind })], 0, 20);
    const carry = carryBlind(as)!;
    const scrolledBlind = el();
    const scrolledPart = el();
    doc.fields = [field({ height: 199, blind: scrolledBlind, parts: [scrolledPart] })];
    doc.region.scrollTop = 1200;
    carry.swap();
    expect(doc.root.dataset.blindScroll).toBe('exit');
    expect(doc.root.style.props.get('--blind-to')).toBe('0px');
    expect(doc.root.style.props.get('--blind-from')).toBe('215px');
    expect(doc.root.style.props.get('--blind-delta')).toBe('254px');
    expect(doc.root.style.props.get('--blind-ease')).toBe('var(--ease-out-soft)');
    expect(scrolledBlind.style.viewTransitionName).toBeUndefined();
    expect(scrolledPart.style.viewTransitionName).toBeUndefined();
    carry.release();
    expect(doc.root.dataset.blindScroll).toBeUndefined();
  });

  it('moves a visible field down intact when leaving a scrolled screen', () => {
    const scrolledBlind = el();
    const { doc, as } = fakeDocument([field({ height: 199, blind: scrolledBlind })], 1200, 20);
    const carry = carryBlind(as)!;
    const arrivingBlind = el();
    doc.fields = [field({ height: 215, top: 59, blind: arrivingBlind })];
    doc.region.scrollTop = 0;
    carry.swap();
    expect(doc.root.dataset.blindScroll).toBe('enter');
    expect(doc.root.style.props.get('--blind-from')).toBe('0px');
    expect(doc.root.style.props.get('--blind-to')).toBe('215px');
    expect(doc.root.style.props.get('--blind-delta')).toBe('-254px');
    expect(doc.root.style.props.get('--blind-ease')).toBe('var(--ease-out-soft)');
    expect(scrolledBlind.style.viewTransitionName).toBeUndefined();
    expect(arrivingBlind.style.viewTransitionName).toBe('blind');
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

  /* Ticket 285 reverses ux-carpet 241's lifting: the blind, the printed parts
     and the rings are all nested in the field's group, so its overflow clip
     cuts every one of them at the painted edge (a ring 21px past Settings'
     field, type past the blue). The z-order 241 wanted - rings over titles
     over blind - now holds inside that group (app.css z-index 5, 4, 3). */
  it('nests the blind, the printed parts and the rings under the field group', () => {
    const blind = el();
    const parts = [el()];
    const rings = [el(), el()];
    const { as } = fakeDocument([field({ height: 215, blind, parts, rings })]);
    carryBlind(as);
    for (const node of [blind, parts[0], rings[0], rings[1]]) {
      expect(node.style['view-transition-group']).toBe('nearest');
    }
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

describe("the sun across setup's handover", () => {
  it('names every ring per side by default, so they close and open', () => {
    const rings = [el(), el()];
    const { as } = fakeDocument([field({ height: 100, rings })]);
    carryBlind(as);
    expect(rings.map((r) => r.style.viewTransitionName)).toEqual(['sun-a-0', 'sun-a-1']);
  });

  it('leaves them unnamed where the sun is the same object at the same size', () => {
    /* Redesign ticket 33: setup's sun has grown to exactly the scale Home
       draws it at, so naming it would close and reopen the app's own mark
       at the moment the app opens. Unnamed, it stays inside each screen's
       snapshot, and two identical images crossfading is a sun standing
       still. */
    const rings = [el(), el()];
    const { as } = fakeDocument([field({ height: 100, rings })]);
    carryBlind(as, { holdSun: true });
    expect(rings.map((r) => r.style.viewTransitionName)).toEqual([undefined, undefined]);
  });
});

/* A navigation that lands on one still running (ticket 285). The DOM is the
   earlier navigation's destination and the earlier transition is skipped the
   instant the new one starts, so the edge, the faded-in type and the opened
   rings jump to their resting state unless the new carry starts from what
   was on screen. */
describe('a carry that interrupts another', () => {
  const inFlight = {
    '::view-transition-group(field)': { height: '170px' },
    '::view-transition-group(fp-b-0)': { height: '46px' },
    '::view-transition-new(fp-b-0)': { opacity: '0.4' },
    '::view-transition-group(sun-b-0)': { height: '350px' },
    '::view-transition-new(sun-b-0)': { scale: '0.6' }
  };

  it('starts the edge where it was drawn, not where it was going', () => {
    const { doc, as } = fakeDocument([field({ height: 215 })], 0, 0, inFlight);
    const first = carryBlind(as);
    first.swap();
    doc.fields = [field({ height: 215 })];
    const second = carryBlind(as);
    doc.fields = [field({ height: 128 })];
    second.swap();
    expect(doc.root.style.props.get('--blind-from')).toBe('170px');
    expect(doc.root.style.props.get('--blind-to')).toBe('128px');
    expect(doc.root.style.props.get('--blind-delta')).toBe('42px');
    /* The outgoing type was photographed 45px below where the edge is. */
    expect(doc.root.style.props.get('--blind-lead-from')).toBe('-45px');
    second.release();
    first.release();
  });

  it('hands the outgoing type and rings what they had reached', () => {
    const { doc, as } = fakeDocument([field({ height: 215 })], 0, 0, inFlight);
    const first = carryBlind(as);
    first.swap();
    doc.fields = [field({ height: 215 })];
    const second = carryBlind(as);
    expect(doc.root.style.props.get('--fp-o-0')).toBe('0.4');
    expect(doc.root.style.props.get('--sun-s-0')).toBe('0.6');
    /* The skipped one settles first and must leave the newer carry's names
       and numbers where they are. */
    first.release();
    expect(doc.root.style.props.get('--fp-o-0')).toBe('0.4');
    second.swap();
    second.release();
    expect(doc.root.style.props.has('--fp-o-0')).toBe(false);
  });

  it('does not let a skipped carry take names off the elements the newer one named', () => {
    const blind = el();
    const { doc, as } = fakeDocument([field({ height: 215, blind })]);
    const first = carryBlind(as);
    first.swap();
    const second = carryBlind(as);
    expect(blind.style.viewTransitionName).toBe('blind');
    first.release();
    expect(blind.style.viewTransitionName).toBe('blind');
    doc.fields = [field({ height: 128 })];
    second.swap();
    second.release();
    expect(blind.style.viewTransitionName).toBe('');
  });

  it('gives all of it back on release, and starts from the DOM when nothing is running', () => {
    const { doc, as } = fakeDocument([field({ height: 215 })], 0, 0, inFlight);
    const first = carryBlind(as);
    expect(doc.root.style.props.get('--blind-lead-from')).toBe('0px');
    first.swap();
    doc.fields = [field({ height: 215 })];
    const second = carryBlind(as);
    second.swap();
    second.release();
    expect(doc.root.style.props.has('--fp-o-0')).toBe(false);
    expect(doc.root.style.props.has('--sun-s-0')).toBe(false);
    expect(doc.root.style.props.has('--blind-lead-from')).toBe(false);
  });
});

/* The stylesheet has one starting-point rule per index the carry can publish
   (app.css, --fp-from and --sun-from), and the script publishes as many as
   these two numbers say. They are written in two places, so they are held to
   each other here. */
describe('a sun ring taller than its field', () => {
  it('is cut at the field\'s bottom in its own clip, so it survives a scrolled arrival', () => {
    const tall = { style: makeStyle(), getBoundingClientRect: () => ({ bottom: 175 }) };
    const inside = { style: makeStyle(), getBoundingClientRect: () => ({ bottom: 120 }) };
    const f = field({ height: 154, rings: [tall as Styled, inside as Styled] });
    (f as unknown as { getBoundingClientRect: () => object }).getBoundingClientRect = () => ({ height: 154, top: 0, bottom: 154 });
    const { as } = fakeDocument([f]);
    carryBlind(as);
    expect(tall.style.clipPath).toBe('inset(50% 50% 21px 0)');
    expect(inside.style.clipPath).toBeUndefined();
  });
});

describe('the carried starting points and the stylesheet', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  it('has a rule for every part index the carry can publish, and no more', () => {
    const indices = [...css.matchAll(/view-transition-old\(fp-a-(\d+)\) \{ --fp-from: var\(--fp-o-(\d+), 1\)/g)];
    expect(indices.map((m) => Number(m[1]))).toEqual(Array.from({ length: CARRIED_PARTS }, (_, i) => i));
    for (const m of indices) expect(m[1]).toBe(m[2]);
  });
  it('has a rule for every ring the longest flag draws, inside what the carry publishes', () => {
    const rings = [...css.matchAll(/--sun-from: var\(--sun-s-(\d+), 1\)/g)].map((m) => Number(m[1]));
    expect(rings.length).toBeGreaterThan(0);
    expect(Math.max(...rings)).toBeLessThan(CARRIED_RINGS);
  });
});
