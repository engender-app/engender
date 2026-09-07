import { afterEach, describe, expect, it } from 'vitest';
import type { TransitionConfig } from 'svelte/transition';

import {
  collapse,
  crossfade,
  disclose,
  markScreenArrival,
  markSlotReplacement,
  resize,
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

/** A node that knows how wide it is, which is all the crossfade asks of one. */
const measured = (width: number) => ({ getBoundingClientRect: () => ({ width }) }) as unknown as Element;

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

    markScreenArrival();
    const asked = both as (o: { direction: 'in' | 'out' }) => TransitionConfig;
    expect(asked({ direction: 'in' }).duration).toBe(0);
    expect(asked({ direction: 'out' }).duration).toBe(380);
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
    markSlotReplacement({ top: 300, left: 20, width: 160, height: 100 });
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
    markSlotReplacement({ top: 300, left: 20, width: 160, height: 100 });
    const arriving = collapse(panel({ beside: [[0, 100]] }), undefined, { direction: 'in' });
    expect(arriving.duration).toBe(380);
    expect(frame(arriving.css!, 0)).toBe('opacity: 0');
    expect(frame(arriving.css!, 1)).toBe('opacity: 1');
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
    markSlotReplacement({ top: 0, left: 0, width: 10, height: 10 }, performance.now() - 400);
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

  /* Leaving is never suppressed: a panel dismissed during the arrival window
     was dismissed by somebody, which is a change however early it lands. */
  it('still collapses on the way out during the arrival window', () => {
    const node = panel({ beside: [[0, 100]] });
    markScreenArrival();
    expect(collapse(node, undefined, { direction: 'out' }).duration).toBe(380);
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
     `.screen` is position:relative, which is what this resolves against. */
  it('takes the placeholder out of the flow so nothing under it jumps', () => {
    stubDocument(false, true, {});
    const { css } = crossfade(measured(240));
    expect(frame(css!, 0.5)).toContain('position: absolute');
  });

  /* Pinned to the node's own width: an absolutely positioned box with no
     width shrinks to fit, so the placeholder would narrow on its first
     frame. Vertical placement needs nothing - with no `top` it sits at its
     static position, which is where it already was. */
  it('keeps the width it had, so it does not narrow as it goes', () => {
    stubDocument(false, true, {});
    const { css } = crossfade(measured(240));
    expect(frame(css!, 0.5)).toContain('width: 240px');
  });

  /* Phase 5 ticket 32.16: a positioned element with no z-index still paints
     after normal-flow content in stacking order regardless of DOM order
     (CSS2.1 Appendix E), so the out-of-flow placeholder painted over the
     content it was fading off of for the whole 160ms - a second "appears
     twice" this primitive's own history had already named once, from taking
     the skeleton out of flow without also taking it out of the paint order. */
  it('paints behind the content it is fading off of', () => {
    stubDocument(false, true, {});
    const { css } = crossfade(measured(240));
    expect(frame(css!, 0.5)).toContain('z-index: -1');
  });

  it('removes the placeholder on the spot under reduced motion', () => {
    stubDocument(true, true, {});
    expect(crossfade(measured(240)).duration).toBe(0);
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
