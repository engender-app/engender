/* What an unlock's field draws instead of the app's name (tester-report-02
   ticket 07).

   A tester, on the screen a person meets every time the journal is locked:
   "there should be nothing written in the background there, only, for
   example, the flag". So the unlock's field carries the person's flag and
   the wordmark stays only as the screen's accessible name.

   Four drawings are on the table until Alicja picks one on the sign-off
   page; the three she did not pick are deleted with the switch below.

   - `stripes`: the field is the flag, its stripes as equal horizontal bands
     at the height the title used to take. Nothing written on it.
   - `mark`: the field keeps the flag's second colour and holds the app's
     mark - the launcher icon's tile - where the title stood.
   - `stripes-wordmark`: the stripes, with the wordmark kept small on the page
     under them, for comparison with what the tester asked to remove.
   - `sun`: the field keeps its colour and draws the corner sun, the drawing
     the mark is cropped from and the one Today's field carries, at the
     field's own height.

   Everything here is a pure answer to "what does this field draw", so the
   rule that matters most can be held without a browser: under disguise, or
   on a gate that is not an unlock, the answer is nothing at all, and no
   colour of the flag reaches the screen. */

import { ringRadii } from '../motion/flagSun.ts';

export const GATE_FLAGS = ['stripes', 'mark', 'stripes-wordmark', 'sun'] as const;
export type GateFlag = (typeof GATE_FLAGS)[number];

/** The drawing a production build ships until Alicja picks one. */
export const GATE_FLAG: GateFlag = 'stripes';

/** The drawing this build uses. A demo build reads `?gateFlag=` once, so the
    sign-off page can open every option in one running app; a production
    build folds the branch away and always answers GATE_FLAG. */
export function gateFlagChoice(
  search: string = typeof location === 'undefined' ? '' : location.search
): GateFlag {
  if (typeof __DEMO__ === 'undefined' || !__DEMO__) return GATE_FLAG;
  const asked = new URLSearchParams(search).get('gateFlag');
  return GATE_FLAGS.includes(asked as GateFlag) ? (asked as GateFlag) : GATE_FLAG;
}

/** Whether a gate draws the flag at all. Only an unlock does, and never under
    disguise: a disguised gate shows nothing that names the app or the person
    (ADR-0035), and a flag names the person from across a room. */
export function gateDrawsFlag({ unlock, disguised }: { unlock: boolean; disguised: boolean }): boolean {
  return unlock && !disguised;
}

/** The stripes as one paint: equal horizontal bands with hard stops, top to
    bottom in `--motif-stripes` order, so bisexual's doubled stops give its
    2:1:2 for free. Each colour is the palette's own value, untouched
    (DIRECTION.md decision 1). */
export function gateStripes(stripes: readonly string[]): string | undefined {
  if (!stripes.length) return undefined;
  const step = 100 / stripes.length;
  const stops = stripes.map((hex, i) => {
    const from = i === 0 ? '0' : `${round(i * step)}%`;
    const to = i === stripes.length - 1 ? '100%' : `${round((i + 1) * step)}%`;
    return `${hex} ${from} ${to}`;
  });
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

/** The corner sun as one paint: a quarter of concentric rings centred on the
    field's top right corner, one ring per stripe, outermost stripe
    outermost, equal thickness, each with the app's 3px black seam on its
    outer side (DIRECTION.md rule 8). The radius is the gradient's own size,
    so the stops are fractions of it and the seam is a fixed 3px. */
export function gateSun(stripes: readonly string[], radius: string): string | undefined {
  if (!stripes.length) return undefined;
  const n = stripes.length;
  /* Outer edge of each ring as a fraction of the radius, outermost first. */
  const edges = ringRadii(n, 100);
  const stops: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const inner = i === n - 1 ? '0%' : `${round(edges[i + 1])}%`;
    const outer = `${round(edges[i])}%`;
    stops.push(`${stripes[i]} ${inner} calc(${outer} - 3px)`, `#000 calc(${outer} - 3px) ${outer}`);
  }
  stops.push(`transparent ${round(edges[0])}%`);
  return `radial-gradient(circle ${radius} at 100% 0, ${stops.join(', ')})`;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
