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
   ink pure green (the two custom properties, forced with !important), so a green
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
/** A step this size is a jump whatever surrounds it. */
export const TELEPORT_HARD = 14;
/** What counts as standing still on either side of a step. */
export const STILL_PX = 1.5;
/** An opacity step larger than this in one frame is an appearance or a
    disappearance in a single frame. Not lower: a fade on an ease-out spends
    0.7 of its range in its first 20ms (measured on the arriving title at
    1440), and that is a fade. */
export const POP = 0.8;
/** Visible enough to count. */
export const SEEN = 0.05;
/** Ink pixels below the field's own bottom, in one frame, before it is a
    finding. A glyph's antialiased fringe can leave a pixel or two. */
export const INK_PIXELS = 6;

/** The forced colours the pixel instrument reads. */
export const FIELD_RGB = '#0000ff';
export const INK_RGB = '#00ff00';
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
          /* Parts and rings are nested in the field's group, so their
             groups are placed relative to it. */
          const fieldGroup = gcs('::view-transition-group(field)');
          const base = num(fieldGroup.height) === null ? 0 : ty(fieldGroup.transform);
          for (const name of names) {
            const g = gcs(`::view-transition-group(${name})`);
            const h = num(g.height);
            if (h === null) continue;
            const side = name.includes('-a-') ? 'old' : 'new';
            const img = gcs(`::view-transition-${side}(${name})`);
            const s = img.scale && img.scale !== 'none' ? Number(img.scale) : 1;
            const top = base + ty(g.transform) + second(img.translate) + ty(img.transform);
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
              parts: [...field.querySelectorAll('[data-field-part]')].map((el) => {
                /* The words' own extent where there are words: a heading in a
                   one-cell grid is stretched to the tallest thing in the
                   cell, and a box that is taller than its text is not text
                   painted lower. */
                let r = el.getBoundingClientRect();
                if (el.textContent?.trim()) {
                  const range = document.createRange();
                  range.selectNodeContents(el);
                  const words = range.getBoundingClientRect();
                  if (words.height > 0) r = words;
                }
                /* A stable name per element, not per position: a keyed
                   heading leaves the DOM as its successor arrives, and the
                   index of the survivor changes under it. */
                el.__fieldPartId ??= (globalThis.__fieldPartIds = (globalThis.__fieldPartIds ?? 0) + 1);
                return {
                  n: (el.className.split(' ')[0] || 'part') + '#' + el.__fieldPartId,
                  text: (el.textContent ?? '').trim().slice(0, 12),
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
  /* Each part's frame-to-frame steps, judged once the run is in: whether a
     step is a jump depends on what its neighbours did. */
  const steps = new Map();
  let prev = null;
  for (const row of series) {
    if (row.edge === undefined || row.edge === null) {
      prev = null;
      continue;
    }
    for (const p of row.parts ?? []) {
      const reach = p.bottom - row.edge;
      /* A ring is cut by the field it is nested in, as the sun always is at
         rest, so its box reaching past the edge is not paint past it. */
      if (p.op > SEEN && reach > OVERSPILL_PX && !p.n.startsWith('sun-')) {
        const run = (streak.get(p.n) ?? 0) + 1;
        streak.set(p.n, run);
        if (run >= persist) {
          const cur = overspill.get(p.n);
          if (!cur || reach > cur.reach) overspill.set(p.n, { name: p.n, reach: Math.round(reach * 10) / 10, at: row.t });
        }
      } else streak.set(p.n, 0);
    }
    if (prev) {
      /* Per frame, not per sample: a dropped frame doubles what moved
         between two samples and is not a teleport. */
      const per = 16.7 / Math.max(row.t - prev.t, 16.7);
      for (const p of row.parts ?? []) {
        const q = prev.parts?.find((x) => x.n === p.n);
        if (!q) continue;
        if (Math.abs(p.op - q.op) * per > POP) pops.push({ name: p.n, at: row.t, from: q.op, to: p.op });
        if (p.op > SEEN && q.op > SEEN) {
          /* Two frames of reference, because the field moves in exactly one
             way: its bottom edge travels and its top stays. A thing printed
             near the edge rides it and holds still against the edge; a thing
             anchored to the top corner - the sun - holds still against the
             window. Either is glued. A teleport is a jump that neither
             explains, and it is read on the centre so a ring scaling about
             its own middle is not a ring moving. */
          const mid = p.mid ?? p.bottom;
          const midWas = q.mid ?? q.bottom;
          const now = row.edge - mid;
          const was = prev.edge - midWas;
          const step = Math.min(Math.abs(now - was), Math.abs(mid - midWas)) * per;
          const list = steps.get(p.n) ?? [];
          list.push({ at: row.t, step, jump: Math.round((now - was) * 10) / 10 });
          steps.set(p.n, list);
        }
      }
    }
    prev = row;
  }
  for (const [name, list] of steps) {
    list.forEach((s, i) => {
      const before = list[i - 1]?.step ?? 0;
      const after = list[i + 1]?.step ?? 0;
      /* An ease-out spends a quarter of its distance in its first frame, so
         a step is only a teleport if nothing is moving on either side of it,
         or if it is more than any ease-out of a field-sized distance does. */
      if (s.step >= TELEPORT_HARD || (s.step >= TELEPORT_PX && before < STILL_PX && after < STILL_PX))
        teleports.push({ name, at: s.at, jump: s.jump });
    });
  }
  teleports.sort((a, b) => a.at - b.at);
  return { overspill: [...overspill.values()], teleports, pops };
}

/** A change of the field's own height that is a jump rather than a move.
    The box animating to its new height is fine and starts fast: an ease-out
    spends about a quarter of the distance in its first frame. So a step under
    JUMP_PX is a jump only if it stands alone - nothing moving on either side
    of it - and a step over it always is. */
export const JUMP_PX = 12;
export function findHeightJumps(series) {
  const out = [];
  const d = (i) => (i > 0 && i < series.length ? series[i].height - series[i - 1].height : 0);
  for (let i = 1; i < series.length; i++) {
    const step = d(i);
    const alone = Math.abs(step) >= 1 && Math.abs(d(i - 1)) < 0.5 && Math.abs(d(i + 1)) < 0.5;
    if (Math.abs(step) >= JUMP_PX || alone)
      out.push({ at: series[i].t, from: series[i - 1].height, to: series[i].height, jump: Math.round(step * 10) / 10 });
  }
  return out;
}

/** Ink pixels (pure green) below the last blue pixel of their column, in one decoded
    frame. `top`..`bottom` bounds the rows read, which is how a frame that is
    mostly page stays cheap. Returns the count and how far below the field
    the lowest one is. */
export function offFieldInk(png, { top = 0, bottom = png.height } = {}) {
  const { width, height, channels, pixels } = png;
  const lastBlue = new Int32Array(width).fill(-1);
  const end = Math.min(bottom, height);
  /* Blue, or a wash of it: the outgoing and incoming blind are drawn
     additively over each other and over a screen that is fading in, so the
     field is not always pure. Page ground and text are never this blue. */
  const isBlue = (i) => pixels[i + 2] > 200 && pixels[i + 2] - Math.max(pixels[i], pixels[i + 1]) > 60;
  const isInk = (i) => pixels[i + 1] > 170 && pixels[i] < 70 && pixels[i + 2] < 70;
  for (let y = top; y < end; y++) {
    for (let x = 0; x < width; x++) {
      if (isBlue((y * width + x) * channels)) lastBlue[x] = y;
    }
  }
  /* The sun is drawn over the field in the flag's colours and its white
     stripe is the page's own colour, so where it crosses a column that
     column has no blue to measure the field's bottom by. Its columns are
     left out; they are the top corner, where no type is printed under it. */
  const sun = new Uint8Array(width);
  for (let x = 0; x < width; x++) {
    let seen = 0;
    for (let y = top; y < Math.min(top + 140, end); y++) {
      const i = (y * width + x) * channels;
      const hi = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
      const lo = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
      if (hi - lo > 40 && !isBlue(i) && !isInk(i)) seen++;
    }
    if (seen >= 8) sun[x] = 1;
  }
  let count = 0;
  let deepest = 0;
  let deepestAt = null;
  for (let y = top; y < end; y++) {
    for (let x = 0; x < width; x++) {
      if (sun[x] || !isInk((y * width + x) * channels)) continue;
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
