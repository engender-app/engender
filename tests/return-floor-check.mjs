/* The accessibility floor on the return moment, measured rather than
   eyeballed (redesign ticket 35, DIRECTION.md's "What is untouched": 320px,
   200% zoom, 48px targets, 4.5:1 body and 3:1 large, both languages).

   The step's own rule is rule 14's: the answers are the one region that may
   scroll, they scroll between the question and the foot, and the foot never
   moves. So what this reads per case is whether the screen itself scrolls,
   where the foot's top edge sits, and every control's rect against the 48px
   floor and the 8dp gap Android asks for.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/return-floor-check.mjs
   Prints a row per case and exits non-zero on a floor breach, so it can be
   read as a check rather than as a report. */
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();

/** The floor's widths, plus what 200% zoom on a 390px phone leaves (195),
    and the height a raised keyboard leaves. */
const CASES = [
  { w: 320, h: 568, locale: 'en' },
  { w: 360, h: 640, locale: 'en' },
  { w: 390, h: 844, locale: 'en' },
  { w: 430, h: 932, locale: 'en' },
  { w: 195, h: 844, locale: 'en' },
  { w: 390, h: 360, locale: 'en' },
  { w: 320, h: 568, locale: 'pl' },
  { w: 390, h: 844, locale: 'pl' }
];

const READ = () => {
  const region = document.querySelector('[data-app-scroll-region]');
  const foot = document.querySelector('.return-foot');
  const controls = [
    ...document.querySelectorAll(
      '.return-foot .btn, [data-coming-back-yes], [data-coming-back-no], [data-list-card] a.kit-row'
    )
  ];
  /* A box whose content is wider or taller than the box itself is copy
     being clipped, which the floor calls a bug wherever it happens. */
  const clipped = [
    ...document.querySelectorAll('.kit-row-title, .kit-row-sub, .return-yes, .return-no, [data-screen-subtitle], .screen-title')
  ]
    .filter((el) => el.scrollWidth > el.clientWidth + 1)
    .map((el) => (el.textContent || '').trim().slice(0, 40));
  return {
    overflow: region ? region.scrollHeight - region.clientHeight : null,
    bodyOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    footTop: foot ? Math.round(foot.getBoundingClientRect().top) : null,
    footBottom: foot ? Math.round(foot.getBoundingClientRect().bottom) : null,
    windowH: window.innerHeight,
    small: controls
      .map((c) => {
        const r = c.getBoundingClientRect();
        return { h: Math.round(r.height), w: Math.round(r.width), what: c.dataset.comingBackYes ?? c.dataset.comingBackNo ?? c.dataset.listRow ?? 'foot' };
      })
      .filter((c) => c.h < 48),
    /* The two answers on one offer, and the space between them. */
    gap: (() => {
      const yes = document.querySelector('[data-coming-back-yes]');
      const no = yes?.parentElement?.querySelector('[data-coming-back-no]');
      if (!yes || !no) return null;
      return Math.round(no.getBoundingClientRect().left - yes.getBoundingClientRect().right);
    })(),
    clipped
  };
};

let bad = 0;
for (const c of CASES) {
  const page = await browser.newPage({
    viewport: { width: c.w, height: c.h },
    deviceScaleFactor: 1,
    colorScheme: 'light'
  });
  const settle = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
    }
  };
  await settle('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator('[data-segment="light"]').click();
  await page.locator(`[data-segment="${c.locale}"]`).click();
  await page.waitForTimeout(900);
  await settle('/');
  await page.locator('[data-fill-coming-back]').dispatchEvent('click');
  await page.waitForURL('**/coming-back', { timeout: 180000 });
  await page.waitForSelector('[data-coming-back-item="dose"]');
  await page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
    for (const t of document.querySelectorAll('[data-toast]')) t.remove();
  });
  await page.waitForTimeout(700);
  const r = await page.evaluate(READ);
  const issues = [];
  if (r.bodyOverflowX > 0) issues.push(`body scrolls sideways by ${r.bodyOverflowX}px`);
  if (r.small.length) issues.push(`under 48px: ${JSON.stringify(r.small)}`);
  if (r.gap !== null && r.gap < 8) issues.push(`answers ${r.gap}px apart`);
  if (r.clipped.length) issues.push(`clipped: ${JSON.stringify(r.clipped)}`);
  if (r.footBottom !== null && r.footBottom > r.windowH + 1) issues.push(`foot below the window by ${r.footBottom - r.windowH}px`);
  if (issues.length) bad++;
  console.log(
    `${c.w}x${c.h} ${c.locale}: region overflow ${r.overflow}px · foot ${r.footTop}-${r.footBottom} of ${r.windowH} · answers ${r.gap}px apart` +
      (issues.length ? `\n    ${issues.join('\n    ')}` : '  OK')
  );
  await page.close();
}

await browser.close();
await app.close();
console.log(bad ? `\n${bad} case(s) with a floor breach` : '\nevery case clears the floor');
process.exit(bad ? 1 : 0);
