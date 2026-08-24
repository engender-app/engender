/* Section colour, from the flag (DIRECTION.md's "Flag colour reaches the
   whole app, categorically"). Each area of a screen takes one stripe of the
   active flag as its own colour - the icon disc, the day bar, the tile -
   and the assignment is categorical, never ordinal, so colour still judges
   nothing (ADR-0012).

   Two things have to happen to a stripe list before a screen can use it.

   It is de-duplicated: trans reads blue/pink/white/pink/blue, which is
   three roles rather than five, and a screen handed the raw list would give
   two of its areas the same colour while believing they differed.

   And each stripe gets an ink: the version of itself that can carry a
   label. A flag has a white band and a near-black one, and each of those is
   invisible against one of the two themes. The ink moves the stripe's
   lightness until it clears 4.5:1 on every surface it can land on, and
   moves nothing else, so a red stripe inks to a darker or lighter red
   rather than to a pink. Mixing toward --text was the first attempt and it
   desaturates on the way: on the dark theme every stripe came out a pastel
   of itself, which loses the one thing decision 1 is about.

   The CSS in kit.css derives an ink of its own from --role alone, for a
   surface handed a bare stripe with no theme to read. That fallback is a
   mix toward --text and does wash the colour out; it is a floor rather than
   the intended path, and tests/kit-roles.test.ts holds both to 4.5:1. */

import { colorMixOklab, contrast, lightnessOf, withLightness } from './colour';

export interface Role {
  /** The flag's own stripe, unchanged. */
  stripe: string;
  /** The stripe as a label colour on this theme. */
  ink: string;
}

/** The contrast floor an ink is pushed to: WCAG AA for body text, which is
    the strictest thing a role is used for (a 12px day bar). */
const FLOOR = 4.5;

/** How much of the ink kit.css mixes into a surface for the two fills a
    role paints behind itself - the icon disc, and the wash under a pressed
    row. Declared here rather than only in the CSS because the ink has to
    clear the floor against the fills it causes, which is circular until one
    side owns the number. tests/kit-roles.test.ts holds kit.css to these. */
export const ROLE_TINT_PCT = 15;
export const ROLE_WASH_PCT = 12;

/** `--motif-stripes` in stripe order, minus repeats.

    Bisexual's list doubles its outer stops (`#D60270, #D60270, ...`) to
    encode its 2:1:2 proportions, and every symmetric flag repeats its
    stripes around the middle. Both collapse to the colours the flag
    actually has, in the order they are first seen, so role 1 is always the
    outermost stripe. */
export function stripeRoles(stripes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const stripe of stripes) {
    const key = stripe.trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(stripe.trim());
  }
  return out;
}

/** The nearest lightness of `stripe` that clears the contrast floor against
    every ground it can sit on.

    Direction comes from the theme rather than from a flag: on a light theme
    every ground is light, so the ink goes down, and on a dark theme it goes
    up. Stepping in 0.01 of OKLab lightness stops at the first value that
    passes, which is what keeps the ink as close to the flag as legibility
    allows - agender's near-black stripe on the dark theme lifts just far
    enough to be read and no further.

    Where no lightness of the stripe clears the floor, the theme's own text
    colour is the answer: an area with no colour reads as an area with no
    colour, which is worse than the flag and better than a label nobody can
    read. */
export function legibleInk(stripe: string, text: string, grounds: string[]): string {
  /* Each ground three times: as itself, and under each of the two fills
     the ink paints behind itself. A role writes on the page and on a card,
     and it also writes on the disc it tints and over the row it washes -
     both of which are that same surface pulled a little way toward the ink,
     and so a little way toward the ink's own lightness. */
  const passes = (candidate: string) =>
    grounds.every((g) =>
      [g, colorMixOklab(candidate, ROLE_TINT_PCT, g), colorMixOklab(candidate, ROLE_WASH_PCT, g)].every(
        (ground) => contrast(candidate, ground) >= FLOOR
      )
    );
  if (passes(stripe)) return stripe;

  const towardDark = lightnessOf(text) < 0.5;
  const start = lightnessOf(stripe);
  for (let step = 1; step <= 100; step++) {
    const l = towardDark ? start - step / 100 : start + step / 100;
    if (l < 0 || l > 1) break;
    const candidate = withLightness(stripe, l);
    if (passes(candidate)) return candidate;
  }

  return text;
}

/** The active flag's stripes as the roles a screen hands its areas. */
export function flagRoles(stripes: string[], text: string, grounds: string[]): Role[] {
  return stripeRoles(stripes).map((stripe) => ({
    stripe,
    ink: legibleInk(stripe, text, grounds)
  }));
}

/** The role for the nth area of a screen, wrapping where a screen has more
    areas than the flag has stripes. Pansexual has three; the More hub has
    more groups than that, and the alternative to wrapping is areas with no
    colour at all. */
export function roleAt(roles: Role[], index: number): Role | undefined {
  if (roles.length === 0) return undefined;
  return roles[index % roles.length];
}

/** The roles for whatever palette and theme the document is currently in.

    Read off the DOM rather than from a parallel table in TypeScript, the
    way FlagSun reads the same token: palettes.css is the one place the 8
    flags are written down, and a second copy is a second thing to keep in
    step. Call it on mount and again when the palette or the theme changes;
    both of those already remount or restyle the screen around it. */
export function readFlagRoles(doc: Document = document): Role[] {
  const style = getComputedStyle(doc.documentElement);
  const read = (token: string) => style.getPropertyValue(token).trim();
  const stripes = read('--motif-stripes')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Every ground a role can land on: the page, both card surfaces.
  return flagRoles(stripes, read('--text'), [read('--bg'), read('--surface'), read('--surface-2')]);
}
