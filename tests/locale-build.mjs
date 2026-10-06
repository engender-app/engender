import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';
import { serveBuild } from './serve-build.mjs';

const { graph } = JSON.parse(readFileSync('.svelte-kit/locale-graphs.json', 'utf8'));
for (const locale of ['en', 'pl']) {
  const catalogue = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
  const inactive = JSON.parse(readFileSync(`messages/${locale === 'en' ? 'pl' : 'en'}.json`, 'utf8'));
  const startup = graph[locale].filter((path) => path.endsWith('.js')).map((path) => readFileSync(`build${path}`, 'utf8')).join('\n');
  for (const key of ['pp_unlock_body', 'pp_wrong', 'affirmation_1']) {
    assert.ok(startup.includes(catalogue[key]), `${locale} startup must contain active ${key}`);
    assert.ok(!startup.includes(inactive[key]), `${locale} startup must prune inactive ${key}`);
  }
}
const server = await serveBuild('.');
const origin = `http://localhost:${server.httpServer.address().port}`;
const browser = await launchChromium();
const passphrase = 'locale build verification';
let checks = 0;
const passed = (message) => { checks++; console.log(`PASS ${message}`); };
const unlock = async (page) => {
  await page.fill('#journal-passphrase', passphrase);
  await page.click('[data-passphrase-submit]');
};

try {
  for (const [saved, browserLocale, expected] of [['en', 'pl-PL', 'en'], ['PL', 'en-US', 'pl'], [null, 'pl-PL', 'pl'], ['invalid', 'fr-FR', 'en']]) {
    const context = await browser.newContext({ locale: browserLocale, serviceWorkers: 'block' });
    await context.addInitScript((value) => { if (value !== null) localStorage.setItem('PARAGLIDE_LOCALE', value); }, saved);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const requests = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    await page.goto(origin);
    await page.waitForSelector('[data-next]');
    assert.equal(await page.getAttribute('html', 'lang'), expected);
    assert.equal(await page.evaluate(() => localStorage.getItem('PARAGLIDE_LOCALE')), expected);
    const inactive = graph[expected === 'en' ? 'pl' : 'en'].filter((path) => !graph[expected].includes(path));
    assert.deepEqual(requests.filter((path) => inactive.includes(path)), []);
    assert.deepEqual(errors, []);
    passed(`preference ${saved}/${browserLocale} selects only ${expected} startup graph`);
    await context.close();
  }
  // Forty-odd guards and the walkthrough boot the app through vite preview.
  const vitePreview = await preview({ preview: { port: 0 } });
  try {
    for (const saved of ['en', 'pl']) {
      const context = await browser.newContext({ locale: 'en-US', serviceWorkers: 'block' });
      await context.addInitScript((value) => localStorage.setItem('PARAGLIDE_LOCALE', value), saved);
      const page = await context.newPage();
      await page.goto(vitePreview.resolvedUrls.local[0]);
      await page.waitForSelector('[data-next]');
      assert.equal(await page.getAttribute('html', 'lang'), saved);
      passed(`vite preview serves the joined shell and selects ${saved}`);
      await context.close();
    }
  } finally {
    await vitePreview.close();
  }
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.waitForSelector('[data-next]');
  for (let step = 0; step < 12 && !(await page.locator('[data-access-modes]').count()); step++) await page.locator('[data-next]').click();
  await page.locator('[data-list-row="passphrase"]').click();
  await page.click('[data-access-continue]');
  await page.fill('#am-passphrase', passphrase);
  await page.fill('#am-passphrase-confirm', passphrase);
  await page.click('[data-access-submit]');
  await page.waitForSelector('.app[data-boot="ready"]');
  await page.waitForSelector('[data-next]');
  for (let step = 0; step < 12 && (await page.locator('[data-next]').count()); step++) await page.locator('[data-next]').click();
  await page.locator('[data-finish]').click();
  await page.waitForSelector('[data-home-hello]');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/service-worker.js');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForSelector('#journal-passphrase');
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith('engender-shell-'));
    const paths = await (await caches.open(names[0])).keys();
    return paths.map((request) => new URL(request.url).pathname);
  });
  for (const locale of ['en', 'pl']) assert.ok(graph[locale].every((path) => cached.includes(path)));
  passed('installed worker caches both complete startup graphs');
  for (const offline of [false, true]) {
    await context.setOffline(offline);
    for (const locale of ['pl', 'en']) {
      await page.goto(`${origin}/settings`);
      await page.waitForSelector('#journal-passphrase');
      await unlock(page);
      await page.waitForSelector('[data-list-row="language"]');
      await page.click('[data-list-row="language"]');
      await Promise.all([page.waitForNavigation(), page.click(`[data-sheet] [data-segment="${locale}"]`)]);
      await page.waitForSelector('#journal-passphrase');
      assert.equal(await page.getAttribute('html', 'lang'), locale);
      const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
      const text = await page.locator('body').innerText();
      assert.ok(text.includes(messages.pp_unlock_body), 'lock gate must show selected locale copy');
      await unlock(page);
      await page.waitForSelector('[data-list-row="language"]');
      passed(`${offline ? 'offline' : 'online'} reload switches to ${locale}; lock and unlock work`);
      await page.goto(`${origin}/settings/export`);
      await page.waitForSelector('#journal-passphrase');
      await unlock(page);
      await page.waitForSelector('[data-daylio]');
      await page.click('[data-daylio]');
      const chooser = page.waitForEvent('filechooser');
      await page.click('[data-pick-daylio]');
      const other = JSON.parse(readFileSync(`messages/${locale === 'en' ? 'pl' : 'en'}.json`, 'utf8'));
      const csv = `full_date,date,weekday,time,mood,activities,note_title,note\n2026-01-15,January 15,Thursday,09:00,Rad,${other.tag_a_exercise},,locale proof`;
      await (await chooser).setFiles({ name: 'opposite-language.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await page.waitForSelector('[data-confirm-daylio]');
      const expected = messages.daylio_tag_counts.replace('{matched}', '1').replace('{new}', '0');
      assert.ok((await page.locator('[data-sheet]').innerText()).includes(expected));
      passed(`${offline ? 'offline' : 'online'} ${locale} import matches opposite-language built-in tag`);
    }
  }
  assert.deepEqual(errors, []);
  passed('locale switching produces no page errors or CSP execution failure');
  await context.close();
  console.log(`${checks} locale build checks passed`);
} finally {
  await browser.close();
  server.httpServer.close();
}
