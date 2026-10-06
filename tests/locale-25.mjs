import { createServer } from 'vite';
import { resolve, extname } from 'node:path';
import { launchChromium, createReporter } from './browser-harness.mjs';
import { readyAttr, resultGlobal } from './probe-handshake.mjs';

const { ok, fail, block, finish } = createReporter();
const server = await createServer({ configFile: resolve('tests/browser-tier/browser-tier.vite.config.ts'), server: { port: 0 } });
await server.listen();
const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let rejectPageError;
  const pageError = new Promise((_, reject) => { rejectPageError = reject; });
  page.on('pageerror', rejectPageError);
  page.on('console', (message) => console.log(message.type(), message.text()));
  page.on('requestfailed', (request) => console.log('request failed', request.url(), request.failure()?.errorText));
  page.on('response', (response) => { if (response.status() >= 400) console.log('HTTP', response.status(), response.url()); });
  await Promise.race([
    (async () => {
      await page.goto(`http://localhost:${server.config.server.port}/locale-25.html`);
      await page.waitForSelector(`body[${readyAttr('locale-25')}]`, { state: 'attached', timeout: 60000 });
    })(), pageError
  ]);
  const results = await page.evaluate((name) => window[name], resultGlobal('locale-25'));
  if (results?.error) throw new Error(results.error);
  await block('locale and photo regressions', 9, () => {
    for (const result of results) result.passed ? ok(result.name) : fail(result.name, result.error);
  });
  if (process.env.LOCALE_25_SCREENSHOT) {
    const path = process.env.LOCALE_25_SCREENSHOT;
    for (const [name, route] of [['calendar', '/calendar'], ['stats', '/stats'], ['home', '/'], ['settings', '/settings']]) {
      await page.evaluate((route) => window.__locale25Render(route), route);
      if (route === '/calendar') await page.getByRole('button', { name: 'Pokaż miesiąc' }).click();
      if (route === '/settings') await page.getByText('kolor według:', { exact: false }).scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.replace(extname(path), `-${name}${extname(path)}`), fullPage: true });
    }
  }
} finally {
  await browser.close();
  await server.close();
}
process.exitCode = finish('9 checks passed');
