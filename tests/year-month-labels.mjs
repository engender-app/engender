/* Check month labels on /wrapped/year in both languages at phone,
   200% zoom (195px), and desktop widths. Labels keep calendar order,
   match the chart's small text size, clear one another by MIN_GAP,
   and fit above their own days. The underlying day order stays fixed.

   node tests/year-month-labels.mjs
   Uses the dev server. */
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium, setAppLanguage, settlePage } from './browser-harness.mjs';

/** Half the label's 12px: twice a word space in Nunito at that size, so
    two names never read as one word. */
const MIN_GAP = 6;
const WIDTHS = [390, 195, 1280];

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(30000);
const failures = [];

/** What the year's chart painted: each label's text box, its month's
    cells as one box, and the cells' days in document order. */
const readChart = () =>
  page.evaluate(() => {
    const rect = (r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    const chart = document.querySelector('[data-chart="year-rows"]');
    return [...chart.querySelectorAll('[data-year-month]')].map((month) => {
      const label = month.querySelector('.kit-year-label');
      const range = document.createRange();
      range.selectNodeContents(label);
      const cells = [...month.querySelectorAll('[data-year-cell]')];
      const boxes = cells.map((c) => c.getBoundingClientRect());
      const style = getComputedStyle(label);
      return {
        month: Number(month.dataset.yearMonth),
        name: label.textContent.trim(),
        text: rect(range.getBoundingClientRect()),
        clipped: label.scrollWidth > label.clientWidth + 1 && style.overflowX !== 'visible',
        fontSize: parseFloat(style.fontSize),
        days: cells.map((c) => Number(c.dataset.yearCell)),
        cells: {
          left: Math.min(...boxes.map((b) => b.left)),
          right: Math.max(...boxes.map((b) => b.right)),
          top: Math.min(...boxes.map((b) => b.top)),
          bottom: Math.max(...boxes.map((b) => b.bottom))
        }
      };
    });
  });

/** How far apart two boxes are: 0 or less when they touch or overlap. */
function distance(a, b) {
  const dx = Math.max(a.left - b.right, b.left - a.right, 0);
  const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
  return Math.hypot(dx, dy);
}

try {
  let reference = null;
  for (const locale of ['en', 'pl']) {
    await settlePage(page, base, '/wrapped/year', 'light');
    await setAppLanguage(page, locale);
    const expected = await page.evaluate(
      (tag) => Array.from({ length: 12 }, (_, m) => new Intl.DateTimeFormat(tag, { month: 'short' }).format(new Date(2001, m, 1))),
      locale === 'pl' ? 'pl-PL' : 'en-GB'
    );
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      await settlePage(page, base, '/wrapped/year', 'light');
      await page.waitForSelector('[data-chart="year-rows"] [data-year-cell]', { state: 'attached' });
      const months = await readChart();
      const at = `${locale} at ${width}px`;

      const names = months.map((m) => m.name);
      if (JSON.stringify(months.map((m) => m.month)) !== JSON.stringify([...Array(12).keys()]))
        failures.push(`${at}: the months are not January to December in order`);
      if (JSON.stringify(names.map((n) => n.replace(/\.$/, ''))) !== JSON.stringify(expected.map((n) => n.replace(/\.$/, ''))))
        failures.push(`${at}: the names are ${names.join(' ')}, not ${expected.join(' ')}`);

      const days = months.flatMap((m) => m.days);
      reference ??= days;
      if (JSON.stringify(days) !== JSON.stringify(reference) || days.some((d, i) => i > 0 && d !== days[i - 1] + 1))
        failures.push(`${at}: the cells are not the year's days in order`);

      for (const m of months) {
        if (m.fontSize < 12) failures.push(`${at}: "${m.name}" is set at ${m.fontSize}px`);
        if (m.clipped) failures.push(`${at}: "${m.name}" is cut by its own box`);
        const own = distance(m.text, m.cells);
        const nearest = months.filter((o) => o !== m).reduce((best, o) => Math.min(best, distance(m.text, o.cells)), Infinity);
        if (!(own < nearest)) failures.push(`${at}: "${m.name}" sits ${own.toFixed(1)}px from its own days and ${nearest.toFixed(1)}px from another month's`);
      }
      let closest = Infinity;
      for (let i = 0; i < months.length; i++) {
        for (let j = i + 1; j < months.length; j++) {
          const gap = distance(months[i].text, months[j].text);
          closest = Math.min(closest, gap);
          if (gap < MIN_GAP)
            failures.push(`${at}: "${months[i].name}" and "${months[j].name}" are ${gap.toFixed(1)}px apart (at least ${MIN_GAP})`);
        }
      }
      const bands = new Set(months.map((m) => Math.round(m.text.top))).size;
      console.log(`${at}: ${12 / bands} months abreast in ${bands} band(s), closest two names ${closest.toFixed(1)}px apart`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(failures.map((f) => `FAIL: ${f}`).join('\n'));
  process.exit(1);
}
console.log(`PASS: twelve month names, ${MIN_GAP}px or more apart, each on its own days, at ${WIDTHS.join('/')}px in English and Polish`);
