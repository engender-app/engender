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
   and needs to know nothing about when the palette settled. */

import { parseMotifStripes } from '$lib/motion/flagSun';
import { flagFill, flagRoles, type Role } from './roles';

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
}>({ stripes: [], dark: true, roles: [], fill: 'none' });

/** Re-read the flag from the document. Called from the shell, right after the
    palette and the theme land on <html>. */
export function refreshActiveFlag(doc: Document = document): void {
  const style = getComputedStyle(doc.documentElement);
  const read = (token: string) => style.getPropertyValue(token).trim();
  const stripes = parseMotifStripes(read('--motif-stripes'));

  activeFlag.stripes = stripes;
  activeFlag.dark = doc.documentElement.dataset.theme === 'dark';
  /* Every ground a role can land on: the page and both card surfaces. The
     same list readFlagRoles() uses - passed explicitly here because the
     stripes have already been read and reading them twice would be the one
     thing this module exists to stop. */
  activeFlag.roles = flagRoles(stripes, read('--text'), [
    read('--bg'),
    read('--surface'),
    read('--surface-2')
  ]);
  activeFlag.fill = flagFill(stripes);
}
