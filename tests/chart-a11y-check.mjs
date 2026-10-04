/* Charts as a screen reader and a finger meet them (phase 14 ticket 29,
   accessibility audit findings A04, A05 and A12).

   What the audit found, and what this checks for each:

   - A04, targets. The noticed-change marks on /care/changes were 22 x 18
     and the history bands and day marks on the Look back rail 8, 6 and 12
     px high, so axe reported target-size on both screens. Every chart
     control a screen reader or Tab can reach must now meet WCAG's 24px
     (its size, or a 24px circle that touches no other target), and one
     that stays under the 48px floor must have its fact in a list on the
     same screen at the floor.
   - A05, controls inside an image. The hormone curve was role="img" with
     focusable marker buttons inside it (nested-interactive). The image has
     no focusable descendants now, and each logged thing the markers stand
     for is a named link in a list beside the chart that opens its record.
   - A12, headings. ChartCard always wrote an h3, often straight after the
     screen's h1. On every screen that places one, no heading may skip a
     level on the way down.

   Each screen also gets axe with the audit's own tag set; target-size,
   nested-interactive and heading-order fail the run, anything else axe
   says is printed for the record.

   Against a demo build:
     VITE_DEMO=1 npm run build
     node tests/chart-a11y-check.mjs [--root <built tree>] [--url <running server>] [--axe <axe.min.js>] [--width 320,390] */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { launchChromium, settlePage, previewBuild } from './browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, RESET_PERSONA_EXPRESSION } from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const FLOOR = 48;
const WCAG = 24;
const RULES = new Set(['target-size', 'nested-interactive', 'heading-order']);

/** Every screen that places a ChartCard, plus the two A04 screens. */
const SCREENS = [
  '/care/changes',
  '/stats',
  '/care/curve',
  '/care',
  '/care/labs',
  '/body/measurements',
  '/body/wear',
  '/body-map',
  '/tally',
  '/voice?tab=compare',
  '/stats/day-by-day',
  '/stats/plane',
  '/stats/tags',
  '/stats/days',
  '/stats/words',
  '/stats/highest',
  '/stats/themes',
  '/wrapped/month',
  '/wrapped/year'
];

const axeSource = await readFile(flag('axe', createRequire(import.meta.url).resolve('axe-core/axe.min.js')), 'utf8');
/** 320 is the narrowest width the app supports and where the marks are
    closest; 390 is the audit's own page. */
const widths = flag('width', '320,390').split(',').map(Number);
let current = '';
const browser = await launchChromium();
const app = flag('url', null) ? null : await previewBuild(resolve(flag('root', resolve(here, '..'))));
const base = flag('url', null) ?? `http://localhost:${app.httpServer.address().port}`;

let failed = false;
const report = (label, problems) => {
  if (problems.length) failed = true;
  console.log(`${current} ${label}: ${problems.length ? 'FAIL' : 'ok'}`);
  for (const line of problems) console.log(`    ${line}`);
};

for (const width of widths) {
  current = `${width}px`;
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  await page.addInitScript(() => {
    if (navigator.storage) navigator.storage.persist = () => Promise.resolve(true);
  });
  await settlePage(page, base, '/', 'light');
  if (!(await page.evaluate(RESET_PERSONA_EXPRESSION))) throw new Error('persona reset never reached Home');
  if (!(await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION))) throw new Error('fill every feature never reached More');
  await page.waitForTimeout(1500);

  async function open(path) {
    await settlePage(page, base, path, 'light');
    await page.waitForTimeout(1200);
  }

  async function axeOn(include) {
    await page.evaluate(axeSource);
    return page.evaluate(async (include) => {
      // eslint-disable-next-line no-undef
      const result = await axe.run(include ? { include: [[include]], exclude: [['.demo-bar']] } : { exclude: [['.demo-bar']] }, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] }
      });
      return result.violations.map((v) => ({ id: v.id, count: v.nodes.length, html: v.nodes[0]?.html.slice(0, 140) ?? '' }));
    }, include);
  }

  /** The controls inside `scope` that Tab or a screen reader can reach,
      with their boxes. */
  const controls = (scope) =>
    page.evaluate((scope) => {
      const out = [];
      for (const root of document.querySelectorAll(scope)) {
        for (const el of root.querySelectorAll('button, a[href], [role=button], [role=slider], [tabindex]')) {
          if (el.closest('[aria-hidden="true"], [inert]')) continue;
          if (el.getAttribute('tabindex') === '-1') continue;
          const b = el.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) continue;
          out.push({ name: el.getAttribute('aria-label') ?? el.textContent.trim().slice(0, 60), left: b.left, top: b.top, right: b.right, bottom: b.bottom });
        }
      }
      return out;
    }, scope);

  /** WCAG 2.5.8: 24 x 24, or a 24px circle on the target's centre that
      meets no other target and no other undersized target's circle. */
  function underWcag(boxes) {
    const small = (b) => b.right - b.left < WCAG - 0.01 || b.bottom - b.top < WCAG - 0.01;
    const centre = (b) => [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
    const distToBox = ([x, y], b) => Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));
    return boxes.filter((b, i) => {
      if (!small(b)) return false;
      const c = centre(b);
      return boxes.some((o, j) => {
        if (j === i) return false;
        if (distToBox(c, o) < WCAG / 2 - 0.01) return true;
        if (!small(o)) return false;
        const [x, y] = centre(o);
        return Math.hypot(x - c[0], y - c[1]) < WCAG - 0.01;
      });
    });
  }
  const size = (b) => `${(b.right - b.left).toFixed(1)} x ${(b.bottom - b.top).toFixed(1)}`;

  /** Visible headings in document order, skipping anything hidden from
      assistive tech. */
  const headings = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && !el.closest('[aria-hidden="true"], [inert], .demo-bar');
        })
        .map((el) => ({ level: Number(el.tagName[1]), text: el.textContent.trim().slice(0, 50) }))
    );

  for (const path of SCREENS) {
    await open(path);
    const found = await axeOn(null);
    const ours = found.filter((v) => RULES.has(v.id));
    report(`${path} axe (${[...RULES].join(', ')})`, ours.map((v) => `${v.id} (${v.count}): ${v.html}`));
    const other = found.filter((v) => !RULES.has(v.id));
    if (other.length) console.log(`    for the record, other axe findings: ${other.map((v) => `${v.id}(${v.count}) ${v.html}`).join('; ')}`);

    const list = await headings();
    const skips = [];
    for (let i = 1; i < list.length; i++)
      if (list[i].level > list[i - 1].level + 1) skips.push(`h${list[i - 1].level} "${list[i - 1].text}" then h${list[i].level} "${list[i].text}"`);
    const charts = await page.locator('[data-chart-card]').count();
    report(`${path} heading order (${charts} chart cards)`, skips);
  }

  /* A04: the noticed-change line. */
  await open('/care/changes');
  {
    const boxes = await controls('[data-noticed-axis] .na-plot');
    const bad = underWcag(boxes);
    report(`/care/changes marks meet WCAG 24px (${boxes.length} marks, smallest ${boxes.map(size).sort()[0] ?? 'none'})`, [
      ...(boxes.length ? [] : ['no marks on the line']),
      ...bad.slice(0, 4).map((b) => `"${b.name}" ${size(b)} sits within 24px of another target`)
    ]);
    /* Under the floor, so each mark's change has to be a row on the screen. */
    const marks = await page.locator('[data-noticed-mark]').evaluateAll((els) => els.map((el) => ({ key: el.dataset.noticedMark, kind: el.dataset.kind })));
    /* Opening a group moves the ones under it, so take the first closed one
       each time rather than a list made before the first click. */
    const closed = page.locator('.effect-group [aria-expanded="false"]');
    for (let i = 0; i < 20 && (await closed.count()); i++) {
      await closed.first().click();
      await page.waitForTimeout(400);
    }
    const rows = await page.locator('[data-list-row]').evaluateAll((els) =>
      els.map((el) => {
        const b = el.getBoundingClientRect();
        return { key: el.dataset.listRow, h: b.height };
      })
    );
    const missing = marks.filter((mk) => !rows.some((r) => r.key === mk.key && r.h >= FLOOR - 0.01));
    report(`/care/changes every mark has a row at ${FLOOR}px`, missing.slice(0, 4).map((mk) => `no ${FLOOR}px row for ${mk.kind} ${mk.key}`));
  }

  /* A04: the Look back rail. */
  await open('/stats');
  {
    const boxes = await controls('[data-span-timeline]');
    const bad = underWcag(boxes);
    const small = boxes.filter((b) => b.right - b.left < FLOOR - 0.01 || b.bottom - b.top < FLOOR - 0.01);
    report(`/stats rail controls meet WCAG 24px (${boxes.length} reachable)`, bad.slice(0, 4).map((b) => `"${b.name}" ${size(b)} sits within 24px of another target`));
    report(`/stats rail controls meet ${FLOOR}px`, small.slice(0, 4).map((b) => `"${b.name}" is ${size(b)}`));
    /* Whatever the rail draws that a finger can point at, the list under it
       holds as a row: eras, stretches, milestones, surgery days. */
    const drawn =
      (await page.locator('[data-span-era]').count()) +
      (await page.locator('[data-span-band]').count()) +
      (await page.locator('[data-span-milestone]').count()) +
      (await page.locator('[data-span-surgery]').count());
    await page.locator('[data-span-facts-toggle]').click();
    await page.waitForTimeout(600);
    const more = page.locator('[data-span-facts] [data-batched-more]');
    for (let i = 0; i < 10 && (await more.count()); i++) {
      await more.first().click();
      await page.waitForTimeout(400);
    }
    const facts = await page.locator('[data-span-fact]').count();
    report(`/stats the rail's ${drawn} marks are ${facts} rows in the list`, facts >= drawn && drawn > 0 ? [] : [`${drawn} drawn, ${facts} rows`]);
  }

  /* A05: the hormone curve. */
  await open('/care/curve');
  {
    const nested = await page.evaluate(() =>
      [...document.querySelectorAll('svg[role="img"]')].flatMap((svg) =>
        [...svg.querySelectorAll('[tabindex], [role="button"], a')].filter((el) => el.getAttribute('tabindex') !== '-1').map(() => svg.getAttribute('aria-label')?.slice(0, 60))
      )
    );
    report('/care/curve no image holds a control', nested.slice(0, 3).map((name) => `"${name}" has a focusable descendant`));
    const toggles = page.locator('[data-curve-markers-toggle]');
    const count = await toggles.count();
    const problems = count ? [] : ['no list of the marked days beside any curve'];
    if (count) {
      const toggle = toggles.first();
      const chart = await toggle.getAttribute('data-curve-markers-toggle');
      await toggle.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
      const legend = page.locator(`[data-curve-markers-list="${chart}"]`);
      const links = await legend.locator('a[href]').evaluateAll((els) =>
        els.map((el) => {
          const b = el.getBoundingClientRect();
          return { name: el.textContent.trim(), href: el.getAttribute('href'), h: b.height };
        })
      );
      if (!links.length) problems.push('the list opened with no links');
      for (const l of links.filter((l) => !l.name || l.h < FLOOR - 0.01).slice(0, 3)) problems.push(`"${l.name}" is ${l.h.toFixed(1)}px tall or unnamed`);
      /* By keyboard, the way a TalkBack double tap lands: Tab from the
         toggle reaches the first link and Enter opens its record. */
      if (links.length) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => document.activeElement?.getAttribute('href'));
        if (focused !== links[0].href) problems.push(`Tab from the toggle reached ${focused}, not ${links[0].href}`);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);
        const at = new URL(page.url());
        if (`${at.pathname}${at.search}` !== links[0].href && at.pathname !== links[0].href.split('?')[0])
          problems.push(`Enter opened ${at.pathname}${at.search}, not ${links[0].href}`);
      }
    }
    report(`/care/curve each marked day is a named control that opens its record (${count} lists)`, problems);
  }
  await context.close();
}

await browser.close();
await app?.close();
process.exit(failed ? 1 : 0);
