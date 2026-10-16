import { createServer } from 'node:http';
import { launchBrowser, browserEngine } from '../browser-harness.mjs';

// Measure this runtime, rather than assuming an engine cannot restore history.
export async function measureBFCache() {
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html', 'Permissions-Policy': 'unload=(self)' });
    response.end(`<!doctype html><title>History control</title><script>
      window.token=crypto.randomUUID();window.events=[];
      addEventListener('pageshow',event=>events.push(['pageshow',event.persisted]));
      addEventListener('pagehide',event=>events.push(['pagehide',event.persisted]));
      ${request.url === '/blocked' ? "addEventListener('unload',()=>{});" : ''}
    </script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await launchBrowser(browserEngine() === 'chromium' ? { ignoreDefaultArgs: ['--disable-back-forward-cache'] } : {});
    const page = await browser.newPage();
    const controls = [];
    for (const path of ['/plain', '/blocked']) {
      await page.goto(`http://localhost:${server.address().port}${path}`);
      const token = await page.evaluate(() => window.token);
      await page.goto(`http://127.0.0.1:${server.address().port}/away`);
      await page.goBack({ waitUntil: 'commit' });
      await page.waitForFunction(() => window.events.some(([type]) => type === 'pageshow'));
      const observed = await page.evaluate(() => ({ token: window.token, events: window.events }));
      controls.push({ path, restored: token === observed.token && observed.events.some(([type, persisted]) => type === 'pageshow' && persisted), ...observed });
    }
    return { version: browser.version(), controls, supported: controls[0].restored, blockingControlRejected: !controls[1].restored };
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
