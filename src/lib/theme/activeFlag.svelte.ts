/* palettes.css owns the 16 flags. Read --motif-stripes and the ground tokens
   from the active theme. Before SQLite preferences attach,
   app.html paints from the localStorage mirror, which can hold the previous
   palette (ADR-0009).

   +layout.svelte publishes refresh() after stamping data-palette and
   data-theme. Consumers read the published flag, so a mount cannot race
   preference loading or keep stale colours after a Settings change. Unlocked
   screens use this flag regardless of launcher identity. */

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
  /** The door's field: the flag's second colour and its ink. Also published on `<html>` as
      `--field` and `--field-ink`, so a stylesheet can paint the field without a component
      reading the stripes for itself; is what paints it. */
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
