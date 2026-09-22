import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TransitionConfig } from 'svelte/transition';

import {
  collapse,
  crossfade,
  disclose,
  discloseWidth,
  markScreenArrival,
  markSlotReplacement,
  maskHeight,
  resize,
  slideMonit,
  wipe
} from './reveal';

/* Same stub the tier-2 tests use: reveal.ts reads its duration and its easing
   out of the token layer through $lib/motion/tokens, which asks
   getComputedStyle for the number and documentElement.dataset for the
   reduced-motion signal. CSS is stubbed too, because this primitive also asks
   whether the runtime has clip-path at all. */
function stubDocument(reduced = false, clipPath = true, box?: Record<string, string>) {
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement: { dataset: reduced ? { a11yMotion: 'reduce' } : {} } };
  g.getComputedStyle = () => ({
    ...box,
    getPropertyValue: (name: string) =>
      ({ '--dur-slow': '380ms', '--dur-med': '240ms', '--dur-crossfade': '120ms' })[name] ?? ''
  });
  g.CSS = { supports: () => clipPath };
}

/* The screen settled long ago, unless a test says otherwise: the arrival
   window now gates leaving as well as arriving (redesign ticket 19), and the
   module marks its own load as an arrival, which this file runs inside. */
beforeEach(() => markScreenArrival(performance.now() - 1000));

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.document;
  delete g.getComputedStyle;
  delete g.CSS;
  /* The swap signal is a short window rather than a flag, and these tests
     run inside it. */
  markSlotReplacement(null, -Infinity);
});

const node = {} as Element;
const frame = (css: (t: number, u: number) => string, t: number) => css(t, 1 - t);

/** A node that knows how wide it is and can take a direct style write, which
    is all the crossfade asks of one. */
const measured = (width: number) =>
  ({ getBoundingClientRect: () => ({ width }), style: {} }) as unknown as Element;

describe('tier 3, the wipe', () => {
  it('uncovers from the left, so content arrives the way it is read', () => {
    stubDocument();
    const { css, duration } = wipe(node);
    expect(duration).toBe(380);
    expect(frame(css!, 0)).toBe('clip-path: inset(0 100% 0 0)');
    expect(frame(css!, 1)).toBe('clip-path: inset(0 0 0 0)');
  });

  /* Phase 5 UX ticket 23: a wipe that is a surface arriving, rather than one
     state replacing another, takes the authored duration. At --dur-slow the
     area chart's first draw read as a flicker rather than as a drawing. */
  it('takes the authored duration where the wipe is an arrival', () => {
    expect(wipe(node, { authored: true }).duration).toBe(700);
    expect(wipe(node).duration).toBe(380);
  });

  /* Rounded to whole percents the uncovering moved in a hundred visible
     steps across a 340px card, which reads as a stutter rather than as a
     sweep. Two decimals is under a tenth of a pixel there, and a round
     value still writes as a round value. */
  it('steps finely enough not to stutter, without changing a round frame', () => {
    const { css } = wipe(node);
    expect(frame(css!, 0.5)).toMatch(/inset\(0 \d+(\.\d+)?% 0 0\)/);
    expect(frame(css!, 0)).not.toContain('.00');
  });

  /* The same rule tests/motion-system.test.ts holds every CSS animation to,
     restated for a transition the stylesheet cannot reach: an animation that
     ends anywhere but its element's resting state strands it there. */
  it('ends uncovered, which is where the element rests', () => {
    stubDocument();
    expect(frame(wipe(node).css!, 1)).toBe('clip-path: inset(0 0 0 0)');
  });

  it('runs on the tier-3 duration rather than a literal', () => {
    stubDocument();
    expect(wipe(node).duration).toBe(380);
  });

  /* Tier 3's reduced-motion substitute is an instant cut, not tier 2's
     crossfade: a change within a screen has no journey to explain, so there
     is nothing for a fade to stand in for. */
  it('cuts instantly under reduced motion, and clips nothing on the way', () => {
    stubDocument(true);
    const config = wipe(node);
    expect(config.duration).toBe(0);
    expect(config.css, 'a cut applies no geometry at all').toBeUndefined();
  });

  /* The support fallback is a designed state rather than an unstyled one:
     where clip-path is missing the content fades in over the same duration,
     which is a weaker version of the same idea and not a broken one. */
  it('fades over the same duration where clip-path is missing', () => {
    stubDocument(false, false);
    const { css, duration } = wipe(node);
    expect(duration).toBe(380);
    expect(frame(css!, 0)).toBe('opacity: 0');
    expect(frame(css!, 1)).toBe('opacity: 1');
    expect(frame(css!, 0.5)).not.toContain('clip-path');
  });

  it('prefers the cut to the fade when both apply, because movement is the question', () => {
    stubDocument(true, false);
    expect(wipe(node).duration).toBe(0);
  });
});


describe('tier 3, a group opening its own height', () => {
  /* DIRECTION.md names this case by itself: a list insertion opens its own
     height rather than making everything below it jump. It is the one place
     tier 3 spends a layout property, so what the test holds is that it lands
     exactly on the element's resting box - the invariant the reduced-motion
     contract imposes on every animation in the app. */
  it('grows from nothing to the height the element already has', () => {
    stubDocument(false, true, { height: '180px', paddingTop: '12px', paddingBottom: '12px' });
    const { css, duration } = disclose(node);
    expect(duration).toBe(240);
    expect(frame(css!, 0)).toContain('height: 0px');
    expect(frame(css!, 1)).toContain('height: 180px');
    expect(frame(css!, 1)).toContain('padding-top: 12px');
    expect(frame(css!, 1)).toContain('padding-bottom: 12px');
  });

  it('clips while it runs, so the rows inside do not spill past the edge', () => {
    stubDocument(false, true, { height: '180px', paddingTop: '0px', paddingBottom: '0px' });
    const { css } = disclose(node);
    expect(frame(css!, 0.5)).toContain('overflow: hidden');
  });

  /* Tier 3's substitute is an instant cut rather than tier 2's crossfade: a
     group opening inside a screen has no journey for a fade to stand in for,
     and the chevron beside it has already said what happened. */
  it('cuts instantly under reduced motion', () => {
    stubDocument(true, true, { height: '180px' });
    expect(disclose(node).duration).toBe(0);
  });

  /* Redesign ticket 25: a card tile carries min-height 176px, and a height
     travel under a floor goes nowhere - the box stood at full size from the
     first frame. The travel owns the whole box for its length. */
  it('lifts any min-height for the travel, so a floored box can actually close', () => {
    stubDocument(false, true, { height: '176px', paddingTop: '0px', paddingBottom: '0px' });
    expect(frame(disclose(node).css!, 0.5)).toContain('min-height: 0');
  });

  /* The 20px at the very end (Alicja, notice dismissed on Home, frames 32 to
     33). An open box is a formatting context, so the margins either side of
     it are both spent; the frame it is gone they collapse into the larger.
     The bottom margin therefore ends at minus the smaller neighbour, which
     is what collapsing takes away, and the page never has to. */
  it('ends its bottom margin where the neighbours will collapse to, in block flow', () => {
    stubDocument(false, true, { height: '100px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '20px', display: 'block' });
    const between = {
      parentElement: {},
      previousElementSibling: {},
      nextElementSibling: {}
    } as unknown as Element;
    /* One computed style for every element in the stub: the node's own
       margin-bottom is 20 and so is the block above's; the heading below
       gets its 40 through the same table, so the smaller of the pair is
       20 and the box ends at -20. */
    const g = globalThis as Record<string, unknown>;
    const shared = g.getComputedStyle as () => Record<string, string>;
    g.getComputedStyle = (el: unknown) =>
      el === (between as unknown as { nextElementSibling: unknown }).nextElementSibling
        ? { ...shared(), marginTop: '40px' }
        : shared();
    const { css } = disclose(between);
    expect(frame(css!, 1)).toContain('margin-bottom: 20px');
    expect(frame(css!, 0)).toContain('margin-bottom: -20px');
  });

  it('leaves the bottom margin at zero inside a flex or grid parent, where margins never collapse', () => {
    stubDocument(false, true, { height: '100px', paddingTop: '0px', paddingBottom: '0px', marginBottom: '20px', display: 'flex' });
    const inRow = { parentElement: {}, previousElementSibling: {}, nextElementSibling: {} } as unknown as Element;
    expect(frame(disclose(inRow).css!, 0)).toContain('margin-bottom: 0px');
  });

  /* The first child's top margin that collapsed through the box at rest
     lands inside it the frame `overflow: hidden` applies (the Transition
     door's index: "Body" moved down 16px on the keystroke). The box is
     pulled up by that margin and made taller by it, so nothing moves. */
  it('takes a first child\'s collapsed top margin into the box, so the content does not drop when the box clips', () => {
    stubDocument(false, true, { height: '100px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '20px', borderTopWidth: '0px', overflow: 'visible', display: 'block' });
    const child = {};
    const wrapper = { parentElement: {}, firstElementChild: child } as unknown as Element;
    const g = globalThis as Record<string, unknown>;
    const shared = g.getComputedStyle as () => Record<string, string>;
    g.getComputedStyle = (el: unknown) => (el === child ? { ...shared(), marginTop: '16px' } : shared());
    const { css } = disclose(wrapper);
    expect(frame(css!, 1)).toContain('height: 116px');
    expect(frame(css!, 1)).toContain('margin-top: -16px');
    expect(frame(css!, 0)).toContain('height: 0px');
  });

  it('leaves a box that already clips or pads its top alone', () => {
    stubDocument(false, true, { height: '100px', paddingTop: '16px', paddingBottom: '0px', marginTop: '0px', overflow: 'hidden', display: 'block' });
    const wrapper = { parentElement: {}, firstElementChild: {} } as unknown as Element;
    expect(frame(disclose(wrapper).css!, 1)).toContain('height: 100px');
  });
});

describe('tier 3, an inline element opening its own width', () => {
  it('grows from zero width to the element width, fading opacity', () => {
    stubDocument(false, true, { width: '48px' });
    const { css, duration } = discloseWidth(node);
    expect(duration).toBe(150);
    expect(frame(css!, 0)).toContain('width: 0px');
    expect(frame(css!, 0)).toContain('opacity: 0');
    expect(frame(css!, 1)).toContain('width: 48px');
    expect(frame(css!, 1)).toContain('opacity: 1');
  });

  it('clips overflow and prevents wrapping while running', () => {
    stubDocument(false, true, { width: '48px' });
    const { css } = discloseWidth(node);
    expect(frame(css!, 0.5)).toContain('overflow: hidden');
    expect(frame(css!, 0.5)).toContain('white-space: nowrap');
    expect(frame(css!, 0.5)).toContain('min-width: 0');
  });

  it('absorbs the parent column gap on the leading margin when preceded by a sibling', () => {
    stubDocument(false, true, { width: '48px', columnGap: '8px' });
    const parent = {};
    const child = { parentElement: parent, previousElementSibling: {} } as unknown as Element;
    const { css } = discloseWidth(child);
    expect(frame(css!, 1)).toContain('margin-inline-start: 0px');
    expect(frame(css!, 0)).toContain('margin-inline-start: -8px');
  });

  it('leaves leading margin alone when it is the first child', () => {
    stubDocument(false, true, { width: '48px', columnGap: '8px' });
    const parent = {};
    const firstChild = { parentElement: parent, previousElementSibling: null } as unknown as Element;
    const { css } = discloseWidth(firstChild);
    expect(frame(css!, 0)).not.toContain('margin-inline-start');
  });

  it('cuts instantly under reduced motion', () => {
    stubDocument(true, true, { width: '48px' });
    expect(discloseWidth(node).duration).toBe(0);
  });
});

describe('tier 3, a panel giving its space back', () => {
  /** A node in a row of `lines`, each `[top, bottom]`, with its own line
      first. `columnGap` is what the row puts between them. A node whose only
      line is its own has nothing beside it and is therefore a column. */
  function panel(
    { width = 160, height = 100, gap = '8px', beside = [] as [number, number][], reduced = false } = {},
    box: Record<string, string> = {}
  ) {
    stubDocument(reduced, true, { height: `${height}px`, columnGap: gap, ...box });
    const rect = { top: 0, bottom: height, width, height };
    const node = {
      getBoundingClientRect: () => rect,
      /* `collapse` takes a panel out of the flow for one measurement, so a
         stub needs somewhere to put that. */
      style: { display: '' }
    } as unknown as Element;
    (node as { parentElement?: unknown }).parentElement = {
      children: [
        node,
        ...beside.map(([top, bottom]) => ({
          getBoundingClientRect: () => ({ top, bottom, left: 0 }),
          animate: () => {}
        }))
      ],
      /* One height for both reads, so nothing is eased unless a test says so. */
      getBoundingClientRect: () => ({ height: 0 })
    };
    return node;
  }

  /* The defect this exists for: closing one of two tiles standing side by
     side. The leaving tile shrinks along the row rather than down it, so the
     one beside it grows into the space continuously instead of snapping to
     full width the frame the node is finally removed. */
  it('shrinks along the row when a sibling shares its line', () => {
    const { css, duration } = collapse(panel({ beside: [[0, 100]] }));
    expect(duration).toBe(380);
    expect(frame(css!, 0)).toContain('flex: 0 0 0px');
    expect(frame(css!, 1)).toContain('flex: 0 0 160px');
  });

  /* The gap goes with it. A row still holding 8px of gap around a zero-width
     child leaves the survivor 8px short of the full width it lands on the
     frame the node is removed, which is the same snap one step smaller. */
  it('takes the row gap with it, so the survivor lands on the full width', () => {
    const { css } = collapse(panel({ beside: [[0, 100]], gap: '8px' }));
    expect(frame(css!, 0)).toContain('margin-inline-start: -8px');
    expect(frame(css!, 1)).toContain('margin-inline-start: 0px');
  });

  /* A tile is a padded box with a border, and `box-sizing: border-box` means
     a zero flex-basis still draws all of it: the safe-space card stalled at
     34px for the last third of the travel and lost the rest in the frame the
     node was removed. The padding goes with the width, the way `disclose`
     takes the vertical padding with the height. */
  it('takes its side padding and edges with it, so nothing is left standing', () => {
    const { css } = collapse(
      panel({ beside: [[0, 100]] }, { paddingLeft: '16px', paddingRight: '28px', borderLeftWidth: '1px', borderRightWidth: '1px' })
    );
    expect(frame(css!, 0)).toContain('padding-left: 0px');
    expect(frame(css!, 0)).toContain('padding-right: 0px');
    expect(frame(css!, 0)).toContain('border-left-width: 0px');
    expect(frame(css!, 1)).toContain('padding-left: 16px');
    expect(frame(css!, 1)).toContain('padding-right: 28px');
    expect(frame(css!, 1)).toContain('border-left-width: 1px');
  });

  /* A card narrowing along a row reflows its own text on the way, which is a
     broken layout held in front of the reader for the whole travel. The empty
     surface finishes the journey instead. Nothing like this is needed down a
     column, where a shrinking box's lines keep their width. */
  it('takes the content out early so the card does not reflow as it narrows', () => {
    const { css } = collapse(panel({ beside: [[0, 100]] }));
    expect(frame(css!, 1)).toContain('opacity: 1');
    expect(frame(css!, 0.8)).toContain('opacity: 0.692');
    expect(frame(css!, 0.35)).toContain('opacity: 0');
    expect(frame(css!, 0.1)).toContain('opacity: 0');
  });

  /* `transition:` is bidirectional, and Svelte answers one by calling the
     primitive once with direction 'both' - so everything below that behaves
     differently coming and going only works if a 'both' call hands back a
     function for Svelte to ask again once it knows. It did not, which is why
     the arrival gate above had never suppressed a single entrance: every
     caller of this primitive uses `transition:`. */
  it('defers to Svelte when a bidirectional directive asks', () => {
    const node = panel({ beside: [[0, 100]] });
    const both = collapse(node, undefined, { direction: 'both' }) as unknown;
    expect(typeof both).toBe('function');

    markScreenArrival(performance.now() - 1000);
    const asked = both as (o: { direction: 'in' | 'out' }) => TransitionConfig;
    expect(asked({ direction: 'out' }).duration).toBe(380);
    markScreenArrival();
    expect(asked({ direction: 'in' }).duration).toBe(0);
  });

  /* Redesign ticket 19, found on the agenda's arrival flipbook and present
     on main: Home's live tiles answer their reads one by one, and a heavier
     tile answering after a lighter one displaces it into the fold. That is
     the list settling, not a dismissal - nobody can tap inside the first
     240ms of a screen - and carpet ticket 04's rule that leaving is never
     suppressed had the wrong premise for a capped grid: the displaced tile
     dissolved in front of the reader while the screen was still arriving,
     a "Ready letter" ghost under the log strip for 200ms. A leave inside
     the arrival window cuts, as an arrival does. */
  it('cuts a leave inside the arrival window too, since the list is settling and nobody dismissed anything', () => {
    stubDocument();
    markScreenArrival();
    expect(collapse(panel({ beside: [[0, 100]] }), undefined, { direction: 'out' }).duration).toBe(0);
    markSlotReplacement({ slot: { top: 300, left: 20, width: 160, height: 100 } });
    expect(collapse(panel({ beside: [[0, 100]] }), undefined, { direction: 'out' }).duration).toBe(0);
    markScreenArrival(performance.now() - 1000);
    expect(collapse(panel({ beside: [[0, 100]] }), undefined, { direction: 'out' }).duration).toBe(380);
  });

  /* A dismissal the fold fills in the same tick is a swap rather than a
     collapse: the grid keeps every slot it had, so there is no space to give
     back and nothing for the neighbours to do. The leaving tile goes at once
     because by the time its transition is created the replacement is already
     standing in its slot - which in a two-up row has bumped it onto a line of
     its own, where anything it animated would be motion in the wrong place -
     and the replacement fades in where it stands. */
  it('swaps in place when the fold fills the slot in the same tick', () => {
    stubDocument();
    markSlotReplacement({ slot: { top: 300, left: 20, width: 160, height: 100 } });
    const leaving = collapse(panel({ beside: [[0, 100]] }), undefined, { direction: 'out' });
    expect(leaving.duration).toBe(380);
    /* Out of the flow and pinned where it stood, so the grid reaches its
       final layout in the frame of the tap rather than after the travel. */
    expect(frame(leaving.css!, 1)).toContain('position: fixed');
    expect(frame(leaving.css!, 1)).toContain('top: 300px');
    expect(frame(leaving.css!, 1)).toContain('width: 160px');
    expect(frame(leaving.css!, 1)).toContain('opacity: 1');
    expect(frame(leaving.css!, 0)).toContain('opacity: 0');
    expect(frame(leaving.css!, 0.5)).not.toContain('flex:');

    markScreenArrival(performance.now() - 1000);
    markSlotReplacement({ slot: { top: 300, left: 20, width: 160, height: 100 } });
    const arriving = collapse(panel({ beside: [[0, 100]] }), undefined, { direction: 'in' });
    expect(arriving.duration).toBe(380);
    expect(frame(arriving.css!, 0)).toBe('opacity: 0');
    expect(frame(arriving.css!, 1)).toBe('opacity: 1');
  });

  /* And the panel taking the slot over travels out of whatever the screen
     says it came from - the fold, on Home - because two cards changing places
     in one slot is what a crossfade cannot say. */
  it('rises out of the fold into the slot it is taking over', () => {
    stubDocument();
    markScreenArrival(performance.now() - 1000);
    markSlotReplacement({
      slot: { top: 300, left: 20, width: 160, height: 100 },
      from: { top: 520, left: 20, width: 340, height: 44 }
    });
    const node = panel({ beside: [[0, 100]] });
    (node as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => ({
      top: 300,
      left: 20,
      width: 160,
      height: 100
    });
    const { css } = collapse(node, undefined, { direction: 'in' });
    expect(frame(css!, 0)).toContain('translate(0px, 220px)');
    expect(frame(css!, 0)).toContain('opacity: 0');
    expect(frame(css!, 1)).toContain('translate(0px, 0px)');
    expect(frame(css!, 1)).toContain('opacity: 1');
  });

  /* A screen that cannot say where the replacement came from gets the fade
     alone. */
  it('fades alone when nothing says where it came from', () => {
    stubDocument();
    markScreenArrival(performance.now() - 1000);
    markSlotReplacement({ slot: { top: 300, left: 20, width: 160, height: 100 } });
    const { css } = collapse(panel({ beside: [[0, 100]] }), undefined, { direction: 'in' });
    expect(frame(css!, 0)).toBe('opacity: 0');
  });

  /* Without a slot there is nothing to pin to, so the cut is what is left. */
  it('cuts rather than guessing where the panel stood', () => {
    stubDocument();
    markSlotReplacement(null);
    expect(collapse(panel({ beside: [[0, 100]] }), undefined, { direction: 'out' }).duration).toBe(0);
  });

  /* The window is the flush that renders the swap and nothing after it: a
     dismissal a second later is a collapse again. */
  it('is over by the time the next change comes', () => {
    stubDocument();
    markSlotReplacement({ slot: { top: 0, left: 0, width: 10, height: 10 } }, performance.now() - 400);
    const { css, duration } = collapse(panel({ beside: [[0, 100]] }), undefined, { direction: 'out' });
    expect(duration).toBe(380);
    expect(frame(css!, 0)).toContain('flex: 0 0 0px');
  });

  /* A wrapping row can hand the space to a tile from the line below instead
     of to the neighbour, and that tile arrives by rewrapping - it changes
     place and width at once, which nothing can carry. So the neighbour must
     not grow into space it is about to lose: at 700px with the fold open the
     dose panel grew to 638px and snapped back to 318px at 174ms. */
  it('dissolves rather than growing a neighbour into space a rewrap will claim', () => {
    const node = panel({ beside: [[0, 100], [120, 220]] });
    const { css, duration } = collapse(node);
    expect(duration).toBe(380);
    expect(frame(css!, 1)).toContain('position: fixed');
    expect(frame(css!, 1)).not.toContain('flex:');
  });

  /* And the line the rewrap empties closes over the same window, or the rows
     under the grid are pulled up by the whole of it in one frame - which is
     the yank this case had left ("the row closes up - still happens with a
     yank", Alicja). The end height cannot be worked out from the boxes, so
     it is measured with the panel taken out of the flow. */
  /* A tile the rewrap moves is already laid out where it is going, so it
     travels by being translated back to where it was and released - visible
     the whole way rather than hidden behind the card dissolving over its new
     slot. The width is not animated with it: a card that scales horizontally
     stretches its own text, so it takes the new one at the old place. */
  it('sends a tile that changed place back where it was, and releases it', () => {
    const travelled: Keyframe[][] = [];
    const node = panel({ beside: [[0, 100], [120, 220]] });
    const parent = node.parentElement as unknown as {
      children: { getBoundingClientRect: () => unknown; animate: unknown }[];
      getBoundingClientRect: () => { height: number };
    };
    parent.getBoundingClientRect = () => ({ height: 0 });

    /* The second sibling stands on the line below and rewraps up beside the
       first once this panel is out of the flow, which is what taking it out
       of the flow is for - so the stub answers on that rather than on how
       many times it has been asked. */
    const mover = parent.children[2];
    const style = (node as unknown as { style: { display: string } }).style;
    mover.getBoundingClientRect = () =>
      style.display === 'none' ? { top: 0, left: 180 } : { top: 120, left: 0 };
    mover.animate = (keyframes: Keyframe[]) => travelled.push(keyframes);

    collapse(node);
    expect(travelled).toEqual([
      [{ transform: 'translate(-180px, 120px)' }, { transform: 'translate(0, 0)' }]
    ]);
  });

  it('holds the space the vacated line took, under the grid', () => {
    const frames: Keyframe[] = [];
    const node = panel({ beside: [[0, 100], [120, 220]] });
    const parent = node.parentElement as unknown as {
      getBoundingClientRect: () => { height: number };
      animate: (k: Keyframe[], o: KeyframeAnimationOptions) => void;
    };
    stubDocument(false, true, { height: '100px', columnGap: '8px', marginBottom: '8px' });
    let heights = [420, 260];
    parent.getBoundingClientRect = () => ({ height: heights.shift() ?? 260 });
    parent.animate = (keyframes, options) => {
      frames.push(...keyframes);
      expect(options.duration).toBe(380);
    };

    collapse(node);
    /* 160px of line went, and the grid's own margin is the 8px the stub
       reports - so the space is held on top of it and eased back to it. */
    expect(frames).toEqual([{ marginBottom: '168px' }, { marginBottom: '8px' }]);
  });

  /* Below the floor the same pair is stacked, and a tile that collapsed its
     width there would leave a full-height hole behind it. The axis is read
     off the layout rather than passed in, so one call site covers both. */
  it('collapses its height instead when nothing shares its line', () => {
    const { css } = collapse(
      panel({ beside: [[120, 220]] }, { paddingTop: '0px', paddingBottom: '0px' })
    );
    expect(frame(css!, 0)).toContain('height: 0px');
    expect(frame(css!, 1)).toContain('height: 100px');
    expect(frame(css!, 1)).not.toContain('flex:');
  });

  it('is a column when it is the only child there is', () => {
    const { css } = collapse(panel({}, { paddingTop: '0px', paddingBottom: '0px' }));
    expect(frame(css!, 1)).toContain('height: 100px');
  });

  /* The yank the ticket names: returning to Home from the calendar remounts
     every panel, and their reads answer a few dozen milliseconds later. An
     entrance played then is the screen assembling itself in front of you.
     One that plays after the screen has settled is a change, which is what
     tier 3 is for. */
  it('plays no entrance while the screen is still arriving', () => {
    const node = panel({ beside: [[0, 100]] });
    markScreenArrival();
    expect(collapse(node, undefined, { direction: 'in' }).duration).toBe(0);
  });

  it('travels on the way in once the screen has settled', () => {
    const node = panel({ beside: [[0, 100]] });
    markScreenArrival(performance.now() - 1000);
    expect(collapse(node, undefined, { direction: 'in' }).duration).toBe(380);
  });

  /* Redesign ticket 25, Alicja on the fold: the new tile should arrive the
     way a tile closes, "with the only difference being the new one comes
     from above". Down a column the block keeps its size, is pulled up by the
     travel still to come and clipped by the same amount, so its laid-out
     height grows from nothing and its top edge is the last thing to show. */
  it('comes down from above when it arrives alone in a column', () => {
    const node = panel({ beside: [[120, 220]] }, { paddingTop: '0px', paddingBottom: '0px', marginTop: '0px' });
    markScreenArrival(performance.now() - 1000);
    const { css, duration } = collapse(node, undefined, { direction: 'in' });
    expect(duration).toBe(380);
    expect(frame(css!, 0)).toContain('clip-path: inset(100px 0 0 0)');
    expect(frame(css!, 0)).toContain('margin-top: -100px');
    expect(frame(css!, 1)).toContain('clip-path: inset(0px 0 0 0)');
    expect(frame(css!, 1)).toContain('margin-top: 0px');
    expect(frame(css!, 0.5)).not.toContain('height:');
  });

  /* The margin under the arriving block grows with it: at full margin from
     the first frame the Transition door's empty results wrapper pushed the
     index under it 20px on the keystroke. */
  it('grows its bottom margin with it on the way down', () => {
    const node = panel({ beside: [[120, 220]] }, { paddingTop: '0px', paddingBottom: '0px', marginBottom: '20px' });
    markScreenArrival(performance.now() - 1000);
    const { css } = collapse(node, undefined, { direction: 'in' });
    expect(frame(css!, 0)).toContain('margin-bottom: 0px');
    expect(frame(css!, 1)).toContain('margin-bottom: 20px');
  });

  /* A list is not a block: the Transition door's 1500px index coming down
     from above is the whole door rushing past. Past a phone screen's half
     the panel opens in place, which is the height travel. */
  it('opens in place instead when it is taller than a block', () => {
    const node = panel({ height: 1500, beside: [[1600, 1700]] }, { paddingTop: '0px', paddingBottom: '0px' });
    markScreenArrival(performance.now() - 1000);
    const { css } = collapse(node, undefined, { direction: 'in' });
    expect(frame(css!, 0)).toContain('height: 0px');
    expect(frame(css!, 0)).not.toContain('clip-path');
  });

  it('still gives its height back from the bottom on the way out', () => {
    const node = panel({ beside: [[120, 220]] }, { paddingTop: '0px', paddingBottom: '0px' });
    const { css } = collapse(node, undefined, { direction: 'out' });
    expect(frame(css!, 0)).toContain('height: 0px');
    expect(frame(css!, 1)).toContain('height: 100px');
  });

  /* Alicja, round three: a notice's top hairline "simply disappears" on the
     first frame of its close. The edges stay for the travel and the box
     fades over its last third instead, so the line goes with the box. */
  it('keeps a closing panel\'s hairlines and fades the box over its last third', () => {
    const node = panel(
      { beside: [[120, 220]] },
      { paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '1px', borderBottomWidth: '1px' }
    );
    const { css } = collapse(node, undefined, { direction: 'out' });
    expect(frame(css!, 0.5)).toContain('border-top-width: 1px');
    expect(frame(css!, 0.5)).toContain('opacity: 1');
    expect(frame(css!, 0.175)).toContain('opacity: 0.5');
    expect(frame(css!, 0)).toContain('opacity: 0');
    expect(frame(css!, 1)).toContain('opacity: 1');
  });

  it('never fades a panel in: an arriving block does not come from nothing', () => {
    const node = panel({ height: 1500, beside: [[1600, 1700]] }, { paddingTop: '0px', paddingBottom: '0px' });
    markScreenArrival(performance.now() - 1000);
    expect(frame(collapse(node, undefined, { direction: 'in' }).css!, 0.1)).not.toContain('opacity');
  });

  /* Redesign ticket 25: the grid's stagger (kit.css, --tile-index by
     nth-child) is for a grid arriving together. A tile arriving alone on a
     settled screen - the third out of the fold - sat as a blank block for
     its two stagger steps before its clip began, so its turn is zeroed
     inline on the way in, and left alone on the way out. */
  it('skips the stagger for a panel arriving alone on a settled screen', () => {
    const node = panel({ beside: [[0, 100]] });
    const set: string[][] = [];
    (node as unknown as { style: { setProperty: (k: string, v: string) => void } }).style.setProperty = (k, v) =>
      set.push([k, v]);
    markScreenArrival(performance.now() - 1000);
    collapse(node, undefined, { direction: 'in' });
    expect(set).toEqual([['--tile-index', '0']]);
    collapse(node, undefined, { direction: 'out' });
    expect(set).toHaveLength(1);
  });

  it('cuts instantly under reduced motion and when the caller says to skip', () => {
    markScreenArrival(performance.now() - 1000);
    const beside: [number, number][] = [[0, 100]];
    expect(collapse(panel({ beside }), { skip: true }).duration).toBe(0);
    expect(collapse(panel({ beside, reduced: true })).duration).toBe(0);
  });
});

describe('tier 3, a skeleton uncovering the content under it', () => {
  /* It is an out-only transition, and the asymmetry is the point. Pairing it
     with an `in:` on the content made the content arrive twice - once with
     the screen, under tier 2's own view transition, and again a moment later
     when the worker answered (Alicja, 2026-08-26: "the panels seem to fade in
     two times, second time very close to each other and glitchy"). */
  it('fades the placeholder out rather than fading the content in', () => {
    stubDocument(false, true, {});
    const { css, duration } = crossfade(measured(240));
    /* --dur-fast is authored at 150ms; this asserted 160 until ticket 15
       traced the drift to reveal.ts's own restated fallback. */
    expect(duration).toBe(150);
    expect(frame(css!, 1)).toContain('opacity: 1');
    expect(frame(css!, 0)).toContain('opacity: 0');
  });

  /* And it leaves the flow while it runs. Both blocks of an {#if}/{:else}
     are alive during a transition, so a skeleton fading out in normal flow
     holds its height and everything under it drops when it finally goes.
     `.screen` is position:relative, which is what this resolves against.

     Written to the node directly rather than through `css()` (ticket 153):
     `css()` becomes a native CSS animation that only starts painting a
     frame after it is assigned, so a skeleton whose `position: absolute`
     lived there was still in flow - at full height, next to content already
     in its final place - for the one frame between the DOM swap and the
     animation's first paint, and everything under both was pushed down by
     the skeleton's height until it sprang back. A direct write lands in the
     same synchronous update that inserts the arriving content. */
  it('takes the placeholder out of the flow so nothing under it jumps', () => {
    stubDocument(false, true, {});
    const node = measured(240);
    crossfade(node);
    expect((node as unknown as { style: CSSStyleDeclaration }).style.position).toBe('absolute');
  });

  /* Pinned to the node's own width: an absolutely positioned box with no
     width shrinks to fit, so the placeholder would narrow on its first
     frame. Vertical placement needs nothing - with no `top` it sits at its
     static position, which is where it already was. */
  it('keeps the width it had, so it does not narrow as it goes', () => {
    stubDocument(false, true, {});
    const node = measured(240);
    crossfade(node);
    expect((node as unknown as { style: CSSStyleDeclaration }).style.width).toBe('240px');
  });

  /* Phase 5 ticket 32.16: a positioned element with no z-index still paints
     after normal-flow content in stacking order regardless of DOM order
     (CSS2.1 Appendix E), so the out-of-flow placeholder painted over the
     content it was fading off of for the whole 160ms - a second "appears
     twice" this primitive's own history had already named once, from taking
     the skeleton out of flow without also taking it out of the paint order. */
  it('paints behind the content it is fading off of', () => {
    stubDocument(false, true, {});
    const node = measured(240);
    crossfade(node);
    expect((node as unknown as { style: CSSStyleDeclaration }).style.zIndex).toBe('-1');
  });

  /* Out of flow and out from under the pointer both: a placeholder that
     still intercepted taps would sit invisible over the content it used to
     stand in for. */
  it('stops taking taps once it is fading off', () => {
    stubDocument(false, true, {});
    const node = measured(240);
    crossfade(node);
    expect((node as unknown as { style: CSSStyleDeclaration }).style.pointerEvents).toBe('none');
  });

  it('removes the placeholder on the spot under reduced motion', () => {
    stubDocument(true, true, {});
    expect(crossfade(measured(240)).duration).toBe(0);
  });

  /* `NoticedAxis.svelte` uses this on `transition:crossfade|global`, both
     ways, on a clickable mark - so an intro through this primitive must
     never take the positioning `out:crossfade`'s callers rely on, or a
     mark that arrived through it would be left permanently
     `position: absolute; z-index: -1; pointer-events: none` and unclickable
     (ticket 153's own fix would otherwise have introduced this: writing the
     positioning to `node.style` directly, rather than through `css()`,
     took it out of the styles Svelte reverts when a transition ends). */
  it('never positions the node on the way in', () => {
    stubDocument(false, true, {});
    const node = measured(240);
    crossfade(node, undefined, { direction: 'in' });
    const style = (node as unknown as { style: CSSStyleDeclaration }).style;
    expect(style.position).toBeUndefined();
    expect(style.zIndex).toBeUndefined();
    expect(style.pointerEvents).toBeUndefined();
  });

  /* Same shape `collapse` already handles: `transition:` is bidirectional,
     and Svelte answers one by calling the primitive once with direction
     'both', which only works if that call hands back a function for
     Svelte to ask again once it knows which way this run actually is. */
  it('defers to Svelte when a bidirectional directive asks', () => {
    stubDocument(false, true, {});
    const node = measured(240);
    const both = crossfade(node, undefined, { direction: 'both' }) as unknown;
    expect(typeof both).toBe('function');

    const asked = both as (o: { direction: 'in' | 'out' }) => TransitionConfig;
    asked({ direction: 'in' });
    const style = (node as unknown as { style: CSSStyleDeclaration }).style;
    expect(style.position).toBeUndefined();

    asked({ direction: 'out' });
    expect(style.position).toBe('absolute');
  });
});

/* `resize` (phase 5 ticket 32.17) is an action, not a transition config
   function - it does its own ongoing watching via ResizeObserver and
   node.animate() rather than returning a css(t) Svelte calls on a fixed
   schedule, which is the whole reason it exists next to `disclose` instead
   of being a mode on it. Neither browser API has a meaningful Node-tier
   stub: mocking ResizeObserver's callback timing and node.animate()'s
   compositing would test the mock, not the primitive, which is why
   AppNav.svelte's own ResizeObserver-driven pill has no unit test for its
   resize-triggered behaviour either. What is tested here is what a stub
   safely can: the two guards that skip the browser work entirely. The
   travel itself - old height to new, smoothly, once - is a real-browser
   frame capture, not a unit test. */
describe('tier 3, a box resizing under its own content', () => {
  it('does nothing under reduced motion - the box still resizes, in the one frame it always could', () => {
    stubDocument(true);
    const node = { getBoundingClientRect: () => ({ height: 100 }) } as unknown as HTMLElement;
    expect(resize(node)).toBeUndefined();
  });

  it('does nothing where ResizeObserver does not exist, the same as a wipe with no clip-path support', () => {
    stubDocument(false);
    const g = globalThis as Record<string, unknown>;
    const hadResizeObserver = 'ResizeObserver' in g;
    const prior = g.ResizeObserver;
    delete g.ResizeObserver;
    const node = { getBoundingClientRect: () => ({ height: 100 }) } as unknown as HTMLElement;
    try {
      expect(resize(node)).toBeUndefined();
    } finally {
      if (hadResizeObserver) g.ResizeObserver = prior;
    }
  });
});

/* Tier 3, the third and last spend of the height exception: a box that has
   already been relaid out uncovering itself from the height it had. */
describe('tier 3, a panel uncovering its new height', () => {
  /** A node that records what was animated and what was set on its style. */
  function panel(height: number, rows = '40px 20px') {
    const style: Record<string, string> = { overflow: '', gridTemplateRows: '' };
    let settle: (() => void) | undefined;
    const calls: { keyframes: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
    const node = {
      style,
      getBoundingClientRect: () => ({ height }) as DOMRect,
      animate: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
        calls.push({ keyframes, options });
        return {
          finished: {
            then: (done: () => void) => {
              settle = done;
            }
          }
        };
      }
    } as unknown as HTMLElement;
    (globalThis as Record<string, unknown>).getComputedStyle = () => ({ gridTemplateRows: rows });
    return { node, style, calls, finish: () => settle?.() };
  }

  it('travels from the height the caller measured to the one the box now has', () => {
    const { node, calls } = panel(420);
    maskHeight(node, 36, 380);
    expect(calls).toHaveLength(1);
    expect(calls[0].keyframes).toEqual([{ height: '36px' }, { height: '420px' }]);
    expect(calls[0].options.duration).toBe(380);
  });

  it('clips and pins the tracks for the travel, and only for the travel', () => {
    const { node, style, finish } = panel(420, '40px 20px 16px');
    maskHeight(node, 36, 380);
    expect(style.overflow).toBe('clip');
    expect(style.gridTemplateRows).toBe('40px 20px 16px');
    finish();
    expect(style.overflow).toBe('');
    expect(style.gridTemplateRows).toBe('');
  });

  it('gives back whatever the box was already saying about its own overflow', () => {
    const { node, style, finish } = panel(420);
    style.overflow = 'auto';
    maskHeight(node, 36, 380);
    expect(style.overflow).toBe('clip');
    finish();
    expect(style.overflow).toBe('auto');
  });
});

describe('tier 3, the slideMonit transition', () => {
  it('unfolds height, resets min-height, fades opacity, and slides into place', () => {
    stubDocument(false, true, {
      height: '88px',
      paddingTop: '16px',
      paddingBottom: '16px',
      marginTop: '0px',
      marginBottom: '0px'
    });
    const config = slideMonit(node);
    expect(config.duration).toBe(380);
    const css0 = frame(config.css!, 0);
    expect(css0).toContain('min-height: 0');
    expect(css0).toContain('height: 0px');
    expect(css0).toContain('padding-top: 0px');
    expect(css0).toContain('opacity: 0');
    expect(css0).toContain('transform: translateY(-10px)');

    const css1 = frame(config.css!, 1);
    expect(css1).toContain('height: 88px');
    expect(css1).toContain('padding-top: 16px');
    expect(css1).toContain('opacity: 1');
    expect(css1).toContain('transform: translateY(0px)');
  });

  it('cuts instantly under reduced motion', () => {
    stubDocument(true);
    const config = slideMonit(node);
    expect(config.duration).toBe(0);
    expect(config.css).toBeUndefined();
  });

  it('cuts instantly when skip is passed', () => {
    stubDocument();
    const config = slideMonit(node, { skip: true });
    expect(config.duration).toBe(0);
    expect(config.css).toBeUndefined();
  });
});

