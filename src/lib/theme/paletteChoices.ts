/* Palette choices shared by onboarding and Settings, in picker order. */
import { m } from '$lib/paraglide/messages';

export const PALETTES: [string, () => string][] = [
    ['trans', m.palette_trans],
    ['nonbinary', m.palette_nonbinary],
    ['genderfluid', m.palette_genderfluid],
    ['bisexual', m.palette_bisexual],
    ['lesbian', m.palette_lesbian],
    ['pansexual', m.palette_pansexual],
    ['rainbow', m.palette_rainbow],
    ['agender', m.palette_agender],
    ['gaymen', m.palette_gaymen],
    ['genderqueer', m.palette_genderqueer],
    ['intersex', m.palette_intersex],
    ['asexual', m.palette_asexual],
    ['demiboy', m.palette_demiboy],
    ['demigirl', m.palette_demigirl],
    ['trigender', m.palette_trigender],
    ['polish', m.palette_polish]
  ];
