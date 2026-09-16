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

import { chromaOf, colorMixOklab, contrast, lightnessOf, withLightness } from './colour';

export interface Role {
  /** The flag's own stripe, unchanged. */
  stripe: string;
  /** The stripe as a small-text colour on this theme: 4.5:1. */
  ink: string;
  /** The stripe as a mark: a chart line, a bar, an icon, a number set at
      display size. 3:1, which is the floor those actually answer to, and
      the difference is what keeps the app looking like the flag rather
      than like a darkened copy of it. */
  mark: string;
  /** The stripe as a mark drawn beside another mark: the stripe itself
      where it is a colour, and the nearest version of it that clears 3:1
      where it is one of the flag's shades.

      A lone mark on a card owes no ratio and takes the stripe exactly - that
      is `--role-draw`, and it is the decision that stopped nonbinary's
      yellow turning olive. It holds because a faint mark is still the only
      mark there: nothing depends on separating it from something else. Two
      chart lines on one plot do (phase 6 ticket 12), and a stripe that
      cannot be seen against the card is not a faint line, it is no line at
      all.

      Only a shade is ever moved. A flag's white band on the light theme and
      its near-black band on the dark theme sit on their own ground; a
      colour, at any lightness, still reads as itself, so trans's pink stays
      pink and rainbow's orange stays orange on both themes. Agender is why
      this exists: its flag holds one colour and three shades, so a second
      line on it lands on #1A1A1A, which on a dark card is the card. */
  paired: string;
  /** The five steps of the heat ramp in this stripe's hue, deepest last.
      A week cell has nothing written on it and a calendar cell has the day
      number, so each step carries the ink that number is written in. */
  heat: HeatStep[];
}

interface HeatStep {
  /** The cell's fill: the stripe at this step's strength, undiluted by any
      contrast floor, the same as every other fill a role paints. */
  fill: string;
  /** What a number written on that fill is drawn in, at 4.5:1 or better. */
  ink: string;
}

/** The two floors a role is held to.

    TEXT is WCAG AA for body text, which the smallest thing a role colours
    answers to - a 12px day bar, a 14px tile title.

    MARK is AA for large text and for non-text graphics, which is what a
    chart line, a bar, an icon glyph and a 32px display number are. Holding
    those to the text floor was the first build's mistake: it darkened every
    bright stripe on the light theme and lightened every dark one on the
    dark theme until the palette stopped reading as the flag it came from.
    Two floors, so a mark stays near its stripe and a label is still
    readable. */
const TEXT_FLOOR = 4.5;
const MARK_FLOOR = 3;

/** How much of the stripe kit.css mixes into a surface for the two fills a
    role paints behind itself - the icon disc, and the wash under a pressed
    row. Declared here rather than only in the CSS because the ink has to
    clear its floor against those fills, and it cannot do that without
    knowing them. tests/kit-roles.test.ts holds kit.css to these. */
/* ROLE_TINT_PCT stays exported only for kit-roles.test.ts, which cross-checks
   against it (AU-09 test-only review). */
export const ROLE_TINT_PCT = 15;
export const ROLE_WASH_PCT = 12;

/** `--motif-stripes` in stripe order, minus repeats.

    Bisexual's list doubles its outer stops (`#D60270, #D60270, ...`) to
    encode its 2:1:2 proportions, and every symmetric flag repeats its
    stripes around the middle. Both collapse to the colours the flag
    actually has, in the order they are first seen, so role 1 is always the
    outermost stripe. */
/* stripeRoles stays exported only for kit-roles.test.ts, which cross-checks
   against it (AU-09 test-only review). */
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
/* legibleInk stays exported only for kit-roles.test.ts, which cross-checks
   against it (AU-09 test-only review). */
export function legibleInk(
  stripe: string,
  text: string,
  grounds: string[],
  floor: number = TEXT_FLOOR
): string {
  /* Each ground three times: as itself, and under each of the two fills a
     role paints behind itself. A role writes on the page and on a card, and
     it also writes on the disc it tints and over the row it washes - both
     of which are that same surface pulled a little way toward the flag's
     own stripe.

     Toward the stripe, not toward the candidate: a fill carries no
     information and sits under nothing that has to be read, so it is the
     flag's colour rather than a version of it adjusted for contrast.
     Adjusting a fill is what turned nonbinary's yellow disc brown - the
     yellow darkened to clear a floor it never owed, and a tint of that is
     mud. */
  const passes = (candidate: string) =>
    grounds.every((g) =>
      [g, colorMixOklab(stripe, ROLE_TINT_PCT, g), colorMixOklab(stripe, ROLE_WASH_PCT, g)].every(
        (ground) => contrast(candidate, ground) >= floor
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

/** The heat ramp's steps, as how much of the stripe is mixed into the
    ground behind the cell. The same five numbers palettes.css writes for
    --heat-0..4 and BareStrip.svelte lists for the week, so a week cell and
    a calendar cell shade one day's reading the same way and only the hue
    differs (ticket 20's review: "a cell here and a calendar cell are the
    same scale in the flag's hue"). */
export const HEAT_STEPS = [0, 22, 45, 70, 100];

/** The one thing a role-hued heat cell needs that the accent ramp got by
    hand. palettes.css pairs every --heat-N with an --on-heat-N, tuned per
    palette and sometimes per theme, because a ramp from the page's own
    surface up to a saturated colour crosses the lightness band where
    neither --text nor its opposite clears 4.5:1. That table is eight
    palettes times two themes; a role-hued ramp is that times however many
    stripes the flag has, which is not a table anybody keeps in step.

    So it is computed, the same way the hand-tuned overrides were reasoned
    about: the theme's own text colour where it clears the floor, and
    otherwise whichever of black and white contrasts more. That second
    branch cannot fail - the two are furthest apart exactly where they are
    equal, and there they are still 4.58:1 - which is what makes the ramp
    safe on a stripe nobody has looked at.

    The fill is never adjusted. A fill answers to no ratio (see legibleInk
    above): it is the number that has to be read, not the cell. */
/* heatRamp stays exported only for kit-roles.test.ts, which cross-checks
   against it (AU-09 test-only review). */
export function heatRamp(stripe: string, text: string, ground: string): HeatStep[] {
  return HEAT_STEPS.map((pct) => {
    const fill = pct === 0 ? ground : pct === 100 ? stripe : colorMixOklab(stripe, pct, ground);
    return { fill, ink: heatInk(fill, text) };
  });
}

function heatInk(fill: string, text: string): string {
  if (contrast(text, fill) >= TEXT_FLOOR) return text;
  return contrast('#FFFFFF', fill) >= contrast('#000000', fill) ? '#FFFFFF' : '#000000';
}

/** Below this a stripe is a shade rather than a colour. The eight flags'
    white, black, near-black and mid-grey bands all sit under it; every hue
    any of them carries sits well above. */
const ACHROMATIC = 0.02;

/** The active flag's stripes as the roles a screen hands its areas, its
    colours first and its shades after them.

    Stripe order is the flag's, and a flag's own order is what the sun on
    Home draws (see $lib/motion/flagSun). A screen is not a flag, though: it
    hands role 1 to its first area, and on trans that would be the white
    band, so the first thing coloured on the screen would be grey. Every
    stripe still gets a turn - the shades follow the colours rather than
    being dropped - which keeps the white band a part of the palette without
    letting it be the first thing anyone sees of it. */
/* flagRoles stays exported only for kit-roles.test.ts, which cross-checks
   against it (AU-09 test-only review). */
export function flagRoles(
  stripes: string[],
  text: string,
  grounds: string[],
  /** The one ground a heat cell sits on, which is narrower than the list
      above: a role writes on the page and on both card surfaces, but the
      ramp's own empty step *is* a surface, so it needs to be told which.
      Defaults to the last of `grounds`, which is where readFlagRoles puts
      it. */
  heatGround: string = grounds[grounds.length - 1]
): Role[] {
  const ordered = [
    ...stripeRoles(stripes).filter((s) => chromaOf(s) >= ACHROMATIC),
    ...stripeRoles(stripes).filter((s) => chromaOf(s) < ACHROMATIC)
  ];
  return ordered.map((stripe) => {
    const mark = legibleInk(stripe, text, grounds, MARK_FLOOR);
    return {
      stripe,
      ink: legibleInk(stripe, text, grounds, TEXT_FLOOR),
      mark,
      paired: chromaOf(stripe) >= ACHROMATIC ? stripe : mark,
      heat: heatRamp(stripe, text, heatGround)
    };
  });
}

/** The role for the nth area of a screen, wrapping where a screen has more
    areas than the flag has stripes. Pansexual has three; the More hub has
    more groups than that, and the alternative to wrapping is areas with no
    colour at all. */
export function roleAt(roles: Role[], index: number): Role | undefined {
  if (roles.length === 0) return undefined;
  return roles[index % roles.length];
}

/** The flag's colours, in the order `flagRoles` put them, with its shades
    dropped rather than moved to the back.

    For the one consumer whose whole surface is the stripe undiluted: a tile
    is a block of `--role-draw` now (phase 10 rule 3), and a block of a shade
    is the page - agender's near-black band is a black rectangle on a
    near-black page, held apart from it by a 1px line and nothing else. A
    chart line or an icon glyph on the same band is faint and still a mark,
    which is why `flagRoles` keeps the shades for everyone else.

    Every flag has at least one colour, so the list is never empty; the
    fallback is there for a palette nobody has written yet. */
export function chromaticRoles(roles: Role[]): Role[] {
  const colours = roles.filter((role) => chromaOf(role.stripe) >= ACHROMATIC);
  return colours.length > 0 ? colours : roles;
}

/** One band of the flag per era, in order, wrapping over the flag's
    colours - and, on a flag with a single colour (agender), over its
    shades too, so a second and third era are drawn in black and grey
    rather than the same green three times (Alicja, on the first Look back
    render: "we can't have all eras in the same colour"). Shared by every
    rail that bands eras (SpanTimeline, MilestoneRail) so the two agree on
    which stripe a given era gets, with `roleAt` doing the wrap-around
    indexing over whatever this returns. */
export function eraBandRoles(roles: Role[]): Role[] {
  const colours = chromaticRoles(roles);
  if (colours.length >= 2) return colours;
  return [...colours, ...roles.filter((role) => !colours.includes(role))];
}

/** The role for the nth area of a screen where that area is drawn as a
    tile: `roleAt` over the colours alone, so the wrap happens inside them
    and an area whose index lands on a shade takes the next colour round
    rather than the shade. */
export function tileRoleAt(roles: Role[], index: number): Role | undefined {
  return roleAt(chromaticRoles(roles), index);
}

/** The stripe the bar under a tight tile's value is drawn in: another band
    of the same flag, picked for being the one that can actually be seen on
    the block it sits on.

    It was the whole flag, the `flagFill` gradient the kit had always drawn
    there - and on a block of one of that flag's own colours the matching
    band disappears into the ground, so trans read as a pink block with a
    pink-and-white bar and rainbow's orange band vanished entirely (Alicja,
    2026-09-07: "instead of a trans colored underline, just pick another
    colour from the flag"). One solid band instead, and the flag's own hex.

    Colours before shades, as everywhere else a role is handed out, and
    within them the highest contrast against the block: on a flag with one
    colour and three shades - agender - there is no second colour to take,
    so the shades are the candidates and its near-black band is what a green
    block gets. */
export function flagBarRole(roles: Role[], on: Role | undefined): Role | undefined {
  if (!on) return undefined;
  const others = roles.filter((role) => role.stripe.toUpperCase() !== on.stripe.toUpperCase());
  const colours = others.filter((role) => chromaOf(role.stripe) >= ACHROMATIC);
  const candidates = colours.length > 0 ? colours : others;
  return candidates.reduce<Role | undefined>(
    (best, role) =>
      !best || contrast(role.stripe, on.stripe) > contrast(best.stripe, on.stripe) ? role : best,
    undefined
  );
}

/** Which stripe each area of Home takes, named rather than written as a
    number at the call site - one of them is not in reading order and the
    reason is the ordering above.

    The week strip takes role 0, the only index guaranteed to be a colour
    on all 8 palettes, because it is the one area on that screen where the
    stripe is a value rather than a decoration: on trans, whose flag yields
    three roles for four areas, reading order handed the strip the white
    band, and a heat ramp from white into a white page is not a ramp.
    Everything else takes its turn as normal.

    Beside `roleAt` rather than in the screen for the same reason
    wrappedDisplay.ts holds WRAPPED_AREA_ROLE: the index is only meaningful
    against the list this module builds, and a table buried in markup is a
    table nobody can check.

    The two tile areas - `liveTiles` and `lookBack` - are resolved through
    `tileRoleAt` rather than `roleAt`, so their index counts the flag's
    colours only. Everything the area holds goes through the same call, tiles
    and the list and the notice beside them, or one area of the screen would
    be drawn in two stripes.

    Phase 10 redesign ticket 13 turned Today around. The week strip and the
    day cards left for the Journal door and keep their indices there; the
    log strip takes the strip's slot on Today, for the strip's own reason -
    its write shapes are icon squares, a block of the stripe with a glyph on
    it, and a square of the flag's white band on a white page is not a
    control. The agenda takes the milestones' old slot (a milestone still
    ahead is one of its rows) and resolves it through `tileRoleAt`, since
    its day blocks are blocks and a block is always a colour; the pinned
    rows take the days' slot through `roleAt`, as the hub's rows do. */
export const HOME_AREA_ROLE = {
  week: 0,
  log: 0,
  liveTiles: 1,
  lookBack: 1,
  agenda: 2,
  days: 3,
  pinned: 3
} as const;

/** The whole flag as one CSS fill: hard-edged bands, left to right, in
    stripe order and in the flag's own proportions.

    A quarter turn from how a flag flies, because of where it is used: the
    bar under a tile's number is wide and short, and a flag's own stripes
    across it would be slivers a pixel tall. Turned, each band is as tall as
    the bar and the count is read along it.

    Hard stops rather than a gradient - it is a flag, not a wash - and built
    from the stripe list at render time, so bisexual's doubled stops keep its
    2:1:2 proportion for free and a ninth palette needs nothing taught here.

    **The colours are the flag's own, exactly.** Nothing here is nudged for a
    theme, unlike the roles above and unlike the sun on Home: those are the
    flag used as a screen's colour, and this is the flag being shown as
    itself. A white band on a light card is faint, and that is what a white
    band is.

    Used where the flag is the material rather than one section's colour -
    the bar under a tile's number. */
export function flagFill(stripes: string[]): string {
  const bands = stripes.map((s) => s.trim()).filter(Boolean);
  if (bands.length === 0) return 'none';
  const step = 100 / bands.length;
  const stops = bands.map(
    (stripe, i) => `${stripe} ${(step * i).toFixed(3)}% ${(step * (i + 1)).toFixed(3)}%`
  );
  return `linear-gradient(to right, ${stops.join(', ')})`;
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
  // Every ground a role can land on: the page, both card surfaces. The heat
  // ramp is handed --surface-2 by name, because that is what palettes.css
  // makes --heat-0 and it is the surface an empty cell has always been.
  return flagRoles(
    readStripes(doc),
    read('--text'),
    [read('--bg'), read('--surface'), read('--surface-2')],
    read('--surface-2')
  );
}

/** The active flag as a fill. Read the same way and at the same time as the
    roles; unlike them it does not depend on the theme, because the flag's
    colours do not. */
export function readFlagFill(doc: Document = document): string {
  return flagFill(readStripes(doc));
}

function readStripes(doc: Document): string[] {
  return getComputedStyle(doc.documentElement)
    .getPropertyValue('--motif-stripes')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The colour a door's field wears, and the ink on it (phase 10 direction,
    rule 3): the flag's second colour - the first inner band of
    `--motif-stripes` that is a colour and differs from the outermost band -
    so bisexual's doubled outer stop is skipped by colour rather than by
    index, and the whole flag stays drawn in the sun with no band stolen. Two
    flags name their own band: the six-stripe rainbow takes its blue rather
    than its orange (Alicja, 2026-09-07, round two), and bisexual takes its
    dark blue rather than its purple (Alicja, 2026-09-07, on ticket 23's
    renders). A flag with no such band falls back to its first colour, then
    to its first stripe; none of the eight needs either.

    The ink is the dark theme's near-black or white, whichever measures
    higher on the hex. Only large text may sit on the field: nonbinary's
    purple carries white at 4.41:1, which clears 3:1 and nothing smaller.
    tests/palette-contrast.test.ts holds every flag's pair to that floor and
    to the table DIRECTION.md prints. Ticket 23 publishes the pair beside the
    roles; this is the arithmetic it publishes. */
export const FIELD_NAMED_BAND: Record<string, string> = { rainbow: '#004CFF', bisexual: '#0038A8' };

export interface FlagField {
  hex: string;
  ink: '#101820' | '#FFFFFF';
  ratio: number;
}

export function flagField(stripes: string[], palette?: string): FlagField | undefined {
  const bands = stripes.map((s) => s.trim()).filter(Boolean);
  if (bands.length === 0) return undefined;
  const outer = bands[0].toUpperCase();
  const isColour = (s: string) => chromaOf(s) >= ACHROMATIC;
  const inner = bands.slice(1, -1);
  const hex =
    (palette && FIELD_NAMED_BAND[palette]) ||
    inner.find((s) => isColour(s) && s.toUpperCase() !== outer) ||
    bands.find(isColour) ||
    bands[0];
  const ink = contrast('#101820', hex) >= contrast('#FFFFFF', hex) ? '#101820' : '#FFFFFF';
  return { hex, ink, ratio: contrast(ink, hex) };
}
