/* A section takes a distinct stripe of the active flag. Stripe colours
   identify categories (ADR-0012). Deduplicate palettes such as trans
   blue/pink/white/pink/blue before allocating roles.

   Adjust the stripe's lightness to produce ink at 4.5:1 on each supported
   surface while preserving hue. kit.css mixes a bare --role towards
   --text when no theme supplies the ink. tests/kit-roles.test.ts checks
   both contrast paths. */

import { chromaOf, colorMixOklab, contrast, lightnessOf, washOver, withLightness } from './colour';

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
  /** For marks sharing a plot, keep chromatic stripes and adjust white
      or near-black shades just enough to clear 3:1. This keeps a
      shade visible against its matching card surface. A lone mark
      uses the exact stripe via --role-draw. */
  paired: string;
  /** What a chart line drawn in the stripe is edged in, so it can be found
      against the ground (WCAG 1.4.11, phase 15 ticket 20): the same hue at
      the nearest lightness that clears 3:1 against everything a chart draws
      under a line (see lineEdge), wherever the stripe itself does not. Null
      where the stripe already reads, so a line that needs no edge is drawn
      exactly as before.

      An edge rather than a floored line because the line is the flag's
      colour and stays it; the edge is the boundary the eye finds it by.
      Nonbinary's yellow is still yellow, now with a darker yellow either
      side of it, rather than one olive line. */
  edge: string | null;
  /** The same for a line drawn in `paired`: the stripe's edge where
      `paired` is the stripe, and otherwise the edge the shade's mark needs
      under an annotation band, which its own 3:1 never counted. */
  pairedEdge: string | null;
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

/** Choose ink for a role-hued heat cell without changing its fill.
    Keep theme text where it reaches 4.5:1, else choose black or white,
    whichever contrasts more. At their crossover both still reach
    4.58:1. The accent ramp's hand-tuned pairs live in palettes.css. */
/* heatRamp stays exported only for kit-roles.test.ts, which cross-checks
   against it (AU-09 test-only review). */
export function heatRamp(stripe: string, text: string, ground: string): HeatStep[] {
  return HEAT_STEPS.map((pct) => {
    const fill = pct === 0 ? ground : pct === 100 ? stripe : colorMixOklab(stripe, pct, ground);
    return { fill, ink: heatInk(fill, text) };
  });
}

/* heatInk stays exported only for palette-contrast.test.ts, which holds
   mood's per-step inks to the same rule. */
export function heatInk(fill: string, text: string): string {
  if (contrast(text, fill) >= TEXT_FLOOR) return text;
  return contrast('#FFFFFF', fill) >= contrast('#000000', fill) ? '#FFFFFF' : '#000000';
}

/** Below this a stripe is a shade rather than a colour. The flags'
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
    const paired = chromaOf(stripe) >= ACHROMATIC ? stripe : mark;
    return {
      stripe,
      ink: legibleInk(stripe, text, grounds, TEXT_FLOOR),
      mark,
      paired,
      edge: lineEdge(stripe, text, grounds),
      pairedEdge: lineEdge(paired, text, grounds),
      heat: heatRamp(stripe, text, heatGround)
    };
  });
}

/** What a chart can paint under one of its lines, on top of the surface
    itself: a wash of the line's own stripe, at most 18% (an area chart's
    fill is 16%), and the 7% of --text an annotation band lays across the
    plot. tests/palette-contrast.test.ts measures the edge against both. */
const CHART_WASH_PCT = 18;
const ANNOTATION_PCT = 7;

/** A line's edge: legibleInk at the mark floor, over every ground a chart
    paints under a line, or null where the stripe clears all of them. */
function lineEdge(stripe: string, text: string, grounds: string[]): string | null {
  const shaded = grounds.flatMap((g) => [g, washOver(text, ANNOTATION_PCT, g)]);
  const under = shaded.flatMap((g) => [g, washOver(stripe, CHART_WASH_PCT, g)]);
  const edge = legibleInk(stripe, text, under, MARK_FLOOR);
  return edge === stripe ? null : edge;
}

/** The role for the nth area of a screen, wrapping where a screen has more
    areas than the flag has stripes. Pansexual has three; the More hub has
    more groups than that, and the alternative to wrapping is areas with no
    colour at all. */
export function roleAt(roles: Role[], index: number): Role | undefined {
  if (roles.length === 0) return undefined;
  return roles[index % roles.length];
}

/** Whether a stripe reads as red: a saturated colour within 15 degrees of
    pure red. Rainbow's #E40303 and lesbian's #D52D00 are; an orange such as
    #EF7627 (22 degrees) and the pinks are not. */
function isRed(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0 || (max - min) / max < 0.5 || max !== r) return false;
  const hue = (60 * (g - b)) / (max - min);
  return hue <= 15 && hue >= -15;
}

/** The first role whose stripe is not red, for a surface meant to calm: the
    breathing exercise filled with rainbow's first stripe read as blood
    (bug session 18, item 75). The first role where no role qualifies. */
export function calmRole(roles: Role[]): Role | undefined {
  return roles.find((role) => !isRed(role.stripe)) ?? roles[0];
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

/** Resolve Home's stripe roles in one place. The log strip uses role 0
    for a visible fill across palettes. Week-strip and day-card indices
    remain with the Journal door.

    Resolve liveTiles, lookBack and agenda blocks through tileRoleAt, which
    looks up colored stripes. Use the same role for every part of each
    area. Pinned rows resolve through roleAt. */
export const HOME_AREA_ROLE = {
  week: 0,
  log: 0,
  liveTiles: 1,
  lookBack: 1,
  agenda: 2,
  days: 3,
  pinned: 3
} as const;

/** Draw exact flag colours as hard stops from left to right, preserving
    stripe order and proportions. Rotating the bands gives each full
    height on a tile's short bar. Repeated stripes preserve widths such
    as bisexual's 2:1:2 without theme adjustments. */
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
    way FlagSun reads the same token: palettes.css is the one place the 16
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

/** Choose the first later inner chromatic stripe distinct from the
    outermost colour. Fall back to the first later colour, first colour,
    then first stripe. Rainbow uses blue, bisexual dark blue, lesbian
    light orange, and Polish white in light mode and red in dark mode.

    Pick near-black or white for higher contrast. Use large text only.
    Nonbinary purple with white is 4.41:1. tests/palette-contrast.test.ts
    pins the field/ink pairs and 3:1 floor. */
const FIELD_NAMED_BAND: Record<string, string> = { rainbow: '#004CFF', bisexual: '#0038A8', lesbian: '#FF9A56' };

export interface FlagField {
  hex: string;
  ink: '#101820' | '#FFFFFF';
  ratio: number;
}

export function flagField(stripes: string[], palette?: string, dark = false): FlagField | undefined {
  const bands = stripes.map((s) => s.trim()).filter(Boolean);
  if (bands.length === 0) return undefined;
  const outer = bands[0].toUpperCase();
  const isColour = (s: string) => chromaOf(s) >= ACHROMATIC;
  const inner = bands.slice(1, -1);
  const hex =
    (palette === 'polish' ? bands[dark ? 1 : 0] : palette && FIELD_NAMED_BAND[palette]) ||
    inner.find((s) => isColour(s) && s.toUpperCase() !== outer) ||
    bands.slice(1).find((s) => isColour(s) && s.toUpperCase() !== outer) ||
    bands.find(isColour) ||
    bands[0];
  const ink = contrast('#101820', hex) >= contrast('#FFFFFF', hex) ? '#101820' : '#FFFFFF';
  return { hex, ink, ratio: contrast(ink, hex) };
}
