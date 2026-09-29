// @ts-nocheck
/* The field-text probe's shared half (ticket 285): the page-side sampler as
   an expression string, and the arithmetic that turns its rows and a
   screencast into findings. No browser and no app import, so the arithmetic
   is unit-tested with synthetic frames (field-text-core.test.ts) and the
   same code judges every scene.

   Two instruments, because each one is wrong in a different way.

   The sampler reads geometry: on a navigation the view transition's own
   pseudo elements (the blind's clip, every named part's group box, its ride
   and travel), on a step machine the real elements against the field's
   `--blind-edge`. It is cheap and it gives numbers, but a rAF callback runs
   before a ResizeObserver callback in the same frame, so on a step machine
   it can see a layout the browser never painted. A one-sample finding there
   is discounted; two in a row are real.

   The pixels are the authority. The probe paints the field pure blue and its
   ink pure red (the two custom properties, forced with !important), so a red
   pixel below the last blue pixel of its own column is ink painted over the
   page rather than over the field. That cannot be a layout artefact: it is
   what the composited frame showed. */

import { decodePng } from './png-decode.mjs';

/** How far a part's box may reach below the painted edge before it counts as
    off the field. Sub-pixel rounding, nothing more. */
export const OVERSPILL_PX = 0.75;
/** A part that moves this far relative to the edge in one frame has jumped
    rather than slid. The anchored travel is 12px over 150ms (about 2px a
    frame); 6px leaves room for a dropped frame. */
export const TELEPORT_PX = 6;
/** An opacity step larger than this in one frame is an appearance or a
    disappearance in a single frame. */
export const POP = 0.5;
/** Visible enough to count. */
export const SEEN = 0.05;
/** Red pixels below the field's own bottom, in one frame, before it is a
    finding. A glyph's antialiased fringe can leave a pixel or two. */
export const INK_PIXELS = 6;

/** The forced colours the pixel instrument reads. */
export const FIELD_RGB = '#0000ff';
export const INK_RGB = '#ff0000';
export const PROBE_CSS = `html { --field: ${FIELD_RGB} !important; --field-ink: ${INK_RGB} !important; } .demo-bar { display: none !important; } [data-toast] { display: none !important; }`;

/** Every name fieldBlind.ts hands out. Twelve parts a side is more than any
    field carries; eight rings is one more than the longest flag. */
export const PART_NAMES = [];
for (const side of ['a', 'b']) {
  for (let i = 0; i < 12; i++) PART_NAMES.push(`fp-${side}-${i}`);
  for (let i = 0; i < 8; i++) PART_NAMES.push(`sun-${side}-${i}`);
}

/** The page-side sampler. `steps` are gestures fired from inside the loop
    ({at, click|back|eval}), so t=0 is the frame the first one fires on and
    the recorded run is the measured one. Returned as a string so a Playwright
    evaluate and a devtools socket can both run it. */
export function samplerExpression(steps, ms) {
  const fn = async (steps, ms, names) => {
    const html = document.documentElement;
    const gcs = (pseudo) => getComputedStyle(html, pseudo);
    const num = (v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    const ty = (m) => {
      const found = /matrix\(([^)]+)\)/.exec(m ?? '');
      return found ? Number(found[1].split(',')[5]) : 0;
    };
    const scaleOf = (m) => {
      const found = /matrix\(([^)]+)\)/.exec(m ?? '');
      return found ? Number(found[1].split(',')[0]) : 1;
    };
    const second = (v) => {
      if (!v || v === 'none') return 0;
      return num(v.split(/\s+/)[1]) ?? 0;
    };
    const edgeOf = (side) => {
      const g = gcs('::view-transition-group(blind)');
      const clip = gcs(`::view-transition-${side}(blind)`);
      const cut = /inset\(0px 0px (-?[\d.]+)px/.exec(clip.clipPath)?.[1];
      const h = num(g.height);
      if (cut === undefined || h === null) return null;
      return h - Number(cut) + second(clip.translate) + ty(g.transform);
    };
    const FIELD = '[data-screen-field], [data-home-field], [data-setup-field], [data-gate-field]';
    const rows = [];
    const t0 = performance.now();
    const epoch = performance.timeOrigin + t0;
    const pending = steps.map((s) => ({ ...s, done: false }));
    return await new Promise((finish) => {
      const tick = () => {
        const now = performance.now() - t0;
        for (const s of pending) {
          if (s.done || now < s.at) continue;
          s.done = true;
          if (s.click) document.querySelector(s.click)?.click();
          else if (s.back) history.back();
          else if (s.eval) new Function(s.eval)();
        }
        const row = { t: Math.round(now * 10) / 10 };
        const eo = edgeOf('old');
        const en = edgeOf('new');
        let edge = eo === null ? en : en === null ? eo : Math.max(eo, en);
        /* What is painted is the blind's clip cut again by the field's own
           group, which nests it and clips its children at its own animated
           box (app.css). Two animations on one edge: the smaller of them is
           what the eye sees, so it is the edge the text is held to. Where a
           scrolled side has switched that clip off there is only the
           blind's. */
        if (edge !== null && !html.dataset.blindScroll) {
          const fg = gcs('::view-transition-group(field)');
          const fh = num(fg.height);
          if (fh !== null) {
            row.groupEdge = Math.round((fh + ty(fg.transform)) * 10) / 10;
            edge = Math.min(edge, fh + ty(fg.transform));
          }
        }
        if (edge !== null) {
          row.edge = Math.round(edge * 10) / 10;
          row.parts = [];
          for (const name of names) {
            const g = gcs(`::view-transition-group(${name})`);
            const h = num(g.height);
            if (h === null) continue;
            const side = name.includes('-a-') ? 'old' : 'new';
            const img = gcs(`::view-transition-${side}(${name})`);
            const s = img.scale && img.scale !== 'none' ? Number(img.scale) : 1;
            const top = ty(g.transform) + second(img.translate) + ty(img.transform);
            /* Scaled about the centre, which is where a pseudo image's
               origin is. */
            const bottom = top + h / 2 + (h / 2) * s;
            row.parts.push({
              n: name,
              top: Math.round(top * 10) / 10,
              bottom: Math.round(bottom * 10) / 10,
              mid: Math.round((top + h / 2) * 10) / 10,
              op: Math.round(Number(img.opacity) * 100) / 100,
              scale: Math.round(s * 100) / 100
            });
          }
        }
        /* The other kind of field: real elements, a clip that reads
           --blind-edge, and nothing named. */
        const field = document.querySelector(FIELD);
        if (field) {
          const box = field.getBoundingClientRect();
          row.field = { top: Math.round(box.top * 10) / 10, height: Math.round(box.height * 10) / 10 };
          const paint = field.querySelector('.step-field-paint');
          if (paint) {
            const host = field.parentElement;
            const e = num(getComputedStyle(host).getPropertyValue('--blind-edge'));
            row.step = {
              edge: Math.round((paint.getBoundingClientRect().top + (e ?? 0)) * 10) / 10,
              parts: [...field.querySelectorAll('[data-field-part]')].map((el, i) => {
                const r = el.getBoundingClientRect();
                return {
                  n: (el.dataset.setupQuestion !== undefined ? 'question' : el.className.split(' ')[0] || 'part') + ':' + i,
                  top: Math.round(r.top * 10) / 10,
                  bottom: Math.round(r.bottom * 10) / 10,
                  op: Math.round(Number(getComputedStyle(el).opacity) * 100) / 100
                };
              })
            };
          }
        }
        row.nav = html.dataset.nav ?? '';
        rows.push(row);
        if (now < ms) requestAnimationFrame(tick);
        else finish({ epoch, rows });
      };
      requestAnimationFrame(tick);
    });
  };
  return `(${fn.toString()})(${JSON.stringify(steps)}, ${ms}, ${JSON.stringify(PART_NAMES)})`;
}

/** Overspill and teleports in one list of edge-relative rows. `series` is
    `[{t, edge, parts:[{n,bottom,op}]}]`; `bottomBy` picks the field the rows
    carry. Consecutive-sample rule for a step machine (`persist`). */
export function findGeometry(series, { persist = 1 } = {}) {
  const overspill = new Map();
  const teleports = [];
  const pops = [];
  const streak = new Map();
  let prev = null;
  for (const row of series) {
    if (row.edge === undefined || row.edge === null) {
      prev = null;
      continue;
    }
    for (const p of row.parts ?? []) {
      const reach = p.bottom - row.edge;
      if (p.op > SEEN && reach > OVERSPILL_PX) {
        const run = (streak.get(p.n) ?? 0) + 1;
        streak.set(p.n, run);
        if (run >= persist) {
          const cur = overspill.get(p.n);
          if (!cur || reach > cur.reach) overspill.set(p.n, { name: p.n, reach: Math.round(reach * 10) / 10, at: row.t });
        }
      } else streak.set(p.n, 0);
    }
    if (prev) {
      for (const p of row.parts ?? []) {
        const q = prev.parts?.find((x) => x.n === p.n);
        if (!q) continue;
        if (Math.abs(p.op - q.op) > POP) pops.push({ name: p.n, at: row.t, from: q.op, to: p.op });
        if (p.op > SEEN && q.op > SEEN) {
          /* The centre, so a ring scaling about its own middle is not a
             ring moving. */
          const now = row.edge - (p.mid ?? p.bottom);
          const was = prev.edge - (q.mid ?? q.bottom);
          if (Math.abs(now - was) > TELEPORT_PX)
            teleports.push({ name: p.n, at: row.t, jump: Math.round((now - was) * 10) / 10 });
        }
      }
    }
    prev = row;
  }
  return { overspill: [...overspill.values()], teleports, pops };
}

/** The door field's height at rest: a jump between two frames with nothing
    animating is a yank on the field itself. */
export function findHeightJumps(series, floor = 1) {
  const out = [];
  for (let i = 1; i < series.length; i++) {
    const d = series[i].height - series[i - 1].height;
    if (Math.abs(d) >= floor) out.push({ at: series[i].t, from: series[i - 1].height, to: series[i].height, jump: Math.round(d * 10) / 10 });
  }
  return out;
}

/** Red pixels below the last blue pixel of their column, in one decoded
    frame. `top`..`bottom` bounds the rows read, which is how a frame that is
    mostly page stays cheap. Returns the count and how far below the field
    the lowest one is. */
export function offFieldInk(png, { top = 0, bottom = png.height } = {}) {
  const { width, height, channels, pixels } = png;
  const lastBlue = new Int32Array(width).fill(-1);
  const end = Math.min(bottom, height);
  const isBlue = (i) => pixels[i + 2] > 170 && pixels[i] < 70 && pixels[i + 1] < 70;
  const isRed = (i) => pixels[i] > 170 && pixels[i + 1] < 70 && pixels[i + 2] < 70;
  for (let y = top; y < end; y++) {
    for (let x = 0; x < width; x++) {
      if (isBlue((y * width + x) * channels)) lastBlue[x] = y;
    }
  }
  let count = 0;
  let deepest = 0;
  let deepestAt = null;
  for (let y = top; y < end; y++) {
    for (let x = 0; x < width; x++) {
      if (!isRed((y * width + x) * channels)) continue;
      const below = y - lastBlue[x];
      if (below > 2) {
        count++;
        if (below > deepest) {
          deepest = below;
          deepestAt = { x, y };
        }
      }
    }
  }
  return { count, deepest, where: deepestAt };
}

/** Every screencast frame through the pixel instrument. `cast` is
    `[{data (base64 png), ts (epoch ms)}]`. */
export function readInk(cast, epoch, options = {}) {
  const frames = [];
  for (const shot of cast) {
    const png = decodePng(Buffer.from(shot.data, 'base64'));
    const read = offFieldInk(png, options);
    frames.push({ at: Math.round(shot.ts - epoch), ...read });
  }
  const bad = frames.filter((f) => f.count >= INK_PIXELS);
  return {
    frames: frames.length,
    bad: bad.length,
    worst: bad.reduce((m, f) => (f.deepest > m.deepest ? f : m), { deepest: 0, count: 0, at: 0, where: null }),
    first: bad[0]?.at ?? null
  };
}

/** One line per scene, the way the report reads. */
export function summarise(result) {
  const g = result.geometry;
  const bits = [];
  if (g.overspill.length) bits.push('overspill ' + g.overspill.map((o) => `${o.name} +${o.reach}px@${o.at}ms`).join(' '));
  if (g.teleports.length) bits.push(`${g.teleports.length} teleport(s) ` + g.teleports.slice(0, 3).map((t) => `${t.name} ${t.jump}px@${t.at}ms`).join(' '));
  if (g.pops.length) bits.push(`${g.pops.length} pop(s) ` + g.pops.slice(0, 3).map((t) => `${t.name}@${t.at}ms`).join(' '));
  if (result.ink && result.ink.bad) bits.push(`ink off field in ${result.ink.bad}/${result.ink.frames} frames, deepest ${result.ink.worst.deepest}px@${result.ink.worst.at}ms`);
  if (result.jumps?.length) bits.push(`field height jumps ` + result.jumps.map((j) => `${j.jump}px@${j.at}ms`).join(' '));
  return bits;
}
