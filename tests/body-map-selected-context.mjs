/* Real-browser check for the body map's selected-region context (phase 11
   pre-production UI/UX ticket 30), on the real route with a real journal.

   What it proves:
   - the figure and the elsewhere cluster select the same region, and the
     words beside the figure name whichever one is pressed;
   - a recorded region, one the range never mentions, one that went both
     ways and a region somebody added themselves each get an honest
     sentence, and the unrecorded one carries no number at all;
   - the jump reaches the charts, keeps the span in the query and the region
     on the screen, and Back returns to the map where it was left;
   - the jump is a 48px target and is reachable from the keyboard.

   Run against a dev server (no build needed):
     node tests/body-map-selected-context.mjs [--gallery]

   With --gallery it also writes the sign-off crops - the figure card in the
   four data states, default palette, light and dark - to .claude/ticket30. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { launchChromium, settlePage } from './browser-harness.mjs';

const gallery = process.argv.includes('--gallery');
const outDir = resolve('.claude/ticket30');
if (gallery) await mkdir(`${outDir}/shots`, { recursive: true });

const server = await createServer({
  cacheDir: '.svelte-kit/body-map-selected-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');

const browser = await launchChromium();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  reducedMotion: 'reduce'
});
page.setDefaultTimeout(15000);

const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

const pass = (line) => console.log(`PASS ${line}`);

const name = () => page.locator('[data-body-map-selected]').innerText();
const summary = () => page.locator('[data-body-map-summary]').innerText();
const scrollTop = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-app-scroll-region]');
    return el ? el.scrollTop : window.scrollY;
  });

/** Which region the figure says is pressed, read off the buttons rather than
    off the app's own state: the claim is that the drawing and the words
    agree, and reading one of them out of the other would prove nothing. */
const pressedRegion = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-body-map-figure] [aria-pressed="true"]');
    return el?.getAttribute('data-region') ?? null;
  });

async function selectPill(region) {
  await page.locator(`.region-pill[data-region="${region}"]`).click();
  await page.waitForFunction(
    (r) => document.querySelector(`[data-region="${r}"][aria-pressed="true"]`) !== null,
    region
  );
  await page.waitForTimeout(120);
}

async function select(region) {
  await page.locator(`[data-body-map-figure] [data-region="${region}"]`).first().click();
  await page.waitForFunction(
    (r) => document.querySelector(`[data-region="${r}"][aria-pressed="true"]`) !== null,
    region
  );
  await page.waitForTimeout(120);
}

try {
  await settlePage(page, base, '/body-map', 'light');

  /* The demo journal this dev server boots with already has body-region
     readings in it, so the scenes are read out of the range's own answer
     rather than assumed: whichever region went both ways is the mixed one,
     whichever went one way is the plain one, and the two states a seeded
     journal cannot be relied on to hold - a region with nothing at all, and
     a region somebody added themselves - are made here.

     The range is the door's own default, the last thirty days. */
  const scene = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
    const { DEFAULT_SPAN_DAYS } = await import('/src/lib/data/lookBackSpan.ts');
    const today = todayEpochDay();

    const plain = await journal.bodyRegions.addCustomRegion('left elbow and forearm');
    const single = await journal.bodyRegions.addCustomRegion('left ankle');
    await journal.bodyRegions.addCustomRegion('the back of my neck, logged about never');
    for (const [day, value] of [
      [today - 1, 90],
      [today - 2, 80],
      [today - 3, 85]
    ]) {
      await journal.entries.upsertEntry({ epochDay: day, mood: 3, bodyRegions: { [plain.id]: value } });
    }
    await journal.entries.upsertEntry({
      epochDay: today - 4,
      mood: 3,
      bodyRegions: { [single.id]: 10 }
    });
    /* Whatever the demo journal holds for the chest, these two put it on
       both sides of the midpoint, which is the state the figure's mixed mark
       and the sentence's second half both answer to. */
    await journal.entries.upsertEntry({ epochDay: today - 5, mood: 2, bodyRegions: { chest: 15 } });
    await journal.entries.upsertEntry({ epochDay: today - 6, mood: 4, bodyRegions: { chest: 85 } });

    const from = today - DEFAULT_SPAN_DAYS + 1;
    const rows = await journal.stats.bodyRegionMap(from, today);
    return {
      rows,
      plain: plain.id,
      single: single.id,
      mixed: rows.find((r) => r.mixed && r.region === 'chest')?.region ?? null
    };
  });
  assert.ok(scene.mixed, 'the chest went both ways in the range');

  // The vocabulary reads its regions once, so the custom ones arrive on a reload.
  await settlePage(page, base, '/body-map', 'light');
  await page.waitForSelector('[data-body-map-figure] [data-region="chest"]');
  await page.waitForSelector('[data-body-map-summary]');

  const reading = (region) => scene.rows.find((r) => r.region === region);

  /** The sentence against the answer it was written from. */
  async function assertSaysTheReading(region) {
    const row = reading(region);
    const text = await summary();
    const axis = row.side === 'dysphoria' ? 'dysphoria' : 'euphoria';
    assert.match(text, new RegExp(axis), `${region} names its side: ${text}`);
    assert.match(
      text,
      new RegExp(`\\b${Math.round(row.value)} out of 100\\b`),
      `${region} shows the mean of that side alone: ${text}`
    );
    if (row.count === 1) assert.match(text, /One reading/, text);
    else assert.match(text, new RegExp(`\\b${row.count} readings\\b`), `${region} counts them: ${text}`);
    assert.doesNotMatch(text, /\d+\.\d/, `no fractional intensity: ${text}`);
    if (row.mixed) assert.match(text, /other way/, `${region} went both ways: ${text}`);
    else assert.doesNotMatch(text, /other way/, `${region} went one way only: ${text}`);
  }

  // 1. The figure and the words name the same region, from the first paint.
  const firstPressed = await pressedRegion();
  assert.ok(firstPressed, 'a region is selected on arrival');
  const firstLabel = await page
    .locator(`[data-region="${firstPressed}"]`)
    .first()
    .getAttribute('aria-label');
  assert.ok(
    firstLabel.toLowerCase().startsWith((await name()).toLowerCase()),
    `the name beside the figure (${await name()}) is the pressed region's (${firstLabel})`
  );
  pass('the figure and the words open on the same region');

  // 2. A recorded region, on the figure: its side, its level, its count.
  await select(scene.mixed);
  await assertSaysTheReading(scene.mixed);
  pass('a region that went both ways names its side, its level and its count');

  // 3. One side only, several readings - the mixed sentence stays away.
  await selectPill(scene.plain);
  assert.equal(await name(), 'left elbow and forearm');
  await assertSaysTheReading(scene.plain);
  pass('a one-sided region is not told it went both ways');

  // 4. A single reading is a reading, not an average of one.
  await selectPill(scene.single);
  const singleSummary = await summary();
  assert.match(singleSummary, /One reading/, singleSummary);
  assert.match(singleSummary, /dysphoria 80 out of 100/, singleSummary);
  pass('a single reading is named as one');

  // 5. A region the range never mentions: no number, no zero, no side.
  await page.locator('.region-pill').last().click();
  await page.waitForTimeout(200);
  const emptySummary = await summary();
  assert.equal(await name(), 'the back of my neck, logged about never');
  assert.match(emptySummary, /Nothing logged/, emptySummary);
  assert.doesNotMatch(emptySummary, /\d/, `an unrecorded region is given no value: ${emptySummary}`);
  pass('an unrecorded region is honestly empty, and a long name still fits');

  /* 6. And the same from the keyboard: a region is chosen with Enter on its
        own button, and the words follow that rather than following a tap. */
  await page.locator(`.region-pill[data-region="${scene.plain}"]`).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (r) => document.querySelector(`[data-region="${r}"][aria-pressed="true"]`) !== null,
    scene.plain
  );
  await page.waitForTimeout(200);
  assert.equal(await name(), 'left elbow and forearm', 'a keyboard pick names its region');
  await page.locator('[data-body-map-figure] [data-region="chest"]').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => document.querySelector('[data-region="chest"][aria-pressed="true"]') !== null
  );
  await page.waitForTimeout(200);
  assert.equal((await name()).toLowerCase(), 'chest', 'and so does a keyboard pick on the figure');
  pass('the figure and the cluster are both selectable from the keyboard');

  // 7. The jump: a 48px target, reachable by keyboard.
  const jump = page.locator('[data-body-map-chart-jump]');
  const box = await jump.boundingBox();
  assert.ok(box.height >= 48, `the jump is a 48px target (${box.height}px)`);
  pass(`the jump is ${Math.round(box.height)}px tall`);

  // 8. The jump carries the region and the span, and lands on the charts.
  await select(scene.mixed);
  const selected = await name();
  await jump.focus();
  /* After the link is where a finger would find it, not before: focusing it
     scrolls it into view, and the place the jump leaves from is the place
     Back has to come back to. */
  const beforeJump = await scrollTop();
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset.bodyMapChartJump !== undefined),
    true,
    'the jump takes keyboard focus'
  );
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash === '#body-map-charts');
  await page.waitForTimeout(400);

  const chartsBox = await page.evaluate(() => {
    const el = document.getElementById('body-map-charts');
    const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return { top: box.top - frame.top, height: frame.height, text: el.innerText };
  });
  assert.ok(
    chartsBox.top >= 0 && chartsBox.top < chartsBox.height,
    `the charts heading is on screen after the jump (${Math.round(chartsBox.top)}px)`
  );
  assert.ok(
    chartsBox.text.toLowerCase().includes(selected.toLowerCase()),
    `the charts still name the selected region: ${chartsBox.text}`
  );
  assert.equal(await name(), selected, 'the selection survives the jump');
  assert.ok((await scrollTop()) > beforeJump, 'the jump moved the screen down');
  pass('the jump lands on the charts with the region and the span intact');

  // 9. And Back returns to the map, where it was left.
  await page.goBack();
  await page.waitForFunction(() => !location.hash);
  await page.waitForTimeout(400);
  const afterBack = await scrollTop();
  assert.ok(
    Math.abs(afterBack - beforeJump) <= 8,
    `Back returns to the map (${afterBack}px against ${beforeJump}px)`
  );
  assert.equal(await name(), selected, 'and the selection is still the same');
  pass('Back returns to the map context');

  /* 10. 320px, Polish, and the long custom name: the words still fit on the
         card beside the link, and the link keeps its target. Polish counts
         readings in three forms, so the sentence is read back rather than
         only measured. */
  await page.setViewportSize({ width: 320, height: 690 });
  await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
  await page.locator('[data-segment="pl"]').click();
  await page.waitForTimeout(300);
  await settlePage(page, base, '/body-map', 'light');
  await page.waitForSelector('[data-body-map-summary]');
  await selectPill(scene.plain);
  const polish = await summary();
  assert.match(polish, /Odczyty: 3/, `Polish counts in its own form: ${polish}`);
  await page.locator('.region-pill').last().click();
  await page.waitForTimeout(200);
  const narrow = await page.evaluate(() => {
    const card = document.querySelector('[data-body-map-figure]').getBoundingClientRect();
    const words = document.querySelector('[data-body-map-context]').getBoundingClientRect();
    const link = document.querySelector('[data-body-map-chart-jump]').getBoundingClientRect();
    return {
      inside: words.left >= card.left - 1 && words.right <= card.right + 1,
      linkInside: link.right <= card.right + 1,
      linkHeight: link.height,
      text: document.querySelector('[data-body-map-summary]').innerText
    };
  });
  assert.ok(narrow.inside && narrow.linkInside, 'the words stay on the card at 320px');
  assert.ok(narrow.linkHeight >= 48, `the jump keeps its target at 320px (${narrow.linkHeight}px)`);
  assert.match(narrow.text, /Nic tu nie zapisano/, narrow.text);
  pass('at 320px in Polish, a long name and its sentence stay on the card');

  assert.deepEqual(errors, [], `no page errors: ${errors.join(', ')}`);

  if (gallery) {
    // Back to the phone and to English: the checks above leave the page at
    // 320px in Polish, and the sign-off renders are neither.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
    await page.locator('[data-segment="en"]').click();
    await page.waitForTimeout(300);
    await settlePage(page, base, '/body-map', 'light');
    await page.waitForSelector('[data-body-map-summary]');

    const scenes = [
      ['recorded', scene.mixed],
      ['one-sided', scene.plain],
      ['unrecorded', null],
      ['single', scene.single]
    ];
    const sheet = [];
    /* Cropped to what this ticket added rather than to the whole screen: the
       words under the figure, with the last row of the elsewhere cluster
       above them for context (Alicja, ticket 07's sign-off). */
    const crop = async () => {
      await page.locator('[data-body-map-context]').scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      const box = await page.evaluate(() => {
        const el = document.querySelector('[data-body-map-context]');
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      return {
        x: Math.max(0, box.x - 12),
        y: Math.max(0, box.y - 64),
        width: box.width + 24,
        height: box.height + 76
      };
    };

    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      for (const [name, region] of scenes) {
        const target = region
          ? page.locator(`[data-region="${region}"]`).first()
          : page.locator('.region-pill').last();
        await target.click();
        await page.waitForTimeout(400);
        const file = `shots/${name}-${theme}.png`;
        await page.screenshot({ path: `${outDir}/${file}`, clip: await crop() });
        sheet.push({ scene: name, theme, file });
      }
    }
    await writeFile(
      `${outDir}/sheet.html`,
      `<!doctype html><meta charset="utf-8"><title>Ticket 30: the selected region beside the map</title>
<style>body{font:15px system-ui;background:#f4f4f5;margin:24px}h2{font-size:17px}
.row{display:flex;gap:16px;margin-bottom:24px;align-items:flex-start}
figure{margin:0}img{width:360px;border:1px solid #d4d4d8;background:#fff}figcaption{font-size:13px;color:#52525b}</style>
<h1>The selected region, beside the figure</h1>
<p>New: the picked region's name, what the range says about it, and the way down to its charts. Default palette, light and dark.</p>
${['recorded', 'one-sided', 'unrecorded', 'single']
  .map(
    (scene) =>
      `<h2>${scene}</h2><div class="row">${sheet
        .filter((s) => s.scene === scene)
        .map((s) => `<figure><img src="${s.file}" alt=""><figcaption>${s.theme}</figcaption></figure>`)
        .join('')}</div>`
  )
  .join('\n')}
`,
      'utf8'
    );
    console.log(`shots and sheet.html in ${outDir}`);
  }
} finally {
  await browser.close();
  await server.close();
}
