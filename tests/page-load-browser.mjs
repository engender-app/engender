import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const previewServer = await preview({ preview: { host: '127.0.0.1', port: 0 } });
const local = `http://127.0.0.1:${previewServer.httpServer.address().port}`;
const production = 'https://app.engender.barankiewicz.dev';
const browser = await launchChromium();
const context = await browser.newContext({ serviceWorkers: 'block' });
const counts = [];
await context.addCookies([{ name: 'private', value: 'must-not-send', url: production }]);
await context.route(`${production}/**`, async route => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname.startsWith('/_stats/')) {
    counts.push({ url: request.url(), method: request.method(), body: request.postData(), headers: request.headers() });
    await route.fulfill({ status: 204 });
  } else {
    const response = await route.fetch({ url: `${local}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  }
});
try {
  const page = await context.newPage();
  await page.goto(`${production}/search?q=synthetic-private-query`);
  for (let n = 0; counts.length < 1 && n < 200; n++) await delay(50);
  assert.equal(counts.length, 1);
  assert.equal(counts[0].url, `${production}/_stats/app`);
  assert.equal(counts[0].method, 'POST');
  assert.equal(counts[0].body, null);
  assert.equal(counts[0].headers.cookie, undefined);
  assert.equal(counts[0].headers.referer, undefined);
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/settings';
    document.body.append(link);
    link.click();
  });
  await delay(500);
  assert.equal(counts.length, 1, 'internal navigation must not count');
  await page.reload();
  for (let n = 0; counts.length < 2 && n < 200; n++) await delay(50);
  assert.equal(counts.length, 2, 'document reload must count');
  await context.setOffline(true);
  await page.reload();
  await delay(500);
  assert.equal(counts.length, 2, 'offline document opening must not count');
  await context.setOffline(false);
  await delay(500);
  assert.equal(counts.length, 2, 'returning online must not replay the missed count');
  console.log('App page counts: one per online document; no query/cookies/referrer; navigation/offline/reconnect do not count.');
} finally {
  await browser.close();
  await new Promise(resolve => previewServer.httpServer.close(resolve));
}
