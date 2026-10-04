/* The open calendar month, as a screen reader and a finger meet it (phase
   14 ticket 28, accessibility audit findings A03 and A10).

   The audit found two things once the month was opened with "Show month",
   which a scan of the route alone never sees because the folded strip is
   hidden from assistive tech:

   - A03: the days sat in a role="grid" with no rows and no gridcells, so
     axe reported aria-required-children. The month is a labelled list of
     date links now: one list item per day, a link for every day that has
     somewhere to go, and Tab walking the links in date order.
   - A10: a date measured about 41.7 x 60.7 CSS px at 390 wide, under the
     project's 48px floor. The link now takes the whole column, gap
     included, so the visible cell stays the size it was.

   At each width this opens the month and checks:

   - axe finds nothing inside the month (the audit's own tag set);
   - it is a list with one item per day of the month, and every item says
     its date in words, month included (the link's own name where there is
     a link);
   - every link is at least 48 x 48 and no two links overlap;
   - from the "Show month" button, Tab reaches the links one by one in
     date order and leaves the month after the last one.

   7 x 48px of columns needs 336px of row, so the floor is reachable from a
   360px-wide screen up; at 320 the column pitch is about 42px whatever
   the cell does, which is printed rather than failed.

   Against a demo build:
     VITE_DEMO=1 npm run build
     node tests/calendar-month-a11y-check.mjs [--root <built tree>] [--url <running server>] */
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
/** Phone widths with overlay scrollbars, the way Android lays them out
    (411 is the audit's Pixel 10a), plus the audit's own desktop page at 390
    with a classic scrollbar taking 10px of it. 320 is printed only. */
const LAYOUTS = [
  { label: 'phone 360', width: 360, mobile: true },
  { label: 'phone 390', width: 390, mobile: true },
  { label: 'phone 411', width: 411, mobile: true },
  { label: 'desktop 390', width: 390, mobile: false },
  { label: 'phone 320', width: 320, mobile: true, reportOnly: true }
];

const axeSource = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const browser = await launchChromium();
const app = flag('url', null) ? null : await previewBuild(resolve(flag('root', resolve(here, '..'))));
const base = flag('url', null) ?? `http://localhost:${app.httpServer.address().port}`;
/* One context per layout, since isMobile is fixed when a context is made.
   A context starts with empty storage, so each one fills its own demo
   journal. */
let page;
async function openMonth({ width, mobile }) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile
  });
  page = await context.newPage();
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  await page.addInitScript(() => {
    if (navigator.storage) navigator.storage.persist = () => Promise.resolve(true);
  });
  await settlePage(page, base, '/', 'light');
  if (!(await page.evaluate(RESET_PERSONA_EXPRESSION))) throw new Error('persona reset never reached Home');
  await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
  await page.waitForTimeout(1500);
  await settlePage(page, base, '/calendar', 'light');
  await page.waitForSelector('[data-cal-open]');
  await page.locator('[data-cal-open]').click();
  await page.waitForSelector('[data-cal-month-state="grid"]');
  await page.waitForTimeout(900);
}

/** Every link in the open month, with its box and name. */
const links = () =>
  page.locator('[data-cal-month-state="grid"] a').evaluateAll((els) =>
    els.map((el) => {
      const b = el.getBoundingClientRect();
      return { name: el.getAttribute('aria-label') ?? '', left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    })
  );

let failed = false;
const report = (label, problems) => {
  if (problems.length) failed = true;
  console.log(`${label}: ${problems.length ? 'FAIL' : 'ok'}`);
  for (const line of problems) console.log(`    ${line}`);
};

for (const layout of LAYOUTS) {
  const name = layout.label;
  await openMonth(layout);
  const boxes = await links();
  const small = boxes.filter((b) => b.right - b.left < FLOOR - 0.01 || b.bottom - b.top < FLOOR - 0.01);
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 0.5 && h > 0.5) overlaps.push(`"${a.name}" and "${b.name}" overlap by ${w.toFixed(1)} x ${h.toFixed(1)}`);
    }
  const sizes = boxes.map((b) => `${(b.right - b.left).toFixed(1)} x ${(b.bottom - b.top).toFixed(1)}`);
  const sizeLine = `smallest link ${[...new Set(sizes)].sort()[0] ?? 'none'}`;
  if (layout.reportOnly) {
    console.log(`${name} (reported only): ${sizeLine}, ${small.length} of ${boxes.length} under ${FLOOR}px, ${overlaps.length} overlaps`);
    await page.context().close();
    continue;
  }
  report(`${name} targets, ${sizeLine}`, [
    ...(boxes.length ? [] : ['no links in the open month']),
    ...small.slice(0, 3).map((b) => `"${b.name}" is ${(b.right - b.left).toFixed(1)} x ${(b.bottom - b.top).toFixed(1)}`),
    ...(small.length > 3 ? [`and ${small.length - 3} more under ${FLOOR}px`] : []),
    ...overlaps.slice(0, 3)
  ]);

  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const result = await axe.run(
      { include: [['[data-cal-month-body]']] },
      { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] } }
    );
    return result.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.html.slice(0, 120)}`);
  });
  report(`${name} axe on the open month`, violations);

  /* Names, read off the accessibility tree rather than the attributes. */
  const tree = await page.locator('[data-cal-month-state="grid"]').ariaSnapshot();
  const days = await page.locator('[data-cal-month-state="grid"] [data-cal-day]').count();
  const items = (tree.match(/^\s*- listitem/gm) ?? []).length;
  const month = await page.locator('[data-cal-month-btn]').innerText();
  const monthName = month.trim().split(/\s+/)[0];
  /* A list item holding a link prints as a bare `- listitem:` with the link
     under it; one holding only text prints that text on its own line. */
  const named = tree.split('\n').filter((line) => /^\s*- (link|listitem)/.test(line) && !/listitem:\s*$/.test(line));
  const unnamed = named.filter((line) => !line.includes(monthName));
  report(`${name} list of days`, [
    ...(/^- list\b/m.test(tree) ? [] : [`the open month is not a list: ${tree.split('\n')[0]}`]),
    ...(items === days ? [] : [`${items} list items for ${days} days`]),
    ...unnamed.slice(0, 3).map((line) => `no date in "${line.trim()}"`)
  ]);

  /* Tab from the control that opened the month. */
  await page.locator('[data-cal-open]').focus();
  const order = [];
  for (let i = 0; i < boxes.length + 1; i++) {
    await page.keyboard.press('Tab');
    order.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        return el?.closest('[data-cal-month-state="grid"]') ? el.getAttribute('aria-label') : null;
      })
    );
  }
  const expected = boxes.map((b) => b.name);
  report(`${name} Tab order`, [
    ...expected.flatMap((name, i) => (order[i] === name ? [] : [`stop ${i + 1} was "${order[i]}", expected "${name}"`])).slice(0, 3),
    ...(order[expected.length] === null ? [] : [`Tab stayed in the month after the last day: "${order[expected.length]}"`])
  ]);
  await page.context().close();
}

await browser.close();
await app?.close();
process.exit(failed ? 1 : 0);
