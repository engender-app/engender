/* The field is the shared element between the four doors (phase 10 rule
   10, redesign ticket 25; ADR-0078).

   Every door wears a field - Today's with the sun, the other three from
   ScreenHeader - and a tab change is one object changing its label. So for
   the fade-through, and only for it, the field is pulled out of the
   screen's snapshot under its own view-transition-name: the browser tweens
   its box between the two doors and crossfades what is on it, while the
   screens fade through behind it at 0.97 and 1.03 (app.css). A step into a
   detail is a sequence, and its field travels with its screen on the
   shared axis.

   Script rather than a stylesheet rule, and the reason is a measurement.
   `html[data-nav='fade-through'] .screen-field { view-transition-name:
   field }` names the field on both sides in one line, and it aborted the
   transition on three of the four door changes: when the new side is
   captured the outgoing screen is still in the DOM finishing its outros,
   so the rule named two elements at once and Chromium refused ("Unexpected
   duplicate view-transition-name: field"), which cut the whole navigation
   to nothing. The name has to be handed over: the outgoing field wears it
   for the old capture, gives it up the moment the new screen has mounted,
   and the incoming field takes it before the new capture. Held to that
   order by sharedField.test.ts.

   Inline style rather than a class, since a class would need a rule and
   the rule is what could not tell the two apart. Released when the
   transition finishes: a view-transition-name makes its element a stacking
   context, and a field that stayed one would trap every z-index inside its
   screen (the shell already learnt this once, on .app-main). */

const FIELD = '[data-screen-field], [data-home-field]';
const NAME = 'field';

export interface FieldCarry {
  /** After the incoming screen has mounted, before it is captured. */
  swap(): void;
  /** Once the transition has finished, either way. */
  release(): void;
}

/** Names the door's field for one fade-through. Null where the screen
    leaving has no field to carry. */
export function shareField(doc: Document = document): FieldCarry | null {
  const fields = () => [...doc.querySelectorAll<HTMLElement>(FIELD)];
  const before = fields()[0];
  if (!before) return null;
  before.style.viewTransitionName = NAME;
  let after: HTMLElement | undefined;
  return {
    swap() {
      before.style.viewTransitionName = '';
      after = fields().find((el) => el !== before);
      if (after) after.style.viewTransitionName = NAME;
    },
    release() {
      before.style.viewTransitionName = '';
      if (after) after.style.viewTransitionName = '';
    }
  };
}
