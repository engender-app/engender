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

/* Every box that measures a field, so the blind is one object across every
   navigation the app makes. Setup's own field was missing from this list
   until redesign ticket 33, which meant the outgoing side of setup's
   handover contributed nothing: the blind opened from no height at all
   while setup's field crossfaded away inside the screen's snapshot, so what
   a person saw at the end of ten steps was one field fading out and another
   appearing. Alicja, on the ticket's own renders: "the field must always
   stay a single object that transitions to other states only by moving up
   or down".

   The gates joined it the same way one ticket later, and the change they
   need is not only this line: a gate is not a route, so there is no
   navigation for the layout to catch. $lib/motion/appOpening is what runs
   this carry when the secret is accepted. */
const FIELD = '[data-screen-field], [data-home-field], [data-setup-field], [data-gate-field]';
const REGION = '[data-app-scroll-region]';
const BLIND = '[data-field-blind]';
const PART = '[data-field-part]';
const RING = '[data-flag-sun] > i';

/** The blind itself, which is one object on both sides of a navigation. */
const BLIND_NAME = 'blind';

/** The field, named only to contain what is painted on it (ticket 99 round
    2's real fix, not the cap below it): `view-transition-group: contain`
    plus `overflow: clip` on `::view-transition-group-children(field)`
    (components.css) is Chrome's own answer to a promoted child ignoring
    its ancestor's overflow: hidden - confirmed against the W3C spec and
    Chrome's own docs, which name this exact symptom ("becomes unbounded
    and can freely move across the entire viewport"), shipped stable since
    Chrome 140. The field's own capture is hidden rather than left to
    crossfade (components.css again): naming it for containment must not
    reintroduce the whole-field photograph ticket 25 split this file apart
    to stop ("the smear"). */
const FIELD_NAME = 'field';

/** A capture bound generous enough for every real field's height, not a
    measurement of any one of them - see the comment where it is used.
    Home's is the tallest measured (239px, ticket 99's own traces); 260
    leaves a 21px margin rather than the 161px the first attempt at this
    left, which at this phone's 2.625 device pixel ratio was itself most
    of the glitch's visible height (Alicja, round four: "now about 50%",
    a match for 400px's own footprint, not a smaller residual bug). */
const BLIND_CAPTURE_MAX = 260;

/** How far a thing painted on the field travels as it leaves or arrives, on
    top of the ride it takes with the blind. Under the field's own 16px of
    bottom padding, so an element travelling towards the edge cannot reach
    it: nothing painted on the blind ever sticks out of it (Alicja, round
    one, 2026-09-09).

    Exported because `fieldPart` in navigation.ts writes the same distance as
    a var() fallback, for the frame before this module has published one -
    and a second literal there would be a second source of truth for one
    number. */
export const PART_TRAVEL = 12;

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
  /* Published here, not only in swap() (Alicja, 2026-09-10, on a phone
     recording, two rounds: "the field completely glitches out ... for 1-2
     frames", then "the field teleporting up at the end of the
     transition"). The browser captures the outgoing side, and the
     blind-slide animation attaches to it, the instant startViewTransition
     is called - which is before swap() ever runs, since that only fires
     once the incoming screen has mounted. Until now that left
     --blind-from unset for that whole window, so blind-slide's own
     fallback (var(--blind-from, 0px)) played the outgoing side's "from"
     keyframe as fully clipped away rather than as its real height - the
     glitch - until swap() corrected it a moment later, which is the
     teleport: the animation's start suddenly moving out from under it.
     --blind-to is set to the same value rather than left unset for the
     same reason; swap() overwrites both the instant it knows the real
     pair. */
  root.style.setProperty('--blind-from', `${before.height}px`);
  root.style.setProperty('--blind-to', `${before.height}px`);
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

/** The five a moving edge publishes. Exported so whoever publishes them can
    also give them back: a navigation's carry does it in `release`, and
    setup's own action does it when the screen is destroyed. */
export const VARIABLES = [
  '--blind-from',
  '--blind-to',
  '--blind-delta',
  '--blind-ease',
  '--part-travel'
];

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
  /* Nested under the field's own group (`contain`, set below) rather than
     becoming an independent root-level group, only where that is what the
     name is FOR: the blind and the sun's rings are each larger than what
     is ever visible of them at rest, so their capture needs a clipping
     ancestor or it escapes it (`FIELD_NAME`'s own comment). A field-part
     has no such excess - it is exactly its own visible text or icon, named
     only so it can fade on its own clock apart from its neighbour - and
     nesting it added a second ancestor between it and the root for no
     reason this bug ever needed, which is what carried the ghost: Home's
     wordmark still fading out, visible through the incoming screen,
     reported straight after this fix on a recording of Home to a new
     entry (Alicja, 2026-09-10, round five). `nearest` finds whichever
     named ancestor is closest, so callers that do want it never have to
     know the field's own name or that it changed hands mid-navigation. */
  const take = (el: HTMLElement | null, as: string, nest = false) => {
    if (!el) return;
    el.style.viewTransitionName = as;
    if (nest) el.style.setProperty('view-transition-group', 'nearest');
    named.push(el);
  };

  /* The field's own paint is still not named - only what is painted on it,
     for the same reason as ever: its box is the measurement, and the blind
     is what stands in for its paint. What IS named now is the field as a
     bare container, solely so its overflow: hidden survives its children
     being promoted (see FIELD_NAME's own comment) - `components.css` hides
     its own crossfade so this never becomes a second whole-field
     photograph.

     A collapsed header's blind is left out, along with a scrolled screen's
     above, and that is what keeps the
     blind moving up and down and nowhere else. A collapsed field drops the
     bleed that takes every other field out to the window's edges, so its
     blind is 350px wide starting 20px in; the group holds one box for both
     sides, so naming it made the whole blind jump 20px right for the length
     of the navigation (Alicja, round one). A screen with no field has
     nothing to contribute to the blind anyway - the other side's blind is
     the one that moves, and it closes to nothing. */
  if (height > 0) {
    field.style.viewTransitionName = FIELD_NAME;
    field.style.setProperty('view-transition-group', 'contain');
    const blind = field.querySelector<HTMLElement>(BLIND);
    /* Capped, not clipped to this side's own height (Alicja, 2026-09-10, a
       third round, on a fresh recording: "it first yanks and takes up the
       whole screen, then it yanks back to its target state"). The capture
       is a screenshot of the element alone, ancestor overflow: hidden not
       included, and the blind is a window tall so the slide has real pixel
       data to reveal as it grows - which a first attempt at this fix broke
       by clipping each side to its own rest height, starving the reveal on
       whichever side turns out to be the shorter of the two. Which side
       that is is not yet known here: `before` is measured and captured
       long before `after` ever is, so there is no max(before, after) to
       clip to at this point, only a bound generous enough for every real
       field in the app - the tallest measured (Home's, ticket 99's own
       traces) is 239px, and reduced-height clamps below 360px scale it
       down further, never up. Nowhere near "the whole screen" is the only
       property this needs. */
    if (blind) blind.style.clipPath = `inset(0 0 calc(100vh - ${BLIND_CAPTURE_MAX}px) 0 round 0 0 var(--r-block) var(--r-block))`;
    take(blind, BLIND_NAME, true);
  }
  field.querySelectorAll<HTMLElement>(PART).forEach((el, i) => take(el, `fp-${side}-${i}`));
  if (!options.holdSun) {
    field.querySelectorAll<HTMLElement>(RING).forEach((el, i) => take(el, `sun-${side}-${i}`, true));
  }

  return { height, named };
}

function release(side: Side) {
  for (const el of side.named) {
    el.style.viewTransitionName = '';
    el.style.removeProperty('view-transition-group');
    if (el.style.clipPath) el.style.clipPath = '';
  }
}
