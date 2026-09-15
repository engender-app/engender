/* How tall the two schedule-shaped logs are (phase 10 redesign ticket 56).
   The ticket's own figures: hair removal captured at 2354px and cycle
   events at 2189px on a demo build with every feature filled, and neither
   may exceed a third of that afterwards. The scroll region's own
   scrollHeight is what is measured - the app scrolls inside
   [data-app-scroll-region] rather than the document (the same reading
   tests/day-strip-measure.mjs, ticket 44, takes).

   Run: VITE_DEMO=1 npm run build, then node tests/hair-removal-cycle-strip-measure.mjs */
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const BEFORE = { '/body/hair-removal': 2354, '/health/cycle-events': 2189 };

/* What each screen leaves untouched, so a miss can be attributed rather than
   argued about - the same split day-strip-measure.mjs (ticket 44) draws
   against wear's trend chart. Hair removal's recency figures (nine areas,
   one static row each) are the schedule-adjacent reading this ticket does
   not own compressing, the same way dilation's own schedule editor stayed
   out of ticket 44's reach; cycle events' chart and its range pickers moved
   down rule 16's way but are otherwise untouched.

   Two different shapes, so two different measures: cycle events' untouched
   block still runs from its marker to the end of the page, but hair
   removal's own review round (ticket 56) moved recency *above* the strip,
   so its untouched block is bounded on both ends - the heading before the
   first `[data-recency]` row's card, and that card's own bottom - rather
   than running to the end, which after the move would wrongly claim the
   strip and the week's log as recency's own. */

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const settle = async (path) => {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  await page.waitForTimeout(600);
};

await settle('/');
await page.locator('[data-fill-every-feature]').click();
await page.waitForURL('**/more', { timeout: 180000 });
await page.waitForTimeout(2000);

await settle('/settings');
await page.locator('[data-palette-pick="trans"]').click();
await page.locator('[data-segment="light"]').click();
await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');

let failures = 0;
for (const path of Object.keys(BEFORE)) {
  await settle(path);
  await page.waitForFunction(() => !document.querySelector('[data-skeleton]'), null, { timeout: 15000 });
  await page.waitForTimeout(700);
  const { height, untouched } = await page.evaluate((currentPath) => {
    const region = document.querySelector('[data-app-scroll-region]');
    if (!region) return { height: null, untouched: 0 };
    const regionTop = region.getBoundingClientRect().top;
    const regionBottom = regionTop + region.scrollHeight;

    let untouched = 0;
    if (currentPath === '/body/hair-removal') {
      /* Bounded on both ends, not run to the end of the page: ticket 56's
         own review round moved recency above the strip, so "to the end"
         would wrongly claim the strip and the week's log as recency's own. */
      const first = document.querySelector('[data-recency]');
      const card = first?.closest('.kit-list');
      const heading = card?.previousElementSibling;
      if (card && heading) {
        untouched = Math.round(card.getBoundingClientRect().bottom - heading.getBoundingClientRect().top);
      }
    } else if (currentPath === '/health/cycle-events') {
      /* No heading over this one (the screen's own rule: a name for the
         chart would stack two headers), so the block is its own
         screen-part, measured to the end of the page. */
      const marker = document.querySelector('.cd-endpoints');
      const block = marker?.closest('.screen-part');
      if (block) {
        untouched = Math.round(regionBottom - block.getBoundingClientRect().top);
      }
    }
    return { height: Math.round(region.scrollHeight), untouched };
  }, path);
  const budget = Math.round(BEFORE[path] / 3);
  const met = height <= budget;
  if (!met) failures++;
  process.stdout.write(
    `${met ? 'MET' : 'MISSED'}  ${path}  ${height}px against a third of ${BEFORE[path]}px (${budget}px)` +
      ` - ${height - untouched}px owned, ${untouched}px untouched (recency/chart, not this ticket's)\n`
  );
}

process.stdout.write(`\n${failures} FAILURE(S)\n`);
await browser.close();
await app.close();
process.exit(failures ? 1 : 0);
