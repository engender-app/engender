/* The spike for phase 11 ticket 07 ("Look back becomes a set of deep
   readings"): the door rendered as a grid of reading tiles over the full
   fixture, with the real tokens, before any app code is written. The
   ticket gates the build on Alicja's notes against this render.

   A gallery script and not the app. It drives the demo build, fills every
   feature, opens /stats and reads every headline figure off the cards the
   door draws today (and off /body-map, /doubt/readings and /on-this-day for
   the three readings that live elsewhere), then takes the cards off the
   page and puts the tile grid in their place, built from the same tokens
   and role variables the cards were using. Nothing here is a component;
   the markup is the spike's own and is thrown away with it.

   Two variants of the tile, because rule 4 allows either and the choice is
   hers: `block`, a tile that is a block of the door's stripe with the name,
   the drawing and the figure written on it in the block's ink (the shape
   the two look-back tiles have now); `flush`, a tile on the page between
   hairlines, with the figure in the page's own ink and the drawing in the
   chart stripe (rule 9's ink). Both at 390px, two columns, equal heights,
   trans light and trans dark.

   Run from the worktree, after `VITE_DEMO=1 npm run build`:

     node tests/lookback-07-spike.mjs [--out /abs/dir]
*/
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const outDir = resolve(flag('out', resolve(here, '../.claude/lookback-07-spike')));

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];
const measured = {};

/* The tile grid's own style, injected once per page. Tokens only: every
   size, weight, colour and radius below is one the kit already defines.
   `--role-draw` and `--role-fill-ink` are what a block tile takes off the
   grid's role attributes (kit.css `.kit-tile`); `--role` is the chart
   stripe the flush variant's drawings take. */
const SPIKE_CSS = `
.sp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: 1fr;
  gap: var(--space-2);
}
.sp-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  min-height: 132px;
  text-decoration: none;
  color: inherit;
}
.sp-name {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 1.25;
}
.sp-name > span { min-width: 0; }
.sp-draw {
  display: block;
  height: 36px;
  width: 100%;
  margin-top: auto;
}
.sp-draw svg { display: block; width: 100%; height: 36px; overflow: visible; }
.sp-draw.is-strip { display: flex; gap: 2px; height: 14px; border-radius: 2px; overflow: hidden; }
.sp-draw.is-strip > span { display: block; height: 100%; }
.sp-draw.is-bars { display: flex; flex-direction: column; justify-content: flex-end; gap: 4px; height: 36px; }
.sp-draw.is-bars > span { display: block; flex: 0 0 8px; border-radius: 2px; }
.sp-head {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: var(--weight-display);
  letter-spacing: var(--display-track);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.sp-tile:not(:has(.sp-draw)) .sp-head { margin-top: auto; }
.sp-note {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 1.25;
}
.sp-chev {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  margin-top: -2px;
}

/* Block: the door's stripe as a block, kit-tile's own geometry. */
.sp-grid[data-variant='block'] .sp-tile {
  padding: var(--space-4);
  background: var(--role-draw);
  color: var(--role-fill-ink);
  border: 1px solid var(--outline);
  border-radius: var(--r-block);
}
.sp-grid[data-variant='block'] .sp-name { font-size: var(--text-block); font-weight: var(--weight-bold); }
.sp-grid[data-variant='block'] .sp-chev { color: var(--role-fill-ink); }
.sp-grid[data-variant='block'] .sp-draw { --ink: var(--role-fill-ink); --guide: color-mix(in oklab, var(--role-fill-ink) 45%, transparent); }
.sp-grid[data-variant='block'] .sp-note { color: var(--role-fill-ink); opacity: 0.8; }

/* Flush: on the page, hairlines, the chart stripe for the drawing. */
.sp-grid[data-variant='flush'] {
  gap: 0;
  border-top: 1px solid var(--hairline);
  border-bottom: 1px solid var(--hairline);
}
.sp-grid[data-variant='flush'] .sp-tile {
  padding: var(--space-4) 0;
  color: var(--text);
}
.sp-grid[data-variant='flush'] .sp-tile:nth-child(2n) { padding-left: var(--space-4); border-left: 1px solid var(--hairline); }
.sp-grid[data-variant='flush'] .sp-tile:nth-child(2n + 1) { padding-right: var(--space-4); }
.sp-grid[data-variant='flush'] .sp-tile:nth-child(n + 3) { border-top: 1px solid var(--hairline); }
.sp-grid[data-variant='flush'] .sp-name { color: var(--text-2); }
.sp-grid[data-variant='flush'] .sp-note { color: var(--text-2); }
.sp-grid[data-variant='flush'] .sp-chev { color: var(--text-2); }
.sp-grid[data-variant='flush'] .sp-draw { --ink: var(--role); --guide: var(--text-2); }

/* The resurfacing block: the pair as it is, and the on-this-day tile
   opened in place under it. */
.sp-open {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-3);
}
.sp-open-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: var(--touch-target);
  align-items: center;
}
.sp-open-title { font-size: var(--text-lg); font-weight: var(--weight-bold); }
`;

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', (err) => errors.push(`${theme}: ${String(err)}`));

  const strip = () =>
    page.evaluate(() => {
      for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
      for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    });

  const settle = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
    }
  };

  const dress = async () => {
    await settle('/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  };

  const shootDoor = async (name) => {
    await strip();
    const tall = await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-scroll-region]');
      const hidden = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
      return Math.min(window.innerHeight + hidden + 40, 12000);
    });
    await page.setViewportSize({ width: 390, height: tall });
    await page.waitForTimeout(500);
    const height = await page.evaluate(() => document.querySelector('.screen')?.getBoundingClientRect().height ?? 0);
    const file = `${outDir}/${name}-trans-${theme}.png`;
    await page.locator('[data-app-root]').screenshot({ path: file });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
    shots.push(`${name}-trans-${theme}`);
    return Math.round(height);
  };

  const shootElement = async (selector, name) => {
    await strip();
    const tall = await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-scroll-region]');
      const hidden = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
      return Math.min(window.innerHeight + hidden + 40, 12000);
    });
    await page.setViewportSize({ width: 390, height: tall });
    await page.waitForTimeout(400);
    const file = `${outDir}/${name}-trans-${theme}.png`;
    await page.locator(selector).first().screenshot({ path: file });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
    shots.push(`${name}-trans-${theme}`);
  };

  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await dress();

  /* --- Read the three readings that live on other screens first, so the
     final /stats visit is the one the grid is built on. */
  await settle('/stats');
  await page.waitForSelector('[data-lookback-rail]');
  await page.waitForSelector('[data-chart-card="highest-days"] [data-bar-row]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const links = await page.evaluate(() => ({
    bodyMap: document.querySelector('a[href^="/body-map"]')?.getAttribute('href') ?? null,
    compare: document.querySelector('a[href^="/compare"]')?.getAttribute('href') ?? null,
    wrapped: document.querySelector('[data-lookback-read]')?.getAttribute('href') ?? null
  }));

  let bodyMap = null;
  if (links.bodyMap) {
    await settle(links.bodyMap);
    await page.waitForSelector('[data-body-map-figure]', { timeout: 30000 });
    await page.waitForTimeout(1500);
    bodyMap = await page.evaluate(() => {
      const readings = [];
      for (const el of document.querySelectorAll('[data-body-map-figure] [aria-label]')) {
        const match = el.getAttribute('aria-label')?.match(/^(.+?): (dysphoria|euphoria) (\d+) out of 100/);
        if (match) readings.push({ region: match[1], axis: match[2], value: Number(match[3]) });
      }
      readings.sort((a, b) => b.value - a.value);
      return readings[0] ?? null;
    });
  }

  await settle('/doubt/readings');
  await page.waitForSelector('[data-chart-card="affirming-themes"] [data-bar-row], [data-safe-space-stats]', { timeout: 30000 });
  await page.waitForTimeout(1200);
  const themes = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-chart-card="affirming-themes"] [data-bar-row]')];
    return rows.slice(0, 3).map((row) => ({
      name: row.querySelector('[data-bar-name]')?.textContent?.trim() ?? '',
      value: row.querySelector('[data-bar-value]')?.textContent?.trim() ?? '',
      share: Number(row.querySelector('.kit-bar-mark')?.style.getPropertyValue('--bar-share') || 0)
    }));
  });

  await settle('/on-this-day');
  await page.waitForSelector('section[data-lookback]', { timeout: 30000 });
  await page.waitForTimeout(1200);
  const onThisDay = await page.evaluate(() => {
    const section = document.querySelector('section[data-lookback]');
    if (!section) return null;
    return {
      title: section.querySelector('[data-section-heading] h2')?.textContent?.trim() ?? '',
      openLabel: section.querySelector('[data-lookback-open]')?.textContent?.trim() ?? '',
      openHref: section.querySelector('[data-lookback-open]')?.getAttribute('href') ?? '',
      card: section.querySelector('.kit-day')?.outerHTML ?? ''
    };
  });

  /* --- The door itself. */
  await settle('/stats');
  await page.waitForSelector('[data-lookback-rail]');
  await page.waitForSelector('[data-chart-card="highest-days"] [data-bar-row]', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('.words-slot span').length > 3, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const read = await page.evaluate(() => {
    const text = (sel, root = document) => root.querySelector(sel)?.textContent?.trim() ?? '';
    const facts = [...document.querySelectorAll('[data-lookback-fact]')].map((row) => ({
      title: text('.kit-row-title', row) || row.textContent.trim(),
      value: text('.wrapped-figure-value', row)
    }));
    /* Day by day: the hidden values list is the series as text, newest
       first. */
    const values = [...document.querySelectorAll('[data-values-list] li')]
      .map((li) => Number((li.textContent.split(':')[1] ?? '').trim().split(/[,\s]/)[0]))
      .filter((n) => !Number.isNaN(n))
      .reverse();
    const dayByDay = document.querySelector('[data-chart-card="day-by-day"]');
    const dayMetric = text('.kit-chart-pick-label', dayByDay);
    const areaSvg = dayByDay?.querySelector('svg');
    const areaStyle = areaSvg ? getComputedStyle(areaSvg) : null;
    /* The constellation: the dots, normalised to the plot. */
    const cn = document.querySelector('[data-chart-card="constellation"]');
    const plot = cn?.querySelector('svg.cn-plot');
    const size = plot ? Number(plot.getAttribute('width')) : 0;
    const dots = plot
      ? [...plot.querySelectorAll('.cn-dot')].map((d) => ({
          x: Number(d.getAttribute('cx')) / size,
          y: Number(d.getAttribute('cy')) / size
        }))
      : [];
    const head = plot?.querySelector('.cn-head');
    const headAt = head
      ? { x: Number(head.getAttribute('cx') ?? head.getAttribute('x')) / size, y: Number(head.getAttribute('cy') ?? head.getAttribute('y')) / size }
      : dots[dots.length - 1] ?? null;
    const xEnds = cn ? [...cn.querySelectorAll('.cn-ends span')].map((s) => s.textContent.trim()) : [];
    const yEnds = cn ? [...cn.querySelectorAll('.cn-gutter span')].map((s) => s.textContent.trim()) : [];
    /* Days at each mood. */
    const steps = [...document.querySelectorAll('[data-strip-step]')].map((seg) => ({
      step: seg.dataset.stripStep,
      label: seg.getAttribute('aria-label') ?? '',
      share: Number(seg.style.getPropertyValue('--bar-share') || 0),
      color: getComputedStyle(seg).backgroundColor
    }));
    /* Words: biggest first. */
    const words = [...document.querySelectorAll('.words-slot span, .words-slot button')]
      .map((w) => ({ word: w.textContent.trim(), size: parseFloat(getComputedStyle(w).fontSize) }))
      .filter((w) => w.word)
      .sort((a, b) => b.size - a.size);
    /* Tags. */
    const tags = [...document.querySelectorAll('[data-paired-row]')].slice(0, 3).map((row) => ({
      name: text('[data-paired-name]', row),
      gap: text('[data-paired-gap]', row),
      note: text('.kit-paired-note', row)
    }));
    const tagsMetric = text('[data-chart-card="tags-moved"] .kit-chart-pick-label');
    /* Highest days. */
    const highest = [...document.querySelectorAll('[data-chart-card="highest-days"] [data-bar-row]')].slice(0, 4).map((row) => ({
      name: text('[data-bar-name]', row),
      value: text('[data-bar-value]', row),
      share: Number(row.querySelector('.kit-bar-mark')?.style.getPropertyValue('--bar-share') || 0)
    }));
    const highestMetric = text('[data-chart-card="highest-days"] .kit-chart-pick-label');
    /* Headings, in the catalogue's own words. */
    const heading = (kind) => text(`[data-chart-card="${kind}"] h3`);
    const headings = {
      dayByDay: heading('day-by-day'),
      constellation: heading('constellation'),
      moodDays: heading('mood-days'),
      tagShare: heading('tag-share'),
      words: text('[data-chart-card="words"] h3') || [...document.querySelectorAll('.kit-chart h3')].map((h) => h.textContent.trim()).find((t) => /word/i.test(t)) || 'Words that stand out',
      tags: heading('tags-moved'),
      highest: heading('highest-days')
    };
    const rows = [...document.querySelectorAll('.kit-row')];
    const rowTitle = (href) => rows.find((r) => r.querySelector(`a[href^="${href}"]`) || r.matches(`a[href^="${href}"]`))?.querySelector('.kit-row-title')?.textContent?.trim() ?? '';
    const bodyMapTitle = rowTitle('/body-map') || text('a[href^="/body-map"] .kit-row-title') || 'Body map';
    const compareTitle = rowTitle('/compare') || text('a[href^="/compare"] .kit-row-title') || 'Compare periods';
    const compareHref = document.querySelector('a[href^="/compare"]')?.getAttribute('href') ?? '';
    const grid = document.querySelector('[data-tile-grid]');
    const chart = document.querySelector('[data-chart-card="day-by-day"]');
    return {
      facts,
      values,
      dayMetric,
      areaStroke: areaStyle ? areaStyle.color : null,
      dots,
      headAt,
      xEnds,
      yEnds,
      steps,
      words: words.slice(0, 4),
      tags,
      tagsMetric,
      highest,
      highestMetric,
      headings,
      bodyMapTitle,
      compareTitle,
      compareHref,
      tileGridStyle: grid?.getAttribute('style') ?? '',
      tileGridRole: grid?.getAttribute('data-role') ?? null,
      chartStyle: chart?.getAttribute('style') ?? '',
      wrappedCard: document.querySelector('[data-wrapped-card]')?.outerHTML ?? '',
      onThisDayCard: document.querySelector('[data-on-this-day-card]')?.outerHTML ?? ''
    };
  });
  measured[`${theme}-read`] = { ...read, wrappedCard: undefined, onThisDayCard: undefined };

  /* Compose the headlines. */
  const fmt = (iso) => {
    const [y, mo, d] = iso.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  const compareParams = new URLSearchParams(read.compareHref.split('?')[1] ?? '');
  const compareHead = compareParams.get('bStart') ? `${fmt(compareParams.get('bStart'))} to ${fmt(compareParams.get('bEnd'))}` : '';
  const avgFact = read.facts.find((f) => /average/i.test(f.title));
  const topStep = [...read.steps].sort((a, b) => b.share - a.share)[0];
  const moodWord = topStep ? topStep.label.split(' ')[0] : '';
  const cnWords = read.headAt
    ? [read.headAt.x >= 0.5 ? read.xEnds[1] : read.xEnds[0], read.headAt.y <= 0.5 ? read.yEnds[0] : read.yEnds[1]].filter(Boolean)
    : [];

  const span = compareParams.get('aStart') ? `?from=${compareParams.get('aStart')}&to=${compareParams.get('aEnd')}` : '';
  const chevron = '<svg class="sp-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

  const sparkline = (values) => {
    if (values.length < 2) return '';
    const w = 100;
    const h = 36;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = max === min ? h / 2 : h - 2 - ((v - min) / (max - min)) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `<span class="sp-draw"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" vector-effect="non-scaling-stroke"/></svg></span>`;
  };
  const plane = (dots, head) => {
    if (!dots.length) return '';
    const s = 36;
    const pts = dots.map((d) => `${(d.x * s).toFixed(1)},${(d.y * s).toFixed(1)}`).join(' ');
    const hx = head ? (head.x * s).toFixed(1) : null;
    const hy = head ? (head.y * s).toFixed(1) : null;
    return `<span class="sp-draw is-plane"><svg viewBox="0 0 ${s} ${s}" preserveAspectRatio="xMinYMid meet" aria-hidden="true" style="width:${s}px">
      <path d="M${s / 2} 0V${s}M0 ${s / 2}H${s}" stroke="var(--guide)" stroke-width="1"/>
      <polyline points="${pts}" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" opacity="0.7"/>
      ${hx !== null ? `<circle cx="${hx}" cy="${hy}" r="3" fill="var(--ink)"/>` : ''}
    </svg></span>`;
  };
  const stripDraw = (steps, variant) =>
    `<span class="sp-draw is-strip">${steps
      .map((st, i) => {
        const bg = variant === 'flush' ? st.color : `color-mix(in oklab, var(--ink) ${Math.round(30 + (i / Math.max(steps.length - 1, 1)) * 70)}%, transparent)`;
        return `<span style="flex:${Math.max(st.share, 0.5)};background:${bg}"></span>`;
      })
      .join('')}</span>`;
  const barsDraw = (rows) =>
    `<span class="sp-draw is-bars">${rows
      .slice(0, 3)
      .map((r) => `<span style="width:${Math.round(Math.min(Math.max(r.share, 4), 100))}%;background:var(--ink)"></span>`)
      .join('')}</span>`;

  const tile = ({ href, name, draw = '', head, note = '' }) =>
    `<a class="sp-tile" href="${href}"><span class="sp-name"><span>${name}</span>${chevron}</span>${draw}<span class="sp-head">${head}</span>${note ? `<span class="sp-note">${note}</span>` : ''}</a>`;

  const tiles = (variant) =>
    [
      tile({ href: `/stats/day-by-day${span}`, name: read.headings.dayByDay, draw: sparkline(read.values), head: avgFact?.value ?? '', note: avgFact?.title ?? read.dayMetric }),
      read.dots.length
        ? tile({ href: `/stats/plane${span}`, name: read.headings.constellation, draw: plane(read.dots, read.headAt), head: cnWords.join(', '), note: '' })
        : '',
      tile({ href: `/stats/days${span}`, name: 'How the days fell', draw: stripDraw(read.steps, variant), head: moodWord, note: topStep ? topStep.label.split('·')[0].replace(moodWord, '').trim() : '' }),
      read.words.length ? tile({ href: `/stats/words${span}`, name: read.headings.words, head: read.words[0].word, note: read.words.slice(1, 3).map((w) => w.word).join(', ') }) : '',
      read.tags.length ? tile({ href: `/stats/tags${span}`, name: read.headings.tags, head: read.tags[0].name, note: `${read.tags[0].gap} ${read.tagsMetric}`.trim() }) : '',
      read.highest.length ? tile({ href: `/stats/highest${span}`, name: read.headings.highest, draw: barsDraw(read.highest), head: read.highest[0].name, note: `${read.highest[0].value} ${read.highestMetric}`.trim() }) : '',
      bodyMap ? tile({ href: links.bodyMap ?? '/body-map', name: read.bodyMapTitle, head: bodyMap.region, note: `${bodyMap.axis} ${bodyMap.value}` }) : '',
      compareHead ? tile({ href: read.compareHref, name: read.compareTitle, head: compareHead, note: 'the stretch before' }) : '',
      themes.length ? tile({ href: `/stats/themes${span}`, name: 'Affirming themes', draw: barsDraw(themes), head: themes[0].name, note: themes[0].value }) : ''
    ]
      .filter(Boolean)
      .join('');

  const render = async (variant) => {
    await page.evaluate(
      ({ variant, css, tilesHtml, tileGridStyle, chartStyle, wrappedCard, onThisDayCard, onThisDay }) => {
        if (!document.getElementById('sp-style')) {
          const style = document.createElement('style');
          style.id = 'sp-style';
          style.textContent = css;
          document.head.appendChild(style);
        }
        const screen = document.querySelector('.screen');
        /* Restore a clean door on the second variant. */
        for (const el of screen.querySelectorAll('[data-spike]')) el.remove();
        const children = [...screen.children];
        const facts = children.find((el) => el.querySelector?.('[data-lookback-fact]'));
        const rail = screen.querySelector('[data-lookback-rail]');
        const picks = children.find((el) => el.matches('nav, .segmented, [data-segmented]') || /Last week/.test(el.textContent ?? ''));
        const readLine = screen.querySelector('.lookback-line');
        /* Everything from the first thing after the facts down goes, apart
           from the sheet at the end. */
        let after = false;
        for (const el of children) {
          if (el === facts) { after = true; continue; }
          if (!after) continue;
          if (el.matches('[data-sheet], .sheet, dialog')) continue;
          /* The picks and the wrapped link are the door's own and are moved,
             not replaced; everything else after the facts goes. */
          if (el === picks || el === readLine) continue;
          el.remove();
        }
        const mount = (html) => {
          const tpl = document.createElement('template');
          tpl.innerHTML = html.trim();
          const node = tpl.content.firstElementChild;
          node.setAttribute('data-spike', '');
          screen.appendChild(node);
          return node;
        };
        /* The picks and the wrapped link, after the facts (ticket 07's own
           order for the door). */
        if (picks) screen.appendChild(picks);
        if (readLine) screen.appendChild(readLine);
        const grid = mount(`<nav class="sp-grid" data-kit-surface data-kit-role data-variant="${variant}" aria-label="Readings" style="${variant === 'block' ? tileGridStyle : chartStyle}">${tilesHtml}</nav>`);
        grid.setAttribute('data-spike-grid', '');
        /* Resurfacing: the pair as it stands, the on-this-day tile opened
           in place under it. */
        const pair = mount(`<div class="kit-tiles" data-kit-surface data-kit-role data-tile-grid data-tight style="${tileGridStyle}">${wrappedCard}${onThisDayCard}</div>`);
        pair.setAttribute('data-spike-pair', '');
        if (onThisDay?.card) {
          mount(`<div class="sp-open" data-spike-open>
            <div class="sp-open-head"><span class="sp-open-title">${onThisDay.title}</span><a class="kit-heading-action" href="${onThisDay.openHref}">${onThisDay.openLabel}</a></div>
            ${onThisDay.card}
          </div>`);
        }
      },
      {
        variant,
        css: SPIKE_CSS,
        tilesHtml: tiles(variant),
        tileGridStyle: read.tileGridStyle,
        chartStyle: read.chartStyle,
        wrappedCard: read.wrappedCard,
        onThisDayCard: read.onThisDayCard,
        onThisDay
      }
    );
    await page.waitForTimeout(700);
  };

  for (const variant of ['block', 'flush']) {
    await render(variant);
    const height = await shootDoor(`01-door-${variant}`);
    await shootElement('[data-spike-grid]', `02-grid-${variant}`);
    const tileHeights = await page.evaluate(() =>
      [...document.querySelectorAll('[data-spike-grid] .sp-tile')].map((t) => Math.round(t.getBoundingClientRect().height))
    );
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll('[data-spike-grid] .sp-tile')].map((t) => {
        const box = t.getBoundingClientRect();
        const inner = [...t.querySelectorAll('*')].reduce((max, el) => Math.max(max, el.getBoundingClientRect().right), 0);
        return Math.round(inner - box.right);
      })
    );
    measured[`${theme}-${variant}`] = { doorHeight: height, tileHeights, overflow };
  }
  await shootElement('[data-spike-pair]', '03-resurfacing-pair');
  await shootElement('[data-spike-open]', '03-resurfacing-open');

  await page.close();
}

await writeFile(`${outDir}/measured.json`, JSON.stringify(measured, null, 2));
console.log(`${shots.length} shot(s) in ${outDir}:`);
for (const s of shots) console.log(' -', s);
for (const [key, value] of Object.entries(measured)) {
  if (value.doorHeight) console.log(`   ${key}: door ${value.doorHeight}px, tiles ${value.tileHeights.join('/')}, overflow ${value.overflow.join('/')}`);
}
if (errors.length) {
  console.log(`\n${errors.length} PAGE ERROR(S):`);
  for (const e of errors) console.log(' -', e);
}

app.httpServer.close();
await browser.close();
process.exit(errors.length ? 1 : 0);
