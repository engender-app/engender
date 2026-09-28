import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const APP_URL = 'https://app.gender-diary.barankiewicz.dev/';
const APP_ORIGIN = new URL(APP_URL).origin;
const lanAddress = process.argv[2];
if (!lanAddress || !/^\d{1,3}(\.\d{1,3}){3}$/.test(lanAddress)) {
  throw new Error('Usage: node probe-local-http.mjs <PC LAN IPv4 address>');
}

let requests = 0;
const server = createServer((request, response) => {
  requests += 1;
  response.setHeader('Access-Control-Allow-Origin', APP_ORIGIN);
  response.setHeader('Access-Control-Allow-Private-Network', 'true');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
  } else if (request.method === 'GET' && request.url === '/ping') {
    response.writeHead(200, { 'Content-Type': 'text/plain' }).end('local-only probe');
  } else {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));

const target = `http://${lanAddress}:${server.address().port}/ping`;
let browser;

async function trial(allowLocalHttp) {
  const context = await browser.newContext();
  if (allowLocalHttp) {
    await context.grantPermissions(['local-network-access'], { origin: APP_ORIGIN });
  }
  const page = await context.newPage();
  const diagnostics = [];
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(message.text());
  });
  page.on('requestfailed', (request) => {
    if (request.url() === target) diagnostics.push(request.failure()?.errorText);
  });
  if (allowLocalHttp) {
    await page.route(APP_URL, async (route) => {
      const upstream = await route.fetch();
      const headers = { ...upstream.headers() };
      headers['content-security-policy'] = headers['content-security-policy']
        .replace("connect-src 'self'", `connect-src 'self' http://${lanAddress}:${server.address().port}`);
      await route.fulfill({ response: upstream, headers });
    });
  }
  try {
    const response = await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    const before = requests;
    const result = await page.evaluate(async (url) => {
      try {
        const response = await fetch(url);
        return { status: response.status, body: await response.text() };
      } catch (error) {
        return { error: String(error) };
      }
    }, target);
    return {
      appStatus: response.status(),
      headerCsp: response.headers()['content-security-policy'],
      localRequests: requests - before,
      diagnostics,
      result
    };
  } finally {
    await context.close();
  }
}

try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium-browser',
    args: ['--no-sandbox']
  });
  const deployedPolicy = await trial(false);
  const controlledPolicy = await trial(true);
  console.log(JSON.stringify({
    target,
    browser: browser.version(),
    deployedPolicy,
    controlledPolicy
  }, null, 2));
  assert.equal(deployedPolicy.appStatus, 200);
  assert.equal(deployedPolicy.localRequests, 0);
  assert.ok(deployedPolicy.diagnostics.some((line) => line.includes('connect-src')));
  assert.equal(controlledPolicy.appStatus, 200);
  assert.equal(controlledPolicy.localRequests, 1);
  assert.deepEqual(controlledPolicy.result, { status: 200, body: 'local-only probe' });
} finally {
  await browser?.close();
  server.close();
}
