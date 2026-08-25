/* Ink measurement for the icon set: what the optical-centring rule in
   tests/icon-geometry.test.ts is computed from, and what the gallery in
   tests/browser-tier/icons-gallery.svelte draws its centre marks with.

   Separate from the test that holds the rule because it is a measurement,
   not a judgement: this file says where a glyph's weight is, and the test
   says how far from the middle that is allowed to be. Both the rule and the
   reasoning behind it are written down there.
*/

export type Point = { x: number; y: number };

/** Curves and arcs are flattened to this many segments each. Well past the
    point where another doubling moves a centroid in the fourth decimal, and
    the whole set still measures in a few milliseconds. */
const FLATTEN = 64;

const NUMBERS = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

function numbers(source: string): number[] {
  return (source.match(NUMBERS) ?? []).map(Number);
}

/** The path grammar, tokenised into a command letter and its numbers. Arc
    flags are the reason this cannot simply split on letters and spaces
    later: `a2 2 0 1 1` packs two single-digit flags with no separator, so
    arguments are consumed positionally, per command, in `polylines` below. */
function tokenize(d: string): { cmd: string; args: number[] }[] {
  const out: { cmd: string; args: number[] }[] = [];
  for (const [, cmd, rest] of d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g)) {
    out.push({ cmd, args: numbers(rest) });
  }
  return out;
}

function cubic(p0: Point, p1: Point, p2: Point, p3: Point): Point[] {
  const out: Point[] = [];
  for (let i = 1; i <= FLATTEN; i++) {
    const t = i / FLATTEN;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
    });
  }
  return out;
}

/** Endpoint-parameterised arc to points, by the conversion in the SVG
    specification's implementation notes (F.6.5). Only `settings`, `tag`,
    `camera` and a handful of others use arcs, but they use them for the
    corners that carry the mark's whole silhouette. */
function arc(from: Point, rx: number, ry: number, rotDeg: number, large: number, sweep: number, to: Point): Point[] {
  if (rx === 0 || ry === 0) return [to];
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx2 = (from.x - to.x) / 2;
  const dy2 = (from.y - to.y) / 2;
  const x1 = cos * dx2 + sin * dy2;
  const y1 = -sin * dx2 + cos * dy2;
  let ax = Math.abs(rx);
  let ay = Math.abs(ry);
  /* An arc whose radii cannot span the chord is scaled up until it can,
     which the specification requires rather than treating as an error. */
  const lambda = (x1 * x1) / (ax * ax) + (y1 * y1) / (ay * ay);
  if (lambda > 1) {
    ax *= Math.sqrt(lambda);
    ay *= Math.sqrt(lambda);
  }
  const sign = large === sweep ? -1 : 1;
  const numerator = ax * ax * ay * ay - ax * ax * y1 * y1 - ay * ay * x1 * x1;
  const denominator = ax * ax * y1 * y1 + ay * ay * x1 * x1;
  const coefficient = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cx1 = (coefficient * ax * y1) / ay;
  const cy1 = (-coefficient * ay * x1) / ax;
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const value = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    return ux * vy - uy * vx < 0 ? -value : value;
  };
  const theta = angle(1, 0, (x1 - cx1) / ax, (y1 - cy1) / ay);
  let sweepAngle = angle((x1 - cx1) / ax, (y1 - cy1) / ay, (-x1 - cx1) / ax, (-y1 - cy1) / ay);
  if (!sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI;
  if (sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI;
  const out: Point[] = [];
  for (let i = 1; i <= FLATTEN; i++) {
    const t = theta + (sweepAngle * i) / FLATTEN;
    out.push({
      x: cos * ax * Math.cos(t) - sin * ay * Math.sin(t) + cx,
      y: sin * ax * Math.cos(t) + cos * ay * Math.sin(t) + cy
    });
  }
  return out;
}

/** One `d` attribute as a list of polylines - one per subpath, because a
    `M` in the middle of a path lifts the pen and the gap between the two
    subpaths carries no ink. */
function pathPolylines(d: string): Point[][] {
  const out: Point[][] = [];
  let current: Point[] = [];
  let point: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let lastControl: Point | null = null;
  let lastCmd = '';
  const push = (p: Point) => {
    current.push(p);
    point = p;
  };
  const lift = () => {
    if (current.length > 1) out.push(current);
    current = [];
  };
  for (const { cmd, args } of tokenize(d)) {
    const rel = cmd === cmd.toLowerCase();
    /* `op` rather than the command letter, because a moveto carrying more
       than one coordinate pair continues as a lineto - the grammar says so,
       and `home`'s roof, `check`, all three chevrons, `search`'s handle and
       `alert`'s triangle are every one of them written that way. Read as
       repeated movetos instead, the ink between the pairs is never drawn and
       the glyph measures as almost nothing. */
    const upper = cmd.toUpperCase();
    let op = upper;
    let i = 0;
    if (upper === 'Z') {
      if (current.length) {
        push({ ...start });
        lift();
      }
      lastControl = null;
      lastCmd = upper;
      continue;
    }
    do {
      const base = rel ? point : { x: 0, y: 0 };
      if (op === 'M') {
        lift();
        const p = { x: base.x + args[i++], y: base.y + args[i++] };
        current = [p];
        point = p;
        start = { ...p };
        /* A second coordinate pair after an M is an implicit lineto, and
           `home`'s roof is written exactly that way. */
        lastControl = null;
      } else if (op === 'L') {
        push({ x: base.x + args[i++], y: base.y + args[i++] });
        lastControl = null;
      } else if (op === 'H') {
        push({ x: base.x + args[i++], y: point.y });
        lastControl = null;
      } else if (op === 'V') {
        push({ x: point.x, y: base.y + args[i++] });
        lastControl = null;
      } else if (op === 'C' || op === 'S') {
        const p1 =
          op === 'C'
            ? { x: base.x + args[i++], y: base.y + args[i++] }
            : lastControl && (lastCmd === 'C' || lastCmd === 'S')
              ? { x: 2 * point.x - lastControl.x, y: 2 * point.y - lastControl.y }
              : { ...point };
        const p2 = { x: base.x + args[i++], y: base.y + args[i++] };
        const p3 = { x: base.x + args[i++], y: base.y + args[i++] };
        for (const p of cubic(point, p1, p2, p3)) current.push(p);
        point = p3;
        lastControl = p2;
      } else if (op === 'Q' || op === 'T') {
        const q: Point =
          op === 'Q'
            ? { x: base.x + args[i++], y: base.y + args[i++] }
            : lastControl && (lastCmd === 'Q' || lastCmd === 'T')
              ? { x: 2 * point.x - lastControl.x, y: 2 * point.y - lastControl.y }
              : { ...point };
        const p3 = { x: base.x + args[i++], y: base.y + args[i++] };
        /* Raised to a cubic rather than given its own sampler. */
        const c1 = { x: point.x + (2 / 3) * (q.x - point.x), y: point.y + (2 / 3) * (q.y - point.y) };
        const c2 = { x: p3.x + (2 / 3) * (q.x - p3.x), y: p3.y + (2 / 3) * (q.y - p3.y) };
        for (const p of cubic(point, c1, c2, p3)) current.push(p);
        point = p3;
        lastControl = q;
      } else if (op === 'A') {
        const rx = args[i++];
        const ry = args[i++];
        const rot = args[i++];
        const large = args[i++];
        const sweep = args[i++];
        const to = { x: base.x + args[i++], y: base.y + args[i++] };
        for (const p of arc(point, rx, ry, rot, large, sweep, to)) current.push(p);
        point = to;
        lastControl = null;
      } else {
        throw new Error(`unsupported path command ${cmd}`);
      }
      lastCmd = op;
      if (op === 'M') op = 'L';
    } while (i < args.length);
  }
  lift();
  return out;
}

function circlePolyline(cx: number, cy: number, r: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= FLATTEN; i++) {
    const t = (2 * Math.PI * i) / FLATTEN;
    out.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
  }
  return out;
}

/** A rounded rectangle's outline, corners included: `calendar` and `lock`
    both hang their whole silhouette on the corner radius, and squaring them
    off here would move their measured weight outwards. */
function rectPolyline(x: number, y: number, w: number, h: number, rx: number): Point[] {
  const r = Math.min(rx, w / 2, h / 2);
  if (r <= 0) {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
      { x, y }
    ];
  }
  const out: Point[] = [];
  const corner = (cx: number, cy: number, from: number) => {
    for (let i = 0; i <= FLATTEN / 4; i++) {
      const t = from + (Math.PI / 2) * (i / (FLATTEN / 4));
      out.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
    }
  };
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  corner(x + w - r, y + r, -Math.PI / 2);
  out.push(out[0]);
  return out;
}

/** Every stroke in one glyph's markup, as polylines in user units. */
export function inkPolylines(markup: string): Point[][] {
  const out: Point[][] = [];
  for (const [, d] of markup.matchAll(/<path[^>]*\sd="([^"]+)"/g)) out.push(...pathPolylines(d));
  for (const [, attrs] of markup.matchAll(/<circle([^>]*)>/g)) {
    const cx = Number(/cx="([^"]+)"/.exec(attrs)?.[1]);
    const cy = Number(/cy="([^"]+)"/.exec(attrs)?.[1]);
    const r = Number(/\br="([^"]+)"/.exec(attrs)?.[1]);
    out.push(circlePolyline(cx, cy, r));
  }
  for (const [, attrs] of markup.matchAll(/<rect([^>]*)>/g)) {
    const read = (name: string, fallback = 0) => {
      const raw = new RegExp(`\\b${name}="([^"]+)"`).exec(attrs)?.[1];
      return raw === undefined ? fallback : Number(raw);
    };
    out.push(rectPolyline(read('x'), read('y'), read('width'), read('height'), read('rx')));
  }
  for (const [, raw] of markup.matchAll(/<polygon[^>]*\spoints="([^"]+)"/g)) {
    const flat = numbers(raw);
    const points: Point[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) points.push({ x: flat[i], y: flat[i + 1] });
    if (points.length) points.push(points[0]);
    out.push(points);
  }
  return out;
}

export type Measure = {
  /** Midpoint of bounding-box centre and mass centroid: the optical centre. */
  optical: Point;
  box: Point;
  mass: Point;
  /** How far the optical centre sits from (12, 12). */
  off: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
};

export function measure(markup: string): Measure {
  const polylines = inkPolylines(markup);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let length = 0;
  let sumX = 0;
  let sumY = 0;
  for (const line of polylines) {
    for (const p of line) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    for (let i = 1; i < line.length; i++) {
      const seg = Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
      length += seg;
      sumX += seg * ((line[i].x + line[i - 1].x) / 2);
      sumY += seg * ((line[i].y + line[i - 1].y) / 2);
    }
  }
  const box = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const mass = length === 0 ? box : { x: sumX / length, y: sumY / length };
  const optical = { x: (box.x + mass.x) / 2, y: (box.y + mass.y) / 2 };
  return {
    optical,
    box,
    mass,
    off: Math.hypot(optical.x - 12, optical.y - 12),
    bounds: { minX, maxX, minY, maxY }
  };
}
