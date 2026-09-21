/* The body every screen that draws one draws (ADR-0087).

   One path, the proportion canon it was built on, and the neutrality
   measurements as functions its test can call. Nothing about regions,
   readings or hit boxes lives here: `bodyRegionFigure.ts` owns the body
   map's panels and zones, and the injection rotation map owns its dots.

   **Why a drawn contour replaces a stack of rounded rectangles.** The
   figure this supersedes was nine `{ left, top, width, height, r }` blocks,
   because the old neutrality rule banned shape outright - "no waist, no
   bust, no hips, so every piece is one constant width". That was the
   cheapest way to be neutral and it is what made the figure read as
   furniture rather than as a person (Alicja, 2026-09-21: "it looks really
   bad, blocky, amateurish"). What is worth banning is *sexed* shape, so the
   rule is now three measurements rather than one equality, and inside that
   budget the drawing gets a shoulder slope, a neck that meets the
   trapezius, limbs that are not bars and feet that are not tabs.

   **How the geometry is stated.** Every edge of the body is a chain of
   cubic segments whose `y` increases along the chain, so one structure
   answers both questions the figure asks: it emits as a path (`d`), and it
   evaluates at a height (`xAtY`). A part is two such edges - an outer and
   an inner - joined by a straight chord at the top and another at the
   bottom, which is what lets `spansAt` say exactly how wide the body is at
   any height without parsing the path back. The panels of the body map are
   cut out of this by clipping, and their geometry is measured through
   `spansAt`, so what a test measures and what a browser paints come from
   the same numbers.

   **The parts overlap on purpose.** An arm's top chord sits inside the
   torso's shoulder and a leg's top chord is the torso's own hip line, so
   the union has no internal joint to hide. `BodyRegionMap.svelte` paints it
   in two passes, a stroked layer and then a filled one, so only the outer
   contour keeps a line.

   **The proportion canon**, which is the part of the last redraw that
   worked and is kept unchanged: seven heads of 24 units, the crown at y=8,
   the crotch at y=96, the knee at 5.2 heads and the fingertips at
   mid-thigh. The box is 100 x 176, which is 300 x 528 at the smallest stage
   the body map allows - the ratio that puts a 16-unit band on exactly
   48px. */

export const FIGURE_BOX = { width: 100, height: 176 } as const;

/** The axis every part is mirrored about, which is the first of the three
    neutrality measurements. */
export const MIDLINE = FIGURE_BOX.width / 2;

export interface Pt {
  x: number;
  y: number;
}

interface Seg {
  c1: Pt;
  c2: Pt;
  to: Pt;
}

/** A chain of cubic segments with `y` strictly increasing from `from` to
    the last `to`. Monotone height is the whole trick: it makes the edge
    invertible, so the same curve the browser draws can be asked how far out
    the body reaches at a given height. */
interface Edge {
  from: Pt;
  segs: Seg[];
}

const p = (x: number, y: number): Pt => ({ x, y });
const edge = (from: Pt, segs: Seg[]): Edge => ({ from, segs });
const seg = (c1: Pt, c2: Pt, to: Pt): Seg => ({ c1, c2, to });

const cubic = (a: number, b: number, c: number, d: number, t: number): number => {
  const u = 1 - t;
  return a * u * u * u + 3 * b * t * u * u + 3 * c * t * t * u + d * t * t * t;
};

const top = (e: Edge): number => e.from.y;
const bottom = (e: Edge): number => e.segs[e.segs.length - 1].to.y;

/** Where an edge is at height `y`, by bisection on the segment that spans
    it. Heights outside the edge clamp to its ends, which is what callers
    sampling a band want: a band that runs past a part simply stops. */
function xAtY(e: Edge, y: number): number {
  if (y <= top(e)) return e.from.x;
  if (y >= bottom(e)) return e.segs[e.segs.length - 1].to.x;
  let start = e.from;
  for (const s of e.segs) {
    if (y <= s.to.y) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 40; i += 1) {
        const mid = (lo + hi) / 2;
        if (cubic(start.y, s.c1.y, s.c2.y, s.to.y, mid) < y) lo = mid;
        else hi = mid;
      }
      return cubic(start.x, s.c1.x, s.c2.x, s.to.x, (lo + hi) / 2);
    }
    start = s.to;
  }
  return e.segs[e.segs.length - 1].to.x;
}

/** The parameter at which a segment reaches height `y`. */
function tAtY(from: Pt, s: Seg, y: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (cubic(from.y, s.c1.y, s.c2.y, s.to.y, mid) < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const lerp = (a: Pt, b: Pt, t: number): Pt => p(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);

/** The tail of an edge from height `y` down, split exactly rather than
    resampled: de Casteljau on the segment that spans `y`, keeping every
    segment below it untouched. This is what makes the trunk's side and the
    silhouette's own contour the same curve below the armpit rather than two
    curves that happen to agree. */
function splitFrom(e: Edge, y: number): Edge {
  let start = e.from;
  for (let i = 0; i < e.segs.length; i += 1) {
    const s = e.segs[i];
    if (y <= s.to.y) {
      const t = tAtY(start, s, y);
      const a = lerp(start, s.c1, t);
      const b = lerp(s.c1, s.c2, t);
      const c = lerp(s.c2, s.to, t);
      const d = lerp(a, b, t);
      const f = lerp(b, c, t);
      const at = lerp(d, f, t);
      return edge(at, [seg(f, c, s.to), ...e.segs.slice(i + 1)]);
    }
    start = s.to;
  }
  return edge(e.segs[e.segs.length - 1].to, []);
}

const mirrorPt = (q: Pt): Pt => p(FIGURE_BOX.width - q.x, q.y);
const mirror = (e: Edge): Edge =>
  edge(mirrorPt(e.from), e.segs.map((s) => seg(mirrorPt(s.c1), mirrorPt(s.c2), mirrorPt(s.to))));

/** The same edge walked from the bottom up, so a closed part can be emitted
    in one pass round its outline. */
function reverse(e: Edge): Edge {
  const points = [e.from, ...e.segs.map((s) => s.to)];
  const segs: Seg[] = [];
  for (let i = e.segs.length - 1; i >= 0; i -= 1) {
    segs.push(seg(e.segs[i].c2, e.segs[i].c1, points[i]));
  }
  return edge(points[points.length - 1], segs);
}

const n = (v: number): string => String(Math.round(v * 1000) / 1000);
const draw = (e: Edge): string =>
  e.segs.map((s) => `C${n(s.c1.x)} ${n(s.c1.y)} ${n(s.c2.x)} ${n(s.c2.y)} ${n(s.to.x)} ${n(s.to.y)}`).join('');

/* ---- the canon ------------------------------------------------------- */

/** The landmarks the drawing is built on, named so a test can say which
    proportion it is checking rather than asserting a number twice. */
export const CANON = {
  /** One head. Seven of them from the crown to the bottom of the box. */
  head: 24,
  crown: 8,
  /** Where the jaw runs into the neck, one head below the crown. */
  chin: 32,
  collar: 40,
  crotch: 96,
  /** 5.2 heads below the crown. */
  knee: 132.8,
  sole: 174,
  fingertip: 114.4
} as const;

/** The torso's own side, from the collar to the crotch, and the curve the
    neutrality measurements are taken on.

    It is monotone by construction - its control points step inward and
    downward, and a cubic is monotone in a coordinate whose controls are -
    so there is no waist to pull in, no bust to push out and no hip to
    flare, and the drawing cannot grow one without this curve changing.
    Below the armpit it *is* the silhouette's outer contour
    (`silhouetteFollowsTrunkSide` in the test holds that); above it, the
    trapezius and the deltoid are drawn outside it, which is the shoulder
    the old flat-slab rule had no room for. */
const TRUNK_SIDE: Edge = edge(p(67.8, CANON.collar), [
  seg(p(67.75, 58), p(67.1, 78), p(66.8, CANON.crotch))
]);

/** The shoulder point: where the trapezius stops climbing and the arm takes
    over as the outer contour. The torso and the arm share it, so the union
    has one corner there rather than two edges crossing - a shoulder with
    the arm's own top a little inside it grew a spur, and one with the arm's
    top a little outside it grew a slit. */
const SHOULDER_POINT = p(74.6, 44.4);

/** Where the torso's own shoulder line lands back on the trunk's side,
    under the arm. Below it the armpit is open.

    It is as low as the drawing can put it, and the arm's inner edge hugs
    the shoulder line down to nearly the same height, because the notch
    between the two is the armpit and a long one reads as a cut into the
    body (Alicja, on the first renders: "please make those armpit cuts a
    little smaller"). What bounds it from below is the chest's own band at
    y=48: the arm has to hang clear of the torso by then, or a band of the
    torso would pick up a piece of an arm, and the contour below that height
    has to be the trunk's own side for the neutrality measurements to be
    measuring the drawing. So the shoulder line lands on the trunk's side at
    exactly 48 and the notch above it is about a unit long. */
const ARMPIT = 48;
const armpitJoin = p(xAtY(TRUNK_SIDE, ARMPIT), ARMPIT);

/* The head, the neck, the shoulders and the torso, as one edge from the
   crown to the hip. Head 19.2 across at its widest and 24 tall, a jawline
   that narrows into a 10.4-unit neck, a trapezius that climbs out to the
   shoulder point at 2.2 heads across, a deltoid cap, and then the torso's
   own side. */
const BODY_OUTER: Edge = edge(p(MIDLINE, CANON.crown), [
  seg(p(55.6, 8), p(59.6, 12.6), p(59.6, 20.5)), // the crown over the cheek
  seg(p(59.6, 24.8), p(59, 27.4), p(57.2, 29.4)), // the cheek to the jaw angle
  seg(p(55, 31.6), p(54.8, 32.2), p(54.8, 34)), // the jawline into the neck
  seg(p(54.8, 35.6), p(55, 37.2), p(55.2, 39)), // the neck
  seg(p(61.8, 40.2), p(68.8, 41.4), SHOULDER_POINT), // the trapezius
  seg(p(72.6, 45.6), p(70.2, 47.4), armpitJoin), // down under the arm
  ...splitFrom(TRUNK_SIDE, ARMPIT).segs // the torso's side to the hip
]);

/* An arm, from a top chord inside the shoulder to a blunt fingertip at
   mid-thigh. Not one width the whole way down - the shoulder is wider than
   the elbow, the wrist is the narrowest thing on it and the hand is wider
   than the wrist again - and none of those say which body this is. The
   ankle turns into the foot over a gentle tangent rather than a corner (the
   two segments used to meet at opposite angles and each ankle came out as a
   visible kink), and the foot flares on its outer edge only, its instep
   running straight down from the ankle - a foot that widened both ways read
   as a bell rather than as a foot. The arm starts at the shoulder point itself rather than at a
   chord of its own,
   which is what keeps the union's shoulder one corner: its outer edge
   continues the trapezius outward and its inner edge turns inward faster
   than the torso's own shoulder line, so the armpit opens as a notch
   between the two a couple of units below. */
const ARM_OUTER: Edge = edge(SHOULDER_POINT, [
  seg(p(77.5, 46), p(78.7, 50.5), p(78.7, 55)), // the deltoid
  seg(p(78.7, 63), p(78.1, 72), p(77.7, 80)), // the upper arm to the elbow
  seg(p(77.3, 88), p(77.1, 95), p(76.7, 101)), // the forearm to the wrist
  seg(p(78.3, 104.5), p(77.9, 111), p(75.9, CANON.fingertip)) // the hand
]);

const ARM_INNER: Edge = edge(SHOULDER_POINT, [
  seg(p(70.6, 45.2), p(69.7, 47.2), p(70.2, 48)), // in under the shoulder, then the armpit
  seg(p(70.6, 54), p(72, 60), p(72.3, 66)),
  seg(p(72.6, 74), p(72.9, 84), p(73.1, 92)),
  seg(p(73.3, 96), p(73.5, 99), p(73.5, 101)), // the wrist
  seg(p(71.9, 104.5), p(72.7, 111.5), p(74.1, CANON.fingertip)) // the hand
]);

/* A leg, from the hip line to the sole. Its top chord is the torso's own
   hip line, so the join needs no hiding, and its inner edge starts on the
   midline, which is the crotch. The foot flares out of the ankle and its
   toe points away from its twin, so a foot is a foot rather than a tab on
   the end of a bar. */
const LEG_OUTER: Edge = edge(p(xAtY(TRUNK_SIDE, CANON.crotch), CANON.crotch), [
  seg(p(66.2, 108), p(64.6, 120), p(63.4, 128)), // the thigh
  seg(p(62.6, 134), p(62.2, 142), p(61.6, 148)), // the knee to the calf
  seg(p(61, 156), p(59.4, 165.5), p(58.8, 169)), // the shin to the ankle
  seg(p(59.2, 172), p(60.4, 173.4), p(61.4, CANON.sole)) // the foot, flaring out
]);

const LEG_INNER: Edge = edge(p(MIDLINE, CANON.crotch), [
  seg(p(52.2, 106), p(53.8, 116), p(54.4, 126)),
  seg(p(55, 134), p(55.4, 142), p(55.4, 150)),
  seg(p(55.4, 158), p(55.3, 165), p(55.2, 169)),
  seg(p(55.15, 172), p(55.1, 173.4), p(55, CANON.sole)) // the instep, which stays straight
]);

/* ---- the parts, and what they add up to ------------------------------ */

interface Instance {
  key: string;
  outer: Edge;
  inner: Edge;
  /** Whether this piece is the mirror of another, which decides only which
      way round it is emitted. See `closed`. */
  mirrored?: boolean;
}

/** Every closed piece of the drawing, each an outer and an inner edge over
    the same run of heights. The symmetric piece carries its own mirror as
    its inner edge; the limbs come in pairs. */
const INSTANCES: Instance[] = [
  { key: 'body', outer: BODY_OUTER, inner: mirror(BODY_OUTER) },
  { key: 'arm-right', outer: ARM_OUTER, inner: ARM_INNER },
  { key: 'arm-left', outer: mirror(ARM_OUTER), inner: mirror(ARM_INNER), mirrored: true },
  { key: 'leg-right', outer: LEG_OUTER, inner: LEG_INNER },
  { key: 'leg-left', outer: mirror(LEG_OUTER), inner: mirror(LEG_INNER), mirrored: true }
];

/** One piece as a closed subpath: down one edge, across, and back up the
    other.

    Which edge it goes down matters, and this is the one place the mirror is
    not free. The fill rule is nonzero, so two overlapping subpaths wound
    opposite ways cancel each other and their overlap becomes a hole rather
    than part of the union - and mirroring a loop is what flips the way it
    is wound. An arm overlaps the shoulder it hangs from, so the left arm
    punched a lens-shaped hole out of the left shoulder while the right one
    was solid (Alicja, on the second set of renders: "the right one looks
    good, but the left one now has this very little stroke glitch"). A
    mirrored piece is emitted down its inner edge and back up its outer one,
    which winds it the same way as its twin. */
const closed = ({ outer, inner, mirrored }: Instance): string => {
  const [down, up] = mirrored ? [inner, outer] : [outer, inner];
  const back = reverse(up);
  return `M${n(down.from.x)} ${n(down.from.y)}${draw(down)}L${n(back.from.x)} ${n(back.from.y)}${draw(back)}Z`;
};

/** The whole body as one `d`: five closed subpaths whose union is the
    silhouette. One path element, so it can be a `clipPath` a panel is cut
    out of, the shape the contour is stroked from, and the fill of the body
    underneath, without three copies of the geometry. */
export const SILHOUETTE_PATH = INSTANCES.map(closed).join('');

/** How wide the body is at height `y`, as the x ranges it occupies left to
    right: one range across the head, the neck and the torso, three where
    the arms hang clear of it, two down the legs. Overlapping parts are
    merged, so a range is a piece of the silhouette rather than a piece of a
    part. */
const SPANS: Map<number, [number, number][]> = new Map();

export function spansAt(y: number): [number, number][] {
  const memo = SPANS.get(y);
  if (memo) return memo.map(([a, b]): [number, number] => [a, b]);
  const raw: [number, number][] = [];
  for (const it of INSTANCES) {
    if (y < top(it.outer) || y > bottom(it.outer)) continue;
    const a = xAtY(it.outer, y);
    const b = xAtY(it.inner, y);
    raw.push([Math.min(a, b), Math.max(a, b)]);
  }
  raw.sort((l, r) => l[0] - r[0]);
  const out: [number, number][] = [];
  for (const span of raw) {
    const last = out[out.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else out.push([span[0], span[1]]);
  }
  /* Kept, because the callers that measure a band walk the same grid of
     heights thousands of times over: every panel's bounding box, centroid
     and mark anchor is a scan down its own band, and each height costs ten
     bisections through a cubic. The grid is fixed (a quarter of a unit over
     176), so this is a table rather than a cache that can grow with use. */
  SPANS.set(y, out);
  return out.map(([a, b]): [number, number] => [a, b]);
}

/** The torso's half-width at a height between the collar and the crotch.
    Read off `TRUNK_SIDE` rather than off the silhouette, because between
    the collar and the armpit the shoulder is drawn outside it - a shoulder
    slope is not a sexed contour, and the three things that are (a waist, a
    bust, a hip) are all below the armpit, where this curve and the
    silhouette's own edge are the same curve. */
export function trunkHalfWidthAt(y: number): number {
  return xAtY(TRUNK_SIDE, y) - MIDLINE;
}

/** The measurement itself: the torso's half-width every `step` units from
    the collar to the crotch. */
export function trunkHalfWidths(step = 2): { y: number; half: number }[] {
  const out: { y: number; half: number }[] = [];
  for (let y = CANON.collar; y <= CANON.crotch + 1e-9; y += step) {
    out.push({ y, half: trunkHalfWidthAt(y) });
  }
  return out;
}

/** The two heights a local maximum of the torso's half-width may not fall
    in, which is the third measurement. A bust and a hip are the two things
    a neutral figure cannot have and the two the body map's own regions are
    named after, so they are named here rather than written as numbers in a
    test. */
export const SEXED_BANDS = {
  bust: { top: 48, bottom: 64 },
  hip: { top: 64, bottom: 80 }
} as const;

/** Where the arm leaves the torso, which no drawing decision depends on
    but two tests read: above it the shoulder is one mass, below it the arm
    hangs clear and a band of the torso cannot pick up a piece of it. */
export function armpitY(): number {
  for (let y = top(ARM_INNER); y <= CANON.crotch; y += 0.05) {
    if (xAtY(ARM_INNER, y) > xAtY(BODY_OUTER, y)) return y;
  }
  return CANON.crotch;
}

/** The narrowest gap between an arm and the torso over a run of heights,
    which is what a band of the torso has to fit inside to be a band of the
    torso alone. */
export function armClearance(from: number, to: number): number {
  let least = Infinity;
  for (let y = from; y <= to + 1e-9; y += 0.25) {
    least = Math.min(least, xAtY(ARM_INNER, y) - xAtY(BODY_OUTER, y));
  }
  return least;
}
