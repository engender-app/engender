/* Do three lanes' captions collide at 390px, in Polish? (phase 11
   all-four-doors ticket 10, AC 4.)

   careSpine.ts sizes MIN_LABEL_GAP against Polish rather than English -
   "Następna dawka" is the widest label either catalogue holds - and the
   number, 0.30 of the rail, was measured against the 330px of rail a 390px
   screen leaves. A lane per drug keeps that rail width (the drug's name
   sits above its line rather than in a left column, which is what a name
   column would have cost), so the rule should hold per lane unchanged.
   This is what measures whether it does, rather than asserting it.

   What it prints, per lane and for the shared pair at the head: every
   caption's painted box, and every overlap between two captions that share
   a label row. A caption pushed to its own row may overlap one above it -
   that is what the rows are for - so only same-row pairs count.

   Everything here drives the app's own production build, which has to be a
   demo build (VITE_DEMO=1 npm run build) or every screen renders as the
   passphrase gate.

   Run: VITE_DEMO=1 npm run build, then node tests/care-lane-labels.mjs */
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });

async function settle(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
}

await settle('/');
await page.locator('[data-fill-every-feature]').click();
await page.waitForURL('**/more', { timeout: 180000 });
await page.waitForTimeout(1000);

for (const locale of ['en', 'pl']) {
  await settle('/settings');
  await page.locator(`[data-segment="${locale}"]`).click();
  await page.waitForURL('**/settings', { timeout: 15000 });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');

  await settle('/care');
  await page.waitForSelector('[data-care-rail]');
  /* Every caption settles on a delay proportional to its distance from the
     middle, so the measurement waits out the longest of them. */
  await page.waitForTimeout(1200);

  const measured = await page.evaluate(() => {
    const trackOf = (el) => el.closest('.care-head, .care-lane-track');
    const groups = [];
    const seen = new Map();
    for (const mark of document.querySelectorAll('[data-care-mark]')) {
      const track = trackOf(mark);
      const lane = track.closest('.care-lane')?.dataset.careLane ?? 'shared';
      if (!seen.has(track)) {
        const group = { lane, width: track.getBoundingClientRect().width, labels: [] };
        seen.set(track, group);
        groups.push(group);
      }
      const box = mark.getBoundingClientRect();
      const inner = mark.closest('.care-at-inner');
      seen.get(track).labels.push({
        kind: mark.dataset.careMark,
        what: mark.querySelector('.care-what')?.textContent ?? '',
        when: mark.querySelector('.care-when')?.textContent ?? '',
        /* The caption's widest line rather than its box: the box is held
           open to the 44px touch floor, and what collides is the text. */
        whatWidth: mark.querySelector('.care-what')?.getBoundingClientRect().width ?? 0,
        whenWidth: mark.querySelector('.care-when')?.getBoundingClientRect().width ?? 0,
        left: box.left,
        right: box.right,
        row: Number(getComputedStyle(inner).getPropertyValue('--care-row') || 0)
      });
    }
    return groups;
  });

  console.log(`\n=== ${locale} at 390px ===`);
  for (const group of measured) {
    console.log(`lane "${group.lane}" - rail ${group.width.toFixed(1)}px`);
    for (const label of group.labels) {
      console.log(
        `  row ${label.row}  ${label.kind.padEnd(9)} "${label.what}" ${label.whatWidth.toFixed(1)}px / "${label.when}" ${label.whenWidth.toFixed(1)}px  box ${label.left.toFixed(1)}..${label.right.toFixed(1)}`
      );
    }
    const sorted = [...group.labels].sort((a, b) => a.left - b.left);
    let collisions = 0;
    for (let i = 1; i < sorted.length; i++) {
      for (let j = 0; j < i; j++) {
        if (sorted[i].row !== sorted[j].row) continue;
        const overlap = Math.min(sorted[i].right, sorted[j].right) - Math.max(sorted[i].left, sorted[j].left);
        if (overlap > 0) {
          collisions += 1;
          console.log(`  COLLISION ${sorted[j].kind} / ${sorted[i].kind} on row ${sorted[i].row}: ${overlap.toFixed(1)}px`);
        }
      }
    }
    if (collisions === 0) console.log('  no two captions on one row overlap');
  }
}

await page.close();
await browser.close();
await app.close();
