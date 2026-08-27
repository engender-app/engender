/* The eight built-in palettes' keys, in the order the app presents them
   (ticket 06): every gallery script and node-tier test that needs to
   iterate "every palette" declared this same array by hand, independently -
   12 copies, nothing keeping them in the same order. Plain and dependency-
   free, so both the `.mjs` galleries (no bundler, no Svelte plugin) and the
   node tier (ADR-0016: no $lib or paraglide import) can read it. */
export const PALETTES = [
  'trans',
  'nonbinary',
  'genderfluid',
  'bisexual',
  'lesbian',
  'pansexual',
  'rainbow',
  'agender'
];
