/* The active flag, published once by whoever decides which flag is active.

   Everything the flag is used for - the sun's rings, a section's colour, the
   bar under a tile's number - is read off `--motif-stripes` and the theme's
   own ground tokens, because palettes.css is the one place the 8 flags are
   written down and a parallel table in TypeScript would be a second thing to
   keep in step (ADR-0035's motif, and $lib/theme/roles.ts). That read is
   right; where to make it was not.

   The trap is the timing. `data-palette` and `data-theme` are stamped on
   <html> by +layout.svelte, from the preferences, and on a cold start the
   preferences arrive from SQLite after boot (ADR-0009) - app.html's pre-paint
   script stamps whatever the localStorage mirror held, which can be a palette
   ago. Anything that reads the stripes for itself at mount is racing that,
   and losing the race is silent: the screen is simply drawn in the previous
   flag's colours, with nothing on fire.

   Both readers had that bug. FlagSun read its stripes in onMount, so
   changing the palette in Settings and walking back to Home drew the old
   flag's sun until the app was restarted. Home's section colours had the
   same shape of problem the day they were added.

   So the shell publishes and everything else reads. +layout.svelte calls
   refresh() as the last thing in the effect that stamps the two attributes,
   which makes the order impossible to get wrong rather than merely right
   today, and a screen or a component that wants the flag reads it from here
   and needs to know nothing about when the palette settled.

   And it is where disguise is answered, once. ADR-0035 gates the sun on
   `prefs.disguise` because "a blurred wash was deniable at a glance, a crisp
   flag is not". The section roles are the same argument a step further on:
   they are the flag's stripes in the flag's own order, painted down a whole
   screen - the week's cells, the day bars, the tiles, the icon discs. On the
   trans palette that is a blue strip over pink tiles over blue day bars,
   which is not a notes app. Under disguise there is no flag to publish, so
   every surface falls back to --accent and the screen looks the way every
   screen in the app looked before the roles existed: one colour, not a
   sequence. Home still gates the sun on the preference itself, which is
   belt and braces on a safety feature rather than a duplicate check. */

import { parseMotifStripes } from '$lib/motion/flagSun';
import { flagField, readFlagFill, readFlagRoles, type FlagField, type Role } from './roles';

export const activeFlag = $state<{
  /** `--motif-stripes` in stripe order, exactly as the palette writes it. */
  stripes: string[];
  /** The resolved theme, not the preference: `system` has already been
      answered by the time the shell stamps it. */
  dark: boolean;
  /** One per de-duplicated stripe, colours before shades. */
  roles: Role[];
  /** The whole flag as one CSS fill. */
  fill: string;
  /** The door's field: the flag's second colour and its ink (phase 10,
      rule 3), or nothing under disguise. Also published on `<html>` as
      `--field` and `--field-ink`, so a stylesheet can paint the field
      without a component reading the stripes for itself; ticket 23 is
      what paints it. */
  field: FlagField | undefined;
}>({ stripes: [], dark: true, roles: [], fill: 'none', field: undefined });

/** Under disguise the field falls to the page's own second surface and its
    ink to the text colour (DIRECTION.md rule 3), so a screen that paints
    `--field` shows a grey header rather than a flag colour. */
function publishField(doc: Document, field: FlagField | undefined): void {
  const style = doc.documentElement.style;
  style.setProperty('--field', field?.hex ?? 'var(--surface-2)');
  style.setProperty('--field-ink', field?.ink ?? 'var(--text)');
}

/** Re-read the flag from the document. Called from the shell, right after the
    palette and the theme land on <html>.

    `disguised` empties it rather than dimming it: the reading is the same one
    ADR-0035 makes about the sun, and someone who has turned disguise on has
    already said what they want. */
export function refreshActiveFlag(doc: Document = document, disguised = false): void {
  if (disguised) {
    activeFlag.stripes = [];
    activeFlag.roles = [];
    activeFlag.fill = 'none';
    activeFlag.field = undefined;
    activeFlag.dark = doc.documentElement.dataset.theme === 'dark';
    publishField(doc, undefined);
    return;
  }

  activeFlag.stripes = parseMotifStripes(
    getComputedStyle(doc.documentElement).getPropertyValue('--motif-stripes')
  );
  activeFlag.dark = doc.documentElement.dataset.theme === 'dark';
  // readFlagRoles/readFlagFill own the ground list and the stripe read; a
  // second copy of either here is a second thing to keep in step.
  activeFlag.roles = readFlagRoles(doc);
  activeFlag.fill = readFlagFill(doc);
  activeFlag.field = flagField(activeFlag.stripes, doc.documentElement.dataset.palette);
  publishField(doc, activeFlag.field);
}
