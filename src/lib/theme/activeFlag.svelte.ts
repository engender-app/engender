/* The active flag, published once by whoever decides which flag is active.

   Everything the flag is used for - the sun's rings, a section's colour, the
   bar under a tile's number - is read off `--motif-stripes` and the theme's
   own ground tokens, because palettes.css is the one place the 16 flags are
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

   Unlocked screens use the active flag regardless of launcher identity. */

import { parseMotifStripes } from '$lib/motion/flagSun';
import { flagField, readFlagFill, readFlagRoles, type FlagField, type Role } from './roles';

export const activeFlag = $state<{
  palette: string | undefined;
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
      rule 3). Also published on `<html>` as
      `--field` and `--field-ink`, so a stylesheet can paint the field
      without a component reading the stripes for itself; ticket 23 is
      what paints it. */
  field: FlagField | undefined;
}>({ palette: undefined, stripes: [], dark: true, roles: [], fill: 'none', field: undefined });

function publishField(doc: Document, field: FlagField | undefined): void {
  const style = doc.documentElement.style;
  style.setProperty('--field', field?.hex ?? 'var(--surface-2)');
  style.setProperty('--field-ink', field?.ink ?? 'var(--text)');
}

/** Re-read the flag after the shell stamps palette and theme on <html>. */
export function refreshActiveFlag(doc: Document = document): void {
  /* Everything below is computed from the document and assigned; nothing
     reads `activeFlag` back. The shell calls this from the effect that stamps
     the palette, so a read of a field this function writes would make that
     effect depend on its own output and loop until Svelte gives up
     (effect_update_depth_exceeded, and the app never boots) - which is
     exactly what `flagField(activeFlag.stripes, ...)` did on 2026-09-07. */
  const stripes = parseMotifStripes(
    getComputedStyle(doc.documentElement).getPropertyValue('--motif-stripes')
  );
  const palette = doc.documentElement.dataset.palette;
  const dark = doc.documentElement.dataset.theme === 'dark';
  const field = flagField(stripes, palette, dark);
  activeFlag.palette = palette;
  activeFlag.stripes = stripes;
  activeFlag.dark = dark;
  // readFlagRoles/readFlagFill own the ground list and the stripe read; a
  // second copy of either here is a second thing to keep in step.
  activeFlag.roles = readFlagRoles(doc);
  activeFlag.fill = readFlagFill(doc);
  activeFlag.field = field;
  publishField(doc, field);
}
