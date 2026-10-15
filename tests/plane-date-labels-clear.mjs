/* Two scales at once writes its dates clear of the drawn series and readable
   (last-audit UI 49, audit U41).

   On the demo journal the audit found "21 Sept" and "11 Oct" struck through
   by dots and trail joins, and "17 Sept" at about 1.5:1 against the card.
   The labels were placed against each other only, never against the marks
   they sit among, and each one took its point's fading weight as its
   opacity, down to 0.25.

   What it holds, on the demo journal's /stats/plane at 390px (light and
   dark, English and Polish, text at 100% and 200%) and at 1280px, with the
   head at the end of the path and scrubbed back to two earlier readings:

   - no date label's text box comes within 1px of a dot, of the head's ring
     or of a trail join, each measured at its painted size (radius plus the
     outer half of its stroke, a join's half-width);
   - no two labels overlap, every label lies inside the plot it is clipped
     to, and none sits under the readout box in the plot's corner;
   - every label's ink, its opacity composited over the card it is drawn
     on, reaches 4.5:1 (SCREENS.md's floor for body text);
   - the plot still draws its dots, the scrub still moves the readout's
     date, and the play control is there;
   - with motion on, across a play sweep and twenty arrow-key steps, no
     date arrives or leaves at full opacity in one frame: the days fade out
     while the head moves and back in once it rests, sampled on every
     animation frame.

   Fails on fc8d8512 (labels on dots and joins, labels at 1.5:1, and 46
   label arrivals in the sweep, each a cut). Run with
   `node tests/plane-date-labels-clear.mjs`. */
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium, setAppLanguage, settlePage } from './browser-harness.mjs';

const CASES = [
  { width: 390, height: 844, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
  { width: 390, height: 844, theme: 'light', text: 200 },
  { width: 1280, height: 900, theme: 'dark' },
  { width: 390, height: 844, theme: 'light', locale: 'pl' }
];
/** Readings scrubbed back from the end, besides the end itself. */
const SCRUBS = [0, 9, 23];
const MIN_CLEARANCE = 1;
const MIN_CONTRAST = 4.5;

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await launchChromium();
const failures = [];

/** The plot at rest: every dot, join and label where it was 600ms ago. */
async function untilPlotSettles(page) {
  await page.locator('.cn-plot .cn-dot').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const deadline = Date.now() + 15000;
  let last = '';
  let since = Date.now();
  for (;;) {
    if (Date.now() > deadline) throw new Error('the plane never came to rest');
    const now = await page.evaluate(() =>
      JSON.stringify(
        [...document.querySelectorAll('.cn-plot circle, .cn-plot line, .cn-plot text, .cn-readout')].map((el) => {
          const r = el.getBoundingClientRect();
          return [el.textContent, r.left, r.top, r.width, r.height];
        })
      )
    );
    if (now !== last) {
      last = now;
      since = Date.now();
    } else if (Date.now() - since >= 600) return;
    await page.waitForTimeout(100);
  }
}

/** Everything on the plot in its own pixels (the viewBox is the plot's
    size), plus each label's colour against the card under it. */
function readPlot() {
  const svg = document.querySelector('.cn-plot');
  const size = svg.viewBox.baseVal.width;
  const num = (v) => Number.parseFloat(v) || 0;
  const painted = (el) => {
    const style = getComputedStyle(el);
    return style.stroke === 'none' || num(style.strokeWidth) === 0 ? 0 : num(style.strokeWidth) / 2;
  };
  const circles = [...svg.querySelectorAll('circle')].map((c) => ({
    kind: c.classList.contains('cn-dot') ? 'dot' : 'head',
    x: c.cx.baseVal.value,
    y: c.cy.baseVal.value,
    r: c.r.baseVal.value + painted(c)
  }));
  const joins = [...svg.querySelectorAll('.cn-trail line')].map((l) => ({
    x1: l.x1.baseVal.value,
    y1: l.y1.baseVal.value,
    x2: l.x2.baseVal.value,
    y2: l.y2.baseVal.value,
    half: painted(l)
  }));
  /* The ground a label is read against: the first ancestor that paints
     one. */
  let ground = 'rgb(255, 255, 255)';
  for (let el = svg; el; el = el.parentElement) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) {
      ground = bg;
      break;
    }
  }
  const labels = [...svg.querySelectorAll('.cn-point-label')].map((t) => {
    const b = t.getBBox();
    const style = getComputedStyle(t);
    return {
      text: [...t.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim(),
      left: b.x,
      top: b.y,
      right: b.x + b.width,
      bottom: b.y + b.height,
      fill: style.fill,
      opacity: num(style.opacity) * num(style.fillOpacity || '1')
    };
  });
  const plotBox = svg.getBoundingClientRect();
  const readout = document.querySelector('.cn-readout')?.getBoundingClientRect();
  return {
    size,
    circles,
    joins,
    labels,
    ground,
    readout: readout && {
      left: readout.left - plotBox.left,
      top: readout.top - plotBox.top,
      right: readout.right - plotBox.left,
      bottom: readout.bottom - plotBox.top
    },
    readoutText: document.querySelector('.cn-readout [aria-hidden="true"]')?.textContent ?? '',
    play: Boolean(document.querySelector('[data-constellation-play]'))
  };
}

const channels = (css) => css.match(/[\d.]+/g).map(Number);
const luminance = ([r, g, b]) => {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (fill, opacity, ground) => {
  const [fr, fg, fb, fa = 1] = channels(fill);
  const g = channels(ground).slice(0, 3);
  const a = fa * opacity;
  const ink = [fr, fg, fb].map((c, i) => c * a + g[i] * (1 - a));
  const [hi, lo] = [luminance(ink), luminance(g)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** How far a circle's painted edge sits outside a box; negative is inside. */
const circleGap = (box, c) => {
  const dx = Math.max(box.left - c.x, 0, c.x - box.right);
  const dy = Math.max(box.top - c.y, 0, c.y - box.bottom);
  return Math.hypot(dx, dy) - c.r;
};
/** Whether any part of a join's centre line lies inside a box, by clipping
    the line to the box (Liang-Barsky). */
const joinEnters = (box, j) => {
  const dx = j.x2 - j.x1;
  const dy = j.y2 - j.y1;
  let lo = 0;
  let hi = 1;
  for (const [p, q] of [
    [-dx, j.x1 - box.left],
    [dx, box.right - j.x1],
    [-dy, j.y1 - box.top],
    [dy, box.bottom - j.y1]
  ]) {
    if (p === 0) {
      if (q < 0) return false;
    } else if (p < 0) lo = Math.max(lo, q / p);
    else hi = Math.min(hi, q / p);
  }
  return lo <= hi;
};
/** How far a join's painted edge sits outside a box: apart, the nearest
    two points are an end of the join and the box, or a corner of the box
    and the join. */
const joinGap = (box, j) => {
  if (joinEnters(box, j)) return -j.half;
  const toJoin = (x, y) => {
    const dx = j.x2 - j.x1;
    const dy = j.y2 - j.y1;
    const t = Math.max(0, Math.min(1, ((x - j.x1) * dx + (y - j.y1) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - (j.x1 + t * dx), y - (j.y1 + t * dy));
  };
  const corners = [
    [box.left, box.top],
    [box.right, box.top],
    [box.right, box.bottom],
    [box.left, box.bottom]
  ];
  return (
    Math.min(
      circleGap(box, { x: j.x1, y: j.y1, r: 0 }),
      circleGap(box, { x: j.x2, y: j.y2, r: 0 }),
      ...corners.map(([x, y]) => toJoin(x, y))
    ) - j.half
  );
};

/** Every date label on every animation frame, from a sampler started in
    the page, across a play sweep and a keyboard scrub. */
async function sampleLabelFrames(page) {
  await page.evaluate(() => {
    window.__labelFrames = [];
    const loop = (t) => {
      window.__labelFrames.push({
        t,
        labels: [...document.querySelectorAll('.cn-point-label')].map((el) => ({
          key: `${el.lastChild.textContent.trim()}@${el.getAttribute('x')},${el.getAttribute('y')}`,
          opacity: Number(getComputedStyle(el).opacity)
        }))
      });
      if (!window.__labelFramesStop) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.locator('[data-constellation-play]').click();
  await page.waitForTimeout(300);
  await untilPlotSettles(page);
  await page.locator('.cn-scrub [role="slider"]').focus();
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(60);
  }
  await untilPlotSettles(page);
  return page.evaluate(() => {
    window.__labelFramesStop = true;
    return window.__labelFrames;
  });
}

try {
  {
    const label = '390px light, motion on';
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await settlePage(page, base, 'stats/plane', 'light');
    await untilPlotSettles(page);
    const frames = await sampleLabelFrames(page);
    let arrivals = 0;
    for (let i = 1; i < frames.length; i += 1) {
      const before = new Map(frames[i - 1].labels.map((l) => [l.key, l.opacity]));
      const now = new Map(frames[i].labels.map((l) => [l.key, l.opacity]));
      for (const [key, opacity] of now) {
        if (before.has(key)) continue;
        arrivals += 1;
        if (opacity >= 0.95) failures.push(`${label}: ${key} arrives at ${opacity.toFixed(2)} in frame ${i} (${frames[i].t.toFixed(0)}ms)`);
      }
      for (const [key, opacity] of before)
        if (!now.has(key) && opacity >= 0.95) failures.push(`${label}: ${key} leaves from ${opacity.toFixed(2)} in frame ${i} (${frames[i].t.toFixed(0)}ms)`);
    }
    if (arrivals === 0) failures.push(`${label}: no date arrived in ${frames.length} frames, so nothing was sampled`);
    console.log(`${failures.length ? 'FAIL' : 'ok  '} ${label}: ${frames.length} frames, ${arrivals} date arrivals`);
    await context.close();
  }

  for (const c of CASES) {
    const label = `${c.width}px ${c.theme}${c.locale ? ` ${c.locale}` : ''}${c.text ? ` text ${c.text}%` : ''}`;
    const fail = (message) => {
      failures.push(`${label}: ${message}`);
      console.error(`  - ${message}`);
    };
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (c.locale) {
      await settlePage(page, base, 'settings', c.theme);
      await setAppLanguage(page, c.locale);
    }
    await page.setViewportSize({ width: c.width, height: c.height });
    await settlePage(page, base, 'stats/plane', c.theme);
    if (c.text) await page.evaluate((t) => (document.documentElement.style.fontSize = `${t}%`), c.text);
    await untilPlotSettles(page);

    const slider = page.locator('.cn-scrub [role="slider"]');
    const summary = [];
    let labelled = 0;
    let lowest = Infinity;
    let nearestMark = Infinity;
    let previousReadout = null;
    for (const back of SCRUBS) {
      if (back > 0) {
        await slider.focus();
        await page.keyboard.press('End');
        for (let i = 0; i < back; i += 1) await page.keyboard.press('ArrowLeft');
        await untilPlotSettles(page);
      }
      const plot = await page.evaluate(readPlot);
      const at = `${back} back`;
      if (!plot.play) fail(`${at}: the play control is gone`);
      if (plot.circles.filter((x) => x.kind === 'dot').length < 2) fail(`${at}: the plot draws fewer than two dots`);
      if (previousReadout !== null && plot.readoutText === previousReadout) fail(`${at}: scrubbing left the readout on ${previousReadout}`);
      previousReadout = plot.readoutText;
      labelled += plot.labels.length;

      for (const [index, box] of plot.labels.entries()) {
        const name = `"${box.text}" (${at})`;
        if (box.left < -0.5 || box.top < -0.5 || box.right > plot.size + 0.5 || box.bottom > plot.size + 0.5)
          fail(`${name} runs outside the ${plot.size.toFixed(0)}px plot`);
        for (const circle of plot.circles) {
          const gap = circleGap(box, circle);
          nearestMark = Math.min(nearestMark, gap);
          if (gap < MIN_CLEARANCE) fail(`${name} comes ${gap.toFixed(2)}px from a ${circle.kind} at ${circle.x.toFixed(1)},${circle.y.toFixed(1)}`);
        }
        for (const join of plot.joins) {
          const gap = joinGap(box, join);
          nearestMark = Math.min(nearestMark, gap);
          if (gap < MIN_CLEARANCE) fail(`${name} comes ${gap.toFixed(2)}px from a trail join`);
        }
        for (const other of plot.labels.slice(index + 1)) {
          if (other.left < box.right && other.right > box.left && other.top < box.bottom && other.bottom > box.top)
            fail(`${name} overlaps "${other.text}"`);
        }
        const r = plot.readout;
        if (r && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top)
          fail(`${name} sits under the readout`);
        const ratio = contrast(box.fill, box.opacity, plot.ground);
        lowest = Math.min(lowest, ratio);
        if (ratio < MIN_CONTRAST) fail(`${name} is ${ratio.toFixed(2)}:1 against the card (needs ${MIN_CONTRAST})`);
      }
      summary.push(`${at} ${plot.labels.length} labels`);
    }
    if (labelled === 0) fail('no date label was drawn at any scrub position');

    if (errors.length) fail(`page errors: ${errors.join('; ')}`);
    console.log(
      `${failures.some((f) => f.startsWith(`${label}:`)) ? 'FAIL' : 'ok  '} ${label}: ${summary.join(', ')}; nearest mark ${nearestMark.toFixed(1)}px; lowest contrast ${lowest.toFixed(2)}:1`
    );
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('PASS plane-date-labels-clear');
