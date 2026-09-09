/* The field as a blind over the content (redesign ticket 28).

   Ticket 25 made the field the shared element between the doors: one name
   on both sides, so the browser tweened its box between the two heights and
   crossfaded what was on it. That crossfade is a photograph of the whole
   field, contents included, stretched between two heights - the smear
   Alicja named at frame 5 of Journal to Look back (2026-09-08).

   So the card is split in two. Its paint is a flat block that carries one
   name across every screen and never has anything drawn on it, which is
   what lets the edge move without deforming a corner: the block itself is a
   window tall and its bottom edge is a clip, so what animates is where the
   clip is rather than how big the picture is. Everything painted on the
   field - title, wordmark, month strip, icon controls, search box, back
   control, actions - is named per side, `fp-a-*` leaving and `fp-b-*`
   arriving, so no element can pair with one on the other screen: the
   browser has an old with no new and a new with no old, fades each on its
   own, and nothing morphs into anything.

   The sun's rings are named one by one for the same reason. A ring inside
   the screen's own snapshot can only fade with it; a ring with a name of
   its own can close, and the stylesheet closes them outermost first.

   Script rather than a stylesheet rule, and the reason is ticket 25's
   measurement: `[data-field-blind] { view-transition-name: blind }` names
   both blinds at the new capture, because the outgoing screen is still in
   the DOM finishing its outros, and Chromium refuses a duplicate name by
   aborting the whole transition. The name is handed over instead - the
   outgoing side wears it for the old capture, gives it up once the new
   screen has mounted, and the incoming side takes it before the new
   capture. Held to that order by fieldBlind.test.ts.

   Inline styles rather than classes, since a class needs a rule and a rule
   is what cannot tell the two sides apart. All of them are released when
   the transition finishes: a view-transition-name makes its element a
   stacking context, and a field that stayed one would trap every z-index
   inside its screen. */

import { blindSettle } from './blindSettle';

const FIELD = '[data-screen-field], [data-home-field]';
const REGION = '[data-app-scroll-region]';
const BLIND = '[data-field-blind]';
const PART = '[data-field-part]';
const RING = '[data-flag-sun] > i';

/** The blind itself, which is one object on both sides of a navigation. */
const BLIND_NAME = 'blind';

/** How far a thing painted on the field travels as it leaves or arrives, on
    top of the ride it takes with the blind. Under the field's own 16px of
    bottom padding, so an element travelling towards the edge cannot reach
    it: nothing painted on the blind ever sticks out of it (Alicja, round
    one, 2026-09-09). */
const PART_TRAVEL = 12;

/* Which carry owns the variables on the root. A navigation superseded by
   another leaves its own `release` to run late, and a late release used to
   take the newer navigation's numbers off the root with it - which leaves
   the blind's clip reading its own fallbacks, `inset(0 0 100vh 0)`, and the
   field simply absent for the length of the transition. Only the carry that
   published them may remove them. */
let current: BlindCarry | null = null;

export interface CarryOptions {
  /** The one navigation where the sun is the same object at the same size on
      both sides, and so must not be drawn twice.

      Setup's finish (redesign ticket 33): the sun has grown one step's worth
      per step and arrives at exactly the scale Home draws it at, which is
      what rule 12 means by "one object at one size rather than two suns".
      Named per side, its rings would close outermost-first and open again
      outermost-first, which is the app's own mark flickering at the moment
      the app opens. Left unnamed they stay inside each screen's snapshot and
      crossfade with it, and two identical images crossfading is a sun
      standing still while the field closes around it. */
  holdSun?: boolean;
}

export interface BlindCarry {
  /** After the incoming screen has mounted, before it is captured. */
  swap(): void;
  /** Once the transition has finished, either way. */
  release(): void;
}

interface Side {
  height: number;
  named: HTMLElement[];
}

/**
 * Names one navigation's blind, the elements painted on it and the sun's
 * rings, and publishes what the stylesheet needs to move them.
 *
 * Call before `startViewTransition`, `swap()` inside the update callback
 * once the outgoing screen is gone, and `release()` when the transition
 * settles. Never returns null: a screen with no field is the blind's limit
 * case - closed to nothing - and the other side still has an edge to move.
 */
export function carryBlind(doc: Document = document, options: CarryOptions = {}): BlindCarry {
  const root = doc.documentElement;
  const before = name(doc, 'a', undefined, options);
  let after: Side | null = null;

  const carry: BlindCarry = {
    swap() {
      release(before);
      after = name(doc, 'b', before, options);
      for (const [property, value] of Object.entries(
        blindVariables({ from: before.height, to: after.height })
      )) {
        root.style.setProperty(property, value);
      }
      current = carry;
    },
    release() {
      release(before);
      if (after) release(after);
      if (current !== carry) return;
      current = null;
      for (const property of VARIABLES) root.style.removeProperty(property);
    }
  };

  return carry;
}

const VARIABLES = ['--blind-from', '--blind-to', '--blind-delta', '--blind-ease', '--part-travel'];

/**
 * What one edge moving from `from` to `to` is worth, as the five custom
 * properties the stylesheet moves everything with.
 *
 * A navigation publishes them on the root, where a view transition's pseudo
 * elements are the only thing that can read them. Setup's step machine
 * publishes the same five on its own screen element instead (redesign
 * ticket 33): a step change is not a navigation, so it moves real elements
 * rather than photographs of them, and the arithmetic of how far and on
 * which curve is the same question either way. One owner, so the two can
 * never disagree about which way a part travels.
 */
export function blindVariables({
  from,
  to
}: {
  from: number;
  to: number;
}): Record<string, string> {
  const settle = blindSettle({ from, to });
  return {
    '--blind-from': `${from}px`,
    '--blind-to': `${to}px`,
    /* What the incoming content starts offset by, so it arrives with the
       edge rather than waiting under it: positive where the blind is
       closing, since the content starts where the taller field's edge was
       and travels up to its own place. */
    '--blind-delta': `${from - to}px`,
    '--blind-ease': settle.easing,
    /* Which way the things painted on the field leave and arrive: with the
       blind, so on a blind being pulled down the old text drops and the new
       comes from above, and on one being pulled up they both go the other
       way (Alicja, round one). */
    '--part-travel': `${to > from ? PART_TRAVEL : -PART_TRAVEL}px`
  };
}

/** Names one side's field and measures it. `skip` is the side already
    named, which can still be in the DOM when the incoming one is looked
    for. */
function name(doc: Document, side: 'a' | 'b', skip?: Side, options: CarryOptions = {}): Side {
  const fields = [...doc.querySelectorAll<HTMLElement>(FIELD)];
  const field = skip ? fields.find((el) => !skip.named.includes(el)) : fields[0];
  if (!field) return { height: 0, named: [] };

  const named: HTMLElement[] = [field];
  /* A screen that is scrolled has no field where the blind can be: the
     field scrolls away with the page, so its blind sits that far above the
     window, and the group holds one box for both sides. Named, it dragged
     the whole blind off-screen and the field simply vanished for the length
     of the navigation - a deep push out of a scrolled hub and back is the
     everyday way to hit it, and it is what Alicja saw on deep-back (round
     one). So a scrolled side contributes nothing and the other side's blind
     closes to nothing, which is what that screen actually shows. Measured
     after the scroll is restored, which is why swap() runs last. */
  const scrolled = (doc.querySelector(REGION)?.scrollTop ?? 0) > 1;
  const height = scrolled ? 0 : field.getBoundingClientRect().height;
  const take = (el: HTMLElement | null, as: string) => {
    if (!el) return;
    el.style.viewTransitionName = as;
    named.push(el);
  };

  /* The field itself is not named - only what is painted on it. Its box is
     the measurement, and the blind is what stands in for its paint.

     A collapsed header's blind is left out, along with a scrolled screen's
     above, and that is what keeps the
     blind moving up and down and nowhere else. A collapsed field drops the
     bleed that takes every other field out to the window's edges, so its
     blind is 350px wide starting 20px in; the group holds one box for both
     sides, so naming it made the whole blind jump 20px right for the length
     of the navigation (Alicja, round one). A screen with no field has
     nothing to contribute to the blind anyway - the other side's blind is
     the one that moves, and it closes to nothing. */
  if (height > 0) take(field.querySelector<HTMLElement>(BLIND), BLIND_NAME);
  field.querySelectorAll<HTMLElement>(PART).forEach((el, i) => take(el, `fp-${side}-${i}`));
  if (!options.holdSun) {
    field.querySelectorAll<HTMLElement>(RING).forEach((el, i) => take(el, `sun-${side}-${i}`));
  }

  return { height, named };
}

function release(side: Side) {
  for (const el of side.named) el.style.viewTransitionName = '';
}
