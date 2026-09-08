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
const BLIND = '[data-field-blind]';
const PART = '[data-field-part]';
const RING = '[data-flag-sun] > i';

/** The blind itself, which is one object on both sides of a navigation. */
const BLIND_NAME = 'blind';

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
export function carryBlind(doc: Document = document): BlindCarry {
  const root = doc.documentElement;
  const before = name(doc, 'a');
  let after: Side | null = null;

  return {
    swap() {
      release(before);
      after = name(doc, 'b', before);
      const settle = blindSettle({ from: before.height, to: after.height });
      root.style.setProperty('--blind-from', `${before.height}px`);
      root.style.setProperty('--blind-to', `${after.height}px`);
      /* What the incoming content starts offset by, so it arrives with the
         edge rather than waiting under it: positive where the blind is
         closing, since the content starts where the taller field's edge
         was and travels up to its own place. */
      root.style.setProperty('--blind-delta', `${before.height - after.height}px`);
      root.style.setProperty('--blind-ease', settle.easing);
    },
    release() {
      release(before);
      if (after) release(after);
      for (const property of ['--blind-from', '--blind-to', '--blind-delta', '--blind-ease']) {
        root.style.removeProperty(property);
      }
    }
  };
}

/** Names one side's field and measures it. `skip` is the side already
    named, which can still be in the DOM when the incoming one is looked
    for. */
function name(doc: Document, side: 'a' | 'b', skip?: Side): Side {
  const fields = [...doc.querySelectorAll<HTMLElement>(FIELD)];
  const field = skip ? fields.find((el) => !skip.named.includes(el)) : fields[0];
  if (!field) return { height: 0, named: [] };

  const named: HTMLElement[] = [field];
  const take = (el: HTMLElement | null, as: string) => {
    if (!el) return;
    el.style.viewTransitionName = as;
    named.push(el);
  };

  /* The field itself is not named - only what is painted on it. Its box is
     the measurement, and the blind is what stands in for its paint. */
  take(field.querySelector<HTMLElement>(BLIND), BLIND_NAME);
  field.querySelectorAll<HTMLElement>(PART).forEach((el, i) => take(el, `fp-${side}-${i}`));
  field.querySelectorAll<HTMLElement>(RING).forEach((el, i) => take(el, `sun-${side}-${i}`));

  return { height: field.getBoundingClientRect().height, named };
}

function release(side: Side) {
  for (const el of side.named) el.style.viewTransitionName = '';
}
