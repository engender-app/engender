/* Check 48px touch targets and full nav labels on a demo build. Include
   pseudo-element hit extensions. Sample elementFromPoint in 0.25px steps
   up to 60px on each axis. Adjust bounds for discrepancies over 1px.
   The 47px proof must fail and the 48px proof must pass.

   Test 320px and 390px at 100% and 200% text, with nav labels also at 130%.
   Use 195px to simulate 200% zoom on a 390px phone. Check English and Polish,
   clipping ancestors and control overlap. Calendar dates at 320px report
   only, since seven 48px columns need 336px.

   Run VITE_DEMO=1 npm run build, then node tests/tools/a11y-targets-large-text.mjs.
   Use --root, --url, --out or --only to select inputs and results. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setAppLanguage, launchChromium, settlePage, previewBuild, toEntryStepWith } from '../browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, RESET_PERSONA_EXPRESSION } from '../yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const FLOOR = 48;
const out = flag('out', null);
const only = flag('only', null)?.split(',');

/** Each scene names a route and the controls on it the audits listed. */
const SCENES = [
  { key: 'home', path: '/', targets: '.kit-tile-act, .home-fold' },
  { key: 'settings', path: '/settings', targets: '.segment' },
  { key: 'wear', path: '/body/wear', targets: '.segment, .tag-chip' },
  { key: 'body-map', path: '/body-map', targets: '.tag-chip' },
  { key: 'letters', path: '/transition/letters', targets: '.letter-act, [data-letter-open]', narrow: true },
  { key: 'eras', path: '/transition/milestones', targets: '[data-tl-era]' },
  {
    /* At rest the year rail takes no pointer at all (it wakes on a scroll,
       a hover or focus), so it is measured awake, through focus. It is
       sticky, which scrollIntoView does not move, so the screen is scrolled
       to its end instead, where the whole rail sits clear of the bar; at
       200% text on a short grid a mid-scroll position can leave the last
       year under the bar the way any row scrolls under it. */
    key: 'photos',
    path: '/media/photos',
    targets: '.photo-year',
    sticky: true,
    open: (page) =>
      page.evaluate(() => {
        const region = document.querySelector('[data-app-scroll-region]');
        region.scrollTop = region.scrollHeight;
        document.querySelector('.photo-year')?.focus({ preventScroll: true });
      })
  },
  { key: 'clinician', path: '/health/clinician-summary', targets: '.dossier-row-link' },
  {
    /* A new entry's first step: the faces and
       the two ways on, finish now and continue. */
    key: 'entry-first-step',
    path: '/entry/new/today',
    targets: '[data-first-step-moods] [data-mood], [data-entry-finish], [data-entry-continue]'
  },
  {
    /* The mode chips and the tags, wrapped per group, live on a new entry's marks step. */
    key: 'entry',
    path: '/entry/new/today',
    targets: 'button.contextual-chip, .tag-chip',
    open: (page) => toEntryStepWith(page, '[data-editor-section="tags"]')
  },
  { key: 'stats', path: '/stats/tags', targets: '.kit-donut-item-btn' },
  { key: 'journal', path: '/calendar', targets: '[data-cal-month-btn], .cal-field > a', whole: '[data-cal-month-btn]', apart: true, narrow: true },
  { key: 'labs', path: '/care/labs', targets: '[data-screen-back], .header-action > *', apart: true, narrow: true },
  { key: 'in-the-room', path: '/health/appointments/in-the-room', targets: '[data-screen-back]', whole: '[data-room-question]', narrow: true },
  { key: 'voice', path: '/media/recordings', targets: '[data-transport-toggle]' },
  /* Everything a new entry's later steps draw that a finger can press, not only the chips:
     the info buttons beside the tag chips were 43px wide for a while and the chips-only
     scene above never saw them. One scene per step, with the foot, the back control and the
     star on the field. */
  ...[['entry-marks', '[data-editor-section="tags"]'], ['entry-body', '[data-editor-section="body"]'], ['entry-writing', '#ed-note']].map(([key, part]) => ({
    key,
    path: '/entry/new/today',
    targets: '[data-entry-step] :is(button, a[href], input:not([type="hidden"]), textarea, select, [role="slider"], [role="switch"], [role="button"], summary), [data-entry-finish], [data-entry-continue], [data-screen-back], [data-save-star]',
    open: (page) => toEntryStepWith(page, part)
  }))
];

const WIDTHS = [320, 390];
const NARROW = 195;
const TEXT = [100, 200];
const NAV_TEXT = [100, 130, 200];

/** Waits for the screen to stop moving: finite animations finished, then
    the targets' rects unchanged across 600ms. */
async function settle(page, selector) {
  await page.waitForFunction(
    () => document.getAnimations().every((a) => a.effect?.getComputedTiming().endTime === Infinity || a.playState !== 'running'),
    null,
    { timeout: 10000 }
  ).catch(() => {});
  let last = '';
  for (let i = 0; i < 20; i++) {
    const now = await page.evaluate(
      (sel) => JSON.stringify([...document.querySelectorAll(sel)].map((e) => {
        const r = e.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map(Math.round);
      })),
      selector
    );
    if (now === last) return;
    last = now;
    await page.waitForTimeout(600);
  }
}

/** Hit extents of every visible matching control, measured from its centre. */
function measure(page, selector, sticky = false) {
  return page.evaluate(([sel, sticky]) => {
    const CAP = 60;
    const STEP = 0.25;
    const shown = (e) => {
      const b = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && !e.closest('[aria-hidden="true"],[inert]') && !e.disabled;
    };
    const rows = [];
    for (const e of [...document.querySelectorAll(sel)].filter(shown)) {
      if (!sticky) e.scrollIntoView({ block: 'center', inline: 'nearest' });
      const b = e.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      const owns = (x, y) => {
        const h = document.elementFromPoint(x, y);
        return !!h && (h === e || e.contains(h));
      };
      const name = (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!owns(cx, cy)) {
        const h = document.elementFromPoint(cx, cy);
        rows.push({ name, box: `${Math.round(b.width)}x${Math.round(b.height)}`, w: 0, h: 0, covered: h ? `${h.tagName.toLowerCase()}.${[...h.classList].join('.')}` : 'nothing' });
        continue;
      }
      let l = 0, r = 0, t = 0, d = 0;
      while (l < CAP && owns(cx - l - STEP, cy)) l += STEP;
      while (r < CAP && owns(cx + r + STEP, cy)) r += STEP;
      while (t < CAP && owns(cx, cy - t - STEP)) t += STEP;
      while (d < CAP && owns(cx, cy + d + STEP)) d += STEP;
      /* The box, joined with a pseudo-element extension placed against its
         padding box (only a positioned control is that containing block). */
      const own = getComputedStyle(e);
      let { left, right, top, bottom } = b;
      if (own.position !== 'static') {
        for (const pseudo of ['::before', '::after']) {
          const p = getComputedStyle(e, pseudo);
          if (p.content === 'none' || p.display === 'none' || p.pointerEvents === 'none' || p.position !== 'absolute') continue;
          const x = b.left + parseFloat(own.borderLeftWidth) + parseFloat(p.left);
          const y = b.top + parseFloat(own.borderTopWidth) + parseFloat(p.top);
          left = Math.min(left, x);
          right = Math.max(right, x + parseFloat(p.width));
          top = Math.min(top, y);
          bottom = Math.max(bottom, y + parseFloat(p.height));
        }
      }
      /* The layout edge, unless the walk is more than the snap away from it. */
      const side = (walked, edge) => (Math.abs(walked - edge) > 1 ? walked : edge);
      const w = side(l, cx - left) + side(r, right - cx);
      const h = side(t, cy - top) + side(d, bottom - cy);
      rows.push({ name, box: `${Math.round(b.width)}x${Math.round(b.height)}`, w, h });
    }
    return rows;
  }, [selector, sticky]);
}

/** Words of each matching element that do not show whole: the range of
    its text past the viewport or past an ancestor that clips sideways. */
function cut(page, selector) {
  return page.evaluate((sel) => {
    const rows = [];
    for (const e of document.querySelectorAll(sel)) {
      const range = document.createRange();
      range.selectNodeContents(e);
      const t = range.getBoundingClientRect();
      if (!t.width) {
        rows.push(`${sel} paints no text`);
        continue;
      }
      let by = t.left < -0.5 || t.right > innerWidth + 0.5 ? 'the viewport' : '';
      for (let a = e.parentElement; a && !by; a = a.parentElement) {
        if (getComputedStyle(a).overflowX === 'visible') continue;
        const r = a.getBoundingClientRect();
        if (t.left < r.left - 0.5 || t.right > r.right + 0.5) by = `${a.tagName.toLowerCase()}.${[...a.classList].join('.')}`;
      }
      if (by) rows.push(`"${e.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)}" runs ${Math.round(t.width)}px wide, cut by ${by}`);
    }
    return rows;
  }, selector);
}

/** Pairs of matching controls whose boxes overlap. */
function stacked(page, selector) {
  return page.evaluate((sel) => {
    const boxes = [...document.querySelectorAll(sel)]
      .filter((e) => e.getBoundingClientRect().width > 0 && !e.closest('[aria-hidden="true"],[inert]'))
      .map((e) => [(e.getAttribute('aria-label') || e.textContent).trim().slice(0, 30), e.getBoundingClientRect()]);
    const rows = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const [an, a] = boxes[i];
      const [bn, b] = boxes[j];
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (x > 0.5 && y > 0.5) rows.push(`"${an}" and "${bn}" overlap ${x.toFixed(1)}x${y.toFixed(1)}`);
    }
    return rows;
  }, selector);
}

/** Every nav label whole: no clipped text, no word split across lines, the
    label inside its own tab, and the tab itself at least 48px each way. */
function measureNav(page) {
  return page.evaluate(() => {
    const rows = [];
    for (const item of document.querySelectorAll('[data-app-nav] [data-nav-item]')) {
      const label = item.querySelector('[data-nav-label]');
      const text = label.textContent.trim();
      const range = document.createRange();
      range.selectNodeContents(label);
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      const words = text.split(/\s+/).length;
      const ib = item.getBoundingClientRect();
      const lb = range.getBoundingClientRect();
      const clipped = label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1;
      const outside = lb.left < ib.left - 0.5 || lb.right > ib.right + 0.5 || lb.top < ib.top - 0.5 || lb.bottom > ib.bottom + 0.5;
      rows.push({ name: text, w: Math.round(ib.width), h: Math.round(ib.height), lines, words, clipped, outside });
    }
    const nav = document.querySelector('[data-app-nav]');
    const bar = nav.getBoundingClientRect();
    const layout = nav.classList.contains('is-inline') ? 'two rows, inline' : nav.classList.contains('is-two-rows') ? 'two rows' : '';
    return { bar: { top: Math.round(bar.top), height: Math.round(bar.height), bottom: Math.round(bar.bottom) }, layout, rows };
  });
}

const browser = await launchChromium();
const app = flag('url', null) ? null : await previewBuild(resolve(flag('root', resolve(here, '../..'))));
const base = flag('url', null) ?? `http://localhost:${app.httpServer.address().port}`;
const results = { scenes: [], nav: [], calendar: [] };
const failures = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    if (navigator.storage) {
      navigator.storage.persist = () => Promise.resolve(true);
      navigator.storage.persisted = () => Promise.resolve(true);
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  await settlePage(page, base, '/', 'light');
  if (!(await page.evaluate(RESET_PERSONA_EXPRESSION))) throw new Error('persona reset never reached Home');
  if (!(await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION))) throw new Error('fill every feature never reached /more');

  /* The planted pair: the walk has to see the 1px between them. */
  const bench = await context.newPage();
  await bench.setContent(
    '<body style="margin:0">' +
      [47, 48].map((size, i) => `<button data-planted-target style="position:absolute;top:${100 + i * 100}px;left:100px;width:${size}px;height:${size}px;padding:0;border:0"></button>`).join('') +
      '</body>'
  );
  const planted = await measure(bench, '[data-planted-target]', true);
  await bench.close();
  const [small, whole] = planted;
  /* A layout unit (1/64px) of rounding is not a shortfall. */
  const under = (row) => !row || row.covered || row.w < FLOOR - 1 / 64 || row.h < FLOOR - 1 / 64;
  if (planted.length !== 2 || !under(small) || under(whole)) {
    throw new Error(`the walk cannot tell a 47px control from a 48px one: ${JSON.stringify(planted)}`);
  }
  console.log(`planted controls: 47px reads ${small.w}x${small.h} (under), 48px reads ${whole.w}x${whole.h} (at the floor)`);

  for (const width of [...WIDTHS, NARROW]) {
    await page.setViewportSize({ width, height: 844 });
    for (const lang of width === NARROW ? ['en', 'pl'] : ['en']) {
      if (width === NARROW) await setAppLanguage(page, lang);
      for (const text of width === NARROW ? [100] : TEXT) {
        for (const scene of SCENES) {
          if (only && !only.includes(scene.key)) continue;
          if (width === NARROW && !scene.narrow) continue;
          await settlePage(page, base, scene.path, 'light');
          await page.evaluate((t) => (document.documentElement.style.fontSize = `${t}%`), text);
          if (scene.open) await scene.open(page);
          await settle(page, scene.targets);
          const rows = await measure(page, scene.targets, scene.sticky);
          const label = `${scene.key} ${width === NARROW ? `${lang} ` : ''}${width}px ${text}%`;
          if (!rows.length) failures.push(`${label}: no listed controls found`);
          for (const row of rows) {
            if (row.covered) failures.push(`${label}: "${row.name}" ${row.box}, centre covered by ${row.covered}`);
            else if (under(row)) failures.push(`${label}: "${row.name}" ${row.box}, hit ${row.w}x${row.h}`);
          }
          const lost = scene.whole ? await cut(page, scene.whole) : [];
          const overlaps = scene.apart ? await stacked(page, scene.targets) : [];
          if (scene.whole && !(await page.locator(scene.whole).count())) lost.push(`no ${scene.whole} found`);
          for (const line of [...lost, ...overlaps]) failures.push(`${label}: ${line}`);
          results.scenes.push({ scene: scene.key, width, lang, text, rows, lost, overlaps });
          console.log(`${label}: ${rows.length} controls, ${rows.filter(under).length} under ${FLOOR}${scene.whole ? `, ${lost.length} cut` : ''}${scene.apart ? `, ${overlaps.length} overlapping` : ''}`);
        }
      }
    }
    if (width === NARROW) await setAppLanguage(page, 'en');
    if (width !== NARROW && (!only || only.includes('nav'))) {
      for (const lang of ['en', 'pl']) for (const text of NAV_TEXT) {
        await setAppLanguage(page, lang);
        await settlePage(page, base, '/', 'light');
        await page.evaluate((t) => (document.documentElement.style.fontSize = `${t}%`), text);
        await settle(page, '[data-app-nav] [data-nav-item]');
        const nav = await measureNav(page);
        const label = `nav ${lang} ${width}px ${text}%`;
        for (const row of nav.rows) {
          if (row.clipped) failures.push(`${label}: "${row.name}" is clipped`);
          if (row.outside) failures.push(`${label}: "${row.name}" runs outside its tab`);
          if (row.lines > row.words) failures.push(`${label}: "${row.name}" breaks a word across ${row.lines} lines`);
          if (row.w < FLOOR || row.h < FLOOR) failures.push(`${label}: "${row.name}" tab ${row.w}x${row.h}`);
        }
        results.nav.push({ lang, width, text, ...nav });
        console.log(`${label}: bar ${nav.bar.height}px${nav.layout ? ` (${nav.layout})` : ''}, ${nav.rows.map((r) => `${r.name} ${r.w}x${r.h} ${r.lines}l${r.clipped ? ' CLIPPED' : ''}`).join(', ')}`);
      }
      await setAppLanguage(page, 'en');
    }
  }

  if (!only || only.includes('calendar')) {
    await page.setViewportSize({ width: 320, height: 844 });
    await settlePage(page, base, '/calendar', 'light');
    await page.locator('[data-cal-open]').click();
    await settle(page, '[data-cal-month-state="grid"] a');
    const rows = await measure(page, '[data-cal-month-state="grid"] a');
    results.calendar = rows;
    const under = rows.filter((r) => r.covered || r.w < FLOOR || r.h < FLOOR);
    console.log(`calendar 320px (printed, not failed): ${rows.length} date links, ${under.length} under ${FLOOR}${under[0] ? `, e.g. ${under[0].box} hit ${under[0].w}x${under[0].h}` : ''}`);
  }

  /* Stepping through the months must not move the search control. Where a
     month name cannot fit the line ("październik" at 200% text on 195px) it
     breaks in two, and a slot sized by the label showing was a line taller
     for that month alone: search jumped a line in one frame on the way in
     and again on the way out. The top is read right after each step, while
     both labels are still in the slot, and again once the swap has settled. */
  if (!only || only.includes('journal-steps')) {
    for (const [width, text] of [[195, 200], [320, 200], [390, 100]]) {
      await page.setViewportSize({ width, height: 844 });
      for (const lang of ['en', 'pl']) {
        await setAppLanguage(page, lang);
        await settlePage(page, base, '/calendar', 'light');
        await page.evaluate((t) => (document.documentElement.style.fontSize = `${t}%`), text);
        await settle(page, '[data-cal-month-btn]');
        /* Sampled on every animation frame, from before the first click to
           after the last settle, so a one-frame jump between two reads
           cannot slip through. */
        await page.evaluate(() => {
          window.__tops = [];
          window.__sampling = true;
          const tick = () => {
            window.__tops.push(document.querySelector('.cal-field > a').getBoundingClientRect().top);
            if (window.__sampling) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        for (let i = 0; i < 12; i++) {
          await page.locator('[data-cal-step="next"]').click();
          await page.waitForTimeout(450);
        }
        const tops = await page.evaluate(() => {
          window.__sampling = false;
          return window.__tops;
        });
        const label = `journal steps ${lang} ${width}px ${text}%`;
        const moved = tops.filter((t) => Math.abs(t - tops[0]) > 0.5);
        if (moved.length) failures.push(`${label}: search top moved while stepping through 12 months (${[...new Set(tops.map((t) => t.toFixed(1)))].join(', ')})`);
        console.log(`${label}: search top ${[...new Set(tops.map((t) => t.toFixed(1)))].join(', ')} over ${tops.length} frames`);
      }
    }
    await setAppLanguage(page, 'en');
  }
} finally {
  await browser.close();
  await app?.httpServer.close();
}

results.failures = failures;
if (out) {
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'results.json'), JSON.stringify(results, null, 1));
}
if (failures.length) {
  console.error(`\n${failures.length} failures:\n${failures.map((f) => `  ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('\nevery listed control reaches 48px and every navigation name is whole (the calendar at 320px is printed above, not held)');
